import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { List } from "react-window";
import {
  Search,
  ChevronRight,
  AlertCircle,
  Clock,
  Sparkles,
  Factory,
  Filter,
  Archive,
} from "lucide-react";
import StatusBadge from "./common/StatusBadge";
import { collection, query, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getISOWeek } from "date-fns";

const FixedSizeList = List;

// Lokale AutoSizer implementatie om import problemen te voorkomen
const AutoSizer = ({ children }) => {
  const parentRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!parentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    resizeObserver.observe(parentRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={parentRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      {size.width > 0 && size.height > 0 && children(size)}
    </div>
  );
};

/**
 * PlanningSidebar - Nu met 'NIEUW' indicator voor recent toegevoegde orders.
 */
const PlanningSidebar = ({ orders = [], selectedOrderId, onSelect }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();

  // Haal archief data op wanneer de toggle aan gaat
  useEffect(() => {
    if (showArchived && archivedOrders.length === 0) {
      setLoadingArchive(true);
      const fetchArchive = async () => {
        try {
          const currentYear = new Date().getFullYear();
          const q = query(
            collection(db, "future-factory", "production", "archive", String(currentYear), "items"),
            orderBy("orderId", "desc"),
            limit(200)
          );
          const snap = await getDocs(q);
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // Dedupliceren op orderId om unieke orders te tonen vanuit de items-collectie
          const uniqueMap = new Map();
          data.forEach(item => {
            if (item.orderId && !uniqueMap.has(item.orderId)) {
              uniqueMap.set(item.orderId, {
                ...item,
                id: item.orderId,
                machine: item.machine || item.originMachine || "Onbekend",
                status: 'completed'
              });
            }
          });
          setArchivedOrders(Array.from(uniqueMap.values()));
        } catch (err) {
          console.error("Fout bij laden archief:", err);
        } finally {
          setLoadingArchive(false);
        }
      };
      fetchArchive();
    }
  }, [showArchived]);

  // Bepaal de bron data: Actieve orders (prop) of Archief (state)
  const sourceData = showArchived ? archivedOrders : orders;

  // Unieke machines ophalen voor filter
  const machines = useMemo(() => {
    const m = new Set(sourceData.map(o => o.machine).filter(Boolean));
    return ["ALL", ...Array.from(m).sort()];
  }, [sourceData]);

  const filteredOrders = useMemo(() => {
    let result = sourceData;

    // 1. Machine Filter
    if (selectedMachine !== "ALL") {
      result = result.filter(o => o.machine === selectedMachine);
    }

    // 2. Status Filter (Alleen voor actieve lijst: verberg completed)
    if (!showArchived) {
      result = result.filter(o => o.status !== 'completed' && o.status !== 'shipped' && o.status !== 'cancelled');
    }

    // 3. Zoeken
    const term = (searchTerm || "").toLowerCase().trim();
    if (term) {
      result = result.filter((order) => {
      const orderId = (order?.orderId || "").toLowerCase();
      const itemCode = (
        order?.itemCode ||
        order?.productId ||
        ""
      ).toLowerCase();
      const itemDesc = (order?.item || "").toLowerCase();
      const project = (order?.project || "").toLowerCase();

      return (
        orderId.includes(term) ||
        itemCode.includes(term) ||
        itemDesc.includes(term) ||
        project.includes(term)
      );
    });
    }

    // 4. Sorteren: Huidige/Toekomstige weken eerst, daarna Backlog (Oude weken)
    return result.sort((a, b) => {
      const weekA = Number(a.weekNumber || a.week || 999);
      const yearA = Number(a.weekYear || a.year || currentYear);
      const weekB = Number(b.weekNumber || b.week || 999);
      const yearB = Number(b.weekYear || b.year || currentYear);
      
      // Absolute weekwaarde voor vergelijking
      const absWeekA = yearA * 52 + weekA;
      const absWeekB = yearB * 52 + weekB;
      const absCurrent = currentYear * 52 + currentWeek;
      
      const isBacklogA = absWeekA < absCurrent;
      const isBacklogB = absWeekB < absCurrent;
      
      // Backlog moet ONDERAAN ("daaronder moet een splitsing komen")
      if (isBacklogA && !isBacklogB) return 1;
      if (!isBacklogA && isBacklogB) return -1;
      
      // Binnen de groepen: Sorteer op week (Oplopend: Week 10, 11, 12...)
      if (absWeekA !== absWeekB) return absWeekA - absWeekB;
      
      // Fallback: Order ID
      return (a.orderId || "").localeCompare(b.orderId || "");
    });
  }, [sourceData, searchTerm, selectedMachine, showArchived, currentWeek, currentYear]);

  // Helper om te bepalen of een order nieuw is (< 24 uur)
  const isOrderNew = (order) => {
    if (!order.createdAt) return false;
    const createdAt = order.createdAt.toMillis
      ? order.createdAt.toMillis()
      : new Date(order.createdAt).getTime();
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return createdAt > twentyFourHoursAgo;
  };

  const Row = ({ index, style }) => {
    const order = filteredOrders[index];
    const isSelected =
      selectedOrderId === order.id || selectedOrderId === order.orderId;
    const isNew = isOrderNew(order);
    const isDelegated = !!order.delegatedTo;
    const isDelegatedStatus = order.status === 'delegated' || order.status === 'DELEGATED';
    const isCancelled = order.status === 'cancelled';

    return (
      <div style={style} className="px-2 py-1">
        <button
          key={order.id}
          onClick={() => onSelect(order.id)}
          className={`w-full h-full p-4 rounded-2xl border-2 text-left transition-all duration-200 group relative overflow-hidden
            ${
              isSelected
                ? "bg-blue-50 border-blue-500 shadow-md shadow-blue-100"
                : isCancelled
                  ? "bg-slate-50 border-slate-100 opacity-60 grayscale"
                  : "bg-white border-slate-50 hover:border-slate-200 hover:bg-slate-50"
            }
          `}
        >
          {order.isUrgent && (
            <div className="absolute top-0 right-0 w-1.5 h-full bg-red-500 animate-pulse" />
          )}

          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-black text-sm tracking-tighter truncate ${
                    isSelected ? "text-blue-700" : "text-slate-900"
                  }`}
                >
                  {order.orderId || t("digitalplanning.sidebar.no_id")}
                </span>
                {isDelegated && (
                  <Factory size={12} className="text-purple-500" title={`Gedelegeerd aan ${order.delegatedTo}`} />
                )}
              </div>
              {order.project && (
                <span className="text-[9px] font-bold uppercase tracking-tighter text-slate-400 truncate max-w-[120px]">
                  {order.project}
                </span>
              )}
            </div>
            {isDelegatedStatus ? (
              <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 shadow-sm">
                Delegated
              </span>
            ) : (
              <StatusBadge status={order.status} />
            )}
          </div>

          <p className="text-[10px] font-bold text-slate-400 truncate mb-3">
            {order.itemCode || order.productId || t("digitalplanning.sidebar.no_itemcode")}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
            <div className="flex items-center gap-2">
              <Clock size={10} className="text-slate-300" />
              <span className="text-[9px] font-black text-slate-400 uppercase">
                {t("digitalplanning.sidebar.week")}{order.weekNumber || order.week || "--"}
              </span>
              {isNew && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase tracking-wider">
                  <Sparkles size={8} />
                  Nieuw
                </span>
              )}
            </div>
            <ChevronRight
              size={14}
              className={`transition-transform duration-300 ${
                isSelected
                  ? "text-blue-500 translate-x-1"
                  : "text-slate-200 group-hover:text-slate-400"
              }`}
            />
          </div>
        </button>
      </div>
    );
  };

  // FALLBACK: Als react-window niet geladen kan worden, toon een standaard lijst.
  // Dit voorkomt de "Element type is invalid" crash.
  if (!FixedSizeList) {
    return (
      <div className="flex flex-col h-full bg-white border-r border-slate-200 animate-in fade-in duration-300">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t("digitalplanning.sidebar.search_placeholder")}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500"
              >
                {machines.map(m => <option key={m} value={m}>{m === "ALL" ? "Alle Machines" : m}</option>)}
              </select>
            </div>
            <button 
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-all ${showArchived ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400'}`}
              title="Toon gearchiveerde orders"
            >
              <Archive size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
          {filteredOrders.map((order, index) => (
             <div key={order.id} style={{ height: 140, width: "100%" }}>
                <Row index={index} style={{ height: "100%", width: "100%" }} />
             </div>
          ))}
          {filteredOrders.length === 0 && loadingArchive && showArchived && (
             <div className="p-8 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
               Archief laden...
             </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 animate-in fade-in duration-300">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
        <div className="relative group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
            size={16}
          />
          <input
            type="text"
            placeholder={t("digitalplanning.sidebar.search_placeholder")}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select 
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="w-full pl-9 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold uppercase outline-none focus:border-blue-500 cursor-pointer"
              >
                {machines.map(m => <option key={m} value={m}>{m === "ALL" ? "Alle Machines" : m}</option>)}
              </select>
            </div>
            <button 
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-all ${showArchived ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
              title="Toon gearchiveerde (voltooide) orders"
            >
              <Archive size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-1">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center opacity-40">
            {loadingArchive && showArchived ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archief laden...</p>
            ) : (
              <>
                <AlertCircle size={32} className="mb-2 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {t("digitalplanning.sidebar.no_results")}
                </p>
              </>
            )}
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                className="custom-scrollbar"
                rowCount={filteredOrders.length}
                rowHeight={140}
                rowComponent={Row}
                rowProps={{}}
                style={{ height, width }}
              />
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
};

export default PlanningSidebar;
