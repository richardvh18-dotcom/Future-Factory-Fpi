import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { db } from '../../config/firebase';
import {
  collection, collectionGroup, onSnapshot, orderBy, query, doc,
  where, getDocs, limit, getDoc, documentId
} from 'firebase/firestore';
import { PATHS, getPathString, getArchiveItemsPath } from '../../config/dbPaths';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle,
  Printer, Usb, Play, ArrowLeft, Zap, Search,
  RotateCcw, Eye, X, Tag, Settings2
} from 'lucide-react';
import { generateLotBatchZPL } from '../../utils/zplHelper';
import { resolvePrinterDpi } from '../../utils/printerDrivers';
import { filterTempOrderLabelsByProduct } from '../../utils/labelHelpers';
import { getISOWeekInfo, getStationMachineCode } from '../../utils/lotLogic';
import {
  transitionPrintQueueJobStatus,
  requeuePrintQueueJob,
  deletePrintQueueJob,
  queuePrintJob,
} from '../../services/planningSecurityService';
import { requestUsbDevice, printRawUsbToDevice, isUsbDirectSupported as usbDirectSupported } from '../../utils/usbPrintService';
import AutoScaledLabelPreview from './AutoScaledLabelPreview';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLabelCatalog } from '../../hooks/useLabelCatalog';
import { renderLabelToBitmapZpl } from '../../utils/unifiedLabelRenderEngine';
import { resolvePrinterForRouting } from '../../utils/printRouting';
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
  getOrderLabelDescription,
  getOrderLabelItemCode,
  getOrderLabelOrder,
  resolveLinkedTemplateChain,
} from '../../utils/orderLabelTemplateUtils';

type AnyRecord = Record<string, unknown>;

type LabelTemplate = {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  tags?: string[];
  elements?: unknown[];
  [key: string]: unknown;
};

type PrinterConfig = {
  id: string;
  name?: string;
  vendorId?: number | string;
  productId?: number | string;
  productName?: string;
  dpi?: number | string;
  darkness?: number | string;
  zplTextFont?: string;
  bitmapPrintEnabled?: boolean;
  queueStations?: unknown[];
  linkedStations?: unknown[];
  [key: string]: unknown;
};

type DepartmentGroup = {
  key: string;
  label: string;
  stations: string[];
};

type TempLabelItemProps = {
  item: AnyRecord;
  labelTemplates: LabelTemplate[];
  labelRules: AnyRecord[];
  printerDpi?: number;
  handleTempLegacyPrint: (orderData: AnyRecord, template: any, processedData: any) => Promise<void>;
};

type TempLabelModalProps = {
  onClose: () => void;
  labelTemplates?: LabelTemplate[];
  labelRules?: AnyRecord[];
  printerDpi?: number;
  usbDevice: USBDevice | null;
  setUsbDevice: React.Dispatch<React.SetStateAction<USBDevice | null>>;
  activeQueuePrinter: PrinterConfig | null;
  selectedStation: string | null;
};

type LotPrintModalProps = {
  onClose: () => void;
  departmentGroups: DepartmentGroup[];
  onPrintBatch: (batchData: string, lotCount: number) => Promise<void>;
  printer: PrinterConfig | null;
};

type PrintStationWizardModalProps = {
  onClose: () => void;
  stations: string[];
  printers: PrinterConfig[];
  selectedStation: string;
  stationBindings: Record<string, string>;
  onSave: (station: string, printerId: string) => void;
};

type PrintJob = AnyRecord & {
  id: string;
  status?: string;
  printerId?: string;
  printData?: string;
  zpl?: string;
  labelZPL?: string;
  createdAt?: { toDate?: () => Date } | Date;
  error?: string;
  metadata?: AnyRecord;
  description?: string;
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

const normalizeStationKey = (value: unknown): string => String(value || '').trim().toUpperCase();
const normalizeQueueStatus = (value: unknown): string => String(value || 'pending').trim().toLowerCase();
const isQueuedJobStatus = (value: unknown): boolean => {
  const status = normalizeQueueStatus(value);
  return status === 'pending' || status === 'queued' || status === 'processing' || status === 'printing';
};
const normalizeDepartmentKey = (value: unknown): string =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const getDepartmentKeys = (department: AnyRecord): string[] => {
  const candidates = [department?.id, department?.slug, department?.name];
  return Array.from(new Set(candidates.map((entry) => normalizeDepartmentKey(entry)).filter(Boolean)));
};

const normalizeStationBindingKey = (value: unknown): string =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, '');

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

