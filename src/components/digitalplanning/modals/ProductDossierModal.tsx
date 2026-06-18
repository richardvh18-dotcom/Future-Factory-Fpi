import { updatePlanningOrderPriority } from "../../../services/planningSecurityService";
import React, { useState, useMemo, useRef } from "react";
import {
  X,
  Info,
  Ruler,
  ShieldCheck,
  Box,
  History,
  Activity,
  FileText,
  AlertTriangle,
  Plus,
  ArrowRightLeft,
  RefreshCw,
  Loader2,
  Star,
  Zap,
  Eye,
  EyeOff,
  Printer,
  Download,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import StatusBadge from "../common/StatusBadge";
import { WORKSTATIONS, REJECTION_REASONS } from "../../../utils/workstationLogic";
import { format } from "date-fns";
import { findDrawingForOrder, syncOrderDrawing } from "../../../utils/drawingLinker";
import { collection, query, where, getDocs, getDoc, doc, arrayUnion, limit } from "firebase/firestore";
import { db, logActivity } from "../../../config/firebase";
import { resolvePrinterForRouting } from "../../../utils/printRouting";
import { PATHS, getPathString } from "../../../config/dbPaths";
import { useAdminAuth } from "../../../hooks/useAdminAuth";
import ProductDetailModal from "../../products/ProductDetailModal";
import AutoScaledLabelPreview from "../../printer/AutoScaledLabelPreview";
import { useLabelPreview } from "../../../hooks/useLabelPreview";
import { getDriver } from "../../../utils/printerDrivers";
import { renderLabelToBitmapZpl } from "../../../utils/unifiedLabelRenderEngine";
import ConfirmationModal from "./ConfirmationModal";
import { formatDateTimeSafe, toDateSafe } from "../../../utils/dateUtils";
import { useNotifications } from '../../../contexts/NotificationContext';
import {
  rejectTrackedProductFinal,
  queuePrintJob,
  restoreArchivedTrackedProduct,
} from "../../../services/planningSecurityService";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

type DateLikeInput =
  | Date
  | string
  | number
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

const getMeasurementLabel = (key: string, t: any): string => {
  const labels: Record<string, string> = {
    "RI_Department": t("qc.meas_department", "Afdeling"),
    "Brix_Department": t("qc.meas_department", "Afdeling"),
    "RI_Kitchen": t("qc.meas_kitchen", "Harskeuken"),
    "Brix_Kitchen": t("qc.meas_kitchen", "Harskeuken"),
    "RI_TapPoint": t("qc.meas_tappoint", "Aftappunt"),
    "Brix_TapPoint": t("qc.meas_tappoint", "Aftappunt"),
    "RI_Shift": t("qc.meas_shift", "Ploeg"),
    "Brix_Shift": t("qc.meas_shift", "Ploeg"),
    "RI_Operator": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "Brix_Operator": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "RI_OperatorNumber": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "Brix_OperatorNumber": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "operator": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "operatorNumber": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "OperatorNumber": t("qc.meas_operator", "Operator (Personeelsnr)"),
    "Operator": t("qc.meas_operator_short", "Operator"),
    "RI_TableRef": t("qc.meas_tableref", "Tabelreferentie"),
    "Brix_TableRef": t("qc.meas_tableref", "Tabelreferentie"),
    "RI_Table": t("qc.meas_tableref", "Tabelreferentie"),
    "Brix_Table": t("qc.meas_tableref", "Tabelreferentie"),
    "RI_ResinWeight": t("qc.meas_resin_g", "Ingewogen Hars (g)"),
    "Brix_ResinWeight": t("qc.meas_resin_g", "Ingewogen Hars (g)"),
    "RI_Resin": t("qc.meas_resin_g", "Ingewogen Hars (g)"),
    "Brix_Resin": t("qc.meas_resin_g", "Ingewogen Hars (g)"),
    "RI_HardenerWeight": t("qc.meas_hardener_g", "Ingewogen Harder (g)"),
    "Brix_HardenerWeight": t("qc.meas_hardener_g", "Ingewogen Harder (g)"),
    "RI_IPD": t("qc.meas_ipd_g", "Ingewogen IPD (g)"),
    "Brix_IPD": t("qc.meas_ipd_g", "Ingewogen IPD (g)"),
    "RI": t("qc.meas_brix", "Brekingsindex"),
    "Brix": t("qc.meas_brix", "Brekingsindex"),
    "RI_Ratio": t("qc.meas_ratio", "Mengverhouding"),
    "Brix_Ratio": t("qc.meas_ratio", "Mengverhouding"),
    "RI_Area": t("qc.meas_area", "Acceptatieniveau (Area)"),
    "Brix_Area": t("qc.meas_area", "Acceptatieniveau (Area)"),
    "RI_VisualCheck": t("qc.meas_visual", "Visuele Check"),
    "Brix_VisualCheck": t("qc.meas_visual", "Visuele Check"),
    "Tg": t("qc.meas_tg", "Tg Meting (°C)"),
    "TW": t("qc.meas_tw", "Wanddikte (TW)"),
    "TF": t("qc.meas_tf", "Flensdikte (TF)"),
    "TWco": t("qc.meas_twco", "Wanddikte Mof (TWco)"),
    "TWc": t("qc.meas_twc", "Wanddikte Mof (TWc)"),
    "TWcb": t("qc.meas_twcb", "Wanddikte CB-Mof (TWcb)"),
    "TWtb": t("qc.meas_twtb", "Wanddikte TB-Mof (TWtb)"),
  };
  return labels[key] || key;
};

const MEASUREMENT_ORDER = [
  "RI_Department",
  "RI_Kitchen",
  "RI_TapPoint",
  "RI_Shift",
  "RI_Operator",
  "RI_OperatorNumber",
  "Brix_Department",
  "Brix_Kitchen",
  "Brix_TapPoint",
  "Brix_Shift",
  "Brix_Operator",
  "Brix_OperatorNumber",
  "operator",
  "operatorNumber",
  "OperatorNumber",
  "Operator",
  "RI_TableRef",
  "RI_Table",
  "RI_ResinWeight",
  "RI_Resin",
  "RI_HardenerWeight",
  "RI_IPD",
  "RI",
  "RI_Ratio",
  "RI_Area",
  "RI_VisualCheck",
  "Brix_TableRef",
  "Brix_Table",
  "Brix_ResinWeight",
  "Brix_Resin",
  "Brix_HardenerWeight",
  "Brix_IPD",
  "Brix",
  "Brix_Ratio",
  "Brix_Area",
  "Brix_VisualCheck",
  "Tg",
  "TF",
  "TW",
  "TWco",
  "TWc",
  "TWcb",
  "TWtb"
];

const formatMeasurementValue = (key: string, value: any, t: any): string => {
  const strVal = String(value);
  if (key === "Brix_VisualCheck" || key === "RI_VisualCheck") {
    if (value === true || strVal.toLowerCase() === "true") return t("qc.visual_check_ok", "Ja (Akkoord)");
    if (value === false || strVal.toLowerCase() === "false") return t("qc.visual_check_nok", "Nee (Afgekeurd)");
  }
  if (key === "Brix_Shift" || key === "RI_Shift") {
    const s = strVal.toLowerCase().trim();
    if (["mo", "morning", "ochtend", "vroeg", "v"].includes(s)) return t("qc.shift_morning", "Ochtend");
    if (["af", "afternoon", "middag", "m", "mi"].includes(s)) return t("qc.shift_afternoon", "Middag");
    if (["ev", "evening", "avond", "a", "av"].includes(s)) return t("qc.shift_evening", "Avond");
    if (["ni", "night", "nacht", "n", "na"].includes(s)) return t("qc.shift_night", "Nacht");
  }
  if (["Brix_ResinWeight", "Brix_HardenerWeight", "Brix_Resin", "Brix_IPD", "RI_ResinWeight", "RI_HardenerWeight", "RI_Resin", "RI_IPD"].includes(key)) {
    const numVal = parseFloat(strVal);
    if (!isNaN(numVal)) {
      return numVal.toFixed(3);
    }
  }
  return strVal;
};

/**
 * ProductDossierModal: Toont proces-stappen, kwaliteitsmetingen en order-info.
 * Ondersteunt nu ook het toevoegen van QC rapporten/klachten en het verplaatsen van producten.
 */
type DossierProduct = {
  id: string;
  lotNumber?: string;
  orderId?: string;
  order?: string;
  orderNumber?: string;
  orderNr?: string;
  parentOrderId?: string;
  item?: string;
  itemCode?: string;
  labelZPL?: string;
  labelTemplateId?: string | null;
  archived?: boolean;
  isArchivedOrder?: boolean;
  archivedAt?: DateLikeInput;
  inspection?: { 
    status?: string;
    reasons?: string[];
  };
  note?: string;
  qcNotes?: Array<{ user?: string; timestamp?: DateLikeInput; text?: string }>;
  measurements?: Record<string, string | number>;
  history?: HistoryEntry[];
  currentStep?: string;
  currentStation?: string;
  machine?: string;
  originMachine?: string;
  extraCode?: string;
  startTime?: DateLikeInput;
  createdAt?: DateLikeInput;
  sourceDataId?: string;
  sourcePath?: string;
  __docPath?: string;
  archiveDocId?: string;
};

type DossierOrder = {
  id?: string;
  orderId?: string;
  order?: string;
  orderNumber?: string;
  orderNr?: string;
  drawing?: string;
  priority?: string | boolean;
  __docPath?: string;
  item?: string;
  itemCode?: string;
  productId?: string;
  manufacturedId?: string;
  articleCode?: string;
  customer?: string;
  project?: string;
  deliveryDate?: DateLikeInput;
  notes?: string;
  extraCode?: string;
  plan?: number;
  liveFinish?: number;
  isMoved?: boolean;
};

type CatalogProduct = {
  id: string;
  itemCode?: string;
  [key: string]: unknown;
};

type HistoryEntry = {
  id?: string;
  action?: string;
  details?: string;
  station?: string;
  timestamp?: DateLikeInput;
  time?: DateLikeInput;
  user?: string;
  operator?: string;
  operatorName?: string;
  operatorNumber?: string;
};

type PrintQueueJob = {
  id: string;
  zpl?: string;
  printData?: string;
  createdAt?: { toMillis?: () => number };
  metadata?: { 
    templateId?: string | null;
    lotNumber?: string;
    orderId?: string;
  };
};

type ProductDossierModalProps = {
  isOpen: boolean;
  product: DossierProduct | null;
  onClose: () => void;
  orders?: DossierOrder[];
  onAddNote?: (productId: string, note: string) => void | Promise<void>;
  onMoveLot?: (productId: string, targetStation: string, options?: Record<string, unknown>) => void | Promise<void>;
  currentDepartment?: string;
  allowedStations?: { id: string; name: string }[];
};

const ProductDossierModal = ({
  isOpen,
  product,
  onClose,
  orders = [],
  onAddNote,
  onMoveLot,
  currentDepartment,
  allowedStations = [],
}: ProductDossierModalProps) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [newNote, setNewNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [targetStation, setTargetStation] = useState("");
  const [repairInstruction, setRepairInstruction] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [catalogProduct, setCatalogProduct] = useState<CatalogProduct | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [historyWithOperators, setHistoryWithOperators] = useState<HistoryEntry[]>([]);
  const [isReprinting, setIsReprinting] = useState(false);
  const [reprintQuantity, setReprintQuantity] = useState("1");
  const [showLabelPreview, setShowLabelPreview] = useState(false);
  const [resolvedLabelZPL, setResolvedLabelZPL] = useState("");
  const [resolvedLabelTemplateId, setResolvedLabelTemplateId] = useState<string | null>(null);
  const [isResolvingLabel, setIsResolvingLabel] = useState(false);
  const { role, user } = useAdminAuth() as { role?: string | null; user?: { uid: string; email: string } | null };
  const canEditPriority = ["admin", "teamleader"].includes(String(role || "").toLowerCase());
  const [showConfirmMove, setShowConfirmMove] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");

  const notifyAny = notify as (message: string) => void;

  const labelProductData = useMemo(() => product ? {
    ...product,
    orderNumber: product.orderId || product.orderNumber,
    lotNumber: product.lotNumber,
    item: product.item,
  } : {}, [product]);
  const { selectedLabel: dossierLabel, previewData: dossierPreviewData } = useLabelPreview(labelProductData, resolvedLabelTemplateId || undefined) as {
    selectedLabel?: { width?: number; height?: number } | null;
    previewData?: Record<string, unknown>;
  };


  const isTijdelijkeAfkeur = product?.inspection?.status === "Tijdelijke afkeur";
  const qualityStatusLabel = String(product?.inspection?.status || "Niet gecontroleerd");
  const measurementCount = product?.measurements ? Object.keys(product.measurements).length : 0;
  const inspectionReasonCount = Array.isArray(product?.inspection?.reasons)
    ? product.inspection.reasons.length
    : 0;
  const isArchivedProduct = Boolean(product?.archived || product?.isArchivedOrder || product?.archivedAt);

  const REJECTION_REASON_LABELS: Record<string, string> = {
    "rejection.surfaceDamage": "Oppervlakteschade",
    "rejection.dimensionDeviation": "Maatafwijking (TW/TF/W)",
    "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
    "rejection.incorrectLabel": "Onjuist label",
    "rejection.linerDamaged": "Liner beschadigd",
    "rejection.qcSample": "QC Steekproef",
    "rejection.other": "Overig",
  };

  const toggleRejectReason = (reason: string) => {
    setRejectReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleDrawingSync = async () => {
    const hasCode = parentOrder.itemCode || parentOrder.item || parentOrder.productId || parentOrder.manufacturedId || parentOrder.articleCode;
    if (!hasCode) return;
    setIsSyncing(true);
    const drawing = await findDrawingForOrder(parentOrder);
    if (drawing) {
      if (parentOrder.id) {
        await syncOrderDrawing(parentOrder.id, drawing);
      }
    } else {
      console.warn("[Dossier Sync] Geen tekening gevonden voor order:", parentOrder.id, { itemCode: parentOrder.itemCode, item: parentOrder.item, productId: parentOrder.productId });
    }
    setIsSyncing(false);
  };

  const handleSetPriority = async (level: string) => {
    const parentOrderDocId = parentOrder.__docPath || parentOrder.id;
    if (!parentOrderDocId) return;
    // Toggle logic: als huidge priority gelijk is aan gekozen level, zet uit (false)
    const currentPrio =
      parentOrder.priority === true
        ? "high"
        : String(parentOrder.priority || "").toLowerCase().trim();
    const newPriority = currentPrio === level ? false : level;

    try {
      await updatePlanningOrderPriority({
        orderDocId: parentOrderDocId,
        priority: newPriority,
        productDocId: product?.id || "",
        source: "ProductDossierModal",
        actorLabel: user?.email || role || "Admin",
      });

      await logActivity(
        user?.uid || "system",
        "ORDER_PRIORITY_UPDATE",
        `Dossier prioriteit gewijzigd: order ${parentOrder.id || displayOrderId}, naar ${newPriority || "normaal"}`
      );
    } catch (e: unknown) {
      console.error("Fout bij wijzigen prioriteit:", getErrorMessage(e));
    }
  };

  if (!isOpen || !product) return null;

  const productOrderId =
    product.orderId ||
    product.order ||
    product.orderNumber ||
    product.orderNr ||
    product.parentOrderId ||
    "";

  const parentOrder: DossierOrder =
    orders.find((o) => {
      const orderKeys = [o.orderId, o.order, o.orderNumber, o.orderNr, o.id]
        .filter(Boolean)
        .map((v) => String(v));
      return orderKeys.includes(String(productOrderId));
    }) || ({} as DossierOrder);

  const displayOrderId =
    productOrderId ||
    parentOrder.orderId ||
    parentOrder.orderNumber ||
    parentOrder.order ||
    parentOrder.orderNr ||
    parentOrder.id ||
    "-";

  const hasDrawing = parentOrder.drawing && parentOrder.drawing !== "-" && parentOrder.drawing !== "";
  const effectiveLabelZPL = String(resolvedLabelZPL || product?.labelZPL || "").trim();
  const normalizedParentPriority =
    parentOrder.priority === true
      ? "high"
      : String(parentOrder.priority || "").toLowerCase().trim();

  React.useEffect(() => {
    const resolveLabelFromQueue = async () => {
      if (!isOpen || !product) return;

      const directZpl = String(product?.labelZPL || "").trim();
      if (directZpl) {
        setResolvedLabelZPL(directZpl);
        setResolvedLabelTemplateId(product?.labelTemplateId || null);
        return;
      }

      const lot = String(product?.lotNumber || product?.id || "").trim();
      const order = String(product?.orderId || productOrderId || "").trim();
      if (!lot && !order) {
        setResolvedLabelZPL("");
        setResolvedLabelTemplateId(null);
        return;
      }

      setIsResolvingLabel(true);
      try {
        const queuePath: string[] = (PATHS?.PRINT_QUEUE as string[]) || ["future-factory", "production", "print_queue"];
        const queueRef = collection(db, getPathString(queuePath as string[]));
        const calls: Array<Promise<import("firebase/firestore").QuerySnapshot>> = [];

        if (lot) calls.push(getDocs(query(queueRef, where("metadata.lotNumber", "==", lot), limit(20))));
        if (order) calls.push(getDocs(query(queueRef, where("metadata.orderId", "==", order), limit(20))));

        const snaps = await Promise.all(calls);
        const candidates: PrintQueueJob[] = snaps.flatMap((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as PrintQueueJob))
        );

        const uniqueById = new Map(candidates.map((c) => [c.id, c]));
        const best = Array.from(uniqueById.values())
          .filter((j) => String(j?.zpl || j?.printData || "").trim())
          .sort((a, b) => {
            const ta = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          })[0];

        setResolvedLabelZPL(String(best?.zpl || best?.printData || "").trim());
        setResolvedLabelTemplateId(best?.metadata?.templateId || null);
      } catch (e: unknown) {
        console.warn("Kon labeldata niet uit print queue ophalen:", getErrorMessage(e));
        setResolvedLabelZPL("");
        setResolvedLabelTemplateId(null);
      } finally {
        setIsResolvingLabel(false);
      }
    };

    resolveLabelFromQueue();
  }, [isOpen, product, productOrderId]);

  React.useEffect(() => {
    if (!isOpen) return;
    setShowLabelPreview(false);
  }, [isOpen, product?.id, product?.lotNumber]);

  const handleOpenDetail = async () => {
    if (!hasDrawing) return;
    
    setLoadingCatalog(true);
    try {
      const productsRef = collection(db, getPathString(PATHS.PRODUCTS as string[]));
      const drawingId = parentOrder.drawing;
      if (!drawingId) return;
      
      // Eerst probeer direct op document ID (manualSyncDrawings slaat product ID op)
      const directRef = doc(db, `${getPathString(PATHS.PRODUCTS as string[])}/${drawingId}`);
      const directSnap = await getDoc(directRef);
      
      if (directSnap.exists()) {
        setCatalogProduct({ id: directSnap.id, ...directSnap.data() });
        setShowDetailModal(true);
      } else {
        // Fallback: zoek op articleCode
        const q = query(productsRef, where("articleCode", "==", drawingId));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          setCatalogProduct({ id: snap.docs[0].id, ...snap.docs[0].data() });
          setShowDetailModal(true);
        } else {
          // Materiaalvariant fallback: CST(C) ↔ EST(E) op positie 6
          const upper = drawingId.toUpperCase();
          let variantCode = null;
          if (upper.length >= 8) {
            if (upper[6] === "C") variantCode = upper.slice(0, 6) + "E" + upper.slice(7);
            else if (upper[6] === "E") variantCode = upper.slice(0, 6) + "C" + upper.slice(7);
          }
          if (variantCode) {
            const vq = query(productsRef, where("articleCode", "==", variantCode));
            const vSnap = await getDocs(vq);
            if (!vSnap.empty) {
              setCatalogProduct({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
              setShowDetailModal(true);
            } else {
              notify("Geen product gevonden in catalogus met deze tekening.");
            }
          } else {
            notify("Geen product gevonden in catalogus met deze tekening.");
          }
        }
      }
    } catch (e: unknown) {
      console.error("Fout bij openen product detail:", getErrorMessage(e));
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Stations lijst opschonen (BH31 toevoegen, dubbele BM01 verwijderen)
  const sortedStations = useMemo(() => {
    const stations = [...WORKSTATIONS];
    
    // Check of BH31 ontbreekt en voeg toe
    if (!stations.find((s: any) => s.id === "BH31")) {
      stations.push({ id: "BH31", name: "BH31" } as any);
    }

    // Filter "Station BM01" en duplicaten
    const uniqueStations = stations.filter((s: any, index: number, self: any[]) => 
      index === self.findIndex((t: any) => t.id === s.id) && 
      s.id !== "Station BM01" && s.name !== "Station BM01"
    );

    return uniqueStations.sort((a: any, b: any) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, []);

  const moveStations = useMemo(() => {
    if (isArchivedProduct) {
      const allowed = new Set(["BH31", "Nabewerking", "BM01"]);
      return sortedStations.filter((s: any) => allowed.has(s.id));
    }
    if (!isTijdelijkeAfkeur) return sortedStations;
    const allowed = new Set(["BH31", "Nabewerking", "LOSSEN"]);
    return sortedStations.filter((s: any) => allowed.has(s.id));
  }, [isArchivedProduct, isTijdelijkeAfkeur, sortedStations]);

  // Effect: Verrijk historie met operator data uit occupancy als deze ontbreekt
  React.useEffect(() => {
    const enrichHistory = async () => {
      if (!product?.history) {
        setHistoryWithOperators([]);
        return;
      }

      const enriched = await Promise.all((product.history || []).map(async (entry: HistoryEntry) => {
        // Als operator al bekend is in de entry, gebruik die
        if (entry.operator || entry.operatorNumber || entry.operatorName) return entry;
        
        // Als we geen station of tijd hebben, kunnen we niet zoeken
        if (!entry.station || (!entry.timestamp && !entry.time)) return entry;

        try {
          const ts = toDateSafe((entry.timestamp || entry.time) as any);
          if (!ts || isNaN(ts.getTime())) return entry;
          
          const dateStr = ts.toISOString().split('T')[0];
          const station = entry.station;

          // Zoek in occupancy (eerst exact, dan uppercase)
          let q = query(
            collection(db, getPathString(PATHS.OCCUPANCY as string[])),
            where("date", "==", dateStr),
            where("machineId", "==", station)
          );
          let snap = await getDocs(q);

          if (snap.empty) {
             q = query(collection(db, getPathString(PATHS.OCCUPANCY as string[])), where("date", "==", dateStr), where("machineId", "==", station.toUpperCase()));
             snap = await getDocs(q);
          }

          if (!snap.empty) {
            const opData = snap.docs[0].data();
            return { ...entry, operatorName: opData.operatorName, operatorNumber: opData.operatorNumber };
          }
        } catch (e: unknown) {
          console.warn("Kon historie niet verrijken:", getErrorMessage(e));
        }
        return entry;
      }));
      setHistoryWithOperators(enriched);
    };
    enrichHistory();
  }, [product, isOpen]);

  const formatDeadline = (val: unknown) => {
    const date = toDateSafe(val as any);
    if (date) return format(date, "dd-MM-yyyy");
    return String(val || "-");
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF();
      
      doc.setFontSize(22);
      doc.text("Productpaspoort", 14, 20);
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Lotnummer:", 14, 32);
      doc.setFont("helvetica", "normal");
      doc.text(String(product?.lotNumber || "-"), 45, 32);
      
      doc.setFont("helvetica", "bold");
      doc.text("Order:", 14, 38);
      doc.setFont("helvetica", "normal");
      doc.text(String(displayOrderId), 45, 38);

      doc.setFont("helvetica", "bold");
      doc.text("Product:", 14, 44);
      doc.setFont("helvetica", "normal");
      doc.text(String(product?.item || parentOrder?.item || "-"), 45, 44);
      
      doc.setFont("helvetica", "bold");
      doc.text("Status:", 14, 50);
      doc.setFont("helvetica", "normal");
      doc.text(String(product?.status || "-"), 45, 50);

      doc.setFont("helvetica", "bold");
      doc.text("QC Samenvatting:", 14, 56);
      doc.setFont("helvetica", "normal");
      doc.text(`Status: ${qualityStatusLabel}`, 45, 56);
      doc.text(`Metingen: ${measurementCount}`, 110, 56);
      doc.text(`Bevindingen: ${inspectionReasonCount}`, 150, 56);
      
      let startY = 64;

      if (product?.measurements && Object.keys(product.measurements).length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Kwaliteitsmetingen (QC)", 14, startY);
        
        const sortedMeas = Object.entries(product.measurements).sort(([keyA], [keyB]) => {
            const orderA = MEASUREMENT_ORDER.indexOf(keyA);
            const orderB = MEASUREMENT_ORDER.indexOf(keyB);
            if (orderA !== -1 && orderB !== -1) return orderA - orderB;
            if (orderA !== -1) return -1;
            if (orderB !== -1) return 1;
            return keyA.localeCompare(keyB);
        });

        const measBody: any[] = [];
        let lastCategory = "";
        
        sortedMeas.forEach(([k, v]) => {
          let category = t("qc.cat_other", "Overige Metingen");
          if (k.startsWith("Brix") || k.startsWith("RI")) category = t("qc.cat_brix", "Brekingsindex");
          else if (k === "Tg") category = t("qc.cat_tg", "Laboratorium (Tg)");
          else if (["TW", "TF", "TWco", "TWc", "TWcb", "TWtb"].includes(k)) category = t("qc.cat_physical", "Fysieke Metingen (Operator)");

          if (category !== lastCategory) {
            measBody.push([{ content: category, colSpan: 2, styles: { fillColor: [238, 242, 255], textColor: [49, 46, 129], fontStyle: 'bold' } }]);
            lastCategory = category;
          }
          measBody.push([getMeasurementLabel(k, t), formatMeasurementValue(k, v, t)]);
        });

        (doc as any).autoTable({
          startY: startY + 5,
          head: [['Meting', 'Waarde']],
          body: measBody,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] }
        });
        startY = (doc as any).lastAutoTable.finalY + 15;
      }

      if (product?.inspection?.reasons && product.inspection.reasons.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Inspectie Bevindingen", 14, startY);
        
        const inspBody = product.inspection.reasons.map(r => [r]);
        (doc as any).autoTable({
          startY: startY + 5,
          head: [['Reden / Afwijking']],
          body: inspBody,
          theme: 'grid',
          headStyles: { fillColor: [244, 63, 94] }
        });
        startY = (doc as any).lastAutoTable.finalY + 15;
      }

      if (historyWithOperators && historyWithOperators.length > 0) {
         doc.setFontSize(14);
         doc.setFont("helvetica", "bold");
         doc.text("Proceshistorie", 14, startY);
         
         const histBody = historyWithOperators.map(h => [
           formatDateTimeSafe(h.time || h.timestamp),
           h.station || "-",
           h.action || "-",
           h.operatorName || h.operatorNumber || h.user || "Systeem"
         ]);
         
         (doc as any).autoTable({
           startY: startY + 5,
           head: [['Tijdstip', 'Station', 'Actie', 'Door']],
           body: histBody,
           theme: 'grid',
           headStyles: { fillColor: [100, 116, 139] },
           styles: { fontSize: 8 }
         });
      }
      
      doc.save(`Productpaspoort_${product?.lotNumber || "unknown"}.pdf`);
    } catch (err: any) {
      console.error(err);
      notifyAny("Kon PDF niet genereren.");
    }
  };

  const handleDefinitiveRejection = async () => {
    if (!product?.id || rejectReasons.length === 0) return;
    setRejectLoading(true);
    const reasonLabels = rejectReasons.map(r => REJECTION_REASON_LABELS[r] || r).join(", ");
    try {
      await rejectTrackedProductFinal({
        productId: product.id,
        reasons: rejectReasons,
        note: rejectNote || "",
        source: "ProductDossierModal",
        actorLabel: role || "Systeem",
      });

      await logActivity(
        user?.uid || "system",
        "QUALITY_REJECT_FINAL",
        `Definitieve afkeur: lot ${product.lotNumber || product.id}, order ${displayOrderId}, redenen: ${reasonLabels}${rejectNote ? `; opmerking: ${rejectNote}` : ""}`
      );
    } catch (err: unknown) {
      console.error("Fout bij definitieve afkeur:", getErrorMessage(err));
    } finally {
      setRejectLoading(false);
      setShowConfirmReject(false);
      setRejectReasons([]);
      setRejectNote("");
      onClose();
    }
  };

  const handleExecuteMove = async () => {
    if (!targetStation) return;

    const productMoveIdentifier = String(
      isArchivedProduct
        ? product?.archiveDocId || product?.lotNumber || product?.sourceDataId || product?.id || ""
        : product?.sourcePath || product?.__docPath || product?.id || product?.lotNumber || ""
    ).trim();
    if (!productMoveIdentifier) return;

    const restoreRouteMap: Record<string, string> = {
      BH31: "BH31",
      NABEWERKING: "NABEWERKING",
      BM01: "BM01",
    };
    const restoreTargetRoute = restoreRouteMap[String(targetStation || "").trim().toUpperCase()] || null;
    
    setOverrideLoading(true);
    try {
      if (isArchivedProduct) {
        if (!restoreTargetRoute) {
          throw new Error("Gearchiveerde producten kunnen alleen worden heropend naar BH31, Nabewerking of BM01.");
        }

        await restoreArchivedTrackedProduct({
          productId: productMoveIdentifier,
          targetRoute: restoreTargetRoute,
          note: repairInstruction.trim(),
          sourceContext: "TEAMLEADER_FULL_LIST",
        });
      } else {
        if (onMoveLot) {
          await onMoveLot(productMoveIdentifier, targetStation, {
            isRepairMove: isTijdelijkeAfkeur,
            repairInstruction: repairInstruction.trim(),
          });
        }
      }

      // Planning order machine/week updates lopen nu server-side via moveTrackedProductManual callable.

      await logActivity(
        user?.uid || "system",
        isArchivedProduct ? "ARCHIVED_LOT_RESTORE" : "LOT_MANUAL_MOVE",
        `${isArchivedProduct ? "Heropend uit archief" : isTijdelijkeAfkeur ? "Reparatie verplaatsing" : "Handmatige verplaatsing"}: lot ${product.lotNumber || product.id} -> ${targetStation} (order ${displayOrderId})${repairInstruction.trim() ? ` | instructie: ${repairInstruction.trim()}` : ""}`
      );

      setIsMoving(false);
      setRepairInstruction("");
      onClose();
    } finally {
      setOverrideLoading(false);
    }
  };

  const printerHasStation = (printer: Record<string, unknown>, station: string) => {
    if (!printer || !station) return false;
    const linked = Array.isArray(printer.linkedStations) ? printer.linkedStations : [];
    const queue = Array.isArray(printer.queueStations) ? printer.queueStations : [];
    return [...linked, ...queue].includes(station);
  };

  const handleReprintLabel = async () => {
    let zplToReprint = String(effectiveLabelZPL || "").trim();
    if (!zplToReprint && !dossierLabel) {
      notify("Geen labeldata gevonden om te herprinten.");
      return;
    }

    setIsReprinting(true);
    try {
      const BM01_STATION = "BM01";
      const quantity = Math.max(1, parseInt(reprintQuantity, 10) || 1);
      const prnPaths: string[] = (PATHS?.PRINTERS as string[]) || ["future-factory", "settings", "printers"];
      const snap = await getDocs(collection(db, getPathString(prnPaths as string[])));
      const printers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));

      const targetPrinter = resolvePrinterForRouting(printers, {
        stationId: BM01_STATION,
        routeKey: `STATION:${BM01_STATION}`,
      });

      if (!targetPrinter) {
        throw new Error("Geen printer gevonden voor BM01 routing in Printer Beheer.");
      }

      if (dossierLabel && dossierPreviewData) {
        const driver = getDriver(targetPrinter as Record<string, unknown>);
        const widthMm = Number((dossierLabel as any)?.width) || 90;
        const heightMm = Number((dossierLabel as any)?.height) || 40;
        zplToReprint = await renderLabelToBitmapZpl({
          template: dossierLabel as any,
          data: dossierPreviewData as Record<string, unknown>,
          printerDpi: Number(driver.nativeDpi) || 203,
          darkness: Number((targetPrinter as Record<string, unknown>)?.darkness) || driver.defaultDarkness || 15,
          printSpeed: Number((targetPrinter as Record<string, unknown>)?.speed) || driver.defaultSpeed || 3,
          widthMm,
          heightMm,
        });
      }

      await queuePrintJob(targetPrinter.id, zplToReprint, {
        description: `Herprint label voor ${displayOrderId} (Lot: ${product.lotNumber || product.id || "-"}) (x${quantity})`,
        quantity,
        orderId: displayOrderId,
        lotNumber: product.lotNumber || product.id || null,
        stationId: BM01_STATION,
        templateId: product.labelTemplateId || resolvedLabelTemplateId || null,
        targetPrinterName: String((targetPrinter as Record<string, unknown>).name || targetPrinter.id),
        source: "product_dossier_reprint",
      });

      await logActivity(
        user?.uid || "system",
        "LABEL_REPRINT",
        `Herprint aangevraagd: order ${displayOrderId}, lot ${product.lotNumber || product.id || "-"}, printer ${targetPrinter.id}, aantal ${quantity}`
      );

      notify(`${quantity} herprint(s) naar wachtrij gestuurd (${String((targetPrinter as Record<string, unknown>).name || targetPrinter.id)}) via station BM01.`);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      console.error("Herprint mislukt:", msg);
      notify(`Herprint mislukt: ${msg}`);
    } finally {
      setIsReprinting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4 lg:p-10 animate-in fade-in">
        <div className="bg-white w-full max-w-5xl rounded-[50px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] text-left">
          {/* Header */}
          <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-6">
              <div className="p-4 bg-blue-500 rounded-3xl shadow-lg">
                <Box size={32} />
              </div>
              <div>
                <h3 className="text-3xl font-black italic uppercase tracking-tight text-left">
                  {t("productDossier.product", "Product")} <span className="text-blue-400">{t("productDossier.dossier", "Dossier")}</span>
                </h3>
                <div className="text-left mt-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Lotnummer: {product.lotNumber}
                  </p>
                  <p className="text-lg font-black text-white uppercase italic leading-none mt-1">
                    {product.item || parentOrder.item || "Onbekend Item"}
                  </p>
                  {(product.extraCode || parentOrder.extraCode) && (
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mt-1">
                      Code: {product.extraCode || parentOrder.extraCode}
                    </p>
                  )}
                  {(parentOrder.priority || parentOrder.isMoved) && (
                    <p className={`text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-1 ${
                      normalizedParentPriority === "immediate" ? "text-rose-500" :
                      normalizedParentPriority === "urgent" ? "text-orange-500" :
                      "text-amber-400"
                    }`}>
                      <ArrowRightLeft size={12} /> 
                      {parentOrder.isMoved ? "Verplaatst" : ""}
                      {parentOrder.isMoved && parentOrder.priority ? " & " : ""}
                      {normalizedParentPriority === "immediate" ? "1e Prio" : 
                       normalizedParentPriority === "urgent" ? "Spoed" : 
                       (normalizedParentPriority === "high" || parentOrder.priority === true) ? "Prio" : ""}
                    </p>
                  )}
                  {canEditPriority && parentOrder.id && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={() => handleSetPriority("high")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          normalizedParentPriority === "high" || parentOrder.priority === true
                            ? "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <Star size={12} fill={normalizedParentPriority === "high" || parentOrder.priority === true ? "currentColor" : "none"} />
                        Prio
                      </button>
                      <button
                        onClick={() => handleSetPriority("urgent")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          normalizedParentPriority === "urgent"
                            ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <AlertTriangle size={12} fill={normalizedParentPriority === "urgent" ? "currentColor" : "none"} />
                        Spoed
                      </button>
                      <button
                        onClick={() => handleSetPriority("immediate")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                          normalizedParentPriority === "immediate"
                            ? "bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                        }`}
                      >
                        <Zap size={12} fill={normalizedParentPriority === "immediate" ? "currentColor" : "none"} />
                        1e Prio
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all"
            >
              <X size={28} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
            {/* Order Context */}
            <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-blue-50/50 p-8 rounded-[40px] border border-blue-100">
              <div className="lg:col-span-4 flex items-center gap-2 mb-2">
                <button
                  onClick={handleOpenDetail}
                  disabled={!hasDrawing || loadingCatalog}
                  className={`p-1 -ml-1 rounded-lg transition-all ${
                    hasDrawing 
                      ? "hover:bg-blue-100 cursor-pointer text-blue-600" 
                      : "cursor-default text-blue-600"
                  }`}
                  title={hasDrawing ? "Open Product Detail" : ""}
                >
                  {loadingCatalog ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                </button>
                <h4 className="font-black text-xs uppercase text-blue-900 tracking-widest">
                  Order Informatie
                </h4>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Order
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {displayOrderId}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Klant
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.customer || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Project
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.project || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase flex items-center gap-2">
                  Tekening
                  {(!parentOrder.drawing || parentOrder.drawing === "-" || parentOrder.drawing === "") && (
                    <button 
                      onClick={handleDrawingSync} 
                      disabled={isSyncing}
                      className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                      title="Zoek tekening in catalogus"
                    >
                      <RefreshCw size={10} className={isSyncing ? "animate-spin text-blue-600" : "text-slate-400"} />
                    </button>
                  )}
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {parentOrder.drawing || "-"}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Deadline
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {formatDeadline(parentOrder.deliveryDate)}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-black text-blue-400 uppercase">
                  Start Productie
                </span>
                <p className="text-sm font-bold text-slate-800">
                  {formatDeadline(product.startTime || product.createdAt)}
                </p>
              </div>
              {/* Extra info uit kolom H (vaak notes of po text) */}
              {parentOrder.notes && (
                <div className="lg:col-span-4 mt-2 pt-4 border-t border-blue-200/50">
                  <span className="text-[9px] font-black text-blue-400 uppercase">
                    PO Text / Opmerkingen
                  </span>
                  <p className="text-sm font-medium text-slate-700 italic">
                    {parentOrder.notes}
                  </p>
                </div>
              )}

              {/* Label sectie altijd zichtbaar; toont status/fallback als ZPL ontbreekt */}
              <div className="lg:col-span-4 mt-4 pt-4 border-t border-blue-200/50">
                <h4 className="text-[9px] font-black text-blue-400 uppercase mb-2">{t("productDossier.labelReprint", "Label (Her)print")}</h4>
                {isResolvingLabel ? (
                  <div className="bg-white/60 p-4 rounded-lg border border-blue-100/50 text-xs font-bold text-slate-500 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Labelgegevens laden...
                  </div>
                ) : effectiveLabelZPL ? (
                  <>
                    <div className="bg-white/60 rounded-lg p-3 border border-blue-100/50 flex flex-wrap items-center gap-2">
                        <select
                          value={reprintQuantity}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReprintQuantity(e.target.value)}
                          disabled={isReprinting}
                          className="text-[10px] font-bold text-slate-700 bg-white/90 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                          title="Aantal herprints"
                        >
                          <option value="1">1x</option>
                          <option value="2">2x</option>
                          <option value="5">5x</option>
                          <option value="10">10x</option>
                        </select>
                        <button
                          onClick={handleReprintLabel}
                          disabled={isReprinting}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors bg-emerald-100/80 hover:bg-emerald-200/80 px-2 py-1 rounded-md disabled:opacity-50"
                          title="Herprint label via BM01 (Print Queue)"
                        >
                          {isReprinting ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                          {isReprinting ? "Verzenden..." : "Herprint BM01"}
                        </button>
                        <button
                          onClick={() => setShowLabelPreview((prev) => !prev)}
                          className="text-[10px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 transition-colors bg-blue-100/80 hover:bg-blue-200/80 px-2 py-1 rounded-md"
                          title={showLabelPreview ? "Verberg label voorbeeld" : "Toon label voorbeeld"}
                        >
                          {showLabelPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                          {showLabelPreview ? "Verberg voorbeeld" : "Toon voorbeeld"}
                        </button>
                    </div>

                    {showLabelPreview && (
                      <div
                        className="mt-3 bg-white/60 p-3 rounded-lg border border-blue-100/50 flex items-center justify-center overflow-hidden min-h-[140px]"
                      >
                        {dossierLabel ? (
                          <AutoScaledLabelPreview
                            label={dossierLabel as any}
                            data={dossierPreviewData as any}
                            className="shadow-md"
                            maxScale={1}
                          />
                        ) : isResolvingLabel ? (
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">{t("common.loading", "Laden...")}</span>
                        ) : (
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">{t("productDossier.noLabelTemplateAvailable", "Geen labeltemplate beschikbaar")}</span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white/60 p-4 rounded-lg border border-blue-100/50 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-500">{t("productDossier.noSavedLabelForProduct", "Geen opgeslagen label gevonden voor dit product.")}</span>
                    <button
                      onClick={handleReprintLabel}
                      disabled
                      className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md cursor-not-allowed"
                      title="Geen labeldata beschikbaar"
                    >
                      Herprint BM01
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Actual Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                  Huidige Fase
                </span>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                    <Activity size={20} />
                  </div>
                  <span className="text-lg font-black text-slate-800 uppercase italic">
                    {product.currentStep}
                  </span>
                </div>
              </div>
              <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                  Kwaliteit Status
                </span>
                <StatusBadge
                  status={product.inspection?.status || "Niet gecontroleerd"}
                />
              </div>
            </div>

            {/* Extra Info: Opmerkingen, Metingen & Inspectie */}
            {(product.note ||
              product.measurements ||
              (product.inspection && product.inspection.reasons)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Opmerkingen */}
                {product.note && (
                  <div className="p-6 bg-amber-50 rounded-[32px] border border-amber-100">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <Info size={14} /> Opmerking
                    </span>
                    <p className="text-sm font-medium text-slate-700 italic">
                      "{product.note}"
                    </p>
                  </div>
                )}

                {/* Inspectie Redenen (bij afkeur/herstel) */}
                {product.inspection?.reasons &&
                  product.inspection.reasons.length > 0 && (
                    <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100">
                      <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                        <AlertTriangle size={14} /> Inspectie Bevindingen
                      </span>
                      <ul className="list-disc list-inside text-sm font-bold text-rose-700">
                        {product.inspection.reasons.map((r, i) => (
                          <li key={i}>{REJECTION_REASON_LABELS[r] || r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Metingen */}
                {product.measurements && Object.keys(product.measurements).length > 0 && (
                  <div className="p-6 bg-indigo-50 rounded-[32px] border border-indigo-100">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-4 flex items-center gap-2">
                      <Ruler size={14} /> Kwaliteitsmetingen
                    </span>
                    <div className="space-y-4">
                      {(() => {
                        const sortedEntries = Object.entries(product.measurements).sort(([keyA], [keyB]) => {
                          const idxA = MEASUREMENT_ORDER.indexOf(keyA);
                          const idxB = MEASUREMENT_ORDER.indexOf(keyB);
                          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                          if (idxA !== -1) return -1;
                          if (idxB !== -1) return 1;
                          return keyA.localeCompare(keyB);
                        });

                        const groups: { category: string; items: [string, any][] }[] = [];
                        let currentCategory = "";

                        sortedEntries.forEach(([key, val]) => {
                          let category = t("qc.cat_other", "Overige Metingen");
                          if (key.startsWith("Brix") || key.startsWith("RI")) category = t("qc.cat_brix", "Brekingsindex");
                          else if (key === "Tg") category = t("qc.cat_tg", "Laboratorium (Tg)");
                          else if (["TW", "TF", "TWco", "TWc", "TWcb", "TWtb"].includes(key)) category = t("qc.cat_physical", "Fysieke Metingen (Operator)");

                          if (category !== currentCategory) {
                            currentCategory = category;
                            groups.push({ category, items: [] });
                          }
                          groups[groups.length - 1].items.push([key, val]);
                        });

                        return groups.map((group, gIdx) => (
                          <div key={group.category} className={gIdx > 0 ? "pt-3 border-t border-indigo-200" : ""}>
                            <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">
                              {group.category}
                            </div>
                            <div className="space-y-1">
                              {group.items.map(([key, val]) => (
                                <div
                                  key={key}
                                  className="grid grid-cols-[180px_1fr] sm:grid-cols-[200px_1fr] gap-2 text-xs border-b border-indigo-100/50 pb-1 last:border-0 items-start"
                                >
                                  <span className="font-bold text-slate-600 uppercase break-words">
                                    {getMeasurementLabel(key, t)}:
                                  </span>
                                  <span className="font-mono font-black text-slate-800 break-words">
                                    {formatMeasurementValue(key, val, t)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* QC / Klachten Sectie */}
            {(onAddNote ||
              (product.qcNotes && product.qcNotes.length > 0)) && (
              <div className="p-8 bg-rose-50 rounded-[40px] border border-rose-100">
                <h4 className="flex items-center gap-3 font-black text-sm uppercase text-rose-800 mb-6 pb-4 border-b border-rose-200">
                  <AlertTriangle className="text-rose-500" size={20} />{" "}
                  Kwaliteitsrapporten & Klachten
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm">
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest block mb-1">
                      Rapportstatus
                    </span>
                    <p className="text-sm font-black text-slate-800 uppercase italic">
                      {qualityStatusLabel}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm">
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest block mb-1">
                      Meetwaarden
                    </span>
                    <p className="text-sm font-black text-slate-800 uppercase italic">
                      {measurementCount} geregistreerd
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm">
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest block mb-1">
                      QC Bevindingen
                    </span>
                    <p className="text-sm font-black text-slate-800 uppercase italic">
                      {inspectionReasonCount} geregistreerd
                    </p>
                  </div>
                </div>

                {product.qcNotes && product.qcNotes.length > 0 ? (
                  <div className="space-y-4 mb-6">
                    {product.qcNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                            {note.user || "Systeem"}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {formatDateTimeSafe(note.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">
                          {note.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-rose-400 italic mb-6">
                    Nog geen meldingen geregistreerd in dit dossier.
                  </p>
                )}

                {onAddNote &&
                  (isAdding ? (
                    <div className="bg-white p-4 rounded-2xl border border-rose-200 animate-in fade-in slide-in-from-bottom-2">
                      <textarea
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-500 min-h-[100px] mb-3"
                        placeholder={t("placeholders.dpIssueDescription", "Beschrijf de klacht, oorzaak en actie...")}
                        value={newNote}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            if (newNote.trim() && onAddNote) {
                              onAddNote(product.id, newNote);
                              setNewNote("");
                              setIsAdding(false);
                            }
                          }}
                          className="px-6 py-2 bg-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 transition-all"
                        >
                          Rapport Opslaan
                        </button>
                        <button
                          onClick={() => setIsAdding(false)}
                          className="px-6 py-2 bg-white text-slate-500 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAdding(true)}
                      className="px-6 py-3 bg-white text-rose-600 border-2 border-rose-100 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 hover:border-rose-200 transition-all flex items-center gap-2"
                    >
                      <Plus size={16} /> Nieuwe Melding Toevoegen
                    </button>
                  ))}
              </div>
            )}

            {/* History */}
            <div>
              <h4 className="flex items-center gap-3 font-black text-sm uppercase text-slate-800 mb-6 pb-4 border-b">
                <History className="text-blue-500" /> Volledige Proces Historie
              </h4>
              <div className="space-y-3">
                {(historyWithOperators.length > 0 ? historyWithOperators : (product.history || []))?.map((entry: HistoryEntry, idx: number) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div 
                      className="bg-slate-50 flex-1 p-5 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-blue-50/50 transition-colors cursor-help"
                      title={`Operator: ${entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Onbekend"}`}
                    >
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase">
                          {entry.station}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {entry.operatorNumber || entry.operatorName || entry.operator || (entry.user && entry.user.includes('@') ? entry.user.split('@')[0] : entry.user) || "Systeem"}
                        </p>
                        {(entry.action || entry.details) && (
                          <p className="text-[10px] font-medium text-slate-600 mt-1 italic">
                            {entry.action} {entry.details ? `- ${entry.details}` : ""}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-400">
                        {formatDateTimeSafe(entry.time || entry.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 text-left">
              <ShieldCheck size={24} className="text-blue-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">
                Digitaal dossier conform ISO 9001 Traceability
              </p>
            </div>
            <div className="flex gap-3">
              {isMoving ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                  <select
                    value={targetStation}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetStation(e.target.value)}
                    className="px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-xs text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">{t("common.chooseStation", "Kies station...")}</option>
                    {moveStations.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {isTijdelijkeAfkeur && (
                    <textarea
                      value={repairInstruction}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRepairInstruction(e.target.value)}
                      className="px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl font-medium text-xs text-slate-700 outline-none focus:border-blue-500 min-w-[260px] min-h-[92px]"
                      placeholder={t("placeholders.dpRepairInstruction", "Wat moet de operator repareren?")}
                    />
                  )}
                  <button
                    onClick={async () => {
                      if (!targetStation) return;
                      setShowConfirmMove(true);
                    }}
                    disabled={overrideLoading || !targetStation}
                    className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
                  >
                    {overrideLoading ? "..." : "Bevestig"}
                  </button>
                  <button
                    onClick={() => {
                      setIsMoving(false);
                      setRepairInstruction("");
                    }}
                    className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <>
                  {isTijdelijkeAfkeur && (
                    <button
                      onClick={() => setShowConfirmReject(true)}
                      disabled={rejectLoading}
                      className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg"
                    >
                      <X size={16} /> {rejectLoading ? "..." : "Definitieve Afkeur"}
                    </button>
                  )}
                  {onMoveLot && (
                    <button
                      onClick={() => setIsMoving(true)}
                      className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <ArrowRightLeft size={16} /> {isTijdelijkeAfkeur ? "Reparatie" : "Verplaats"}
                    </button>
                  )}
                <button
                  onClick={handleExportPDF}
                  className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                >
                  <Download size={16} /> PDF Paspoort
                </button>
                  <button
                    onClick={onClose}
                    className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl"
                  >
                    Sluiten
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDetailModal && catalogProduct && (
        <ProductDetailModal
          product={catalogProduct}
          onClose={() => setShowDetailModal(false)}
          userRole={role || "viewer"}
        />
      )}

      <ConfirmationModal
        isOpen={showConfirmMove}
        onClose={() => setShowConfirmMove(false)}
        onConfirm={handleExecuteMove}
        title={isArchivedProduct ? "Product Heropenen" : isTijdelijkeAfkeur ? "Reparatie Inplannen" : "Product Verplaatsen"}
        message={isArchivedProduct
          ? `Weet je zeker dat je dit gearchiveerde product wilt heropenen naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`
          : isTijdelijkeAfkeur
          ? `Weet je zeker dat je deze tijdelijke afkeur wilt doorzetten naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`
          : `Weet je zeker dat je dit product wilt verplaatsen naar ${moveStations.find(s => s.id === targetStation)?.name || targetStation}?`}
        confirmText={isArchivedProduct ? "Ja, Heropenen" : isTijdelijkeAfkeur ? "Ja, Reparatie" : "Ja, Verplaatsen"}
      />

      {showConfirmReject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]">
            <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-red-800 uppercase tracking-tight">
                  Definitieve Afkeur
                </h3>
                <p className="text-xs text-red-500 font-mono font-bold">
                  {product?.lotNumber}
                </p>
              </div>
              <button
                onClick={() => { setShowConfirmReject(false); setRejectReasons([]); setRejectNote(""); }}
                className="p-2 hover:bg-red-100 rounded-full"
              >
                <X size={20} className="text-red-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <h4 className="font-bold text-red-900 text-xs uppercase mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} /> Reden van afkeur
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {REJECTION_REASONS.map((reason) => (
                    <div
                      key={reason}
                      onClick={() => toggleRejectReason(reason)}
                      className={`p-2 rounded-lg border cursor-pointer text-xs font-medium transition-all flex items-center gap-2 ${
                        rejectReasons.includes(reason)
                          ? "bg-white border-red-500 text-red-700 shadow-sm"
                          : "bg-white/50 border-transparent text-slate-500 hover:bg-white"
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${
                          rejectReasons.includes(reason)
                            ? "bg-red-500 border-red-500"
                            : "border-slate-300"
                        }`}
                      >
                        {rejectReasons.includes(reason) && (
                          <span className="text-white text-[8px] font-bold">&#10003;</span>
                        )}
                      </div>
                      {REJECTION_REASON_LABELS[reason] || reason}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
                  Opmerking (optioneel)
                </label>
                <textarea
                  value={rejectNote}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectNote(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder={t("placeholders.dpIrreparableExample", "Bijv. kras op flensvlak, niet herstelbaar...")}
                  rows={3}
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-800">
                  &#9888; Let op: Dit kan niet ongedaan worden gemaakt. Het product wordt definitief afgekeurd.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => { setShowConfirmReject(false); setRejectReasons([]); setRejectNote(""); }}
                className="px-4 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-200 text-sm"
              >
                Annuleren
              </button>
              <button
                onClick={handleDefinitiveRejection}
                disabled={rejectLoading || rejectReasons.length === 0}
                className="px-6 py-2 rounded-lg font-bold text-white text-sm shadow-md flex items-center gap-2 transition-all bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejectLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <X size={16} />
                )}
                Definitief Afkeuren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductDossierModal;
