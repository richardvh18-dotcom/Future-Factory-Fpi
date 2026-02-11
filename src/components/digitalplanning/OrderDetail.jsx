import React, { useState, useMemo } from "react";
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Play,
  Pause,
  RotateCcw,
  FileText,
  Trash2,
  User,
  ArrowRightLeft,
  Map,
} from "lucide-react";
import ProductJourneyModal from "./modals/ProductJourneyModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * OrderDetail V2.3
 * Toont details van een order en de voortgang van de producten.
 */
const OrderDetail = ({
  order,
  products = [],
  onClose,
  isManager = false,
  onStartProduction,
  onNextStep,
  onDeleteLot,
  onMoveLot,
  loading,
  showAllStations = false,
}) => {
  const [viewingJourney, setViewingJourney] = useState(null);
  const [viewingDossier, setViewingDossier] = useState(null);

  const orderProducts = useMemo(() => {
    if (!order) return [];
    return products.filter((p) => p.orderId === order.orderId);
  }, [order, products]);

  if (!order) return null;

  const formatExcelDate = (val) => {
    if (!val) return "-";
    if (val?.toDate) return val.toDate().toLocaleDateString("nl-NL");
    const num = parseFloat(val);
    if (!isNaN(num) && num > 30000 && num < 100000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      return date.toLocaleDateString("nl-NL");
    }
    const date = new Date(val);
    if (!isNaN(date.getTime())) return date.toLocaleDateString("nl-NL");
    return String(val);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{order.orderId}</h2>
            {order.isUrgent && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                SPOED
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-500">{order.item}</p>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Details Grid */}
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-100 shrink-0">
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Planning</span>
          <span className="font-bold text-slate-700">{formatExcelDate(order.deliveryDate)}</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Aantal</span>
          <span className="font-bold text-slate-700">{order.plan} stuks</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Machine</span>
          <span className="font-bold text-slate-700">{order.machine || "N.v.t."}</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Status</span>
          <span className="font-bold text-slate-700">{order.status}</span>
        </div>
      </div>

      {/* Products List */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
          Producten ({orderProducts.length})
        </h3>
        
        <div className="space-y-3">
          {orderProducts.map((p) => (
            <div key={p.id || p.lotNumber} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center group hover:border-blue-200 transition-all">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${p.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : p.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {p.status === 'completed' ? <CheckCircle2 size={20} /> : p.status === 'rejected' ? <AlertTriangle size={20} /> : <Clock size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800">{p.lotNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-bold uppercase">{p.currentStation}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{p.itemCode}</span>
                    {p.updatedAt && <span>• {p.updatedAt?.toDate ? format(p.updatedAt.toDate(), "dd MMM HH:mm") : ""}</span>}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingDossier(p);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Bekijk uitgebreid dossier"
                  >
                    <FileText size={16} />
                  </button>
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingJourney(p);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Bekijk visuele route"
                  >
                    <Map size={16} />
                  </button>
                {isManager && onMoveLot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newStation = prompt("Naar welk station verplaatsen? (bijv. BH11, MAZAK, GEREED)");
                      if (newStation) onMoveLot(p.lotNumber, newStation);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title="Verplaatsen naar ander station"
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                )}
                {isManager && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if(onDeleteLot) onDeleteLot(p.lotNumber);
                    }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Verwijderen"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {orderProducts.length === 0 && (
            <div className="text-center py-10 text-slate-400 italic text-sm">
              Nog geen producten gestart voor deze order.
            </div>
          )}
        </div>
      </div>

      {viewingJourney && (
        <ProductJourneyModal 
          product={viewingJourney} 
          onClose={() => setViewingJourney(null)} 
        />
      )}

      {viewingDossier && (
        <ProductDossierModal
          isOpen={true}
          product={viewingDossier}
          onClose={() => setViewingDossier(null)}
          orders={[order]}
        />
      )}
    </div>
  );
};

export default OrderDetail;
