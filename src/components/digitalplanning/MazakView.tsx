import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  limit,
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
  Search,
  Tag,
  Calendar,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { db, logActivity } from "../../config/firebase";
import { getPathString, PATHS } from "../../config/dbPaths";
import { normalizeMachine } from "../../utils/hubHelpers";
import {
  rejectTrackedProductFinal,
  completeTrackedProduct,
  tempRejectTrackedProduct,
  markMazakLabelsPrinted,
  queuePrintJob,
  reassignTrackedProductOrder,
  createProductionMessages,
} from "../../services/planningSecurityService";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useLabelPreview } from "../../hooks/useLabelPreview";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview";
import StatusBadge from "./common/StatusBadge";
import { getISOWeek } from "date-fns";
import { filterLabelsByProduct, processLabelData } from "../../utils/labelHelpers";
import { renderLabelToBitmapZpl } from "../../utils/unifiedLabelRenderEngine";
import { resolveLinkedTemplateChain } from "../../utils/orderLabelTemplateUtils";
import { useNotifications } from '../../contexts/NotificationContext';
import { resolvePrinterForRouting } from '../../utils/printRouting';

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const DEFAULT_MAZAK_DPI = 300;
const clampFreeLabelFontSize = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(6, Math.min(75, parsed));
};

const FREE_TEXT_LABEL_TEMPLATE: LabelTemplate = {
  id: "MAZAK-FREE-TEXT-90x35",
  name: "Vrij tekst 100x25",
  width: 100,
  height: 25,
  elements: [
    { type: "text", x: 3, y: 2, width: 94, height: 21, fontSize: 10, isBold: true, content: "{freeText}", maxLines: 4 },
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
  orderDocId?: string;
  orderDocPath?: string;
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

const getUrgencyColorClass = (value: unknown): string => {
  const dateMillis = toMillisFromMixed(value);
  if (!dateMillis) return "text-slate-400";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deliveryDate = new Date(dateMillis);
  deliveryDate.setHours(0, 0, 0, 0);

  const diffInDays = Math.floor((deliveryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (diffInDays <= 7) return "text-red-600 font-black";
  if (diffInDays <= 14) return "text-blue-600 font-black";
  return "text-slate-600 font-bold";
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

const getLotSeriesSequence = (lotNumber: unknown): number | null => {
  const raw = String(lotNumber || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{3})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getOrderIdFamily = (orderId: unknown): string => {
  const raw = String(orderId || "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\d{3}/);
  return match ? match[0] : "";
};

const getFlangeSizeToken = (value: unknown): string => {
  const raw = String(value || "").toUpperCase();
  if (!raw) return "";

  const normalizeCandidate = (token: string): string => {
    const cleaned = String(token || "").replace(/^0+/, "");
    const parsed = Number.parseInt(cleaned || "0", 10);
    if (!Number.isFinite(parsed) || parsed < 40 || parsed > 1200) return "";
    return String(parsed);
  };

  // Voorbeelden die we willen kunnen lezen:
  // "FL 350", "FL-350", "FLENS 350", "FLANGE350", "DN350", "350MM"
  const patterns = [
    /\bFL(?:ENS|ANGE)?\s*[-_/]*\s*(\d{2,4})\b/,
    /\bDN\s*[-_/]*\s*(\d{2,4})\b/,
    /\b(\d{2,4})\s*MM\b/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const normalized = normalizeCandidate(match?.[1] || "");
    if (normalized) return normalized;
  }

  // Fallback voor samengestelde itemcodes waar FL-maat niet als los woord staat,
  // bijvoorbeeld "FLST...0350...". Alleen toepassen als er FL-hints aanwezig zijn.
  const hasFlangeHint = /FL|FLS|FLST|FLENS|FLANGE/.test(raw);
  if (!hasFlangeHint) return "";

  const knownDiameters = new Set([
    40, 50, 60, 65, 75, 80, 90, 100, 110, 125, 140, 150, 160, 180, 200,
    225, 250, 280, 300, 315, 320, 350, 355, 400, 450, 500, 560, 600, 630,
    700, 710, 750, 800, 900, 1000, 1100, 1200,
  ]);

  const numberMatches = raw.match(/\d{2,4}/g) || [];
  const normalizedNumbers = numberMatches
    .map((token) => normalizeCandidate(token))
    .filter(Boolean);

  if (normalizedNumbers.length === 0) return "";

  const knownMatch = normalizedNumbers.find((token) => knownDiameters.has(Number(token)));
  if (knownMatch) return knownMatch;

  return normalizedNumbers[0] || "";
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

const getMaterialIntentTags = (product: ProductItem): Set<string> => {
  const combined = [
    product?.item,
    product?.itemCode,
    product?.productId,
    product?.extraCode,
    (product as Record<string, unknown>)?.itemDescription,
    (product as Record<string, unknown>)?.description,
    (product as Record<string, unknown>)?.articleDescription,
  ]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");

  const tags = new Set<string>();

  if (/\bEST\d*\b/.test(combined)) {
    tags.add("EST");
    tags.add("WAVISTRONG");
  }
  if (/\bCST\d*\b/.test(combined)) {
    tags.add("CST");
    tags.add("WAVISTRONG");
    tags.add("CONDUCTIVE");
  }
  if (/\bEWT\d*\b/.test(combined)) {
    tags.add("EWT");
    tags.add("WAVISTRONG");
  }
  if (/\bEMT\d*\b/.test(combined)) {
    tags.add("EMT");
    tags.add("FIBERMAR");
  }
  if (/\bCMT\d*\b/.test(combined)) {
    tags.add("CMT");
    tags.add("FIBERMAR");
    tags.add("CONDUCTIVE");
  }

  if (combined.includes("WAVISTRONG")) tags.add("WAVISTRONG");
  if (combined.includes("FIBERMAR")) tags.add("FIBERMAR");

  return tags;
};

const scoreTemplateForProductIntent = (template: LabelTemplate, intentTags: Set<string>): number => {
  const tags = Array.isArray(template?.tags)
    ? template.tags.map((tag) => String(tag || "").toUpperCase().trim()).filter(Boolean)
    : [];
  const tagSet = new Set(tags);
  const nameUpper = String(template?.name || "").toUpperCase();

  let score = 0;

  if (tagSet.has("FLANGE") || tagSet.has("FLENS") || tagSet.has("FLENZEN")) score += 30;

  if (intentTags.has("EST") && tagSet.has("EST")) score += 140;
  if (intentTags.has("CST") && tagSet.has("CST")) score += 140;
  if (intentTags.has("EWT") && tagSet.has("EWT")) score += 140;
  if (intentTags.has("EMT") && tagSet.has("EMT")) score += 140;
  if (intentTags.has("CMT") && tagSet.has("CMT")) score += 140;

  if (intentTags.has("WAVISTRONG") && tagSet.has("WAVISTRONG")) score += 90;
  if (intentTags.has("FIBERMAR") && tagSet.has("FIBERMAR")) score += 90;
  if (intentTags.has("CONDUCTIVE") && tagSet.has("CONDUCTIVE")) score += 50;

  if (intentTags.has("WAVISTRONG") && !intentTags.has("FIBERMAR") && tagSet.has("FIBERMAR")) score -= 120;
  if (intentTags.has("FIBERMAR") && !intentTags.has("WAVISTRONG") && tagSet.has("WAVISTRONG")) score -= 120;

  if (intentTags.has("WAVISTRONG") && nameUpper.includes("WAVISTRONG")) score += 25;
  if (intentTags.has("FIBERMAR") && nameUpper.includes("FIBERMAR")) score += 25;

  return score;
};

const selectQueuePrinterForStation = (
  printers: PrinterConfig[],
  stationId: string,
  templateTags: string[] = []
): PrinterConfig | null => {
  if (!Array.isArray(printers) || printers.length === 0) return null;
  return resolvePrinterForRouting(printers, {
    stationId,
    routeKey: 'MAZAK',
    labelRoute: 'mazak',
    templateTags,
  });
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

const getItemNominalDiameter = (item: any): number => {
  const itemIdentifier = [item?.item, item?.itemCode, item?.itemDescription].join(" ").toUpperCase();
  const match = itemIdentifier.match(/\b(\d{2,4})\s*(?:MM|-|R|X|\b)/);
  const parsed = match ? parseInt(match[1], 10) : parseInt(String(item?.diameter || item?.dn || "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
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

const applyBatchCutMode = (zpl: string, shouldCut: boolean, quantity: number = 1): string => {
  // Gebruik ALTIJD ^MMT (Tear-off mode) om te voorkomen dat de printer automatisch knipt na elk label (^XZ).
  // We sturen de knip-opdracht handmatig aan het einde van de batch met ~JK (Delayed Cut).
  const cutMedia = "^MMT";
  // Gebruik ^PQ altijd met N (no pause), omdat we geen pauzes willen tussen labels.
  const cutPq = `^PQ${quantity},0,0,N`;
  let modified = String(zpl || "");
  
  if (/\^MM[^^\n]*/.test(modified)) {
    modified = modified.replace(/\^MM[^^\n]*/g, cutMedia);
  } else {
    modified = modified.replace(/\^XA/i, `^XA\n${cutMedia}`);
  }

  if (/\^PQ[^^\n]*/.test(modified)) {
    modified = modified.replace(/\^PQ[^^\n]*/g, cutPq);
  } else {
    modified = modified.replace(/\^XZ/i, `\n${cutPq}\n^XZ`);
  }

  // Als dit het allerlaatste label in de batch is, trigger de knipschaar met ~JK
  if (shouldCut) {
    modified += "\n~JK";
  }

  return modified;
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
  const [scanInputAdjust, setScanInputAdjust] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const selectedProductRef = useRef<ProductItem | null>(null);

  const [activeTab, setActiveTab] = useState("inbox"); // 'planning' | 'inbox' | 'process' | 'adjust' | 'free'
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
  const [adjustSearch, setAdjustSearch] = useState("");
  const [selectedAdjustProduct, setSelectedAdjustProduct] = useState<ProductItem | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustOrderSearch, setAdjustOrderSearch] = useState("");
  const [selectedAdjustTargetOrder, setSelectedAdjustTargetOrder] = useState<PlanningOrder | null>(null);
  const [adjustRequestNote, setAdjustRequestNote] = useState("");
  const [showAdjustOrderModal, setShowAdjustOrderModal] = useState(false);
  const [showRequestNewOrderModal, setShowRequestNewOrderModal] = useState(false);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const activeScanInput = activeTab === "process"
    ? scanInputProcess
    : activeTab === "adjust"
      ? scanInputAdjust
      : scanInputInbox;
  const setActiveScanInput = (value: string) => {
    if (activeTab === "process") {
      setScanInputProcess(value);
      return;
    }
    if (activeTab === "adjust") {
      setScanInputAdjust(value);
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
    if (activeTab !== "adjust") {
      setScanInputAdjust("");
      setAdjustSearch("");
      setSelectedAdjustProduct(null);
      setAdjustReason("");
      setAdjustOrderSearch("");
      setSelectedAdjustTargetOrder(null);
      setAdjustRequestNote("");
      setShowAdjustOrderModal(false);
      setShowRequestNewOrderModal(false);
    }
  }, [activeTab]);

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
    const excludedStatuses = new Set(["completed", "shipped", "deleted", "cancelled"]);
    const rootPlanningQuery = query(
      collection(db, getPathString(PATHS.PLANNING)),
      where("status", "not-in", ["completed", "shipped", "deleted", "cancelled"])
    );

    const scopedOrdersQuery = query(collectionGroup(db, 'orders'));

    let rootOrders: PlanningOrder[] = [];
    let scopedOrders: PlanningOrder[] = [];
    let unsubScopedFallback: (() => void) | null = null;

    const combineAndSetOrders = () => {
      const combined = [...rootOrders, ...scopedOrders];
      const uniqueOrders = Array.from(new Map(combined.map(o => [o.id, o])).values());
      const flOrders = uniqueOrders.filter((o: PlanningOrder) => {
         const itemStr = String(o.item || "").toUpperCase();
         const codeStr = String(o.itemCode || o.productId || o.extraCode || "").toUpperCase();
         return itemStr.includes("FL") || codeStr.includes("FL");
      });
      setPlanningOrders(flOrders);
    };

    const unsubRoot = onSnapshot(rootPlanningQuery, (snap) => {
      rootOrders = snap.docs.map((d) => ({
        id: d.id,
        orderDocId: d.id,
        orderDocPath: d.ref.path,
        ...(d.data() as Omit<PlanningOrder, "id">),
      }));
      combineAndSetOrders();
    }, (error) => console.error("Error fetching root planning:", error));

    const unsubScoped = onSnapshot(scopedOrdersQuery, (snap) => {
      scopedOrders = snap.docs
        .map((d) => ({
          id: d.id,
          orderDocId: d.id,
          orderDocPath: d.ref.path,
          ...(d.data() as Omit<PlanningOrder, "id">),
        }) as PlanningOrder)
        .filter((order) => {
          const status = String(order.status || "").trim().toLowerCase();
          return !excludedStatuses.has(status);
        });
      combineAndSetOrders();
    }, (error) => {
      console.error("Error fetching scoped planning orders:", error);
      if (unsubScopedFallback) return;

      // Extra fallback houdt listener actief bij tijdelijke watch-fouten.
      const scopedFallbackQuery = query(collectionGroup(db, "orders"));
      unsubScopedFallback = onSnapshot(
        scopedFallbackQuery,
        (fallbackSnap) => {
          scopedOrders = fallbackSnap.docs
            .map((d) => ({
              id: d.id,
              orderDocId: d.id,
              orderDocPath: d.ref.path,
              ...(d.data() as Omit<PlanningOrder, "id">),
            }) as PlanningOrder)
            .filter((order) => {
              const status = String(order.status || "").trim().toLowerCase();
              return !excludedStatuses.has(status);
            });
          combineAndSetOrders();
        },
        (fallbackError) => {
          console.error("Error fetching scoped planning orders (fallback):", fallbackError);
        }
      );
    });

    return () => {
      unsubRoot();
      unsubScoped();
      if (unsubScopedFallback) unsubScopedFallback();
    };
  }, [notify]);

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

  const selectedRoutingTags = useMemo<string[]>(() => {
    if (!selectedLabelId) return [];

    const chain = resolveLinkedTemplateChain(availableLabels as any[], selectedLabelId, { maxDepth: 4 }) as LabelTemplate[];
    const templates = chain.length > 0
      ? chain
      : availableLabels.filter((template) => String(template?.id || "") === String(selectedLabelId));

    return Array.from(new Set(
      templates
        .flatMap((template) => (Array.isArray(template?.tags) ? template.tags : []))
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    ));
  }, [availableLabels, selectedLabelId]);

  const selectedQueuePrinter = useMemo<PrinterConfig | null>(() => {
    return selectQueuePrinterForStation(availablePrinters, stationId || "", selectedRoutingTags);
  }, [availablePrinters, stationId, selectedRoutingTags]);

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

  const resolvePreferredFlangeTemplatesForProduct = useCallback((product: ProductItem): LabelTemplate[] => {
    const productFiltered = filterLabelsByProduct(availableLabels as any, product as any, {
      excludeTempOrderLabels: true,
    }) as LabelTemplate[];

    const flangeOnly = productFiltered.filter((template) => hasFlangeTag(template));
    if (flangeOnly.length === 0) return [];

    const intentTags = getMaterialIntentTags(product);
    const rankedFlange = [...flangeOnly].sort((a, b) => {
      const scoreDiff = scoreTemplateForProductIntent(b, intentTags) - scoreTemplateForProductIntent(a, intentTags);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.name || a?.id || "").localeCompare(String(b?.name || b?.id || ""));
    });

    const preferredRoot = rankedFlange[0];

    const linked = resolveLinkedTemplateChain(availableLabels as any[], String(preferredRoot?.id || ""), { maxDepth: 4 }) as LabelTemplate[];
    const allowedIds = new Set(flangeOnly.map((template) => String(template.id || "")));
    const linkedFlange = linked.filter((template) => hasFlangeTag(template) && allowedIds.has(String(template.id || "")));
    if (linkedFlange.length > 0) return linkedFlange;

    return [preferredRoot];
  }, [availableLabels]);

  const adjustPreviewProductData = useMemo(() => {
    if (!selectedAdjustProduct || !selectedAdjustTargetOrder) return null;
    const targetOrder = selectedAdjustTargetOrder;
    const product = selectedAdjustProduct;
    return {
      ...product,
      item: targetOrder.item || product.item,
      itemCode: targetOrder.itemCode || product.itemCode,
      productId: targetOrder.productId || product.productId,
      extraCode: targetOrder.extraCode || product.extraCode,
      
      description: targetOrder.description || "",
      itemDescription: targetOrder.itemDescription || "",
      articleDescription: targetOrder.articleDescription || "",
      specs: targetOrder.specs || null,
      pn: targetOrder.pn || null,
      dn: targetOrder.dn || null,
      diameter: targetOrder.diameter || null,
      project: targetOrder.project || "",

      orderId: targetOrder.orderId,
      orderNumber: targetOrder.orderId,
      Order: targetOrder.orderId,
      order: targetOrder.orderId,
      originalOrderId: targetOrder.orderId,
      Productieorder: targetOrder.orderId
    } as Record<string, unknown>;
  }, [selectedAdjustProduct, selectedAdjustTargetOrder]);

  const adjustPreviewTemplates = useMemo(() => {
    if (!adjustPreviewProductData) return [];
    return resolvePreferredFlangeTemplatesForProduct(adjustPreviewProductData as ProductItem);
  }, [adjustPreviewProductData, resolvePreferredFlangeTemplatesForProduct]);

  const { previewData: adjustPreviewData } = useLabelPreview(
    adjustPreviewProductData as Record<string, unknown> | null,
    adjustPreviewTemplates[0]?.id || ""
  );

  const freeLabelTemplate = useMemo<LabelTemplate>(() => {
    return {
      ...FREE_TEXT_LABEL_TEMPLATE,
      elements: (FREE_TEXT_LABEL_TEMPLATE.elements || []).map((element: any) => {
        if (!element || typeof element !== "object" || element.type !== "text") return element;
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
  const adjustCandidates = useMemo(() => {
    const deduped = new Map<string, ProductItem>();
    [...inboxItems, ...processItems].forEach((item) => {
      const key = String(item.id || item.lotNumber || "").trim();
      if (!key) return;
      deduped.set(key, item);
    });

    return Array.from(deduped.values()).sort((a, b) => {
      const timeA = toMillisFromMixed(a.updatedAt || a.createdAt || 0);
      const timeB = toMillisFromMixed(b.updatedAt || b.createdAt || 0);
      return timeB - timeA;
    });
  }, [inboxItems, processItems]);

  const filteredAdjustProducts = useMemo(() => {
    const term = String(adjustSearch || "").trim().toLowerCase();
    if (!term) return adjustCandidates;

    return adjustCandidates.filter((item) => {
      const haystack = [
        item.lotNumber,
        item.orderId,
        item.item,
        item.itemCode,
      ]
        .map((entry) => String(entry || "").toLowerCase())
        .join(" ");
      return haystack.includes(term);
    });
  }, [adjustCandidates, adjustSearch]);

  const adjustTargetOrders = useMemo(() => {
    const sourceOrder = String(selectedAdjustProduct?.orderId || "").trim().toUpperCase();
    const sourceFamily = getOrderIdFamily(sourceOrder);
    const sourceFlangeSize = getFlangeSizeToken([
      selectedAdjustProduct?.item,
      selectedAdjustProduct?.itemCode,
      (selectedAdjustProduct as Record<string, unknown>)?.itemDescription,
      selectedAdjustProduct?.extraCode,
      selectedAdjustProduct?.productId,
    ].join(" "));
    const term = String(adjustOrderSearch || "").trim().toLowerCase();

    const rows = planningOrders.filter((order) => {
      const orderId = String(order.orderId || "").trim().toUpperCase();
      if (!orderId || orderId === sourceOrder) return false;

      const orderFlangeSize = getFlangeSizeToken([
        order.item,
        order.itemCode,
        (order as Record<string, unknown>)?.itemDescription,
        order.extraCode,
        order.productId,
      ].join(" "));

      if (sourceFlangeSize) {
        if (!orderFlangeSize || orderFlangeSize !== sourceFlangeSize) return false;
      } else if (sourceFamily && getOrderIdFamily(orderId) !== sourceFamily) {
        // Fallback voor records zonder duidelijke FL-maat.
        return false;
      }

      if (!term) return true;
      const haystack = `${order.orderId || ""} ${order.item || ""} ${order.itemCode || ""}`.toLowerCase();
      return haystack.includes(term);
    });

    return rows
      .sort((a, b) => {
        const aActive = a.status === "in_progress" || a.status === "In Production";
        const bActive = b.status === "in_progress" || b.status === "In Production";
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        const yearA = Number(a.year || a.weekYear || 0);
        const yearB = Number(b.year || b.weekYear || 0);
        if (yearA !== yearB) return yearA - yearB;
        const weekA = Number(a.week || a.weekNumber || 0);
        const weekB = Number(b.week || b.weekNumber || 0);
        if (weekA !== weekB) return weekA - weekB;
        return toMillisFromMixed(b.createdAt || 0) - toMillisFromMixed(a.createdAt || 0);
      })
      .slice(0, 30);
  }, [planningOrders, selectedAdjustProduct, adjustOrderSearch]);

  const selectedAdjustFlangeSize = getFlangeSizeToken([
    selectedAdjustProduct?.item,
    selectedAdjustProduct?.itemCode,
    (selectedAdjustProduct as Record<string, unknown>)?.itemDescription,
    selectedAdjustProduct?.extraCode,
    selectedAdjustProduct?.productId,
  ].join(" "));

  const selectedAdjustOrderFamily = getOrderIdFamily(selectedAdjustProduct?.orderId || "");
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
  const effectiveItemsToPrint = isBulkInboxMode ? bulkSeriesProducts : (selectedProduct ? [selectedProduct] : []);
  const totalLabelCount = effectiveItemsToPrint.reduce((acc, item) => {
    const diameter = getItemNominalDiameter(item);
    const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;
    return acc + (labelsPerItem * copies);
  }, 0);

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
  }, [planningOrders, planningSearch]);

  const selectedPlanningOrderMaterialBadge = useMemo(() => {
    if (!selectedPlanningOrder) return "";
    const combined = [
      String(selectedPlanningOrder.extraCode || ""),
      String(selectedPlanningOrder.item || ""),
      String(selectedPlanningOrder.itemCode || ""),
    ].join(" ").toUpperCase();

    if (combined.includes("EMT")) return "EMT";
    if (combined.includes("CMT")) return "CMT";
    if (combined.includes("CST")) return "CST";
    return "";
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderQuantity = useMemo(() => {
    if (!selectedPlanningOrder) return 0;
    const candidates = [
      Number((selectedPlanningOrder as Record<string, unknown>).quantity),
      Number(selectedPlanningOrder.plan),
      Number((selectedPlanningOrder as Record<string, unknown>).toDoQty),
    ];
    const valid = candidates.find((value) => Number.isFinite(value) && value > 0);
    return Number.isFinite(valid as number) ? Number(valid) : 0;
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderProduced = useMemo(() => {
    if (!selectedPlanningOrder) return 0;
    const candidates = [
      Number((selectedPlanningOrder as Record<string, unknown>).trackedFinishedCount),
      Number((selectedPlanningOrder as Record<string, unknown>).produced),
      Number((selectedPlanningOrder as Record<string, unknown>).done),
    ];
    const valid = candidates.find((value) => Number.isFinite(value) && value >= 0);
    return Number.isFinite(valid as number) ? Number(valid) : 0;
  }, [selectedPlanningOrder]);

  const selectedPlanningOrderDeliveryLabel = useMemo(() => {
    if (!selectedPlanningOrder) return "-";
    const record = selectedPlanningOrder as Record<string, unknown>;
    const rawDate = record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
    const dateMillis = toMillisFromMixed(rawDate);
    if (dateMillis > 0) {
      const deliveryDate = new Date(dateMillis);
      const week = getISOWeek(deliveryDate);
      const dateLabel = deliveryDate.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      return `W${String(week).padStart(2, "0")} ${dateLabel}`;
    }

    const week = String(selectedPlanningOrder.week || selectedPlanningOrder.weekNumber || "").trim();
    const year = String(selectedPlanningOrder.year || selectedPlanningOrder.weekYear || "").trim();
    if (!week) return "-";
    return year ? `W${String(week).padStart(2, "0")} ${year}` : `W${String(week).padStart(2, "0")}`;
  }, [selectedPlanningOrder]);

  const activePlanningOrderProducts = useMemo<ProductItem[]>(() => {
    const orderKey = String(selectedPlanningOrder?.orderId || "").trim().toUpperCase();
    if (!orderKey) return [];

    return items
      .filter((item) => String(item?.orderId || "").trim().toUpperCase() === orderKey)
      .sort((a, b) => String(a?.lotNumber || a?.id || "").localeCompare(String(b?.lotNumber || b?.id || "")));
  }, [items, selectedPlanningOrder]);

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

    if (activeTab === "inbox" && sameSeries.length > 1) {
      const lotPrefix = getLotSeriesPrefix(item?.lotNumber);
      const orderKey = String(item?.orderId || "").trim().toUpperCase();
      const itemCodeKey = String(item?.itemCode || "").trim().toUpperCase();
      const seedSequences = sameSeries
        .map((seriesItem) => getLotSeriesSequence(seriesItem?.lotNumber))
        .filter((value): value is number => Number.isFinite(value));

      if (lotPrefix && seedSequences.length > 0) {
        const minSeq = Math.min(...seedSequences);
        const maxSeq = Math.max(...seedSequences);

        const expandedSeries = items.filter((candidate) => {
          if (!isSeriesEligibleItem(candidate)) return false;
          const candidatePrefix = getLotSeriesPrefix(candidate?.lotNumber);
          if (!candidatePrefix || candidatePrefix !== lotPrefix) return false;

          const candidateOrder = String(candidate?.orderId || "").trim().toUpperCase();
          if (orderKey && candidateOrder && candidateOrder !== orderKey) return false;

          const candidateItemCode = String(candidate?.itemCode || "").trim().toUpperCase();
          if (itemCodeKey && candidateItemCode && candidateItemCode !== itemCodeKey) return false;

          const candidateSeq = getLotSeriesSequence(candidate?.lotNumber);
          if (typeof candidateSeq !== "number" || !Number.isFinite(candidateSeq)) return false;

          return candidateSeq >= minSeq && candidateSeq <= maxSeq;
        });

        sameSeries = expandedSeries.sort((a, b) => {
          const aSeq = getLotSeriesSequence(a?.lotNumber) || 0;
          const bSeq = getLotSeriesSequence(b?.lotNumber) || 0;
          return aSeq - bSeq;
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

  const handleOpenAdjustOrderFromSelectedProduct = () => {
    if (!selectedProduct) return;
    setSelectedAdjustProduct(selectedProduct);
    setAdjustOrderSearch("");
    setSelectedAdjustTargetOrder(null);
    setShowAdjustOrderModal(true);
  };

  const handleOpenRequestNewOrderFromSelectedProduct = () => {
    if (!selectedProduct) return;
    setSelectedAdjustProduct(selectedProduct);
    setAdjustRequestNote("");
    setShowRequestNewOrderModal(true);
  };

  const resolveQueuePrinterForPrint = async (): Promise<PrinterConfig> => {
    if (selectedQueuePrinter?.id) return selectedQueuePrinter;

    if (availablePrinters.length > 0) {
      const fromState = selectQueuePrinterForStation(availablePrinters, stationId || "", selectedRoutingTags);
      if (fromState?.id) return fromState;
    }

    const fetchedSnap = await getDocs(collection(db, getPathString(PATHS.PRINTERS)));
    const fetchedPrinters: PrinterConfig[] = fetchedSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PrinterConfig, "id">) }))
      .filter((printer) => Boolean(printer?.id));

    if (fetchedPrinters.length > 0) {
      setAvailablePrinters(fetchedPrinters);
      const fromFetch = selectQueuePrinterForStation(fetchedPrinters, stationId || "", selectedRoutingTags);
      if (fromFetch?.id) return fromFetch;
    }

    throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
  };

  const handleReprintAdjustedOrderLabel = async (product: ProductItem, previousOrderId: string, newOrderId: string): Promise<string> => {
    const queuePrinter = await resolveQueuePrinterForPrint();
    const queuePrinterId = String(queuePrinter?.id || "").trim();
    const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
    if (!queuePrinterId) {
      throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
    }

    const templatesToPrint = resolvePreferredFlangeTemplatesForProduct(product);
    if (templatesToPrint.length === 0) {
      throw new Error("Geen flens-labeltemplate beschikbaar voor herprint na orderwijziging.");
    }

    const processedData = processLabelData(product);
    const diameter = getItemNominalDiameter(product);
    const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;
    const zplChunks: string[] = [];

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

      const isLastInBatch = idx === templatesToPrint.length - 1;
      zplChunks.push(applyBatchCutMode(zplCode, isLastInBatch, copies));
    }

    const batchPayload = zplChunks.join("\n");
    if (!batchPayload) {
      throw new Error("Geen geldige printpayload voor orderwijziging opgebouwd.");
    }

    const queuedJobId = await queuePrintJob(
      queuePrinterId,
      batchPayload,
      {
        description: `Mazak Herprint na orderwijziging ${previousOrderId} -> ${newOrderId}`,
        templateId: String(templatesToPrint[0]?.id || ""),
        templateName: templatesToPrint.length > 1 ? "Mazak Label Batch" : (templatesToPrint[0]?.name || "Mazak Label"),
        machineId: queueStationId,
        stationId: queueStationId,
        targetStation: queueStationId,
        targetPrinterName: queuePrinter?.name || queueStationId,
        orderId: newOrderId,
        previousOrderId,
        lotNumber: String(product?.lotNumber || product?.id || ""),
        lotNumbers: [String(product?.lotNumber || product?.id || "")].filter(Boolean),
        lotCount: 1,
        labelCount: templatesToPrint.length * copies,
        quantity: 1,
        isReprint: true,
        linkedSequenceTotal: templatesToPrint.length,
        linkedRootTemplateId: String(templatesToPrint[0]?.id || ""),
        cutMode: "last-only",
        queuedAsBatch: true,
        reason: "order-reassign",
      }
    );

    await markMazakLabelsPrinted({
      productIds: [String(product.id || product.lotNumber || "")].filter(Boolean),
      stationId,
      isReprint: true,
      source: "MazakView:adjust-order-reprint",
      actorLabel: user?.email || "Mazak Operator",
    });

    const normalizedJobId = extractQueuedJobId(queuedJobId);
    return normalizedJobId;
  };

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

      const zplChunks: string[] = [];
      const lotNumbersForBatch: string[] = [];

      for (let itemIdx = 0; itemIdx < itemsToPrint.length; itemIdx++) {
        const item = itemsToPrint[itemIdx];
        const processedData = processLabelData(item);
        lotNumbersForBatch.push(String(item?.lotNumber || "").trim());

        const diameter = getItemNominalDiameter(item);
        const copies = (diameter > 450 && diameter <= 700) ? 2 : 1;

        const itemZpls: Array<{ zpl: string; qty: number }> = [];

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

          itemZpls.push({ zpl: zplCode, qty: copies });
        }
        
        // Pas de knip (cut) toe voor de hele batch: knip pas na het allerlaatste label van het allerlaatste product
        for (let i = 0; i < itemZpls.length; i++) {
          const isLastInBatch = itemIdx === itemsToPrint.length - 1 && i === itemZpls.length - 1;
          zplChunks.push(applyBatchCutMode(itemZpls[i].zpl, isLastInBatch, itemZpls[i].qty));
        }
      }

      const batchPayload = zplChunks.join("\n");
      if (!batchPayload) {
        throw new Error("Geen geldige batchpayload voor Mazak print opgebouwd.");
      }

      const queuedJobId = await queuePrintJob(
        queuePrinterId,
        batchPayload,
        {
          description: `${isReprint ? "Mazak Herprint" : "Mazak Print"} batch ${String(selectedProduct?.orderId || "-")} (${itemsToPrint.length} lot${itemsToPrint.length === 1 ? "" : "s"})`,
          templateId: String(selectedLabelId),
          templateName: templatesToPrint.length > 1 ? "Mazak Label Batch" : (templatesToPrint[0]?.name || "Mazak Label"),
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          orderId: selectedProduct?.orderId,
          lotNumber: lotNumbersForBatch[0] || selectedProduct?.lotNumber,
          lotNumbers: lotNumbersForBatch.filter(Boolean),
          lotCount: itemsToPrint.length,
          labelCount: totalLabelCount,
          quantity: 1, // De ZPL payload bevat al het exacte aantal labels, we sturen de hele bundel 1x door
          isReprint,
          linkedSequenceTotal: templatesToPrint.length,
          linkedRootTemplateId: String(selectedLabelId || ""),
          cutMode: "last-only",
          queuedAsBatch: true,
        }
      );

      const normalizedJobId = extractQueuedJobId(queuedJobId);
      if (!normalizedJobId) {
        throw new Error("Queue response bevat geen geldig jobId.");
      }

      const rootJobRef = doc(db, getPathString(PATHS.PRINT_QUEUE), normalizedJobId);
      const rootJobSnap = await getDoc(rootJobRef);
      if (!rootJobSnap.exists()) {
        const scopedSnap = await getDocs(
          query(
            collectionGroup(db, "items"),
            where("id", "==", normalizedJobId),
            where("_scopeType", "==", "print_queue"),
            limit(1)
          )
        );

        if (scopedSnap.empty) {
          throw new Error(`Queue job niet gevonden na aanmaak (jobId: ${normalizedJobId}).`);
        }
      }
      queuedJobIds.push(normalizedJobId);

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
        widthMm: 100,
        heightMm: 25,
      });

      await Promise.all(
        Array.from({ length: quantity }, () =>
          queuePrintJob(queuePrinterId, zplCode, {
            description: `Mazak Vrij Label (${String(queueStationId)})`,
            templateId: FREE_TEXT_LABEL_TEMPLATE.id,
            templateName: FREE_TEXT_LABEL_TEMPLATE.name || "Vrij label 100x25",
            machineId: queueStationId,
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
        `Mazak: ${quantity} vrije label(s) 100x25 naar queue gestuurd (align: ${freeLabelAlign}, font: ${normalizedFontSize})`
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

  const handleSubmitOrderReassign = async () => {
    const product = selectedAdjustProduct;
    const targetOrder = selectedAdjustTargetOrder;
    const reason = String(adjustReason || "").trim();
    if (!product || !targetOrder?.orderId) {
      notify(t("mazak.adjust_target_order_required", "Selecteer eerst een doelorder."));
      return;
    }
    if (!reason) {
      notify(t("mazak.adjust_reason_required", "Geef een opmerking/reden op."));
      return;
    }

    const productId = String(product.id || product.lotNumber || "").trim();
    if (!productId) {
      notify(t("mazak.adjust_product_required", "Selecteer eerst een lot/product."));
      return;
    }

    setAdjustSubmitting(true);
    try {
      const previousOrderId = String(product.orderId || "").trim();
      const nextOrderId = String(targetOrder.orderId || "").trim();
      await reassignTrackedProductOrder({
        productId,
        newOrderId: nextOrderId,
        targetOrderDocId: String(targetOrder.id || targetOrder.orderDocId || "").trim(),
        targetOrderPath: String(targetOrder.orderDocPath || "").trim(),
        reason,
        source: "MazakView:adjust-order",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "TRACKED_PRODUCT_ORDER_REASSIGN",
        `Mazak aanpassen: lot ${product.lotNumber || productId} verplaatst van ${product.orderId || "-"} naar ${nextOrderId}`
      );

      let reprintJobId = "";
      try {
        const productForReprint = { 
          ...product, 
          item: targetOrder.item || product.item,
          itemCode: targetOrder.itemCode || product.itemCode,
          productId: targetOrder.productId || product.productId,
          extraCode: targetOrder.extraCode || product.extraCode,
          
          // Wis verouderde productvelden zodat de label-parser zuiver de nieuwe orderdata pakt
          description: targetOrder.description || "",
          itemDescription: targetOrder.itemDescription || "",
          articleDescription: targetOrder.articleDescription || "",
          specs: targetOrder.specs || null,
          pn: targetOrder.pn || null,
          dn: targetOrder.dn || null,
          diameter: targetOrder.diameter || null,
          project: targetOrder.project || "",

          orderId: nextOrderId,
          orderNumber: nextOrderId,
          Order: nextOrderId,
          order: nextOrderId,
          originalOrderId: nextOrderId,
          Productieorder: nextOrderId
        };
        reprintJobId = await handleReprintAdjustedOrderLabel(productForReprint, previousOrderId || "-", nextOrderId);
      } catch (reprintErr) {
        const reprintWarning = reprintErr instanceof Error ? reprintErr.message : String(reprintErr || "Onbekende fout");
        console.error("Herprint na orderwijziging mislukt:", reprintErr);

        if (previousOrderId && previousOrderId.toUpperCase() !== nextOrderId.toUpperCase()) {
          try {
            await reassignTrackedProductOrder({
              productId,
              newOrderId: previousOrderId,
              reason: `Rollback na mislukte label-herprint (${reason})`,
              source: "MazakView:adjust-order-rollback",
              actorLabel: user?.email || "Mazak Operator",
            });

            await logActivity(
              user?.uid || "system",
              "TRACKED_PRODUCT_ORDER_REASSIGN_ROLLBACK",
              `Mazak rollback: lot ${product.lotNumber || productId} teruggezet van ${nextOrderId} naar ${previousOrderId} na mislukte herprint`
            );

            notify(
              `${t("mazak.adjust_reassign_error", "Ordernummer wijzigen is mislukt.")} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}. ${t("mazak.adjust_rollback_done", "Wijziging is automatisch teruggedraaid.")}`
            );
            return;
          } catch (rollbackErr) {
            const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr || "Onbekende fout");
            console.error("Rollback na mislukte herprint is ook mislukt:", rollbackErr);
            notify(
              `${t("mazak.adjust_reassign_success", "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.", { lot: product.lotNumber || productId, order: nextOrderId })} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}. ${t("mazak.adjust_rollback_failed", "Rollback is mislukt; handmatige correctie nodig.")}: ${rollbackMessage}`
            );
            return;
          }
        }

        notify(
          `${t("mazak.adjust_reassign_success", "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.", { lot: product.lotNumber || productId, order: nextOrderId })} ${t("mazak.adjust_reprint_warning", "Automatische label-herprint is mislukt.")}: ${reprintWarning}`
        );
        return;
      }

      setSelectedAdjustProduct((prev) => (prev ? { ...prev, orderId: nextOrderId } : prev));
      setSelectedAdjustTargetOrder(null);
      setAdjustReason("");
      notify(
        `${t(
          "mazak.adjust_reassign_success",
          "Ordernummer gewijzigd: lot {{lot}} is nu gekoppeld aan order {{order}}.",
          { lot: product.lotNumber || productId, order: nextOrderId }
        )}${reprintJobId ? ` (${t("mazak.adjust_reprint_job", "reprint job")}: ${reprintJobId})` : ""}`
      );
    } catch (error) {
      console.error("Fout bij ordernummer wijzigen in Mazak:", error);
      const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
      notify(`${t("mazak.adjust_reassign_error", "Ordernummer wijzigen is mislukt.")}: ${message}`);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleRequestNewOrderFromPlanner = async () => {
    const product = selectedAdjustProduct;
    const reason = String(adjustReason || "").trim();
    const requestNote = String(adjustRequestNote || "").trim();

    if (!product) {
      notify(t("mazak.adjust_product_required", "Selecteer eerst een lot/product."));
      return;
    }
    if (!reason) {
      notify(t("mazak.adjust_reason_required", "Geef een opmerking/reden op."));
      return;
    }

    const lotNumber = String(product.lotNumber || product.id || "onbekend");
    const currentOrder = String(product.orderId || "onbekend");
    const productType = String(product.item || product.itemCode || "onbekend");

    setAdjustSubmitting(true);
    try {
      await createProductionMessages({
        messages: [
          {
            from: user?.email || "Mazak Operator",
            senderId: user?.uid || "system",
            subject: `Nieuw ordernummer nodig voor lot ${lotNumber}`,
            content: [
              "Mazak Aanpassen: product verkeerd geboord en moet omgeboekt worden.",
              `Lotnummer: ${lotNumber}`,
              `Huidig ordernummer: ${currentOrder}`,
              `Type: ${productType}`,
              `Reden: ${reason}`,
              requestNote ? `Extra opmerking: ${requestNote}` : null,
            ].filter(Boolean).join("\n"),
            title: `Nieuw ordernummer nodig (${lotNumber})`,
            message: `Lot ${lotNumber} (${productType}) wacht op nieuw ordernummer. Reden: ${reason}`,
            priority: "high",
            type: "warning",
            source: "MazakView",
            targetRoles: ["teamleader", "planner", "admin"],
            targetGroup: "TEAMLEADERS_AND_PLANNERS",
            broadcastToAll: true,
            relatedLot: lotNumber,
            metadata: {
              kind: "mazak_order_reassign_request",
              lotNumber,
              currentOrderId: currentOrder,
              productType,
              reason,
              note: requestNote || null,
              station: stationId,
            },
          },
        ],
        source: "MazakView",
        actorLabel: user?.email || "Mazak Operator",
      });

      await logActivity(
        user?.uid || "system",
        "MAZAK_REASSIGN_REQUEST_NEW_ORDER",
        `Mazak aanpassen: nieuw ordernummer aangevraagd voor lot ${lotNumber} (huidig order ${currentOrder})`
      );

      setAdjustRequestNote("");
      notify(
        t(
          "mazak.adjust_request_sent",
          "Verzoek verstuurd naar Teamleader/Planner. Dit product blijft geparkeerd tot een nieuw ordernummer beschikbaar is."
        )
      );
      setShowRequestNewOrderModal(false);
    } catch (error) {
      console.error("Fout bij aanvragen nieuw ordernummer:", error);
      const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
      notify(`${t("mazak.adjust_request_error", "Versturen van verzoek is mislukt.")}: ${message}`);
    } finally {
      setAdjustSubmitting(false);
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

    const listToSearch = activeTab === "inbox"
      ? inboxItems
      : activeTab === "process"
        ? processItems
        : adjustCandidates;
    const found = listToSearch.find(
      (item) =>
        String(item.lotNumber || "").toLowerCase() === code.toLowerCase() ||
        String(item.orderId || "").toLowerCase() === code.toLowerCase()
    );

    if (found) {
      if (activeTab === "adjust") {
        setSelectedAdjustProduct(found);
        setAdjustSearch(code);
      } else {
        handleItemClick(found);
      }
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
      className={`bg-white border-2 rounded-2xl p-3 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer ${selectedProduct?.id === item.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100"}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-left">
          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
            {item.orderId}
          </span>
          <span className="font-black text-slate-900 text-base tracking-tighter">
            {item.lotNumber}
          </span>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5 truncate max-w-[180px]">
            {item.item}
          </p>
        </div>
        <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${activeTab === "inbox" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
          {activeTab === "inbox" ? t("mazak.print_badge", "Printen") : t("mazak.complete_badge", "Gereedmelden")}
        </div>
      </div>
      <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
          {t("lossen.manufactured_item")}
        </p>
        <p className="text-[10px] font-mono font-bold text-slate-700 truncate">
          {item.itemCode}
        </p>
        {item.lastStation && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60 opacity-80">
            <History size={10} className="text-blue-500" />
            <span className="text-[8px] font-black text-slate-500 uppercase italic">
              {t("mazak.from_station", "Van")}: {item.lastStation}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const currentList = activeTab === "inbox"
    ? inboxItems
    : activeTab === "process"
      ? processItems
      : activeTab === "planning"
        ? filteredPlanningOrders
        : activeTab === "adjust"
          ? filteredAdjustProducts
          : [];

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
              onClick={() => { setActiveTab("adjust"); setSelectedProduct(null); setSelectedPlanningOrder(null); setBulkSeriesProducts([]); }}
              className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "adjust" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("mazak.tab_adjust", "Aanpassen")}
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
          className={`w-full lg:w-7/12 p-4 pb-32 space-y-3 border-r border-slate-100 overflow-y-auto custom-scrollbar ${(selectedProduct || selectedPlanningOrder) ? "hidden lg:block" : "block"}`}
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
                  if (activeTab === "adjust") {
                    setScanInputAdjust(event.target.value);
                    return;
                  }
                  setScanInputInbox(event.target.value);
                }}
                inputMode={scannerMode ? "none" : "text"}
                onKeyDown={handleScan}
                placeholder={activeTab === "adjust"
                  ? t("mazak.adjust_scan_placeholder", "Scan of typ lotnummer / order voor aanpassen...")
                  : t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer of order...")}
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
                  : activeTab === "adjust"
                    ? t("mazak.adjust_products", "Aanpassen: actieve lots")
                  : activeTab === "free"
                    ? t("mazak.free_label_tab_title", "Vrije labels")
                  : activeTab === "inbox"
                    ? t("mazak.inbox", "Inbox")
                    : t("mazak.to_process", "Te verwerken")} ({currentList.length})
              </h3>
            </div>

            {activeTab === "planning" ? (
              <>
                <div className="mb-4 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t("mazak.search_order_item_lot", "Zoek order, item of lot...")}
                      value={planningSearch}
                      onChange={(e) => setPlanningSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <button
                    onClick={() => document.getElementById("current-week-divider")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-black uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm border border-blue-100"
                  >
                    <Calendar size={14} className="text-blue-500" />
                    <span className="hidden sm:inline">{t("mazak.current_week", "Huidige Week")}</span>
                  </button>
                </div>
                {(() => {
                  let lastWeekLabel: string | null = null;
                  const currentDate = new Date();
                  const currentWeek = getISOWeek(currentDate);
                  const currentYear = currentDate.getFullYear();

                  return filteredPlanningOrders.map((order: PlanningOrder) => {
                    const isActive = order.status === 'in_progress' || order.status === 'In Production';
                    const weekLabel = isActive ? t("status.in_production", "In Productie") : `Week ${order.week || order.weekNumber || "?"}`;
                    const orderMaterialBadge = (() => {
                      const combined = [
                        String(order.extraCode || ""),
                        String(order.item || ""),
                        String(order.itemCode || ""),
                      ].join(" ").toUpperCase();

                      if (combined.includes("EMT")) return "EMT";
                      if (combined.includes("CMT")) return "CMT";
                      if (combined.includes("CST")) return "CST";
                      return "";
                    })();

                    const orderTotal = (() => {
                      const candidates = [
                        Number((order as Record<string, unknown>).quantity),
                        Number(order.plan),
                        Number((order as Record<string, unknown>).toDoQty),
                      ];
                      const valid = candidates.find((value) => Number.isFinite(value) && value > 0);
                      return Number.isFinite(valid as number) ? Number(valid) : 0;
                    })();

                    const orderProduced = (() => {
                      const candidates = [
                        Number((order as Record<string, unknown>).trackedFinishedCount),
                        Number((order as Record<string, unknown>).produced),
                        Number((order as Record<string, unknown>).done),
                      ];
                      const valid = candidates.find((value) => Number.isFinite(value) && value >= 0);
                      return Number.isFinite(valid as number) ? Number(valid) : 0;
                    })();

                    const orderDeliveryLabel = (() => {
                      const record = order as Record<string, unknown>;
                      const rawDate = record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
                      const dateMillis = toMillisFromMixed(rawDate);
                      if (dateMillis > 0) {
                        const deliveryDate = new Date(dateMillis);
                        const week = getISOWeek(deliveryDate);
                        const dateLabel = deliveryDate.toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                        return `W${String(week).padStart(2, "0")} ${dateLabel}`;
                      }

                      const fallbackWeek = String(order.week || order.weekNumber || "").trim();
                      const fallbackYear = String(order.year || order.weekYear || "").trim();
                      if (!fallbackWeek) return "-";
                      return fallbackYear
                        ? `W${String(fallbackWeek).padStart(2, "0")} ${fallbackYear}`
                        : `W${String(fallbackWeek).padStart(2, "0")}`;
                    })();
                    const orderDeliveryRaw = (() => {
                      const record = order as Record<string, unknown>;
                      return record.plannedDeliveryDate || record.deliveryDate || record.plannedDate || null;
                    })();
                    const orderDeliveryColorClass = getUrgencyColorClass(orderDeliveryRaw);
                    
                    const showDivider = weekLabel !== lastWeekLabel;
                    if (showDivider) {
                      lastWeekLabel = weekLabel;
                    }

                    const orderWeek = Number(order.week || order.weekNumber);
                    const orderYear = Number(order.year || order.weekYear || currentYear);
                    const isCurrentWeek = !isActive && Number.isFinite(orderWeek) && orderWeek === currentWeek && orderYear === currentYear;
                    const isPastWeek = !isActive && Number.isFinite(orderWeek) && (orderYear < currentYear || (orderYear === currentYear && orderWeek < currentWeek));

                    return (
                      <React.Fragment key={String(order.id || order.orderId || "") }>
                        {showDivider && (
                          <div id={isCurrentWeek ? "current-week-divider" : undefined} className={`flex items-center gap-3 px-1 pt-2 pb-2 my-4 first:mt-0 ${isPastWeek && !isCurrentWeek ? "opacity-50" : ""}`}>
                            <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${isCurrentWeek ? "bg-blue-600 text-white shadow-md shadow-blue-200" : isPastWeek ? "bg-slate-200 text-slate-500" : "bg-slate-100 text-slate-500"}`}>
                              {weekLabel}
                              {isCurrentWeek && <span className="ml-1 opacity-70"> • Nu</span>}
                            </div>
                            <div className="flex-1 h-px bg-slate-200"></div>
                          </div>
                        )}
                        <div
                          onClick={() => setSelectedPlanningOrder(order)}
                          className={`min-h-[100px] px-4 py-3 rounded-3xl border-2 transition-all flex items-center justify-between relative overflow-hidden cursor-pointer ${
                            selectedPlanningOrder?.id === order.id
                              ? "bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-100 translate-x-1"
                              : "bg-white border-slate-100 hover:border-blue-300"
                          }`}
                        >
                          <div className="flex items-center gap-4 flex-1 overflow-hidden">
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="inline-block px-3 py-1 bg-slate-200 text-slate-800 rounded-lg text-sm font-black uppercase tracking-wider border border-slate-300 shadow-sm">
                                  {t("productionStartModal.labels.order", "Order")}: {String(order.orderId || "-")}
                                </span>
                                {orderMaterialBadge && (
                                  <span className="inline-block px-2.5 py-1 bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-black uppercase tracking-wide">
                                    {orderMaterialBadge}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-black text-base sm:text-lg leading-tight uppercase text-slate-900 mb-1 line-clamp-2">
                                {String(order.item || "-")}
                              </h4>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 text-right shrink-0 ml-4">
                            <StatusBadge status={order.status} />
                            <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">
                              {t("digitalplanning.terminal.made", "Gemaakt")}: {orderProduced} / {orderTotal} ST
                            </span>
                            <span className={`text-xs uppercase tracking-tighter ${orderDeliveryColorClass}`}>
                              {orderDeliveryLabel}
                            </span>
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
            ) : activeTab === "adjust" ? (
              <>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder={t("mazak.adjust_search_placeholder", "Zoek op lot, order, item of type...")}
                      value={adjustSearch}
                      onChange={(e) => setAdjustSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredAdjustProducts.map((item) => {
                    const key = String(item.id || item.lotNumber || "");
                    const isSelected = String(selectedAdjustProduct?.id || selectedAdjustProduct?.lotNumber || "") === key;
                    const stage = item.mazakLabelPrinted
                      ? t("mazak.complete_badge", "Gereedmelden")
                      : t("mazak.print_badge", "Printen");

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedAdjustProduct(item)}
                        className={`w-full text-left bg-white border-2 rounded-2xl p-4 shadow-sm transition-all ${isSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.orderId || "-"}</p>
                            <p className="text-base font-black text-slate-900">{item.lotNumber || item.id || "-"}</p>
                            <p className="text-xs font-bold text-slate-600 mt-1 truncate">{item.item || "-"}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">{item.itemCode || "-"}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.mazakLabelPrinted ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                            {stage}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
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

      <div className={`flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto custom-scrollbar ${(!selectedProduct && !selectedPlanningOrder && !selectedAdjustProduct && activeTab !== "free" && activeTab !== "adjust") ? "hidden lg:flex" : "flex"} flex-col`}>
        {activeTab === "free" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.free_label_header", "Vrij label")}</span>
              <h2 className="text-3xl font-black italic leading-none text-left">100 x 25 mm</h2>
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
                  {t("mazak.fixed_free_label_size", "Vast formaat: 100x25 mm")}
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
        ) : activeTab === "adjust" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            {!selectedAdjustProduct ? (
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black uppercase italic text-slate-800 mb-3">
                  {t("mazak.adjust_title", "Aanpassen verkeerd product")}
                </h3>
                <p className="text-sm font-bold text-slate-600">
                  {t("mazak.adjust_pick_product", "Scan of selecteer eerst een lot uit Inbox of Gereedmelden om het ordernummer aan te passen.")}
                </p>
              </div>
            ) : (
              <>
                <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
                  <div className="mb-4">
                    <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
                      {t("productionStartModal.labels.order", "Order")}: {selectedAdjustProduct.orderId || "-"}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
                    {selectedAdjustProduct.item || "-"}
                  </h2>
                  <p className="text-xs font-bold text-white/60 mt-1">{selectedAdjustProduct.itemCode || "-"}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/10 pt-6 mt-6">
                    <div>
                      <p className="text-[10px] font-black text-white/40 uppercase mb-1">Lotnummer</p>
                      <p className="text-lg font-black text-sky-300">{selectedAdjustProduct.lotNumber || selectedAdjustProduct.id || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white/40 uppercase mb-1">Huidige fase</p>
                      <p className="text-lg font-black text-amber-300">
                        {selectedAdjustProduct.mazakLabelPrinted
                          ? t("mazak.complete_badge", "Gereedmelden")
                          : t("mazak.print_badge", "Printen")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <button
                    onClick={() => setShowAdjustOrderModal(true)}
                    className="p-6 bg-white rounded-3xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                  >
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <ArrowRight size={32} />
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-blue-700">
                      Ordernummer wijzigen
                    </span>
                  </button>
                  <button
                    onClick={() => setShowRequestNewOrderModal(true)}
                    className="p-6 bg-white rounded-3xl border-2 border-slate-100 hover:border-amber-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                  >
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                      <Tag size={32} />
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-amber-700">
                      Verzoek nieuw ordernummer
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : selectedProduct ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="mb-2">
                    <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
                      {t("productionStartModal.labels.order", "Order")}: {selectedProduct.orderId}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
                    {selectedProduct.item || "-"}
                  </h2>
                  <p className="text-xs font-bold text-white/60 mt-1">
                    {selectedProduct.itemCode || "-"}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <StatusBadge status={selectedProduct.status} />
                  <button onClick={() => setSelectedProduct(null)} className="p-2 rounded-full text-slate-300 hover:bg-white/10">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-white/10 pt-8 relative z-10">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">Lotnummer</p>
                  <p className="text-lg font-black text-sky-300">{selectedProduct.lotNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">Wikkelmachine</p>
                  <p className="text-lg font-black text-amber-300">{selectedProduct.lastStation || "Onbekend"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">Status</p>
                  <p className="text-lg font-black text-blue-300 uppercase">{String(selectedProduct.status || "-")}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleOpenAdjustOrderFromSelectedProduct}
                  className="p-5 bg-white rounded-3xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ArrowRight size={28} />
                  </div>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-blue-700 text-center">
                    Ordernummer wijzigen
                  </span>
                </button>
                <button
                  onClick={handleOpenRequestNewOrderFromSelectedProduct}
                  className="p-5 bg-white rounded-3xl border-2 border-slate-100 hover:border-amber-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    <Tag size={28} />
                  </div>
                  <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-amber-700 text-center">
                    Verzoek nieuw ordernummer
                  </span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 border border-slate-100 shadow-sm space-y-3">
              {activeTab === "inbox" ? (
                <>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    disabled={printing}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Printer size={20} /> {t("mazak.print_labels_forward", "Labels printen / Doorsturen")}
                  </button>
                  <button
                    onClick={handleManualPrintForward}
                    disabled={printing}
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {t("mazak.manual_print_and_forward", "Handmatig doorsturen")}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleOpenActionModal} className="w-full py-5 bg-emerald-600 text-white rounded-xl font-black uppercase text-sm shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                    <ClipboardCheck size={24} /> {t("mazak.process", "Verwerken")}
                  </button>
                  <button 
                    onClick={() => setShowPrintModal(true)} 
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 group"
                  >
                    <Printer size={16} /> {t("mazak.reprint_label", "Label herprinten")}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : selectedPlanningOrder ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 w-full">
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <button
                    onClick={() => setSelectedPlanningOrder(null)}
                    className="lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div className="mb-2">
                    <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
                      {t("productionStartModal.labels.order", "Order")}: {selectedPlanningOrder.orderId}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
                    {selectedPlanningOrder.item || "-"}
                  </h2>
                  <p className="text-xs font-bold text-white/60 mt-1">
                    {selectedPlanningOrder.itemCode || "-"}
                  </p>
                  {selectedPlanningOrderMaterialBadge && (
                    <div className="mt-2">
                      <span className="inline-block px-2.5 py-1 bg-sky-300 text-sky-950 rounded-lg text-[11px] font-black uppercase tracking-wide">
                        {selectedPlanningOrderMaterialBadge}
                      </span>
                    </div>
                  )}
                </div>
                <StatusBadge status={selectedPlanningOrder.status} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-white/10 pt-8 relative z-10">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    {t("digitalplanning.order_detail.delivery_date_aq", "Leverdatum (AQ)")}
                  </p>
                  <p className="text-lg font-black text-sky-300">
                    {selectedPlanningOrderDeliveryLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    {t("digitalplanning.order_detail.total_plan", "Orderhoeveelheid")}
                  </p>
                  <p className="text-lg font-black text-amber-300">
                    {selectedPlanningOrderQuantity} {t("digitalplanning.terminal.pieces", "stuks")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    {t("digitalplanning.terminal.made", "Gemaakt")}
                  </p>
                  <p className="text-lg font-black text-blue-300">
                    {selectedPlanningOrderProduced} {t("digitalplanning.terminal.pieces", "stuks")}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 pt-6 mt-6 relative z-10">
                <p className="text-[10px] font-black text-white/40 uppercase mb-3 tracking-widest">
                  {t("digitalplanning.terminal.active_lots", "Actieve lotnummers")} ({activePlanningOrderProducts.length})
                </p>
                {activePlanningOrderProducts.length === 0 ? (
                  <p className="text-xs font-bold text-white/60 italic">
                    {t("mazak.no_active_lots_for_order", "Nog geen actieve lotnummers voor deze order.")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activePlanningOrderProducts.map((product) => {
                      const lotKey = String(product?.lotNumber || product?.id || "-");
                      return (
                        <button
                          key={String(product?.id || lotKey)}
                          type="button"
                          onClick={() => {
                            setSelectedPlanningOrder(null);
                            setBulkSeriesProducts([]);
                            setSelectedProduct(product);
                            setActiveTab(product?.mazakLabelPrinted ? "process" : "inbox");
                          }}
                          className="text-left px-3 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition-all"
                        >
                          <p className="text-xs font-black text-white uppercase tracking-wide">{lotKey}</p>
                          <p className="text-[10px] font-bold text-white/70 truncate">
                            {String(product?.item || product?.itemCode || "-")}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
              {activeTab === "inbox"
                ? t("mazak.select_to_print", "Selecteer order om te printen")
                : activeTab === "planning"
                  ? t("mazak.select_planned_order", "Selecteer geplande order")
                  : activeTab === "adjust"
                    ? t("mazak.adjust_pick_product", "Selecteer lot voor aanpassen")
                    : activeTab === "free"
                      ? t("mazak.free_label_ready", "Vrij label gereed om te printen")
                      : t("mazak.select_to_process", "Selecteer order om te verwerken")}
            </h4>
          </div>
        )}
      </div>

      {/* Adjust Order Modal */}
      {showAdjustOrderModal && selectedAdjustProduct && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-4xl p-6 sm:p-8 max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">
                  Ordernummer wijzigen
                </h3>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  Lot: {selectedAdjustProduct.lotNumber || selectedAdjustProduct.id}
                </p>
              </div>
              <button
                onClick={() => setShowAdjustOrderModal(false)}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
                disabled={adjustSubmitting}
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row gap-6">
              {/* Left side: Search & Input */}
              <div className="flex-1 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={adjustOrderSearch}
                      onChange={(e) => setAdjustOrderSearch(e.target.value)}
                      placeholder={t("mazak.adjust_target_search", "Zoek doelorder (ordernummer of type)...")}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>

                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    {selectedAdjustFlangeSize
                      ? t("mazak.adjust_size_filter_active", "Filter actief: alleen flensmaat FL {{size}}", { size: selectedAdjustFlangeSize })
                      : selectedAdjustOrderFamily
                        ? t("mazak.adjust_family_filter_active", "Filter actief: alleen orders met ID-reeks {{family}}", { family: selectedAdjustOrderFamily })
                        : t("mazak.adjust_family_filter_missing", "Geen FL-maat of 3-cijferige ID-reeks gevonden op bronorder; filter niet toegepast")}
                  </p>

                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {adjustTargetOrders.length === 0 ? (
                      <p className="text-xs font-bold text-slate-500 italic px-1">
                        Geen passende order gevonden.
                      </p>
                    ) : (
                      adjustTargetOrders.map((order) => {
                        const orderKey = String(order.id || order.orderId || "");
                        const isSelected = String(selectedAdjustTargetOrder?.id || selectedAdjustTargetOrder?.orderId || "") === orderKey;
                        return (
                          <button
                            key={orderKey}
                            type="button"
                            onClick={() => setSelectedAdjustTargetOrder(order)}
                            className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}
                          >
                            <p className="text-xs font-black text-slate-800 uppercase tracking-wide">{order.orderId || "-"}</p>
                            <p className="text-[11px] font-bold text-slate-600 truncate">{order.item || "-"}</p>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                      {t("mazak.adjust_reason", "Opmerking / waarom (Verplicht)")}
                    </label>
                    <textarea
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      rows={3}
                      maxLength={300}
                      placeholder={t("mazak.adjust_reason_placeholder", "Waarom wordt dit lot aan een ander ordernummer gekoppeld?")}
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
              </div>

              {/* Right side: Preview */}
              <div className="flex-1 min-h-0 bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">
                   Nieuw Label Voorbeeld
                 </p>
                 {selectedAdjustTargetOrder ? (
                   <div className="flex-1 min-h-0 flex flex-col">
                     {adjustPreviewTemplates.length > 0 ? (
                       <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 max-h-[42vh]">
                         {adjustPreviewTemplates.map((template, idx) => (
                            <div key={template.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                              <p className="text-[9px] font-bold text-slate-400 mb-2 uppercase">{template.name}</p>
                              <AutoScaledLabelPreview
                                label={template}
                                data={adjustPreviewData}
                                printerDpi={mazakPrinterDpi}
                                maxScale={0.36}
                                exactBitmapPreview
                              />
                            </div>
                         ))}
                       </div>
                     ) : (
                       <p className="text-xs text-slate-400 font-bold italic">Geen geschikt flens-template gevonden.</p>
                     )}
                   </div>
                 ) : (
                   <div className="flex-1 flex items-center justify-center">
                     <p className="text-xs text-slate-400 font-bold italic text-center">
                       Selecteer een doelorder om het nieuwe label te zien.
                     </p>
                   </div>
                 )}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
               <button
                 onClick={() => setShowAdjustOrderModal(false)}
                 className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                 disabled={adjustSubmitting}
               >
                 Annuleren
               </button>
               <button
                 onClick={async () => {
                   await handleSubmitOrderReassign();
                   if (adjustSubmitting) return; // wait till finish
                   setShowAdjustOrderModal(false);
                 }}
                 disabled={adjustSubmitting || !selectedAdjustTargetOrder || !adjustReason.trim()}
                 className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
               >
                 {adjustSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                 Wijzigen & Printen
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Request New Order Modal */}
      {showRequestNewOrderModal && selectedAdjustProduct && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-xl p-6 sm:p-8 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">
                  Verzoek nieuw ordernummer
                </h3>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  Lot: {selectedAdjustProduct.lotNumber || selectedAdjustProduct.id}
                </p>
              </div>
              <button
                onClick={() => setShowRequestNewOrderModal(false)}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
                disabled={adjustSubmitting}
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
                  <p className="text-xs font-bold text-slate-600">
                    {t("mazak.adjust_no_existing_order_help", "Als er nog geen passende order in de planning staat, stuur je een bericht voor een nieuw ordernummer. Dit product blijft geparkeerd totdat het nieuwe order bestaat en je de aanpassing kunt uitvoeren.")}
                  </p>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                      Reden (Verplicht)
                    </label>
                    <textarea
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      rows={3}
                      maxLength={300}
                      placeholder="Waarom is een nieuw ordernummer nodig?"
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-amber-400 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                      Opmerking
                    </label>
                    <textarea
                      value={adjustRequestNote}
                      onChange={(e) => setAdjustRequestNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder={t("mazak.adjust_request_note", "Extra toelichting voor planner/teamleader (optioneel)")}
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-amber-400 resize-none"
                    />
                  </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
               <button
                 onClick={() => setShowRequestNewOrderModal(false)}
                 className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
                 disabled={adjustSubmitting}
               >
                 Annuleren
               </button>
               <button
                 onClick={async () => {
                   await handleRequestNewOrderFromPlanner();
                   if (adjustSubmitting) return; // will wait
                   setShowRequestNewOrderModal(false);
                 }}
                 disabled={adjustSubmitting || !adjustReason.trim()}
                 className="px-6 py-3 bg-amber-500 text-white rounded-xl font-black uppercase text-xs hover:bg-amber-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
               >
                 {adjustSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
                 {t("mazak.adjust_send_request", "Verzoek nieuw ordernummer versturen")}
               </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default MazakView;
