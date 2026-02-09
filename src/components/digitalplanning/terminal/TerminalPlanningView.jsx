import React from "react";
import { Search, ChevronLeft, ChevronRight, Layers, FileText, Sparkles, ArrowLeft, PlayCircle } from "lucide-react";
import { format, differenceInDays, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import StatusBadge from "../common/StatusBadge";

const TerminalPlanningView = ({
  orders,
  selectedOrderId,
  onSelectOrder,
  searchTerm,
  onSearchChange,
  onDateChange,
  showAllWeeks,
  onToggleAllWeeks,
  targetWeekNum,
  productionProgressMap,
  isBM01,
  onStartProduction,
  selectedOrder
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
          {orders.length === 0 ? (
            <div className="p-12 text-center opacity-30 italic font-bold uppercase text-xs">Geen orders voor week {targetWeekNum}</div>
          ) : (
            orders.map((order) => {
              const produced = productionProgressMap[order.orderId] || 0;
              const total = Number(order.plan) || 1;
              const isNew = isOrderNew(order);
              const dDate = parseDateSafe(order.deliveryDate);

              return (
                <div
                  key={order.id} onClick={() => onSelectOrder(order.id)}
                  className={`p-4 md:p-5 rounded-[25px] border-2 transition-all cursor-pointer flex items-center justify-between relative overflow-hidden ${
                    selectedOrderId === order.id ? "bg-blue-50 border-blue-500 shadow-sm" : "bg-white border-slate-100 hover:border-blue-200"
                  } text-left`}
                >
                  {isNew && <div className="absolute top-0 left-0 px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-tighter rounded-br-lg z-10 text-left">Nieuw</div>}
                  <div className="flex items-center gap-4 text-left overflow-hidden">
                    <div className={`p-3 rounded-2xl shrink-0 ${selectedOrderId === order.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400"}`}>
                      <FileText size={20} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <h4 className="font-black text-sm leading-none flex items-center gap-2 text-left">{order.orderId} {isNew && <Sparkles size={10} className="text-emerald-500" />}</h4>
                      <p className="text-[10px] font-bold text-slate-400 truncate uppercase text-left">{order.item}</p>
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-wider mt-0.5">{order.machine}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-[10px] font-black text-slate-900 block italic leading-none">{produced} / {total} ST</span>
                    <span className={`text-[9px] uppercase tracking-tighter ${getUrgencyColor(order.deliveryDate)} text-right`}>
                      {dDate ? format(dDate, "dd-MM", { locale: nl }) : "--"}
                    </span>
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
            <div className="bg-slate-900 rounded-[35px] p-6 text-white shadow-xl flex justify-between items-center relative overflow-hidden text-left">
              <button onClick={() => onSelectOrder(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
              <div className="text-left flex-1">
                <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">Actueel Dossier</span>
                <h2 className="text-3xl font-black italic tracking-tighter leading-none text-left">{selectedOrder.orderId}</h2>
              </div>
              <StatusBadge status={selectedOrder.status} />
            </div>
            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left">
              <div className="space-y-2 text-left text-left">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">Omschrijving</span>
                <h3 className="text-xl font-black text-slate-800 italic uppercase leading-tight text-left">{selectedOrder.item}</h3>
              </div>
              <button onClick={() => onStartProduction(true)} className="w-full py-6 bg-blue-600 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                <PlayCircle size={28} /> Start Productie
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-20 text-left">
            <FileText size={80} className="mb-6 text-slate-200" />
            <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer een order</h4>
          </div>
        )}
      </div>
    </>
  );
};

export default TerminalPlanningView;