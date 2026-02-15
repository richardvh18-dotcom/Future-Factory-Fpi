import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  X,
  Box,
  ChevronRight,
  ChevronDown,
  Search,
  Hash,
  Database,
  Trash2,
  History,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  TrendingUp,
  MapPin,
} from "lucide-react";
import StatusBadge from "../common/StatusBadge";

/**
 * DrillDownModal V2.0 - Industrial Performance Edition
 * Beheert diepe inkijk in lotnummer-data met O(1) lookup en render-limiting.
 */
const DrillDownModal = React.memo(({
  isOpen,
  onClose,
  title,
  items = [],
  ordersMap = {},
  isManager,
  onDeleteLot,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [internalSearch, setInternalSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(40);
  const location = useLocation();

  // --- STAP 1: GEOPTIMALISEERDE FILTERING ---
  const filteredItems = useMemo(() => {
    const q = internalSearch.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        (item.lotNumber || "").toLowerCase().includes(q) ||
        (item.orderId || "").toLowerCase().includes(q) ||
        (item.item || "").toLowerCase().includes(q)
    );
  }, [items, internalSearch]);

  if (!isOpen || location.pathname.includes("/login")) return null;

  // Helper voor Excel datums indien aanwezig
  const formatExcelDate = (val) => {
    if (!val) return "-";
    if (!isNaN(val) && parseFloat(val) > 30000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toLocaleDateString("nl-NL");
    }
    return String(val);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[250] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl rounded-[45px] shadow-[0_40px_100px_rgba(0,0,0,0.3)] border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95">
        {/* Header Unit */}
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
            <TrendingUp size={120} />
          </div>
          <div className="flex items-center gap-6 relative z-10 text-left">
            <div className="p-4 bg-blue-600 rounded-2xl shadow-xl shadow-blue-500/20">
              <Hash size={28} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none">
                {title}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-[0.3em] flex items-center gap-2">
                <Database size={10} /> {filteredItems.length} Records in Cache
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10 active:scale-90"
          >
            <X size={28} />
          </button>
        </div>

        {/* Search Bar Unit */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 shrink-0">
          <div className="relative group max-w-2xl">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
              size={20}
            />
            <input
              className="w-full pl-14 pr-6 py-5 bg-white border-2 border-slate-200 rounded-[25px] font-bold outline-none focus:border-blue-500 transition-all shadow-sm placeholder:text-slate-300"
              placeholder="Zoek op lot, order of omschrijving..."
              value={internalSearch}
              onChange={(e) => {
                setInternalSearch(e.target.value);
                setVisibleLimit(40);
              }}
            />
          </div>
        </div>

        {/* Dynamic List Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-white text-left">
          {filteredItems.length === 0 ? (
            <div className="py-32 text-center opacity-30 flex flex-col items-center gap-4 italic font-black uppercase tracking-widest text-slate-400">
              <AlertCircle size={64} />
              Geen matches gevonden
            </div>
          ) : (
            filteredItems.slice(0, visibleLimit).map((item) => {
              const itemId = item.id || item.lotNumber;
              const isExpanded = expandedId === itemId;
              const linkedOrder = ordersMap[item.orderId] || {};

              return (
                <div
                  key={itemId}
                  className={`bg-white rounded-[35px] border-2 transition-all duration-300 ${
                    isExpanded
                      ? "border-blue-500 ring-8 ring-blue-500/5 shadow-xl"
                      : "border-slate-50 shadow-sm hover:border-slate-200"
                  }`}
                >
                  {/* Collapsed Bar */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : itemId)}
                    className={`p-5 flex items-center justify-between cursor-pointer group rounded-[33px] transition-colors ${
                      isExpanded ? "bg-blue-50/20" : "hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-5">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                          isExpanded
                            ? "bg-blue-600 text-white scale-110"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Box size={24} />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="text-sm font-mono text-blue-600 font-black tracking-tight">
                            {item.lotNumber || item.orderId}
                          </span>
                          {item.currentStep && (
                            <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black rounded-lg border border-blue-100 uppercase italic tracking-widest">
                              {item.currentStep}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-black text-slate-800 uppercase italic line-clamp-1 tracking-tighter leading-none">
                          {item.item || "Omschrijving onbekend"}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block text-right pr-4 border-r border-slate-100">
                        <span className="text-[8px] font-black text-slate-300 uppercase block mb-1 tracking-widest">
                          Status
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      {isManager && item.lotNumber && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("Dit record permanent wissen?"))
                              onDeleteLot?.(item.lotNumber);
                          }}
                          className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                      <div
                        className={`p-2 rounded-xl transition-all ${
                          isExpanded
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-50 text-slate-300 group-hover:text-blue-400"
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDown size={24} />
                        ) : (
                          <ChevronRight size={24} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="px-8 pb-10 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Metadata Card */}
                        <div className="lg:col-span-5 bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden text-left">
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Database size={100} />
                          </div>
                          <span className="text-[10px] font-black text-emerald-400 uppercase block mb-6 italic border-b border-emerald-400/20 pb-3 tracking-[0.2em]">
                            <ShieldCheck size={12} className="inline mr-2" />{" "}
                            Master Metadata
                          </span>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                              <span className="text-[9px] text-slate-500 uppercase font-black">
                                Tekening Ref
                              </span>
                              <span className="text-xs font-mono font-black text-blue-400 uppercase italic tracking-tighter">
                                {item.drawing ||
                                  linkedOrder.drawing ||
                                  "Geen Tekening"}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                <span className="text-[8px] text-slate-500 uppercase block mb-1">
                                  Planning (O)
                                </span>
                                <span className="text-xl font-black italic">
                                  {linkedOrder.plan || item.plan || 0}
                                </span>
                              </div>
                              <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                <span className="text-[8px] text-blue-400 uppercase block mb-1 font-black">
                                  Voltooid (Q)
                                </span>
                                <span className="text-xl font-black italic text-emerald-400">
                                  {linkedOrder.liveFinish || 0}
                                </span>
                              </div>
                            </div>
                            <div className="pt-4 flex items-center gap-3 text-slate-500">
                              <MapPin size={14} className="text-blue-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest">
                                Actueel Station:{" "}
                                <span className="text-white italic">
                                  {item.machine || "Opslag"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Timeline visualization */}
                        <div className="lg:col-span-7 bg-white p-8 rounded-[40px] border border-slate-100 shadow-inner">
                          <span className="text-[10px] font-black text-blue-600 uppercase block mb-8 italic flex items-center gap-2 tracking-[0.2em]">
                            <History size={16} /> Productie Tijdlijn
                          </span>
                          <div className="space-y-6 relative ml-4 text-left">
                            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-50 shadow-inner" />
                            {[
                              {
                                label: "Wikkelen",
                                time: item.startTime,
                                color: "bg-emerald-500",
                                desc: "Start productie",
                              },
                              {
                                label: "Lossen",
                                time: item.lossenTime,
                                color: "bg-blue-500",
                                desc: "Mandrel extractie",
                              },
                              {
                                label: "Afwerking",
                                time: item.nabewerkenTime,
                                color: "bg-orange-500",
                                desc: "Slijpen / Zagen",
                              },
                              {
                                label: "Inspectie",
                                time: item.inspectieTime,
                                color: "bg-purple-600",
                                desc: "QC Vrijgave",
                              },
                            ].map((st, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-6 relative group/step animate-in slide-in-from-left-2"
                                style={{ animationDelay: `${i * 100}ms` }}
                              >
                                <div
                                  className={`
                                    w-4 h-4 rounded-full border-4 z-10 transition-all duration-500 shrink-0
                                    ${
                                      st.time
                                        ? `${st.color} border-white shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-125`
                                        : "bg-white border-slate-100 opacity-30"
                                    }
                                  `}
                                />
                                <div
                                  className={`text-left ${
                                    !st.time && "opacity-30"
                                  }`}
                                >
                                  <p
                                    className={`text-[11px] font-black uppercase tracking-widest italic ${
                                      st.time
                                        ? "text-slate-900"
                                        : "text-slate-300"
                                    }`}
                                  >
                                    {st.label}
                                  </p>
                                  {st.time ? (
                                    <p className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg mt-1 inline-block">
                                      {new Date(st.time).toLocaleString(
                                        "nl-NL",
                                        {
                                          day: "2-digit",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-[9px] font-medium text-slate-300 uppercase tracking-tighter mt-1 italic">
                                      {st.desc}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Load More Trigger */}
          {filteredItems.length > visibleLimit && (
            <button
              onClick={() => setVisibleLimit((prev) => prev + 50)}
              className="w-full py-6 text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 bg-blue-50 rounded-[30px] border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <Loader2 size={16} className="animate-spin" /> Meer resultaten
              inladen (+50)
            </button>
          )}
        </div>

        {/* Footer Audit Detail */}
        <div className="p-6 bg-slate-900 border-t border-white/5 flex items-center justify-between text-white/40 shrink-0">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest italic">
              Forensic Integrity Sync v2.0
            </span>
          </div>
          <span className="text-[8px] font-mono opacity-50 uppercase tracking-widest">
            Future Factory MES Core Protocol
          </span>
        </div>
      </div>
    </div>
  );
});

export default DrillDownModal;
