// @ts-nocheck
import React from "react";
import { useLocation } from "react-router-dom";
import { X, ArrowRightLeft, Trash2, Loader2 } from "lucide-react";

/**
 * Modal om individuele units handmatig te verplaatsen in het proces.
 */
const LotOverrideModal = ({
  isOpen,
  onClose,
  lotData,
  setLotData,
  onSave,
  onDelete,
  loading,
  stations,
  steps,
}) => {
  const location = useLocation();

  if (!isOpen || !lotData || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-8 animate-in fade-in">
      <div className="bg-white w-full max-w-xl rounded-[50px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 text-left">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500 rounded-2xl shadow-lg">
              <ArrowRightLeft size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black italic uppercase leading-none">
                Product Override
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Lot: {lotData.lotNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-all"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-10 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                HANDMATIGE LOCATIE
              </label>
              <select
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                value={lotData.currentStation}
                onChange={(e) =>
                  setLotData({ ...lotData, currentStation: e.target.value })
                }
              >
                {stations.map((stationItem) => (
                  <option key={stationItem.id} value={stationItem.id}>
                    {stationItem.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                PROCES STAP
              </label>
              <select
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                value={lotData.currentStep}
                onChange={(e) =>
                  setLotData({ ...lotData, currentStep: e.target.value })
                }
              >
                {steps.map((stepItem) => (
                  <option key={stepItem} value={stepItem}>
                    {stepItem}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-100 flex flex-col gap-3">
            <button
              onClick={onSave}
              disabled={loading}
              className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}{" "}
              Verplaatsing Bevestigen
            </button>
            <button
              onClick={() => onDelete(lotData.lotNumber)}
              className="w-full py-4 text-xs font-black text-red-500 hover:bg-red-50 rounded-2xl transition-all uppercase flex items-center justify-center gap-2 italic"
            >
              <Trash2 size={16} /> Lot Verwijderen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LotOverrideModal;