import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, setDoc, deleteDoc, arrayUnion, increment } from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { Package,
    Loader2,
    ClipboardCheck,
    History,
    ArrowRight,
    ScanBarcode,
    Keyboard } from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getNextFlowState } from "../../utils/workstationLogic";

const QR_CODE_OK_CONFIRMATION = 'FPI-ACTION-APPROVE-OK';

// Helper voor diameter (simpel)
const getDiameter = (str) => {
  const text = String(str || "").toUpperCase();
  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => ({
    value: Number(m[0]),
    index: m.index || 0,
  }));
  const candidates = numberMatches.filter((n) => Number.isFinite(n.value) && n.value >= 25 && n.value <= 1000);
  if (candidates.length === 0) return 0;

  const typeIdx = Math.max(text.indexOf("TB"), text.indexOf("CB"));
  if (typeIdx >= 0) {
    const nearest = candidates.reduce((best, cur) => {
      if (!best) return cur;
      return Math.abs(cur.index - typeIdx) < Math.abs(best.index - typeIdx) ? cur : best;
    }, null);
    return nearest?.value || 0;
  }

  return candidates[0]?.value || 0;
};

const shouldGoToCentralLossen = (item) => {
  const itemStr = String(item?.item || "").toUpperCase();
  const d = getDiameter(item?.item || "");
  const isTB = itemStr.includes("TB");
  const isCB = itemStr.includes("CB");
    const origin = normalizeMachine(item?.originMachine || item?.machine || item?.currentStation || "");
    const isBh18Origin = origin === "BH18" || origin === "18";
    const isElbow = /\bELB(OW)?\b/.test(itemStr);
    const hasAbMof = itemStr.includes("ABAB") || /\bAB\b/.test(itemStr);

    // BH18 business rule: Elbows met AB-mof gaan altijd naar centraal LOSSEN.
    if (isBh18Origin && isElbow && hasAbMof) return true;
  return (isTB && d > 300) || (isCB && d > 350);
};

/**
 * LossenView - Beheert de inkomende producten voor een specifiek werkstation.
 * Gefikst: BH31 naar Nabewerking flow hersteld door betere normalisatie.
 * Update: Gebruikt nu 'products' prop indien beschikbaar om dubbele fetching te voorkomen.
 */
