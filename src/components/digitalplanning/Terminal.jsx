import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  query,
  where,
  arrayUnion
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
  isValid,
} from "date-fns";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import ProductDetailModal from "../products/ProductDetailModal";
import LossenView from "./LossenView";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine } from "../../utils/hubHelpers";
import TerminalPlanningView from "./terminal/TerminalPlanningView";
import TerminalProductionView from "./terminal/TerminalProductionView";
import TerminalManualInput from "./terminal/TerminalManualInput";
import MalOptimizationPanel from "./MalOptimizationPanel";
import RepairModal from "./modals/RepairModal";

/**
 * Workstation Terminal - V22.5
 * - Oplossing voor 2026 weeknotatie (W3 vs W03).
 * - Automatische selectie-reset bij navigatie.
 * - Alles-knop toegevoegd en zoekknop uit toolbar verwijderd.
 */
const Terminal = ({ initialStation }) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();

  // Station configuratie
  const stationId = typeof initialStation === "object" ? initialStation.id : initialStation;
  const stationName = typeof initialStation === "object" ? initialStation.name : initialStation;
  const effectiveStationId = stationName || stationId;
  const normalizedStationId = (normalizeMachine(effectiveStationId) || "").toUpperCase().trim();
  const cleanStationId = normalizedStationId.replace(/\s/g, "");

  const isNabewerking = normalizedStationId === "NABEWERKING" || cleanStationId === "NABEWERKING" || normalizedStationId.includes("NABEWERKING") || normalizedStationId.includes("NABEWERKEN");
  const isMazak = normalizedStationId === "MAZAK" || cleanStationId === "MAZAK";
  const isLossenStation = normalizedStationId === "LOSSEN";
  const isSimpleViewStation = isNabewerking || isMazak || isLossenStation;
  const isBH31 = normalizedStationId === "BH31";
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || normalizedStationId.includes("BM01");

  // State management
  const [activeTab, setActiveTab] = useState("planning");
  const [allOrders, setAllOrders] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedTrackedId, setSelectedTrackedId] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [productToRelease, setProductToRelease] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [itemToRepair, setItemToRepair] = useState(null);

  // Scan functionaliteit voor wikkelen tab
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef(null);

  // Planning filters (Week / Alles)
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showAllWeeks, setShowAllWeeks] = useState(true); // STANDAARD AAN: Toon alles om verwarring te voorkomen
  
  const targetWeekNum = getISOWeek(referenceDate);
  const targetYearNum = getISOWeekYear(referenceDate);

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

  // Forceer tab reset bij station wissel
  useEffect(() => {
    if (isBM01) {
      setActiveTab("planning");
    } else {
      setActiveTab("planning");
    }
  }, [effectiveStationId, isBM01]);

  // RESET EFFECT: Zorg dat de details sluiten bij navigatie acties
  useEffect(() => {
    setSelectedOrderId(null);
    setSelectedTrackedId(null);
  }, [referenceDate, showAllWeeks, activeTab]);

  // Helpers
  const parseDateSafe = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput.toDate) return dateInput.toDate();
    const d = new Date(dateInput);
    return isValid(d) ? d : null;
  };

  // Real-time Data Sync
  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    
    // PERFORMANCE: Haal alleen actieve orders op (server-side filtering)
    const q = query(
      collection(db, ...PATHS.PLANNING),
      where("status", "in", ["planned", "in_progress", "delegated", "pending"])
    );

    const unsubOrders = onSnapshot(q, (snap) => {
      const processedOrders = snap.docs.map((doc) => {
        const data = doc.data();
        
        // Robuuste week/jaar bepaling
        let pYear = 0;
        let pWeek = 0;
        
        // 1. Probeer string formaat "2026-W05"
        const weekStr = String(data.week || data.weekNumber || "").toUpperCase();
        if (weekStr.includes("-W")) {
          const parts = weekStr.split("-W");
          pYear = parseInt(parts[0]) || 0;
          pWeek = parseInt(parts[1]) || 0;
        } 
        // 2. Fallback naar datum object
        else if (data.plannedDate) {
          const d = parseDateSafe(data.plannedDate);
          if (d) {
            pYear = getISOWeekYear(d);
            pWeek = getISOWeek(d);
          }
        }
        // 3. Fallback naar losse nummers (week/year velden) als er geen datum of -W string is
        else if (data.week || data.weekNumber) {
             pWeek = parseInt(data.week || data.weekNumber) || 0;
             pYear = parseInt(data.year || data.weekYear) || new Date().getFullYear();
        }
        
        return { 
          id: doc.id, 
          ...data,
          parsedYear: pYear,
          parsedWeek: pWeek
        };
      });
      setAllOrders(processedOrders);
    }, (err) => {
      console.error("Orders sync error:", err);
      setLoading(false);
    });

    const unsubProducts = onSnapshot(collection(db, ...PATHS.TRACKING), (snap) => {
      setAllTracked(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Products sync error:", err);
      setLoading(false);
    });

    return () => {
      unsubOrders();
      unsubProducts();
    };
  }, [stationId]);

  // DEBUG: Log data flow om te zien waar het misgaat
  useEffect(() => {
    if (!loading) {
      console.log(`[Terminal DEBUG] Station: ${normalizedStationId}`);
      console.log(`[Terminal DEBUG] Totaal actieve orders in DB: ${allOrders.length}`);
      // Tel orders die matchen met dit station
      const matching = allOrders.filter(o => (normalizeMachine(o.machine) || "").toUpperCase().trim() === normalizedStationId);
      console.log(`[Terminal DEBUG] Orders voor ${normalizedStationId}: ${matching.length}`);
    }
  }, [loading, allOrders, normalizedStationId]);

  // Gefilterde data voor het huidige station
  const myOrders = useMemo(() => {
    if (isBM01) return allOrders;
    return allOrders.filter(o => {
        const machineNorm = (normalizeMachine(o.machine) || "").toUpperCase().trim();
        const returnNorm = (normalizeMachine(o.returnStation) || "").toUpperCase().trim();
        
        return machineNorm === normalizedStationId || returnNorm === normalizedStationId;
    });
  }, [allOrders, normalizedStationId, isBM01]);

  const productionProgressMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      const oid = String(p.orderId || "").trim();
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
    });
    return map;
  }, [allTracked]);

  // NIEUW: Map voor items die klaar zijn op de machine (voorbij Wikkelen)
  const finishedOnMachineMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      const oid = String(p.orderId || "").trim();
      
      // FIX: Afgekeurde items tellen NIET mee als gereed.
      // Hierdoor daalt de 'produced' teller en komt de order terug in de planning (om bij te maken).
      const isRejected = ['rejected', 'Rejected', 'AFKEUR', 'REJECTED'].includes(p.status) || p.currentStep === 'REJECTED';
      if (isRejected) return;

      // Items die niet meer op 'Wikkelen' of 'HOLD_AREA' staan, zijn klaar voor de machine
      // FIX: HOLD_AREA (Tijdelijke afkeur) telt nu ook als 'klaar op BH18' (want gaat naar BH31), dus order verdwijnt.
      const activeMachineSteps = ["Wikkelen"];
      const isFinishedForMachine = !activeMachineSteps.includes(p.currentStep) || p.currentStep === "Finished" || p.status === "completed";
      
      if (isFinishedForMachine) {
        if (!map[oid]) map[oid] = 0;
        map[oid]++;
      }
    });
    return map;
  }, [allTracked]);

  const readyForReturnMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      const currentStationNorm = (normalizeMachine(p.currentStation) || "").toUpperCase().trim();
      if (currentStationNorm === normalizedStationId && 
          p.status !== "completed" && 
          p.status !== "rejected" && 
          p.currentStep !== "Finished") {
          const oid = String(p.orderId || "").trim();
          if (!map[oid]) map[oid] = 0;
          map[oid]++;
      }
    });
    return map;
  }, [allTracked, normalizedStationId]);

  const activeWikkelingen = useMemo(() => {
    const active = allTracked
      .filter(p => {
        const mNorm = (normalizeMachine(p.machine) || "").toUpperCase().trim();
        const cNorm = (normalizeMachine(p.currentStation) || "").toUpperCase().trim();
        return mNorm === normalizedStationId || cNorm === normalizedStationId;
      })
      .filter(p => p.status === "In Production" || p.status === "Held_QC" || p.status === "in_progress");
    
    if (!sidebarSearch) return active;
    const term = sidebarSearch.toLowerCase();
    return active.filter(p => (p.lotNumber || "").toLowerCase().includes(term) || (p.orderId || "").toLowerCase().includes(term));
  }, [allTracked, normalizedStationId, sidebarSearch]);

  // NIEUW: Items die in de planning tab moeten verschijnen (Reparaties / Verplaatsingen)
  const repairItems = useMemo(() => {
    return activeWikkelingen.filter(p => 
      p.isManualMove || 
      p.inspection?.status === "Tijdelijke afkeur" || 
      isBH31
    );
  }, [activeWikkelingen, isBH31]);

  const filteredOrders = useMemo(() => {
    // Eerst verrijken met live data
    const enrichedOrders = myOrders.map(o => ({
        ...o,
        // FIX: Combineer opgeslagen 'produced' (archived) met live 'finishedOnMachine' (active)
        produced: (o.produced || 0) + (finishedOnMachineMap[o.orderId] || 0)
    }));

    const base = enrichedOrders.filter((o) => {
      // FIX: Gebruik 'plan' als fallback voor 'quantity', anders is quantity 0 en wordt de order verborgen (0 >= 0)
      const quantity = o.quantity || o.plan || 0;
      
      // BUGFIX: Voltooide orders ALTIJD verbergen uit de actieve lijst, ook als 'Alles tonen' aan staat.
      // Een order is klaar voor deze machine als alle stuks voorbij de wikkel-fase zijn.
      if (quantity > 0 && o.produced >= quantity) return false;

      if (o.status !== "pending" && o.status !== "in_progress" && o.status !== "planned" && o.status !== "delegated") return false;
      
      // FIX: BH31 (Reparatie) orders verdwijnen uit planning zodra ze in behandeling zijn
      // Tenzij er specifiek naar gezocht wordt
      const isRepairStation = normalizedStationId === "BH31" || normalizedStationId.includes("REPARATIE") || normalizedStationId.includes("SPECIAL");
      if (isRepairStation && !sidebarSearch) {
          const oid = String(o.orderId || "").trim();
          const started = productionProgressMap[oid] || 0;
          if (started > 0 || o.status === "in_progress" || o.status === "In Production") return false;
      }

      // BM01: Geen week filter, toon alles (behalve als search actief is, wat hieronder gebeurt)
      if (isBM01) return true;

      // ALTIJD tonen als de order actief is of net gepland is voor deze machine, ongeacht de week
      if (o.status === "in_progress") return true;

      if (showAllWeeks || sidebarSearch) return true;

      // Filter op berekende week/jaar
      if (o.parsedYear === targetYearNum && o.parsedWeek === targetWeekNum) return true;
      
      return false;
    });

    if (!sidebarSearch) {
      return base.sort((a, b) => {
        // 0. Status 'planned' of 'delegated' (Nieuw toegewezen) bovenaan
        const isPlannedA = a.status === "planned" || a.status === "delegated";
        const isPlannedB = b.status === "planned" || b.status === "delegated";
        if (isPlannedA !== isPlannedB) return isPlannedA ? -1 : 1;

        // 1. Urgentie
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        // 2. Jaar
        if (a.parsedYear !== b.parsedYear) return a.parsedYear - b.parsedYear;
        // 3. Week
        if (a.parsedWeek !== b.parsedWeek) return a.parsedWeek - b.parsedWeek;
        // 4. Order ID
        return String(a.orderId).localeCompare(String(b.orderId));
      });
    }
    
    const term = sidebarSearch.toLowerCase();
    return base.filter(o => (o.orderId || "").toLowerCase().includes(term) || (o.item || "").toLowerCase().includes(term));
  }, [myOrders, finishedOnMachineMap, targetWeekNum, targetYearNum, showAllWeeks, sidebarSearch, isBM01, normalizedStationId, productionProgressMap]);

  const selectedOrder = useMemo(() => 
    myOrders.find(o => o.id === selectedOrderId || o.orderId === selectedOrderId), 
    [myOrders, selectedOrderId]
  );

  const selectedWikkeling = useMemo(() => activeWikkelingen.find(p => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

  // Auto-focus voor scan input in wikkelen tab
  useEffect(() => {
    const handleClick = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(e.target.tagName)) return;
      
      if (activeTab === "wikkelen" && !selectedTrackedId && !productToRelease && !showStartModal) {
        scanInputRef.current?.focus();
      }
    };
    
    if (activeTab === "wikkelen") {
      scanInputRef.current?.focus();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeTab, selectedTrackedId, productToRelease, showStartModal]);

  // Scan handler voor wikkelen tab
  const handleScan = (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim();
      if (!code) return;
      
      const found = activeWikkelingen.find(i => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );
      
      if (found) {
        setSelectedTrackedId(found.id);
        setScanInput("");
      } else {
        alert(`Item ${code} niet gevonden in actieve wikkelingen.`);
        setScanInput("");
      }
    }
  };

  // Handlers
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleViewDrawing = async (productId) => {
    if (!productId) return;
    try {
      if (typeof productId === 'object') {
        setViewingProduct(productId);
        return;
      }
      const docRef = doc(db, ...PATHS.PRODUCTS, productId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setViewingProduct({ id: snap.id, ...snap.data() });
      } else {
        alert(t("digitalplanning.terminal.product_not_found"));
      }
    } catch (err) {
      console.error("Fout bij laden product:", err);
    }
  };

  const handleStartProduction = async (order, lot) => {
    try {
      const timestamp = serverTimestamp();
      const cleanOrderId = String(order.orderId).trim();
      const cleanItemCode = String(order.itemCode || order.productId).trim();
      const docId = `${cleanOrderId}_${cleanItemCode}_${lot}`.replace(/[^a-zA-Z0-9]/g, "_");

      await setDoc(doc(db, ...PATHS.TRACKING, docId), {
        id: docId, orderId: order.orderId, lotNumber: lot, itemCode: cleanItemCode,
        machine: effectiveStationId, stationLabel: stationName, status: "In Production",
        currentStation: effectiveStationId,
        currentStep: "Wikkelen", createdAt: timestamp, updatedAt: timestamp,
        history: [{
          action: "Start Wikkelen", station: stationName, timestamp: new Date().toISOString(),
          user: user?.email || "Operator",
        }],
        item: order.item || "",
      });

      await updateDoc(doc(db, ...PATHS.PLANNING, order.id), {
        status: "in_progress", activeLot: lot, actualStart: timestamp,
      });

      setShowStartModal(false);
      if (!isNabewerking && !isLossenStation && !isBM01 && !isBH31) setActiveTab("wikkelen");
    } catch (err) {
      console.error("Fout bij starten productie:", err);
    }
  };

  const handleRepair = (item) => {
    setItemToRepair(item);
    setShowRepairModal(true);
  };

  const handleRepairComplete = async (data) => {
    if (!itemToRepair) return;
    try {
        const productRef = doc(db, ...PATHS.TRACKING, itemToRepair.id || itemToRepair.lotNumber);
        
        const updates = {
            currentStation: "BM01",
            currentStep: "Eindinspectie",
            status: "Te Keuren",
            updatedAt: serverTimestamp(),
            note: itemToRepair.note ? `${itemToRepair.note}\nReparatie: ${data.notes}` : `Reparatie: ${data.notes}`,
            history: arrayUnion({
                action: "Reparatie Voltooid",
                timestamp: new Date().toISOString(),
                user: user?.email || "Operator",
                station: effectiveStationId,
                details: `Acties: ${data.actions.join(", ")}. ${data.notes}`
            })
        };

        await updateDoc(productRef, updates);
        setShowRepairModal(false);
        setItemToRepair(null);
    } catch (err) {
        console.error("Fout bij reparatie afronden:", err);
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Loader2 className="animate-spin text-blue-600" size={48} />
    </div>
  );

  // SIMPELE VIEW VOOR NABEWERKING, MAZAK & LOSSEN
  if (isSimpleViewStation) {
    return (
      <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
        <div className="flex-1 overflow-hidden h-full text-left">
          <LossenView stationId={effectiveStationId} appId={appId} products={allTracked} />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
      {/* TABS HEADER (ZOEKEN VERWIJDERD) */}
        <div className="p-2 bg-white border-b border-slate-200 shrink-0 shadow-sm text-left">
          <div className="flex items-center justify-center">
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-xl">
              {(isBM01
                ? [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_to_offer")]
                : [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_winding"), t("digitalplanning.terminal.tab_lossen")]
              ).map((tabLabel, idx) => {
                const tabKey = isBM01
                  ? ["planning", "aan te bieden"][idx]
                  : ["planning", "wikkelen", "lossen"][idx];
                return (
                  <button
                    key={tabKey}
                    onClick={() => handleTabChange(tabKey)}
                    className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeTab === tabKey ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tabLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      {/* CONTENT GEBIED */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {
          /* STANDAARD PLANNING & WIKKELEN FLOW */
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row text-left">
            {activeTab === "planning" ? (
              <TerminalPlanningView
                orders={filteredOrders}
                selectedOrderId={selectedOrderId}
                onSelectOrder={setSelectedOrderId}
                searchTerm={sidebarSearch}
                onSearchChange={setSidebarSearch}
                referenceDate={referenceDate}
                onDateChange={(direction) => setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1))}
                showAllWeeks={showAllWeeks}
                onToggleAllWeeks={() => setShowAllWeeks(!showAllWeeks)}
                targetWeekNum={targetWeekNum}
                productionProgressMap={productionProgressMap}
                readyForReturnMap={readyForReturnMap}
                isBM01={isBM01}
                onStartProduction={() => setShowStartModal(true)}
                selectedOrder={selectedOrder}
                onViewDrawing={handleViewDrawing}
                repairItems={repairItems}
                onRepair={handleRepair}
                // Mal Optimalisatie: Toon gerelateerde orders in het paneel
                optimizationPanel={
                  <MalOptimizationPanel 
                    currentOrder={selectedOrder}
                    allOrders={myOrders}
                    onSelectOrder={setSelectedOrderId}
                  />
                }
              />
            ) : activeTab === "wikkelen" ? (
              /* TAB WIKKELEN */
              <TerminalProductionView
                activeWikkelingen={activeWikkelingen}
                selectedTrackedId={selectedTrackedId}
                onSelectTracked={setSelectedTrackedId}
                selectedWikkeling={selectedWikkeling}
                onReleaseProduct={setProductToRelease}
                scanInput={scanInput}
                setScanInput={setScanInput}
                onScan={handleScan}
                scanInputRef={scanInputRef}
              />
            ) : (
              /* TAB LOSSEN */
              <div className="flex-1 overflow-hidden h-full text-left">
                <LossenView stationId={effectiveStationId} appId={appId} products={allTracked} />
              </div>
            )}
          </div>
        }
      </div>
    </div>

      {/* OVERIG (SNEL ZOEKEN & MODALS) */}
      <TerminalManualInput
        isOpen={showManualInput}
        onClose={() => setShowManualInput(false)}
        value={manualInputValue}
        onChange={setManualInputValue}
        onSearch={() => {
          setSidebarSearch(manualInputValue);
          setShowManualInput(false);
        }}
      />

      {showStartModal && selectedOrder && (
        <ProductionStartModal
          isOpen={true} onClose={() => setShowStartModal(false)}
          order={selectedOrder} stationId={stationId}
          onStart={handleStartProduction} existingProducts={allTracked}
        />
      )}
      
      {productToRelease && (
        <ProductReleaseModal
          isOpen={true} product={productToRelease}
          onClose={() => { setProductToRelease(null); setSelectedTrackedId(null); }}
          appId={appId}
        />
      )}

      {showRepairModal && itemToRepair && (
        <RepairModal
            product={itemToRepair}
            onClose={() => { setShowRepairModal(false); setItemToRepair(null); }}
            onConfirm={handleRepairComplete}
        />
      )}

      {viewingProduct && (
        <ProductDetailModal
          product={viewingProduct}
          onClose={() => setViewingProduct(null)}
          userRole={user?.role || "operator"}
        />
      )}
    </>
  );
};

export default Terminal;