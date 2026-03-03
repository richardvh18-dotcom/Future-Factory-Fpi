import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, getDocs, setDoc, deleteDoc, orderBy, limit, writeBatch, arrayUnion, increment } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowRight,
  Printer,
  X,
  Tag,
  Hash,
  Search,
  Clock,
  Trash2,
  Lock as LockIcon,
  Wifi,
  ScanBarcode,
} from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { resolveLabelContent, processLabelData, applyLabelLogic } from "../../utils/labelHelpers";
import { getISOWeek } from "date-fns";
import { getNextFlowState } from "../../utils/workstationLogic";
import StatusBadge from "./common/StatusBadge";

const PIXELS_PER_MM = 3.78;
const getQRCodeUrl = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(data)}`;
const getBarcodeUrl = (data) => `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(data)}&scale=3&height=10&incltext&guardwhitespace`;

// Helper voor machine code (bv. BH31 -> 431)
const getMachineCode = (station) => {
    if (!station) return "000";
    const match = station.match(/(\d+)/);
    if (match) return "4" + match[1].padStart(2, '0');
    return "000";
};

// Helper voor diameter (simpel)
const getDiameter = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
};

const getLotPrefix = (station) => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const week = getISOWeek(date).toString().padStart(2, '0');
    const machineCode = getMachineCode(station);
    return `40${year}${week}${machineCode}`;
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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printInput, setPrintInput] = useState("");
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef(null);

  // Hub / Planning State
  const [activeView, setActiveView] = useState("incoming"); // 'incoming' | 'planning'
  const [planningOrders, setPlanningOrders] = useState([]);
  const [planningSearch, setPlanningSearch] = useState("");
  const [planningStationFilter, setPlanningStationFilter] = useState("ALL");
  const [reserveConfig, setReserveConfig] = useState(null); // { order, count, station }
  const [generating, setGenerating] = useState(false);
  const [nextStartLot, setNextStartLot] = useState(null);
  const [showReservations, setShowReservations] = useState(false);
  const [showSimplePrintModal, setShowSimplePrintModal] = useState(false);
  
  // Printer State
  const [savedPrinters, setSavedPrinters] = useState([]);
  const [simplePrintConfig, setSimplePrintConfig] = useState({
      machine: stationId || "BH12",
      date: new Date().toISOString().slice(0, 10),
      startSeq: 1,
      count: 1,
      mode: "standard", // 'standard' (USB/Local) | 'network' (IP)
      printerIp: "",
      showCutLine: true,
  });

  // Label Preview State
  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const containerRef = useRef(null);
  const [labelRules, setLabelRules] = useState([]);

  const isCentralHub = normalizeMachine(stationId) === "LOSSEN";

  // Auto-focus logic voor scanner
  useEffect(() => {
    const handleClick = (e) => {
        // Focus niet stelen als er op een interactief element wordt geklikt
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
        
        // Alleen focussen in de inkomende view (waar gescand wordt)
        if (activeView === "incoming" && !selectedProduct && !showPrintModal && !showSimplePrintModal && !reserveConfig) {
            scanInputRef.current?.focus();
        }
    };
    
    // Focus bij laden
    if (activeView === "incoming") {
        scanInputRef.current?.focus();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeView, selectedProduct, showPrintModal, showSimplePrintModal, reserveConfig]);

  const handleScan = (e) => {
    if (e.key === 'Enter') {
        const code = scanInput.trim();
        if (!code) return;
        
        const found = items.find(i => 
            (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
            (i.orderId || "").toLowerCase() === code.toLowerCase()
        );
        
        if (found) {
            handleItemClick(found);
            setScanInput("");
        } else {
            alert(t('lossen.item_not_found', { code }) || `Item ${code} niet gevonden`);
            setScanInput("");
        }
    }
  };

  // Haal occupancy data op voor operator tracking
  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
      setOccupancy(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // Sync machine selection with stationId prop
  useEffect(() => {
    if (stationId) {
      setSimplePrintConfig(prev => ({ ...prev, machine: stationId }));
    }
  }, [stationId]);

  // Haal opgeslagen printers op uit Firestore
  useEffect(() => {
    const printersRef = collection(db, "future-factory", "settings", "printers");
    const unsub = onSnapshot(printersRef, (snap) => {
        const printerList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSavedPrinters(printerList);
        
        // Automatisch printer selecteren: Eerst kijken naar station koppeling, dan naar global default
        const stationPrinter = printerList.find(p => p.linkedStations && p.linkedStations.includes(stationId));
        const globalDefault = printerList.find(p => p.isDefault);
        const targetPrinter = stationPrinter || globalDefault;

        if (targetPrinter) {
            if (targetPrinter.type === 'network') {
                setSimplePrintConfig(prev => ({ ...prev, mode: 'network', printerIp: targetPrinter.ip }));
            } else {
                setSimplePrintConfig(prev => ({ ...prev, mode: 'standard' }));
            }
        }
    });
    return () => unsub();
  }, [stationId]);

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

  // Fetch planning data alleen als we in de Hub view zitten en op de planning tab
  useEffect(() => {
    if (isCentralHub && activeView === 'planning') {
        const q = query(collection(db, ...PATHS.PLANNING), orderBy("orderId", "desc"), limit(100));
        const unsub = onSnapshot(q, (snap) => {
            setPlanningOrders(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });
        return () => unsub();
    }
  }, [isCentralHub, activeView]);

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
            // BH18 Logic: Only <= 300 stays local
            if (currentStationNorm === "BH18" || currentStationNorm === "18") {
                if (getDiameter(item.item || "") <= 300) isOurStation = true;
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
          const origin = normalizeMachine(item.machine || "");
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
             // BH18 restrictie: alleen > 300mm
             if (origin === "BH18" || originLabel === "BH18" || current === "BH18" || origin === "18") {
                 if (getDiameter(item.item || "") > 300) isOurStation = true;
             } else {
                 isOurStation = true;
             }
          } else if (!useStrictFilter && (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || current === "BH18")) {
             if (getDiameter(item.item || "") > 300) isOurStation = true;
          }
        }

        // Alleen items tonen die op "Lossen" stap staan
        const isLossenStep = item.currentStep === "Lossen" || item.currentStep === "Wacht op Lossen" || isBM01 || isMazak || isNabewerking;

        // Of items die status "in_progress" hebben en nog niet finished zijn
        // FIX: 'completed' toegestaan voor BM01/Mazak/Nabewerking omdat inkomende items deze status kunnen hebben van vorig station
        const isActive = (
          item.status === "in_progress" || 
          item.status === "Te Lossen" || 
          item.status === "Wacht op Lossen" || 
          item.status === "Te Nabewerken" || 
          item.status === "Te Keuren" || 
          ((isBM01 || isMazak || isNabewerking) && !["Finished", "GEREED"].includes(item.status))
        ) && item.currentStep !== "Finished" && item.status !== "rejected" && item.currentStep !== "REJECTED";

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
    setSelectedProduct(item);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  const handlePostProcessingFinish = async (status, data) => {
    if (!selectedProduct) return;
    
    try {
      const productRef = doc(db, ...PATHS.TRACKING, selectedProduct.id || selectedProduct.lotNumber);
      
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

          // Update Planning Order
          if (selectedProduct.orderId && selectedProduct.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", selectedProduct.orderId));
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

          handleCloseModal();
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
          if (selectedProduct.orderId && selectedProduct.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", selectedProduct.orderId));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                      const orderDoc = snap.docs[0];
                      const orderData = orderDoc.data();
                      const plan = parseInt(orderData.plan || orderData.quantity || 0);
                      
                      // Tel items die klaar zijn of voorbij dit station zijn
                      // We gebruiken de 'products' prop als cache indien beschikbaar, anders query
                      const currentItems = products.length > 0 ? products : (await getDocs(query(collection(db, ...PATHS.TRACKING), where("orderId", "==", selectedProduct.orderId)))).docs.map(d => d.data());
                      
                      const finishedCount = currentItems.filter(p => 
                          p.orderId === selectedProduct.orderId && 
                          (p.status === 'completed' || p.currentStep === 'Finished' || p.currentStep === 'Eindinspectie' || p.currentStep === 'Te Keuren' || p.currentStep === 'Te Nabewerken')
                      ).length;

                      // +1 omdat het huidige item nu ook verwerkt wordt
                      if (finishedCount + 1 >= plan) {
                          await updateDoc(orderDoc.ref, { status: 'completed', lastUpdated: serverTimestamp() });
                      }
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

  // Filter orders voor planning view
  const filteredOrders = useMemo(() => {
      let result = planningOrders;

      if (planningStationFilter !== "ALL") {
          result = result.filter(o => o.machine === planningStationFilter);
      }

      if (planningSearch) {
          const lower = planningSearch.toLowerCase();
          result = result.filter(o => 
              (o.orderId || "").toLowerCase().includes(lower) || 
              (o.item || "").toLowerCase().includes(lower)
          );
      }
      return result;
  }, [planningOrders, planningSearch, planningStationFilter]);

  const uniqueStations = useMemo(() => {
      const stations = new Set(planningOrders.map(o => o.machine).filter(Boolean));
      return Array.from(stations).sort();
  }, [planningOrders]);

  // Filter gereserveerde items uit de products prop
  const reservedItems = useMemo(() => {
      // Check welke lotnummers al 'echt' in productie zijn (status != reserved)
      const activeLots = new Set(products.filter(p => p.status !== "reserved").map(p => p.lotNumber));

      return products
        .filter(p => p.status === "reserved" && !activeLots.has(p.lotNumber)) // Verberg als lotnummer al actief is
        .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [products]);

  // Automatische cleanup van verlopen reserveringen (> 24 uur)
  useEffect(() => {
    if (!isCentralHub || reservedItems.length === 0) return;

    const cleanupExpired = async () => {
        const now = new Date();
        const batch = writeBatch(db);
        let deleteCount = 0;

        reservedItems.forEach(item => {
            let expiryDate = item.expiresAt ? (item.expiresAt.toDate ? item.expiresAt.toDate() : new Date(item.expiresAt)) : null;
            
            // Fallback: als expiresAt mist, gebruik createdAt + 24u
            if (!expiryDate && item.createdAt) {
                const created = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                expiryDate = new Date(created.getTime() + 24 * 60 * 60 * 1000);
            }

            if (expiryDate && expiryDate < now) {
                const ref = doc(db, ...PATHS.TRACKING, item.id || item.lotNumber);
                batch.delete(ref);
                deleteCount++;
            }
        });

        if (deleteCount > 0) {
            await batch.commit().catch(err => console.error("Cleanup error:", err));
        }
    };

    cleanupExpired();
  }, [reservedItems, isCentralHub]);

  // Fetch Labels voor Reserve Modal
  useEffect(() => {
    if (!reserveConfig) return;
    const fetchLabels = async () => {
        try {
            const labelsRef = collection(db, "future-factory", "settings", "label_templates");
            const snap = await getDocs(labelsRef);
            const labels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAvailableLabels(labels);
            if (labels.length > 0) {
                 // Kies standaard een smal label of de eerste
                 const defaultLabel = labels.find(l => l.name?.toLowerCase().includes("smal") || l.height < 50) || labels[0];
                 setSelectedLabelId(defaultLabel.id);
            }
        } catch (e) {
            console.error("Labels fetch error", e);
        }

        try {
            const rulesRef = collection(db, "future-factory", "settings", "label_logic");
            const snap = await getDocs(rulesRef);
            setLabelRules(snap.docs.map(d => d.data()));
        } catch (e) {
            console.error("Rules fetch error", e);
        }
    };
    fetchLabels();
  }, [reserveConfig]);

  // Haal het eerstvolgende beschikbare lotnummer op zodra de modal opent
  useEffect(() => {
    if (!reserveConfig || !reserveConfig.station) {
        setNextStartLot(null);
        return;
    }
    
    const fetchNextLot = async () => {
        try {
            const prefix = getLotPrefix(reserveConfig.station);
            const trackRef = collection(db, ...PATHS.TRACKING);
            const q = query(
                trackRef, 
                where("lotNumber", ">=", prefix),
                where("lotNumber", "<=", prefix + "\uf8ff"),
                orderBy("lotNumber", "desc"), 
                limit(1)
            );
            const snap = await getDocs(q);
            
            let nextSeq = 1;

            if (!snap.empty) {
                const lastLot = snap.docs[0].data().lotNumber;
                const lastSeqStr = lastLot.slice(-6);
                const lastSeq = parseInt(lastSeqStr, 10);
                if (!isNaN(lastSeq)) {
                    nextSeq = lastSeq + 1;
                }
            }
            
            const nextLotNumber = `${prefix}${nextSeq.toString().padStart(6, '0')}`;
            setNextStartLot(nextLotNumber);
        } catch (e) {
            console.error("Error fetching next lot", e);
        }
    };
    fetchNextLot();
  }, [reserveConfig]);

  const selectedLabel = useMemo(() => availableLabels.find(l => l.id === selectedLabelId), [availableLabels, selectedLabelId]);

  const previewData = useMemo(() => {
    if (!reserveConfig?.order) return {};
    // Gebruik processLabelData voor volledige verrijking (diameter, pn, type, etc.)
    const baseData = processLabelData({
        ...reserveConfig.order,
        orderNumber: reserveConfig.order.orderId,
        productId: reserveConfig.order.itemCode || "",
        description: reserveConfig.order.item,
        // Toon het echte volgende nummer in de preview, of een placeholder als nog aan het laden
        lotNumber: nextStartLot || "Laden..."
    });

    return applyLabelLogic(baseData, labelRules);
  }, [reserveConfig, nextStartLot, labelRules]);

  useEffect(() => {
    if (containerRef.current && selectedLabel) {
        const containerW = containerRef.current.clientWidth;
        const labelW = selectedLabel.width * PIXELS_PER_MM;
        setPreviewZoom(Math.min(1, (containerW - 40) / labelW));
    }
  }, [selectedLabel, reserveConfig]);

  const handleSimplePrint = async () => {
      const { machine, date, startSeq, count, printerIp, mode, showCutLine } = simplePrintConfig;
      if (!date) return;
      const dateObj = new Date(date);
      const year = dateObj.getFullYear().toString().slice(-2);
      const week = getISOWeek(dateObj).toString().padStart(2, '0');
      const machineCode = getMachineCode(machine);
      const prefix = `40${year}${week}${machineCode}`;

      // Printer instellingen ophalen
      const selectedPrinter = savedPrinters.find(p => p.ip === printerIp);
      const dpi = selectedPrinter?.dpi ? parseInt(selectedPrinter.dpi) : 203;
      const darkness = selectedPrinter?.darkness ? parseInt(selectedPrinter.darkness) : 15;
      const scale = dpi / 203;

      // Schalen van coördinaten en groottes op basis van DPI
      const xQr = Math.round(10 * scale);
      const yQr = Math.round(10 * scale);
      const qrMag = Math.max(2, Math.round(2 * scale));
      const xText = Math.round(100 * scale);
      const yText = Math.round(20 * scale);
      const fontSize = Math.round(30 * scale);
      
      let zpl = "";
      
      for (let i = 0; i < count; i++) {
          const seq = (startSeq + i).toString().padStart(6, '0');
          const lot = `${prefix}${seq}`;
          
          zpl += `^XA
