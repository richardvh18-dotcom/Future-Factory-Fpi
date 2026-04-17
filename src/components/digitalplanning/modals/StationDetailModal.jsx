import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  X,
  Zap,
  Calendar as CalendarIcon,
  History,
  AlertCircle,
  ArrowUpCircle,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileDown,
} from "lucide-react";
import {
  normalizeMachine,
  formatDate,
  getISOWeekInfo,
} from "../../../utils/hubHelpers";
import StatusBadge from "../common/StatusBadge";
import InternalQrImage from "../../../utils/InternalQrImage";

const StationDetailModal = ({
  stationId,
  allOrders,
  allProducts,
  allArchivedProducts = [],
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("active");
  const [historyFilter, setHistoryFilter] = useState("week");
  const [selectedExportDate, setSelectedExportDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [exportingLnPdf, setExportingLnPdf] = useState(false);
  const historyFilterLabels = {
    week: t("common.week", "Deze week"),
    "2weeks": t("digitalplanning.station_detail.two_weeks", "2 weken"),
    month: t("digitalplanning.station_detail.thirty_days", "30 dagen"),
    all: t("common.all", "Alles"),
  };
  const stationNorm = normalizeMachine(stationId);
  const LN_EXPORT_DELAY_MINUTES = 5;

  const toDateValue = (value) => {
    if (!value) return null;
    if (value?.toDate) {
      const converted = value.toDate();
      return Number.isFinite(converted?.getTime?.()) ? converted : null;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };

  const selectedDayStart = useMemo(() => {
    const date = new Date(selectedExportDate);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [selectedExportDate]);

  const selectedDayEnd = useMemo(() => {
    const date = new Date(selectedExportDate);
    date.setHours(23, 59, 59, 999);
    return date;
  }, [selectedExportDate]);

  const selectedDayIso = useMemo(() => {
    const y = selectedDayStart.getFullYear();
    const m = String(selectedDayStart.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDayStart.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedDayStart]);

  const selectedDayLabel = useMemo(() => {
    return selectedDayStart.toLocaleDateString("nl-NL", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [selectedDayStart]);

  const allOrdersByOrderId = useMemo(() => {
    const map = new Map();
    (allOrders || []).forEach((order) => {
      const key = String(order?.orderId || order?.id || "").trim();
      if (!key || map.has(key)) return;
      map.set(key, order);
    });
    return map;
  }, [allOrders]);

  const extractReferenceOperations = (order) => {
    if (!order || typeof order !== "object") return [];

    const fromReferenceMap = Object.keys(order.referenceOperationTimes || {})
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (fromReferenceMap.length > 0) {
      return Array.from(new Set(fromReferenceMap)).sort((a, b) => Number(a) - Number(b));
    }

    const fromOperations = Object.keys(order.operations || {})
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (fromOperations.length > 0) {
      return Array.from(new Set(fromOperations)).sort((a, b) => Number(a) - Number(b));
    }

    return [];
  };

  const toLnReferenceCode = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw;

    return digits.slice(-2);
  };

  const toLnReferenceList = (values = []) => {
    const normalized = (Array.isArray(values) ? values : [values])
      .map((value) => toLnReferenceCode(value))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const getWikkelenStartTime = (product) => {
    const direct =
      toDateValue(product?.timestamps?.wikkelen_start) ||
      toDateValue(product?.timestamps?.station_start);
    if (direct) return direct;

    const history = Array.isArray(product?.history) ? product.history : [];
    for (const entry of history) {
      const text = `${entry?.action || ""} ${entry?.details || ""}`.toLowerCase();
      if (text.includes("start wikkelen")) {
        const ts = toDateValue(entry?.timestamp);
        if (ts) return ts;
      }
    }
    return null;
  };

  const getWikkelenCompletionTime = (product) => {
    const direct =
      toDateValue(product?.timestamps?.wikkelen_end) ||
      toDateValue(product?.timestamps?.lossen_start);
    if (direct) return direct;

    const history = Array.isArray(product?.history) ? product.history : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      const text = `${entry?.action || ""} ${entry?.details || ""}`.toLowerCase();
      if (text.includes("wikkelen naar lossen") || text.includes("doorgestuurd naar lossen")) {
        const ts = toDateValue(entry?.timestamp);
        if (ts) return ts;
      }
    }
    return null;
  };

  const lnWikkelenRows = useMemo(() => {
    if (!stationNorm.startsWith("BH")) return [];

    const now = new Date();
    const currentDay = new Date();
    currentDay.setHours(0, 0, 0, 0);
    const isToday = currentDay.getTime() === selectedDayStart.getTime();
    const cutoff = new Date(now.getTime() - LN_EXPORT_DELAY_MINUTES * 60 * 1000);

    const perOrder = new Map();
    const sourceProducts = [...(allProducts || []), ...(allArchivedProducts || [])];

    sourceProducts.forEach((product) => {
      const productStationNorm = normalizeMachine(
        product?.originMachine || product?.machine || product?.lastStation || product?.currentStation || ""
      );
      if (productStationNorm !== stationNorm) return;

      const statusNorm = String(product?.status || "").toLowerCase();
      if (statusNorm === "cancelled" || statusNorm === "geannuleerd") return;

      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const wikkelenStart = getWikkelenStartTime(product);
      const wikkelenCompletion = getWikkelenCompletionTime(product);
      if (!wikkelenStart || !wikkelenCompletion) return;

      if (wikkelenStart > selectedDayEnd) return;
      if (wikkelenCompletion < selectedDayStart || wikkelenCompletion > selectedDayEnd) return;
      if (isToday && wikkelenCompletion > cutoff) return;

      const order = allOrdersByOrderId.get(orderId);
      const refOps = toLnReferenceList(extractReferenceOperations(order));
      const refOpsText = refOps.length > 0 ? refOps.join(",") : "20";

      const existing = perOrder.get(orderId) || {
        orderId,
        refOpsText,
        count: 0,
      };

      existing.count += 1;
      if (!existing.refOpsText || existing.refOpsText === "20") {
        existing.refOpsText = refOpsText;
      }
      perOrder.set(orderId, existing);
    });

    return Array.from(perOrder.values())
      .sort((a, b) => a.orderId.localeCompare(b.orderId))
      .map((row) => {
        const orderQr = `ORDER:${row.orderId}`;
        const refQr = `REFOPS:${row.refOpsText}`;
        const countQr = `COUNT:${row.count}|DATE:${selectedDayIso}|STATION:${stationNorm}`;
        return {
          ...row,
          orderQr,
          refQr,
          countQr,
        };
      });
  }, [allProducts, allArchivedProducts, allOrdersByOrderId, selectedDayEnd, selectedDayIso, selectedDayStart, stationNorm]);

  const handleExportLnWikkelenPdf = async () => {
    if (lnWikkelenRows.length === 0 || exportingLnPdf) return;

    setExportingLnPdf(true);
    try {
      const [{ jsPDF }, qrModule] = await Promise.all([
        import("jspdf"),
        import("qrcode"),
      ]);
      const QRCode = qrModule?.default || qrModule;
      const doc = new jsPDF("p", "mm", "a4");

      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text(`LN Wikkelen Export - ${stationId}`, 12, 12);
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Datum: ${selectedDayIso} | Buffer: ${LN_EXPORT_DELAY_MINUTES} min`, 12, 18);

      let y = 24;
      const qrSize = 22;
      const blockHeight = 44;
      const qrOrderX = 68;
      const qrRefX = 110;
      const qrCountX = 152;

      for (const row of lnWikkelenRows) {
        if (y + blockHeight > 285) {
          doc.addPage();
          y = 14;
        }

        const [orderDataUrl, refDataUrl, countDataUrl] = await Promise.all([
          QRCode.toDataURL(row.orderQr, { width: 220, margin: 1 }),
          QRCode.toDataURL(row.refQr, { width: 220, margin: 1 }),
          QRCode.toDataURL(row.countQr, { width: 220, margin: 1 }),
        ]);

        doc.setDrawColor(225, 230, 238);
        doc.roundedRect(10, y - 2, 190, blockHeight - 2, 2, 2);

        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(`Order ${row.orderId}`, 12, y + 3);
        doc.setFont(undefined, "normal");
        doc.text(`RefOps: ${row.refOpsText}`, 12, y + 8);
        doc.text(`Aantal: ${row.count}`, 12, y + 13);

        doc.addImage(orderDataUrl, "PNG", qrOrderX, y, qrSize, qrSize);
        doc.addImage(refDataUrl, "PNG", qrRefX, y, qrSize, qrSize);
        doc.addImage(countDataUrl, "PNG", qrCountX, y, qrSize, qrSize);

        doc.setFontSize(7);
        doc.text("ORDER", qrOrderX + qrSize / 2, y + qrSize + 3, { align: "center" });
        doc.text("REF OPS", qrRefX + qrSize / 2, y + qrSize + 3, { align: "center" });
        doc.text("AANTAL", qrCountX + qrSize / 2, y + qrSize + 3, { align: "center" });

        doc.setFontSize(8);
        doc.text(String(row.orderId || "-"), qrOrderX + qrSize / 2, y + qrSize + 7, { align: "center" });
        doc.text(String(row.refOpsText || "-"), qrRefX + qrSize / 2, y + qrSize + 7, { align: "center" });
        doc.text(String(row.count || 0), qrCountX + qrSize / 2, y + qrSize + 7, { align: "center" });

        y += blockHeight;
      }

      doc.save(`ln_wikkelen_export_${stationNorm}_${selectedDayIso}.pdf`);
    } catch (error) {
      console.error("LN Wikkelen PDF export mislukt", error);
      alert(t("digitalplanning.station_detail.ln_export_failed", "LN export mislukt."));
    } finally {
      setExportingLnPdf(false);
    }
  };

  // Failsafe: als stationNorm een BA-station is en de parent scope is 'fittings', render niets
  const urlParams = new URLSearchParams(window.location.search);
  const scope = urlParams.get('scope') || '';
  if (scope.toLowerCase() === 'fittings' && stationNorm.startsWith('ba')) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] items-center justify-center p-10">
          <AlertCircle size={48} className="text-rose-400 mb-4" />
          <h2 className="text-xl font-black text-rose-600 mb-2">{t("digitalplanning.station_detail.not_allowed", "Niet toegestaan")}</h2>
          <p className="text-slate-500 text-sm mb-6">{t("digitalplanning.station_detail.not_in_fittings", "Dit station hoort niet bij de afdeling Fittings.")}</p>
          <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest">{t("common.close", "Sluiten")}</button>
        </div>
      </div>
    );
  }

  // 1. Nu Actief (Live)
  const activeItems = useMemo(() => {
    return allProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;
      
      const currentNorm = normalizeMachine(p.currentStation || "");
      const originNorm = normalizeMachine(p.originMachine || "");
      const machineNorm = normalizeMachine(p.machine || "");
      const stepNorm = normalizeMachine(p.currentStep || "");

      return currentNorm === stationNorm || originNorm === stationNorm || machineNorm === stationNorm || stepNorm === stationNorm;
    });
  }, [allProducts, stationNorm]);

  // Teller voor items die wachten op lossen
  const waitingForUnloadCount = useMemo(() => {
    return activeItems.filter(p => 
      p.currentStep === "Lossen" || 
      p.status === "Wacht op Lossen" || 
      p.status === "Te Lossen" ||
      (p.currentStation && normalizeMachine(p.currentStation) === "LOSSEN")
    ).length;
  }, [activeItems]);

  // 2. Planning (Wachtrij)
  const groupedPlanning = useMemo(() => {
    const now = new Date();
    const { week: currentWeek, year: currentYear } = getISOWeekInfo(now);

    const relevantOrders = allOrders
      .filter((o) => {
        return o.normMachine === stationNorm && o.status !== "completed";
      })
      .sort((a, b) => {
        return a.dateObj - b.dateObj;
      });

    const groups = relevantOrders.reduce((acc, order) => {
      let week = parseInt(order.weekNumber);
      let year = parseInt(order.weekYear);

      // FIX: Als week/jaar ontbreekt of ongeldig is, probeer uit datum te halen
      if ((isNaN(week) || isNaN(year)) && order.dateObj) {
        const d = order.dateObj.toDate ? order.dateObj.toDate() : new Date(order.dateObj);
        const info = getISOWeekInfo(d);
        if (isNaN(week)) week = info.week;
        if (isNaN(year)) year = info.year;
      }

      // Fallback naar huidig als nog steeds onbekend
      if (isNaN(week)) week = currentWeek;
      if (isNaN(year)) year = currentYear;

      // LOGIC: Orders uit verleden meenemen naar huidige week
      const isPast = year < currentYear || (year === currentYear && week < currentWeek);
      
      if (isPast) {
        week = currentWeek;
        // year = currentYear; // Impliciet
      }

      if (!acc[week]) acc[week] = [];
      
      // Voeg flags toe voor weergave (isOverdue, isMoved)
      // We nemen aan dat 'isMoved' of 'priority' in de order data zit als deze verplaatst is
      acc[week].push({ 
        ...order, 
        isOverdue: isPast,
        isPriority: order.isMoved || order.priority === true || order.priority === "high" 
      });
      return acc;
    }, {});

    // Sorteer binnen de weken: Verplaatst/Prio eerst, dan Plan nummer, dan Datum
    Object.keys(groups).forEach(week => {
      groups[week].sort((a, b) => {
        // 1. Verplaatste / Priority orders bovenaan
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        
        // 2. Plan volgorde (indien ingesteld)
        const planA = a.plan || 999;
        const planB = b.plan || 999;
        if (planA !== planB) return planA - planB;
        
        // 3. Datum
        return a.dateObj - b.dateObj;
      });
    });

    const sortedWeeks = Object.keys(groups).sort((a, b) => a - b);

    return { groups, sortedWeeks, total: relevantOrders.length };
  }, [allOrders, stationNorm]);

  // 3. Historie (Recent gereed)
  const historyItems = useMemo(() => {
    const now = new Date();
    const currentWeekInfo = getISOWeekInfo(now);
    const sourceProducts = [...allProducts, ...allArchivedProducts];

    return sourceProducts
      .filter((p) => {
        const pMachine = String(
          p.lastStation || p.originMachine || p.currentStation || p.machine || ""
        );

        const statusNorm = String(p.status || "").toUpperCase();
        const stepNorm = String(p.currentStep || "").toUpperCase();
        const isFinished =
          statusNorm === "FINISHED" ||
          statusNorm === "COMPLETED" ||
          statusNorm === "GEREED" ||
          stepNorm === "FINISHED";

        if (
          normalizeMachine(pMachine) !== stationNorm ||
          !isFinished
        ) {
          return false;
        }

        const updatedAt = p.updatedAt?.toDate
          ? p.updatedAt.toDate()
          : new Date(p.updatedAt || 0);
        const itemWeekInfo = getISOWeekInfo(updatedAt);

        if (historyFilter === "week") {
          return (
            itemWeekInfo.year === currentWeekInfo.year &&
            itemWeekInfo.week === currentWeekInfo.week
          );
        }

        if (historyFilter === "2weeks") {
          const diffTime = Math.abs(now - updatedAt);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 14;
        }

        if (historyFilter === "month") {
          const diffTime = Math.abs(now - updatedAt);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        }

        return true;
      })
      .sort(
        (a, b) => {
          const aTime = a.updatedAt?.toDate
            ? a.updatedAt.toDate().getTime()
            : new Date(a.updatedAt || 0).getTime() || 0;
          const bTime = b.updatedAt?.toDate
            ? b.updatedAt.toDate().getTime()
            : new Date(b.updatedAt || 0).getTime() || 0;
          return bTime - aTime;
        }
      );
  }, [allProducts, allArchivedProducts, stationNorm, historyFilter]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl ${
                activeItems.length > 0
                  ? "bg-green-100 text-green-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <Activity
                size={24}
                className={activeItems.length > 0 ? "animate-pulse" : ""}
              />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-800 uppercase italic tracking-tight">
                {stationId}
              </h2>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {activeItems.length > 0
                  ? t("digitalplanning.station_detail.production_active", "Production Active")
                  : t("digitalplanning.station_detail.station_standby", "Station Standby")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stationNorm.startsWith("BH") && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(selectedExportDate);
                    next.setDate(next.getDate() - 1);
                    setSelectedExportDate(next);
                  }}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                  title={t("common.previous_day", "Vorige dag")}
                >
                  <ChevronLeft size={16} className="text-slate-600" />
                </button>
                <div className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-black uppercase tracking-widest text-slate-600 min-w-[130px] text-center">
                  {selectedDayLabel}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(selectedExportDate);
                    next.setDate(next.getDate() + 1);
                    setSelectedExportDate(next);
                  }}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                  title={t("common.next_day", "Volgende dag")}
                >
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
                <button
                  type="button"
                  onClick={handleExportLnWikkelenPdf}
                  disabled={lnWikkelenRows.length === 0 || exportingLnPdf}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title={t("digitalplanning.station_detail.export_ln_wikkelen", "Export LN Wikkelen PDF")}
                >
                  <FileDown size={14} />
                  {exportingLnPdf
                    ? t("common.loading", "Laden...")
                    : t("digitalplanning.station_detail.export_ln_wikkelen", "Export LN Wikkelen")}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 gap-6 bg-white sticky top-0 z-10">
          <button
            onClick={() => setActiveTab("active")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "active"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Zap size={16} /> {t("digitalplanning.station_detail.active_now", "Nu Actief")} ({activeItems.length})
          </button>
          <button
            onClick={() => setActiveTab("planning")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "planning"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <CalendarIcon size={16} /> {t("digitalplanning.terminal.tab_planning", "Planning")} ({groupedPlanning.total})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <History size={16} /> {t("digitalplanning.station_detail.history", "Historie")}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-slate-50/30 flex-1">
          {activeTab === "active" && (
            <div className="space-y-3">
              {activeItems.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 mb-2">
                   {waitingForUnloadCount > 0 && (
                     <div className="px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-2">
                       <Clock size={12} className="text-orange-500" />
                       <span className="text-[10px] font-black text-orange-600 uppercase tracking-wide">
                         {t("lossen.wait_for_unload", "Wacht op Lossen")}: {waitingForUnloadCount}
                       </span>
                     </div>
                   )}
                   <div className="px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2">
                     <Activity size={12} className="text-green-500" />
                     <span className="text-[10px] font-black text-green-600 uppercase tracking-wide">
                       {t("status.in_production", "In Productie")}: {activeItems.length - waitingForUnloadCount}
                     </span>
                   </div>
                </div>
              )}

              {activeItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Zap size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase">
                    {t("digitalplanning.station_detail.no_active_production_now", "Geen actieve productie op dit moment.")}
                  </p>
                </div>
              ) : (
                activeItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex justify-between items-center border-l-4 border-l-green-500 animate-in slide-in-from-bottom-2"
                  >
                    <div>
                      <h4 className="text-lg font-black text-gray-800">
                        {item.lotNumber}
                      </h4>
                      <p className="text-sm font-bold text-gray-500">
                        {item.item}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-xs font-bold uppercase animate-pulse inline-block mb-1">
                        {t("status.active", "Actief")}
                      </span>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">
                        {t("personnelOccupancy.labels.operator", "Operator")}: {item.operator?.split("@")[0] || t("common.unknown", "Onbekend")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "planning" && (
            <div className="space-y-6">
              {stationNorm.startsWith("BH") && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">
                        {t("digitalplanning.station_detail.ln_wikkelen_daily", "LN Wikkelen Dagoverzicht")}
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400">
                        {t("digitalplanning.station_detail.ln_wikkelen_rows", {
                          count: lnWikkelenRows.length,
                          defaultValue: "{{count}} orderregels voor {{date}}",
                          date: selectedDayIso,
                        })}
                      </p>
                    </div>
                  </div>

                  {lnWikkelenRows.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t("digitalplanning.station_detail.no_wikkelen_records_day", "Geen afgeronde wikkelstappen op deze dag.")}
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                      {lnWikkelenRows.map((row) => (
                        <div key={row.orderId} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-black text-slate-800">{row.orderId}</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RefOps: {row.refOpsText} | Aantal: {row.count}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Order</p>
                              <InternalQrImage value={row.orderQr} size={140} alt="Order QR" className="w-full aspect-square object-contain" />
                              <p className="text-[10px] font-black text-slate-700 mt-1 break-all">{row.orderId}</p>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Ref Ops</p>
                              <InternalQrImage value={row.refQr} size={140} alt="Reference operations QR" className="w-full aspect-square object-contain" />
                              <p className="text-[10px] font-black text-slate-700 mt-1 break-all">{row.refOpsText}</p>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-lg p-2 text-center">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Aantal</p>
                              <InternalQrImage value={row.countQr} size={140} alt="Dag aantal QR" className="w-full aspect-square object-contain" />
                              <p className="text-[10px] font-black text-slate-700 mt-1 break-all">{row.count}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {groupedPlanning.sortedWeeks.map((week) => (
                <div key={week} className="animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Week {week}
                    </span>
                    <div className="h-px bg-slate-200 flex-1"></div>
                  </div>
                  <div className="space-y-2">
                    {groupedPlanning.groups[week].map((order) => (
                      <div
                          key={order.id || Math.random()}
                          className={`p-3 rounded-xl border shadow-sm flex justify-between items-center hover:shadow-md transition-shadow ${
                            order.isPriority 
                              ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200" 
                              : "bg-white border-gray-200"
                          }`}
                      >
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs ${order.isPriority ? "bg-amber-200 text-amber-800" : "bg-blue-50 text-blue-600"}`}>
                            {order.plan}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-gray-800">
                              {order.orderId}
                            </h4>
                            <p className="text-xs text-gray-500 line-clamp-1">
                              {order.item}
                            </p>
                              {order.isOverdue && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase mt-0.5">
                                  <AlertCircle size={10} /> {t("digitalplanning.station_detail.from_previous_week", "From previous week")}
                                </span>
                              )}
                              {order.isPriority && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 uppercase mt-0.5">
                                  <ArrowUpCircle size={10} /> {t("digitalplanning.station_detail.priority_moved", "Priority / Moved")}
                                </span>
                              )}
                              {order.rejectedCount > 0 && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-rose-600 uppercase mt-0.5">
                                  <RotateCcw size={10} /> {t("digitalplanning.station_detail.repair", "Repair")} ({order.rejectedCount})
                                </span>
                              )}
                              {order.activeLot && (
                                <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">
                                  Lot: {order.activeLot}
                                </p>
                              )}
                          </div>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={order.status} />
                          {order.liveFinish > 0 && (
                            <p className="text-[10px] text-green-600 font-bold mt-1">
                              {t("digitalplanning.station_detail.ready_count", "{{count}} ready", { count: order.liveFinish })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groupedPlanning.total === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <CalendarIcon size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-bold uppercase">
                    {t("digitalplanning.station_detail.no_orders_planned", "No orders planned")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex bg-white p-1 rounded-lg border border-gray-200 w-fit">
                {["week", "2weeks", "month", "all"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setHistoryFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${
                      historyFilter === f
                        ? "bg-blue-50 text-blue-600 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {historyFilterLabels[f] || f}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest pl-1">
                {t("digitalplanning.station_detail.ready_items", "{{count}} items completed", { count: historyItems.length })}
              </p>
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center opacity-75 hover:opacity-100 transition-opacity"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-gray-700">
                        {item.lotNumber}
                      </h4>
                      <p className="text-xs text-gray-400 line-clamp-1">
                        {item.item}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={item.status || "completed"} />
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {formatDate(item.updatedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StationDetailModal;
