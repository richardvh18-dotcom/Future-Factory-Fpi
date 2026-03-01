import React, { useState } from "react";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Printer,
  ClipboardCheck,
  MessageSquare,
  ShieldCheck,
  Zap,
} from "lucide-react";
import ProductionStartModal from "./ProductionStartModal";
import { auth, logActivity } from "../../../config/firebase";

/**
 * InspectionModal V2.0 - Final Quality Assurance
 * Used at the BM01 station for final product release and label printing.
 */
const InspectionModal = ({ isOpen, onClose, order, onInspect }) => {
  const [status, setStatus] = useState("approved");
  const [notes, setNotes] = useState("");
  const [showLabelModal, setShowLabelModal] = useState(false);

  if (!isOpen || !order) return null;

  const handleSubmit = async () => {
    // onInspect handles the database write in the parent component
    try {
      await logActivity(auth.currentUser?.uid, "INSPECTION_COMPLETE", `Inspection completed for order ${order.id}. Status: ${status}`);
    } catch (e) {
      console.error("Log error", e);
    }
    onInspect(order.id, status, notes);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-lg rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.3)] border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
          {/* Header Unit */}
          <div className="bg-slate-900 text-white p-8 flex justify-between items-start relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
              <ShieldCheck size={120} />
            </div>
            <div className="relative z-10 text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <ClipboardCheck size={20} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] italic">
                  Quality Control
                </span>
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                Eindinspectie
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 tracking-widest flex items-center gap-2">
                <Zap size={10} className="text-blue-500" /> Lot:{" "}
                {order.lotNumber || "Onbekend"}
              </p>
            </div>

            <div className="flex gap-3 relative z-10">
              <button
                onClick={() => setShowLabelModal(true)}
                className="p-3 bg-white/10 hover:bg-blue-600 rounded-2xl text-white transition-all shadow-xl active:scale-90 border border-white/10"
                title="Print Labels / Stroken"
              >
                <Printer size={22} />
              </button>
              <button
                onClick={onClose}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 active:scale-90"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-10 space-y-10 text-left">
            {/* Status Selection */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                1. Oordeel Kwaliteit
              </label>
              <div className="grid grid-cols-2 gap-6">
                <button
                  onClick={() => setStatus("approved")}
                  className={`p-6 rounded-[30px] border-2 flex flex-col items-center gap-3 transition-all active:scale-95 shadow-sm ${
                    status === "approved"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-8 ring-emerald-500/5 shadow-emerald-100"
                      : "border-slate-100 bg-slate-50/50 text-slate-300 hover:border-slate-200"
                  }`}
                >
                  <CheckCircle2 size={40} strokeWidth={2.5} />
                  <span className="font-black uppercase text-[10px] tracking-[0.2em] italic">
                    Goedgekeurd
                  </span>
                </button>

                <button
                  onClick={() => setStatus("rejected")}
                  className={`p-6 rounded-[30px] border-2 flex flex-col items-center gap-3 transition-all active:scale-95 shadow-sm ${
                    status === "rejected"
                      ? "border-rose-500 bg-rose-50 text-rose-700 ring-8 ring-rose-500/5 shadow-rose-100"
                      : "border-slate-100 bg-slate-50/50 text-slate-300 hover:border-slate-200"
                  }`}
                >
                  <AlertTriangle size={40} strokeWidth={2.5} />
                  <span className="font-black uppercase text-[10px] tracking-[0.2em] italic">
                    Afgekeurd
                  </span>
                </button>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                <MessageSquare size={12} /> 2. Bevindingen (Optioneel)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-[25px] p-5 text-sm font-medium text-slate-700 focus:border-blue-500 focus:bg-white outline-none min-h-[120px] transition-all shadow-inner placeholder:text-slate-300 italic"
                placeholder="Beschrijf eventuele afwijkingen of bijzonderheden..."
              />
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <button
                onClick={handleSubmit}
                className={`w-full py-6 rounded-[25px] font-black text-sm uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                  status === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20"
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20"
                }`}
              >
                <CheckCircle2 size={20} />
                Inspectie Bevestigen
              </button>
            </div>
          </div>

          {/* Footer Info */}
          <div className="bg-slate-50 p-4 text-center border-t border-slate-100 opacity-40">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">
              Audit Node: BM01_QA_RELEASE
            </p>
          </div>
        </div>
      </div>

      {/* NESTED LABEL MODAL */}
      {showLabelModal && (
        <ProductionStartModal
          isOpen={showLabelModal}
          onClose={() => setShowLabelModal(false)}
          order={order}
          stationId="EINDINSPECTIE"
          onStart={() => setShowLabelModal(false)}
          existingProducts={[]}
        />
      )}
    </>
  );
};

export default InspectionModal;
