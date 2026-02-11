import React from 'react';
import { X, MapPin, User, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const ProductJourneyModal = ({ product, onClose }) => {
  if (!product) return null;

  const history = [...(product.history || [])].sort((a, b) => {
    const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
    const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
    return tA - tB;
  });

  const formatTime = (val) => {
    if (!val) return "-";
    const date = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return "-";
    return format(date, "dd MMM HH:mm", { locale: nl });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
              Product <span className="text-blue-600">Route</span>
            </h3>
            <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-black uppercase">
                    {product.lotNumber}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {product.itemCode}
                </span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white rounded-xl transition-all shadow-sm text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
            <div className="relative pl-4 space-y-0">
                {/* Vertical Line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100"></div>

                {history.map((step, idx) => (
                    <div key={idx} className="relative flex gap-6 pb-8 last:pb-0 group">
                        {/* Node */}
                        <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white border-4 border-blue-50 flex items-center justify-center shadow-sm group-hover:border-blue-100 transition-colors">
                            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                        </div>

                        {/* Card */}
                        <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 group-hover:border-blue-200 group-hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-black text-slate-800 uppercase text-xs tracking-tight">
                                    {step.action || "Actie onbekend"}
                                </span>
                                <span className="text-[9px] font-mono font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                                    {formatTime(step.timestamp)}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                    <MapPin size={12} className="text-blue-400" />
                                    {step.station || step.machine || "Station?"}
                                </div>
                                {step.user && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 justify-end">
                                        <User size={12} className="text-slate-400" />
                                        <span className="truncate max-w-[80px]">{step.user.split('@')[0]}</span>
                                    </div>
                                )}
                            </div>
                            {step.details && step.details !== step.action && (
                                <p className="mt-2 text-[10px] text-slate-400 italic border-t border-slate-200/50 pt-2">
                                    "{step.details}"
                                </p>
                            )}
                        </div>
                    </div>
                ))}

                {/* Current Status Node */}
                <div className="relative flex gap-6 pt-8">
                     <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center shadow-sm animate-pulse">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">
                            Huidige Positie
                        </span>
                        <div className="flex items-center justify-between">
                            <span className="font-black text-slate-800 text-sm">
                                {product.currentStation}
                            </span>
                            <span className="px-2 py-1 bg-white rounded-lg text-[9px] font-bold text-emerald-600 border border-emerald-100 uppercase">
                                {product.status}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ProductJourneyModal;
