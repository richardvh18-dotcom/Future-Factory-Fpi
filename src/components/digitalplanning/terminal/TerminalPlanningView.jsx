import React from "react";
import { Search, ChevronLeft, ChevronRight, Layers, FileText, Sparkles, ArrowLeft, PlayCircle, AlertCircle, ArrowUpCircle, FileImage, X, RefreshCw, Copy, Factory } from "lucide-react";
import { findDrawingForProduct } from "../../../utils/findDrawingForProduct";
import { manualSyncDrawings } from "../../../utils/manualSyncDrawings";
import { format, differenceInDays, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import StatusBadge from "../common/StatusBadge";

const TerminalPlanningView = ({
  orders = [],
  selectedOrderId,
  onSelectOrder,
  searchTerm,
  onSearchChange,
  onDateChange,
  showAllWeeks,
  onToggleAllWeeks,
  targetWeekNum,
  productionProgressMap = {},
  readyForReturnMap = {},
  isBM01,
  onStartProduction,
  selectedOrder,
  onViewDrawing,
  optimizationPanel
}) => {
  // Helpers inside component to avoid prop drilling for simple logic
  const parseDateSafe = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput.toDate) return dateInput.toDate();
    const d = new Date(dateInput);
    return isValid(d) ? d : null;
  };

  const getUrgencyColor = (dateInput) => {
    const d = parseDateSafe(dateInput);
    if (!d) return "text-slate-400";
    const daysUntil = differenceInDays(d, new Date());
    if (daysUntil <= 7) return "text-red-600 font-black";
    if (daysUntil <= 14) return "text-blue-600 font-black";
    return "text-slate-600 font-bold";
  };

  const isOrderNew = (order) => {
    if (!order.createdAt) return false;
    const createdAt = order.createdAt.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime();
    return createdAt > Date.now() - 24 * 60 * 60 * 1000;
  };

  const sortedOrders = React.useMemo(() => {
    if (!orders) return [];
    
    // Sorteren
    return [...orders].sort((a, b) => {
      const aPrio = a.isMoved || a.priority === true || ["high", "urgent", "immediate"].includes(a.priority);
      const bPrio = b.isMoved || b.priority === true || ["high", "urgent", "immediate"].includes(b.priority);
      
      if (aPrio && !bPrio) return -1;
      if (!aPrio && bPrio) return 1;
      
      const planA = parseInt(a.plan) || 999;
      const planB = parseInt(b.plan) || 999;
      if (planA !== planB) return planA - planB;
      
      return 0;
    });
  }, [orders]);

  const [drawingLoading, setDrawingLoading] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState(0);
  const [missingItems, setMissingItems] = React.useState([]);
  const [showMissingModal, setShowMissingModal] = React.useState(false);

  const handleManualSync = async () => {
    if (isSyncing || !confirm("Wil je handmatig zoeken naar tekeningen voor alle items in de planning?")) return;
    setIsSyncing(true);
    try {
      const results = await manualSyncDrawings((current, total) => {
        setSyncProgress(Math.round((current / total) * 100));
      });
      const foundCount = results.filter(r => r.found).length;
      const missing = results.filter(r => !r.found);
      
      if (missing.length > 0) {
        setMissingItems(missing);
        setShowMissingModal(true);
      }
      alert(`Sync voltooid!\n${foundCount} gevonden, ${missing.length} niet gevonden.`);
    } catch (error) {
      console.error("Sync error:", error);
      alert("Er ging iets mis tijdens de sync.");
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  return (
    <>
      {/* Sidebar Planning */}
      <div className={`w-full lg:w-5/12 p-4 md:p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedOrderId ? "hidden lg:flex" : "flex"} text-left`}>
        <div className="relative mb-4 text-left">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input
            type="text" placeholder="Zoek order..."
            className="w-full pl-12 pr-10 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] text-sm font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
            value={searchTerm} onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Handmatige Sync Knop */}
        <div className="flex justify-end mb-4 px-2">
            <button 
                onClick={handleManualSync} 
                disabled={isSyncing}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50"
            >
                <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? `Syncen... ${syncProgress}%` : "Sync Tekeningen"}
            </button>
        </div>
        
        {/* Week Selector + Alles Knop */}
        {!isBM01 && (
        <div className="flex items-center gap-2 mb-6 shrink-0 text-left">
          <div className="flex-1 flex justify-between items-center bg-slate-100 p-2 rounded-[25px] border border-slate-200">
            <button onClick={() => onDateChange('prev')} className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 active:scale-90"><ChevronLeft size={20} /></button>
            <div className="text-center px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase block mb-0.5">Week</span>
              <span className="text-xl font-black text-slate-900 italic tracking-tighter">{showAllWeeks ? "Overzicht" : targetWeekNum}</span>
            </div>
            <button onClick={() => onDateChange('next')} className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 active:scale-90"><ChevronRight size={20} /></button>
          </div>
          
          <button
            onClick={onToggleAllWeeks}
            className={`p-4 rounded-2xl border transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${
              showAllWeeks ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
            }`}
          >
            <Layers size={20} /> <span className="hidden sm:inline">Alles</span>
          </button>
        </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 text-left text-left">
          {sortedOrders.length === 0 ? (
            <div className="p-12 text-center opacity-30 italic font-bold uppercase text-xs">Geen orders voor week {targetWeekNum}</div>
          ) : (
            sortedOrders.map((order) => {
              const produced = productionProgressMap[String(order.orderId || "").trim()] || 0;
              const total = Number(order.plan) || 1;
              const isNew = isOrderNew(order);
              const dDate = parseDateSafe(order.deliveryDate);
              const readyFromSpools = readyForReturnMap[String(order.orderId || "").trim()] || 0;
              const isDelegated = order.machine !== order.returnStation && order.returnStation;
              
              // Zoek vergelijkbare orders (zelfde itemCode of item) voor mal-optimalisatie
              const similarCount = orders.filter(o => 
                o.id !== order.id && 
                ((order.itemCode && o.itemCode === order.itemCode) || 
                 (!order.itemCode && o.item === order.item))
              ).length;

              const isPriority = order.isMoved || order.priority === true || ["high", "urgent", "immediate"].includes(order.priority);
              const isOverdue = order.weekNumber && targetWeekNum && parseInt(order.weekNumber) < parseInt(targetWeekNum);

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                  className={`p-4 md:p-5 rounded-[25px] border-2 transition-all flex items-center justify-between relative overflow-hidden cursor-pointer ${
                    selectedOrderId === order.id 
                      ? "bg-blue-50 border-blue-500 shadow-sm" 
                      : isPriority 
                        ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200"
                        : "bg-white border-slate-100 hover:border-blue-200"
                  } text-left`}
                >
                  {isNew && <div className="absolute top-0 left-0 px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-tighter rounded-br-lg z-10 text-left">Nieuw</div>}
                  <div className="flex items-center gap-4 text-left overflow-hidden">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setDrawingLoading(true);
                        const drawing = await findDrawingForProduct(order.itemCode || order.item || "");
                        setDrawingLoading(false);
                        if (drawing && onViewDrawing) onViewDrawing(drawing);
                        else alert("Geen tekening gevonden voor dit order.");
                      }}
                      className={`p-3 rounded-2xl shrink-0 ${(order.linkedProductId || order.drawing) ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-400"}`}
                      title="Bekijk tekening/productkaart"
                      disabled={drawingLoading}
                    >
                      <FileImage size={20} />
                    </button>
                    <div className="text-left overflow-hidden">
                      <h4 className="font-black text-sm leading-none flex items-center gap-2 text-left">
                        {order.orderId}
                        {order.extraCode && <span className="text-slate-400 text-xs font-normal">({order.extraCode})</span>}
                        {isNew && <Sparkles size={10} className="text-emerald-500" />}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 truncate uppercase text-left">
                        {order.item}
                        {order.itemCode && <span className="ml-1 opacity-70">({order.itemCode})</span>}
                      </p>
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-rose-500 uppercase mt-1">
                          <AlertCircle size={10} /> Uit vorige week
                        </span>
                      )}
                      {isPriority && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 uppercase mt-1">
                          <ArrowUpCircle size={10} /> Prioriteit / Verplaatst
                        </span>
                      )}
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-wider mt-0.5">{order.machine}</p>
                      {order.activeLot && (
                        <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">
                          Lot: {order.activeLot}
                        </p>
                      )}
                      {isDelegated && (
                        <div className="mt-1">
                            <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 flex items-center gap-1 w-fit">
                                <Factory size={10} /> Bij {order.delegatedTo || "Extern"}
                            </span>
                            {readyFromSpools > 0 && (
                                <span className="text-[9px] font-black text-emerald-600 block mt-0.5">✅ {readyFromSpools} gereed voor start</span>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <StatusBadge status={order.status} />
                    <span className="text-[10px] font-black text-slate-900 block italic leading-none">{produced} / {total} ST</span>
                    <span className={`text-[9px] uppercase tracking-tighter ${getUrgencyColor(order.deliveryDate)} text-right`}>
                      {dDate ? format(dDate, "dd-MM", { locale: nl }) : "--"}
                    </span>
                    {similarCount > 0 && (
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-1 flex items-center gap-1">
                        <Layers size={10} /> +{similarCount} order
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* Detail Weergave Planning */}
      <div className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedOrderId ? "hidden lg:flex" : "flex"} text-left`}>
        {selectedOrder ? (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 text-left">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white shadow-xl relative overflow-hidden text-left">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                  <button onClick={() => onSelectOrder(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
                  <div className="text-left">
                    <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">Actueel Dossier</span>
                    <h2 className="text-3xl font-black italic tracking-tighter leading-none text-left">{selectedOrder.orderId}</h2>
                    {selectedOrder.extraCode && <p className="text-sm font-bold text-white/50 uppercase tracking-widest mt-1">{selectedOrder.extraCode}</p>}
                  </div>
                </div>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Leverdatum</span>
                  <span className="text-sm font-bold">{selectedOrder.deliveryDate ? format(parseDateSafe(selectedOrder.deliveryDate), "dd-MM-yyyy") : "Onbekend"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Aantal</span>
                  <span className="text-sm font-bold">{selectedOrder.plan || 0} stuks</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Nog te doen</span>
                  <span className="text-sm font-bold">{Math.max(0, (Number(selectedOrder.plan) || 0) - (productionProgressMap[String(selectedOrder.orderId || "").trim()] || 0))} stuks</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left">
              <div className="space-y-2 text-left text-left">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">Omschrijving</span>
                <h3 className="text-xl font-black text-slate-800 italic uppercase leading-tight text-left">{selectedOrder.item}</h3>
              </div>
              <button onClick={() => onStartProduction(true)} className="w-full py-6 bg-blue-600 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                <PlayCircle size={28} /> Start Productie
              </button>

              {optimizationPanel}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-20 text-left">
            <FileText size={80} className="mb-6 text-slate-200" />
            <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer een order</h4>
          </div>
        )}
      </div>

      {showMissingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMissingModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full relative max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button className="absolute top-3 right-3 p-2 text-slate-400 hover:text-red-500" onClick={() => setShowMissingModal(false)}><X size={20} /></button>
            
            <h3 className="text-lg font-black text-slate-800 mb-4">Niet gevonden items ({missingItems.length})</h3>
            <p className="text-xs text-slate-500 mb-4">Deze codes komen voor in de planning maar hebben geen match in de productcatalogus.</p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
               {missingItems.map((item, idx) => (
                 <div key={idx} className="text-xs font-mono text-slate-600 py-1 border-b border-slate-100 last:border-0 flex justify-between">
                   <span>{item.code}</span>
                 </div>
               ))}
            </div>
            
            <button 
              onClick={() => {
                const text = missingItems.map(i => i.code).join("\n");
                navigator.clipboard.writeText(text);
                alert("Lijst gekopieerd naar klembord!");
              }}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-blue-500 flex items-center justify-center gap-2"
            >
              <Copy size={16} /> Kopieer Lijst
            </button>
          </div>
        </div>
      )}

    </>
  );
};

export default TerminalPlanningView;