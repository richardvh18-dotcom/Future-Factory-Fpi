import React from "react";
import {
  X,
  FileText,
  Zap,
  CheckCircle2,
  AlertOctagon,
  Box,
  ArrowRight,
} from "lucide-react";
import StatusBadge from "../common/StatusBadge";
import { format } from "date-fns";

/**
 * TraceModal - Toont de gedetailleerde lijst die hoort bij een KPI tegel.
 */

const TraceModal = ({ isOpen, onClose, title, data = [], onRowClick }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[85vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                {title}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Totaal: {data.length} items gevonden
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
          {data.length === 0 ? (
            <div className="py-20 text-center opacity-30">
              <Box size={64} className="mx-auto mb-4" />
              <p className="font-black uppercase tracking-widest text-xs">
                Geen data beschikbaar voor deze selectie
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-slate-400 font-black uppercase tracking-widest">
                    <th className="px-6 py-2">Identificatie</th>
                    <th className="px-6 py-2">Product Info</th>
                    <th className="px-6 py-2">Station</th>
                    <th className="px-6 py-2">Status</th>
                    <th className="px-6 py-2 text-right">Laatste Update</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => (
                    <tr
                      key={idx}
                      className="bg-slate-50/50 hover:bg-blue-100 transition-colors group cursor-pointer"
                      onClick={() => onRowClick && onRowClick(item)}
                    >
                      <td className="px-6 py-4 rounded-l-2xl">
                        <div className="font-black text-slate-900 text-sm">
                          {item.lotNumber || item.orderId}
                        </div>
                        {item.lotNumber && (
                          <div className="text-[9px] font-bold text-slate-400 uppercase">
                            Order: {item.orderId}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-700 truncate max-w-[200px]">
                          {item.item || "Geen omschrijving"}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {item.itemCode || item.productId}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-black text-blue-600 uppercase italic">
                          {item.machine || item.stationLabel || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-6 py-4 text-right rounded-r-2xl">
                        <div className="text-slate-900 font-bold">
                          {item.updatedAt?.toDate
                            ? format(item.updatedAt.toDate(), "dd-MM HH:mm")
                            : "-"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};

export default TraceModal;
