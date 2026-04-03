import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  getDocs,
  arrayUnion,
  increment,
} from "firebase/firestore";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowLeft,
  ScanBarcode,
  Keyboard,
  Printer,
} from "lucide-react";
import { db, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getNextFlowState } from "../../utils/workstationLogic";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";

const MazakView = ({ stationId = "Mazak", products = [] }) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const [items, setItems] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef(null);
  const selectedProductRef = useRef(null);

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    if (!scannerMode) return;

    const handleClick = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(event.target.tagName)) return;
      if (!showActionModal) {
        scanInputRef.current?.focus();
      }
    };

    scanInputRef.current?.focus();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showActionModal, scannerMode]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
      setOccupancy(snap.docs.map((docSnap) => docSnap.data()));
    });
    return () => unsub();
  }, []);

  const isShiftActive = (shiftLabel) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const label = String(shiftLabel || "").toUpperCase();

    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return currentTime >= 5 * 60 + 30 && currentTime < 14 * 60;
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return currentTime >= 14 * 60 && currentTime < 22 * 60 + 30;
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return currentTime >= 22 * 60 + 30 || currentTime < 5 * 60 + 30;
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return currentTime >= 7 * 60 + 15 && currentTime < 16 * 60;
    }
    return true;
  };

  const activeOperators = useMemo(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy
      .filter((occ) => {
        const occStation = normalizeMachine(occ.station || occ.machineId || "");
        if (occStation !== currentStation) return false;
        const occDate = occ.date?.toDate ? occ.date.toDate() : new Date(occ.date);
        occDate.setHours(0, 0, 0, 0);
        return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
      })
      .map((entry) => entry.operatorNumber)
      .filter(Boolean);
  }, [occupancy, stationId]);

  useEffect(() => {
    if (!stationId) return;

    const processData = (sourceData) => {
      const filtered = sourceData
        .filter((item) => {
          const stepUpper = String(item.currentStep || "").toUpperCase().trim();
          const statusUpper = String(item.status || "").toUpperCase().trim();
          const inspectionStatus = String(item.inspection?.status || "").toUpperCase().trim();

          if (
            inspectionStatus === "TIJDELIJKE AFKEUR" ||
            inspectionStatus === "AFKEUR" ||
            statusUpper === "REJECTED" ||
            statusUpper === "AFKEUR" ||
            stepUpper === "REJECTED" ||
            stepUpper === "HOLD_AREA"
          ) {
            return false;
          }

          const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
          const stepNorm = String(stepUpper).replace(/\s/g, "");
          const statusNorm = String(statusUpper).replace(/\s/g, "");

          return (
            itemStationNorm === "MAZAK" ||
            stepNorm === "MAZAK" ||
            statusNorm.includes("MAZAK")
          );
        })
        .sort((a, b) => {
          const timeA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const timeB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

      setItems(filtered);
      setLoading(false);
    };

    if (products && products.length > 0) {
      processData(products);
      setLoading(false);

      const liveQuery = query(
        collection(db, ...PATHS.TRACKING),
        where("status", "not-in", ["completed", "shipped", "deleted"])
      );
      const unsub = onSnapshot(liveQuery, (snap) => {
        processData(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      }, () => setLoading(false));
      return () => unsub();
    }

    const liveQuery = query(
      collection(db, ...PATHS.TRACKING),
      where("status", "not-in", ["completed", "shipped", "deleted"])
    );
    const unsub = onSnapshot(liveQuery, (snap) => {
      processData(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    }, () => setLoading(false));
    return () => unsub();
  }, [stationId, products]);

  const handleItemClick = (item) => {
    setSelectedProduct(item);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowActionModal(false);
  };

  const handleOpenActionModal = () => {
    if (!selectedProduct) return;
    setShowActionModal(true);
  };

  const handlePostProcessingFinish = async (status, data, productOverride = null) => {
    const product = productOverride || selectedProduct;
    if (!product) return;

    try {
      const productRef = doc(db, ...PATHS.TRACKING, product.id || product.lotNumber);
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: user?.email || "Unknown",
        history: arrayUnion({
          action: status === "completed" ? "Stap Voltooid" : status === "temp_reject" ? "Tijdelijke Afkeur" : "Definitieve Afkeur",
          timestamp: new Date().toISOString(),
          user: user?.email || "Operator",
          station: stationId,
          details: status === "completed" ? "Mazak verwerking afgerond" : `Reden: ${data.reasons?.join(", ")}`,
        }),
      };

      if (status === "completed") {
        const flowState = getNextFlowState("FINISH_PROCESSING");
        updates.currentStation = flowState.currentStation || "BM01";
        updates.currentStep = flowState.currentStep || "Eindinspectie";
        updates.status = flowState.status || "Te Keuren";
        updates.lastStation = stationId;
        updates["timestamps.bm01_start"] = serverTimestamp();

        if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
          try {
            const planningRef = collection(db, ...PATHS.PLANNING);
            const orderQuery = query(planningRef, where("orderId", "==", product.orderId));
            const orderSnap = await getDocs(orderQuery);
            if (!orderSnap.empty) {
              const orderDoc = orderSnap.docs[0];
              const orderData = orderDoc.data();
              const newProduced = (orderData.produced || 0) + 1;
              const plan = parseInt(orderData.plan || orderData.quantity || 0, 10);
              const orderUpdates = {
                produced: increment(1),
                lastUpdated: serverTimestamp(),
              };

              if (newProduced >= plan) {
                orderUpdates.status = "completed";
              }

              await updateDoc(orderDoc.ref, orderUpdates);
            }
          } catch (error) {
            console.error("Error updating Mazak order status:", error);
          }
        }
      } else if (status === "temp_reject") {
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.currentStep = "HOLD_AREA";
      } else if (status === "rejected") {
        updates.status = "rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
      }

      await updateDoc(productRef, updates);
      await logActivity(
        user?.uid || "system",
        status === "completed" ? "MAZAK_COMPLETE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL",
        `Mazak afhandeling: lot ${product.lotNumber || product.id}, status ${status}, operators ${activeOperators.length}`
      );

      if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
        handleCloseModal();
      }
    } catch (error) {
      console.error("Fout bij Mazak afronden:", error);
    }
  };

  const handleScan = async (event) => {
    if (event.key !== "Enter") return;

    const code = scanInput.trim().toUpperCase();
    if (!code) return;

    if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
      setScanInput("");
      await handlePostProcessingFinish("completed", { note: "Goedgekeurd via QR Scan" }, selectedProduct);
      return;
    }

    const found = items.find(
      (item) =>
        String(item.lotNumber || "").toLowerCase() === code.toLowerCase() ||
        String(item.orderId || "").toLowerCase() === code.toLowerCase()
    );

    if (found) {
      setSelectedProduct(found);
      setScanInput("");
    } else {
      alert(t("lossen.item_not_found", { code }) || `Item ${code} niet gevonden`);
      setScanInput("");
      setSelectedProduct(null);
    }

    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  if (loading) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <style>{`
        @keyframes scan-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
        }
        .scan-pulse {
          animation: scan-pulse 2s infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .pulse-text {
          animation: pulse-text 1.5s ease-in-out infinite;
        }
      `}</style>

      {showActionModal && selectedProduct && (
        <PostProcessingFinishModal
          product={selectedProduct}
          onClose={handleCloseModal}
          onConfirm={handlePostProcessingFinish}
          currentStation={stationId}
          autoFocus={!scannerMode}
        />
      )}

      <div
        className={`w-full lg:w-5/12 p-4 pb-32 space-y-3 border-r border-slate-100 overflow-y-auto custom-scrollbar ${selectedProduct ? "hidden lg:block" : "block"}`}
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-6 space-y-2">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
              <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                {t("lossen.ready_to_scan", "Klaar voor scan")}
              </span>
            </div>

            <button
              onClick={() => setScannerMode(!scannerMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? "bg-purple-100 border-purple-200 text-purple-700" : "bg-white border-slate-200 text-slate-400"}`}
              title={scannerMode ? "Toetsenbord verborgen (Scanner Modus)" : "Normale invoer"}
            >
              {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
              {scannerMode ? "Scanner Modus" : "Toetsenbord"}
            </button>
          </div>

          <div className="relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              inputMode={scannerMode ? "none" : "text"}
              onKeyDown={handleScan}
              placeholder="Scan lotnummer of order..."
              className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
            />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Geen Mazak-items beschikbaar
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4 ml-2">
              <Printer size={16} className="text-blue-500" />
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Mazak Aan Te Bieden ({items.length})
              </h3>
            </div>

            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`bg-white border-2 rounded-[35px] p-6 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer ${selectedProduct?.id === item.id ? "border-blue-400 ring-4 ring-blue-200" : "border-slate-100"}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="text-left">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                      {t("lossen.lot_number")}
                    </span>
                    <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                      {item.lotNumber}
                    </span>
                    <p className="text-xs font-bold text-slate-600 mt-1">
                      {item.item}
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-[9px] font-black uppercase">
                    Mazak
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    {t("lossen.manufactured_item")}
                  </p>
                  <p className="text-xs font-mono font-bold text-slate-700 truncate">
                    {item.itemCode}
                  </p>
                  {item.lastStation && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
                      <History size={10} className="text-blue-500" />
                      <span className="text-[8px] font-black text-slate-500 uppercase italic">
                        Van: {item.lastStation}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto custom-scrollbar ${!selectedProduct ? "hidden lg:flex" : "flex"} flex-col`}>
        {selectedProduct ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <button onClick={() => setSelectedProduct(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
              <div className="text-left flex-1">
                <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">Mazak</span>
                <h2 className="text-3xl font-black italic leading-none text-left">{selectedProduct.lotNumber}</h2>
                <p className="text-xs font-bold text-white/70 mt-2">{selectedProduct.item}</p>
              </div>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-5 text-left">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Volgende uitbreiding</p>
                <p className="mt-2 text-sm font-bold text-blue-900">Printstap kan hier stationspecifiek aan Mazak worden toegevoegd zonder LossenView te raken.</p>
              </div>

              <button onClick={handleOpenActionModal} className="w-full py-6 bg-slate-900 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                <ClipboardCheck size={28} /> Verwerken
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left">
            <Printer size={80} className="mb-6 text-slate-200" />
            <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer Mazak-item</h4>
          </div>
        )}
      </div>
    </div>
  );
};

export default MazakView;