import React, { useEffect, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
  FileText,
  Sparkles,
  ArrowLeft,
  PlayCircle,
  AlertCircle,
  ArrowUpCircle,
  FileImage,
  X,
  RefreshCw,
  Copy,
  Factory,
  Clock,
  Briefcase,
  PauseCircle,
  History,
  Calendar,
} from "lucide-react";
import { findDrawingForProduct } from "../../../utils/findDrawingForProduct";
import { manualSyncDrawings } from "../../../utils/manualSyncDrawings";
import { format, differenceInDays, startOfDay, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { toDateSafe } from "../../../utils/dateUtils";
import StatusBadge from "../common/StatusBadge";

const TerminalPlanningView = ({
  orders = [],
  selectedOrderId,
  onSelectOrder,
  searchTerm,
  onSearchChange,
  onDateChange,
  referenceDate,
  showAllWeeks,
  onToggleAllWeeks,
  targetWeekNum,
  productionProgressMap = {},
  rejectedCountMap = {},
  readyForReturnMap = {},
  isBM01,
  onStartProduction,
  selectedOrder,
  onViewDrawing,
  optimizationPanel,
  currentStation, // BH18, NABEWERKEN, etc.
}) => {
  const itemRefs = useRef({});

  // --- Helpers ---
  const parseDateSafe = (dateInput) => {
    return toDateSafe(dateInput);
  };

  const getUrgencyColor = (dateInput) => {
    const d = parseDateSafe(dateInput);
    if (!d) return "text-slate-400";

    const today = startOfDay(new Date());
    const deliveryDate = startOfDay(d);
    const daysUntil = differenceInDays(deliveryDate, today);

    if (daysUntil <= 7) return "text-red-600 font-black"; // 1 week: Rood
    if (daysUntil <= 14) return "text-blue-600 font-black"; // 2 weken: Blauw
    return "text-slate-600 font-bold"; // > 2 weken: Standaard
  };

  const formatDateLabel = (dateInput, fallback = "--") => {
    const parsedDate = parseDateSafe(dateInput);
    if (!parsedDate) return fallback;
    return format(parsedDate, "dd MMM yyyy", { locale: nl });
  };

  const formatDateWithWeek = (dateInput, fallback = "--") => {
    const parsedDate = parseDateSafe(dateInput);
    if (!parsedDate) return fallback;
    const week = String(getISOWeek(parsedDate)).padStart(2, "0");
    return `W${week}  ${format(parsedDate, "dd MMM yyyy", { locale: nl })}`;
  };

  const getOrderDisplayName = (order) => {
    // Geef voorkeur aan de Omschrijving (AH) uit LN
    return (
      order?.itemDescription || order?.item || order?.itemCode || "ONBEKEND PRODUCT"
    );
  };

  const getPriorityLevel = (order) => {
    const rawPriority = order?.priority;
    const normalizedPriority =
      rawPriority === true
        ? "high"
        : String(rawPriority || "").toLowerCase().trim();

    if (normalizedPriority === "immediate") return "immediate";
    if (normalizedPriority === "urgent") return "urgent";
    if (normalizedPriority === "high") return "high";
    if (order?.isMoved) return "high";
    return "normal";
  };

  const getPriorityRank = (order) => {
    const level = getPriorityLevel(order);
    if (level === "immediate") return 3;
    if (level === "urgent") return 2;
    if (level === "high") return 1;
    return 0;
  };

  const getPriorityBadgeStyles = (order) => {
    const level = getPriorityLevel(order);
    if (level === "immediate") {
      return {
        label: "1e Prio",
        className: "bg-rose-100 text-rose-700 border border-rose-200",
      };
    }
    if (level === "urgent") {
      return {
        label: "Spoed",
        className: "bg-orange-100 text-orange-700 border border-orange-200",
      };
    }
    if (level === "high") {
      return {
        label: "Prio",
        className: "bg-amber-100 text-amber-700 border border-amber-200",
      };
    }

    return null;
  };

  const hasLinkedDrawing = (order) => {
    const drawingValue = String(order?.drawing || "").trim();
    const drawingUrlValue = String(order?.drawingUrl || "").trim();

    return (
      (drawingValue !== "" && drawingValue !== "-") ||
      drawingUrlValue !== ""
    );
  };

  const sortedOrders = React.useMemo(() => {
    if (!orders) return [];
    return [...orders].sort((a, b) => {
      const aPriorityRank = getPriorityRank(a);
      const bPriorityRank = getPriorityRank(b);

      if (aPriorityRank !== bPriorityRank) return bPriorityRank - aPriorityRank;

      // Sorteer op leverdatum (AQ) voor de beste flow
      const dateA = parseDateSafe(a.plannedDeliveryDate || a.deliveryDate || a.plannedDate);
      const dateB = parseDateSafe(b.plannedDeliveryDate || b.deliveryDate || b.plannedDate);

      if (dateA && dateB) return dateA - dateB;
      return 0;
    });
  }, [orders]);

  const [drawingLoading, setDrawingLoading] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState(0);
  const [missingItems, setMissingItems] = React.useState([]);
  const [showMissingModal, setShowMissingModal] = React.useState(false);

  const handleSyncDrawings = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncProgress(0);
    setMissingItems([]);
    setShowMissingModal(false);

    try {
      const results = await manualSyncDrawings((current, total, partialResults) => {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        setSyncProgress(pct);

        if (Array.isArray(partialResults)) {
          const partialMissing = partialResults
            .filter((r) => r && r.found === false)
            .map((r) => r.code)
            .filter(Boolean);
          setMissingItems(partialMissing);
        }
      });

      const foundCount = (results || []).filter((r) => r?.found).length;
      const notFoundCodes = (results || [])
        .filter((r) => r && r.found === false)
        .map((r) => r.code)
        .filter(Boolean);

      setMissingItems(notFoundCodes);

      if (notFoundCodes.length > 0) {
        setShowMissingModal(true);
      }

      alert(
        `Sync gereed. Matches: ${foundCount}. Niet gevonden: ${notFoundCodes.length}.`
      );
    } catch (error) {
      console.error("Sync tekeningen mislukt:", error);
      alert(`Sync mislukt: ${error?.message || "Onbekende fout"}`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedOrderId && itemRefs.current[selectedOrderId]) {
      itemRefs.current[selectedOrderId].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedOrderId]);

  const selectedOrderTotal = selectedOrder
    ? Number(selectedOrder.quantity || selectedOrder.plan) || 1
    : 0;
  const selectedOrderProduced = selectedOrder
    ? productionProgressMap[String(selectedOrder.orderId || "").trim()] || 0
    : 0;
  const selectedOrderRejected = selectedOrder
    ? rejectedCountMap[String(selectedOrder.orderId || "").trim()] || 0
    : 0;

  return (
    <>
      {/* Sidebar Planning */}
      <div
        className={`w-full lg:w-7/12 p-4 md:p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${
          selectedOrderId ? "hidden lg:flex" : "flex"
        } text-left`}
      >
        {/* Header Section */}
        <div className="mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
              size={18}
            />
            <input
              type="text"
              placeholder="Zoek order, product of project..."
              className="w-full pl-12 pr-10 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="flex gap-2 shrink-0 items-center">
            {!isBM01 && !showAllWeeks && onDateChange && (
              <div className="flex items-center gap-1 bg-white border-2 border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => onDateChange('prev')}
                  className="px-2 py-3 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-all"
                  title="Vorige week"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => onDateChange('reset')}
                  className="px-4 py-3 font-black text-sm uppercase tracking-widest text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all whitespace-nowrap"
                  title="Terug naar huidige week"
                >
                  W{String(targetWeekNum).padStart(2, '0')}
                </button>
                <button
                  onClick={() => onDateChange('next')}
                  className="px-2 py-3 text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-all"
                  title="Volgende week"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {!isBM01 && (
              <button
                onClick={onToggleAllWeeks}
                className={`px-4 py-3 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${
                  showAllWeeks
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
                }`}
              >
                <Layers size={16} /> {showAllWeeks ? "Wekelijks" : "Alles"}
              </button>
            )}

            <button
              onClick={handleSyncDrawings}
              disabled={isSyncing}
              className="p-3 rounded-2xl border border-slate-100 bg-white text-slate-400 hover:text-blue-600 transition-all"
              title={isSyncing ? `Sync bezig... ${syncProgress}%` : "Sync tekeningen"}
            >
              <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
            </button>
            {isSyncing && (
              <span className="px-2 py-1 text-[10px] font-black rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                {syncProgress}%
              </span>
            )}
          </div>
        </div>

        {/* Orders Scroll Area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar pr-1 pb-10">
          {sortedOrders.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center opacity-20">
              <Layers size={60} className="mb-4" />
              <p className="font-black uppercase italic tracking-widest">
                Geen orders gevonden
              </p>
            </div>
          ) : (
            sortedOrders.map((order) => {
              const produced =
                productionProgressMap[String(order.orderId || "").trim()] || 0;
              const rejectedCount =
                rejectedCountMap[String(order.orderId || "").trim()] || 0;
              const total = Number(order.plan || order.quantity) || 1;
              const deliveryDate = order.plannedDeliveryDate || order.deliveryDate;
              const displayName = getOrderDisplayName(order);
              const urgencyClass = getUrgencyColor(deliveryDate);
              const drawingLinked = hasLinkedDrawing(order);
              const priorityBadge = getPriorityBadgeStyles(order);
              const priorityLevel = getPriorityLevel(order);
              const priorityCardClass =
                order.status === 'on_hold'
                  ? "border-orange-300 bg-orange-50/60 opacity-70"
                  : priorityLevel === "immediate"
                    ? "border-rose-400 bg-rose-50/40 hover:border-rose-500"
                    : priorityLevel === "urgent"
                      ? "border-orange-400 bg-orange-50/40 hover:border-orange-500"
                      : priorityLevel === "high"
                        ? "border-amber-400 bg-amber-50/40 hover:border-amber-500"
                        : "border-slate-100 bg-white hover:border-slate-200";

              return (
                <div
                  key={order.id}
                  ref={(el) => (itemRefs.current[order.id] = el)}
                  onClick={() => onSelectOrder(order.id)}
                  className={`p-5 rounded-[2rem] border-2 transition-all flex items-center justify-between relative overflow-hidden cursor-pointer ${
                    selectedOrderId === order.id
                      ? "bg-blue-50 border-blue-500 shadow-md translate-x-1"
                      : priorityCardClass
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 overflow-hidden">
                    {/* WIK/Drawing Button */}
                    <div
                      onClick={(e) => {
                        if (drawingLinked && onViewDrawing) {
                          e.stopPropagation();
                          onViewDrawing(order.drawing);
                        }
                      }}
                      className={`p-3 rounded-2xl shrink-0 transition-all ${
                        drawingLinked
                          ? "bg-blue-100 text-blue-600 cursor-pointer hover:bg-blue-200 active:scale-95"
                          : "bg-slate-50 text-slate-300"
                      }`}
                      title={drawingLinked ? "Bekijk technische tekening" : ""}
                    >
                      <FileImage size={24} />
                    </div>

                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded uppercase tracking-tighter">
                          {order.machine}
                        </span>
                        <span className="text-sm font-black text-slate-900">
                          {order.orderId}
                        </span>
                        {priorityBadge && (
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wide ${priorityBadge.className}`}>
                            {priorityBadge.label}
                          </span>
                        )}
                      </div>
                      <h4 className="font-black text-base leading-tight truncate uppercase text-slate-800 mb-1">
                        {displayName}
                      </h4>
                      {order.extraCode && order.extraCode !== "-" && (
                        <span className="inline-block mb-1 px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-black uppercase tracking-wide">
                          {order.extraCode}
                        </span>
                      )}
                      {order.projectDesc && (
                        <p className="text-[10px] font-bold text-blue-500 uppercase truncate flex items-center gap-1">
                          <Briefcase size={10} /> {order.projectDesc}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status & Timing Info */}
                  <div className="flex flex-col items-end gap-2 text-right shrink-0 ml-4">
                    <div className="flex items-center gap-2">
                      {/* Toon BH uren (1715) indien aanwezig */}
                      {order.plannedHoursBH > 0 && (
                        <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-[10px] font-black">
                          <Clock size={10} /> {Number(order.plannedHoursBH).toFixed(1)}h
                        </span>
                      )}
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black text-slate-900">
                        Gemaakt: {produced} / {total} ST
                      </span>
                      {rejectedCount > 0 && (
                        <span className="text-[10px] font-black text-rose-600 uppercase">
                          Afkeur: {rejectedCount}
                        </span>
                      )}
                      <span className={`text-xs uppercase tracking-tighter ${urgencyClass}`}>
                        {formatDateWithWeek(deliveryDate)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div
        className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${
          !selectedOrderId ? "hidden lg:flex" : "flex"
        }`}
      >
        {selectedOrder ? (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
            {/* Header Card */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Factory size={120} />
              </div>

              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <button
                    onClick={() => onSelectOrder(null)}
                    className="lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] block mb-2">
                    Productie Dossier
                  </span>
                  <h2 className="text-4xl font-black italic tracking-tighter leading-none mb-2">
                    {selectedOrder.orderId}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="bg-blue-600 px-3 py-1 rounded-xl text-[10px] font-black uppercase">
                      {selectedOrder.machine}
                    </span>
                    {getPriorityBadgeStyles(selectedOrder) && (
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide ${getPriorityBadgeStyles(selectedOrder).className}`}>
                        {getPriorityBadgeStyles(selectedOrder).label}
                      </span>
                    )}
                    <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
                      LN Status: {selectedOrder.orderStatus || "Actief"}
                    </span>
                    {selectedOrder.extraCode && selectedOrder.extraCode !== "-" && (
                      <span className="bg-amber-400 text-amber-900 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide">
                        {selectedOrder.extraCode}
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={selectedOrder.status} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-t border-white/10 pt-8 relative z-10">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    Leverdatum (AQ)
                  </p>
                  <p
                    className={`text-lg font-black ${getUrgencyColor(
                      selectedOrder.plannedDeliveryDate || selectedOrder.deliveryDate
                    )}`}
                  >
                    {formatDateWithWeek(
                      selectedOrder.plannedDeliveryDate || selectedOrder.deliveryDate,
                      "N/A"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    Totaal Plan
                  </p>
                  <p className="text-lg font-black">
                    {selectedOrderTotal} stuks
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    Gemaakt
                  </p>
                  <p className="text-lg font-black text-blue-300">
                    {selectedOrderProduced} stuks
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase mb-1">
                    Afkeur
                  </p>
                  <p className="text-lg font-black text-rose-300">
                    {selectedOrderRejected} stuks
                  </p>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                    Product Omschrijving
                  </h4>
                  <p className="text-2xl font-black text-slate-800 leading-tight uppercase italic">
                    {getOrderDisplayName(selectedOrder)}
                  </p>
                  <p className="text-sm font-bold text-slate-400 mt-2">
                    {selectedOrder.itemCode}
                  </p>
                </section>

                <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Project Details
                  </h4>
                  <p className="text-base font-black text-slate-700 uppercase">
                    {selectedOrder.projectDesc || "Geen projectnaam"}
                  </p>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    Klant: {selectedOrder.customer || "Onbekend"}
                  </p>
                  {selectedOrder.extraCode && selectedOrder.extraCode !== "-" && (
                    <p className="text-xs font-bold text-slate-500 mt-1">
                      Code: <span className="text-amber-600 font-black">{selectedOrder.extraCode}</span>
                    </p>
                  )}
                </section>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-8">
                <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <History size={14} /> Administratie
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        Aanmaakdatum LN:
                      </span>
                      <span className="text-sm font-black text-blue-600 flex items-center gap-2">
                        <Calendar size={14} /> {selectedOrder.orderCreationDate || "Niet beschikbaar"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        Tekeningnr:
                      </span>
                      <span className="text-sm font-black text-slate-700">
                        {selectedOrder.drawing || "-"}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              {/* Action Area */}
              <div className="flex flex-col gap-4 border-t pt-8">
                {selectedOrder.status === 'on_hold' ? (
                  <div className="w-full py-6 bg-orange-100 text-orange-700 rounded-[1.5rem] font-black uppercase text-lg flex items-center justify-center gap-4 border-2 border-orange-200">
                    <PauseCircle size={28} /> Order On Hold
                  </div>
                ) : (
                  <button
                    onClick={() => onStartProduction(true)}
                    className="w-full py-6 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase text-lg shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-4"
                  >
                    <PlayCircle size={28} /> Start Productie
                  </button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      if (onViewDrawing) {
                        onViewDrawing(selectedOrder.drawing);
                      }
                    }}
                    className={`py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 ${
                      selectedOrder.drawing && selectedOrder.drawing !== "-" && selectedOrder.drawing !== ""
                        ? "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <FileImage size={16} /> Technische Tekening
                    {selectedOrder.drawing && selectedOrder.drawing !== "-" && selectedOrder.drawing !== "" && (
                      <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                  </button>
                  <button className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                    <AlertCircle size={16} /> Kwaliteitseisen
                  </button>
                </div>
              </div>

              {optimizationPanel}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20">
            <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center mb-6">
              <FileText size={48} className="text-slate-400" />
            </div>
            <h4 className="text-2xl font-black uppercase italic tracking-tighter">
              Selecteer een order uit de planning
            </h4>
          </div>
        )}
      </div>

      {showMissingModal && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900 uppercase">Niet Gekoppelde Codes</h3>
              <button
                type="button"
                onClick={() => setShowMissingModal(false)}
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold text-xs uppercase"
              >
                Sluiten
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Deze codes zijn tijdens de sync nog niet gevonden in catalogus/conversiematrix.
            </p>
            <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl p-3 bg-slate-50">
              {missingItems.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Alles gekoppeld.</p>
              ) : (
                <ul className="space-y-1">
                  {missingItems.slice(0, 200).map((code, idx) => (
                    <li key={`${code}-${idx}`} className="text-xs font-mono text-slate-700">
                      {code}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TerminalPlanningView;
