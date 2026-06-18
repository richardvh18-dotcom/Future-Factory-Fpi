import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { useTranslation } from "react-i18next";
import { Package, Keyboard, X } from "lucide-react";
import { getDeliveryPlanningState, resolveDeliveryDate } from "../../utils/dateUtils";
import { completeTrackedProduct, rejectTrackedProductFinal, tempRejectTrackedProduct } from "../../services/planningSecurityService";
import { auth, logActivity } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";
import { useTouchKeyboardPreference } from "../../hooks/useTouchKeyboardPreference";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";

type FinishStatus = "completed" | "rejected" | "temp_reject";

interface PostProcessingData {
  note?: string;
  reasons?: string[];
}

interface NabewerkingProduct {
  id?: string;
  lotNumber?: string;
  orderId?: string;
  orderNumber?: string;
  deliveryDate?: unknown;
  plannedDeliveryDate?: unknown;
  plannedDate?: unknown;
  date?: unknown;
  deadline?: unknown;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  item?: string;
  itemCode?: string;
}

interface Order {
  orderId?: string;
  orderNumber?: string;
  deliveryDate?: unknown;
  plannedDeliveryDate?: unknown;
  plannedDate?: unknown;
  date?: unknown;
  deadline?: unknown;
}

/**
 * Nabewerken Component
 * Toont alle producten die op Nabewerking staan (currentStation/currentStep)
 */
