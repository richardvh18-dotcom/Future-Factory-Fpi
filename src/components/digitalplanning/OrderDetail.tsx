import React, { useEffect, useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  FileText,
  Trash2,
  ArrowRightLeft,
  Map,
  Factory,
  Building2,
  Cpu,
  Ban,
  Copy,
  Save,
  PauseCircle,
  PlayCircle,
  Star,
  Zap,
  Edit3,
  Printer,
  CheckCircle,
  XCircle,
  Layers,
} from "lucide-react";
import ProductMoveModal from "./ProductMoveModal";
import ProductJourneyModal from "./modals/ProductJourneyModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import ProductDetailModal from "../products/ProductDetailModal";
import CancelOrderModal from "./modals/CancelOrderModal";
import ConfirmationModal from "./modals/ConfirmationModal";
import { FileImage } from "lucide-react";
import { findDrawingForProduct } from "../../utils/findDrawingForProduct";
import { format, differenceInDays } from "date-fns";
import { collection, getDoc, getDocs, query, where, limit, doc, onSnapshot } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { trackedLotExistsActive } from "../../utils/trackedProducts";
import { countFinishedTrackedLots, getOrderFinishedUnits } from "../../utils/planningProgress";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import {
  updatePlanningOrderPriority,
  cancelPlanningOrder,
  movePlanningOrder,
  retrievePlanningOrder,
  togglePlanningOrderHold,
  updatePlanningOrderDetails,
  archivePlanningOrder,
  editTrackedProductLotNumber,
  reassignTrackedProductOrder,
  patchPlanningOrderMetadata,
} from "../../services/planningSecurityService";
import { useNotifications } from "../../contexts/NotificationContext";
import StatusBadge from "./common/StatusBadge";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getStartedCounterField } from "../../utils/hubHelpers";

type OrderDetailProps = {
  order: any;
  products?: any[];
  onClose: () => void;
  isManager?: boolean;
  onDeleteLot?: (...args: any[]) => void;
  onMoveLot?: (...args: any[]) => void;
  currentDepartment?: string | null;
  allowedStations?: StationOption[];
  onOpenDossier?: (dossier: any) => void;
  showAllStations?: boolean;
};

type ProductRecord = {
  id: string;
  lotNumber: string;
  [key: string]: any;
};
type StationOption = {
  id: string;
  name: string;
};
type MoveConfirmState = {
  type?: string;
  name?: string;
  id?: string;
} | null;

/**
 * OrderDetail V2.3
 * Toont details van een order en de voortgang van de producten.
 */