~SD${darkness}
^FO${xQr},${yQr}^BQN,2,${qrMag}^FDQA,${lot}^FS
^FO${xText},${yText}^A0N,${fontSize},${fontSize}^FD${lot}^FS
^XZ
`;
      }

      // MODE: STANDAARD (Browser Print - PDF/Systeem Dialoog)
      if (mode === "standard") {
          const printWindow = window.open('', '_blank');
          if (!printWindow) {
              alert(t('lossen.popup_blocked'));
              return;
          }

          let html = `
            <html>
            <head>
                <title>Labels Printen</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .label { 
                        width: 300px; 
                        height: 120px; 
                        border-bottom: ${showCutLine ? '1px dashed #000' : 'none'};
                        margin-bottom: 10px; 
                        display: flex; 
                        align-items: center; 
                        padding: 10px;
                        page-break-inside: avoid;
                    }
                    .qr { width: 40px; height: 40px; margin-right: 15px; }
                    .text { font-size: 20px; font-weight: bold; }
                    @media print {
                        .label { border-bottom: ${showCutLine ? '1px dashed #000' : 'none'}; page-break-after: auto; margin: 0; }
                        body { padding: 0; margin: 0; }
                    }
                </style>
            </head>
            <body>
          `;

          for (let i = 0; i < count; i++) {
              const seq = (startSeq + i).toString().padStart(6, '0');
              const lot = `${prefix}${seq}`;
              html += `
                <div class="label">
                    <img src="${getQRCodeUrl(lot)}" class="qr" />
                    <div class="text">${lot}</div>
                </div>
              `;
          }

          html += `<script>
            window.onload = () => {
                setTimeout(() => {
                    window.print();
                    // window.close(); // Optioneel: sluit venster na printen
                }, 800);
            };
          </script></body></html>`;

          printWindow.document.write(html);
          printWindow.document.close();
          setShowSimplePrintModal(false);
          return;
      }

      // MODE: NETWERK (IP)
      if (mode === "network") {
          if (!printerIp) {
              alert(t('lossen.select_printer_error'));
              return;
          }
          try {
              await fetch(`http://${printerIp}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
              alert(`Opdracht verzonden naar Netwerk Printer (${printerIp})`);
          } catch (err) {
              alert(t('lossen.print_error') + err.message);
          }
      }
      
      setShowSimplePrintModal(false);
  };

  const handleReserveConfirm = async () => {
      if (!reserveConfig || !reserveConfig.order) return;
      setGenerating(true);
      try {
          // 1. Bepaal start lotnummer (volledige string)
          let startLotFull = nextStartLot;
          const prefix = getLotPrefix(reserveConfig.station);
          
          // Fallback als nextStartLot nog niet geladen is
          if (!startLotFull) {
              const trackRef = collection(db, ...PATHS.TRACKING);
              const q = query(
                  trackRef, 
                  where("lotNumber", ">=", prefix),
                  where("lotNumber", "<=", prefix + "\uf8ff"),
                  orderBy("lotNumber", "desc"), 
                  limit(1)
              );
              const snap = await getDocs(q);
              
              let nextSeq = 1;
              
              if (!snap.empty) {
                  const lastLot = snap.docs[0].data().lotNumber;
                  const lastSeqStr = lastLot.slice(-6);
                  const lastSeq = parseInt(lastSeqStr, 10);
                  if (!isNaN(lastSeq)) {
                      nextSeq = lastSeq + 1;
                  }
              }
              startLotFull = `${prefix}${nextSeq.toString().padStart(6, '0')}`;
          }

          // 2. Batch aanmaken
          const batch = writeBatch(db);
          const newLots = [];
          
          // Parse sequence from startLotFull
          let currentSeq = parseInt(startLotFull.slice(-6), 10);

          for (let i = 0; i < reserveConfig.count; i++) {
              const nextLot = `${prefix}${(currentSeq + i).toString().padStart(6, '0')}`;
              
              // Construct Document ID consistent with started products (OrderId_ItemCode_LotNumber)
              const cleanOrderId = String(reserveConfig.order.orderId || "UNKNOWN").trim();
              const cleanItemCode = String(reserveConfig.order.itemCode || reserveConfig.order.productId || "UNKNOWN").trim();
              const docId = `${cleanOrderId}_${cleanItemCode}_${nextLot}`.replace(/[^a-zA-Z0-9]/g, "_");

              const docRef = doc(db, ...PATHS.TRACKING, docId);
              
              const expiresAt = new Date();
              expiresAt.setHours(expiresAt.getHours() + 24); // 24 uur geldig

              const payload = {
                  id: docId,
                  lotNumber: nextLot,
                  orderId: reserveConfig.order.orderId || "UNKNOWN",
                  itemCode: cleanItemCode,
                  item: reserveConfig.order.item || "",
                  status: "reserved",
                  targetStation: reserveConfig.station || "Onbekend",
                  createdAt: serverTimestamp(),
                  reservedAt: serverTimestamp(),
                  expiresAt: expiresAt,
                  isReservation: true,
                  note: "Vooraf geprint label"
              };

              batch.set(docRef, payload);
              newLots.push(nextLot);
          }

          await batch.commit();
          alert(t('lossen.reservation_success', { count: newLots.length, lots: newLots.join(", ") }));
          setReserveConfig(null);
          setNextStartLot(null); // Forceer refresh bij volgende keer openen
      } catch (err) {
          console.error("Fout bij reserveren:", err);
          alert(t('lossen.reservation_error') + err.message);
      } finally {
          setGenerating(false);
      }
  };

  const handleDeleteReservation = async (item) => {
      if(!window.confirm(t('lossen.confirm_release', { lot: item.lotNumber }))) return;
      try {
          await deleteDoc(doc(db, ...PATHS.TRACKING, item.id || item.lotNumber));
      } catch(err) {
          console.error(err);
          alert("Fout bij vrijgeven: " + err.message);
      }
  };

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div className="p-4 space-y-3 bg-white h-full overflow-y-auto custom-scrollbar text-left relative">
      
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

      {/* HUB TABS (Alleen zichtbaar op LOSSEN station) */}
      {isCentralHub && (
        <div className="flex bg-slate-100 p-1 rounded-xl mb-4 shrink-0">
            <button onClick={() => setActiveView("incoming")} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeView === "incoming" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}>
                {t('lossen.incoming')}
            </button>
            <button onClick={() => setActiveView("planning")} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeView === "planning" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}>
                {t('lossen.planning_labels')}
            </button>
        </div>
      )}

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
            activeOperators={activeOperators}
          />
        )
      )}

      {/* Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-black text-slate-800 uppercase text-sm tracking-wide flex items-center gap-2">
                        <Printer size={18} className="text-blue-600" /> {t('lossen.print_options')}
                    </h3>
                    <button onClick={() => setShowPrintModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.free_text')}</label>
                        <div className="relative">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                            <input 
                                type="text" 
                                value={printInput}
                                onChange={(e) => setPrintInput(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
                                placeholder="Bijv. 2024-001"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => { alert(`Print Etiket voor: ${printInput}`); setShowPrintModal(false); }}
                            className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 border-2 border-blue-100 rounded-2xl transition-all group"
                        >
                            <Tag size={24} className="text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-blue-700 uppercase">{t('lossen.label')}</span>
                        </button>
                        <button 
                            onClick={() => { alert(`Print Volgnummer: ${printInput}`); setShowPrintModal(false); }}
                            className="flex flex-col items-center justify-center p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-100 rounded-2xl transition-all group"
                        >
                            <Hash size={24} className="text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-emerald-700 uppercase">{t('lossen.sequence_number')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Simple Print Modal (Alleen Lotnummers) */}
      {showSimplePrintModal && (
        <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                    <h3 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2">
                        <Hash size={18} className="text-blue-600" /> {t('lossen.print_loose_lots')}
                    </h3>
                    <button onClick={() => setShowSimplePrintModal(false)}><X size={20} className="text-slate-400" /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('digitalplanning.machine')}</label>
                        <select
                            value={simplePrintConfig.machine}
                            onChange={(e) => setSimplePrintConfig({...simplePrintConfig, machine: e.target.value})}
                            className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-500"
                        >
                            {uniqueStations.length > 0 ? uniqueStations.map(s => (
                                <option key={s} value={s}>{s}</option>
                            )) : <option value="BH12">BH12</option>}
                            <option value="BH12">BH12</option>
                            <option value="BH11">BH11</option>
                            <option value="Mazak">Mazak</option>
                        </select>
                    </div>

                    {/* Printer Mode Selectie */}
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.print_method')}</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                                onClick={() => setSimplePrintConfig({...simplePrintConfig, mode: "standard"})}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${simplePrintConfig.mode === "standard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                            >
                                <Printer size={14} /> {t('lossen.standard_browser')}
                            </button>
                            <button 
                                onClick={() => setSimplePrintConfig({...simplePrintConfig, mode: "network"})}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${simplePrintConfig.mode === "network" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"}`}
                            >
                                <Wifi size={14} /> {t('lossen.network_ip')}
                            </button>
                        </div>
                    </div>

                    {/* Netwerk Printer Selectie (Alleen zichtbaar bij Netwerk modus) */}
                    {simplePrintConfig.mode === "network" && (
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.choose_network_printer')}</label>
                        <select
                            value={simplePrintConfig.printerIp}
                            onChange={(e) => setSimplePrintConfig({...simplePrintConfig, printerIp: e.target.value})}
                            className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-500"
                        >
                            <option value="">{t('lossen.select_printer')}</option>
                            {savedPrinters.map(p => (
                                <option key={p.id} value={p.ip}>{p.name} ({p.ip})</option>
                            ))}
                        </select>
                    </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                                {t('lossen.date_week', { week: simplePrintConfig.date ? getISOWeek(new Date(simplePrintConfig.date)) : "?" })}
                            </label>
                            <input 
                                type="date"
                                value={simplePrintConfig.date}
                                onChange={(e) => setSimplePrintConfig({...simplePrintConfig, date: e.target.value})}
                                className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.start_sequence')}</label>
                            <input 
                                type="number"
                                value={simplePrintConfig.startSeq}
                                onChange={(e) => setSimplePrintConfig({...simplePrintConfig, startSeq: parseInt(e.target.value) || 0})}
                                className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.print_count')}</label>
                        <input 
                            type="number"
                            min="1"
                            max="100"
                            value={simplePrintConfig.count}
                            onChange={(e) => setSimplePrintConfig({...simplePrintConfig, count: parseInt(e.target.value) || 1})}
                            className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="flex items-center gap-3 py-1 px-1">
                        <input 
                            type="checkbox"
                            id="chkCutLine"
                            checked={simplePrintConfig.showCutLine}
                            onChange={(e) => setSimplePrintConfig({...simplePrintConfig, showCutLine: e.target.checked})}
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="chkCutLine" className="text-xs font-bold text-slate-700 cursor-pointer select-none">{t('lossen.print_cut_line')}</label>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-1">{t('lossen.example')}</span>
                        <span className="font-mono text-xl font-black text-blue-900">
                            {getLotPrefix(simplePrintConfig.machine).replace(/40\d{4}/, `40${new Date(simplePrintConfig.date).getFullYear().toString().slice(-2)}${getISOWeek(new Date(simplePrintConfig.date)).toString().padStart(2,'0')}`)}{simplePrintConfig.startSeq.toString().padStart(6,'0')}
                        </span>
                    </div>

                    <button 
                        onClick={handleSimplePrint}
                        className="w-full py-4 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                        <Printer size={16} /> {t('lossen.print_label_zpl')}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Reserve Modal */}
      {reserveConfig && (
          <div className="fixed inset-0 z-[210] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden p-6 space-y-6">
                  <div className="flex justify-between items-center">
                      <h3 className="font-black text-slate-800 uppercase text-sm">{t('lossen.reserve_labels')}</h3>
                      <button onClick={() => setReserveConfig(null)}><X size={20} className="text-slate-400" /></button>
                  </div>
                  
                  {/* Dynamic Label Preview */}
                  <div 
                    ref={containerRef}
                    className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden min-h-[150px]"
                  >
                    {selectedLabel ? (
                        <div
                          className="bg-white shadow-sm relative transition-all duration-500 origin-center overflow-hidden border border-slate-300"
                          style={{
                            width: `${selectedLabel.width * PIXELS_PER_MM * previewZoom}px`,
                            height: `${selectedLabel.height * PIXELS_PER_MM * previewZoom}px`,
                          }}
                        >
                          {selectedLabel.elements?.map((el, index) => {
                            const resolved = resolveLabelContent(el, previewData);
                            const baseStyle = {
                              position: "absolute",
                              left: `${el.x * PIXELS_PER_MM * previewZoom}px`,
                              top: `${el.y * PIXELS_PER_MM * previewZoom}px`,
                              width: el.width ? `${el.width * PIXELS_PER_MM * previewZoom}px` : "auto",
                              height: el.height ? `${el.height * PIXELS_PER_MM * previewZoom}px` : "auto",
                              color: "black",
                              transform: `rotate(${el.rotation || 0}deg)`,
                              transformOrigin: "top left",
                              overflow: "hidden",
                              textAlign: "left",
                            };

                            if (el.type === "text") return (
                                <div key={index} style={{...baseStyle, fontSize: `${el.fontSize * previewZoom}px`, fontWeight: el.isBold ? "900" : "normal", fontFamily: el.fontFamily || "Arial", whiteSpace: "nowrap", lineHeight: "1"}}>
                                  {resolved.content}
                                </div>
                            );
                            if (el.type === "line") return (
                                <div key={index} style={{...baseStyle, backgroundColor: "black"}} />
                            );
                            if (el.type === "box") return (
                                <div key={index} style={{...baseStyle, border: `${(el.thickness || 1) * PIXELS_PER_MM * previewZoom}px solid black`, boxSizing: "border-box"}} />
                            );
                            if (el.type === "barcode" || el.type === "qr") return (
                                <div key={index} style={{...baseStyle, display: "flex", alignItems: "center", justifyContent: "center"}}>
                                  <img src={el.type === "barcode" ? getBarcodeUrl(resolved.content) : getQRCodeUrl(resolved.content)} alt="Code" style={{width: "100%", height: "100%", objectFit: "contain"}} />
                                </div>
                            );
                            return null;
                          })}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 italic">{t('common.loading')}</div>
                    )}
                  </div>

                  {/* Label Selector */}
                  <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{t('lossen.label_format')}</label>
                      <select 
                        value={selectedLabelId} 
                        onChange={(e) => setSelectedLabelId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                      >
                        {availableLabels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.width}x{l.height}mm)</option>)}
                      </select>
                  </div>

                  <div className="space-y-4">
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.lot_count')}</label>
                          <input 
                              type="number" 
                              min="1" 
                              max="50"
                              value={reserveConfig.count}
                              onChange={(e) => setReserveConfig({...reserveConfig, count: parseInt(e.target.value) || 1})}
                              className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-500"
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('lossen.destination_station')}</label>
                          <div className="relative">
                              <input 
                                  type="text" 
                                  placeholder="Bijv. BH31"
                                  value={reserveConfig.station}
                                  onChange={(e) => setReserveConfig({...reserveConfig, station: e.target.value.toUpperCase()})}
                                  className={`w-full p-3 border-2 rounded-xl font-bold text-slate-800 outline-none focus:border-emerald-500 ${reserveConfig.order?.machine ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed" : "bg-white border-slate-200"}`}
                                  readOnly={!!reserveConfig.order?.machine}
                              />
                              {reserveConfig.order?.machine && (
                                  <LockIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              )}
                          </div>
                      </div>
                      
                      {/* Weergave van de te reserveren reeks */}
                      {nextStartLot && reserveConfig.count > 0 && (
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">
                                {t('lossen.reserved_lots')}
                            </span>
                            <div className="font-mono text-xs font-bold text-blue-900 flex items-center gap-2">
                                <span>{nextStartLot}</span>
                                <ArrowRight size={12} className="text-blue-400" />
                                <span>
                                    {(() => {
                                        if (!nextStartLot) return "";
                                        const p = nextStartLot.slice(0, -6);
                                        const s = parseInt(nextStartLot.slice(-6), 10);
                                        return `${p}${(s + reserveConfig.count - 1).toString().padStart(6, '0')}`;
                                    })()}
                                </span>
                            </div>
                        </div>
                      )}
                  </div>
                  <button 
                      onClick={handleReserveConfirm}
                      disabled={generating || !reserveConfig.station}
                      className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                      {generating ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                      {t('lossen.reserve_and_print')}
                  </button>
                  <p className="text-[9px] text-slate-400 text-center italic">
                      {t('lossen.reservation_expiry')}
                  </p>
              </div>
          </div>
      )}

      {/* VIEW SWITCHER LOGIC */}
      {activeView === "planning" ? (
        <div className="space-y-6">
            {/* Zoekbalk & Filter */}
            <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={t('lossen.search_order')}
                        value={planningSearch}
                        onChange={(e) => setPlanningSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-emerald-500 transition-all"
                    />
                </div>
                <select
                    value={planningStationFilter}
                    onChange={(e) => setPlanningStationFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-emerald-500 transition-all min-w-[150px]"
                >
                    <option value="ALL">{t('lossen.all_stations')}</option>
                    {uniqueStations.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <button
                    onClick={() => setShowReservations(!showReservations)}
                    className={`px-4 py-3 rounded-2xl font-bold text-sm transition-all border-2 whitespace-nowrap ${showReservations ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                >
                    {showReservations ? t('lossen.hide_reservations') : t('lossen.show_reservations')}
                </button>
                <button
                    onClick={() => setShowSimplePrintModal(true)}
                    className="px-4 py-3 bg-blue-50 border-2 border-blue-100 text-blue-600 rounded-2xl font-bold text-sm hover:bg-blue-100 transition-all whitespace-nowrap flex items-center gap-2"
                >
                    <Hash size={16} /> {t('lossen.only_numbers')}
                </button>
            </div>

            {/* Gereserveerde Items Sectie */}
            {showReservations && reservedItems.length > 0 && (
                <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4">
                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Clock size={12} /> {t('lossen.reserved_labels_title')} ({reservedItems.length})
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {reservedItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-orange-100 shadow-sm">
                                <div>
                                    <span className="font-mono font-bold text-xs text-slate-700">{item.lotNumber}</span>
                                    <span className="text-[9px] text-slate-400 ml-2">{item.targetStation}</span>
                                </div>
                                <button onClick={() => handleDeleteReservation(item)} className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-md transition-colors" title="Vrijgeven">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Order Lijst */}
            <div className="space-y-3">
                {filteredOrders.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-xs">{t('bm01.no_orders')}</div>
                ) : (
                    filteredOrders.map(order => (
                        <div key={order.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-emerald-200 transition-all group">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-black text-slate-800">{order.orderId}</h4>
                                    <p className="text-xs text-slate-500 line-clamp-1">{order.item}</p>
                                    <div className="mt-1"><StatusBadge status={order.status} /></div>
                                </div>
                                <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">{order.plan} st</span>
                            </div>
                            <button 
                                onClick={() => setReserveConfig({ order, count: 1, station: order.machine || "" })}
                                className="w-full py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                            >
                                <Printer size={14} /> {t('lossen.print_labels_btn')}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
      ) : (
        /* INKOMEND VIEW (Bestaande functionaliteit) */
        <>
          <div className="mb-6 space-y-2">
            {/* Scan Indicator Label */}
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 w-fit">
              <div className="w-2 h-2 bg-blue-500 rounded-full pulse-text"></div>
              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                🔍 {t('lossen.ready_to_scan', 'Klaar voor scan')}
              </span>
            </div>
            {/* Scan Input Field */}
            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 transition-all scan-pulse" size={24} />
              <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScan}
                  placeholder="Scan lotnummer of order..."
                  className="w-full pl-14 pr-4 py-4 bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-300 rounded-2xl font-bold text-lg shadow-sm outline-none transition-all placeholder:text-slate-300"
                  autoFocus
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
                  className="bg-white border-2 border-slate-100 rounded-[35px] p-6 shadow-sm hover:border-emerald-300 transition-all group animate-in slide-in-from-bottom-2"
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
      )}
    </div>
  );
};

export default LossenView;