const Nabewerken = ({ products = [], orders = [] }: { products?: NabewerkingProduct[]; orders?: Order[] }) => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotifications();

  const resolveSystemStation = useCallback((product: NabewerkingProduct | undefined | null) => {
    if (!product) return "Onbekend";
    const station = String(product.currentStation || "").trim();
    if (station) return station;
    const step = String(product.currentStep || "").trim();
    if (step) return step;
    return "Onbekend";
  }, []);

  const getDeliveryDate = (product: NabewerkingProduct): Date | null => {
    if (!product || typeof product !== "object") return null;

    const orderId = String(product.orderId || product.orderNumber || "").trim().toUpperCase();
    const linkedOrder = orderId
      ? orders.find((o) => {
          const oId = String(o?.orderId || o?.orderNumber || "").trim().toUpperCase();
          return oId && oId === orderId;
        })
      : null;

    return resolveDeliveryDate(
      product.deliveryDate as any,
      product.plannedDeliveryDate as any,
      product.plannedDate as any,
      product.date as any,
      product.deadline as any,
      linkedOrder?.deliveryDate as any,
      linkedOrder?.plannedDeliveryDate as any,
      linkedOrder?.plannedDate as any,
      linkedOrder?.date as any,
      linkedOrder?.deadline as any
    );
  };

  // Filter producten voor Nabewerking
    const nabewerkingProducts = useMemo(() => {
      // Filter en sorteer op leverdatum
      const filtered = products.filter((p) => {
        const pStatus = String(p.status || "").toLowerCase();
        if (["completed", "finished", "gereed", "rejected", "afkeur", "archived_rejected"].includes(pStatus)) return false;
        if (p.currentStep === "Finished" || p.currentStep === "REJECTED") return false;

        const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const sCleanUpper = (p.currentStep || "").toUpperCase().replace(/\s/g, "");

        return (
          pCleanUpper === "NABEWERKING" ||
          pCleanUpper === "NABEWERKEN" ||
          pCleanUpper === "NABW" ||
          pCleanUpper.includes("NABEWERK") ||
          sCleanUpper === "NABEWERKING" ||
          sCleanUpper === "NABEWERKEN" ||
          sCleanUpper === "NABW" ||
          sCleanUpper.includes("NABEWERK")
        );
      }).sort((a, b) => {
        // Sorteer op leverdatum: eerst wat eerder af moet
        const dateA = getDeliveryDate(a) || new Date(8640000000000000);
        const dateB = getDeliveryDate(b) || new Date(8640000000000000);
        return dateA.getTime() - dateB.getTime();
      });
      return filtered;
    }, [products, orders]);

  // Scan functionaliteit
  const [scanInput, setScanInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<NabewerkingProduct | null>(null);
  const [showModal, setShowModal] = useState(false);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const { touchKeyboardPreferred, setTouchKeyboardPreferred } = useTouchKeyboardPreference();
  const isTouchDevice = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }, []);

  const focusScanInput = useCallback(() => {
    const input = scanInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
  }, []);

  const scheduleScanFocus = useCallback(() => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        focusScanInput();
        setTimeout(focusScanInput, 0);
      });
      return;
    }
    setTimeout(focusScanInput, 0);
  }, [focusScanInput]);

  // Focus scanveld bij laden
  useEffect(() => {
    scheduleScanFocus();
  }, [scheduleScanFocus]);

  // Focus scanveld bij click buiten input
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e?.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
      if (!showModal) scheduleScanFocus();
    };
    const handleWindowFocus = () => {
      if (!showModal) scheduleScanFocus();
    };
    document.addEventListener('click', handleClick);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [showModal, scheduleScanFocus]);

  const handlePostProcessingFinish = async (product: NabewerkingProduct, status: FinishStatus, data: PostProcessingData = {}): Promise<void> => {
    const productId = product.id || product.lotNumber;
    const station = product.currentStation || "Nabewerking";

    if (status === "completed") {
      await completeTrackedProduct({
        productId,
        finishType: "forward",
        fromStation: station,
        note: data.note || "",
        actorLabel: auth.currentUser?.email || "Operator",
        source: "Nabewerken",
      });
      await logActivity(auth.currentUser?.uid ?? "", "POST_PROCESS_COMPLETE", `Nabewerken gereedgemeld: lot ${product.lotNumber || productId}`);
      showSuccess(
        t("nabewerking.sent_to_end_inspection", "Product {{lot}} is naar Eindinspectie gestuurd.", { lot: product.lotNumber || productId }),
        t("nabewerking.completed", "Gereed")
      );
      return;
    }

    if (status === "rejected") {
      await rejectTrackedProductFinal({
        productId,
        reasons: data.reasons || [],
        note: data.note || "",
        source: "Nabewerken",
        actorLabel: auth.currentUser?.email || "Operator",
      });
      await logActivity(auth.currentUser?.uid ?? "", "QUALITY_REJECT_FINAL", `Nabewerken definitieve afkeur: lot ${product.lotNumber || productId}`);
      return;
    }

    await tempRejectTrackedProduct({
      productId,
      reasons: data.reasons || [],
      note: data.note || "",
      station,
      actorLabel: auth.currentUser?.email || "Operator",
      previousStep: product.currentStep || "",
      previousStatus: product.status || "",
      source: "Nabewerken",
    });
    await logActivity(auth.currentUser?.uid ?? "", "QUALITY_TEMP_REJECT", `Nabewerken tijdelijke afkeur: lot ${product.lotNumber || productId}`);
  };

  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;

      if (code === QR_CODE_OK_CONFIRMATION) {
        const productToProcess = selectedProduct;
        if (!productToProcess) {
          setScanInput("");
          showError(t("nabewerking.scan_lot_first", "Scan of selecteer eerst een lotnummer."), "Nabewerken");
          scheduleScanFocus();
          return;
        }
        try {
          await handlePostProcessingFinish(productToProcess, "completed", { note: "Goedgekeurd via QR Scan" });
        } catch (err) {
          console.error("Fout bij OK-QR afronden Nabewerken:", err);
          showError((err as Error).message || "Kon OK QR actie niet verwerken", "Fout");
        } finally {
          setShowModal(false);
          setSelectedProduct(null);
          setScanInput("");
          scheduleScanFocus();
        }
        return;
      }

      const found = nabewerkingProducts.find(p => (p.lotNumber || '').toUpperCase() === code);
      if (found) {
        setSelectedProduct(found);
        setShowModal(true);
        setScanInput("");
      } else {
        const foundElsewhere = products.find(
          (p) => String(p?.lotNumber || "").trim().toUpperCase() === code
        );
        setScanInput("");
        setSelectedProduct(null);

        if (foundElsewhere) {
          const systemStation = resolveSystemStation(foundElsewhere);
          showError(
            t(
              "nabewerking.wrong_station_scan",
              "Lot {{lot}} ligt niet op Nabewerking. Volgens het systeem staat dit lot op: {{station}}.",
              { lot: code, station: systemStation }
            ),
            t("nabewerking.wrong_station_title", "Verkeerd station")
          );
        }
      }
      scheduleScanFocus();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex-1 p-3 space-y-2 overflow-y-auto custom-scrollbar" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
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
              autoFocus
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              inputMode={isTouchDevice && !touchKeyboardPreferred ? "none" : "text"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onKeyDown={handleScan}
              placeholder={t("digitalplanning.terminal.scan_lot_or_order", "Scan lotnummer...")}
              className="w-full pl-4 pr-24 py-4 border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none placeholder:text-slate-300"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {scanInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setScanInput("");
                    scanInputRef.current?.focus();
                  }}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  title={t("common.clear", "Wissen")}
                >
                  <X size={14} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setTouchKeyboardPreferred(true);
                  requestAnimationFrame(() => scanInputRef.current?.focus());
                }}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-blue-600 hover:text-blue-700"
                title={t("digitalplanning.terminal.keyboard", "Toetsenbord")}
              >
                <Keyboard size={14} />
              </button>
            </div>
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
                finishBufferDays: 3,
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
            onClose={() => { setShowModal(false); setSelectedProduct(null); scheduleScanFocus(); }}
            onConfirm={async (status, data) => {
              try {
                await handlePostProcessingFinish(selectedProduct, status, data);
              } catch (err) {
                console.error("Fout bij afronden Nabewerken:", err);
                showError((err as Error).message || "Kon wijziging niet opslaan", "Fout");
              } finally {
                setShowModal(false);
                setSelectedProduct(null);
                scheduleScanFocus();
              }
            }}
            currentStation={selectedProduct.currentStation || "Nabewerking"}
          />
      )}
    </div>
  );
};

export default Nabewerken;
