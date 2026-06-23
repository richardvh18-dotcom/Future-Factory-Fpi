import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, collectionGroup, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS, getPathString } from '../../config/dbPaths';
import { transitionPrintQueueJobStatus } from '../../services/planningSecurityService';
import { printRawUsbToDevice, isUsbDirectSupported } from '../../utils/usbPrintService';

type AnyRecord = Record<string, unknown>;

type PrinterConfig = {
  id: string;
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

const USB_PRINTER_VENDOR_KEY = 'usb_printer_vendor';
const USB_PRINTER_PRODUCT_KEY = 'usb_printer_product';
const USB_PRINTER_ID_KEY = 'usb_printer_id';
const PRINT_STATION_SELECTED_KEY = 'print_station_selected_station';
const PRINT_STATION_BINDINGS_KEY = 'print_station_printer_bindings_v1';

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

const normalizeStationKey = (value: unknown): string =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^40(?=BH|BM|BA)/, '');
const normalizeStationBindingKey = (value: unknown): string => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const readStationBindings = (): Record<string, string> => {
  try {
    const raw = String(localStorage.getItem(PRINT_STATION_BINDINGS_KEY) || '').trim();
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed || {})
        .map(([key, value]) => [normalizeStationBindingKey(key), String(value || '').trim()])
        .filter(([key, value]) => Boolean(key) && Boolean(value))
    );
  } catch {
    return {};
  }
};

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
    metadata.targetStation,
    metadata.targetStationId,
    metadata.machineId,
    metadata.machine,
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

const normalizeQueuePrintPayload = (content: unknown, quantity: unknown, isPreBatchedJob: boolean = false) => {
  const base = String(content || '').trim();
  if (!base) return '';
  if (isPreBatchedJob) return base;

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

const isLikelyPreBatchedZpl = (content: unknown): boolean => {
  const raw = String(content || '');
  if (!raw) return false;
  const xaCount = (raw.match(/\^XA/g) || []).length;
  const xzCount = (raw.match(/\^XZ/g) || []).length;
  return xaCount > 1 || xzCount > 1;
};

const replaceLastLiteral = (source: string, searchValue: string, replaceValue: string): string => {
  const idx = source.lastIndexOf(searchValue);
  if (idx < 0) return source;
  return `${source.slice(0, idx)}${replaceValue}${source.slice(idx + searchValue.length)}`;
};

const enforceCutModeOnBatchPayload = (payload: unknown, shouldCutAtEnd: boolean, isPreBatchedJob: boolean = false): string => {
  const normalized = String(payload || '').trim();
  if (!normalized) return '';
  if (isPreBatchedJob) return normalized;

  let transformed = normalized
    .replace(/\^MM[CT]/g, '^MMT')
    .replace(/\^PQ1,0,1,[YN]/g, '^PQ1,0,1,N');

  if (!shouldCutAtEnd) {
    return transformed;
  }

  transformed = replaceLastLiteral(transformed, '^MMT', '^MMC');
  transformed = replaceLastLiteral(transformed, '^PQ1,0,1,N', '^PQ1,0,1,Y');
  return transformed;
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
  const selectedStation = String(localStorage.getItem(PRINT_STATION_SELECTED_KEY) || '').trim();
  const stationKey = normalizeStationBindingKey(selectedStation);
  if (stationKey) {
    const stationBindings = readStationBindings();
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    if (boundPrinterId) {
      const boundPrinter = printers.find((printer) => printer.id === boundPrinterId);
      if (boundPrinter?.id) return boundPrinter.id;
    }
  }

  const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();
  if (savedPrinterId) {
    const savedPrinter = printers.find((printer) => printer.id === savedPrinterId);
    if (savedPrinter?.id) return savedPrinter.id;
  }

  if (!usbDevice) return null;

  const matches = printers.filter(
    (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
  );

  if (matches.length === 1) {
    return matches[0].id || null;
  }

  return null;
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

    const matchesSavedUsbDevice = (
      device: USBDevice,
      savedVendor?: string | null,
      savedProduct?: string | null,
      savedPrinterId?: string
    ): boolean => {
      if (savedVendor && savedProduct) {
        return (
          device.vendorId === parseInt(savedVendor, 10) &&
          device.productId === parseInt(savedProduct, 10)
        );
      }

      if (savedPrinterId) {
        const savedPrinter = printers.find((printer) => printer.id === savedPrinterId);
        if (savedPrinter?.vendorId !== undefined && savedPrinter?.productId !== undefined) {
          return (
            Number(savedPrinter.vendorId) === device.vendorId &&
            Number(savedPrinter.productId) === device.productId
          );
        }
      }

      return false;
    };

    const restoreUsbConnection = async () => {
      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();

      try {
        const devices = await navigator.usb.getDevices();
        if (cancelled) return;

        const match = devices.find((device) =>
          matchesSavedUsbDevice(device, savedVendor, savedProduct, savedPrinterId)
        );

        if (match) {
          setUsbDevice(match);
          return;
        }

        if (!savedVendor && !savedProduct && !savedPrinterId && devices.length === 1) {
          setUsbDevice(devices[0]);
          return;
        }
      } catch (error) {
        console.warn('[PrintQueueAutoProcessor] USB herstel mislukt:', error);
      }
    };

    const handleUsbConnect = (event: USBConnectionEvent | Event) => {
      const device = (event as USBConnectionEvent).device || (event as any).device;
      if (!device) return;

      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();

      if (matchesSavedUsbDevice(device, savedVendor, savedProduct, savedPrinterId)) {
        setUsbDevice(device);
      }
    };

    const handleUsbDisconnect = (event: USBConnectionEvent | Event) => {
      const device = (event as USBConnectionEvent).device || (event as any).device;
      if (!device || !usbDevice) return;
      if (
        device.vendorId === usbDevice.vendorId &&
        device.productId === usbDevice.productId &&
        String(device.serialNumber || '').trim() === String(usbDevice.serialNumber || '').trim()
      ) {
        setUsbDevice(null);
      }
    };

    void restoreUsbConnection();
    navigator.usb.addEventListener('connect', handleUsbConnect as EventListener);
    navigator.usb.addEventListener('disconnect', handleUsbDisconnect as EventListener);

    return () => {
      cancelled = true;
      navigator.usb.removeEventListener('connect', handleUsbConnect as EventListener);
      navigator.usb.removeEventListener('disconnect', handleUsbDisconnect as EventListener);
    };
  }, [enabled, printers]);

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

  useEffect(() => {
    if (!currentPrinterId) return;
    localStorage.setItem(USB_PRINTER_ID_KEY, currentPrinterId);
  }, [currentPrinterId]);

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
            // Skip jobs that belong to another station/printer routing target.
            console.warn(`[PrintQueueAutoProcessor] ${routingViolation} jobId=${job.id}`);
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

            const isPreBatchedJob = Boolean(job?.metadata?.queuedAsBatch) || isLikelyPreBatchedZpl(content);
            const batchSeqIndex = Number(job?.metadata?.batchSequenceIndex);
            const batchSeqTotal = Number(job?.metadata?.batchSequenceTotal);
            const hasBatchSequence = Number.isFinite(batchSeqIndex) && Number.isFinite(batchSeqTotal) && batchSeqTotal > 0;
            const shouldCutAtEnd = hasBatchSequence ? batchSeqIndex === batchSeqTotal : true;
            const basePayload = normalizeQueuePrintPayload(content, getJobQuantity(job), isPreBatchedJob);
            const payload = enforceCutModeOnBatchPayload(basePayload, shouldCutAtEnd, isPreBatchedJob);
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
