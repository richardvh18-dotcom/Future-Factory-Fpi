import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import {
  normalizeMachine,
  formatDate,
  getISOWeekInfo,
} from "../../../utils/hubHelpers";
import StatusBadge from "../common/StatusBadge";

const StationDetailModal = ({ stationId, allOrders, allProducts, onClose }) => {
  const [activeTab, setActiveTab] = useState("active");
  const [historyFilter, setHistoryFilter] = useState("week");
  const stationNorm = normalizeMachine(stationId);

  // Failsafe: als stationNorm een BA-station is en de parent scope is 'fittings', render niets
  const urlParams = new URLSearchParams(window.location.search);
  const scope = urlParams.get('scope') || '';
  if (scope.toLowerCase() === 'fittings' && stationNorm.startsWith('ba')) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] items-center justify-center p-10">
          <AlertCircle size={48} className="text-rose-400 mb-4" />
          <h2 className="text-xl font-black text-rose-600 mb-2">Niet toegestaan</h2>
          <p className="text-slate-500 text-sm mb-6">Dit station hoort niet bij de afdeling Fittings.</p>
          <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest">Sluiten</button>
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

    return allProducts
      .filter((p) => {
        const pMachine = String(p.originMachine || p.currentStation || "");

        if (
          normalizeMachine(pMachine) !== stationNorm ||
          p.currentStep !== "Finished"
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
        (a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
      );
  }, [allProducts, stationNorm, historyFilter]);

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
                  ? "Productie Actief"
                  : "Station Standby"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-500" />
          </button>
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
            <Zap size={16} /> Nu Actief ({activeItems.length})
          </button>
          <button
            onClick={() => setActiveTab("planning")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "planning"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <CalendarIcon size={16} /> Planning ({groupedPlanning.total})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <History size={16} /> Historie
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
                         Wacht op Lossen: {waitingForUnloadCount}
                       </span>
                     </div>
                   )}
                   <div className="px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2">
                     <Activity size={12} className="text-green-500" />
                     <span className="text-[10px] font-black text-green-600 uppercase tracking-wide">
                       In Productie: {activeItems.length - waitingForUnloadCount}
                     </span>
                   </div>
                </div>
              )}

              {activeItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Zap size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase">
                    Geen actieve productie op dit moment.
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
                        Draaiend
                      </span>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">
                        Operator: {item.operator?.split("@")[0] || "Unknown"}
                      </p>
                    </div>
                  </div>
                ))
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
                                  <AlertCircle size={10} /> Uit vorige week
                                </span>
                              )}
                              {order.isPriority && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 uppercase mt-0.5">
                                  <ArrowUpCircle size={10} /> Prioriteit / Verplaatst
                                </span>
                              )}
                              {order.rejectedCount > 0 && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-rose-600 uppercase mt-0.5">
                                  <RotateCcw size={10} /> Herstel ({order.rejectedCount})
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
                              {order.liveFinish} gereed
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
                    Geen orders gepland
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
                    {f === "all" ? "Alles" : f}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest pl-1">
                {historyItems.length} items gereed
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
