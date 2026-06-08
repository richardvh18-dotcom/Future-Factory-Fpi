import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowLeft,
  ArrowRight,
  ScanBarcode,
  Keyboard,
  Printer,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Tag,
  Save,
  Trash2,
} from "lucide-react";
import { db, logActivity } from "../../config/firebase";
import { getPathString, PATHS } from "../../config/dbPaths";
import { normalizeMachine } from "../../utils/hubHelpers";
import { rejectTrackedProductFinal, completeTrackedProduct, tempRejectTrackedProduct, markMazakLabelsPrinted, queuePrintJob } from "../../services/planningSecurityService";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useLabelPreview } from "../../hooks/useLabelPreview";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview";
import StatusBadge from "./common/StatusBadge";
import { getISOWeek, addWeeks, subWeeks } from "date-fns";
import { filterLabelsByProduct, processLabelData } from "../../utils/labelHelpers";
import { renderLabelToBitmapZpl } from "../../utils/unifiedLabelRenderEngine";
import { resolveLinkedTemplateChain } from "../../utils/orderLabelTemplateUtils";
import { useNotifications } from '../../contexts/NotificationContext';

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const DEFAULT_MAZAK_DPI = 300;
const clampFreeLabelFontSize = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(6, Math.min(75, parsed));
};

const FREE_TEXT_LABEL_TEMPLATE: LabelTemplate = {
  id: "MAZAK-FREE-TEXT-90x35",
  name: "Vrij tekst 90x35",
  width: 90,
  height: 35,
  elements: [
    { type: "box", x: 1, y: 1, width: 88, height: 33, thickness: 0.25 },
    { type: "text", x: 4, y: 4, width: 82, height: 27, fontSize: 10, isBold: true, content: "{freeText}", maxLines: 5 },
  ],
};

type TimestampLike = { toDate?: () => Date; seconds?: number };

type ProductItem = {
  id?: string;
  orderId?: string;
  lotNumber?: string;
  item?: string;
  itemCode?: string;
  productId?: string;
  extraCode?: string;
  seriesGroupId?: string;
  mazakLabelPrinted?: boolean;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  machine?: string;
  lastStation?: string;
  inspection?: { status?: string };
  createdAt?: TimestampLike | string | number | Date | null;
  updatedAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

type OccupancyEntry = {
  station?: string;
  machineId?: string;
  date?: TimestampLike | string | number | Date | null;
  shift?: string;
  operatorNumber?: string;
};

type PlanningOrder = {
  id?: string;
  orderId?: string;
  item?: string;
  itemCode?: string;
  machine?: string;
  plan?: number | string;
  productId?: string;
  extraCode?: string;
  lotNumber?: string;
  status?: string;
  week?: number | string;
  weekNumber?: number | string;
  year?: number | string;
  weekYear?: number | string;
  createdAt?: TimestampLike | string | number | Date | null;
  [key: string]: unknown;
};

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
  dpi?: number | string;
  isDefault?: boolean;
  linkedStations?: unknown[];
  queueStations?: unknown[];
  [key: string]: unknown;
};

type AdminUser = { uid?: string; email?: string | null };

type MazakViewProps = {
  stationId?: string;
  products?: ProductItem[];
};

type SeriesHeaderRow = {
  id: string;
  isSeriesHeader: true;
  seriesGroupId: string;
  orderId: string;
  seriesCount: number;
  seriesUnits: ProductItem[];
};

type DisplayRow = ProductItem | SeriesHeaderRow;

type SavedFreeLabelTemplate = {
  id: string;
  name: string;
  text: string;
  align: "left" | "center" | "right";
  fontSize: number;
  quantity: number;
  updatedAt?: number;
};

const isSeriesHeaderRow = (row: DisplayRow): row is SeriesHeaderRow =>
  (row as SeriesHeaderRow).isSeriesHeader === true;

const toMillisFromMixed = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as TimestampLike).toDate === "function") {
    const date = (value as TimestampLike).toDate?.();
    return date ? date.getTime() : 0;
  }
  if (typeof (value as TimestampLike).seconds === "number") {
    return Number((value as TimestampLike).seconds) * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isSeriesEligibleItem = (item: ProductItem) => {
  const statusUpper = String(item?.status || "").toUpperCase();
  const stepUpper = String(item?.currentStep || "").toUpperCase();
  return statusUpper !== "REJECTED" && stepUpper !== "REJECTED";
};

const getLotSeriesPrefix = (lotNumber: unknown) => {
  const raw = String(lotNumber || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(.*?)(\d{3})$/);
  if (!match) return "";
  return match[1];
};

const stationNameFromValue = (stationValue: unknown): string => {
  if (!stationValue) return "";
  if (typeof stationValue === "string") return stationValue.trim();
  if (typeof stationValue === "object") {
    const stationObj = stationValue as Record<string, unknown>;
    return String(
      stationObj.name || stationObj.station || stationObj.id || stationObj.code || ""
    ).trim();
  }
  return String(stationValue).trim();
};

const hasFlangeTag = (template: LabelTemplate): boolean => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || "").toUpperCase().trim())
    : [];
  return tags.includes("FLANGE");
};

const selectQueuePrinterForStation = (
  printers: PrinterConfig[],
  stationId: string
): PrinterConfig | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;
  const stationNorm = normalizeMachine(stationId || "");

  const stationMatched = printers.find((printer) => {
    const linkedStations = [
      ...(Array.isArray(printer?.queueStations) ? printer.queueStations : []),
      ...(Array.isArray(printer?.linkedStations) ? printer.linkedStations : []),
    ]
      .map(stationNameFromValue)
      .map((name) => normalizeMachine(name || ""))
      .filter(Boolean);

    return linkedStations.includes(stationNorm);
  });
  if (stationMatched) return stationMatched;

  const mazakByName = printers.find((printer) =>
    String(printer?.name || "").toUpperCase().includes("MAZAK")
  );
  if (mazakByName) return mazakByName;

  // Veilige fallback zodat printjobs nooit stil uitvallen door ontbrekende stationkoppeling.
  return printers.find((printer) => printer?.isDefault) || printers[0] || null;
};

const templateExtraCodeTokens = (template: LabelTemplate): string[] => {
  const candidates: unknown[] = [
    template?.extraCodes,
    template?.requiredExtraCodes,
    template?.applicableExtraCodes,
    template?.extraCode,
  ];

  const flattened: string[] = candidates.flatMap((value) => {
    if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim());
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  });

  return Array.from(new Set(flattened.map((entry) => entry.toUpperCase()).filter(Boolean)));
};

const extractQueuedJobId = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const row = value as Record<string, unknown>;
  const direct = String(row.jobId || row.id || "").trim();
  if (direct) return direct;

  const nested = row.data as Record<string, unknown> | undefined;
  return String(nested?.jobId || nested?.id || "").trim();
};

