import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowRight,
} from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";

// Helper om diameter uit item omschrijving te halen (het eerste getal is de diameter)
const getDiameter = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
};

/**
 * LossenView - Beheert de inkomende producten voor een specifiek werkstation.
 * Gefikst: BH31 naar Nabewerking flow hersteld door betere normalisatie.
 * Update: Gebruikt nu 'products' prop indien beschikbaar om dubbele fetching te voorkomen.
 */
const LossenView = ({ stationId, appId, products }) => {
  const { user } = useAdminAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showFinishModal, setShowFinishModal] = useState(false);

  useEffect(() => {
    if (!stationId) return;

    // Verwerkingslogica losgekoppeld zodat deze voor zowel prop als snapshot werkt
    const processData = (sourceData) => {
      const filtered = sourceData.filter((item) => {
        // Filter op currentStation die overeenkomt met dit werkstation
        // Fallback naar 'machine' (origin) als currentStation niet is gezet
        const itemStationNorm = normalizeMachine(item.currentStation || item.machine || "");
        const currentStationNorm = normalizeMachine(stationId);
        const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
        const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
        const isMazak = cleanStationId === "MAZAK";
        const isNabewerking = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");
        
        let isOurStation = itemStationNorm === currentStationNorm;

        // FIX: Flexibele matching voor Nabewerking (Nabewerking vs Nabewerken)
        if (isNabewerking) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");

          if (itemClean === "NABEWERKING" || itemClean === "NABEWERKEN" || itemClean === "NABW" || itemClean.includes("NABEWERK") ||
              stepClean === "NABEWERKING" || stepClean === "NABEWERKEN" || stepClean.includes("NABEWERK") || 
              statusClean.includes("NABEWERK")) {
            isOurStation = true;
          }
        }

        // FIX: Flexibele matching voor Mazak
        if (isMazak) {
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (statusClean.includes("MAZAK")) isOurStation = true;
        }

        // FIX: Flexibele matching voor BM01
        if (isBM01) {
          const itemClean = (itemStationNorm || "").toUpperCase().replace(/\s/g, "");
          const stepClean = (item.currentStep || "").toUpperCase().replace(/\s/g, "");
          const statusClean = (item.status || "").toUpperCase().replace(/\s/g, "");
          if (itemClean === "BM01" || itemClean === "STATIONBM01" || itemClean.includes("BM01") ||
              stepClean === "EINDINSPECTIE" || stepClean === "INSPECTIE" || stepClean.includes("INSPECTIE") || stepClean === "BM01" ||
              statusClean.includes("BM01")) {
            isOurStation = true;
          }
        }

        // --- CENTRAAL LOSSEN LOGICA ---
        // Als we naar het station "LOSSEN" kijken, toon dan ook items van specifieke machines
        if (currentStationNorm === "LOSSEN") {
          const origin = normalizeMachine(item.machine || "");
          const originLabel = normalizeMachine(item.stationLabel || "");
          const current = normalizeMachine(item.currentStation || "");
          
          const targetMachines = ["BH31", "BH16", "BH11", "31", "16", "11"];
          if (targetMachines.includes(origin) || targetMachines.includes(originLabel) || targetMachines.includes(current)) {
            isOurStation = true;
          } else if (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || current === "BH18") {
            // Alleen ID groter dan 300mm van BH18
            const diameter = getDiameter(item.item || "");
            if (diameter > 300) isOurStation = true;
          }
        }

        // Alleen items tonen die op "Lossen" stap staan
        const isLossenStep = item.currentStep === "Lossen" || isBM01 || isMazak || isNabewerking;

        // Of items die status "in_progress" hebben en nog niet finished zijn
        // FIX: 'completed' toegestaan voor BM01/Mazak/Nabewerking omdat inkomende items deze status kunnen hebben van vorig station
        const isActive = (item.status === "in_progress" || item.status === "Te Lossen" || ((isBM01 || isMazak || isNabewerking) && !["Finished", "GEREED"].includes(item.status))) && item.currentStep !== "Finished" && item.status !== "rejected" && item.currentStep !== "REJECTED";

        return isOurStation && isLossenStep && isActive;
      });

      setItems(
        filtered.sort((a, b) => {
          const tA = a.updatedAt?.seconds || 0;
          const tB = b.updatedAt?.seconds || 0;
          return tA - tB; // FIFO: Oudste eerst voor correcte verwerkingsvolgorde
        })
      );

      setLoading(false);
    };

    // OPTIMALISATIE: Gebruik meegegeven data indien beschikbaar
    if (products) {
      processData(products);
      return;
    }

    // FALLBACK: Zelf fetchen als geen data is meegegeven
    setLoading(true);
    const productsRef = collection(db, ...PATHS.TRACKING);

    const unsubscribe = onSnapshot(
      productsRef,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        processData(docs);
      },
      (err) => {
        console.error("Lossen fout:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [stationId, appId, products]);

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  const currentStationNorm = normalizeMachine(stationId);
  const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
  const isMazak = cleanStationId === "MAZAK";
  const isNabewerking = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");
  
  // Bepaal of we de geavanceerde modal (met afkeur opties) moeten gebruiken
  const isAdvancedStation = isNabewerking || isMazak || isBM01;

  const handleItemClick = (item) => {
    setSelectedProduct(item);
    if (isAdvancedStation) {
      setShowFinishModal(true);
    }
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowFinishModal(false);
  };

  const handlePostProcessingFinish = async (status, data) => {
    if (!selectedProduct) return;
    
    try {
      const productRef = doc(db, ...PATHS.TRACKING, selectedProduct.id || selectedProduct.lotNumber);
      
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: user?.email || "Unknown",
      };

      if (status === "completed") {
        if (isBM01) {
          updates.currentStation = "GEREED";
          updates.currentStep = "Finished";
          updates.status = "completed";
          updates["timestamps.finished"] = serverTimestamp();
          updates.lastStation = "BM01";

          // ARCHIVERING LOGICA
          const year = new Date().getFullYear();
          const archiveRef = doc(db, "future-factory", "production", "archive", String(year), "items", selectedProduct.id || selectedProduct.lotNumber);
          
          const finalData = { 
              ...selectedProduct, 
              ...updates,
              updatedAt: new Date(),
              timestamps: {
                  ...selectedProduct.timestamps,
                  finished: new Date()
              }
          };

          await setDoc(archiveRef, finalData);
          await deleteDoc(productRef);
          handleCloseModal();
          return;
        } else {
          updates.currentStation = "BM01";
          updates.currentStep = "BM01";
          updates.status = "in_progress"; // Reset status zodat item zichtbaar wordt op BM01
          updates.lastStation = stationId;
          updates["timestamps.bm01_start"] = serverTimestamp();
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
        
        // Update order teller bij definitieve afkeur
        if (selectedProduct.orderId && selectedProduct.orderId !== "NOG_TE_BEPALEN") {
             try {
                const orderQuery = query(
                  collection(db, ...PATHS.PLANNING),
                  where("orderId", "==", selectedProduct.orderId)
                );
                const orderSnap = await getDocs(orderQuery);
                
                if (!orderSnap.empty) {
                  const orderDoc = orderSnap.docs[0];
                  const orderData = orderDoc.data();
                  const originStation = selectedProduct.originMachine || selectedProduct.currentStation;
                  const stationField = `started_${originStation.replace(/[^a-zA-Z0-9]/g, '_')}`;
                  const currentStarted = orderData[stationField] || 0;
                  
                  if (currentStarted > 0) {
                    await updateDoc(doc(db, ...PATHS.PLANNING, orderDoc.id), {
                      [stationField]: currentStarted - 1,
                    });
                  }
                }
              } catch (err) {
                console.error("Fout bij updaten order teller:", err);
              }
        }
      }

      await updateDoc(productRef, updates);
      handleCloseModal();
    } catch (error) {
      console.error("Fout bij afronden:", error);
    }
  };

  return (
    <div className="p-4 space-y-3 bg-white h-full overflow-y-auto custom-scrollbar text-left">
      {selectedProduct && (
        isAdvancedStation ? (
          <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={handlePostProcessingFinish}
            currentStation={stationId}
          />
        ) : (
          <ProductReleaseModal
            isOpen={true}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            appId={appId}
          />
        )
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
          <Package size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Geen inkomende items voor {stationId}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4 ml-2">
            <ArrowRight size={16} className="text-emerald-500" />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {isBM01 || isMazak || isNabewerking ? "Aan te bieden" : "Wachtend op ontvangst"} ({items.length})
            </h3>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-slate-100 rounded-[35px] p-6 shadow-sm hover:border-emerald-300 transition-all group animate-in slide-in-from-bottom-2"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="text-left">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Lotnummer
                  </span>
                  <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                    {item.lotNumber}
                  </span>
                  <p className="text-xs font-bold text-slate-600 mt-1">
                    {item.item}
                  </p>
                </div>
                <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase">
                  Ontvangen
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 mb-5 border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Manufactured Item
                </p>
                <p className="text-xs font-mono font-bold text-slate-700 truncate">
                  {item.itemCode}
                </p>
                {item.lastStation && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
                    <History size={10} className="text-blue-500" />
                    <span className="text-[8px] font-black text-slate-500 uppercase italic">
                      {isBM01 ? "Van: " : "Herkomst: "}{item.lastStation}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleItemClick(item)}
                className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
              >
                <ClipboardCheck size={18} /> Verwerken & Vrijgeven
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LossenView;
