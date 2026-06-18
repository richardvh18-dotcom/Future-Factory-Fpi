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
  QrCode,
  CheckCircle2,
} from "lucide-react";
import {
  normalizeMachine,
  formatDate,
  getISOWeekInfo,
} from "../../../utils/hubHelpers";
import StatusBadge from "../common/StatusBadge";
import InternalQrImage from "../../../utils/InternalQrImage";

type AnyRecord = Record<string, any>;

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

type StationDetailModalProps = {
  stationId: string;
  allOrders: any[];
  allProducts: any[];
  allArchivedProducts?: any[];
  onClose: () => void;
};

const StationDetailModal = ({
  stationId,
  allOrders,
  allProducts,
  allArchivedProducts = [],
  onClose,
}: StationDetailModalProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("planning");
  const [historyFilter, setHistoryFilter] = useState("week");
  const [selectedExportDate, setSelectedExportDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const historyFilterLabels: Record<string, string> = {
    week: t("common.week", "Deze week"),
    "2weeks": t("digitalplanning.station_detail.two_weeks", "2 weken"),
    month: t("digitalplanning.station_detail.thirty_days", "30 dagen"),
    all: t("common.all", "Alles"),
  };
  const stationNorm = normalizeMachine(stationId);

  const toDateValue = (value: DateLikeInput) => {
    if (!value) return null;
    const valueObj = typeof value === "object" ? (value as { toDate?: () => Date }) : null;
    if (valueObj && typeof valueObj.toDate === "function") {
      const converted = valueObj.toDate();
      return Number.isFinite(converted?.getTime?.()) ? converted : null;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
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
    const map = new Map<string, AnyRecord>();
    (allOrders || []).forEach((order: AnyRecord) => {
      const key = String(order?.orderId || order?.id || "").trim();
      if (!key || map.has(key)) return;
      map.set(key, order);
    });
    return map;
  }, [allOrders]);

  const extractReferenceOperations = (order: AnyRecord) => {
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

  const toLnReferenceCode = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw;

    return digits.slice(-2);
  };

  const toLnReferenceList = (values: unknown[] | unknown = []) => {
    const normalized = (Array.isArray(values) ? values : [values])
      .map((value: unknown) => toLnReferenceCode(value))
      .filter(Boolean);
    return Array.from(new Set(normalized));
  };

  const getWikkelenStartTime = (product: AnyRecord) => {
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

  const getStationStartTime = (product: AnyRecord) => {
    const direct =
      toDateValue(product?.timestamps?.wikkelen_start) ||
      toDateValue(product?.timestamps?.station_start) ||
      toDateValue(product?.timestamps?.started) ||
      toDateValue(product?.createdAt);
    return direct;
  };

  const getWikkelenCompletionTime = (product: AnyRecord) => {
    const direct =
      toDateValue(product?.timestamps?.wikkelen_end) ||
      toDateValue(product?.timestamps?.lossen_start);
    if (direct) return direct;

    const history = Array.isArray(product?.history) ? product.history : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      const text = `${entry?.action || ""} ${entry?.details || ""}`.toLowerCase();
      if (text.includes("wikkelen naar lossen") || text.includes("doorgestuurd naar lossen") || text.includes("lossen")) {
        const ts = toDateValue(entry?.timestamp || entry?.time);
        if (ts) return ts;
      }
    }

    const stepUpper = String(product?.currentStep || "").toUpperCase();
    if (stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA" && stepUpper !== "REJECTED" && stepUpper !== "") {
      return toDateValue(product?.updatedAt) || toDateValue(product?.createdAt);
    }

    return null;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sourceProducts = [...allProducts, ...allArchivedProducts];

    const filtered = sourceProducts.filter((p: AnyRecord) => {
      if (p.currentStep === "REJECTED" || String(p.status || "").toLowerCase() === "rejected" || String(p.status || "").toLowerCase() === "archived_rejected")
        return false;
      
      const currentNorm = normalizeMachine(p.currentStation || "");
      const originNorm = normalizeMachine(p.originMachine || "");
      const machineNorm = normalizeMachine(p.machine || "");
      const stepNorm = normalizeMachine(p.currentStep || "");

      const isRelatedToStation = currentNorm === stationNorm || originNorm === stationNorm || machineNorm === stationNorm || stepNorm === stationNorm;
      
      if (!isRelatedToStation) return false;

      const stepUpper = String(p.currentStep || "").toUpperCase();
      
      // 1. Echt gewikkeld wordt (actief)
      const isActivelyWinding = stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA";
      
      if (isActivelyWinding && p.status !== "completed") {
        return true;
      }

      // 2. Voor die dag gewikkeld is (gereed)
      const hasLeftWinding = stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA";
      if (hasLeftWinding || p.status === "completed") {
        const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.updatedAt || p.createdAt;
        const d = typeof eventDate?.toDate === "function" ? eventDate.toDate() : new Date(eventDate || 0);
        if (Number.isFinite(d?.getTime?.()) && d >= today) {
          return true;
        }
      }

      return false;
    });

    const uniqueMap = new Map();
    filtered.forEach((p: AnyRecord) => uniqueMap.set(p.lotNumber || p.id, p));
    
    return Array.from(uniqueMap.values()).sort((a: AnyRecord, b: AnyRecord) => {
      const aActive = (String(a.currentStep || "").toUpperCase() === "WIKKELEN" || String(a.currentStep || "").toUpperCase() === "HOLD_AREA") && a.status !== "completed";
      const bActive = (String(b.currentStep || "").toUpperCase() === "WIKKELEN" || String(b.currentStep || "").toUpperCase() === "HOLD_AREA") && b.status !== "completed";
      
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const tA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || 0).getTime();
      const tB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || 0).getTime();
      return tB - tA;
    });
  }, [allProducts, allArchivedProducts, stationNorm]);

  const activelyWindingCount = useMemo(() => {
    return activeItems.filter(p => {
      const stepUpper = String(p.currentStep || "").toUpperCase();
      return (stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA") && p.status !== "completed";
    }).length;
  }, [activeItems]);

  const woundTodayCount = activeItems.length - activelyWindingCount;

  // 2. Planning (Wachtrij)
  const groupedPlanning = useMemo(() => {
    const now = new Date();
    const { week: currentWeek, year: currentYear } = getISOWeekInfo(now);

    const relevantOrders = allOrders
      .filter((o: AnyRecord) => {
        return o.normMachine === stationNorm && o.status !== "completed";
      })
      .sort((a: AnyRecord, b: AnyRecord) => {
        const aTime = toDateValue(a.dateObj)?.getTime() || 0;
        const bTime = toDateValue(b.dateObj)?.getTime() || 0;
        return aTime - bTime;
      });

    const groups = relevantOrders.reduce((acc: Record<string, AnyRecord[]>, order: AnyRecord) => {
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

      const weekKey = String(week);
      if (!acc[weekKey]) acc[weekKey] = [];
      
      // Voeg flags toe voor weergave (isOverdue, isMoved)
      // We nemen aan dat 'isMoved' of 'priority' in de order data zit als deze verplaatst is
      acc[weekKey].push({ 
        ...order, 
        isOverdue: isPast,
        isPriority: order.isMoved || order.priority === true || order.priority === "high" 
      });
      return acc;
    }, {});

    // Sorteer binnen de weken: Verplaatst/Prio eerst, dan Plan nummer, dan Datum
    Object.keys(groups).forEach((week) => {
      groups[week].sort((a: AnyRecord, b: AnyRecord) => {
        // 1. Verplaatste / Priority orders bovenaan
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        
        // 2. Plan volgorde (indien ingesteld)
        const planA = a.plan || 999;
        const planB = b.plan || 999;
        if (planA !== planB) return planA - planB;
        
        // 3. Datum
        const aTime = toDateValue(a.dateObj)?.getTime() || 0;
        const bTime = toDateValue(b.dateObj)?.getTime() || 0;
        return aTime - bTime;
      });
    });

    const sortedWeeks = Object.keys(groups).sort((a, b) => Number(a) - Number(b));

    return { groups, sortedWeeks, total: relevantOrders.length };
  }, [allOrders, stationNorm]);

  // 3. Historie (Recent gereed)
  const historyItems = useMemo(() => {
    const now = new Date();
    const currentWeekInfo = getISOWeekInfo(now);
    const sourceProducts = [...allProducts, ...allArchivedProducts];

    return sourceProducts
      .filter((p: AnyRecord) => {
        if (p.currentStep === "REJECTED" || String(p.status || "").toLowerCase() === "rejected" || String(p.status || "").toLowerCase() === "archived_rejected")
          return false;

        const currentNorm = normalizeMachine(p.currentStation || "");
        const originNorm = normalizeMachine(p.originMachine || "");
        const machineNorm = normalizeMachine(p.machine || "");
        const lastNorm = normalizeMachine(p.lastStation || "");

        const isRelatedToStation = currentNorm === stationNorm || originNorm === stationNorm || machineNorm === stationNorm || lastNorm === stationNorm;

        if (!isRelatedToStation) {
          return false;
        }

        const stepUpper = String(p.currentStep || "").toUpperCase();
        let isFinishedAtStation = false;

        if (stationNorm.startsWith("BH") || stationNorm.startsWith("BA")) {
          const isActivelyWinding = stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA";
          isFinishedAtStation = (!isActivelyWinding || p.status === "completed");
        } else {
          isFinishedAtStation = p.status === "completed" || stepUpper === "FINISHED" || (currentNorm !== stationNorm && lastNorm === stationNorm);
        }

        if (!isFinishedAtStation) {
          return false;
        }

        let eventDate = p.updatedAt || p.createdAt;
        if (stationNorm.startsWith("BH") || stationNorm.startsWith("BA")) {
            eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.timestamps?.finished || eventDate;
        } else if (stationNorm.includes("LOSSEN")) {
            eventDate = p.timestamps?.nabewerking_start || p.timestamps?.lossen_end || p.timestamps?.finished || eventDate;
        } else if (stationNorm.includes("NABEWERK") || stationNorm === "NABW") {
            eventDate = p.timestamps?.bm01_start || p.timestamps?.nabewerking_end || p.timestamps?.finished || eventDate;
        } else {
            eventDate = p.timestamps?.finished || p.timestamps?.completed || eventDate;
        }

        const updatedAt = typeof eventDate?.toDate === "function" ? eventDate.toDate() : new Date(eventDate || 0);
        if (!Number.isFinite(updatedAt.getTime())) return false;

        p._sortDate = updatedAt; // Attach for sorting

        const itemWeekInfo = getISOWeekInfo(updatedAt);

        if (historyFilter === "week") {
          return (
            itemWeekInfo.year === currentWeekInfo.year &&
            itemWeekInfo.week === currentWeekInfo.week
          );
        }

        if (historyFilter === "2weeks") {
          const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 14;
        }

        if (historyFilter === "month") {
          const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        }

        return true;
      })
      .sort((a: AnyRecord, b: AnyRecord) => b._sortDate.getTime() - a._sortDate.getTime());
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
            onClick={() => setActiveTab("active")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "active"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <Zap size={16} /> {t("digitalplanning.terminal.tab_winding", "Wikkelen")} ({activeItems.length})
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
                   <div className="px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2">
                     <Activity size={12} className="text-green-500" />
                     <span className="text-[10px] font-black text-green-600 uppercase tracking-wide">
                       Actief: {activelyWindingCount}
                     </span>
                   </div>
                   {woundTodayCount > 0 && (
                     <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
                       <CheckCircle2 size={12} className="text-blue-500" />
                       <span className="text-[10px] font-black text-blue-600 uppercase tracking-wide">
                         Gereed (Vandaag): {woundTodayCount}
                       </span>
                     </div>
                   )}
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
                activeItems.map((item) => {
                  const stepUpper = String(item.currentStep || "").toUpperCase();
                  const isActivelyWinding = (stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA") && item.status !== "completed";
                  return (
                    <div
                      key={item.id}
                      className={`bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center border-l-4 animate-in slide-in-from-bottom-2 ${isActivelyWinding ? "border-blue-100 border-l-green-500" : "border-blue-100 border-l-blue-500"}`}
                    >
                      <div>
                        <h4 className="text-lg font-black text-gray-800">
                          {item.lotNumber}
                        </h4>
                        <p className="text-sm font-bold text-gray-500">
                          {item.item}
                        </p>
                        {item.orderId && (
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Order: {item.orderId}</p>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end">
                    {isActivelyWinding ? (
                          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-lg text-xs font-bold uppercase animate-pulse inline-block mb-1">
                            {t("status.active", "Actief")}
                          </span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold uppercase inline-block mb-1">
                        Gereed (Vandaag)
                      </span>
                        )}
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                          {t("personnelOccupancy.labels.operator", "Operator")}: {item.operatorName || item.operatorNumber || item.operator?.split("@")[0] || t("common.unknown", "Onbekend")}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "planning" && (
            <div className="space-y-6">
              {groupedPlanning.sortedWeeks.map((week) => (
                <div key={week} className="animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      Week {week}
                    </span>
                    <div className="h-px bg-slate-200 flex-1"></div>
                  </div>
                  <div className="space-y-2">
                    {groupedPlanning.groups[week].map((order: AnyRecord) => (
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
                {historyItems.map((item: AnyRecord) => (
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
                        {formatDate(item._sortDate || item.updatedAt)}
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
