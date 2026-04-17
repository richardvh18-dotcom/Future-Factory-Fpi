import React from "react";
import { X, FileText, Image as ImageIcon } from "lucide-react";

const ProductPassportModal = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md p-6 rounded-3xl relative shadow-2xl flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Product Paspoort</h2>
            <p className="text-xs text-slate-500 font-bold">{item.lotNumber || "Geen Lotnummer"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</span>
            <p className="font-bold text-slate-800">{item.item}</p>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order</span>
            <p className="font-mono font-bold text-blue-600">{item.orderId}</p>
          </div>
          
          {item.drawing && (
             <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tekening</span>
                <div className="flex items-center gap-2 mt-1">
                    <ImageIcon size={16} className="text-blue-500" />
                    <p className="font-bold text-slate-800">{item.drawing}</p>
                </div>
             </div>
          )}

          {item.notes && (
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
              <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                <FileText size={12} /> PO Text / Opmerkingen
              </h4>
              <p className="text-sm font-medium text-slate-700 italic">
                {item.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPassportModal;