const writeStationBindings = (nextBindings: Record<string, string>) => {
  localStorage.setItem(PRINT_STATION_BINDINGS_KEY, JSON.stringify(nextBindings || {}));
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
  const refPath = String((job as AnyRecord)?.__refPath || '');
  const pathMatch = refPath.match(/\/machines\/([^/]+)\/items\//i);
  const stationFromPath = pathMatch?.[1] || '';
  const candidates = [
    metadata.stationId,
    metadata.station,
    metadata.currentStation,
    metadata.targetStation,
    metadata.targetStationId,
    metadata.machineId,
    metadata.machine,
    metadata.targetPrinterName,
    job.machineId,
    job.stationId,
    job.currentStation,
    job.machine,
    stationFromPath,
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

const resolveUsbBoundPrinter = (printers: PrinterConfig[], usbDevice: USBDevice | null, stationId?: string): PrinterConfig | null => {
  const stationKey = normalizeStationBindingKey(stationId);
  if (stationKey) {
    const stationBindings = readStationBindings();
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    if (boundPrinterId) {
      const boundPrinter = printers.find((printer) => printer.id === boundPrinterId) || null;
      if (boundPrinter) return boundPrinter;
    }
  }

  const savedPrinterId = String(localStorage.getItem(USB_PRINTER_ID_KEY) || '').trim();
  if (savedPrinterId) {
    const savedPrinter = printers.find((printer) => printer.id === savedPrinterId) || null;
    if (savedPrinter) return savedPrinter;
  }

  if (!usbDevice) return null;

  const matches = printers.filter(
    (printer) => Number(printer.vendorId) === usbDevice.vendorId && Number(printer.productId) === usbDevice.productId
  );

  if (matches.length === 1) return matches[0];
  return null;
};

const PREVIEW_ROLL_WIDTH_MM = 90;

// Local Helper: StatusBadge
const StatusBadge = ({ status }: { status?: string }) => {
  const config = {
    pending: { icon: <Loader2 className="animate-spin text-yellow-500" size={16} />, text: 'Wachtend', color: 'bg-yellow-100 text-yellow-800' },
    printing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Printen', color: 'bg-blue-100 text-blue-800' },
    completed: { icon: <CheckCircle className="text-green-500" size={16} />, text: 'Voltooid', color: 'bg-green-100 text-green-800' },
    error: { icon: <AlertTriangle className="text-red-500" size={16} />, text: 'Fout', color: 'bg-red-100 text-red-800' },
    processing: { icon: <RefreshCw className="animate-spin text-blue-500" size={16} />, text: 'Verwerken', color: 'bg-blue-100 text-blue-800' }
  };
  const key = status && status in config ? (status as keyof typeof config) : 'pending';
  const current = config[key];
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${current.color}`}>
      {current.icon}
      {current.text}
    </span>
  );
};

// Local Helper: WebUSB logic
const isUsbDirectSupported = () => usbDirectSupported();

const printRawUsb = async (device: USBDevice, content: string) => {
  return printRawUsbToDevice({ device, content });
};

const normalizeQueuePrintPayload = (content: unknown, quantity: unknown, isPreBatchedJob: boolean = false) => {
  const base = String(content || "").trim();
  if (!base) return "";
  if (isPreBatchedJob) return base;

  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Math.max(1, Math.floor(Number(quantity)))
    : 1;

  const applyCutMode = (zpl: string, shouldCut: boolean): string => {
    const cutMedia = shouldCut ? "^MMC" : "^MMT";
    const cutPQ = shouldCut ? "^PQ1,0,1,Y" : "^PQ1,0,1,N";
    return String(zpl || "")
      .replace(/\^MM[CT]/g, cutMedia)
      .replace(/\^PQ1,0,1,[YN]/g, cutPQ);
  };

  if (qty === 1) {
    return applyCutMode(base, true);
  }

  return Array.from({ length: qty }, (_, idx) => applyCutMode(base, idx === qty - 1)).join("\n");
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

const enforceCutModeOnBatchPayload = (payload: unknown, shouldCutAtEnd: boolean): string => {
  let normalized = String(payload || '').trim();
  if (!normalized) return '';

  normalized = normalized
    .replace(/\^MM[CT]/g, '^MMT')
    .replace(/\^PQ1,0,1,[YN]/g, '^PQ1,0,1,N');

  if (!shouldCutAtEnd) {
    return normalized;
  }

  normalized = replaceLastLiteral(normalized, '^MMT', '^MMC');
  normalized = replaceLastLiteral(normalized, '^PQ1,0,1,N', '^PQ1,0,1,Y');
  return normalized;
};

const getTimestampMillis = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};

// --- Helper voor Tijdelijke Labels ---
const TempLabelItem = ({ item, labelTemplates, labelRules, printerDpi = 203, handleTempLegacyPrint }: TempLabelItemProps) => {
  const { t } = useTranslation();
  const itemDisplay = getOrderLabelDescription(item) || getOrderLabelItemCode(item);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const topOptions = useMemo(() => {
    return filterTempOrderLabelsByProduct(labelTemplates || [], buildOrderLabelTemplateProduct(item)) as LabelTemplate[];
  }, [item, labelTemplates]);

  useEffect(() => {
    if (topOptions.length > 0) {
      const isValidSelection = topOptions.some((t) => String(t.id) === selectedTemplateId);
      if (!selectedTemplateId || !isValidSelection) {
        setSelectedTemplateId(String(topOptions[0]?.id || ""));
      }
    } else if (selectedTemplateId) {
      setSelectedTemplateId("");
    }
  }, [topOptions, selectedTemplateId]);

  const selectedTemplate = topOptions.find((t) => String(t.id) === selectedTemplateId) || topOptions[0];
  const selectedTemplateChain = useMemo<LabelTemplate[]>(() => {
    if (!selectedTemplate) return [];
    return resolveLinkedTemplateChain(labelTemplates as any[], selectedTemplate.id, { maxDepth: 4 }) as LabelTemplate[];
  }, [labelTemplates, selectedTemplate]);
  const previewTemplates = selectedTemplateChain.length > 0 ? selectedTemplateChain : (selectedTemplate ? [selectedTemplate] : []);

  const previewData = useMemo(() => {
    return buildOrderLabelPreviewData(item, labelRules);
  }, [item, labelRules]);

  return (
    <div className="w-full p-4 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl transition-all">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800 truncate">{getOrderLabelOrder(item)}</p>
          <p className="text-xs font-bold text-slate-500 truncate">{itemDisplay}</p>
          <div className="mt-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("common.template", "Template")}</label>
            {topOptions.length > 0 ? (
              <select
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {topOptions.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>{String(t.name || t.id)}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs italic text-amber-600">{t("printer.noMatchingTemporaryTemplate", "Geen passende tijdelijke template gevonden.")}</p>
            )}
          </div>
          <button
            onClick={() => handleTempLegacyPrint(item, selectedTemplate, previewData)}
            disabled={!selectedTemplate || topOptions.length === 0}
            className="mt-3 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 disabled:opacity-50"
          >
            {t("common.print", "Print")}
          </button>
        </div>
        <div className="w-full lg:w-64 h-56 bg-white border border-slate-200 rounded-xl p-2 overflow-y-auto">
          {previewTemplates.length > 0 ? (
            <div className="space-y-2">
              {previewTemplates.map((template, idx) => (
                <div key={String(template.id || idx)} className="bg-slate-50 border border-slate-200 rounded-lg p-1">
                  {previewTemplates.length > 1 && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 pb-1">
                      {t("printer.labelStep", "Label {{index}}", { index: idx + 1 })}
                    </p>
                  )}
                  <AutoScaledLabelPreview label={template as any} data={previewData} maxScale={1} exactBitmapPreview />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">{t("printer.noPreview", "Geen preview")}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Modal: Tijdelijke Labels Zoeken ---
const TempLabelModal = ({ onClose, labelTemplates = [], labelRules = [], printerDpi = 203, usbDevice, setUsbDevice, activeQueuePrinter, selectedStation }: TempLabelModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();

  // Printfunctie nu binnen de modal zodat t altijd beschikbaar is
  const handleTempLegacyPrint = async (orderData: AnyRecord, template: any, processedData: any) => {
    const dpi = printerDpi;
    const darkness = 15; // of printerDarkness als beschikbaar

    const order = getOrderLabelOrder(orderData);
    const item = getOrderLabelItemCode(orderData);
    const desc = getOrderLabelDescription(orderData);

    let zpl;
    const templateChain = template
      ? (resolveLinkedTemplateChain(labelTemplates as any[], template.id, { maxDepth: 4 }) as LabelTemplate[])
      : [];
    const templatesToPrint = templateChain.length > 0 ? templateChain : (template ? [template as LabelTemplate] : []);

    if (template) {
      try {
        const zplChunks: string[] = [];
        for (const currentTemplate of templatesToPrint) {
          const widthMm = Number((currentTemplate as any)?.width || 90);
          const heightMm = Number((currentTemplate as any)?.height || 40);
          const rendered = await renderLabelToBitmapZpl({
            template: currentTemplate as any,
            data: processedData as AnyRecord,
            printerDpi: dpi,
            darkness,
            printSpeed: 3,
            widthMm,
            heightMm,
          });
          zplChunks.push(rendered);
        }
        zpl = zplChunks.join('\n');
      } catch (bitmapErr) {
        throw new Error(`Bitmap print mislukt: ${bitmapErr instanceof Error ? bitmapErr.message : String(bitmapErr)}`);
      }
    } else {
      const fallbackTemplate = {
        width: 90,
        height: 40,
        elements: [
          { type: 'text', x: 5, y: 4, width: 52, height: 8, fontSize: 12, isBold: true, content: 'Order: {orderNumber}' },
          { type: 'text', x: 5, y: 14, width: 52, height: 7, fontSize: 9, isBold: true, content: 'Item: {itemCode}' },
          { type: 'text', x: 5, y: 23, width: 52, height: 10, fontSize: 8, isBold: true, maxLines: 2, content: '{description}' },
          { type: 'qr', x: 60, y: 5, width: 25, height: 25, content: '{orderNumber}' },
        ],
      };
      zpl = await renderLabelToBitmapZpl({
        template: fallbackTemplate as any,
        data: {
          orderNumber: order,
          itemCode: item,
          description: String(desc || '').substring(0, 80),
        },
        printerDpi: dpi,
        darkness,
        printSpeed: 3,
        widthMm: 90,
        heightMm: 40,
      });
    }

    try {
      let deviceToUse = usbDevice;
      if (!deviceToUse && isUsbDirectSupported()) {
        deviceToUse = await requestUsbDevice(activeQueuePrinter || {});
        setUsbDevice(deviceToUse);
      }

      if (deviceToUse) {
        await printRawUsb(deviceToUse, zpl);
        notify(t("common.printLabelDirectUsb", { order }) + ` (${Math.max(1, templatesToPrint.length || 1)}x)`);
        return;
      }

      if (activeQueuePrinter?.id) {
        if (template && templatesToPrint.length > 0) {
          for (let idx = 0; idx < templatesToPrint.length; idx++) {
            const currentTemplate = templatesToPrint[idx];
            const widthMm = Number((currentTemplate as any)?.width || 90);
            const heightMm = Number((currentTemplate as any)?.height || 40);
            const currentZpl = await renderLabelToBitmapZpl({
              template: currentTemplate as any,
              data: processedData as AnyRecord,
              printerDpi: dpi,
              darkness,
              printSpeed: 3,
              widthMm,
              heightMm,
            });

            await queuePrintJob(
              activeQueuePrinter.id,
              currentZpl,
              {
                description: `Order label voor ${order}`,
                quantity: 1,
                orderId: order,
                lotNumber: orderData.lotNumber || order,
                stationId: selectedStation || 'PRINT_QUEUE_ADMIN',
                targetPrinterName: activeQueuePrinter.name,
                width: parseInt(String(widthMm), 10),
                height: parseInt(String(heightMm), 10),
                renderMode: 'bitmap',
                variables: {
                  orderNumber: order,
                  productId: item,
                  description: desc,
                },
                templateId: currentTemplate?.id || null,
                source: 'temp_order_labels',
                linkedSequenceIndex: idx + 1,
                linkedSequenceTotal: templatesToPrint.length,
                linkedRootTemplateId: template?.id || null,
              }
            );
          }
        } else {
          await queuePrintJob(
            activeQueuePrinter.id,
            zpl,
            {
              description: `Order label voor ${order}`,
              quantity: 1,
              orderId: order,
              lotNumber: orderData.lotNumber || order,
              stationId: selectedStation || 'PRINT_QUEUE_ADMIN',
              targetPrinterName: activeQueuePrinter.name,
              width: parseInt(String(template?.width || 90), 10),
              height: parseInt(String(template?.height || 40), 10),
              renderMode: 'bitmap',
              variables: {
                orderNumber: order,
                productId: item,
                description: desc,
              },
              templateId: template?.id || null,
              source: 'temp_order_labels'
            }
          );
        }
        notify(t("common.printLabelQueued", { order, printer: activeQueuePrinter.name }));
        return;
      }

      throw new Error('Geen directe USB printer gekoppeld en geen wachtrijprinter geconfigureerd.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      notify(t("common.printErrorMessage", { message }));
    }
  };
  const [orderStr, setOrderStr] = useState("");
  const [results, setResults] = useState<AnyRecord[]>([]);
  const [initialList, setInitialList] = useState<AnyRecord[]>([]);
  const [loadingInitialList, setLoadingInitialList] = useState(true);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  const refreshInitialList = useCallback(async () => {
    setLoadingInitialList(true);
    try {
      const [tempSnap, planSnap, trackSnap, scopedOrdersSnap] = await Promise.all([
        getDocs(query(collection(db, getPathString(PATHS.TEMP_PLANNING)), limit(120))),
        getDocs(query(collection(db, getPathString(PATHS.PLANNING)), limit(120))),
        getDocs(query(collection(db, getPathString(PATHS.TRACKING)), limit(120))),
        getDocs(query(collectionGroup(db, 'orders'), limit(120))),
      ]);

      if (!isMountedRef.current) return;

      const rows: AnyRecord[] = [];
      const pushRows = (snap: any) => {
        snap.docs.forEach((d: any) => rows.push({ id: d.id, ...(d.data() as AnyRecord) }));
      };

      pushRows(tempSnap);
      pushRows(planSnap);
      pushRows(trackSnap);
      pushRows(scopedOrdersSnap);

      const dedup: AnyRecord[] = [];
      const seen = new Set<string>();
      rows.forEach((r) => {
        const rowId = String(r.id || "");
        if (!rowId || seen.has(rowId)) return;
        seen.add(rowId);
        dedup.push(r);
      });

      dedup.sort((a, b) =>
        getOrderLabelOrder(a).localeCompare(getOrderLabelOrder(b), undefined, { numeric: true })
      );

      setInitialList(dedup);
    } catch (err) {
      console.error("Fout bij laden order labels lijst:", err);
    } finally {
      if (isMountedRef.current) setLoadingInitialList(false);
    }
  }, []);

  const normalizeText = (value: unknown) => String(value || "").toLowerCase().trim();

  useEffect(() => {
    isMountedRef.current = true;
    refreshInitialList();

    return () => {
      isMountedRef.current = false;
    };
  }, [refreshInitialList]);

  const displayItems = orderStr.trim() ? results : [];

  const handleSearch = async () => {
    if (!orderStr.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      let searchStr = orderStr.trim().toUpperCase();
      // Als de gebruiker per ongeluk een heel databasepad plakt, pak het laatste stuk (de ID)
      if (searchStr.includes('/')) {
        searchStr = searchStr.split('/').filter(Boolean).pop() || searchStr;
      }

      // Short-circuit fallback for legacy/nood label flow on known BH18 Fittings paths.
      if (searchStr.startsWith("N") && searchStr.length >= 6) {
        const targetedPaths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
        ];
        const targetedResults: AnyRecord[] = [];
        for (const path of targetedPaths) {
          try {
            const prefixSnap = await getDocs(
              query(collection(db, path), orderBy(documentId()), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(300))
            );
            prefixSnap.docs.forEach((d) => {
              targetedResults.push({ id: d.id, ...(d.data() as AnyRecord) });
            });
          } catch (err) {
            console.warn("Targeted BH18 query failed for path:", path, err);
          }
        }
        if (targetedResults.length > 0) {
          setResults(targetedResults);
          setLoading(false);
          return;
        }
      }

      // Genereer logische FPI voorvoegsels
      let searchOptions: string[] = [searchStr];
      const digitsMatch = searchStr.match(/\d+/);
      if (digitsMatch) {
          const digits = digitsMatch[0];
          if (digits.length >= 3) {
            if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
              searchOptions.push(`N${digits}`);
              searchOptions.push(`N20${digits}`);
              searchOptions.push(`N200${digits}`);
              searchOptions.push(`N21${digits}`);
              searchOptions.push(`N210${digits}`);
              searchOptions.push(`P${digits}`);
            }
          }
      }

      const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
      const colRef = collection(db, getPathString(PATHS.TEMP_PLANNING));
      const planRef = collection(db, getPathString(PATHS.PLANNING));
      const trackRef = collection(db, getPathString(PATHS.TRACKING));
      
      const foundDocs = new Map<string, AnyRecord>();
      const addDocs = (snap: any) => {
        if (snap && snap.docs) {
          snap.docs.forEach((d: any) => foundDocs.set(d.id, { id: d.id, ...(d.data() as AnyRecord) }));
        }
      };

      // 0. Scoped machine orders zoeken (collectionGroup voor alle 'orders' onder alle machines)
      try {
        const scopedQueries = [
          getDocs(query(collectionGroup(db, 'orders'), where('id', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('orderId', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('orderNumber', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Order', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('order', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('originalOrderId', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('itemCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('productCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('articleCode', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Item', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('Artikel', 'in', uniqueOptions))),
          getDocs(query(collectionGroup(db, 'orders'), where('itemDescription', 'in', uniqueOptions))),
        ];
        const scopedSnaps = await Promise.all(scopedQueries.map(p => p.catch(() => null)));
        scopedSnaps.forEach(addDocs);
      } catch (err) {
        console.warn('Fout bij zoeken in scoped orders:', err);
      }

      // 1. Direct op Document ID proberen
      const directLookupPaths = [
        getPathString(PATHS.TEMP_PLANNING),
        getPathString(PATHS.PLANNING),
        getPathString(PATHS.TRACKING),
        `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
        `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`
      ];

      for (const opt of uniqueOptions) {
        for (const path of directLookupPaths) {
          try {
            const docRef = doc(db, `${path}/${opt}`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) foundDocs.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as AnyRecord) });
          } catch {
            continue;
          }
        }
      }

      // 2. Parallelle exacte zoekopdrachten
      const exactQueries = [
        getDocs(query(colRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(colRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(colRef, where("Order", "in", uniqueOptions))),
        getDocs(query(colRef, where("Productieorder", "in", uniqueOptions))),
        getDocs(query(colRef, where("order", "in", uniqueOptions))),
        getDocs(query(colRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(colRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("productCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("articleCode", "in", uniqueOptions))),
        getDocs(query(colRef, where("Item", "in", uniqueOptions))),
        getDocs(query(colRef, where("Artikel", "in", uniqueOptions))),
        getDocs(query(colRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(planRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(planRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(planRef, where("Order", "in", uniqueOptions))),
        getDocs(query(planRef, where("Productieorder", "in", uniqueOptions))),
        getDocs(query(planRef, where("order", "in", uniqueOptions))),
        getDocs(query(planRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(planRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("productCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("articleCode", "in", uniqueOptions))),
        getDocs(query(planRef, where("Item", "in", uniqueOptions))),
        getDocs(query(planRef, where("Artikel", "in", uniqueOptions))),
        getDocs(query(planRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(trackRef, where("orderId", "in", uniqueOptions))),
        getDocs(query(trackRef, where("orderNumber", "in", uniqueOptions))),
        getDocs(query(trackRef, where("Order", "in", uniqueOptions))),
        getDocs(query(trackRef, where("order", "in", uniqueOptions))),
        getDocs(query(trackRef, where("originalOrderId", "in", uniqueOptions))),
        getDocs(query(trackRef, where("itemCode", "in", uniqueOptions))),
        getDocs(query(trackRef, where("item", "in", uniqueOptions))),
        getDocs(query(trackRef, where("itemDescription", "in", uniqueOptions))),
        getDocs(query(trackRef, where("productCode", "in", uniqueOptions)))
      ];
      const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
      exactSnaps.forEach(addDocs);
        
      // 3. Gedeeltelijke / part-match (als lengte >= 3 is) client-side op brede datasets
      if (searchStr.length >= 3) {
        const broadSnaps = await Promise.all([
          getDocs(query(collectionGroup(db, 'orders'), limit(1500))).catch(() => null),
          getDocs(query(collection(db, getPathString(PATHS.PLANNING)), limit(500))).catch(() => null)
        ]);
        broadSnaps.forEach(snap => {
          if (snap && snap.docs) {
            snap.docs.forEach(d => {
              const data = d.data() as AnyRecord;
              const idTxt = d.id.toUpperCase();
              const orderTxt = String(data.orderId || data.orderNumber || data.Order || '').toUpperCase();
              if (idTxt.includes(searchStr) || orderTxt.includes(searchStr)) {
                foundDocs.set(d.id, { id: d.id, ...data });
              }
            });
          }
        });
      }

      // 4. 'Begint met' zoekopdrachten (als we nog weinig of niks hebben)
      if (foundDocs.size < 5 && searchStr.length >= 3) {
        const startOptions = [searchStr];
        if (digitsMatch && digitsMatch[0].length >= 3) {
            if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
                startOptions.push(`N200${digitsMatch[0]}`);
                startOptions.push(`N20${digitsMatch[0]}`);
                startOptions.push(`N210${digitsMatch[0]}`);
                startOptions.push(`N21${digitsMatch[0]}`);
            }
        }
        
        const startsWithQueries: Array<Promise<any>> = [];
        Array.from(new Set(startOptions)).forEach(opt => {
            startsWithQueries.push(getDocs(query(colRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(colRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(planRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
            startsWithQueries.push(getDocs(query(trackRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        });

        const startSnaps = await Promise.all(startsWithQueries.map(p => p.catch(() => null)));
        startSnaps.forEach(addDocs);
      }
      
      const queryText = normalizeText(orderStr);
      const clientMatches = initialList.filter((item) => {
        const orderText = normalizeText(getOrderLabelOrder(item));
        const productText = normalizeText([
          item.item,
          item.itemDescription,
          item.itemCode,
          item.productCode,
          item.articleCode,
          item.Item,
          item.Artikel,
          item.description,
          item.Description,
          item.Omschrijving,
        ].filter(Boolean).join(' '));
        return orderText.includes(queryText) || productText.includes(queryText);
      });

      const merged = new Map<string, AnyRecord>();
      Array.from(foundDocs.values()).forEach((item) => merged.set(String(item.id || ""), item));
      clientMatches.forEach((item) => merged.set(String(item.id || ""), item));
      let finalResults = Array.from(merged.values());

      if (finalResults.length === 0 && searchStr.length >= 3) {
        const targetedPaths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
        ];
        const targetedQueries = targetedPaths.map((path) =>
          getDocs(
            query(collection(db, path), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(250))
          ).catch(() => null)
        );
        const targetedSnaps = await Promise.all(targetedQueries);
        const targetedMatches: AnyRecord[] = [];
        targetedSnaps.forEach((snap) => {
          if (!snap || !snap.docs) return;
          snap.docs.forEach((d: any) => targetedMatches.push({ id: d.id, ...(d.data() as AnyRecord) }));
        });
        if (targetedMatches.length > 0) {
          finalResults = targetedMatches;
        }
      }

      setResults(finalResults);
    } catch (e) {
      console.error("Zoekfout temp labels:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setOrderStr("");
    setResults([]);
    await refreshInitialList();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden relative border border-slate-100">
        {/* Achtergrond Decoratie */}
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Tag size={180} className="text-slate-900 -rotate-12" />
        </div>

        <div className="p-8 md:p-10 relative z-10 flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm border border-emerald-100/50">
                <Tag size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-1">
                  {t("printer.orderLabels", "Order Labels")}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t("printer.legacyEmergencyLabelsSearch", "Legacy / Nood-etiketten zoeken")}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><X size={20} /></button>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 shrink-0">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder={t('printer.searchOrderPlaceholder', 'ZOEK OP ORDER OF PRODUCT')}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold uppercase outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm text-slate-900 placeholder:text-slate-400"
                value={orderStr}
                onChange={(e) => setOrderStr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button 
              onClick={handleSearch} 
              disabled={loading} 
              className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : t("common.search")}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingInitialList || loading}
              className="px-4 py-4 bg-slate-50 border-2 border-slate-100 text-slate-500 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-100 hover:text-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t("common.refresh", "Ververs lijst")}
            >
              <RefreshCw size={18} className={loadingInitialList ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-2">
            {displayItems.length > 0 && (
              <div className="space-y-3">
                {displayItems.map((item, idx) => (
                  <TempLabelItem 
                    key={String(item.id || idx)} 
                    item={item} 
                    labelTemplates={labelTemplates} 
                    labelRules={labelRules}
                    printerDpi={printerDpi}
                    handleTempLegacyPrint={handleTempLegacyPrint}
                  />
                ))}
              </div>
            )}
            
            {!orderStr.trim() && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <Search className="text-slate-400 mb-3" size={32} />
                <p className="text-sm font-bold text-slate-600">{t("printer.searchOrderOrLot", "Zoek een order of lotnummer")}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">{t("printer.typeReferenceToViewLabels", "Typ een referentie in de zoekbalk om labels te bekijken.")}</p>
              </div>
            )}

            {results.length === 0 && orderStr.trim() && !loading && (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-[30px] flex flex-col items-center justify-center text-center bg-slate-50/50">
                <div className="p-4 bg-slate-100 text-slate-400 rounded-full mb-3">
                  <Search size={24} />
                </div>
                <p className="text-sm font-black text-slate-600 uppercase tracking-widest">{t("common.nothingFound")}</p>
                <p className="text-xs text-slate-400 font-medium mt-1">{t("common.noOrderOrProductFoundFor", { query: orderStr })}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Modal: Lotnummers Printen ---
const LotPrintModal = ({ onClose, departmentGroups, onPrintBatch, printer }: LotPrintModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [departmentKey, setDepartmentKey] = useState(departmentGroups[0]?.key || "");
  const [station, setStation] = useState(departmentGroups[0]?.stations?.[0] || "");
  const [weekOffset, setWeekOffset] = useState(0); // -1,0,1
  const [count, setCount] = useState("1");
  const [startNum, setStartNum] = useState("1");
  const [loading, setLoading] = useState(false);

  const currentDepartment = useMemo(
    () => departmentGroups.find((d) => d.key === departmentKey) || departmentGroups[0] || null,
    [departmentGroups, departmentKey]
  );
  const availableStations = currentDepartment?.stations || [];
  const parsedStartNum = Math.max(1, parseInt(startNum, 10) || 1);
  const parsedCount = Math.max(1, Math.min(100, parseInt(count, 10) || 1));

  useEffect(() => {
    if (departmentGroups.length > 0 && !departmentGroups.some((d) => d.key === departmentKey)) {
      setDepartmentKey(departmentGroups[0].key);
      return;
    }
    if (availableStations.length > 0 && !availableStations.includes(station)) {
      setStation(availableStations[0]);
    }
  }, [departmentGroups, departmentKey, availableStations, station]);

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!station) {
      notify(t("common.noStationAvailable"));
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      now.setDate(now.getDate() + (Number(weekOffset) * 7));
      const { week, year } = getISOWeekInfo(now);
      const yy = String(year).slice(-2);
      const ww = String(week).padStart(2, '0');
      const machineCode = getStationMachineCode(station);
      const baseLot = `40${yy}${ww}${machineCode}40`;

      const lots = [];
      for (let i = 0; i < parsedCount; i++) {
        const currentNum = String(parsedStartNum + i).padStart(4, '0');
        lots.push(`${baseLot}${currentNum}`);
      }

      const dpi = resolvePrinterDpi(printer as Record<string, unknown>, 203);
      const darkness = printer?.darkness ? parseInt(String(printer.darkness), 10) : 15;
      const zplBatch = generateLotBatchZPL({
        lots,
        printerDpi: dpi,
        darkness,
      });

      await onPrintBatch(zplBatch, lots.length);
      notify(t("common.lotsPrintedDirectUsb", { count: parsedCount }));
    } catch(err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      notify(t("common.generationError", { message }));
    } finally {
      setLoading(false);
    }
  };

  const previewNow = new Date();
  previewNow.setDate(previewNow.getDate() + (Number(weekOffset) * 7));
  const { week: previewWeek, year: previewYear } = getISOWeekInfo(previewNow);
  const previewYY = String(previewYear).slice(-2);
  const previewWW = String(previewWeek).padStart(2, '0');
  const previewMachineCode = getStationMachineCode(station);
  const previewBaseLot = `40${previewYY}${previewWW}${previewMachineCode}40`;
  const previewLots = Array.from({ length: Math.min(5, Math.max(1, parsedCount)) }, (_, i) => {
    const seq = parsedStartNum + i;
    return `${previewBaseLot}${String(seq).padStart(4, '0')}`;
  });

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Printer className="text-blue-500" /> {t("common.printLotNumbers")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.department")}</label>
            <select
              value={departmentKey}
              onChange={e => setDepartmentKey(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              disabled={departmentGroups.length === 0}
            >
              {departmentGroups.length === 0 && <option value="">{t("common.noDepartmentsFound")}</option>}
              {departmentGroups.map((group: DepartmentGroup) => <option key={group.key} value={group.key}>{group.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.stationMachine")}</label>
            <select value={station} onChange={e => setStation(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50" disabled={availableStations.length === 0}>
              {availableStations.length === 0 && <option value="">{t("common.noStationsFound")}</option>}
              {availableStations.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.week")}</label>
            <select value={String(weekOffset)} onChange={(e) => setWeekOffset(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50">
              <option value="-1">{t("common.previousWeek")}</option>
              <option value="0">{t("common.currentWeek")}</option>
              <option value="1">{t("common.nextWeek")}</option>
            </select>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{t("common.isoWeek", { week: previewWW })}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.startSequenceNumber")}</label>
              <input
                type="number"
                min="1"
                max="9999"
                inputMode="numeric"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
                onBlur={() => setStartNum(String(parsedStartNum))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t("common.numberOfLabels")}</label>
              <input
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onBlur={() => setCount(String(parsedCount))}
                className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
              />
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 flex flex-col items-center mt-2">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest w-full text-left">{t("common.livePreviewMax", { max: 5 })}</p>
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: '90mm' }}>
              {previewLots.map((lot) => (
                <div key={lot} className="w-full h-[13mm] px-2 flex items-center gap-2 border-b border-dashed border-slate-300 last:border-b-0" style={{ maxWidth: '90mm' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(lot)}`}
                    alt="QR links"
                    className="w-8 h-8 object-contain"
                  />
                  <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-[0.08em] leading-none break-all flex-1 text-center">
                    {lot}
                  </p>
                </div>
              ))}
              {parsedCount > 5 && (
                <p className="text-[11px] font-bold text-slate-500 text-center">{t("common.extraLabelsPrinted", { count: parsedCount - 5 })}</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full mt-4 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
            {t("common.generateAndPrint")}
          </button>
        </form>
      </div>
    </div>
  );
};

const PrintStationWizardModal = ({
  onClose,
  stations,
  printers,
  selectedStation,
  stationBindings,
  onSave,
}: PrintStationWizardModalProps) => {
  const { t } = useTranslation();
  const [station, setStation] = useState<string>(selectedStation || stations[0] || '');
  const [printerId, setPrinterId] = useState<string>('');

  useEffect(() => {
    if (!station) return;
    const stationKey = normalizeStationBindingKey(station);
    const boundPrinterId = String(stationBindings[stationKey] || '').trim();
    setPrinterId(boundPrinterId || printers[0]?.id || '');
  }, [station, stationBindings, printers]);

  const handleSave = () => {
    if (!station || !printerId) return;
    onSave(station, printerId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-xl rounded-[30px] shadow-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Settings2 size={20} className="text-blue-600" /> {t('printStationView.printerWizardTitle', 'Print Station Wizard')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t('common.stationMachine', 'Station / Machine')}</label>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
            >
              {stations.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t('adminPrinterManager.printer', 'Printer')}</label>
            <select
              value={printerId}
              onChange={(e) => setPrinterId(e.target.value)}
              className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold bg-slate-50"
            >
              {printers.map((printer) => (
                <option key={printer.id} value={printer.id}>{String(printer.name || printer.id)}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            {t('printStationView.printerWizardHelp', 'Deze koppeling geldt voor alle gebruikers op deze pc/browser. Operator of admin maakt hierbij niet uit.')}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel', 'Annuleren')}</button>
            <button onClick={handleSave} disabled={!station || !printerId} className="px-5 py-2 bg-blue-600 text-white font-black rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {t('common.save', 'Opslaan')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PrintQueueAdminView = () => {
  const { role, user } = useAdminAuth();
  const { t } = useTranslation();
  const { showConfirm , notify} = useNotifications();
  const canManage = ['admin', 'teamleader', 'planner'].includes(String(role || ''));

  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [usbDevice, setUsbDevice] = useState<USBDevice | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const [showTempModal, setShowTempModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showStationWizard, setShowStationWizard] = useState(false);
  
  // Nieuwe state voor navigatie en reprint
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'station'
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [reprintSearch, setReprintSearch] = useState('');
  const [reprintResult, setReprintResult] = useState<AnyRecord | null>(null);
  const [exactReprintJob, setExactReprintJob] = useState<PrintJob | null>(null);
  const { labelTemplates, labelRules } = useLabelCatalog();
  const [isSearching, setIsSearching] = useState(false);
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null);
  const [previewSize, setPreviewSize] = useState("3.54x5.91");
  const [previewSizeLabel, setPreviewSizeLabel] = useState("90x150 mm");
  const [factoryConfig, setFactoryConfig] = useState<AnyRecord | null>(null);
  const [bindingStation, setBindingStation] = useState<string>(() => String(localStorage.getItem(PRINT_STATION_SELECTED_KEY) || '').trim());
  const [stationBindings, setStationBindings] = useState<Record<string, string>>(() => readStationBindings());

  useEffect(() => {
    if (previewJob?.metadata?.width && previewJob?.metadata?.height) {
        const widthMm = PREVIEW_ROLL_WIDTH_MM;
        const heightMm = Number(previewJob.metadata.height);
        const widthInches = (widthMm / 25.4).toFixed(2);
        const heightInches = (heightMm / 25.4).toFixed(2);
        setPreviewSize(`${widthInches}x${heightInches}`);
        setPreviewSizeLabel(`${widthMm}x${heightMm} mm`);
    }
  }, [previewJob]);

  useEffect(() => {
    // 1. Probeer automatisch te verbinden met een eerder gekozen USB printer
    const restoreUsbConnection = async () => {
      if (!isUsbDirectSupported()) return;
      
      const savedVendor = localStorage.getItem(USB_PRINTER_VENDOR_KEY);
      const savedProduct = localStorage.getItem(USB_PRINTER_PRODUCT_KEY);
      
      if (savedVendor && savedProduct) {
        try {
          const devices = await navigator.usb.getDevices();
          const match = devices.find(d => 
            d.vendorId === parseInt(savedVendor) && 
            d.productId === parseInt(savedProduct)
          );
          if (match) {
            setUsbDevice(match);
          }
        } catch (err) {
          console.warn("Kon USB printer niet automatisch herstellen:", err);
        }
      }
    };
    restoreUsbConnection();

    // Printers ophalen
    const unsubPrinters = onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snapshot) => {
      setPrinters(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as AnyRecord) })));
    });

    let rootJobs: PrintJob[] = [];
    let scopedJobs: PrintJob[] = [];

    const normalizeJob = (docSnap: any): PrintJob | null => {
      const data = (docSnap.data() || {}) as AnyRecord;
      const metadata = (data.metadata || {}) as AnyRecord;
      const isQueueJob = Boolean(
        String(data._scopeType || '').trim() === 'print_queue'
        || data.printerId
        || data.zpl
        || data.printData
        || data.labelZPL
        || data.status
        || data.machineId
        || metadata.description
        || metadata.stationId
        || metadata.targetStation
      );
      if (!isQueueJob) return null;
      return { id: docSnap.id, ...data, __refPath: String(docSnap.ref?.path || '') } as PrintJob;
    };

    const tsToMillis = (ts: unknown) => {
      if (!ts) return 0;
      if (typeof (ts as any).toDate === 'function') return (ts as any).toDate().getTime();
      const parsed = new Date(String(ts));
      return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
    };

    const printQueuePathFragment = `${PATHS.PRINT_QUEUE.join('/')}/`;
    const isScopedPrintQueuePath = (refPath: unknown): boolean => {
      const normalizedPath = String(refPath || '').replace(/^\/+/, '').toLowerCase();
      const normalizedFragment = String(printQueuePathFragment || '').replace(/^\/+/, '').toLowerCase();
      return normalizedPath.includes(normalizedFragment);
    };

    const mergeJobs = () => {
      const byId = new Map<string, PrintJob>();
      rootJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      // Scoped docs krijgen voorrang op legacy root docs.
      scopedJobs.forEach((job) => {
        if (job?.id) byId.set(job.id, job);
      });
      const merged = Array.from(byId.values()).sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
      setPrintJobs(merged);
      setLoading(false);
    };

    const rootQ = query(collection(db, getPathString(PATHS.PRINT_QUEUE)), orderBy('createdAt', 'desc'));
    const unsubscribeRoot = onSnapshot(rootQ, (snapshot) => {
      rootJobs = snapshot.docs.map(normalizeJob).filter((job): job is PrintJob => Boolean(job));
      mergeJobs();
    }, (err) => {
      console.error('Error fetching legacy print jobs:', err);
      rootJobs = [];
      mergeJobs();
    });

    const scopedQ = collectionGroup(db, 'items');
    const unsubscribeScoped = onSnapshot(scopedQ, (snapshot) => {
      scopedJobs = snapshot.docs
        .filter((docSnap) => isScopedPrintQueuePath(docSnap.ref?.path))
        .map(normalizeJob)
        .filter((job): job is PrintJob => {
          if (!job) return false;
          const scopeType = String((job as PrintJob)._scopeType || '').trim().toLowerCase();
          return !scopeType || scopeType === 'print_queue';
        });
      mergeJobs();
    }, (err) => {
      console.error('Error fetching scoped print jobs:', err);
      scopedJobs = [];
      mergeJobs();
    });

    return () => {
      unsubPrinters();
      unsubscribeRoot();
      unsubscribeScoped();
    };
  }, []);

  useEffect(() => {
    const unsubFactory = onSnapshot(doc(db, getPathString(PATHS.FACTORY_CONFIG)), (snap) => {
      setFactoryConfig(snap.exists() ? snap.data() : null);
    });

    return () => {
      unsubFactory();
    };
  }, []);

  const userDepartmentKey = useMemo(() => {
    const userRecord = (user || {}) as AnyRecord;
    return normalizeDepartmentKey(
      userRecord.departmentId
      || userRecord.department
      || userRecord.currentDepartment
      || userRecord.dept
      || ''
    );
  }, [user]);

  const scopedFactoryDepartments = useMemo<AnyRecord[]>(() => {
    const departments = Array.isArray(factoryConfig?.departments) ? (factoryConfig?.departments as AnyRecord[]) : [];
    if (!userDepartmentKey || String(role || '').toLowerCase() === 'admin') {
      return departments;
    }

    return departments.filter((department) => getDepartmentKeys(department).includes(userDepartmentKey));
  }, [factoryConfig, role, userDepartmentKey]);

  const allFactoryStations = useMemo<string[]>(() => {
    const stations = scopedFactoryDepartments
      .flatMap((dept: AnyRecord) => (Array.isArray(dept?.stations) ? dept.stations : []))
      .map(stationNameFromValue)
      .filter(Boolean) as string[];

    return Array.from(new Set(stations)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [scopedFactoryDepartments]);

  useEffect(() => {
    if (allFactoryStations.length === 0) return;
    if (!bindingStation) {
      setBindingStation(allFactoryStations[0]);
      return;
    }

    const exists = allFactoryStations.some((station) => station === bindingStation);
    if (!exists) setBindingStation(allFactoryStations[0]);
  }, [allFactoryStations, bindingStation]);

  useEffect(() => {
    if (!bindingStation) return;
    localStorage.setItem(PRINT_STATION_SELECTED_KEY, bindingStation);
  }, [bindingStation]);

  const stationContext = selectedStation || bindingStation || null;

  const persistStationBinding = useCallback((station: string, printerId: string) => {
    const stationKey = normalizeStationBindingKey(station);
    if (!stationKey || !printerId) return;

    const nextBindings = {
      ...readStationBindings(),
      [stationKey]: printerId,
    };

    writeStationBindings(nextBindings);
    setStationBindings(nextBindings);
    setBindingStation(station);
    localStorage.setItem(USB_PRINTER_ID_KEY, printerId);
  }, []);

  const handleSaveStationBinding = useCallback((station: string, printerId: string) => {
    persistStationBinding(station, printerId);
    const selectedPrinter = printers.find((printer) => printer.id === printerId);
    notify(
      t('printStationView.printerWizardSaved', 'Station {{station}} gekoppeld aan printer {{printer}}.', {
        station,
        printer: String(selectedPrinter?.name || printerId),
      })
    );
  }, [persistStationBinding, printers, notify, t]);

  const activeStationBindingPrinterName = useMemo(() => {
    if (!stationContext) return '';
    const stationKey = normalizeStationBindingKey(stationContext);
    const printerId = String(stationBindings?.[stationKey] || '').trim();
    if (!printerId) return '';
    return String(printers.find((printer) => printer.id === printerId)?.name || printerId);
  }, [stationContext, stationBindings, printers]);

  // Auto-print logica
  useEffect(() => {
    const matchedPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    const currentPrinterId = matchedPrinter?.id || null;
    if (!autoPrint || !usbDevice || isProcessing || !currentPrinterId) return;

    const pendingJobs = printJobs.filter((j) => {
      if (!isQueuedJobStatus(j.status)) return false;
      if (j.printerId !== currentPrinterId) return false;
      if (!selectedStation) return true;
      const selectedKey = normalizeStationKey(selectedStation);
      const jobStationKeys = getJobStationKeys(j);
      return jobStationKeys.includes(selectedKey);
    }).sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));

    if (pendingJobs.length > 0) {
      const processQueue = async () => {
        setIsProcessing(true);
        for (const job of pendingJobs) {
          try {
            await handlePrintJob(job);
          } catch (e) {
            console.error(`Auto-print failed for ${job.id}:`, e);
            if (isInvalidPrintQueueTransitionError(e)) {
              // Deze taak is waarschijnlijk al verwerkt door een andere actieve queue-processor.
              continue;
            }
            const message = e instanceof Error ? e.message : String(e);
            const lowerMessage = String(message || '').toLowerCase();
            const isUsbSessionIssue = /claim interface|claiminterface|usb|geen usb printer verbonden|access denied|toegang geweigerd|not allowed/.test(lowerMessage);

            if (isUsbSessionIssue) {
              // Houd auto-print aan, maar forceer reconnect van USB zodat de volgende run schoon start.
              setUsbDevice(null);
              setError(`Auto-print wacht op USB-herstel. Taak ${job.id} mislukt: ${message}`);
              break;
            }

            // Voor niet-USB taakfouten blijven we de rest van de queue verwerken.
            setError(`Taak ${job.id} mislukt: ${message}`);
          }
        }
        setIsProcessing(false);
      };
      processQueue();
    }
  }, [printJobs, autoPrint, usbDevice, isProcessing, selectedStation, printers, stationContext]);

  const filteredJobs = useMemo(() => {
    let jobs = printJobs;
    const matchedPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    const currentPrinterId = matchedPrinter?.id || null;

    // In stationweergave willen we alle jobs voor dat station zien, ongeacht printer-id.
    if (currentPrinterId && !selectedStation) {
      jobs = jobs.filter((j) => j.printerId === currentPrinterId);
    }
    
    // Filter op station als er een geselecteerd is
    if (selectedStation) {
      const selectedKey = normalizeStationKey(selectedStation);
      jobs = jobs.filter((j) => {
        const jobStationKeys = getJobStationKeys(j);
        return jobStationKeys.includes(selectedKey);
      });
    } else if (role !== 'admin') {
      // Standaard filter voor niet-admins
      const allowedPrinterIds = printers.map((p) => p.id);
      jobs = jobs.filter((job) => job.printerId ? allowedPrinterIds.includes(job.printerId) : false);
    }
    
    return jobs;
  }, [printJobs, printers, role, selectedStation, usbDevice, stationContext]);

  const activeQueuePrinter = useMemo(() => {
    const boundPrinter = resolveUsbBoundPrinter(printers, usbDevice, stationContext || undefined);
    if (boundPrinter) return boundPrinter;
    return resolvePrinterForRouting(printers, {
      stationId: stationContext || undefined,
      routeKey: stationContext || undefined,
    });
  }, [printers, usbDevice, stationContext]);

  const stationGroups = useMemo(() => {
    if (!activeQueuePrinter) return [];
    const stations = Array.isArray(activeQueuePrinter.queueStations)
      ? activeQueuePrinter.queueStations
      : (activeQueuePrinter.linkedStations || []);
    const scopedStationKeys = new Set(allFactoryStations.map((station) => normalizeStationKey(station)));
    return Array.from(new Set(stations.map(stationNameFromValue).filter(Boolean)))
      .filter((station: string) => scopedStationKeys.size === 0 || scopedStationKeys.has(normalizeStationKey(station)))
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  }, [activeQueuePrinter, allFactoryStations]);

  useEffect(() => {
    if (!selectedStation) return;
    const exists = stationGroups.some((station) => normalizeStationKey(station) === normalizeStationKey(selectedStation));
    if (!exists) {
      setSelectedStation(null);
      setViewMode('overview');
    }
  }, [selectedStation, stationGroups]);

  const departmentGroups = useMemo<DepartmentGroup[]>(() => {
    const fromConfig = scopedFactoryDepartments
      .map((dept, idx) => {
        const stations = Array.from(new Set((Array.isArray(dept?.stations) ? dept.stations : [])
          .map(stationNameFromValue)
          .filter((name): name is string => Boolean(name))))
          .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
        if (stations.length === 0) return null;

        const key = String(dept?.slug || dept?.id || `dept-${idx}`);
        const label = String(dept?.name || dept?.slug || dept?.id || `Afdeling ${idx + 1}`);
        return { key, label, stations };
      })
      .filter((group): group is DepartmentGroup => group !== null);

    if (fromConfig.length > 0) return fromConfig;

    return stationGroups.length > 0
      ? [{ key: 'all-stations', label: 'Alle stations', stations: stationGroups }]
      : [];
  }, [scopedFactoryDepartments, stationGroups]);

  const printerDpi = useMemo(() => {
    const parsed = parseInt(String(activeQueuePrinter?.dpi ?? ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return resolvePrinterDpi(activeQueuePrinter as Record<string, unknown>, 203);
  }, [activeQueuePrinter]);

  const printerDarkness = useMemo(() => {
    const parsed = parseInt(String(activeQueuePrinter?.darkness ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  }, [activeQueuePrinter]);

  const printerZplTextFont = useMemo(() => {
    const raw = String(activeQueuePrinter?.zplTextFont || '').trim().toUpperCase();
    return raw === 'A' ? 'A' : '0';
  }, [activeQueuePrinter]);

  const handleConnectUsb = async () => {
    setError('');
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      // Sla de printer op voor de volgende keer
      localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(device.vendorId));
      localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(device.productId));

      const routingPrinter = resolvePrinterForRouting(printers, {
        stationId: stationContext || undefined,
        routeKey: stationContext || undefined,
      });
      const usbMatches = printers.filter(
        (printer) => Number(printer.vendorId) === device.vendorId && Number(printer.productId) === device.productId
      );
      const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
      if (printerIdToStore) {
        if (stationContext) {
          persistStationBinding(stationContext, printerIdToStore);
        } else {
          localStorage.setItem(USB_PRINTER_ID_KEY, printerIdToStore);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDirectLotPrintBatch = async (batchData: string) => {
    let deviceToUse = usbDevice;
    if (!deviceToUse) {
      const requestedDevice = await navigator.usb.requestDevice({ filters: [] });
      deviceToUse = requestedDevice;
      setUsbDevice(requestedDevice);
      localStorage.setItem(USB_PRINTER_VENDOR_KEY, String(requestedDevice.vendorId));
      localStorage.setItem(USB_PRINTER_PRODUCT_KEY, String(requestedDevice.productId));

      const routingPrinter = resolvePrinterForRouting(printers, {
        stationId: stationContext || undefined,
        routeKey: stationContext || undefined,
      });
      const usbMatches = printers.filter(
        (printer) => Number(printer.vendorId) === requestedDevice.vendorId && Number(printer.productId) === requestedDevice.productId
      );
      const printerIdToStore = routingPrinter?.id || (usbMatches.length === 1 ? usbMatches[0].id : '');
      if (printerIdToStore) {
        if (stationContext) {
          persistStationBinding(stationContext, printerIdToStore);
        } else {
          localStorage.setItem(USB_PRINTER_ID_KEY, printerIdToStore);
        }
      }
    }

    if (!deviceToUse) {
      throw new Error('Geen USB printer verbonden.');
    }

    await printRawUsb(deviceToUse, batchData);
    setError('');
  };

  const regenerateBitmapPayloadFromJob = useCallback(async (job: PrintJob): Promise<string | null> => {
    const templateId = String(job.metadata?.templateId || '').trim();
    const template = templateId ? labelTemplates.find((entry) => String(entry.id) === templateId) : null;
    const variables = job.metadata?.variables;

    if (!template || !variables || typeof variables !== 'object' || Array.isArray(variables)) {
      return null;
    }

    const widthMm = Number((template as any)?.width) || 90;
    const heightMm = Number((template as any)?.height) || 40;

    return renderLabelToBitmapZpl({
      template: template as any,
      data: variables as AnyRecord,
      printerDpi,
      darkness: Math.max(15, Number(printerDarkness) || 15),
      printSpeed: 3,
      widthMm,
      heightMm,
    });
  }, [labelTemplates, printerDpi, printerDarkness]);

  const handlePrintJob = async (job: PrintJob) => {
    if (!usbDevice) throw new Error("Geen USB printer verbonden.");

    const routingViolation = getPrinterRoutingViolation(job, activeQueuePrinter as PrinterConfig | null);
    if (routingViolation) {
      try {
        await transitionPrintQueueJobStatus({
          jobId: job.id,
          status: 'error',
          error: routingViolation,
          source: 'PrintQueueAdminView',
        });
      } catch (transitionError) {
        if (!isInvalidPrintQueueTransitionError(transitionError)) {
          throw transitionError;
        }
      }
      throw new Error(routingViolation);
    }

    try {
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'printing',
        source: 'PrintQueueAdminView',
      });
    } catch (error) {
      if (isInvalidPrintQueueTransitionError(error)) {
        // Taak is intussen al door een andere client opgepakt of afgewerkt.
        return;
      }
      throw error;
    }
    try {
      const regeneratedContent = await regenerateBitmapPayloadFromJob(job);
      const content = regeneratedContent || job.printData || job.zpl;
      if (!content) throw new Error("Geen printdata gevonden in job.");
      const quantity = getJobQuantity(job) || 1;
      const isPreBatchedJob = Boolean(job?.metadata?.queuedAsBatch) || isLikelyPreBatchedZpl(content);
      const batchSeqIndex = Number(job?.metadata?.batchSequenceIndex);
      const batchSeqTotal = Number(job?.metadata?.batchSequenceTotal);
      const hasBatchSequence = Number.isFinite(batchSeqIndex) && Number.isFinite(batchSeqTotal) && batchSeqTotal > 0;
      const shouldCutAtEnd = hasBatchSequence ? batchSeqIndex === batchSeqTotal : true;
      const basePayload = normalizeQueuePrintPayload(content, quantity, isPreBatchedJob);
      const payload = enforceCutModeOnBatchPayload(basePayload, shouldCutAtEnd);

      await printRawUsb(usbDevice, payload);
      await transitionPrintQueueJobStatus({
        jobId: job.id,
        status: 'completed',
        source: 'PrintQueueAdminView',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await transitionPrintQueueJobStatus({
          jobId: job.id,
          status: 'error',
          error: message,
          source: 'PrintQueueAdminView',
        });
      } catch (transitionError) {
        if (!isInvalidPrintQueueTransitionError(transitionError)) {
          throw transitionError;
        }
      }
      throw e;
    }
  };

  const handleReprint = async (jobId: string) => {
    const confirmed = await showConfirm({
      title: 'Taak opnieuw printen',
      message: 'Weet u zeker dat u deze taak opnieuw wilt printen?',
      confirmText: 'Opnieuw printen',
      cancelText: 'Annuleren',
      tone: 'warning',
    });
    if (!confirmed) return;
    await requeuePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const handleDelete = async (jobId: string) => {
    const confirmed = await showConfirm({
      title: 'Printtaak verwijderen',
      message: 'Weet u zeker dat u deze taak permanent wilt verwijderen?',
      confirmText: 'Verwijderen',
      cancelText: 'Annuleren',
      tone: 'danger',
    });
    if (!confirmed) return;
    await deletePrintQueueJob({
      jobId,
      source: 'PrintQueueAdminView',
    });
  };

  const getJobSizeLabel = (job: PrintJob): string | null => {
    const height = Number(job?.metadata?.height);
    if (!height) return null;
    return `${PREVIEW_ROLL_WIDTH_MM}x${height} mm`;
  };

  const getJobQuantity = (job: PrintJob): number | null => {
    const quantity = Number(job?.metadata?.quantity);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
    const description = String(job?.metadata?.description || job?.description || '');
    const match = description.match(/\(x(\d+)\)/i);
    return match ? Number(match[1]) : null;
  };

  const handleSearchProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reprintSearch.trim()) return;
    
    setIsSearching(true);
    setReprintResult(null);
    setExactReprintJob(null);
    setError('');

    let searchStr = reprintSearch.trim().toUpperCase();
    if (searchStr.includes('/')) {
      searchStr = searchStr.split('/').filter(Boolean).pop() || searchStr;
    }

    const searchOptions = new Set<string>([searchStr]);
    const digitsMatch = searchStr.match(/\d+/);
    if (digitsMatch?.[0]) {
      const digits = digitsMatch[0];
      searchOptions.add(digits);
      if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
        searchOptions.add(`N${digits}`);
        searchOptions.add(`N20${digits}`);
        searchOptions.add(`N200${digits}`);
        searchOptions.add(`N21${digits}`);
        searchOptions.add(`N210${digits}`);
        searchOptions.add(`P${digits}`);
      }
    }

    const optionList = Array.from(searchOptions).slice(0, 10);

    const searchCollectionByFields = async (colRef: any, fields: string[]) => {
      for (const field of fields) {
        try {
          const snap = await getDocs(query(colRef, where(field, 'in', optionList), limit(1)));
          if (!snap.empty) {
            const row = snap.docs[0].data() as Record<string, unknown>;
            return { id: snap.docs[0].id, ...row } as AnyRecord;
          }
        } catch {
          // best-effort query, probeer volgende veld
        }
      }
      return null;
    };

    try {
      let foundDoc: AnyRecord | null = null;

      // 1. Actieve productie (Lotnummer)
      try {
        const trackingRef = collection(db, getPathString(PATHS.TRACKING));
        const match = await searchCollectionByFields(trackingRef, [
          'lotNumber',
          'orderId',
          'orderNumber',
          'Order',
          'originalOrderId',
          'itemCode',
          'productCode',
        ]);
        if (match) {
          foundDoc = { ...match, source: 'active' };
        } else {
          // Zoek ook in scoped items (collectionGroup)
          const itemsQueries = [
            getDocs(query(collectionGroup(db, 'items'), where('lotNumber', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'items'), where('orderId', 'in', optionList), limit(1)))
          ];
          const itemSnaps = await Promise.all(itemsQueries.map(p => p.catch(() => null)));
          for (const snap of itemSnaps) {
            if (snap && !snap.empty) {
              foundDoc = { id: snap.docs[0].id, ...snap.docs[0].data(), source: 'active_scoped' };
              break;
            }
          }
        }
      } catch (e) { console.warn(e); }

      // 2. Archief (Lotnummer / order) - meerdere jaren
      if (!foundDoc) {
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 4; year--) {
          try {
            const archiveRef = collection(db, getPathString(getArchiveItemsPath(year)));
            const match = await searchCollectionByFields(archiveRef, [
              'lotNumber',
              'orderId',
              'orderNumber',
              'Order',
              'originalOrderId',
              'itemCode',
              'productCode',
            ]);
            if (match) {
              foundDoc = { ...match, source: 'archive' };
              break;
            }
          } catch (e) {
            console.warn(e);
          }
        }
      }

      // 3. Fallback: Zoek in orders via collectionGroup
      if (!foundDoc) {
        try {
          const orderQueries = [
            getDocs(query(collectionGroup(db, 'orders'), where('orderId', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('orderNumber', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('Order', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('originalOrderId', 'in', optionList), limit(1))),
            getDocs(query(collectionGroup(db, 'orders'), where('itemCode', 'in', optionList), limit(1)))
          ];
          const snaps = await Promise.all(orderQueries.map(p => p.catch(() => null)));
          for (const snap of snaps) {
            if (snap && !snap.empty) {
              foundDoc = { id: snap.docs[0].id, ...snap.docs[0].data(), source: 'orders' };
              break;
            }
          }
        } catch (e) { console.warn(e); }
      }

      // 4. Fallback: Direct Document ID Lookup (Legacy BH18)
      if (!foundDoc) {
        const targetedPaths = [
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
          `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
          getPathString(PATHS.TEMP_PLANNING),
          getPathString(PATHS.PLANNING)
        ];
        for (const path of targetedPaths) {
          for (const option of optionList) {
            try {
              const docRef = doc(db, path, option);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                foundDoc = { id: docSnap.id, ...docSnap.data(), source: 'legacy_path' };
                break;
              }
            } catch (e) {
              console.warn(e);
            }
          }
          if (foundDoc) break;
        }
      }

      if (foundDoc) {
        setReprintResult(foundDoc);

        const lotCandidates = new Set<string>(
          [
            String((foundDoc as AnyRecord)?.lotNumber || ''),
            ...optionList,
          ]
            .map((v) => String(v || '').trim().toUpperCase())
            .filter(Boolean)
        );

        const orderCandidates = new Set<string>(
          [
            getOrderLabelOrder(foundDoc),
            String((foundDoc as AnyRecord)?.orderId || ''),
            String((foundDoc as AnyRecord)?.orderNumber || ''),
            String((foundDoc as AnyRecord)?.Order || ''),
            String((foundDoc as AnyRecord)?.originalOrderId || ''),
            ...optionList,
          ]
            .map((v) => String(v || '').trim().toUpperCase())
            .filter(Boolean)
        );

        const matchedQueueJob = [...printJobs]
          .filter((job) => {
            const content = String(job?.zpl || job?.printData || job?.labelZPL || '').trim();
            if (!content) return false;

            const metadata = (job?.metadata || {}) as AnyRecord;
            const lot = String(metadata?.lotNumber || '').trim().toUpperCase();
            const orderId = String(metadata?.orderId || '').trim().toUpperCase();
            const orderNumber = String(metadata?.orderNumber || '').trim().toUpperCase();
            const originalOrderId = String(metadata?.originalOrderId || '').trim().toUpperCase();
            const description = String(metadata?.description || job?.description || '').toUpperCase();

            if (lot && lotCandidates.has(lot)) return true;
            if (orderId && orderCandidates.has(orderId)) return true;
            if (orderNumber && orderCandidates.has(orderNumber)) return true;
            if (originalOrderId && orderCandidates.has(originalOrderId)) return true;

            return Array.from(new Set([...lotCandidates, ...orderCandidates]))
              .filter((token) => token.length >= 4)
              .some((token) => description.includes(token));
          })
          .sort((a, b) => getTimestampMillis(b?.createdAt) - getTimestampMillis(a?.createdAt))[0] || null;

        setExactReprintJob(matchedQueueJob);

        if (!matchedQueueJob) {
          setError('Product gevonden, maar geen eerdere queue-job met exacte printdata gevonden.');
        }
      } else {
        setError(`Order of Lotnummer '${searchStr}' niet gevonden.`);
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError("Fout bij zoeken: " + message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReprintLabel = async () => {
    if (!reprintResult || !usbDevice) {
      setError('Geen product gevonden of geen printer verbonden.');
      return;
    }

    if (!exactReprintJob) {
      setError('Geen eerdere queue-job met exacte printdata gevonden voor dit product.');
      return;
    }

    setIsProcessing(true);
    try {
      const basePayload = String(exactReprintJob.zpl || exactReprintJob.printData || exactReprintJob.labelZPL || '').trim();
      if (!basePayload) {
        throw new Error('De gevonden queue-job bevat geen printdata.');
      }

      const quantity = getJobQuantity(exactReprintJob) || 1;
      const payload = normalizeQueuePrintPayload(basePayload, quantity);

      await printRawUsb(usbDevice, payload);
      setReprintSearch('');
      setReprintResult(null);
      setExactReprintJob(null);
      notify(`Exacte kopie geprint (x${quantity}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError('Print fout: ' + message);
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-4">
            {viewMode === 'station' && (
              <button 
                onClick={() => { setViewMode('overview'); setSelectedStation(null); }}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-bold mb-1">{selectedStation ? `${t("printer.station", "Station")}: ${selectedStation}` : t("printer.printStations", "Print Stations")}</h1>
              <p className="text-slate-600 text-sm">{t("printer.managePrintJobsAndReprints", "Beheer printopdrachten en herprint labels.")}</p>
            </div>
          </div>
        </div>
        {isUsbDirectSupported() && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStationWizard(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 bg-white text-slate-600 border-slate-200 hover:border-blue-300"
            >
              <Settings2 size={16} /> {t('printStationView.printerWizardTitle', 'Print Station Wizard')}
            </button>
            {usbDevice && (
              <button
                onClick={() => setAutoPrint(!autoPrint)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                  autoPrint 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg animate-pulse' 
                    : 'bg-white text-slate-400 border-slate-200'
                }`}
                title="Print nieuwe opdrachten automatisch zodra ze binnenkomen"
              >
                <Zap size={16} fill={autoPrint ? "currentColor" : "none"} />
                {autoPrint ? "Auto-Print AAN" : "Auto-Print UIT"}
              </button>
            )}
            
            <button 
              onClick={handleConnectUsb}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all border-2 ${
                usbDevice ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              }`}
            >
              {usbDevice ? <Usb className="text-green-500" /> : <Usb />}
              {usbDevice ? `Verbonden: ${usbDevice.productName}` : 'Verbind USB Printer'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 bg-white border-2 border-slate-200 rounded-2xl p-4">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">
          {t('printStationView.printerWizardTitle', 'Print Station Wizard')}
        </p>
        {stationContext ? (
          <p className="text-sm font-bold text-slate-700">
            {String(stationContext)}: {activeStationBindingPrinterName || t('printStationView.noPrinterBound', 'Geen printer gekoppeld')}
          </p>
        ) : (
          <p className="text-sm text-slate-500">{t('printStationView.noStationsAvailable', 'Geen stations beschikbaar voor deze afdeling.')}</p>
        )}
      </div>
      
      {/* TEGELS VOOR OPERATORS (LOTNUMMERS & TIJDELIJKE LABELS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Tegel: Lotnummers Printen */}
        <button
          type="button"
          onClick={() => setShowLotModal(true)}
          className="flex items-center gap-4 bg-white border-2 border-slate-200 hover:border-blue-500 rounded-2xl p-4 transition-all hover:shadow-lg group text-left"
        >
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Printer size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Lotnummers Afdrukken
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Genereer en print een serie nieuwe FPI lotnummers
            </p>
          </div>
        </button>

        {/* Tegel: Tijdelijke Labels */}
        <button
          type="button"
          onClick={() => setShowTempModal(true)}
          className="flex items-center gap-4 bg-white border-2 border-slate-200 hover:border-emerald-500 rounded-2xl p-4 transition-all hover:shadow-lg group text-left"
        >
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Order Labels
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Print snelle labels voor onderhanden werk of afkeur
            </p>
          </div>
        </button>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2"><AlertTriangle size={20}/> {error}</div>}

      {viewMode === 'overview' ? (
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {stationGroups.map(station => {
            const pendingCount = printJobs.filter((j) => {
              if (!isQueuedJobStatus(j.status)) return false;
              const stationKey = normalizeStationKey(station);
              const jobStationKeys = getJobStationKeys(j);
              return jobStationKeys.includes(stationKey);
            }).length;
            
            return (
              <button 
                key={station} 
                onClick={() => { setSelectedStation(station); setViewMode('station'); }}
                className={`p-6 rounded-2xl border-2 transition-all text-left relative group hover:-translate-y-1 ${
                  pendingCount > 0 
                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100' 
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <Printer className={pendingCount > 0 ? "text-blue-600" : "text-slate-400"} size={24} />
                  </div>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-xl text-slate-800 mt-4 uppercase tracking-tight">{station}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{t("printer.printQueue", "Print Queue")}</p>
              </button>
            );
          })}
          
          {stationGroups.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 italic">
              Geen Queue Stations geconfigureerd. Stel ze in via Printer Beheer - Queue Stations.
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-right-4">
          {/* REPRINT SECTION */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
              <RotateCcw size={16} /> Label Herprinten / Beschadigd
            </h3>
            <div className="flex gap-4 items-start">
              <form onSubmit={handleSearchProduct} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={reprintSearch}
                    onChange={(e) => setReprintSearch(e.target.value.toUpperCase())}
                    placeholder={t("placeholders.scanOrTypeLot", "Scan of typ lotnummer...")}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-blue-500 outline-none font-bold uppercase"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="px-6 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">
                  {isSearching ? <Loader2 className="animate-spin" /> : "Zoek"}
                </button>
              </form>
            </div>

            {reprintResult && (
              <div className="mt-4 p-6 bg-white rounded-xl border border-blue-100 shadow-sm animate-in fade-in">
              <div className="flex-1">
                <h4 className="font-black text-lg text-slate-800 mb-2">{String(reprintResult.lotNumber || '')}</h4>
                <div className="space-y-1 text-sm text-slate-600">
                  <p><span className="font-bold text-slate-400 w-20 inline-block">{t("printer.item", "Item")}:</span> {getOrderLabelDescription(reprintResult)}</p>
                  <p><span className="font-bold text-slate-400 w-20 inline-block">{t("printer.code", "Code")}:</span> {getOrderLabelItemCode(reprintResult)}</p>
                  <p><span className="font-bold text-slate-400 w-20 inline-block">{t("printer.order", "Order")}:</span> {getOrderLabelOrder(reprintResult)}</p>
                </div>

                <div className="mt-4">
                  {exactReprintJob ? (
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">
                      Exacte queue-kopie gevonden: {String(exactReprintJob.id)} (x{getJobQuantity(exactReprintJob) || 1})
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                      Geen exacte queue-kopie gevonden voor deze zoekopdracht.
                    </p>
                  )}
                </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={handleReprintLabel}
                    disabled={!usbDevice || isProcessing || !exactReprintJob}
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-md"
                  >
                    <Printer size={14} className="inline mr-1" /> Exacte Kopie Printen
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QUEUE LIST */}
          <div>
      <h2 className="text-xl font-bold mb-3">{t("printer.printTasks", "Print Taken")}</h2>
      <div className="bg-white shadow-md rounded-lg overflow-auto max-h-[58vh]">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3">{t("printer.status", "Status")}</th>
              <th scope="col" className="px-6 py-3">{t("printer.description", "Beschrijving")}</th>
              <th scope="col" className="px-6 py-3">{t("printer.printer", "Printer")}</th>
              <th scope="col" className="px-6 py-3">{t("printer.requestedBy", "Aangevraagd door")}</th>
              <th scope="col" className="px-6 py-3">{t("printer.timestamp", "Tijdstip")}</th>
              <th scope="col" className="px-6 py-3">{t("printer.actions", "Acties")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center p-8"><Loader2 className="animate-spin inline-block" /></td></tr>}
            {!loading && filteredJobs.length === 0 && <tr><td colSpan={6} className="text-center p-8">{t("printer.queueEmptyForStations", "De wachtrij voor uw stations is leeg.")}</td></tr>}
            {filteredJobs.map(job => (
              <tr key={job.id} className="bg-white border-b hover:bg-slate-50">
                <td className="px-6 py-4">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {String(job.metadata?.description || job.description || '')}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {Boolean(job.metadata?.stationId) && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{String(job.metadata?.stationId)}</span>}
                    {getJobSizeLabel(job) && <span className="text-[10px] bg-blue-50 px-2 py-0.5 rounded text-blue-700 font-bold">{getJobSizeLabel(job)}</span>}
                    {getJobQuantity(job) && <span className="text-[10px] bg-emerald-50 px-2 py-0.5 rounded text-emerald-700 font-bold">{t("common.amount", "Aantal")}: {getJobQuantity(job)}</span>}
                    {Boolean(job.metadata?.queuedAsBatch) && (
                      <span className="text-[10px] bg-violet-50 px-2 py-0.5 rounded text-violet-700 font-bold">
                        Batch cut: {String(job.metadata?.cutMode || "last-only")}
                      </span>
                    )}
                  </div>
                  {job.status === 'error' && <p className="text-red-600 text-xs mt-1">{String(job.error || '')}</p>}
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-slate-600 text-xs">
                    {String(job.metadata?.targetPrinterName || job.printerId || 'Standaard')}
                  </span>
                </td>
                <td className="px-6 py-4">{String(job.metadata?.requesterEmail || job.createdBy || '')}</td>
                <td className="px-6 py-4">
                  {job.createdAt ? formatDistanceToNow((job.createdAt instanceof Date ? job.createdAt : job.createdAt.toDate?.()) || new Date(), { addSuffix: true, locale: nl }) : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {job.status === 'pending' && (
                      <>
                      <button onClick={() => setPreviewJob(job)} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-full" title={t("printer.viewLabel", "Bekijk Label")}>
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={async () => {
                          setIsProcessing(true);
                          try { await handlePrintJob(job); } 
                          catch(e) { setError(e instanceof Error ? e.message : String(e)); }
                          finally { setIsProcessing(false); }
                        }} 
                        disabled={!usbDevice || isProcessing || !canManage} 
                        className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
                        title={t("printer.printNow", "Nu Printen")}
                      >
                        <Play size={16} />
                      </button>
                      </>
                    )}
                    <button onClick={() => handleReprint(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-full disabled:opacity-50" title={t("printer.reprint", "Opnieuw printen")}>
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={!canManage} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded-full disabled:opacity-50" title={t("common.delete", "Verwijderen")}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          </div>
        </div>
      )}

      {/* ZPL Preview Modal voor Queue Items */}
      {previewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                     <div className="flex items-center gap-3">
                        <h3 className="font-bold text-slate-800">{t("printer.labelPreview", "Label Voorbeeld")}</h3>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{previewSizeLabel}</span>
                     </div>
                    <button onClick={() => setPreviewJob(null)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-8 flex justify-center items-center bg-slate-100 min-h-[300px] overflow-hidden">
                    {(() => {
                        // Controleer of de job gekoppeld is aan een bekende interne template
                        const template = labelTemplates.find((t) => t.id === previewJob.metadata?.templateId);
                        
                        if (template) {
                            return (
                                <div className="w-full max-w-sm flex justify-center bg-white shadow-xl border border-slate-200 p-2 rounded-lg">
                                    <AutoScaledLabelPreview 
                                        label={template} 
                                        data={(previewJob.metadata?.variables as Record<string, unknown>) || {}} 
                                      printerDpi={printerDpi}
                                      maxScale={1}
                                      exactBitmapPreview
                                    />
                                </div>
                            );
                        }
                        
                        // Fallback naar de externe Labelary API als het pure (legacy) ZPL is
                        return (
                            <img 
                                src={`https://api.labelary.com/v1/printers/8dpmm/labels/${previewSize}/0/${encodeURIComponent(previewJob.zpl || previewJob.printData || "")}`} 
                                alt="Label Preview" 
                                className="shadow-lg max-w-full border bg-white"
                            />
                        );
                    })()}
                </div>
                <div className="p-4 text-center text-xs text-slate-400">
                    {labelTemplates.some((t) => t.id === previewJob.metadata?.templateId) 
                        ? "Interne Visual Preview (AutoScaled)" 
                        : "Gegenereerd via Labelary API"}
                </div>
            </div>
        </div>
      )}

      {showTempModal && (
        <TempLabelModal
          onClose={() => setShowTempModal(false)}
          labelTemplates={labelTemplates}
          labelRules={labelRules}
          printerDpi={printerDpi}
          usbDevice={usbDevice}
          setUsbDevice={setUsbDevice}
          activeQueuePrinter={activeQueuePrinter}
          selectedStation={selectedStation}
        />
      )}

      {showLotModal && (
        <LotPrintModal onClose={() => setShowLotModal(false)} departmentGroups={departmentGroups} onPrintBatch={handleDirectLotPrintBatch} printer={activeQueuePrinter} />
      )}

      {showStationWizard && (
        <PrintStationWizardModal
          onClose={() => setShowStationWizard(false)}
          stations={allFactoryStations}
          printers={printers}
          selectedStation={stationContext || allFactoryStations[0] || ''}
          stationBindings={stationBindings}
          onSave={handleSaveStationBinding}
        />
      )}
    </div>
  );
};

export default PrintQueueAdminView;
