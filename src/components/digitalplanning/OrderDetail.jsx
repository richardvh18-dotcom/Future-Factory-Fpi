import React, { useState, useMemo } from "react";
import {
  X,
  Box,
  Play,
  ArrowRight,
  Loader2,
  Clock,
  Activity,
  CheckCircle2,
  Monitor,
  Ruler,
  Tag,
  Calendar,
  FileText,
  Trash2,
  User,
} from "lucide-react";

/**
 * OrderDetail V2.3
 * - UPDATE: Ordernummer (orderId) toegevoegd naast Lotnummer in het Station Overzicht.
 * - FIX: Toont het 'Live Station Overzicht' betrouwbaar voor elk type station.
 * - BEHOUD: Admin acties (verwijderen lot) en Infor-LN koppelingen.
 */
const OrderDetail = ({
  order,
  onClose,
  isManager,
  onEditOrder,
  products = [],
  catalogProducts = [],
  onOpenCatalog,
  currentStation,
  onStartProduction,
  onNextStep,
  onDeleteLot,
  loading,
  showAllStations = false,
}) => {
  const orderProducts = useMemo(() => {
    if (!order) return [];
    return products.filter((p) => p.orderId === order.orderId);
  }, [products, order]);

  // --- LIVE STATION OVERVIEW LOGICA ---
  const stationLiveProducts = useMemo(() => {
    if (order || !currentStation || currentStation.id === "TEAMLEAD") return [];
    return products
      .filter(
        (p) =>
          p.currentStation === currentStation.id &&
          p.status === "Active" &&
          p.currentStep !== "Finished"
      )
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
  }, [products, order, currentStation]);

  const formatExcelDate = (val) => {
    if (!val) return "-";
    if (!isNaN(val) && parseFloat(val) > 30000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toLocaleDateString("nl-NL");
    }
    return String(val);
  };

  const formatTime = (val) => {
    if (!val) return "-";
    const date = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStepStyles = (step) => {
    switch (step) {
      case "Wikkelen":
        return "bg-emerald-500 text-white border-emerald-400";
      case "Lossen":
        return "bg-blue-500 text-white border-blue-400";
      case "Mazak":
        return "bg-orange-500 text-white border-orange-400";
      case "Nabewerken":
        return "bg-amber-500 text-white border-amber-400";
      case "Eindinspectie":
        return "bg-indigo-500 text-white border-indigo-400";
      default:
        return "bg-slate-400 text-white border-slate-300";
    }
  };

  // --- RENDER LIVE STATION VIEW (Rechter menu wanneer geen order geselecteerd is) ---
  if (!order && currentStation) {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-500 text-left">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4 text-left">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
              <Activity size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic text-left">
                In Behandeling{" "}
                <span className="text-blue-600">{currentStation.id}</span>
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic text-left">
                Live wachtrij • Sortering: Oudste bovenaan
              </p>
            </div>
          </div>
          <div className="bg-white px-6 py-2 rounded-2xl border-2 shadow-sm text-center">
            <span className="text-[10px] font-black text-slate-400 uppercase block mb-0.5">
              Aantal
            </span>
            <span className="text-2xl font-black text-slate-800">
              {stationLiveProducts.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
          {stationLiveProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-200 py-20 opacity-40 text-center">
              <Box size={100} strokeWidth={1} />
              <p className="text-sm font-black uppercase tracking-widest mt-4">
                Station is leeg
              </p>
              <p className="text-[10px] font-bold">
                Selecteer een order links om werk te starten.
              </p>
            </div>
          ) : (
            stationLiveProducts.map((p, idx) => (
              <div
                key={p.lotNumber}
                className="bg-white border-2 border-slate-100 p-6 rounded-[32px] flex items-center justify-between shadow-sm group text-left"
              >
                <div className="flex items-center gap-6 text-left">
                  <div className="text-center bg-slate-50 px-4 py-2 rounded-2xl border text-left shrink-0">
                    <span className="text-[10px] font-black text-slate-400 block mb-0.5">
                      POS
                    </span>
                    <span className="text-lg font-black text-slate-800">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono font-black text-blue-600 uppercase tracking-tighter">
                        {p.lotNumber}
                      </span>
                      {/* ORDERNUMMER TOEVOEGING */}
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black rounded border border-slate-200 uppercase">
                        Order: {p.orderId}
                      </span>
                      {p.referenceCode && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded uppercase border border-amber-200">
                          {p.referenceCode}
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-black text-slate-900 leading-tight italic uppercase">
                      {p.item}
                    </h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-1">
                      <FileText size={10} /> Tekening: {p.drawing || "N.v.t."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isManager && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLot?.(p.lotNumber, p.orderId);
                      }}
                      className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Lot verwijderen"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => onNextStep?.(p)}
                    className="flex items-center gap-6 hover:scale-105 transition-transform"
                  >
                    <div
                      className={`px-5 py-2.5 rounded-xl border-b-4 font-black text-[10px] uppercase tracking-widest shadow-lg ${getStepStyles(
                        p.currentStep
                      )}`}
                    >
                      {p.currentStep}{" "}
                      <ArrowRight size={12} className="inline ml-2" />
                    </div>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // --- RENDER ORDER DETAIL (Wanneer een specifieke order is geselecteerd) ---
  if (!order)
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-10 text-slate-400 text-center">
        <Monitor size={120} />
        <p className="text-xl font-black uppercase tracking-widest mt-6 text-center">
          Selecteer een order uit de planning
        </p>
      </div>
    );

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300 text-left relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all z-10"
      >
        <X size={24} />
      </button>

      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 shrink-0 text-left">
        <div className="text-left text-left">
          <div className="flex items-center gap-3 mb-2 text-left">
            <span className="bg-slate-900 text-white px-3 py-1 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest text-left">
              {order.orderId}
            </span>
            <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-black text-[10px] uppercase flex items-center gap-2 border border-blue-100 shadow-sm">
              <Calendar size={12} /> {formatExcelDate(order.date)}
            </div>
            {order.referenceCode && (
              <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg font-black text-[10px] uppercase flex items-center gap-2 border border-amber-200 shadow-sm">
                <Tag size={12} /> {order.referenceCode}
              </div>
            )}
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase leading-tight text-left">
            {order.item}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-2 tracking-widest text-left">
            <FileText size={12} /> Tekening: {order.drawing || "N.v.t."}
          </p>
        </div>

        <div className="flex items-center gap-3 text-left">
          <div className="flex bg-white p-2 rounded-2xl border shadow-sm shrink-0 text-left">
            <div className="px-4 text-center border-r text-left">
              <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest text-left">
                Plan (O)
              </span>
              <span className="text-xl font-black text-slate-800 text-left">
                {order.plan || 0}
              </span>
            </div>
            <div className="px-4 text-center border-r text-left">
              <span className="block text-[8px] font-black text-orange-500 uppercase tracking-widest text-left">
                To Do (P)
              </span>
              <span className="text-xl font-black text-orange-600 text-left">
                {order.toDoValue || 0}
              </span>
            </div>
            <div className="px-4 text-center text-left">
              <span className="block text-[8px] font-black text-emerald-500 uppercase tracking-widest text-left">
                Fin (Q)
              </span>
              <span className="text-xl font-black text-emerald-600 text-left">
                {order.finishValue || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {currentStation?.type === "machine" && (
        <div className="p-6 bg-blue-50 border-b border-blue-100 flex flex-col gap-4 animate-in slide-in-from-top duration-500 text-left">
          <div className="flex items-center justify-between text-left">
            <div className="text-left">
              <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 italic text-left">
                Productie Beheer
              </h4>
              <p className="text-xs font-bold text-slate-500 text-left">
                Maak een nieuw lotnummer aan voor deze order op{" "}
                {currentStation.id}.
              </p>
            </div>
            <button
              onClick={() => onStartProduction(order)}
              disabled={loading}
              className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl flex items-center gap-3 transition-all active:scale-95 text-left"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Play size={18} fill="currentColor" /> Start Proces
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar text-left text-left text-left">
        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 italic text-left text-left">
          <Box size={14} /> Actieve Units (
          {
            orderProducts.filter((p) => showAllStations || p.currentStation === currentStation?.id)
              .length
          }
          )
        </h4>
        <div className="space-y-3 text-left">
          {orderProducts
            .filter((p) => showAllStations || p.currentStation === currentStation?.id)
            .map((p) => (
              <div
                key={p.lotNumber}
                className="bg-white border-2 border-slate-100 p-5 rounded-[28px] flex flex-col gap-4 shadow-sm hover:border-slate-200 transition-all group text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">
                      Lotnummer
                    </span>
                    <span className="font-mono text-sm font-black text-slate-800 tracking-tighter text-left">
                      {p.lotNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLot?.(p.lotNumber, p.orderId);
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <div
                      className={`px-4 py-2 rounded-xl border-b-2 font-black text-[9px] uppercase tracking-widest ${getStepStyles(
                        p.currentStep
                      )}`}
                    >
                      {p.currentStep}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">
                      Operator
                    </span>
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <User size={12} /> {p.operator || "Onbekend"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">
                      Start Productie
                    </span>
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Clock size={12} /> {formatTime(p.startTime || p.createdAt)}
                    </span>
                  </div>
                </div>

                {p.history && p.history.length > 0 && (
                  <div className="pt-2 border-t border-slate-50">
                    <span className="text-[8px] font-black text-slate-400 uppercase block mb-2">
                      Verloop
                    </span>
                    <div className="space-y-1">
                      {p.history
                        .slice()
                        .reverse()
                        .map((h, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-[9px] text-slate-500 border-b border-slate-50 pb-1 last:border-0"
                          >
                            <span>{h.action || h.details}</span>
                            <span className="font-mono">
                              {formatTime(h.timestamp)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
