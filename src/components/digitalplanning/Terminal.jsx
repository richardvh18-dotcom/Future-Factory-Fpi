import React, { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ArrowLeft,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
  differenceInDays,
  isValid,
  format,
} from "date-fns";
import { nl } from "date-fns/locale";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import LossenView from "./LossenView";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine } from "../../utils/hubHelpers";
import TerminalPlanningView from "./terminal/TerminalPlanningView";
import TerminalProductionView from "./terminal/TerminalProductionView";
import TerminalManualInput from "./terminal/TerminalManualInput";

/**
 * Workstation Terminal - V22.5
 * - Oplossing voor 2026 weeknotatie (W3 vs W03).
 * - Automatische selectie-reset bij navigatie.
 * - Alles-knop toegevoegd en zoekknop uit toolbar verwijderd.
 */
const Terminal = ({ initialStation, onBack }) => {
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

  // Planning filters (Week / Alles)
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  
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

  const getUrgencyColor = (dateInput) => {
    const d = parseDateSafe(dateInput);
    if (!d) return "text-slate-400";
    const daysUntil = differenceInDays(d, new Date());
    if (daysUntil <= 7) return "text-red-600 font-black";
    if (daysUntil <= 14) return "text-blue-600 font-black";
    return "text-slate-600 font-bold";
  };

  const isOrderNew = (order) => {
    if (!order.createdAt) return false;
    const createdAt = order.createdAt.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime();
    return createdAt > Date.now() - 24 * 60 * 60 * 1000;
  };

  // Real-time Data Sync
  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    
    const unsubOrders = onSnapshot(collection(db, ...PATHS.PLANNING), (snap) => {
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

  // Gefilterde data voor het huidige station
  const myOrders = useMemo(() => {
    if (isBM01) return allOrders;
    return allOrders.filter(o => (normalizeMachine(o.machine) || "").toUpperCase().trim() === normalizedStationId);
  }, [allOrders, normalizedStationId, isBM01]);

  const productionProgressMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      if (!map[p.orderId]) map[p.orderId] = 0;
      map[p.orderId]++;
    });
    return map;
  }, [allTracked]);

  const activeWikkelingen = useMemo(() => {
    const active = allTracked
      .filter(p => (normalizeMachine(p.machine) || "").toUpperCase().trim() === normalizedStationId)
      .filter(p => p.status === "In Production" || p.status === "Held_QC");
    
    if (!sidebarSearch) return active;
    const term = sidebarSearch.toLowerCase();
    return active.filter(p => (p.lotNumber || "").toLowerCase().includes(term) || (p.orderId || "").toLowerCase().includes(term));
  }, [allTracked, normalizedStationId, sidebarSearch]);

  const filteredOrders = useMemo(() => {
    const base = myOrders.filter((o) => {
      if (o.status !== "pending" && o.status !== "in_progress") return false;
      
      // BM01: Geen week filter, toon alles (behalve als search actief is, wat hieronder gebeurt)
      if (isBM01) return true;

      if (showAllWeeks || sidebarSearch) return true;

      // Filter op berekende week/jaar
      if (o.parsedYear === targetYearNum && o.parsedWeek === targetWeekNum) return true;
      
      return false;
    });

    if (!sidebarSearch) {
      return base.sort((a, b) => {
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
  }, [myOrders, targetWeekNum, targetYearNum, showAllWeeks, sidebarSearch, isBM01]);

  const selectedOrder = useMemo(() => 
    myOrders.find(o => o.id === selectedOrderId || o.orderId === selectedOrderId), 
    [myOrders, selectedOrderId]
  );

  const selectedWikkeling = useMemo(() => activeWikkelingen.find(p => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

  // Handlers
  const handleTabChange = (tab) => {
    setActiveTab(tab);
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
      if (!isNabewerking && !isLossenStation && !isBM01) setActiveTab("wikkelen");
    } catch (err) {
      console.error("Fout bij starten productie:", err);
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
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
      {/* TABS HEADER (ZOEKEN VERWIJDERD) */}
        <div className="p-2 bg-white border-b border-slate-200 shrink-0 shadow-sm text-left">
          <div className="flex items-center justify-center">
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-xl">
              {(isBM01 ? ["planning", "aan te bieden"] : ["planning", "wikkelen", "lossen"]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
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
                isBM01={isBM01}
                onStartProduction={() => setShowStartModal(true)}
                selectedOrder={selectedOrder}
              />
            ) : activeTab === "wikkelen" ? (
              /* TAB WIKKELEN */
              <TerminalProductionView
                activeWikkelingen={activeWikkelingen}
                selectedTrackedId={selectedTrackedId}
                onSelectTracked={setSelectedTrackedId}
                selectedWikkeling={selectedWikkeling}
                onReleaseProduct={setProductToRelease}
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
    </div>
  );
};

export default Terminal;