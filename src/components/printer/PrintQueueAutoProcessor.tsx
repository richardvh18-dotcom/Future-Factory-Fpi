import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, collectionGroup, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS, getPathString } from '../../config/dbPaths';
import { transitionPrintQueueJobStatus } from '../../services/planningSecurityService';
import { printRawUsbToDevice, isUsbDirectSupported } from '../../utils/usbPrintService';

type AnyRecord = Record<string, unknown>;

type PrinterConfig = {
  id: string;
  isDefault?: boolean;
  vendorId?: number | string;
  productId?: number | string;
  name?: string;
  queueStations?: unknown[];
  linkedStations?: unknown[];
};

type PrintJob = AnyRecord & {
  id: string;
  status?: string;
  printerId?: string;
  printData?: string;
  zpl?: string;
  quantity?: number;
  createdAt?: { toDate?: () => Date } | Date;
  metadata?: AnyRecord;
  description?: string;
};

type Props = {
  enabled?: boolean;
};

const isInvalidPrintQueueTransitionError = (error: unknown): boolean => {
  const message = String(
    (error as { message?: unknown })?.message
      || (error as { details?: unknown })?.details
      || error
      || ''
  ).toLowerCase();
  return message.includes('ongeldige print queue statusovergang') || message.includes('invalid_print_queue_transition');
};

const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return '';
  if (typeof stationValue === 'string') return stationValue.trim();
  if (typeof stationValue === 'object') {
    const stationObj = stationValue as AnyRecord;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ''
    ).trim();
  }
  return String(stationValue).trim();
};

const normalizeStationKey = (value: unknown): string => String(value || '').trim().toUpperCase();

const getPrinterAllowedStationKeys = (printer: PrinterConfig | null | undefined): string[] => {
  if (!printer) return [];
  const stations = Array.isArray(printer.queueStations)
    ? printer.queueStations
    : (printer.linkedStations || []);

  return Array.from(new Set(
    stations
      .map(stationNameFromValue)
      .map((station) => normalizeStationKey(station))
      .filter(Boolean)
  ));
};

const getJobStationKeys = (job: PrintJob): string[] => {
  const metadata = (job?.metadata || {}) as AnyRecord;
  const candidates = [
    metadata.stationId,
    metadata.station,
    metadata.currentStation,
    metadata.machine,
    metadata.targetPrinterName,
    job.stationId,
    job.currentStation,
    job.machine,
  ];

  return Array.from(new Set(
    candidates
      .map((value) => normalizeStationKey(stationNameFromValue(value)))
      .filter(Boolean)
  ));
};

const getPrinterRoutingViolation = (job: PrintJob, printer: PrinterConfig | null | undefined): string | null => {
  const allowedStationKeys = getPrinterAllowedStationKeys(printer);
  if (allowedStationKeys.length === 0) return null;

  const jobStationKeys = getJobStationKeys(job);
  if (jobStationKeys.length === 0) return null;

  const matches = jobStationKeys.some((key) => allowedStationKeys.includes(key));
  if (matches) return null;

  const printerName = String(printer?.name || printer?.id || 'onbekend');
  return `Station-routering mismatch: job-station (${jobStationKeys.join(', ')}) valt niet onder printer ${printerName} (${allowedStationKeys.join(', ')}).`;
};

const tsToMillis = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};

const normalizeQueuePrintPayload = (content: unknown, quantity: unknown) => {
  const base = String(content || '').trim();
  if (!base) return '';
  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Math.max(1, Math.floor(Number(quantity)))
    : 1;

  const applyCutMode = (zpl: string, shouldCut: boolean): string => {
    const cutMedia = shouldCut ? '^MMC' : '^MMT';
    const cutPQ = shouldCut ? '^PQ1,0,1,Y' : '^PQ1,0,1,N';
    return String(zpl || '')
      .replace(/\^MM[CT]/g, cutMedia)
      .replace(/\^PQ1,0,1,[YN]/g, cutPQ);
  };

  if (qty === 1) {
    return applyCutMode(base, true);
  }

  return Array.from({ length: qty }, (_, idx) => applyCutMode(base, idx === qty - 1)).join('\n');
};

