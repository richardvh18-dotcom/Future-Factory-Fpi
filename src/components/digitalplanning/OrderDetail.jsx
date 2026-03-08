import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  FileText,
  Trash2,
  ArrowRightLeft,
  Map,
  Factory,
  Building2,
  Cpu,
  Ban,
  Copy,
} from "lucide-react";
import ProductMoveModal from "./ProductMoveModal";
import ProductJourneyModal from "./modals/ProductJourneyModal";
import ProductDossierModal from "./modals/ProductDossierModal";
import ProductDetailModal from "../products/ProductDetailModal";
import CancelOrderModal from "./modals/CancelOrderModal";
import ConfirmationModal from "./modals/ConfirmationModal";
import { FileImage } from "lucide-react";
import { findDrawingForProduct } from "../../utils/findDrawingForProduct";
import { format, differenceInDays } from "date-fns";
import { doc, updateDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import StatusBadge from "./common/StatusBadge";
import { useAdminAuth } from "../../hooks/useAdminAuth";

/**
 * OrderDetail V2.3
 * Toont details van een order en de voortgang van de producten.
 */

const OrderDetail = React.memo(({
  order,
  products = [],
  onClose,
  isManager = false,
  onDeleteLot,
  onMoveLot,
  currentDepartment,
  allowedStations = [],
}) => {
  const { t } = useTranslation();
  const { user, role } = useAdminAuth();
  const { showSuccess, showError } = useNotifications();
  const [viewingJourney, setViewingJourney] = useState(null);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [viewingDrawing, setViewingDrawing] = useState(null);
  const [productToMove, setProductToMove] = useState(null);
  const [drawingLoading, setDrawingLoading] = useState(false);
  const [showOrderMoveModal, setShowOrderMoveModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [moveConfirmData, setMoveConfirmData] = useState(null);

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

  const handleMoveOrder = async (targetType, targetId) => {
    if (!order) return;
    
    try {
      const orderRef = doc(db, ...PATHS.PLANNING, order.id);
      const updates = {
        lastUpdated: serverTimestamp()
      };
      
      let messageContent = "";
      let messageTarget = "";

      if (targetType === "department") {
        // Delegatie naar andere afdeling
        const dept = targetId.toLowerCase(); 
        const inbox = `${targetId.toUpperCase()}_INBOX`;
        
        updates.machine = inbox;
        updates.originalMachine = order.machine;
        updates.originalDepartment = order.department || "fittings";
        updates.returnStation = order.machine;
        updates.delegatedTo = targetId.toUpperCase();
        updates.department = dept;
        updates.delegationDate = serverTimestamp();
        updates.status = "delegated";
        
        messageContent = `Order ${order.orderId} is vanuit ${order.department || 'Fittings'} aangeboden voor ${targetId}.`;
        messageTarget = `${targetId.toUpperCase()}_TEAM`;
        
      } else if (targetType === "station") {
        // Interne verplaatsing / Toewijzing
        updates.machine = targetId;
        updates.status = "planned"; 
        updates.delegatedTo = null; 
        updates.department = currentDepartment || "fittings";
      }

      await updateDoc(orderRef, updates);

      if (messageTarget) {
        await addDoc(collection(db, ...PATHS.MESSAGES), {
          to: messageTarget,
          from: "SYSTEM",
          senderId: "system-auto",
          subject: `Nieuwe Order: ${order.orderId}`,
          content: messageContent,
          timestamp: serverTimestamp(),
          read: false,
          archived: false,
          priority: "normal",
          type: "system",
          targetGroup: messageTarget
        });
      }

      showSuccess(t("digitalplanning.order_detail.move_success", "Order succesvol verplaatst"));
      setShowOrderMoveModal(false);
      onClose();
    } catch (err) {
      console.error("Error moving order:", err);
      showError(t("digitalplanning.order_detail.move_error", "Fout bij verplaatsen: ") + err.message);
    }
  };

  const handleRetrieveOrder = async () => {
    if (!order) return;
    if (!window.confirm(t("digitalplanning.order_detail.confirm_retrieve", `Weet je zeker dat je deze order wilt terughalen van ${order.delegatedTo || 'andere afdeling'}?`))) return;

    try {
      const orderRef = doc(db, ...PATHS.PLANNING, order.id);
      await updateDoc(orderRef, {
        machine: order.returnStation || order.originalMachine || "BH11", // Fallback naar BH11 als origineel onbekend is
        department: order.originalDepartment || "fittings",
        delegatedTo: null,
        status: "planned",
        lastUpdated: serverTimestamp()
      });
      showSuccess(t("digitalplanning.order_detail.retrieve_success", "Order succesvol teruggehaald naar planning"));
      onClose();
    } catch (err) {
      console.error("Error retrieving order:", err);
      showError(t("digitalplanning.order_detail.retrieve_error", "Fout bij terughalen: ") + err.message);
    }
  };

  const handleCancelOrder = async (reason) => {
    try {
      // 1. Update de order status (Soft Delete)
      const orderRef = doc(db, ...PATHS.PLANNING, order.id);
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: user?.uid || auth.currentUser?.uid,
        cancellationReason: reason,
        lastUpdated: serverTimestamp()
      });

      // 2. Log de activiteit (ISO 9001 eis)
      await logActivity(
        user?.uid || auth.currentUser?.uid,
        "ORDER_CANCELLED", 
        `Order ${order.orderId} geannuleerd. Reden: ${reason}`
      );

      setShowCancelModal(false);
      onClose();
      showSuccess(t("digitalplanning.order_detail.cancel_success", "Order succesvol geannuleerd"));
    } catch (error) {
      console.error("Fout bij annuleren:", error);
      showError(t("digitalplanning.order_detail.cancel_error", "Kon order niet annuleren"));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showSuccess("Ordernummer gekopieerd");
  };

  const departments = [
    { id: "FITTINGS", label: "Fittings" },
    { id: "PIPES", label: "Pipes" },
    { id: "SPOOLS", label: "Spools" }
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight select-text">{order.orderId}</h2>
            <button 
              onClick={() => copyToClipboard(order.orderId)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <Copy size={16} />
            </button>
            {order.isUrgent && (
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                {t("digitalplanning.order_detail.urgent")}
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
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("digitalplanning.order_detail.planning")}</span>
          <span className="font-bold text-slate-700">{formatExcelDate(order.deliveryDate)}</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("digitalplanning.order_detail.amount")}</span>
          <span className="font-bold text-slate-700">{order.plan} stuks</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("digitalplanning.order_detail.machine")}</span>
          <span className="font-bold text-slate-700">{order.machine?.replace("_INBOX", "") || t("digitalplanning.order_detail.na")}</span>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("digitalplanning.order_detail.status")}</span>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Products List */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
          {t("digitalplanning.order_detail.products", { count: orderProducts.length })}
        </h3>
        
        <div className="space-y-3">
          {orderProducts.map((p) => {
            const inspectionDate = p.inspection?.timestamp ? (p.inspection.timestamp.toDate ? p.inspection.timestamp.toDate() : new Date(p.inspection.timestamp)) : null;
            const daysInReject = inspectionDate ? differenceInDays(new Date(), inspectionDate) : 0;
            const isLongReject = daysInReject > 2;

            return (
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
                  <div className="text-xs text-slate-500 font-bold mt-0.5 flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{p.item || order.item}</span>
                    {(p.extraCode || order.extraCode) && (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                        {p.extraCode || order.extraCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setDrawingLoading(true);
                    const drawing = await findDrawingForProduct(p.itemCode || p.item || "");
                    setDrawingLoading(false);
                    if (drawing) setViewingDrawing(drawing);
                    else alert(t("digitalplanning.order_detail.no_drawing"));
                  }}
                  className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                  title={t("digitalplanning.order_detail.view_drawing")}
                  disabled={drawingLoading}
                >
                  <FileImage size={16} />
                </button>
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingDossier(p);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.view_dossier")}
                  >
                    <FileText size={16} />
                  </button>
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingJourney(p);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.view_journey")}
                  >
                    <Map size={16} />
                  </button>
                {isManager && onMoveLot && p.inspection?.status === "Tijdelijke afkeur" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(t("digitalplanning.order_detail.move_confirm", { lot: p.lotNumber }))) {
                        onMoveLot(p.lotNumber, "BH31");
                      }
                    }}
                    className={`p-2 rounded-xl transition-all ${isLongReject ? "text-red-600 hover:text-red-800 hover:bg-red-50" : "text-orange-500 hover:text-orange-700 hover:bg-orange-50"}`}
                    title={isLongReject ? t("digitalplanning.order_detail.reject_long", { days: daysInReject }) : t("digitalplanning.order_detail.to_repair")}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                {isManager && onMoveLot && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductToMove(p);
                    }}
                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                    title={t("digitalplanning.order_detail.move_station")}
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
                    title={t("digitalplanning.order_detail.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            );
          })}
          
          {orderProducts.length === 0 && (
            <div className="text-center py-10 text-slate-400 italic text-sm">
              {t("digitalplanning.order_detail.no_products")}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions for Manager */}
      {isManager && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex gap-3 overflow-x-auto items-center">
           <button
             onClick={() => setShowOrderMoveModal(true)}
             className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
           >
             <ArrowRightLeft size={16} />
             {t("digitalplanning.order_detail.move_order", "Verplaats / Aanbieden")}
           </button>

           {(order.delegatedTo || order.status === 'delegated') && (
             <button
               onClick={handleRetrieveOrder}
               className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white hover:bg-amber-600 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
             >
               <RotateCcw size={16} />
               {t("digitalplanning.order_detail.retrieve", `Terughalen van ${order.delegatedTo || 'Afdeling'}`)}
             </button>
           )}

           {/* Cancel Button - Alleen voor bevoegde rollen */}
           {['admin', 'teamleader', 'planner'].includes(role) && (
             <button
               onClick={() => setShowCancelModal(true)}
               className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap active:scale-95"
             >
               <Ban size={16} />
               {t("digitalplanning.order_detail.cancel", "Order Annuleren")}
             </button>
           )}
        </div>
      )}

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
          onMoveLot={onMoveLot}
          currentDepartment={currentDepartment}
          allowedStations={allowedStations}
        />
      )}

      {viewingDrawing && (
        <ProductDetailModal
          product={viewingDrawing}
          onClose={() => setViewingDrawing(null)}
          userRole={isManager ? "admin" : "operator"}
        />
      )}

      {productToMove && (
        <ProductMoveModal
          product={productToMove}
          onClose={() => setProductToMove(null)}
          onMove={onMoveLot}
          currentDepartment={currentDepartment}
          allowedStations={allowedStations}
        />
      )}

      {showOrderMoveModal && (
        <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] shadow-2xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic">
                  {t("digitalplanning.move_modal.title", "Verplaats Order")}
                </h3>
                <p className="text-sm text-slate-500 font-bold">
                  Order: {order.orderId}
                </p>
              </div>
              <button
                onClick={() => setShowOrderMoveModal(false)}
                className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-8">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Building2 size={14} /> Naar Andere Afdeling
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {departments.filter(d => d.id.toLowerCase() !== (currentDepartment || "").toLowerCase()).map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => setMoveConfirmData({ type: "department", id: dept.label })}
                    className="p-4 bg-white border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl flex items-center justify-between group transition-all"
                  >
                    <span className="font-black text-slate-700 group-hover:text-purple-700 uppercase">{dept.label}</span>
                    <Factory size={18} className="text-slate-300 group-hover:text-purple-500" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Cpu size={14} /> Intern Verplaatsen / Toewijzen
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allowedStations.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((station) => (
                  <button
                    key={station.id}
                    onClick={() => setMoveConfirmData({ type: "station", id: station.name || station.id })}
                    className="p-4 bg-slate-50 hover:bg-blue-50 border-2 border-slate-100 hover:border-blue-200 rounded-2xl text-sm font-bold text-slate-700 hover:text-blue-700 transition-all uppercase text-center"
                  >
                    {station.name || station.id}
                  </button>
                ))}
                {allowedStations.length === 0 && (
                  <div className="col-span-full text-center py-4 text-slate-400 italic text-sm">
                    Geen stations beschikbaar.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CancelOrderModal 
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelOrder}
        orderId={order?.orderId}
      />

      <ConfirmationModal
        isOpen={!!moveConfirmData}
        onClose={() => setMoveConfirmData(null)}
        onConfirm={() => handleMoveOrder(moveConfirmData.type, moveConfirmData.id)}
        title="Order Verplaatsen"
        message={`Weet je zeker dat je order ${order.orderId} wilt verplaatsen naar ${moveConfirmData?.id}?`}
        confirmText="Ja, Verplaatsen"
      />

    </div>
  );
});

export default OrderDetail;
