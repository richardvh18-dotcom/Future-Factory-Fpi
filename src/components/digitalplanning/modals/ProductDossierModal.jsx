import React from "react";
import {
  X,
  Info,
  Clock,
  CheckCircle2,
  Ruler,
  ShieldCheck,
  Box,
  History,
  Activity,
  User,
  Folder,
  FileText,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import StatusBadge from "../common/StatusBadge";

/**
 * ProductDossierModal: Toont proces-stappen, kwaliteitsmetingen en order-info.
 */
const ProductDossierModal = ({ isOpen, product, onClose, orders = [] }) => {
  if (!isOpen || !product) return null;

  const parentOrder = orders.find((o) => o.orderId === product.orderId) || {};

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[250] flex items-center justify-center p-4 lg:p-10 animate-in fade-in">
      <div className="bg-white w-full max-w-5xl rounded-[50px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] text-left">
        {/* Header */}
        <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-blue-500 rounded-3xl shadow-lg">
              <Box size={32} />
            </div>
            <div>
              <h3 className="text-3xl font-black italic uppercase tracking-tight text-left">
                Product <span className="text-blue-400">Dossier</span>
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 text-left">
                Lotnummer: {product.lotNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all"
          >
            <X size={28} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
          {/* Order Context */}
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 bg-blue-50/50 p-8 rounded-[40px] border border-blue-100">
            <div className="lg:col-span-4 flex items-center gap-2 mb-2">
              <FileText size={18} className="text-blue-600" />
              <h4 className="font-black text-xs uppercase text-blue-900 tracking-widest">
                Order Informatie (Excel Context)
              </h4>
            </div>
            <div>
              <span className="text-[9px] font-black text-blue-400 uppercase">
                Klant
              </span>
              <p className="text-sm font-bold text-slate-800">
                {parentOrder.customer || "-"}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-black text-blue-400 uppercase">
                Project
              </span>
              <p className="text-sm font-bold text-slate-800">
                {parentOrder.project || "-"}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-black text-blue-400 uppercase">
                Tekening
              </span>
              <p className="text-sm font-bold text-slate-800">
                {parentOrder.drawing || "-"}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-black text-blue-400 uppercase">
                Deadline
              </span>
              <p className="text-sm font-bold text-slate-800">
                {parentOrder.date || "-"}
              </p>
            </div>
          </section>

          {/* Actual Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                Huidige Fase
              </span>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <Activity size={20} />
                </div>
                <span className="text-lg font-black text-slate-800 uppercase italic">
                  {product.currentStep}
                </span>
              </div>
            </div>
            <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">
                Kwaliteit Status
              </span>
              <StatusBadge
                label={product.inspection?.status || "Niet gecontroleerd"}
              />
            </div>
          </div>

          {/* Extra Info: Opmerkingen, Metingen & Inspectie */}
          {(product.note || product.measurements || (product.inspection && product.inspection.reasons)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {/* Opmerkingen */}
               {product.note && (
                 <div className="p-6 bg-amber-50 rounded-[32px] border border-amber-100">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <Info size={14} /> Opmerking
                    </span>
                    <p className="text-sm font-medium text-slate-700 italic">"{product.note}"</p>
                 </div>
               )}

               {/* Inspectie Redenen (bij afkeur/herstel) */}
               {product.inspection?.reasons && product.inspection.reasons.length > 0 && (
                 <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100">
                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} /> Inspectie Bevindingen
                    </span>
                    <ul className="list-disc list-inside text-sm font-bold text-rose-700">
                      {product.inspection.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                 </div>
               )}

               {/* Metingen */}
               {product.measurements && (
                 <div className="p-6 bg-indigo-50 rounded-[32px] border border-indigo-100">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                      <Ruler size={14} /> Metingen
                    </span>
                    <div className="space-y-1">
                      {Object.entries(product.measurements).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-xs border-b border-indigo-100/50 pb-1 last:border-0">
                          <span className="font-bold text-slate-600 uppercase">{key}:</span>
                          <span className="font-mono font-black text-slate-800">{val}</span>
                        </div>
                      ))}
                    </div>
                 </div>
               )}
            </div>
          )}

          {/* History */}
          <div>
            <h4 className="flex items-center gap-3 font-black text-sm uppercase text-slate-800 mb-6 pb-4 border-b">
              <History className="text-blue-500" /> Volledige Proces Historie
            </h4>
            <div className="space-y-3">
              {product.history?.map((entry, idx) => (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <div className="bg-slate-50 flex-1 p-5 rounded-2xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black text-slate-700 uppercase">
                        {entry.station}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">
                        {entry.user || "Systeem"}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {new Date(entry.time).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-left">
            <ShieldCheck size={24} className="text-blue-500" />
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight">
              Digitaal dossier conform KMS FPI-GRE
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDossierModal;