const getJobQuantity = (job: PrintJob): number => {
  const quantity = Number(job?.metadata?.quantity ?? job?.quantity);
  if (Number.isFinite(quantity) && quantity > 0) return Math.floor(quantity);

  const description = String(job?.metadata?.description || job?.description || '');
  const match = description.match(/\(x(\d+)\)/i);
  return match ? Math.max(1, Number(match[1])) : 1;
};

const normalizeJob = (docSnap: { id: string; data: () => unknown }): PrintJob | null => {
  const data = (docSnap.data() || {}) as AnyRecord;
  const metadata = (data.metadata || {}) as AnyRecord;
  const isQueueJob = Boolean(data.printerId || data.zpl || data.status || metadata.description);
  if (!isQueueJob) return null;
  return { id: docSnap.id, ...data } as PrintJob;
};

const getCurrentPrinterId = (printers: PrinterConfig[], usbDevice: USBDevice | null): string | null => {
  if (usbDevice) {
    const match = printers.find(
      (p) => Number(p.vendorId) === usbDevice.vendorId && Number(p.productId) === usbDevice.productId
    );
    if (match?.id) return match.id;
  }

  const fallback = printers.find((p) => p.isDefault) || printers[0];
  return fallback?.id || null;
};

const PrintQueueAutoProcessor = ({ enabled = true }: Props) => {
  const [usbDevice, setUsbDevice] = useState<USBDevice | null>(null);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isUsbDirectSupported() || typeof navigator === 'undefined') {
      setUsbDevice(null);
      return;
    }

    let cancelled = false;

    const restoreUsbConnection = async () => {
      const savedVendor = localStorage.getItem('usb_printer_vendor');
      const savedProduct = localStorage.getItem('usb_printer_product');
      if (!savedVendor || !savedProduct) return;

      try {
        const devices = await navigator.usb.getDevices();
        const match = devices.find(
          (d) => d.vendorId === parseInt(savedVendor, 10) && d.productId === parseInt(savedProduct, 10)
        );
        if (!cancelled && match) setUsbDevice(match);
      } catch (error) {
        console.warn('[PrintQueueAutoProcessor] USB herstel mislukt:', error);
      }
    };

    void restoreUsbConnection();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPrinters([]);
      return () => {};
    }

    return onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snapshot) => {
      const mapped = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as AnyRecord),
      })) as PrinterConfig[];
      setPrinters(mapped);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPrintJobs([]);
      return () => {};
    }

    let rootJobs: PrintJob[] = [];
    let scopedJobs: PrintJob[] = [];

    const printQueuePathFragment = `/${PATHS.PRINT_QUEUE.join('/')}/`;

    const mergeJobs = () => {
      const byId = new Map<string, PrintJob>();
      rootJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      scopedJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });

      const merged = Array.from(byId.values()).sort(
        (a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt)
      );
      setPrintJobs(merged);
    };

    const rootQ = query(collection(db, getPathString(PATHS.PRINT_QUEUE)), orderBy('createdAt', 'desc'));
    const unsubscribeRoot = onSnapshot(
      rootQ,
      (snapshot) => {
        rootJobs = snapshot.docs.map((docSnap) => normalizeJob(docSnap)).filter((job): job is PrintJob => Boolean(job));
        mergeJobs();
      },
      (error) => {
        console.error('[PrintQueueAutoProcessor] Root queue leesfout:', error);
        rootJobs = [];
        mergeJobs();
      }
    );

    const scopedQ = collectionGroup(db, 'items');
    const unsubscribeScoped = onSnapshot(
      scopedQ,
      (snapshot) => {
        scopedJobs = snapshot.docs
          .filter((docSnap) => String(docSnap.ref?.path || '').includes(printQueuePathFragment))
          .map((docSnap) => normalizeJob(docSnap))
          .filter((job): job is PrintJob => Boolean(job) && String((job as PrintJob)._scopeType || 'print_queue').trim() === 'print_queue');
        mergeJobs();
      },
      (error) => {
        console.error('[PrintQueueAutoProcessor] Scoped queue leesfout:', error);
        scopedJobs = [];
        mergeJobs();
      }
    );

    return () => {
      unsubscribeRoot();
      unsubscribeScoped();
    };
  }, [enabled]);

  const currentPrinterId = useMemo(
    () => getCurrentPrinterId(printers, usbDevice),
    [printers, usbDevice]
  );

  const currentPrinter = useMemo(
    () => printers.find((printer) => printer.id === currentPrinterId) || null,
    [printers, currentPrinterId]
  );

  useEffect(() => {
    if (!enabled || !usbDevice || !currentPrinterId || isProcessingRef.current) return;

    const pendingJobs = printJobs.filter((job) => {
      if (job.status !== 'pending') return false;
      return job.printerId === currentPrinterId;
    }).sort((a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt));

    if (pendingJobs.length === 0) return;

    const processQueue = async () => {
      isProcessingRef.current = true;
      try {
        for (const job of pendingJobs) {
          const routingViolation = getPrinterRoutingViolation(job, currentPrinter);
          if (routingViolation) {
            try {
              await transitionPrintQueueJobStatus({
                jobId: job.id,
                status: 'error',
                error: routingViolation,
                source: 'PrintQueueAutoProcessor',
              });
            } catch (transitionError) {
              if (!isInvalidPrintQueueTransitionError(transitionError)) {
                throw transitionError;
              }
            }
            continue;
          }

          try {
            await transitionPrintQueueJobStatus({
              jobId: job.id,
              status: 'printing',
              source: 'PrintQueueAutoProcessor',
            });
          } catch (error) {
            if (isInvalidPrintQueueTransitionError(error)) {
              continue;
            }
            throw error;
          }

          try {
            const content = job.printData || job.zpl;
            if (!content) throw new Error('Geen printdata gevonden in printtaak.');

            const isPreBatchedJob = Boolean(job?.metadata?.queuedAsBatch);
            const batchSeqIndex = Number(job?.metadata?.batchSequenceIndex);
            const batchSeqTotal = Number(job?.metadata?.batchSequenceTotal);
            const hasBatchSequence = Number.isFinite(batchSeqIndex) && Number.isFinite(batchSeqTotal) && batchSeqTotal > 0;
            const shouldCutAtEnd = hasBatchSequence ? batchSeqIndex === batchSeqTotal : true;
            const basePayload = normalizeQueuePrintPayload(content, getJobQuantity(job));
            const payload = isPreBatchedJob
              ? String(basePayload)
              : String(basePayload)
                  .replace(/\^MM[CT]/g, shouldCutAtEnd ? '^MMC' : '^MMT')
                  .replace(/\^PQ1,0,1,[YN]/g, shouldCutAtEnd ? '^PQ1,0,1,Y' : '^PQ1,0,1,N');
            await printRawUsbToDevice({ device: usbDevice, content: payload });

            await transitionPrintQueueJobStatus({
              jobId: job.id,
              status: 'completed',
              source: 'PrintQueueAutoProcessor',
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            try {
              await transitionPrintQueueJobStatus({
                jobId: job.id,
                status: 'error',
                error: message,
                source: 'PrintQueueAutoProcessor',
              });
            } catch (transitionError) {
              if (!isInvalidPrintQueueTransitionError(transitionError)) {
                throw transitionError;
              }
            }
          }
        }
      } finally {
        isProcessingRef.current = false;
      }
    };

    void processQueue();
  }, [enabled, usbDevice, currentPrinterId, currentPrinter, printJobs]);

  return null;
};

export default PrintQueueAutoProcessor;
