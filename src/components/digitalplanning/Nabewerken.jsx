import React, { useMemo, useRef, useState, useEffect } from "react";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { getDeliveryPlanningState, resolveDeliveryDate, toDateSafe } from "../../utils/dateUtils";

/**
 * Nabewerken Component
 * Toont alle producten die op Nabewerking staan (currentStation/currentStep)
 */
const Nabewerken = ({ products = [], orders = [] }) => {
  const { t } = useTranslation();

  const getDeliveryDate = (product) => {
    if (!product || typeof product !== "object") return null;

    const orderId = String(product.orderId || product.orderNumber || "").trim().toUpperCase();
    const linkedOrder = orderId
      ? orders.find((o) => {
          const oId = String(o?.orderId || o?.orderNumber || "").trim().toUpperCase();
          return oId && oId === orderId;
        })
      : null;

    return resolveDeliveryDate(
      product.deliveryDate,
      product.plannedDeliveryDate,
      product.plannedDate,
      product.date,
      product.deadline,
      linkedOrder?.deliveryDate,
      linkedOrder?.plannedDeliveryDate,
      linkedOrder?.plannedDate,
      linkedOrder?.date,
      linkedOrder?.deadline
    );
  };

  // Filter producten voor Nabewerking
    const nabewerkingProducts = useMemo(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter en sorteer op leverdatum
      const filtered = products.filter((p) => {
        if (p.currentStep === "Finished" || p.currentStep === "REJECTED") return false;
        const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const sCleanUpper = (p.currentStep || "").toUpperCase().replace(/\s/g, "");
        // Check createdAt (Firestore Timestamp or ISO string)
        const createdAtDate = toDateSafe(p.createdAt);
        let isToday = false;
        if (createdAtDate) {
          const created = new Date(createdAtDate);
          created.setHours(0, 0, 0, 0);
          isToday = created.getTime() === today.getTime();
        }
        return (
          pCleanUpper === "NABEWERKING" ||
          pCleanUpper === "NABEWERKEN" ||
          pCleanUpper === "NABW" ||
          pCleanUpper.includes("NABEWERK") ||
          sCleanUpper === "NABEWERKING" ||
          sCleanUpper === "NABEWERKEN" ||
          sCleanUpper === "NABW" ||
          sCleanUpper.includes("NABEWERK") ||
          isToday
        );
      }).sort((a, b) => {
        // Sorteer op leverdatum: eerst wat eerder af moet
        const dateA = getDeliveryDate(a) || new Date(8640000000000000);
        const dateB = getDeliveryDate(b) || new Date(8640000000000000);
        return dateA - dateB;
      });
      return filtered;
    }, [products, orders]);

  // Scan functionaliteit
  const [scanInput, setScanInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const scanInputRef = useRef(null);

  // Focus scanveld bij laden
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  // Focus scanveld bij click buiten input
  useEffect(() => {
    const handleClick = (e) => {
      if (e.target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
      if (!showModal) scanInputRef.current?.focus();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showModal]);

  const handleScan = (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;
      const found = nabewerkingProducts.find(p => (p.lotNumber || '').toUpperCase() === code);
      if (found) {
        setSelectedProduct(found);
        setShowModal(true);
        setScanInput("");
      } else {
        setScanInput("");
        setSelectedProduct(null);
      }
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex-1 p-3 pb-32 space-y-2 overflow-y-auto custom-scrollbar" style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-3 space-y-2">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                🔍 {t('nabewerking.ready_to_scan', 'Klaar voor scan')}
              </span>
            </div>
          </div>
          <div className="relative">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScan}
              placeholder={t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer...")}
              className="w-full pl-4 pr-4 py-4 border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none placeholder:text-slate-300"
            />
          </div>
        </div>

        {nabewerkingProducts.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {t('nabewerking.no_items', 'Geen producten op nabewerking')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {nabewerkingProducts.map((p) => {
              const deliveryDate = getDeliveryDate(p);
              const planningState = getDeliveryPlanningState(deliveryDate, {
                productionLeadDays: 21,
                finishBufferDays: 4,
              });
              const isUrgent = planningState.state === "finish_due" || planningState.state === "overdue";
              const badgeText =
                planningState.state === "overdue"
                  ? "TE LAAT"
                  : planningState.state === "finish_due"
                    ? "AFRONDEN NU"
                    : planningState.state === "in_production_window"
                      ? "IN PRODUCTIE"
                      : "GEPLAND";
              return (
              <div 
                key={p.id || p.lotNumber}
                onClick={() => {
                  setSelectedProduct(p);
                  setShowModal(true);
                }}
                className="bg-white border border-slate-100 rounded-[14px] p-3 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group animate-in slide-in-from-bottom-2 cursor-pointer w-full"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-lg md:text-xl font-black text-slate-900 leading-tight tracking-tight uppercase">
                      {p.item}
                    </p>
                    <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5">
                      {t('nabewerking.lot_label', 'Lot')}
                    </span>
                    <span className="font-black text-slate-900 text-2xl tracking-tighter italic">
                      {p.lotNumber}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={`px-1.5 py-0.5 rounded-lg text-[7px] font-black uppercase whitespace-nowrap ${
                      planningState.state === "overdue"
                        ? 'bg-rose-200 text-rose-800 border border-rose-400'
                        : planningState.state === "finish_due"
                          ? 'bg-red-100 text-red-700 border border-red-300'
                          : planningState.state === "in_production_window"
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isUrgent ? `🔴 ${badgeText}` : badgeText}
                    </div>
                    {deliveryDate && (
                      <div className="text-xs md:text-sm font-black text-orange-600 whitespace-nowrap">
                        {deliveryDate.toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 mt-1.5">
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    {t('nabewerking.item_code', 'Item')}
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-700 truncate">
                    {p.itemCode || p.item}
                  </p>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
      {showModal && selectedProduct && (
        <PostProcessingFinishModal
          product={selectedProduct}
          onClose={() => { setShowModal(false); setSelectedProduct(null); setTimeout(() => scanInputRef.current?.focus(), 50); }}
          onConfirm={() => { setShowModal(false); setSelectedProduct(null); setTimeout(() => scanInputRef.current?.focus(), 50); }}
          currentStation={selectedProduct.currentStation || "Nabewerking"}
        />
      )}
    </div>
  );
};

export default Nabewerken;