const LossenView = ({ stationId, appId, products = [] }) => {
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
  const selectedProductRef = useRef(null); // Ref om huidige selectie bij te houden tijdens async acties

  // Sync ref met state
  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  // Auto-focus logic voor scanner
  useEffect(() => {
    // Alleen auto-focus gebruiken als Scanner Modus AAN staat
    if (!scannerMode) return;

    const handleClick = (e) => {
        // Focus niet stelen als er op een interactief element wordt geklikt
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
        
        if (!showActionModal) {
            scanInputRef.current?.focus();
        }
    };
    
      scanInputRef.current?.focus();

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
      }, [showActionModal, scannerMode]);

  const handleScan = async (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;

      // --- NIEUW: Goedkeuren met QR-code ---
      if (code === QR_CODE_OK_CONFIRMATION && selectedProduct) {
        // Direct input vrijmaken voor volgende scan
        setScanInput("");
        // Huidig product vastleggen voor verwerking
        const productToProcess = selectedProduct;

        if (isAdvancedStation) {
          // Geef product expliciet mee om race-conditions te voorkomen
          await handlePostProcessingFinish('completed', { note: 'Goedgekeurd via QR Scan' }, productToProcess);
        } else {
          // Voor Lossen: GEEN auto-release, want meting is verplicht.
          // De modal is al open door de lot-scan (zie hieronder), dus we doen hier niets.
          // Of we kunnen een melding geven:
          // alert("Voor Lossen is een meting verplicht. Vul dit in op het scherm.");
        }
        return;
      }
        
      const found = items.find(i => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );
        
      if (found) {
        handleItemClick(found); // Direct modal openen voor meting/actie
        setScanInput("");
      } else {
        alert(t('lossen.item_not_found', { code }) || `Item ${code} niet gevonden`);
        setScanInput("");
        setSelectedProduct(null);
      }
      // Na scan altijd weer focus op het scanveld
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  // Haal occupancy data op voor operator tracking
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
      setOccupancy(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // Helper om te checken of een shift momenteel actief is
  const isShiftActive = (shiftLabel) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const label = (shiftLabel || "").toUpperCase();
    
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

  // Bereken actieve operators voor dit station
  const activeOperators = useMemo(() => {
    if (!stationId || occupancy.length === 0) return [];
    const currentStation = normalizeMachine(stationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return occupancy.filter(occ => {
      const occStation = normalizeMachine(occ.station || occ.machineId || "");
      if (occStation !== currentStation) return false;
      const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
      occDate.setHours(0, 0, 0, 0);
      return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
    }).map(o => o.operatorNumber).filter(Boolean);
  }, [occupancy, stationId]);

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

        // FIX: Als item op 'Lossen' staat, toon het ook op het station van herkomst (bv BH11)
        if (!isOurStation && (item.currentStep === "Lossen" || item.currentStep === "Wacht op Lossen" || normalizeMachine(item.currentStation) === "LOSSEN")) {
          const originNorm = normalizeMachine(item.originMachine || item.machine || "");
          if (originNorm === currentStationNorm) {
            // BH18: toon lokaal voor items die NIET naar centraal LOSSEN horen.
            // Dit blijft correct, ook als currentStation historisch al op "LOSSEN" staat.
            if (currentStationNorm === "BH18" || currentStationNorm === "18") {
                if (!shouldGoToCentralLossen(item)) isOurStation = true;
            } else {
                isOurStation = true;
            }
          }
        }

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
          const origin = normalizeMachine(item.originMachine || item.machine || "");
          const originLabel = normalizeMachine(item.stationLabel || "");
          const current = normalizeMachine(item.currentStation || "");
          
          let targetMachines = ["BH31", "BH16", "BH11", "31", "16", "11"];
          let useStrictFilter = false;

          // Filter op toegewezen stations van de gebruiker (indien specifiek ingesteld)
          if (user && user.allowedStations && user.allowedStations.length > 0) {
             const userTargets = user.allowedStations
                .map(s => normalizeMachine(s))
                .filter(s => s !== "LOSSEN" && s !== "TEAMLEADER");
             
             if (userTargets.length > 0) {
                 targetMachines = userTargets;
                 useStrictFilter = true;
             }
          }

           if (targetMachines.includes(origin) || targetMachines.includes(originLabel) || targetMachines.includes(current)) {
             // BH18: TB > 300mm en CB > 350mm gaan naar centraal lossen
             if (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || ["BH18", "18"].includes(current)) {
               if (shouldGoToCentralLossen(item)) isOurStation = true;
             } else {
                 isOurStation = true;
             }
           } else if (!useStrictFilter && (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || ["BH18", "18"].includes(current))) {
             if (shouldGoToCentralLossen(item)) isOurStation = true;
          }
        }

        const stepUpper = String(item.currentStep || "").toUpperCase().trim();
        const statusUpper = String(item.status || "").toUpperCase().trim();

        // Alleen items tonen die op "Lossen" stap staan
        const isLossenStep =
          stepUpper === "LOSSEN" ||
          stepUpper === "WACHT OP LOSSEN" ||
          stepUpper.includes("LOSSEN") ||
          isBM01 ||
          isMazak ||
          isNabewerking;

        // Of items die status "in_progress" hebben en nog niet finished zijn
        // FIX: 'completed' toegestaan voor BM01/Mazak/Nabewerking omdat inkomende items deze status kunnen hebben van vorig station
        const isActive = (
          statusUpper === "IN_PROGRESS" ||
          statusUpper === "TE LOSSEN" ||
          statusUpper === "WACHT OP LOSSEN" ||
          statusUpper === "TE NABEWERKEN" ||
          statusUpper === "TE KEUREN" ||
          ((isBM01 || isMazak || isNabewerking) && !["FINISHED", "GEREED"].includes(statusUpper))
        ) && stepUpper !== "FINISHED" && statusUpper !== "REJECTED" && stepUpper !== "REJECTED";

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
  }, [stationId, appId, products, user]);

  const currentStationNorm = normalizeMachine(stationId);
  const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || (currentStationNorm || "").toUpperCase().includes("BM01");
  const isMazak = cleanStationId === "MAZAK";
  const isNabewerking = cleanStationId === "NABEWERKING" || cleanStationId === "NABW" || cleanStationId.includes("NABEWERK");
  
  // Bepaal of we de geavanceerde modal (met afkeur opties) moeten gebruiken
  const isAdvancedStation = isNabewerking || isMazak || isBM01;

  const handleItemClick = (item) => {
    setSelectedProduct(item); // Selecteer het item
    setShowActionModal(true); // Open de modal voor handmatige actie
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
    setShowActionModal(false);
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
          action: status === "completed" ? "Stap Voltooid" : (status === "temp_reject" ? "Tijdelijke Afkeur" : "Definitieve Afkeur"),
          timestamp: new Date().toISOString(),
          user: user?.email || "Operator",
          station: stationId,
          details: status === "completed" ? "Verwerking afgerond" : `Reden: ${data.reasons?.join(", ")}`
        })
      };

      // Voeg operators toe aan tracking
      if (activeOperators.length > 0) {
        updates[`personnelTracking.${stationId}`] = activeOperators;
      }

      if (status === "completed") {
        if (isBM01) {
          const flowState = getNextFlowState('FINISH_INSPECTION');
          updates.currentStation = flowState.currentStation || "GEREED";
          updates.currentStep = flowState.currentStep || "Finished";
          updates.status = flowState.status || "completed";
          updates["timestamps.finished"] = serverTimestamp();
          updates.lastStation = "BM01";

          // ARCHIVERING LOGICA
          const year = new Date().getFullYear();
          const archiveRef = doc(db, "future-factory", "production", "archive", String(year), "items", product.id || product.lotNumber);
          
          const finalData = { 
              ...product, 
              ...updates,
              updatedAt: new Date(),
              timestamps: {
                  ...product.timestamps,
                  finished: new Date()
              }
          };

          await setDoc(archiveRef, finalData);
          await deleteDoc(productRef);

          await logActivity(
            user?.uid || "system",
            "POST_PROCESS_COMPLETE",
            `Lossen/BM01 archief: lot ${product.lotNumber || product.id}, status completed`
          );

          // Update Planning Order
          if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", product.orderId));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                      const orderDoc = snap.docs[0];
                      const newProduced = (orderDoc.data().produced || 0) + 1;
                      const plan = orderDoc.data().plan || 0;
                      const orderUpdates = {
                          produced: increment(1),
                          lastUpdated: serverTimestamp()
                      };
                      if (newProduced >= plan) orderUpdates.status = "completed";
                      await updateDoc(orderDoc.ref, orderUpdates);
                  }
              } catch (e) { console.error(e); }
          }

          // Alleen afsluiten als we niet alweer een nieuw product hebben gescand
          if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
             handleCloseModal();
          }
          return;
        } else {
          const flowState = getNextFlowState('FINISH_PROCESSING');
          updates.currentStation = flowState.currentStation || "BM01";
          updates.currentStep = flowState.currentStep || "Eindinspectie";
          updates.status = flowState.status || "Te Keuren";
          updates.lastStation = stationId;
          updates["timestamps.bm01_start"] = serverTimestamp();

          // --- FIX: Update Order Status for non-BM01 stations ---
          // Zorgt ervoor dat orders automatisch sluiten als alle items de machine hebben verlaten
          if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", product.orderId));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                      const orderDoc = snap.docs[0];
                      const orderData = orderDoc.data();
                      
                      // Gebruik produced teller voor robuustheid (zoals in BM01)
                      // Dit zorgt ervoor dat de order uit de actieve lijst verdwijnt (produced >= plan)
                      const currentProduced = (orderData.produced || 0);
                      const newProduced = currentProduced + 1;
                      const plan = parseInt(orderData.plan || orderData.quantity || 0);
                      
                      const orderUpdates = {
                          produced: increment(1),
                          lastUpdated: serverTimestamp()
                      };

                      if (newProduced >= plan) {
                          orderUpdates.status = "completed";
                      }
                      
                      await updateDoc(orderDoc.ref, orderUpdates);
                  }
              } catch (e) { console.error("Error updating order status:", e); }
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
        
        // Update order teller bij definitieve afkeur
        if (product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
             try {
                const orderQuery = query(
                  collection(db, ...PATHS.PLANNING),
                  where("orderId", "==", product.orderId)
                );
                const orderSnap = await getDocs(orderQuery);
                
                if (!orderSnap.empty) {
                  const orderDoc = orderSnap.docs[0];
                  const orderData = orderDoc.data();
                  const originStation = product.originMachine || product.currentStation;
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
      await logActivity(
        user?.uid || "system",
        status === "completed" ? "POST_PROCESS_COMPLETE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL",
        `Lossen afhandeling: lot ${product.lotNumber || product.id}, station ${stationId}, status ${status}`
      );
      // Check of selectie nog steeds hetzelfde is voordat we afsluiten
      if (selectedProductRef.current && selectedProductRef.current.id === product.id) {
          handleCloseModal();
      }
    } catch (error) {
      console.error("Fout bij afronden:", error);
    }
  };

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div
      className="p-4 pb-32 space-y-3 bg-white h-full overflow-y-auto custom-scrollbar text-left relative"
      style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
    >
      
      {/* Pulse animatie stylesheet */}
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
        isAdvancedStation ? (
          <PostProcessingFinishModal
            product={selectedProduct}
            onClose={handleCloseModal}
            onConfirm={handlePostProcessingFinish}
            currentStation={stationId}
            autoFocus={!scannerMode}
          />
        ) : (
          <ProductReleaseModal
            isOpen={true}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            appId={appId}
            activeOperators={activeOperators}
            autoFocus={false}
          />
        )
      )}

        {/* INKOMEND VIEW */}
        <>
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-end">
                {/* Scan Indicator Label */}
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
                <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                    🔍 {t('lossen.ready_to_scan', 'Klaar voor scan')}
                </span>
                </div>

                {/* Scanner Mode Toggle */}
                <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-bold text-xs uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                    title={scannerMode ? "Toetsenbord verborgen (Scanner Modus)" : "Normale invoer"}
                >
                    {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                    {scannerMode ? "Scanner Modus" : "Toetsenbord"}
                </button>
            </div>
            {/* Scan Input Field */}
            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
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
                {t('lossen.no_incoming_items', { station: stationId })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4 ml-2">
                <ArrowRight size={16} className="text-emerald-500" />
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {isBM01 || isMazak || isNabewerking ? t('bm01.to_offer') : (currentStationNorm === "LOSSEN" ? t('lossen.wait_for_unload') : t('lossen.waiting_receipt'))} ({items.length})
                </h3>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`bg-white border-2 rounded-[35px] p-6 shadow-sm hover:border-emerald-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer
                    ${selectedProduct?.id === item.id ? 'border-purple-400 ring-4 ring-purple-200' : 'border-slate-100'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="text-left">
                      <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                        {t('lossen.lot_number')}
                      </span>
                      <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                        {item.lotNumber}
                      </span>
                      <p className="text-xs font-bold text-slate-600 mt-1">
                        {item.item}
                      </p>
                    </div>
                    <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase">
                      {t('lossen.received')}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 mb-5 border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      {t('lossen.manufactured_item')}
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-700 truncate">
                      {item.itemCode}
                    </p>
                    {item.lastStation && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
                        <History size={10} className="text-blue-500" />
                        <span className="text-[8px] font-black text-slate-500 uppercase italic">
                          {isBM01 ? t('lossen.from') + ": " : t('lossen.origin') + ": "}{item.lastStation}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleItemClick(item)}
                    className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
                  >
                    <ClipboardCheck size={18} /> {t('lossen.process_release')}
                  </button>
                </div>
              ))}
            </div>
          )}
      </>
    </div>
  );
};

export default LossenView;