const MazakView = ({ stationId = "Mazak", products = [] }: MazakViewProps) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth() as { user: AdminUser | null };
  const { notify } = useNotifications();
  const [items, setItems] = useState<ProductItem[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [scanInputInbox, setScanInputInbox] = useState("");
  const [scanInputProcess, setScanInputProcess] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const selectedProductRef = useRef<ProductItem | null>(null);

  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox' of 'process'
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [bulkSeriesProducts, setBulkSeriesProducts] = useState<ProductItem[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<LabelTemplate[]>([]);
  const [availablePrinters, setAvailablePrinters] = useState<PrinterConfig[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [printing, setPrinting] = useState(false);
  const [freeLabelText, setFreeLabelText] = useState("");
  const [freeLabelQuantity, setFreeLabelQuantity] = useState(1);
  const [freeLabelAlign, setFreeLabelAlign] = useState<"left" | "center" | "right">("left");
  const [freeLabelFontSize, setFreeLabelFontSize] = useState<number>(12);
  const [freeLabelTemplateName, setFreeLabelTemplateName] = useState("");
  const [savedFreeLabelTemplates, setSavedFreeLabelTemplates] = useState<SavedFreeLabelTemplate[]>([]);
  const [selectedFreeTemplateId, setSelectedFreeTemplateId] = useState("");
  const [savingFreeTemplate, setSavingFreeTemplate] = useState(false);
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);
  const [selectedPlanningOrder, setSelectedPlanningOrder] = useState<PlanningOrder | null>(null);
  const [planningSearch, setPlanningSearch] = useState("");
  const [showAllWeeks, setShowAllWeeks] = useState(true);
  const [referenceDate, setReferenceDate] = useState(new Date());
  const activeScanInput = activeTab === "process" ? scanInputProcess : scanInputInbox;

  const setActiveScanInput = (value: string) => {
    if (activeTab === "process") {
      setScanInputProcess(value);
      return;
    }
    setScanInputInbox(value);
  };

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    if (!scannerMode) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) return;
      if (!showActionModal && activeTab !== "planning") {
        scanInputRef.current?.focus();
      }
    };

    scanInputRef.current?.focus();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showActionModal, scannerMode]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.OCCUPANCY)), (snap) => {
      const data: OccupancyEntry[] = snap.docs.map((docSnap) => docSnap.data() as OccupancyEntry);
      setOccupancy(data);
    });
    return () => unsub();
  }, []);

  const isShiftActive = useCallback((shiftLabel: unknown) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const label = String(shiftLabel || "").toUpperCase();

    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return currentTime >= 5 * 60 + 30 && currentTime < 14 * 60;
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return currentTime >= 14 * 60 && currentTime < 22 * 60 + 30;
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return currentTime >= 22 * 60 + 30 || currentTime < 5 * 60 + 30;
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return currentTime >= 7 * 60 + 15 && currentTime < 16 * 60;
    }
    return true;
  }, []);

  const activeOperators = useMemo<string[]>(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy
      .filter((occ: OccupancyEntry) => {
        const occStation = normalizeMachine(occ.station || occ.machineId || "");
        if (occStation !== currentStation) return false;
        const dateMillis = toMillisFromMixed(occ.date);
        if (!dateMillis) return false;
        const occDate = new Date(dateMillis);
        occDate.setHours(0, 0, 0, 0);
        return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
      })
      .map((entry: OccupancyEntry) => entry.operatorNumber)
      .filter((value): value is string => Boolean(value));
  }, [occupancy, stationId, isShiftActive]);

  useEffect(() => {
    const planningQuery = query(
      collection(db, getPathString(PATHS.PLANNING)),
      where("status", "not-in", ["completed", "shipped", "deleted", "cancelled"])
    );
    const unsubPlanning = onSnapshot(planningQuery, (snap) => {
      const orders: PlanningOrder[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlanningOrder, "id">) }));
      const flOrders = orders.filter((o: PlanningOrder) => {
         const itemStr = String(o.item || "").toUpperCase();
         const codeStr = String(o.itemCode || o.productId || o.extraCode || "").toUpperCase();
         return itemStr.includes("FL") || codeStr.includes("FL");
      });
      setPlanningOrders(flOrders);
    });
    return () => unsubPlanning();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.LABEL_TEMPLATES)), (snap) => {
      const templates: LabelTemplate[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LabelTemplate, "id">) }));
      setAvailableLabels(templates);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.PRINTERS)), (snap) => {
      const printers: PrinterConfig[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PrinterConfig, "id">) }))
        .filter((printer) => Boolean(printer?.id));
      setAvailablePrinters(printers);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
    const unsub = onSnapshot(settingsRef, (snap) => {
      const rawList = (snap.data() as Record<string, unknown> | undefined)?.mazakFreeLabelTemplates;
      const list = Array.isArray(rawList) ? rawList : [];
      const normalized: SavedFreeLabelTemplate[] = list
        .map((entry) => {
          const row = (entry || {}) as Record<string, unknown>;
          const alignRaw = String(row.align || "left").toLowerCase();
          const align = alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
          const id = String(row.id || "").trim();
          const name = String(row.name || "").trim();
          const text = String(row.text || "");
          const quantity = Math.max(1, Math.min(50, Number.parseInt(String(row.quantity || "1"), 10) || 1));
          const fontSize = clampFreeLabelFontSize(row.fontSize);
          const updatedAt = Number.parseInt(String(row.updatedAt || "0"), 10) || Date.now();
          if (!id || !name) return null;
          return { id, name, text, align, quantity, fontSize, updatedAt } as SavedFreeLabelTemplate;
        })
        .filter((row): row is SavedFreeLabelTemplate => Boolean(row))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      setSavedFreeLabelTemplates(normalized);
      if (normalized.length === 0) {
        setSelectedFreeTemplateId("");
      } else if (selectedFreeTemplateId && !normalized.some((tpl) => tpl.id === selectedFreeTemplateId)) {
        setSelectedFreeTemplateId("");
      }
    });

    return () => unsub();
  }, [selectedFreeTemplateId]);

  const filteredLabels = useMemo<LabelTemplate[]>(() => {
    if (!selectedProduct) return [];

    const productFiltered = filterLabelsByProduct(availableLabels as any, selectedProduct as any, {
      excludeTempOrderLabels: true,
    }) as LabelTemplate[];

    const flangeOnly = productFiltered.filter((template) => hasFlangeTag(template));
    const isReprintMode = activeTab === "process";

    // Herprint moet altijd mogelijk blijven voor Flange-items,
    // ook als extraCode op template/product niet (meer) exact matcht.
    if (isReprintMode) {
      return flangeOnly;
    }

    const productExtraCode = String(selectedProduct?.extraCode || "").trim().toUpperCase();

    // Voorbereiding voor fijnmazige extraCode-matching: templates zonder extraCode-beperking blijven zichtbaar.
    return flangeOnly.filter((template) => {
      const templateCodes = templateExtraCodeTokens(template);
      if (templateCodes.length === 0) return true;
      if (!productExtraCode) return false;
      return templateCodes.includes(productExtraCode);
    });
  }, [availableLabels, selectedProduct, activeTab]);

  useEffect(() => {
    if (!selectedLabelId) return;
    const stillAvailable = filteredLabels.some((label) => String(label.id) === String(selectedLabelId));
    if (!stillAvailable) {
      setSelectedLabelId("");
    }
  }, [filteredLabels, selectedLabelId]);

  const selectedQueuePrinter = useMemo<PrinterConfig | null>(() => {
    return selectQueuePrinterForStation(availablePrinters, stationId || "");
  }, [availablePrinters, stationId]);

  const mazakPrinterDpi = useMemo<number>(() => {
    const parsed = Number.parseInt(String(selectedQueuePrinter?.dpi ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAZAK_DPI;
  }, [selectedQueuePrinter]);

  const previewProductData = useMemo(() => {
    if (!selectedProduct) return null;
    return {
      ...selectedProduct,
      orderNumber: selectedProduct.orderId || selectedProduct.orderNumber,
      productId: selectedProduct.itemCode || selectedProduct.productId,
      description: selectedProduct.item || selectedProduct.description,
    } as Record<string, unknown>;
  }, [selectedProduct]);

  const { previewData: mazakPreviewData } = useLabelPreview(
    previewProductData as Record<string, unknown> | null,
    selectedLabelId
  );

  const freeLabelTemplate = useMemo<LabelTemplate>(() => {
    return {
      ...FREE_TEXT_LABEL_TEMPLATE,
      elements: (FREE_TEXT_LABEL_TEMPLATE.elements || []).map((element) => {
        if (element.type !== "text") return element;
        return {
          ...element,
          align: freeLabelAlign,
          fontSize: freeLabelFontSize,
        };
      }),
    };
  }, [freeLabelAlign, freeLabelFontSize]);

  useEffect(() => {
    if (showPrintModal && filteredLabels.length > 0) {
      // In Mazak tonen we alleen flens-labels; kies daarbinnen een logische default.
      const preferred = filteredLabels.find((t: LabelTemplate) => 
        t.tags?.includes("FLENZEN") ||
        t.tags?.includes("FLENS") ||
        t.tags?.includes("FLANGE")
      );
      if (preferred) setSelectedLabelId(String(preferred.id || ""));
      else setSelectedLabelId(String(filteredLabels[0]?.id || ""));
    }
  }, [showPrintModal, filteredLabels]);

  useEffect(() => {
    if (!stationId) return;

    const processData = (sourceData: ProductItem[]) => {
      const filtered = sourceData
        .filter((item: ProductItem) => {
          const stepUpper = String(item.currentStep || "").toUpperCase().trim();
          const statusUpper = String(item.status || "").toUpperCase().trim();
          const inspectionStatus = String(item.inspection?.status || "").toUpperCase().trim();

          if (
            inspectionStatus === "TIJDELIJKE AFKEUR" ||
            inspectionStatus === "AFKEUR" ||
            statusUpper === "REJECTED" ||
            statusUpper === "AFKEUR" ||
            stepUpper === "REJECTED" ||
            stepUpper === "HOLD_AREA"
          ) {
            return false;
          }

          const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
          const stepNorm = String(stepUpper).replace(/\s/g, "");
          const statusNorm = String(statusUpper).replace(/\s/g, "");

          return (
            itemStationNorm === "MAZAK" ||
            stepNorm === "MAZAK" ||
            statusNorm.includes("MAZAK")
          );
        })
        .sort((a, b) => {
          const timeA = toMillisFromMixed(a.updatedAt || a.createdAt || 0);
          const timeB = toMillisFromMixed(b.updatedAt || b.createdAt || 0);
          return timeB - timeA;
        });

      setItems(filtered);
      setLoading(false);
    };

    if (products && products.length > 0) {
      processData(products);
      setLoading(false);

      const unsub = subscribeTrackedProducts({
        db,
        statusExclusions: ["completed", "shipped", "deleted"],
        onData: (nextItems: ProductItem[]) => {
          processData(nextItems);
        },
        onError: () => setLoading(false),
      });
      return () => unsub();
    }

    const unsub = subscribeTrackedProducts({
      db,
      statusExclusions: ["completed", "shipped", "deleted"],
      onData: (nextItems: ProductItem[]) => {
        processData(nextItems);
      },
      onError: () => setLoading(false),
    });
    return () => unsub();
  }, [stationId, products]);

  const inboxItems = useMemo(() => items.filter((i: ProductItem) => !i.mazakLabelPrinted), [items]);
  const processItems = useMemo(() => items.filter((i: ProductItem) => i.mazakLabelPrinted), [items]);
  const isBulkInboxMode = activeTab === "inbox" && bulkSeriesProducts.length > 1;
  const selectedTemplateChain = useMemo<LabelTemplate[]>(() => {
    if (!selectedLabelId) return [];
    const chain = resolveLinkedTemplateChain(availableLabels as any[], selectedLabelId, { maxDepth: 4 }) as LabelTemplate[];
    return chain.filter((template) => hasFlangeTag(template));
  }, [availableLabels, selectedLabelId]);
  const effectiveTemplateChain = selectedTemplateChain.length > 0
    ? selectedTemplateChain
    : ((selectedLabelId ? filteredLabels.filter((t) => String(t.id) === String(selectedLabelId)) : []) as LabelTemplate[]);
  const labelsPerItem = Math.max(1, effectiveTemplateChain.length);
  const itemPrintCount = isBulkInboxMode ? bulkSeriesProducts.length : 1;
  const totalLabelCount = itemPrintCount * labelsPerItem;

  useEffect(() => {
    if (activeTab !== "inbox" && bulkSeriesProducts.length > 0) {
      setBulkSeriesProducts([]);
    }
  }, [activeTab, bulkSeriesProducts.length]);

  const groupedSeries = useMemo(() => {
    const grouped = new Map<string, ProductItem[]>();
    inboxItems.forEach((item: ProductItem) => {
      const groupId = item?.seriesGroupId;
      if (!groupId) return;
      const current = grouped.get(groupId) || [];
      current.push(item);
      grouped.set(groupId, current);
    });
    return grouped;
  }, [inboxItems]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      groupedSeries.forEach((group: ProductItem[], groupId: string) => {
        if (group.length <= 1) return;
        if (!(groupId in next)) next[groupId] = true;
      });
      Object.keys(next).forEach((groupId) => {
        const group = groupedSeries.get(groupId);
        if (!group || group.length <= 1) delete next[groupId];
      });
      return next;
    });
  }, [groupedSeries]);

  const displayRows = useMemo(() => {
    const rendered = new Set<string>();
    const rows: Array<ProductItem | { id: string; isSeriesHeader: boolean; seriesGroupId: string; orderId: string; seriesCount: number; seriesUnits: ProductItem[] }> = [];

    inboxItems.forEach((item: ProductItem) => {
      const groupId = item?.seriesGroupId;
      const group = groupId ? groupedSeries.get(groupId) || [] : [];
      const isSeriesGroup = groupId && group.length > 1;

      if (isSeriesGroup && !rendered.has(groupId)) {
        rows.push({
          id: `series_header_${groupId}`,
          isSeriesHeader: true,
          seriesGroupId: groupId,
          orderId: group[0]?.orderId || item?.orderId || "-",
          seriesCount: group.length,
          seriesUnits: group,
        });
        rendered.add(groupId);
      }

      if (!isSeriesGroup || !collapsedGroups[groupId]) {
        rows.push(item);
      }
    });

    return rows;
  }, [inboxItems, groupedSeries, collapsedGroups]);

  const filteredPlanningOrders = useMemo(() => {
    let result: PlanningOrder[] = [...planningOrders];

    if (!showAllWeeks) {
      const targetWeek = getISOWeek(referenceDate);
      const targetYear = referenceDate.getFullYear();
      result = result.filter((o: PlanningOrder) => {
         const orderWeek = Number(o.week || o.weekNumber);
         const orderYear = Number(o.year || o.weekYear || targetYear);
         return orderWeek === targetWeek && orderYear === targetYear;
      });
    }

    if (planningSearch) {
      const term = planningSearch.toLowerCase().trim();
      result = result.filter((o: PlanningOrder) => {
         const searchStr = `${o.orderId || ''} ${o.item || ''} ${o.itemCode || ''} ${o.lotNumber || ''}`.toLowerCase();
         return searchStr.includes(term);
      });
    }

    result.sort((a, b) => {
      const aActive = a.status === 'in_progress' || a.status === 'In Production';
      const bActive = b.status === 'in_progress' || b.status === 'In Production';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const yearA = Number(a.year || a.weekYear || 0);
      const yearB = Number(b.year || b.weekYear || 0);
      if (yearA !== yearB) return yearA - yearB;

      const weekA = Number(a.week || a.weekNumber || 0);
      const weekB = Number(b.week || b.weekNumber || 0);
      if (weekA !== weekB) return weekA - weekB;

      return toMillisFromMixed(b.createdAt || 0) - toMillisFromMixed(a.createdAt || 0);
    });

    return result;
  }, [planningOrders, showAllWeeks, referenceDate, planningSearch]);

  const handleItemClick = (item: ProductItem) => {
    let sameSeries: ProductItem[] = [];

    if (activeTab === "inbox" && item.seriesGroupId) {
      sameSeries = inboxItems.filter(
        (seriesItem) =>
          seriesItem.seriesGroupId === item.seriesGroupId && isSeriesEligibleItem(seriesItem)
      );
    }

    // Fallback voor legacy records zonder seriesGroupId: groepeer op lot-prefix + order/item.
    if (activeTab === "inbox" && sameSeries.length <= 1) {
      const lotPrefix = getLotSeriesPrefix(item?.lotNumber);
      const orderKey = String(item?.orderId || "").trim().toUpperCase();
      const itemCodeKey = String(item?.itemCode || "").trim().toUpperCase();

      if (lotPrefix) {
        sameSeries = inboxItems.filter((seriesItem: ProductItem) => {
          if (!isSeriesEligibleItem(seriesItem)) return false;

          const candidatePrefix = getLotSeriesPrefix(seriesItem?.lotNumber);
          if (!candidatePrefix || candidatePrefix !== lotPrefix) return false;

          const candidateOrder = String(seriesItem?.orderId || "").trim().toUpperCase();
          if (orderKey && candidateOrder && candidateOrder !== orderKey) return false;

          const candidateItemCode = String(seriesItem?.itemCode || "").trim().toUpperCase();
          if (itemCodeKey && candidateItemCode && candidateItemCode !== itemCodeKey) return false;

          return true;
        });
      }
    }

    setBulkSeriesProducts(sameSeries.length > 1 ? sameSeries : []);
    setSelectedProduct(item);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setBulkSeriesProducts([]);
    setShowActionModal(false);
  };

  const handleOpenActionModal = () => {
    if (!selectedProduct) return;
    setShowActionModal(true);
  };

  const resolveQueuePrinterForPrint = useCallback(async (): Promise<PrinterConfig> => {
    if (selectedQueuePrinter?.id) return selectedQueuePrinter;

    if (availablePrinters.length > 0) {
      const fromState = selectQueuePrinterForStation(availablePrinters, stationId || "");
      if (fromState?.id) return fromState;
    }

    const fetchedSnap = await getDocs(collection(db, getPathString(PATHS.PRINTERS)));
    const fetchedPrinters: PrinterConfig[] = fetchedSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrinterConfig, "id">) }))
      .filter((printer) => Boolean(printer?.id));

    if (fetchedPrinters.length > 0) {
      setAvailablePrinters(fetchedPrinters);
      const fromFetch = selectQueuePrinterForStation(fetchedPrinters, stationId || "");
      if (fromFetch?.id) return fromFetch;
    }

    throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
  }, [selectedQueuePrinter, availablePrinters, stationId]);

  const handlePrintLabels = async () => {
    if (!selectedProduct || !selectedLabelId) return;

    setPrinting(true);
    
    try {
      const isReprint = activeTab === "process";
      const itemsToPrint = isBulkInboxMode ? bulkSeriesProducts : [selectedProduct];
      const templatesToPrint = effectiveTemplateChain;
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      const queuedJobIds: string[] = [];

      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      if (templatesToPrint.length === 0) {
        throw new Error("Geen geldig template geselecteerd.");
      }

      for (const item of itemsToPrint) {
        const processedData = processLabelData(item);

        for (let idx = 0; idx < templatesToPrint.length; idx++) {
          const templateToUse = templatesToPrint[idx];
          const zplCode = await renderLabelToBitmapZpl({
            template: templateToUse as any,
            data: processedData as any,
            printerDpi: mazakPrinterDpi,
            darkness: 15,
            printSpeed: 3,
            widthMm: Number((templateToUse as any)?.width) || 90,
            heightMm: Number((templateToUse as any)?.height) || 40,
          });

          if (!String(zplCode || "").trim()) {
            throw new Error(`Lege ZPL gegenereerd voor template ${String(templateToUse?.name || templateToUse?.id || "onbekend")}.`);
          }

          const queuedJobId = await queuePrintJob(
            queuePrinterId,
            zplCode,
            {
              description: `${isReprint ? "Mazak Herprint" : "Mazak Print"} ${String(item?.orderId || "-")} (${String(item?.lotNumber || "-")})`,
              templateId: String(templateToUse?.id || selectedLabelId),
              templateName: templateToUse?.name || "Mazak Label",
              stationId: queueStationId,
              targetStation: queueStationId,
              targetPrinterName: queuePrinter?.name || queueStationId,
              orderId: item?.orderId,
              lotNumber: item?.lotNumber,
              isReprint,
              linkedSequenceIndex: idx + 1,
              linkedSequenceTotal: templatesToPrint.length,
              linkedRootTemplateId: String(selectedLabelId || ""),
            }
          );

          const normalizedJobId = extractQueuedJobId(queuedJobId);
          if (!normalizedJobId) {
            throw new Error("Queue response bevat geen geldig jobId.");
          }

          const rootJobRef = doc(db, getPathString(PATHS.PRINT_QUEUE), normalizedJobId);
          const rootJobSnap = await getDoc(rootJobRef);
          if (!rootJobSnap.exists()) {
            throw new Error(`Queue job niet gevonden na aanmaak (jobId: ${normalizedJobId}).`);
          }

          queuedJobIds.push(normalizedJobId);
        }
      }

      await markMazakLabelsPrinted({
        productIds: itemsToPrint.map((item) => item.id || item.lotNumber).filter(Boolean),
        stationId,
        isReprint,
        source: "MazakView",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        isReprint ? "REPRINT_LABELS" : "PRINT_LABELS",
        `Mazak: ${totalLabelCount} label(s) naar queue gestuurd voor ${selectedProduct.orderId} (Herprint: ${isReprint})`
      );

      setShowPrintModal(false);
      if (!isReprint) {
        setSelectedProduct(null);
        setBulkSeriesProducts([]);
        setActiveTab("process"); // Spring direct naar gereedmelden
      }
      notify(
        `${t(
          "mazak.labels_queued_success",
          "{{count}} label(s) succesvol naar de print wachtrij verstuurd!",
          { count: totalLabelCount }
        )}${queuedJobIds[0] ? ` (job: ${queuedJobIds[0]})` : ""}`
      );
    } catch (err) {
      console.error("Fout bij printen:", err);
      const message = err instanceof Error ? err.message : String(err || "Onbekende fout");
      notify(`${t("mazak.print_error", "Er is een fout opgetreden bij het printen.")}: ${message}`);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintFreeLabels = async () => {
    const normalizedFreeText = freeLabelText.trim();
    const quantity = Math.max(1, Math.min(50, Number(freeLabelQuantity) || 1));
    const normalizedFontSize = clampFreeLabelFontSize(freeLabelFontSize);

    if (!normalizedFreeText) {
      notify(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }

    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      const zplCode = await renderLabelToBitmapZpl({
        template: freeLabelTemplate as any,
        data: { freeText: normalizedFreeText } as any,
        printerDpi: mazakPrinterDpi,
        darkness: 15,
        printSpeed: 3,
        widthMm: 90,
        heightMm: 35,
      });

      await Promise.all(
        Array.from({ length: quantity }, () =>
          queuePrintJob(queuePrinterId, zplCode, {
            description: `Mazak Vrij Label (${String(queueStationId)})`,
            templateId: FREE_TEXT_LABEL_TEMPLATE.id,
            templateName: FREE_TEXT_LABEL_TEMPLATE.name || "Vrij label 90x35",
            stationId: queueStationId,
            targetStation: queueStationId,
            targetPrinterName: queuePrinter?.name || queueStationId,
            isReprint: false,
            isFreeLabel: true,
            freeLabelText: normalizedFreeText,
            freeLabelAlign,
            freeLabelFontSize: normalizedFontSize,
            freeLabelTemplateId: selectedFreeTemplateId || undefined,
            freeLabelTemplateName: freeLabelTemplateName.trim() || undefined,
          })
        )
      );

      await logActivity(
        user?.uid || "system",
        "PRINT_FREE_LABELS",
        `Mazak: ${quantity} vrije label(s) 90x35 naar queue gestuurd (align: ${freeLabelAlign}, font: ${normalizedFontSize})`
      );

      notify(
        t(
          "mazak.free_labels_queued_success",
          "{{count}} vrije label(s) (90x35) naar de print wachtrij verstuurd!",
          { count: quantity }
        )
      );
    } catch (err) {
      console.error("Fout bij printen vrije labels:", err);
      const message = err instanceof Error ? err.message : String(err || "Onbekende fout");
      notify(`${t("mazak.print_error", "Er is een fout opgetreden bij het printen.")}: ${message}`);
    } finally {
      setPrinting(false);
    }
  };

  const handleApplyFreeLabelTemplate = (template: SavedFreeLabelTemplate) => {
    setSelectedFreeTemplateId(template.id);
    setFreeLabelTemplateName(template.name);
    setFreeLabelText(template.text || "");
    setFreeLabelAlign(template.align || "left");
    setFreeLabelFontSize(clampFreeLabelFontSize(template.fontSize));
    setFreeLabelQuantity(Math.max(1, Math.min(50, Number(template.quantity) || 1)));
  };

  const handleSaveFreeLabelTemplate = async () => {
    const name = freeLabelTemplateName.trim();
    const text = freeLabelText.trim();
    if (!name) {
      notify(t("mazak.free_label_template_name_required", "Geef de template een naam."));
      return;
    }
    if (!text) {
      notify(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }

    const now = Date.now();
    const selected = savedFreeLabelTemplates.find((tpl) => tpl.id === selectedFreeTemplateId);
    const shouldUpdateExisting = Boolean(selected && selected.name.toLowerCase() === name.toLowerCase());
    const nextTemplate: SavedFreeLabelTemplate = {
      id: shouldUpdateExisting ? String(selected?.id) : `mazak-free-${now}`,
      name,
      text,
      align: freeLabelAlign,
      fontSize: clampFreeLabelFontSize(freeLabelFontSize),
      quantity: Math.max(1, Math.min(50, Number(freeLabelQuantity) || 1)),
      updatedAt: now,
    };

    const nextList = shouldUpdateExisting
      ? savedFreeLabelTemplates.map((tpl) => (tpl.id === nextTemplate.id ? nextTemplate : tpl))
      : [nextTemplate, ...savedFreeLabelTemplates.filter((tpl) => tpl.name.toLowerCase() !== name.toLowerCase())];

    setSavingFreeTemplate(true);
    try {
      await setDoc(
        doc(db, getPathString(PATHS.GENERAL_SETTINGS)),
        { mazakFreeLabelTemplates: nextList },
        { merge: true }
      );
      setSelectedFreeTemplateId(nextTemplate.id);
      notify(t("mazak.free_label_template_saved", "Vrij-label template opgeslagen."));
    } catch (err) {
      console.error("Fout bij opslaan vrije-label template:", err);
      notify(t("mazak.free_label_template_save_error", "Opslaan van template is mislukt."));
    } finally {
      setSavingFreeTemplate(false);
    }
  };

  const handleDeleteFreeLabelTemplate = async (templateId: string) => {
    const nextList = savedFreeLabelTemplates.filter((tpl) => tpl.id !== templateId);
    try {
      await setDoc(
        doc(db, getPathString(PATHS.GENERAL_SETTINGS)),
        { mazakFreeLabelTemplates: nextList },
        { merge: true }
      );
      if (selectedFreeTemplateId === templateId) {
        setSelectedFreeTemplateId("");
      }
      notify(t("mazak.free_label_template_deleted", "Vrij-label template verwijderd."));
    } catch (err) {
      console.error("Fout bij verwijderen vrije-label template:", err);
      notify(t("mazak.free_label_template_delete_error", "Verwijderen van template is mislukt."));
    }
  };

  const handleManualPrintForward = async () => {
    if (!selectedProduct) return;

    const itemsToForward = isBulkInboxMode ? bulkSeriesProducts : [selectedProduct];
    if (!itemsToForward.length) return;

    setPrinting(true);
    try {
      await markMazakLabelsPrinted({
        productIds: itemsToForward.map((item) => item.id || item.lotNumber).filter(Boolean),
        stationId,
        isReprint: false,
        source: "MazakView:manual-forward",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "MARK_MAZAK_LABELS_MANUAL",
        `Mazak: ${itemsToForward.length} lot(s) handmatig gelabeld en doorgestuurd voor ${selectedProduct.orderId || "onbekend"}`
      );

      setSelectedProduct(null);
      setBulkSeriesProducts([]);
      setActiveTab("process");

      notify(
        t(
          "mazak.manual_labels_forwarded",
          "{{count}} lot(s) handmatig gelabeld en doorgestuurd naar Gereedmelden.",
          { count: itemsToForward.length }
        )
      );
    } catch (err) {
      console.error("Fout bij handmatig labelen/doorgaan:", err);
      notify(t("mazak.manual_label_forward_error", "Handmatig labelen/doorgaan is mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePostProcessingFinish = async (status: string, data: { note?: string; reasons?: string[] }, productOverride: ProductItem | null = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;
    const productId = product.id || product.lotNumber;

    try {
      if (status === "completed") {
        await completeTrackedProduct({
          productId,
          finishType: "forward",
          fromStation: stationId,
          note: data.note || "",
          actorLabel: user?.email,
          source: "MazakView",
        });
        setActiveTab("process");
        notify(t("mazak.process_success", "Lot {{lot}} is succesvol doorgestuurd.", { lot: product.lotNumber || productId }));
        if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
        }
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "MazakView",
          actorLabel: user?.email,
        });
        setActiveTab("process");
        notify(t("mazak.reject_success", "Lot {{lot}} is definitief afgekeurd.", { lot: product.lotNumber || productId }));
        if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
        }
        return;
      }

      await tempRejectTrackedProduct({
        productId,
        reasons: data.reasons || [],
        note: data.note || "",
        station: stationId,
        actorLabel: user?.email || "Operator",
        source: "MazakView",
      });
      await logActivity(
        user?.uid || "system",
        "QUALITY_TEMP_REJECT",
        `Mazak afhandeling: lot ${product.lotNumber || product.id}, status temp_reject`
      );

      setActiveTab("process");
      notify(t("mazak.temp_reject_success", "Lot {{lot}} is op tijdelijke afkeur gezet.", { lot: product.lotNumber || productId }));

      if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
        handleCloseModal();
      }
    } catch (error) {
      console.error("Fout bij Mazak afronden:", error);
      notify(t("mazak.process_error", "Verwerken is mislukt. Probeer opnieuw."));
    }
  };

  const handleScan = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    const code = activeScanInput.trim().toUpperCase();
    if (!code) return;

    if (activeTab === "planning" || activeTab === "free") {
      setActiveScanInput("");
      return;
    }

    if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
      if (activeTab === "inbox") {
        notify(t("mazak.must_print_before_approve", "Dit item moet eerst geprint worden voordat het goedgekeurd kan worden."));
        setActiveScanInput("");
        return;
      }
      setActiveScanInput("");
      await handlePostProcessingFinish("completed", { note: "Goedgekeurd via QR Scan" }, selectedProduct);
      return;
    }

    const listToSearch = activeTab === "inbox" ? inboxItems : processItems;
    const found = listToSearch.find(
      (item) =>
        String(item.lotNumber || "").toLowerCase() === code.toLowerCase() ||
        String(item.orderId || "").toLowerCase() === code.toLowerCase()
    );

    if (found) {
      handleItemClick(found);
      setActiveScanInput("");
      if (activeTab === "process") {
        setTimeout(() => {
          setShowActionModal(true);
        }, 0);
      }
    } else {
      notify(t("lossen.item_not_found", "Item {{code}} niet gevonden", { code }));
      setActiveScanInput("");
      setSelectedProduct(null);
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  if (loading) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const renderItem = (item: ProductItem) => (
    <div
      key={item.id}
      onClick={() => handleItemClick(item)}
      className={`bg-white border-2 rounded-[35px] p-6 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer ${selectedProduct?.id === item.id ? "border-blue-400 ring-4 ring-blue-200" : "border-slate-100"}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="text-left">
          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
            {t("lossen.lot_number")}
          </span>
          <span className="font-black text-slate-900 text-lg tracking-tighter italic">
            {item.lotNumber}
          </span>
          <p className="text-xs font-bold text-slate-600 mt-1">
            {item.item}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${activeTab === "inbox" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
          {activeTab === "inbox" ? t("mazak.print_badge", "Printen") : t("mazak.complete_badge", "Gereedmelden")}
        </div>
      </div>
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
          {t("lossen.manufactured_item")}
        </p>
        <p className="text-xs font-mono font-bold text-slate-700 truncate">
          {item.itemCode}
        </p>
        {item.lastStation && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
            <History size={10} className="text-blue-500" />
            <span className="text-[8px] font-black text-slate-500 uppercase italic">
              {t("mazak.from_station", "Van")}: {item.lastStation}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const currentList = activeTab === "inbox" ? inboxItems : activeTab === "process" ? processItems : activeTab === "planning" ? filteredPlanningOrders : [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      
      <div className="p-2 bg-slate-50 border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex justify-center overflow-x-auto">
          <div className="flex bg-slate-200 p-1 rounded-2xl w-full max-w-2xl min-w-[320px]">
            <button 
              onClick={() => { setActiveTab("planning"); setSelectedProduct(null); setSelectedPlanningOrder(null); setBulkSeriesProducts([]); }}
              className={`flex-1 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Planning
            </button>
            <button 
              onClick={() => { setActiveTab("inbox"); setSelectedProduct(null); setSelectedPlanningOrder(null); setBulkSeriesProducts([]); }}
              className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "inbox" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("mazak.tab_inbox", "Inbox / Printen")}
            </button>
            <button 
              onClick={() => { setActiveTab("process"); setSelectedProduct(null); setSelectedPlanningOrder(null); setBulkSeriesProducts([]); }}
              className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "process" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("mazak.tab_complete", "Gereedmelden")}
            </button>
            <button
              onClick={() => { setActiveTab("free"); setSelectedProduct(null); setSelectedPlanningOrder(null); setBulkSeriesProducts([]); }}
              className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "free" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("mazak.tab_free_label", "Vrij label")}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        .scan-pulse {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>

      {showActionModal && selectedProduct && (
        <div className="fixed z-[9999]">
          <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={(status, payload) => handlePostProcessingFinish(status, payload, selectedProduct)}
            currentStation={stationId}
          />
        </div>
      )}

      {showPrintModal && selectedProduct && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-7xl flex flex-col md:flex-row overflow-hidden max-h-[95vh] sm:max-h-[90vh]">
            <div className="w-full md:w-1/3 shrink-0 p-5 sm:p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col overflow-y-auto custom-scrollbar">
               <h3 className="text-2xl font-black uppercase italic text-slate-800 mb-2">
                 {activeTab === "process" ? t("mazak.reprint_label", "Label herprinten") : t("mazak.print_labels", "Labels printen")}
               </h3>
               <p className="text-sm font-bold text-slate-500 mb-8">
                  {isBulkInboxMode
                ? t("mazak.bulk_labels_printing", "{{count}} labels worden geprint voor deze bulk-serie.", { count: totalLabelCount }) 
                    : activeTab === "process"
                ? t("mazak.one_label_reprint", "{{count}} label(s) worden opnieuw geprint voor dit product.", { count: totalLabelCount })
                : t("mazak.one_label_print", "{{count}} label(s) worden geprint voor dit product.", { count: totalLabelCount })}
               </p>

               <div className="space-y-6 flex-1">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">{t("productionStartModal.labels.labelFormat", "Labelformaat")}</label>
                   <select 
                     value={selectedLabelId}
                     onChange={(e) => setSelectedLabelId(e.target.value)}
                     className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
                   >
                     <option value="">{t("mazak.select_template", "- Selecteer een template -")}</option>
                     {filteredLabels.map((l: LabelTemplate) => (
                       <option key={String(l.id)} value={String(l.id)}>{String(l.name || "-")} ({String(l.width || "-")}x{String(l.height || "-")}mm)</option>
                     ))}
                   </select>
                 </div>
                 
                 <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">{t("mazak.selected_order", "Geselecteerde order")}</p>
                    <p className="font-bold text-blue-900">{selectedProduct.orderId}</p>
                    <p className="text-xs text-blue-700 mt-1">{selectedProduct.item}</p>
                    {labelsPerItem > 1 && (
                      <p className="text-xs text-blue-700 mt-2">
                        {t("mazak.linked_labels_active", "Gekoppelde labels actief: {{count}} per product", { count: labelsPerItem })}
                      </p>
                    )}
                 </div>
               </div>

               <div className="flex gap-3 pt-6 mt-auto">
                 <button onClick={() => setShowPrintModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">
                   {t("common.cancel", "Annuleren")}
                 </button>
                 <button onClick={handlePrintLabels} disabled={printing || !selectedLabelId} className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                   {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                   {printing
                     ? t("common.loading", "Laden...")
                     : activeTab === "process"
                       ? t("mazak.reprint_label", "Label herprinten")
                       : t("mazak.print_count_labels", "Print {{count}} label(s)", { count: totalLabelCount })}
                 </button>
               </div>
            </div>

            <div className="flex-1 bg-slate-50 p-5 sm:p-8 flex flex-col items-center justify-center relative min-h-[300px] md:min-h-[400px] overflow-hidden">
               <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 z-10">
                 <Printer size={12} className="text-blue-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
               </div>
               
               {selectedLabelId ? (
                 <div className="flex-1 w-full h-full mt-4 px-4 overflow-y-auto">
                   <div className="max-w-3xl mx-auto space-y-5">
                     {effectiveTemplateChain.map((template, idx) => (
                       <div key={String(template?.id || idx)} className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                         <div className="mb-2 flex items-center justify-between">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                             {t("mazak.preview_label_step", "Label {{index}}", { index: idx + 1 })}
                           </p>
                           <p className="text-[10px] font-bold text-slate-400">
                             {String(template?.name || template?.id || "-")}
                           </p>
                         </div>
                         <AutoScaledLabelPreview
                           label={template}
                           data={mazakPreviewData}
                           className="w-full"
                           maxScale={1}
                         />
                       </div>
                     ))}
                   </div>
                 </div>
               ) : (
                 <p className="text-slate-400 font-bold text-sm">{t("mazak.select_template_for_preview", "Selecteer een template voor preview")}</p>
               )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`w-full lg:w-5/12 p-4 pb-32 space-y-3 border-r border-slate-100 overflow-y-auto custom-scrollbar ${(selectedProduct || selectedPlanningOrder) ? "hidden lg:block" : "block"}`}
          style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
        >
        {activeTab !== "planning" && activeTab !== "free" && (
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
                <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                  {t("lossen.ready_to_scan", "Klaar voor scan")}
                </span>
              </div>

              <button
                onClick={() => setScannerMode(!scannerMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? "bg-purple-100 border-purple-200 text-purple-700" : "bg-white border-slate-200 text-slate-400"}`}
                title={scannerMode ? t("digitalplanning.terminal.scanner_keyboard_hidden", "Toetsenbord verborgen (Scanner modus)") : t("digitalplanning.terminal.normal_input", "Normale invoer")}
              >
                {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                {scannerMode ? t("digitalplanning.terminal.scanner_mode", "Scanner modus") : t("digitalplanning.terminal.keyboard", "Toetsenbord")}
              </button>
            </div>

            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                ref={scanInputRef}
                type="text"
                value={activeScanInput}
                onChange={(event) => {
                  if (activeTab === "process") {
                    setScanInputProcess(event.target.value);
                    return;
                  }
                  setScanInputInbox(event.target.value);
                }}
                inputMode={scannerMode ? "none" : "text"}
                onKeyDown={handleScan}
                placeholder={t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer of order...")}
                className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
              />
            </div>
          </div>
        )}

        {currentList.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {activeTab === "inbox"
                ? t("mazak.no_items_to_print", "Geen items om te printen")
                : activeTab === "planning"
                  ? t("mazak.no_flange_orders_planning", "Geen flens-orders in de planning")
                  : activeTab === "free"
                    ? t("mazak.no_items_free_label", "Gebruik de vrije-label tab rechts om direct te printen")
                    : t("mazak.no_items_to_complete", "Geen items om te gereedmelden")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 ml-2">
              {activeTab === "planning" ? <History size={16} className="text-blue-500" /> : activeTab === "inbox" ? <Printer size={16} className="text-blue-500" /> : activeTab === "free" ? <Tag size={16} className="text-blue-500" /> : <ClipboardCheck size={16} className="text-emerald-500" />}
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                {activeTab === "planning"
                  ? t("mazak.planned_flanges", "Geplande flenzen")
                  : activeTab === "free"
                    ? t("mazak.free_label_tab_title", "Vrije labels")
                  : activeTab === "inbox"
                    ? t("mazak.inbox", "Inbox")
                    : t("mazak.to_process", "Te verwerken")} ({currentList.length})
              </h3>
            </div>

            {activeTab === "planning" ? (
              <>
                <div className="mb-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t("mazak.search_order_item_lot", "Zoek order, item of lot...")}
                      value={planningSearch}
                      onChange={(e) => setPlanningSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setShowAllWeeks(true)}
                      className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${showAllWeeks ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      {t("mazak.all_weeks", "Alle weken")}
                    </button>
                    <button
                      onClick={() => setShowAllWeeks(false)}
                      className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${!showAllWeeks ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      {t("mazak.per_week", "Per week")}
                    </button>
                  </div>
                  {!showAllWeeks && (
                    <div className="flex items-center justify-between bg-white p-1 rounded-xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2">
                      <button onClick={() => setReferenceDate(d => subWeeks(d, 1))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <ChevronLeft size={16} />
                      </button>
                      <div className="flex flex-col items-center cursor-pointer select-none" onDoubleClick={() => setReferenceDate(new Date())} title={t("mazak.double_click_current_week", "Dubbelklik voor huidige week")}>
                        <span className="text-xs font-black text-blue-600 uppercase tracking-widest">{t("common.week", "Week")} {getISOWeek(referenceDate)}</span>
                        <span className="text-[9px] font-bold text-slate-400">{referenceDate.getFullYear()}</span>
                      </div>
                      <button onClick={() => setReferenceDate(d => addWeeks(d, 1))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
                {(() => {
                  let lastWeekLabel: string | null = null;
                  return filteredPlanningOrders.map((order: PlanningOrder) => {
                    const isActive = order.status === 'in_progress' || order.status === 'In Production';
                    const weekLabel = isActive ? t("status.in_production", "In Productie") : `Week ${order.week || order.weekNumber || "?"}`;
                    
                    const showDivider = showAllWeeks && weekLabel !== lastWeekLabel;
                    if (showDivider) {
                      lastWeekLabel = weekLabel;
                    }

                    return (
                      <React.Fragment key={String(order.id || order.orderId || "") }>
                        {showDivider && (
                          <div className="flex items-center gap-4 my-6 first:mt-2 ml-2 mr-2">
                            <div className="h-px bg-slate-200 flex-1"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{weekLabel}</span>
                            <div className="h-px bg-slate-200 flex-1"></div>
                          </div>
                        )}
                        <div
                          onClick={() => setSelectedPlanningOrder(order)}
                          className={`bg-white border-2 rounded-[35px] p-6 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer ${selectedPlanningOrder?.id === order.id ? "border-blue-400 ring-4 ring-blue-200" : "border-slate-100"}`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="text-left">
                              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                                {t("mazak.order_number", "Ordernummer")}
                              </span>
                              <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                                {String(order.orderId || "-")}
                              </span>
                              <p className="text-xs font-bold text-slate-600 mt-1">
                                {String(order.item || "-")}
                              </p>
                            </div>
                            <div>
                              <StatusBadge status={order.status} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex justify-between items-center">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                {t("mazak.winding_machine", "Wikkelmachine")}
                              </p>
                              <p className="text-xs font-mono font-bold text-slate-700 truncate">
                                {String(order.machine || t("common.unknown", "Onbekend"))}
                              </p>
                            </div>
                            <div className="text-right">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                {t("mazak.quantity", "Aantal")}
                              </p>
                              <p className="text-xs font-mono font-black text-blue-600">
                                {String(order.plan || "-")} {t("digitalplanning.terminal.piece", "st.")}
                              </p>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()}
              </>
            ) : activeTab === "inbox" ? (
              displayRows.map((item) => {
              if (isSeriesHeaderRow(item)) {
                const isCollapsed = !!collapsedGroups[item.seriesGroupId];
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.seriesUnits[0])}
                    className="bg-blue-50 border-2 border-blue-200 rounded-[24px] p-4 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{t("mazak.bulk_series", "Bulk / serie")}</p>
                        <p className="text-base font-black text-blue-900">{t("productionStartModal.labels.order", "Order")} {item.orderId}</p>
                        <p className="text-[10px] font-bold text-blue-700 uppercase">{t("digitalplanning.terminal.series_count", "Serie {{count}} stuks", { count: item.seriesCount })}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedGroups((prev) => ({
                            ...prev,
                            [item.seriesGroupId]: !prev[item.seriesGroupId],
                          }));
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-blue-200 text-blue-700 text-[10px] font-black uppercase"
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {isCollapsed ? t("digitalplanning.terminal.expand", "Uitklappen") : t("digitalplanning.terminal.collapse", "Inklappen")}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] font-bold text-blue-700/80 uppercase tracking-wide">
                      {t("mazak.select_for_print_or_complete", "Selecteer voor printen of gereedmelden in rechterpaneel")}
                    </p>
                  </div>
                );
              }

              return renderItem(item);
              })
            ) : activeTab === "free" ? (
              <div className="space-y-3">
                {savedFreeLabelTemplates.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-200 text-center">
                    <Tag size={28} className="mx-auto mb-3 text-blue-500" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                      {t("mazak.free_label_template_empty", "Nog geen vrije-label templates opgeslagen")}
                    </p>
                  </div>
                ) : (
                  savedFreeLabelTemplates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => handleApplyFreeLabelTemplate(template)}
                      className={`bg-white border-2 rounded-[20px] p-4 shadow-sm transition-all cursor-pointer ${selectedFreeTemplateId === template.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">{template.name}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                            {template.align} • {template.fontSize} pt • {template.quantity}x
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFreeLabelTemplate(template.id);
                          }}
                          className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-all"
                          title={t("common.delete", "Verwijderen")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-3 line-clamp-3 whitespace-pre-wrap">{template.text}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              processItems.map(item => renderItem(item))
            )}
          </div>
        )}
        </div>

      <div className={`flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto custom-scrollbar ${(!selectedProduct && !selectedPlanningOrder && activeTab !== "free") ? "hidden lg:flex" : "flex"} flex-col`}>
        {activeTab === "free" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.free_label_header", "Vrij label")}</span>
              <h2 className="text-3xl font-black italic leading-none text-left">90 x 35 mm</h2>
              <p className="text-xs font-bold text-white/70 mt-2">{t("mazak.free_label_subtitle", "Print losse labels met vrije tekst")}</p>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-5 text-left">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                  {t("mazak.free_label_template_name", "Template naam")}
                </label>
                <input
                  type="text"
                  value={freeLabelTemplateName}
                  onChange={(e) => setFreeLabelTemplateName(e.target.value)}
                  maxLength={80}
                  placeholder={t("mazak.free_label_template_name_placeholder", "Bijv. Waarschuwing rood")}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                  {t("mazak.free_label_text", "Vrije tekst")}
                </label>
                <textarea
                  value={freeLabelText}
                  onChange={(e) => setFreeLabelText(e.target.value)}
                  rows={6}
                  maxLength={250}
                  placeholder={t("mazak.free_label_placeholder", "Typ hier de tekst voor het vrije label...")}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                  {t("mazak.free_label_alignment", "Uitlijning")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFreeLabelAlign("left")}
                    className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${freeLabelAlign === "left" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    {t("common.left", "Links")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreeLabelAlign("center")}
                    className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${freeLabelAlign === "center" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    {t("common.center", "Midden")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreeLabelAlign("right")}
                    className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${freeLabelAlign === "right" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    {t("common.right", "Rechts")}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                  {t("mazak.free_label_font_size", "Lettergrootte")}
                </label>
                <input
                  type="number"
                  min={6}
                  max={75}
                  value={String(freeLabelFontSize)}
                  onChange={(e) => {
                    setFreeLabelFontSize(clampFreeLabelFontSize(e.target.value));
                  }}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  {t("mazak.free_label_font_size_hint", "Vrij invoerbaar, max 75 pt")}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                  {t("mazak.quantity", "Aantal")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={freeLabelQuantity}
                  onChange={(e) => {
                    const value = Number.parseInt(String(e.target.value || "1"), 10);
                    setFreeLabelQuantity(Number.isFinite(value) ? Math.max(1, Math.min(50, value)) : 1);
                  }}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  {t("mazak.fixed_free_label_size", "Vast formaat: 90x35 mm")}
                </p>
              </div>

              <button
                onClick={handlePrintFreeLabels}
                disabled={printing || !freeLabelText.trim()}
                className="w-full py-4 bg-blue-600 text-white rounded-[22px] font-black uppercase text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                {printing
                  ? t("common.loading", "Laden...")
                  : t("mazak.print_free_labels", "Print {{count}} vrij label(s)", { count: Math.max(1, Math.min(50, Number(freeLabelQuantity) || 1)) })}
              </button>

              <button
                onClick={handleSaveFreeLabelTemplate}
                disabled={savingFreeTemplate || !freeLabelTemplateName.trim() || !freeLabelText.trim()}
                className="w-full py-3 bg-slate-100 text-slate-700 rounded-[18px] font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingFreeTemplate ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {savingFreeTemplate
                  ? t("common.loading", "Laden...")
                  : t("mazak.save_free_label_template", "Opslaan als template")}
              </button>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm text-left">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 mb-4">
                <Printer size={12} className="text-blue-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <AutoScaledLabelPreview
                  label={freeLabelTemplate}
                  data={{ freeText: freeLabelText || t("mazak.free_label_preview_placeholder", "Vrije tekst preview") }}
                  className="w-full"
                  printerDpi={mazakPrinterDpi}
                  maxScale={1}
                  exactBitmapPreview
                />
              </div>
            </div>
          </div>
        ) : selectedPlanningOrder ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <button onClick={() => setSelectedPlanningOrder(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
              <div className="text-left flex-1">
                <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.future_flange_order", "Toekomstige flens-order")}</span>
                <h2 className="text-3xl font-black italic leading-none text-left">
                  {selectedPlanningOrder.orderId}
                </h2>
                <p className="text-xs font-bold text-white/70 mt-2">{selectedPlanningOrder.item}</p>
              </div>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-5 text-left">
              <h3 className="font-black uppercase tracking-widest text-slate-400 text-xs mb-4">{t("mazak.order_details", "Orderdetails")}</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("mazak.quantity_to_produce", "Aantal te produceren")}</p>
                  <p className="font-black text-lg text-slate-800">{selectedPlanningOrder.plan} {t("digitalplanning.terminal.pieces", "stuks")}</p>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("mazak.winding_station", "Wikkelstation")}</p>
                  <p className="font-black text-lg text-slate-800">{selectedPlanningOrder.machine || t("common.unknown", "Onbekend")}</p>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t("digitalplanning.status", "Status")}</p>
                    <StatusBadge status={selectedPlanningOrder.status} />
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("mazak.delivery_week", "Leverdatum / week")}</p>
                  <p className="font-black text-lg text-slate-800">{t("common.week", "Week")} {selectedPlanningOrder.week || selectedPlanningOrder.weekNumber || "?"}</p>
                 </div>
              </div>
            </div>
          </div>
        ) : selectedProduct ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <button onClick={() => setSelectedProduct(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
              <div className="text-left flex-1">
                <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.title", "Mazak")}</span>
                <h2 className="text-3xl font-black italic leading-none text-left">
                  {isBulkInboxMode ? (() => {
                    const sortedLots = bulkSeriesProducts.map(p => String(p.lotNumber || "")).sort();
                    const firstLot = sortedLots[0];
                    const lastLot = sortedLots[sortedLots.length - 1];
                    return `${firstLot} / ${lastLot.slice(-3)}`;
                  })() : selectedProduct.lotNumber}
                </h2>
                <p className="text-xs font-bold text-white/70 mt-2">{selectedProduct.item}</p>
              </div>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-5 text-left">
              {activeTab === "inbox" ? (
                <>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    disabled={printing}
                    className="w-full py-4 bg-blue-50 text-blue-700 rounded-[22px] font-black uppercase text-sm hover:bg-blue-100 transition-all flex items-center justify-center gap-3 active:scale-95 group border border-blue-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Printer size={20} /> {t("mazak.print_labels", "Labels printen")}
                  </button>
                  <button
                    onClick={handleManualPrintForward}
                    disabled={printing}
                    className="w-full py-4 bg-amber-50 text-amber-800 rounded-[22px] font-black uppercase text-sm hover:bg-amber-100 transition-all flex items-center justify-center gap-3 active:scale-95 group border border-amber-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {printing ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                    {t("mazak.manual_print_and_forward", "Labels handmatig printen")}
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    className="w-full py-4 bg-slate-100 text-slate-700 rounded-[22px] font-black uppercase text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-3 active:scale-95 group border border-slate-200"
                  >
                    <Printer size={20} /> {t("mazak.reprint_label", "Label herprinten")}
                  </button>
                  <button onClick={handleOpenActionModal} className="w-full py-6 bg-slate-900 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                    <ClipboardCheck size={28} /> {t("mazak.process", "Verwerken")}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left">
            {activeTab === "inbox" ? (
               <Printer size={80} className="mb-6 text-slate-200" />
            ) : activeTab === "planning" ? (
               <History size={80} className="mb-6 text-slate-200" />
            ) : activeTab === "free" ? (
              <Tag size={80} className="mb-6 text-slate-200" />
            ) : (
               <ClipboardCheck size={80} className="mb-6 text-slate-200" />
            )}
            <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">
              {activeTab === "inbox" ? t("mazak.select_to_print", "Selecteer order om te printen") : activeTab === "planning" ? t("mazak.select_planned_order", "Selecteer geplande order") : activeTab === "free" ? t("mazak.free_label_ready", "Vrij label gereed om te printen") : t("mazak.select_to_process", "Selecteer order om te verwerken")}
            </h4>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default MazakView;