const OrderDetail = React.memo(({
  order,
  products = [],
  onClose,
  isManager = false,
  onDeleteLot,
  onMoveLot,
  currentDepartment,
  allowedStations = [],
}: OrderDetailProps) => {
  const { t } = useTranslation();
  const { user, role } = useAdminAuth();
  const { showSuccess, showError, showConfirm , notify} = useNotifications();
  const actorEmail = String(user?.email || auth.currentUser?.email || "system");
  const actorUid = String(user?.uid || auth.currentUser?.uid || "system");
  const [viewingJourney, setViewingJourney] = useState<ProductRecord | null>(null);
  const [viewingDossier, setViewingDossier] = useState<ProductRecord | null>(null);
  const [viewingDrawing, setViewingDrawing] = useState<any | null>(null);
  const [productToMove, setProductToMove] = useState<ProductRecord | null>(null);
  const [drawingLoading, setDrawingLoading] = useState(false);
  const [showOrderMoveModal, setShowOrderMoveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [moveConfirmData, setMoveConfirmData] = useState<MoveConfirmState>(null);
  const [lotEditTarget, setLotEditTarget] = useState<ProductRecord | null>(null);
  const [lotEditNewValue, setLotEditNewValue] = useState("");
  const [lotEditReason, setLotEditReason] = useState("");
  const [lotEditError, setLotEditError] = useState("");
  const [isSavingLotEdit, setIsSavingLotEdit] = useState(false);
  const [orderEditTarget, setOrderEditTarget] = useState<ProductRecord | null>(null);
  const [orderEditNewValue, setOrderEditNewValue] = useState("");
  const [orderEditReason, setOrderEditReason] = useState("");
  const [orderEditError, setOrderEditError] = useState("");
  const [isSavingOrderEdit, setIsSavingOrderEdit] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [planDraft, setPlanDraft] = useState("");
  const [todoDraft, setTodoDraft] = useState("");
  const [startedDraft, setStartedDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const autoArchiveAttemptedRef = useRef<Set<string>>(new Set());
  const [toolingMolds, setToolingMolds] = useState<any[]>([]);

  useEffect(() => {
    if (!order) return;
    const unsub = onSnapshot(
      collection(db, getPathString(PATHS.TOOLING_MOLDS as string[])),
      (snap) => {
        setToolingMolds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Fout bij ophalen mallen:", err)
    );
    return () => unsub();
  }, [order?.id]);

  const matchedMold = useMemo(() => {
    if (!order || toolingMolds.length === 0) return null;
    const code = String(order.itemCode || order.productId || "").toUpperCase().trim();
    const itemDesc = String(order.item || order.itemDescription || "").toUpperCase().trim();

    let match = toolingMolds.find(m => {
      if (m.active === false || !code) return false;
      const moldCodes = String(m.itemCode || "").toUpperCase().split(",").map(c => c.trim());
      return moldCodes.includes(code);
    });
    
    if (!match) {
      const sortedMolds = [...toolingMolds].sort((a, b) => String(b.matcher || "").length - String(a.matcher || "").length);
      match = sortedMolds.find(m => {
        if (m.active === false) return false;
        const matchers = String(m.matcher || "").toUpperCase().split("|").map(s => s.trim());
        return matchers.some(matcher => matcher && itemDesc.includes(matcher));
      });
    }
    return match || null;
  }, [order, toolingMolds]);

  const orderProducts = useMemo(() => {
    if (!order) return [];

    const targetOrderId = String(order.orderId || "").trim().toUpperCase();
    if (!targetOrderId) return [];

    const readDocIdOrderPrefix = (product: any) => {
      const path = String(product?.__docPath || product?.sourcePath || "").trim();
      const rawDocId = path ? path.split("/").pop() || "" : String(product?.id || "").trim();
      const match = rawDocId.match(/^(N\d+)_/i);
      return match ? String(match[1] || "").trim().toUpperCase() : "";
    };

    return products.filter((p: any) => {
      const fieldOrderId = String(p?.orderId || "").trim().toUpperCase();
      const docOrderPrefix = readDocIdOrderPrefix(p);

      // Als het orderId veld bestaat, moet het exact matchen.
      if (fieldOrderId && fieldOrderId !== targetOrderId) return false;

      // Als docId een orderprefix bevat, moet die ook matchen.
      if (docOrderPrefix && docOrderPrefix !== targetOrderId) return false;

      return fieldOrderId === targetOrderId || docOrderPrefix === targetOrderId;
    });
  }, [order, products]);

  const normalizedRole = String(role || "").toLowerCase();
  const canEditOrderNotes = ['admin', 'teamleader', 'planner'].includes(normalizedRole);
  const canEditOrderPlan = ['admin', 'teamleader', 'planner'].includes(normalizedRole);
  const canEditLotNumber =
    normalizedRole === "admin" ||
    normalizedRole === "teamleader" ||
    (normalizedRole.includes("teamleader") && normalizedRole.includes("admin"));
  const visibleOrderNote = String(order?.notes || order?.poText || "").trim();
  // visibleOrderPlan: als plan expliciet kleiner is dan quantity, is dat een bewuste
  // correctie door de teamleider (bijv. "nog 6 te maken van order van 10").
  // Dan is plan leidend; anders quantity (de originele orderhoeveelheid).
  const rawQuantity = Number(order?.quantity) || 0;
  const rawPlanVal = Number(order?.plan) || 0;
  const visibleOrderPlan = rawPlanVal > 0 && rawPlanVal < rawQuantity
    ? rawPlanVal
    : rawQuantity || rawPlanVal || 0;

  useEffect(() => {
    setNoteDraft(visibleOrderNote);
  }, [order?.id, order?.notes, order?.poText]);

  useEffect(() => {
    setPlanDraft(String(visibleOrderPlan || ""));
  }, [order?.id, order?.plan, visibleOrderPlan]);

  useEffect(() => {
    setTodoDraft("");
  }, [order?.id]);

  useEffect(() => {
    setStartedDraft("");
  }, [order?.id]);

  if (!order) return null;

  const formatExcelDate = (val: any) => {
    if (!val) return "-";
    if (val?.toDate) return val.toDate().toLocaleDateString("nl-NL");
    const num = parseFloat(val);
    if (!isNaN(num) && num > 30000 && num < 100000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      return date.toLocaleDateString("nl-NL");
    }
    const date = new Date(val);
    if (!isNaN(date.getTime())) return date.toLocaleDateString("nl-NL");
    return String(val);
  };

  const handleMoveOrder = async (targetType: string, targetId: string) => {
    if (!order) return;
    const orderDocId = order.__docPath || order.id;
    if (!orderDocId) { showError('Order ID niet gevonden'); return; }
    
    try {
      await movePlanningOrder({
        orderDocId,
        targetType,
        targetId,
        currentDepartment: currentDepartment || order.department || "fittings",
        source: "OrderDetail",
        actorLabel: actorEmail,
      });

      showSuccess(t("digitalplanning.order_detail.move_success", "Order succesvol verplaatst"));
      setShowOrderMoveModal(false);
      onClose();
    } catch (err: unknown) {
      console.error("Error moving order:", err);
      showError(t("digitalplanning.order_detail.move_error", "Fout bij verplaatsen: ") + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRetrieveOrder = async () => {
    if (!order) return;
    const orderDocId = order.__docPath || order.id;
    const retrieveConfirmed = await showConfirm({
      title: t("digitalplanning.order_detail.retrieve_title", "Order terughalen"),
      message: t("digitalplanning.order_detail.confirm_retrieve", `Weet je zeker dat je deze order wilt terughalen van ${order.delegatedTo || 'andere afdeling'}?`),
      confirmText: t("common.continue", "Doorgaan"),
      cancelText: t("common.cancel", "Annuleren"),
      tone: "warning",
    });
    if (!retrieveConfirmed) return;

    try {
      await retrievePlanningOrder({
        orderDocId,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });
      showSuccess(t("digitalplanning.order_detail.retrieve_success", "Order succesvol teruggehaald naar planning"));
      onClose();
    } catch (err: unknown) {
      console.error("Error retrieving order:", err);
      showError(t("digitalplanning.order_detail.retrieve_error", "Fout bij terughalen: ") + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancelOrder = async (reason: string) => {
    const orderDocId = order.__docPath || order.id;
    try {
      await cancelPlanningOrder({
        orderDocId,
        reason,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });

      await logActivity(
        actorUid,
        "ORDER_CANCELLED", 
        `Order ${order.orderId} geannuleerd. Reden: ${reason}`
      );

      setShowCancelModal(false);
      onClose();
      showSuccess(t("digitalplanning.order_detail.cancel_success", "Order succesvol geannuleerd"));
    } catch (error) {
      console.error("Fout bij annuleren:", error);
      showError(t("digitalplanning.order_detail.cancel_error", "Kon order niet annuleren"));
    }
  };

  const handleSetPriority = async (level: string) => {
    const orderDocId = order.__docPath || order.id;
    if (!orderDocId) return;
    const currentPrio = order.priority === true ? "high" : order.priority;
    const newPriority = currentPrio === level ? false : level;
    try {
      await updatePlanningOrderPriority({
        orderDocId,
        priority: newPriority,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });
    } catch (e) {
      console.error("Fout bij wijzigen prioriteit:", e);
      showError("Kon prioriteit niet wijzigen");
    }
  };

  const handleToggleHold = async () => {
    setHoldLoading(true);
    const orderDocId = order.__docPath || order.id;
    try {
      const isOnHold = order.status === 'on_hold';
      await togglePlanningOrderHold({
        orderDocId,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });
      await logActivity(
        actorUid,
        isOnHold ? "ORDER_RESUMED" : "ORDER_ON_HOLD",
        `Order ${order.orderId} ${isOnHold ? 'hervat' : 'on hold gezet'}`
      );
      showSuccess(isOnHold ? "Order hervat" : "Order on hold gezet");
    } catch (err) {
      console.error("Fout bij on hold:", err);
      showError("Kon order status niet wijzigen");
    } finally {
      setHoldLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(String(text || ""));
    showSuccess("Ordernummer gekopieerd");
  };

  const formatDateTimeForExport = (value: any) => {
    if (!value) return "-";
    const dateValue = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(dateValue.getTime())) return "-";
    return format(dateValue, "yyyy-MM-dd HH:mm");
  };

  const loadLogoDataUrl = async () => {
    try {
      const svgResponse = await fetch("/logo192.svg", { cache: "no-store" });
      if (!svgResponse.ok) return null;

      const svgText = await svgResponse.text();
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const blobUrl = URL.createObjectURL(svgBlob);

      const img = new window.Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = blobUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 192;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        return null;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("Kon logo niet laden voor PDF:", error);
      return null;
    }
  };

  const handleExportOrderOverviewPdf = async () => {
    if (!order) return;

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default || autoTableModule;
      const logoDataUrl = await loadLogoDataUrl();

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const margin = 12;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const headerTop = 10;
      const headerBottom = 44;
      const footerY = pageHeight - 6;
      const safeOrderId = String(order.orderId || order.id || "order").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
      const totalLots = orderProducts.length;
      const activeLots = orderProducts.filter((p) => {
        const status = String(p?.status || "").toLowerCase();
        const step = String(p?.currentStep || "").toLowerCase();
        return !["completed", "rejected", "afkeur"].includes(status) && !["finished", "rejected"].includes(step);
      }).length;
      const generatedAt = format(new Date(), "yyyy-MM-dd HH:mm");
      const generatedBy = String(actorEmail || "onbekend").trim();

      const drawHeaderFooter = (pageNumber: number) => {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
        doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", margin, headerTop, 10, 10);
        } else {
          doc.setFillColor(15, 23, 42);
          doc.roundedRect(margin, headerTop, 10, 10, 1.5, 1.5, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7);
          doc.text("FPi", margin + 5, headerTop + 6.8, { align: "center" });
          doc.setTextColor(15, 23, 42);
        }

        doc.setFontSize(14);
        doc.text("Orderoverzicht Teamleader", margin + 14, 16);
        doc.setFontSize(9);
        doc.text(`Order: ${order.orderId || "-"}`, margin + 14, 21);
        doc.text(`Product: ${order.item || "-"}`, margin + 14, 26);
        doc.text(`Machine: ${order.machine || "-"}`, margin + 14, 31);
        doc.text(`Plan: ${visibleOrderPlan} | Gereed: ${producedAmount} | In behandeling: ${inProcessAmount} | To do: ${todoAmount}`, margin + 14, 36);
        doc.text(`Lotnummers: ${totalLots} totaal (${activeLots} actief)`, margin + 14, 41);

        doc.setFontSize(8);
        doc.text(`Export: ${generatedAt}`, pageWidth - margin, 21, { align: "right" });
        doc.text(`Gebruiker: ${generatedBy}`, pageWidth - margin, 26, { align: "right" });
        doc.text(`Pagina ${pageNumber}`, pageWidth - margin, footerY, { align: "right" });
      };

      drawHeaderFooter(1);

      autoTable(doc, {
        startY: headerBottom + 3,
        margin: { left: margin, right: margin },
        tableWidth: doc.internal.pageSize.getWidth() - margin * 2,
        styles: { fontSize: 8, cellPadding: 1.6, overflow: "linebreak" },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        head: [["Lotnummer", "Order", "Product", "Status", "Station", "Aangemaakt", "Gereed"]],
        body: orderProducts
          .slice()
          .sort((a, b) => String(a?.lotNumber || a?.id || "").localeCompare(String(b?.lotNumber || b?.id || ""), "nl"))
          .map((p) => [
            String(p?.lotNumber || p?.activeLot || p?.id || "-").trim() || "-",
            String(p?.orderId || order.orderId || "-").trim() || "-",
            String(p?.item || order.item || "-").trim() || "-",
            String(p?.status || p?.currentStep || "-").trim() || "-",
            String(p?.currentStation || p?.lastStation || "-").trim() || "-",
            formatDateTimeForExport(p?.createdAt),
            formatDateTimeForExport(p?.finishedAt),
          ]),
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 26 },
          2: { cellWidth: 80 },
          3: { cellWidth: 26 },
          4: { cellWidth: 26 },
          5: { cellWidth: 35 },
          6: { cellWidth: 35 },
        },
        didDrawPage: (data) => {
          drawHeaderFooter(data.pageNumber);
        },
      });

      doc.save(`teamleader_orderoverzicht_${safeOrderId}.pdf`);
      showSuccess("PDF-overzicht met lotnummers is geëxporteerd");
    } catch (err: unknown) {
      console.error("Fout bij PDF export orderoverzicht:", err);
      showError("PDF export mislukt: " + (err instanceof Error ? err.message : "Onbekende fout"));
    }
  };

  const normalizedPlanDraft = String(planDraft || "").trim().replace(/[^0-9]/g, "");
  const parsedPlanDraft = parseInt(normalizedPlanDraft, 10);
  const nextPlan = Number.isNaN(parsedPlanDraft) ? null : parsedPlanDraft;
  const hasNoteChanged = String(noteDraft || "").trim() !== visibleOrderNote;
  const hasPlanChanged = canEditOrderPlan && nextPlan !== null && nextPlan !== visibleOrderPlan;

  const normalizedTodoDraft = String(todoDraft || "").trim().replace(/[^0-9]/g, "");
  const parsedTodoDraft = parseInt(normalizedTodoDraft, 10);
  const nextTodo = Number.isNaN(parsedTodoDraft) ? null : parsedTodoDraft;
  const hasTodoChanged = canEditOrderPlan && nextTodo !== null;

  const normalizedStartedDraft = String(startedDraft || "").trim().replace(/[^0-9]/g, "");
  const parsedStartedDraft = parseInt(normalizedStartedDraft, 10);
  const nextStarted = Number.isNaN(parsedStartedDraft) ? null : parsedStartedDraft;
  const hasStartedChanged = canEditOrderPlan && nextStarted !== null;
  const hasPendingChanges = hasNoteChanged || hasPlanChanged || hasStartedChanged || hasTodoChanged;
  const startedCounterField = getStartedCounterField(order?.machine || "");
  const stationStartedAmount = Number(startedCounterField ? order?.[startedCounterField] : 0) || 0;
  
  const handleToggleSyncExclusion = async (exclude: boolean) => {
    const orderDocId = order.__docPath || order.id;
    if (!orderDocId) return;

    try {
      await patchPlanningOrderMetadata({
        orderDocId,
        patch: {
          smartSyncExcluded: exclude,
          smartSyncIncluded: !exclude
        },
        source: "OrderDetail",
        actorLabel: actorEmail,
      });

      await logActivity(
        actorUid,
        "ORDER_SYNC_TOGGLE",
        `Order ${order.orderId} sync status gewijzigd naar: ${exclude ? "Uitgesloten" : "Opgenomen"}`
      );
    } catch (e) {
      console.error("Fout bij wijzigen sync status:", e);
    }
  };

  const summedStartedAmount = Object.entries(order || {}).reduce((sum, [key, value]) => {
    if (!String(key || "").startsWith("started_")) return sum;
    return sum + (Number(value) || 0);
  }, 0);
  const liveStartedAmount = orderProducts.filter((product) => {
    if (product.isVirtualLot) return false;
    const statusUpper = String(product?.status || "").toUpperCase();
    const stepUpper = String(product?.currentStep || "").toUpperCase();
    const isClosed =
      ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR", "CANCELLED", "CANCELED", "DELETED"].includes(statusUpper) ||
      stepUpper === "FINISHED" ||
      stepUpper === "REJECTED";
    return !isClosed;
  }).length;
  // linkedStartedAmount = alle ooit gestarte lots, exclusief definitief afgekeurde/verwijderde.
  // Basis voor "Te doen": plan - gestart (gestart = goed + wip + temp-afkeur, NIET definitieve afkeur of geannuleerd).
  const linkedStartedAmount = Array.from(
    new Set(
      orderProducts
        .filter((product) => {
          if (product.isVirtualLot) return false;
          const statusUpper = String(product?.status || "").toUpperCase();
          const stepUpper = String(product?.currentStep || "").toUpperCase();
          // Definitief afgekeurd of verwijderd: telt NIET als gestart (must re-make).
          const isDefinitivelyOut =
            statusUpper === "ARCHIVED_REJECTED" ||
            statusUpper === "DELETED" ||
            statusUpper === "CANCELLED" ||
            statusUpper === "CANCELED" ||
            (statusUpper === "REJECTED" && stepUpper === "REJECTED");
          return !isDefinitivelyOut;
        })
        .map((product) => String(product?.lotNumber || product?.id || "").trim())
        .filter(Boolean)
    )
  ).length;
  // startedAmount: als er live tracking data is, is die altijd betrouwbaarder dan
  // de stale started_<machine> Firestore-teller (die niet automatisch wordt bijgehouden).
  // Als we lokale tracking data hebben (zelfs als deze volledig geannuleerd is),
  // vertrouwen we op onze eigen tellers i.p.v. terug te vallen op LN.
  const hasLocalTracking = orderProducts.length > 0;
  const startedAmount = hasLocalTracking
    ? Math.max(linkedStartedAmount, liveStartedAmount)
    : Math.max(
        stationStartedAmount,
        summedStartedAmount,
        liveStartedAmount
      );
  const trackedProducedAmount = countFinishedTrackedLots(orderProducts.filter(p => !p.isVirtualLot));
  // producedAmount: als we live tracking hebben, is dat de bron van waarheid.
  // order.produced is een LN-import waarde die snel verouderd raakt en mag
  // de live telling niet overschrijven.
  const producedAmount = hasLocalTracking
    ? trackedProducedAmount
    : getOrderFinishedUnits(order, { trackedFinishedCount: trackedProducedAmount });
  const rawInProcessFromCounters = Number((startedAmount - producedAmount).toFixed(2));
  const inProcessFromCounters = Number.isFinite(rawInProcessFromCounters) ? rawInProcessFromCounters : 0;
  const inProcessAmount = Math.max(0, Math.max(Number(liveStartedAmount) || 0, inProcessFromCounters));
  const effectivePlanForTodo = canEditOrderPlan && nextPlan !== null ? Number(nextPlan) : visibleOrderPlan;
  // To do = stuks die nog niet gestart zijn: quantity - startedAmount (niet - producedAmount,
  // want "in behandeling" zijn al gestart en tellen niet meer als to do).
  const todoAmount = Math.max(0, Number((Number(effectivePlanForTodo || 0) - startedAmount).toFixed(2)));
  const effectiveTodoAmount = todoAmount;
  const planAmount = Math.max(0, Number(visibleOrderPlan || 0));

  const originalAantal = rawQuantity > 0 ? rawQuantity : rawPlanVal;
  const currentPlanDisplay = planDraft !== "" ? Number(planDraft) : visibleOrderPlan;
  const showOriginalPlan = originalAantal > 0 && currentPlanDisplay !== originalAantal;

  const calculatedOriginalTodo = Math.max(0, Number((originalAantal - startedAmount).toFixed(2)));
  const currentTodoDisplay = todoDraft !== "" ? Number(todoDraft) : todoAmount;
  const showOriginalTodo = originalAantal > 0 && currentTodoDisplay !== calculatedOriginalTodo;

  const shouldShowCompletedStatus = planAmount > 0 && producedAmount >= planAmount && inProcessAmount === 0;
  const displayStatus = shouldShowCompletedStatus ? "Gereed" : order.status;
  const orderDocIdForArchive = String(order?.__docPath || order?.id || "").trim();
  const normalizedPriority =
    order?.priority === true
      ? "high"
      : String(order?.priority || "").toLowerCase().trim();
  const priorityBadge =
    normalizedPriority === "immediate"
      ? { label: "1e Prio", className: "bg-rose-100 text-rose-700" }
      : normalizedPriority === "urgent" || order?.isUrgent
        ? { label: t("digitalplanning.order_detail.urgent"), className: "bg-orange-100 text-orange-700" }
        : (normalizedPriority === "high" || order?.isMoved)
          ? { label: "Prio", className: "bg-amber-100 text-amber-700" }
          : null;

  const expectedDateVal = order.predictedReadyDate || order.plannedDate || order.plannedDeliveryDate || order.dueDate;
  const getDaysDiffInfo = () => {
    if (order.slipDays !== undefined) return order.slipDays;
    if (!expectedDateVal || !order.deliveryDate) return null;
    
    const parseDate = (val: any) => {
      if (val?.toDate) return val.toDate();
      const num = parseFloat(val);
      if (!isNaN(num) && num > 30000 && num < 100000) {
        return new Date(Math.round((num - 25569) * 86400 * 1000));
      }
      return new Date(val);
    };

    const expDate = parseDate(expectedDateVal);
    const delDate = parseDate(order.deliveryDate);

    if (isNaN(expDate.getTime()) || isNaN(delDate.getTime())) return null;

    // Normalizeer naar middernacht zodat we zuivere hele dagen hebben
    const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
    const delMidnight = new Date(delDate.getFullYear(), delDate.getMonth(), delDate.getDate());
    
    const statusStr = String(order?.status || "").toLowerCase().trim();
    const isOrderInProgress = ["in_progress", "in progress", "in-behandeling", "in behandeling", "active", "processing", "running", "lopend"].includes(statusStr);
    const hasStarted = isOrderInProgress || (orderProducts && orderProducts.length > 0);

    if (!hasStarted) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (delMidnight.getTime() <= today.getTime()) {
        return differenceInDays(today, delMidnight);
      }
      return null;
    }

    return differenceInDays(expMidnight, delMidnight);
  };
  const daysDiff = getDaysDiffInfo();

  useEffect(() => {
    if (!shouldShowCompletedStatus) return;
    if (!orderDocIdForArchive) return;

    if (autoArchiveAttemptedRef.current.has(orderDocIdForArchive)) return;
    autoArchiveAttemptedRef.current.add(orderDocIdForArchive);

    archivePlanningOrder({
      orderDocId: orderDocIdForArchive,
      reason: "completed",
      source: "auto_from_order_detail_completion",
      actorLabel: user?.email || auth.currentUser?.email || "Teamleader",
    }).catch((err) => {
      const msg = String(err?.message || "").toLowerCase();
      const ignorable =
        msg.includes("permission") ||
        msg.includes("active_products_remain") ||
        msg.includes("failed-precondition") ||
        msg.includes("not-found");
      if (!ignorable) {
        console.warn("Auto-archiveren order mislukt:", err);
      }
    });
  }, [shouldShowCompletedStatus, orderDocIdForArchive, user?.email]);

  const handleSaveOrderChanges = async () => {
    if (!order?.id || isSavingNote || !hasPendingChanges) return;
    if (canEditOrderPlan && (nextPlan === null || nextPlan < 0)) {
      showError("Aantal moet een geldig getal zijn (0 of hoger)");
      return;
    }

    const trimmedNote = String(noteDraft || "").trim();

    try {
      setIsSavingNote(true);
      const orderDocId = order.__docPath || order.id;
      await updatePlanningOrderDetails({
        orderDocId,
        notes: trimmedNote,
        plan: hasPlanChanged ? nextPlan : null,
        started: hasStartedChanged ? nextStarted : null,
        manualTodo: hasTodoChanged ? nextTodo : null,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });
      showSuccess("Wijzigingen opgeslagen");
    } catch (err: unknown) {
      console.error("Error saving order changes:", err);
      showError("Opslaan wijzigingen mislukt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingNote(false);
    }
  };

  const checkLotExistsGlobal = async (lotToCheck: string, excludeDocId: string | null = null) => {
    const normalizedLot = String(lotToCheck || "").trim().toUpperCase();
    if (!normalizedLot) return false;

    const hasActiveConflict = await trackedLotExistsActive({ db, lotNumber: normalizedLot, excludeDocId });
    if (hasActiveConflict) return true;

    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 6; i++) {
      const year = currentYear - i;
      const archiveRef = collection(db, getArchiveItemsPath(year).join("/"));
      const archiveSnap = await getDocs(query(archiveRef, where("lotNumber", "==", normalizedLot), limit(1)));
      if (!archiveSnap.empty) return true;
    }

    return false;
  };

  const handleOpenLotEdit = (product: ProductRecord) => {
    if (!canEditLotNumber || !product?.id) return;
    const oldLot = String(product.lotNumber || product.id || "").trim().toUpperCase();
    setLotEditTarget(product);
    setLotEditNewValue(oldLot);
    setLotEditReason("");
    setLotEditError("");
  };

  const handleCloseLotEdit = () => {
    if (isSavingLotEdit) return;
    setLotEditTarget(null);
    setLotEditNewValue("");
    setLotEditReason("");
    setLotEditError("");
  };

  const resolveTrackedProductIdentifier = (product: ProductRecord | null) => {
    if (!product) return "";
    const isArchivedProduct = Boolean(product?.archived || product?._archived || product?.archivedAt);
    return String(
      isArchivedProduct
        ? product?.archiveDocId || product?.lotNumber || product?.id || ""
        : product?.sourcePath || product?.__docPath || product?.id || product?.lotNumber || ""
    ).trim();
  };

  const handleOpenOrderEdit = (product: ProductRecord) => {
    const productIdentifier = resolveTrackedProductIdentifier(product);
    if (!canEditLotNumber || !productIdentifier) return;
    setOrderEditTarget(product);
    setOrderEditNewValue(String(product?.orderId || order?.orderId || "").trim().toUpperCase());
    setOrderEditReason("");
    setOrderEditError("");
  };

  const handleCloseOrderEdit = () => {
    if (isSavingOrderEdit) return;
    setOrderEditTarget(null);
    setOrderEditNewValue("");
    setOrderEditReason("");
    setOrderEditError("");
  };

  const handleSaveOrderEdit = async () => {
    const productIdentifier = resolveTrackedProductIdentifier(orderEditTarget);
    if (!productIdentifier || isSavingOrderEdit) return;

    const oldOrderId = String(orderEditTarget?.orderId || order?.orderId || "").trim().toUpperCase();
    const newOrderId = String(orderEditNewValue || "").trim().toUpperCase();
    const reason = String(orderEditReason || "").trim();
    const lotNumber = String(orderEditTarget?.lotNumber || orderEditTarget?.archiveDocId || orderEditTarget?.id || "").trim();

    if (!newOrderId) {
      setOrderEditError("Ordernummer mag niet leeg zijn.");
      return;
    }
    if (!reason) {
      setOrderEditError("Reden is verplicht bij ordernummerwijziging.");
      return;
    }
    if (newOrderId === oldOrderId) {
      setOrderEditError("Nieuw ordernummer is gelijk aan het huidige ordernummer.");
      return;
    }

    try {
      setIsSavingOrderEdit(true);
      setOrderEditError("");

      await reassignTrackedProductOrder({
        productId: productIdentifier,
        newOrderId,
        reason,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });

      await logActivity(
        actorUid,
        "TRACKED_PRODUCT_ORDER_REASSIGNED",
        `Product ordernummer gewijzigd in Volledige Lijst: ${lotNumber || "onbekend lot"} | ${oldOrderId} -> ${newOrderId} | Reden: ${reason}`
      );

      handleCloseOrderEdit();
      showSuccess(`Ordernummer gewijzigd: ${oldOrderId} -> ${newOrderId}`);
    } catch (err: unknown) {
      console.error("Fout bij wijzigen ordernummer:", err);
      setOrderEditError("Wijzigen ordernummer mislukt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingOrderEdit(false);
    }
  };

  const handleSaveLotEdit = async () => {
    if (!lotEditTarget?.id || isSavingLotEdit) return;

    const oldLot = String(lotEditTarget.lotNumber || lotEditTarget.id || "").trim().toUpperCase();
    const newLot = String(lotEditNewValue || "").trim().toUpperCase();
    const reason = String(lotEditReason || "").trim();

    if (!newLot) {
      setLotEditError("Lotnummer mag niet leeg zijn.");
      return;
    }
    if (!reason) {
      setLotEditError("Reden is verplicht bij lotnummerwijziging.");
      return;
    }
    if (newLot === oldLot) {
      setLotEditError("Nieuw lotnummer is gelijk aan het huidige lotnummer.");
      return;
    }

    try {
      setIsSavingLotEdit(true);
      setLotEditError("");

      const exists = await checkLotExistsGlobal(newLot, lotEditTarget.id);
      if (exists) {
        setLotEditError(`Lotnummer ${newLot} bestaat al in actief of archief.`);
        return;
      }

      await editTrackedProductLotNumber({
        productId: lotEditTarget.id,
        newLotNumber: newLot,
        reason,
        source: "OrderDetail",
        actorLabel: actorEmail,
      });

      await logActivity(
        actorUid,
        "LOT_NUMBER_EDITED",
        `Lotnummer gewijzigd in Volledige Lijst: ${oldLot} -> ${newLot} (order ${order.orderId}) | Reden: ${reason}`
      );

      handleCloseLotEdit();
      showSuccess(`Lotnummer gewijzigd: ${oldLot} -> ${newLot}`);
    } catch (err: unknown) {
      console.error("Fout bij wijzigen lotnummer:", err);
      setLotEditError("Wijzigen lotnummer mislukt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingLotEdit(false);
    }
  };


  const departments = [
    { id: "FITTINGS", label: "Fittings" },
    { id: "PIPES", label: "Pipes" },
    { id: "SPOOLS", label: "Spools" }
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight select-text">{order.orderId}</h2>
            <button 
              onClick={() => copyToClipboard(order.orderId)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <Copy size={16} />
            </button>
            <button
              type="button"
              onClick={handleExportOrderOverviewPdf}
              disabled={orderProducts.length === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title="Exporteer orderoverzicht met lotnummers (PDF)"
            >
              <Printer size={14} /> PDF export
            </button>
            {order.extraCode && order.extraCode !== "-" && (
              <span className="px-2 py-0.5 bg-amber-400 text-amber-900 border border-amber-500 rounded-lg text-[10px] font-black uppercase tracking-wide">
                {order.extraCode}
              </span>
            )}
            {hasPendingChanges && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                Niet opgeslagen
              </span>
            )}
            {priorityBadge && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${priorityBadge.className}`}>
                {priorityBadge.label}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-500">{order.item}</p>
          {(order.itemCode || order.productId) && (
            <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">{order.itemCode || order.productId}</p>
          )}
          {(order.project || order.projectDesc) && (
            <p className="text-[10px] font-bold text-blue-600 mt-0.5 uppercase tracking-wider">{order.project} {order.projectDesc ? `- ${order.projectDesc}` : ""}</p>
          )}
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Details Grid */}
      <div className="p-2.5 md:p-3 space-y-2 border-b border-slate-100 shrink-0">
        {/* Rij 1: Machine, Leverdatum, Verwachte leverdatum, LN import, Gewijzigd, Status */}
        <div className="grid grid-cols-6 gap-2">
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.machine")}</span>
            <span className="font-bold text-xs text-slate-700">{order.machine?.replace("_INBOX", "") || t("digitalplanning.order_detail.na")}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.planning")}</span>
            <span className="text-sm font-black text-slate-800">{formatExcelDate(order.deliveryDate)}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5" title={order.predictedReadyDate ? t('digitalplanning.order_detail.predictedReadyTooltip', 'Gevoed door dynamisch AI algoritme') : t('digitalplanning.order_detail.staticLnDateTooltip', 'Statische datum uit LN')}>
              {order.predictedReadyDate ? t("digitalplanning.order_detail.predicted_ready", "Voorspelde gereeddatum") : t("digitalplanning.order_detail.expected_delivery", "Verwachte leverdatum")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800">{formatExcelDate(expectedDateVal)}</span>
              {daysDiff !== null && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                  daysDiff > 0 ? "bg-rose-100 text-rose-700" :
                  daysDiff < 0 ? "bg-emerald-100 text-emerald-700" :
                  "bg-slate-200 text-slate-600"
                }`} title={daysDiff > 0 ? t('digitalplanning.order_detail.behindSchedule', 'Achter op schema') : daysDiff < 0 ? t('digitalplanning.order_detail.aheadSchedule', 'Voor op schema') : t('digitalplanning.order_detail.onSchedule', 'Op schema')}>
                  {daysDiff > 0 ? `+${daysDiff}d` : `${daysDiff}d`}
                </span>
              )}
            </div>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
            <span className="text-[9px] font-black text-blue-600 uppercase tracking-tight block mb-0.5">{t("orderDetail.lnImport", "LN import")}</span>
            <span className="font-bold text-xs text-blue-900">{formatExcelDate(order.importDate || order.importedAt || order.createdAt || order.date)}</span>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
            <span className="text-[9px] font-black text-purple-600 uppercase tracking-tight block mb-0.5">{t("orderDetail.modified", "Gewijzigd")}</span>
            <span className="font-bold text-xs text-purple-900">{formatExcelDate(order.updatedAt || order.lastSync || order.syncedAt || order.importDate || order.createdAt || order.date)}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.status")}</span>
            <StatusBadge status={displayStatus} />
          </div>
        </div>

        {/* Rij 3: Aantal, To do, In behandeling, Gereed (met LN Aangeboden) */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.amount")}</span>
            {canEditOrderPlan ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={planDraft}
                  onChange={(e) => setPlanDraft(String(e.target.value || "").replace(/[^0-9]/g, ""))}
                  className="w-16 px-1.5 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                />
                {showOriginalPlan && (
                  <span className="text-[10px] font-bold text-slate-400 line-through ml-1" title="Originele waarde">
                    {originalAantal}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="font-bold text-xs text-slate-700">{order.plan}</span>
                {showOriginalPlan && (
                  <span className="text-[10px] font-bold text-slate-400 line-through ml-1" title="Originele waarde">
                    {originalAantal}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.todo_amount", "To do")}</span>
            {canEditOrderPlan ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={todoDraft !== "" ? todoDraft : todoAmount}
                  onChange={(e) => setTodoDraft(String(e.target.value || "").replace(/[^0-9]/g, ""))}
                  placeholder={String(todoAmount)}
                  className="w-14 px-1 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-700 outline-none focus:border-blue-500"
                />
                {showOriginalTodo && (
                  <span className="text-[10px] font-bold text-slate-400 line-through ml-1" title="Originele berekende waarde">
                    {calculatedOriginalTodo}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="font-black text-xs text-blue-700">{todoAmount}</span>
                {showOriginalTodo && (
                  <span className="text-[10px] font-bold text-slate-400 line-through ml-1" title="Originele berekende waarde">
                    {calculatedOriginalTodo}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-[9px] font-black text-amber-700 uppercase tracking-tight block mb-0.5">{t("orderDetail.inProgress", "In behandeling")}</span>
            <span className="font-black text-xs text-amber-900">{inProcessAmount}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.produced_amount", "Gereed")} / LN Aangeboden</span>
            <span className="font-bold text-xs text-emerald-700">{producedAmount}</span>
          </div>
        </div>

        {/* Smart Sync Opties */}
        {canEditOrderPlan && (
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-1.5">{t("orderDetail.smartSyncControl", "Slimme Sync Controle")}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleToggleSyncExclusion(false)}
                className={`flex-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all ${
                  order.smartSyncIncluded === true
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                    : "bg-white text-slate-400 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <CheckCircle size={12} />
                Opnemen
              </button>
              <button
                onClick={() => handleToggleSyncExclusion(true)}
                className={`flex-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all ${
                  order.smartSyncExcluded === true
                    ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                    : "bg-white text-slate-400 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <XCircle size={12} />
                Uitsluiten
              </button>
            </div>
          </div>
        )}

          {/* NIEUW: Mal Configuratie */}
          {matchedMold && (
            <div className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-100 flex justify-between items-center animate-in fade-in">
              <div>
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tight block mb-0.5">{t("digitalplanning.order_detail.mold_config", "Mal Configuratie")}</span>
                <span className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
                  <span className="bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded text-[10px] uppercase font-black">{matchedMold.cavityCount}x</span>
                  {matchedMold.matcher || matchedMold.itemCode || t("common.unknown", "Onbekend")}
                </span>
              </div>
              <div className="p-1.5 bg-indigo-100 rounded-md">
                <Layers size={16} className="text-indigo-600" />
              </div>
            </div>
          )}

        {/* Tekening */}
        <button
          onClick={async () => {
            setDrawingLoading(true);
            try {
              const drawingId = order.drawing;
              if (drawingId && drawingId !== "-" && drawingId !== "") {
                const directRef = doc(db, ...PATHS.PRODUCTS, drawingId);
                const directSnap = await getDoc(directRef);
                if (directSnap.exists()) {
                  setViewingDrawing({ id: directSnap.id, ...directSnap.data() });
                  return;
                }
                const productsRef = collection(db, ...PATHS.PRODUCTS);
                const q1 = query(productsRef, where("articleCode", "==", drawingId));
                const snap1 = await getDocs(q1);
                if (!snap1.empty) {
                  setViewingDrawing({ id: snap1.docs[0].id, ...snap1.docs[0].data() });
                  return;
                }
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
                    setViewingDrawing({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
                    return;
                  }
                }
              }
              const drawing = await findDrawingForProduct(order.orderId || "");
              if (drawing) setViewingDrawing(drawing);
              else showError("Geen tekening gevonden voor deze order");
            } catch (err) {
              console.error("Fout bij laden tekening:", err);
              showError("Kon tekening niet laden");
            } finally {
              setDrawingLoading(false);
            }
          }}
          disabled={drawingLoading}
          className={`p-2 rounded-lg border transition-all text-left w-full ${
            order.drawing && order.drawing !== "-" && order.drawing !== ""
              ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
              : "bg-slate-50 border-slate-100 hover:bg-slate-100"
          }`}
        >
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight block mb-0.5">{t("orderDetail.drawing", "Tekening")}</span>
          <div className="flex items-center gap-2">
            <FileImage size={14} className={
              order.drawing && order.drawing !== "-" && order.drawing !== ""
                ? "text-blue-500"
                : "text-slate-300"
            } />
            <span className={`font-bold text-xs ${
              order.drawing && order.drawing !== "-" && order.drawing !== ""
                ? "text-blue-600"
                : "text-slate-400"
            }`}>
              {drawingLoading ? "Laden..." : order.drawing && order.drawing !== "-" && order.drawing !== "" ? "Gekoppeld" : "Zoeken"}
            </span>
          </div>
        </button>

        {canEditOrderNotes ? (
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={t("placeholders.dpOperatorNote", "Voeg opmerking toe voor operator/teamleader...")}
            className="w-full min-h-[64px] p-2.5 bg-white border border-amber-200 rounded-xl text-sm text-slate-700 font-medium outline-none focus:border-amber-500"
          />
        ) : (
          <div className="w-full min-h-[40px] p-2.5 bg-white border border-amber-200 rounded-xl text-sm text-slate-700 font-medium whitespace-pre-wrap">
            {visibleOrderNote || "Geen opmerking"}
          </div>
        )}
      </div>

      {/* Products List */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
          {t("digitalplanning.order_detail.products", { count: orderProducts.length })}
        </h3>
        
        <div className="space-y-3">
          {orderProducts.map((p) => {
            const isArchived = !!(p.archived || p._archived || p.archivedAt || p.currentStation === 'GEREED' || (p.currentStep === 'Finished' && p.status === 'completed'));
            const inspectionDate = p.inspection?.timestamp ? (p.inspection.timestamp.toDate ? p.inspection.timestamp.toDate() : new Date(p.inspection.timestamp)) : null;
            const daysInReject = inspectionDate ? differenceInDays(new Date(), inspectionDate) : 0;
            const isLongReject = daysInReject > 2;
            const statusUpper = String(p?.status || '').toUpperCase();
            const stepUpper = String(p?.currentStep || '').toUpperCase();
            const isReady =
              statusUpper === 'COMPLETED' ||
              statusUpper === 'FINISHED' ||
              statusUpper === 'GEREED' ||
              stepUpper === 'FINISHED' ||
              isArchived;
            const isInBehandeling = !isReady;
            const lotTileClass = isReady
              ? 'bg-emerald-50 border-emerald-200'
              : isInBehandeling
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-slate-100';

            return (
              <div key={p.id || p.lotNumber} className={`${lotTileClass} p-4 rounded-2xl border shadow-sm flex justify-between items-center group hover:border-blue-200 transition-all`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${p.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : p.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {p.status === 'completed' ? <CheckCircle2 size={20} /> : p.status === 'rejected' ? <AlertTriangle size={20} /> : <Clock size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800">{p.lotNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-bold uppercase">{p.currentStation}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{p.itemCode}</span>
                    {p.updatedAt && <span>• {p.updatedAt?.toDate ? format(p.updatedAt.toDate(), "dd MMM HH:mm") : ""}</span>}
                  </div>
                  <div className="text-xs text-slate-500 font-bold mt-0.5 flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{p.item || order.item}</span>
                    {(p.extraCode || order.extraCode) && (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                        {p.extraCode || order.extraCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setDrawingLoading(true);
                    try {
                      // 1. Gebruik het drawing veld (product ID) als dat er is
                      const drawingId = order.drawing;
                      if (drawingId && drawingId !== "-" && drawingId !== "") {
                        const directRef = doc(db, `${getPathString(PATHS.PRODUCTS)}/${drawingId}`);
                        const directSnap = await getDoc(directRef);
                        if (directSnap.exists()) {
                          setViewingDrawing({ id: directSnap.id, ...directSnap.data() });
                          setDrawingLoading(false);
                          return;
                        }
                        // Fallback: articleCode match
                        const productsRef = collection(db, getPathString(PATHS.PRODUCTS));
                        const q1 = query(productsRef, where("articleCode", "==", drawingId));
                        const snap1 = await getDocs(q1);
                        if (!snap1.empty) {
                          setViewingDrawing({ id: snap1.docs[0].id, ...snap1.docs[0].data() });
                          setDrawingLoading(false);
                          return;
                        }
                        // Materiaalvariant fallback (CST↔EST positie 6)
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
                            setViewingDrawing({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
                            setDrawingLoading(false);
                            return;
                          }
                        }
                      }
                      // 2. Legacy fallback via findDrawingForProduct
                      const drawing = await findDrawingForProduct(p.itemCode || p.item || "");
                      if (drawing) setViewingDrawing(drawing);
                      else notify(t("digitalplanning.order_detail.no_drawing"));
                    } catch (err) {
                      console.error("Fout bij laden tekening:", err);
                      notify(t("digitalplanning.order_detail.no_drawing"));
                    } finally {
                      setDrawingLoading(false);
                    }
                  }}
                  className={`p-2 rounded-xl transition-all ${
                    order.drawing && order.drawing !== "-" && order.drawing !== ""
                      ? "text-blue-500 bg-blue-50 hover:bg-blue-100"
                      : "text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                  }`}
                  title={t("digitalplanning.order_detail.view_drawing")}
                  disabled={drawingLoading}
                >
                  <FileImage size={16} />
                </button>
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingDossier(p);
                    }}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.view_dossier")}
                  >
                    <FileText size={16} />
                  </button>
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingJourney(p);
                    }}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.view_journey")}
                  >
                    <Map size={16} />
                  </button>
                {isManager && onMoveLot && p.inspection?.status === "Tijdelijke afkeur" && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const moveConfirmed = await showConfirm({
                        title: t("digitalplanning.order_detail.move_confirm_title", "Product verplaatsen"),
                        message: t("digitalplanning.order_detail.move_confirm", { lot: p.lotNumber }),
                        confirmText: t("common.continue", "Doorgaan"),
                        cancelText: t("common.cancel", "Annuleren"),
                        tone: "warning",
                      });
                      if (!moveConfirmed) return;
                      if (isArchived) {
                        setViewingDossier({ ...p, archived: true, _archived: true });
                        return;
                      }
                      onMoveLot(p.lotNumber, "BH31");
                    }}
                    className={`p-2 rounded-xl transition-all ${isLongReject ? "text-red-600 hover:text-red-800 hover:bg-red-50" : "text-orange-500 hover:text-orange-700 hover:bg-orange-50"}`}
                    title={isLongReject ? t("digitalplanning.order_detail.reject_long", { days: daysInReject }) : t("digitalplanning.order_detail.to_repair")}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                {isManager && onMoveLot && !isArchived && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductToMove(p);
                    }}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.move_station")}
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                )}
                {isManager && canEditLotNumber && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenOrderEdit(p);
                    }}
                    className="p-2 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
                    title="Ordernummer aanpassen"
                  >
                    <Building2 size={16} />
                  </button>
                )}
                {isManager && canEditLotNumber && !isArchived && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenLotEdit(p);
                    }}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Lotnummer aanpassen"
                  >
                    <Edit3 size={16} />
                  </button>
                )}
                {isManager && !isArchived && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if(onDeleteLot) onDeleteLot(p.lotNumber);
                    }}
                    className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            );
          })}
          
          {orderProducts.length === 0 && (
            <div className="text-center py-10 text-slate-400 italic text-sm">
              {t("digitalplanning.order_detail.no_products")}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions for Manager */}
      {isManager && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex gap-3 overflow-x-auto items-center">
           {(canEditOrderNotes || canEditOrderPlan) && (
             <button
               onClick={handleSaveOrderChanges}
               disabled={isSavingNote || !hasPendingChanges}
               className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 border ${
                 hasPendingChanges
                   ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md border-emerald-600"
                   : "bg-white text-slate-300 border-slate-200"
               }`}
             >
               <Save size={16} />
               {isSavingNote ? "Opslaan..." : "Opslaan"}
             </button>
           )}

           <button
             onClick={() => setShowOrderMoveModal(true)}
             className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
           >
             <ArrowRightLeft size={16} />
             {t("digitalplanning.order_detail.move_order", "Verplaats / Aanbieden")}
           </button>

           {(order.delegatedTo || order.status === 'delegated') && (
             <button
               onClick={handleRetrieveOrder}
               className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white hover:bg-amber-600 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
             >
               <RotateCcw size={16} />
               {t("digitalplanning.order_detail.retrieve", `Terughalen van ${order.delegatedTo || 'Afdeling'}`)}
             </button>
           )}

           {/* On Hold / Hervatten Button */}
           {['admin', 'teamleader', 'planner'].includes(normalizedRole) && (
             order.status === 'on_hold' ? (
               <button
                 onClick={handleToggleHold}
                 disabled={holdLoading}
                 className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white hover:bg-emerald-700 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 disabled:opacity-50"
               >
                 <PlayCircle size={16} />
                 {holdLoading ? "..." : "Hervatten"}
               </button>
             ) : (
               <button
                 onClick={handleToggleHold}
                 disabled={holdLoading}
                 className="flex items-center gap-2 px-4 py-3 bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 disabled:opacity-50"
               >
                 <PauseCircle size={16} />
                 {holdLoading ? "..." : "On Hold"}
               </button>
             )
           )}

           {/* Cancel Button - Alleen voor bevoegde rollen */}
           {['admin', 'teamleader', 'planner'].includes(normalizedRole) && (
             <button
               onClick={() => setShowCancelModal(true)}
               className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
             >
               <Ban size={16} />
               {t("digitalplanning.order_detail.cancel", "Order Annuleren")}
             </button>
           )}

           {/* Prioriteit Knoppen */}
           {['admin', 'teamleader'].includes(normalizedRole) && (
             <>
               <div className="w-px h-8 bg-slate-200 shrink-0" />
               <button
                 onClick={() => handleSetPriority("high")}
                 className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 border ${
                   normalizedPriority === "high" || order.priority === true
                     ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20"
                     : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                 }`}
               >
                 <Star size={14} fill={normalizedPriority === "high" || order.priority === true ? "currentColor" : "none"} />
                 Prio
               </button>
               <button
                 onClick={() => handleSetPriority("urgent")}
                 className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 border ${
                   normalizedPriority === "urgent"
                     ? "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20"
                     : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                 }`}
               >
                 <AlertTriangle size={14} fill={normalizedPriority === "urgent" ? "currentColor" : "none"} />
                 Spoed
               </button>
               <button
                 onClick={() => handleSetPriority("immediate")}
                 className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 border ${
                   normalizedPriority === "immediate"
                     ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20"
                     : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                 }`}
               >
                 <Zap size={14} fill={normalizedPriority === "immediate" ? "currentColor" : "none"} />
                 1e Prio
               </button>
             </>
           )}
        </div>
      )}

      {viewingJourney && (
        <ProductJourneyModal 
          product={viewingJourney} 
          onClose={() => setViewingJourney(null)} 
        />
      )}

      {viewingDossier && (
        <ProductDossierModal
          isOpen={true}
          product={viewingDossier}
          onClose={() => setViewingDossier(null)}
          orders={[order] as any[]}
          onMoveLot={onMoveLot || (() => {})}
          currentDepartment={currentDepartment || undefined}
          allowedStations={allowedStations}
        />
      )}

      {viewingDrawing && (
        <ProductDetailModal
          product={viewingDrawing}
          onClose={() => setViewingDrawing(null)}
          userRole={isManager ? "admin" : "operator"}
        />
      )}

      {productToMove && (
        <div className="fixed z-[9999]">
          <ProductMoveModal
            product={productToMove}
            onClose={() => setProductToMove(null)}
            onMove={onMoveLot || (() => {})}
            currentDepartment={currentDepartment || undefined}
            allowedStations={allowedStations}
          />
        </div>
      )}

      {showOrderMoveModal && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-2xl p-5 sm:p-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">
                  {t("digitalplanning.move_modal.title", "Verplaats Order")}
                </h3>
                <p className="text-sm text-slate-500 font-bold">
                  Order: {order.orderId}
                </p>
              </div>
              <button
                onClick={() => setShowOrderMoveModal(false)}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-8">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Building2 size={14} /> Naar Andere Afdeling
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {departments.filter(d => d.id.toLowerCase() !== (currentDepartment || "").toLowerCase()).map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => setMoveConfirmData({ type: "department", id: dept.label })}
                    className="p-4 bg-white border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl flex items-center justify-between group transition-all"
                  >
                    <span className="font-black text-slate-700 group-hover:text-purple-700 uppercase">{dept.label}</span>
                    <Factory size={18} className="text-slate-300 group-hover:text-purple-500" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Cpu size={14} /> Intern Verplaatsen / Toewijzen
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...allowedStations].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""))).map((station) => (
                  <button
                    key={String(station.id || station.name || "")}
                    onClick={() => setMoveConfirmData({ type: "station", id: String(station.name || station.id || "") })}
                    className="p-4 bg-slate-50 hover:bg-blue-50 border-2 border-slate-100 hover:border-blue-200 rounded-2xl text-sm font-bold text-slate-700 hover:text-blue-700 transition-all uppercase text-center"
                  >
                    {String(station.name || station.id || "")}
                  </button>
                ))}
                {allowedStations.length === 0 && (
                  <div className="col-span-full text-center py-4 text-slate-400 italic text-sm">
                    Geen stations beschikbaar.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CancelOrderModal 
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelOrder}
        orderId={order?.orderId}
      />

      <ConfirmationModal
        isOpen={!!moveConfirmData}
        onClose={() => setMoveConfirmData(null)}
        onConfirm={() => moveConfirmData && handleMoveOrder(String(moveConfirmData.type || ""), String(moveConfirmData.id || ""))}
        title="Order Verplaatsen"
        message={`Weet je zeker dat je order ${order.orderId} wilt verplaatsen naar ${moveConfirmData?.id}?`}
        confirmText="Ja, Verplaatsen"
      />

      {lotEditTarget && (
        <div className="fixed inset-0 z-[550] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-lg p-5 sm:p-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">{t("orderDetail.adjustLotNumber", "Lotnummer aanpassen")}</h3>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  Huidig: {String(lotEditTarget.lotNumber || lotEditTarget.id || "-")}
                </p>
              </div>
              <button
                onClick={handleCloseLotEdit}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                disabled={isSavingLotEdit}
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t("orderDetail.newLotNumber", "Nieuw lotnummer")}</label>
                <input
                  type="text"
                  value={lotEditNewValue}
                  onChange={(e) => {
                    setLotEditNewValue(String(e.target.value || "").toUpperCase());
                    if (lotEditError) setLotEditError("");
                  }}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-500"
                  placeholder={t("placeholders.dpLotReassignExample", "Bijv. 402614418400004")}
                  autoFocus
                  disabled={isSavingLotEdit}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t("orderDetail.reasonRequired", "Reden (verplicht)")}</label>
                <textarea
                  value={lotEditReason}
                  onChange={(e) => {
                    setLotEditReason(e.target.value);
                    if (lotEditError) setLotEditError("");
                  }}
                  className="w-full min-h-[90px] p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium text-slate-700 outline-none focus:border-indigo-500"
                  placeholder={t("placeholders.dpLotReassignReason", "Bijv. foutief gescand label of administratieve correctie")}
                  disabled={isSavingLotEdit}
                />
              </div>

              {lotEditError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold">
                  {lotEditError}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <button
                onClick={handleCloseLotEdit}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs hover:bg-slate-200 disabled:opacity-50"
                disabled={isSavingLotEdit}
              >
                Annuleren
              </button>
              <button
                onClick={handleSaveLotEdit}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-indigo-700 disabled:opacity-50"
                disabled={isSavingLotEdit}
              >
                {isSavingLotEdit ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderEditTarget && (
        <div className="fixed inset-0 z-[550] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-[24px] sm:rounded-[30px] shadow-2xl w-full max-w-lg p-5 sm:p-8 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">{t("orderDetail.adjustOrderNumber", "Ordernummer aanpassen")}</h3>
                <p className="text-sm text-slate-500 font-bold mt-1">
                  Huidig: {String(orderEditTarget.orderId || order.orderId || "-")}
                </p>
              </div>
              <button
                onClick={handleCloseOrderEdit}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                disabled={isSavingOrderEdit}
              >
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t("orderDetail.newOrderNumber", "Nieuw ordernummer")}</label>
                <input
                  type="text"
                  value={orderEditNewValue}
                  onChange={(e) => {
                    setOrderEditNewValue(String(e.target.value || "").toUpperCase());
                    if (orderEditError) setOrderEditError("");
                  }}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-cyan-500"
                  placeholder={t("placeholders.dpOrderReassignExample", "Bijv. N2501234")}
                  autoFocus
                  disabled={isSavingOrderEdit}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t("orderDetail.reasonRequired", "Reden (verplicht)")}</label>
                <textarea
                  value={orderEditReason}
                  onChange={(e) => {
                    setOrderEditReason(e.target.value);
                    if (orderEditError) setOrderEditError("");
                  }}
                  className="w-full min-h-[90px] p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium text-slate-700 outline-none focus:border-cyan-500"
                  placeholder={t("placeholders.dpOrderReassignReason", "Bijv. product is op verkeerd ordernummer geboekt")}
                  disabled={isSavingOrderEdit}
                />
              </div>

              {orderEditError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold">
                  {orderEditError}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <button
                onClick={handleCloseOrderEdit}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs hover:bg-slate-200 disabled:opacity-50"
                disabled={isSavingOrderEdit}
              >
                Annuleren
              </button>
              <button
                onClick={handleSaveOrderEdit}
                className="flex-1 py-3 bg-cyan-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-cyan-700 disabled:opacity-50"
                disabled={isSavingOrderEdit}
              >
                {isSavingOrderEdit ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});

export default OrderDetail;
