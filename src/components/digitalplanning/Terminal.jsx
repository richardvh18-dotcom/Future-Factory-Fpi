import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  Zap,
  Search,
  ChevronRight,
  FileText,
  Package,
  ChevronLeft,
  Keyboard,
  Sparkles,
  Inbox,
  PlayCircle,
  ClipboardCheck,
  Layers,
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
import StatusBadge from "./common/StatusBadge";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import LossenView from "./LossenView";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine } from "../../utils/hubHelpers";

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
      setAllOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
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

      // Match logica voor weeknummers (bijv. "2026-W3" of "2026-W03")
      const itemWeekStr = String(o.weekNumber || o.week || "").replace('_', '').trim();
      if (!itemWeekStr.includes('-W')) return false;

      const [y, w] = itemWeekStr.split('-W');
      // Vergelijk jaar en week als getallen om formaatverschillen op te vangen
      return Number(y) === targetYearNum && Number(w) === targetWeekNum;
    });

    if (!sidebarSearch) return base.sort((a, b) => a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1);
    
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
        <div className="p-4 bg-white border-b border-slate-200 shrink-0 shadow-sm text-left">
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
              <>
                {/* Sidebar Planning */}
                <div className={`w-full lg:w-5/12 p-4 md:p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedOrderId ? "hidden lg:flex" : "flex"} text-left`}>
                  <div className="relative mb-4 text-left">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      type="text" placeholder="Zoek order..."
                      className="w-full pl-12 pr-10 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] text-sm font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
                      value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)}
                    />
                  </div>
                  
                  {/* Week Selector + Alles Knop */}
                  {!isBM01 && (
                  <div className="flex items-center gap-2 mb-6 shrink-0 text-left">
                    <div className="flex-1 flex justify-between items-center bg-slate-100 p-2 rounded-[25px] border border-slate-200">
                      <button onClick={() => setReferenceDate(subWeeks(referenceDate, 1))} className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 active:scale-90"><ChevronLeft size={20} /></button>
                      <div className="text-center px-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-0.5">Week</span>
                        <span className="text-xl font-black text-slate-900 italic tracking-tighter">{showAllWeeks ? "Overzicht" : targetWeekNum}</span>
                      </div>
                      <button onClick={() => setReferenceDate(addWeeks(referenceDate, 1))} className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 active:scale-90"><ChevronRight size={20} /></button>
                    </div>
                    
                    <button
                      onClick={() => setShowAllWeeks(!showAllWeeks)}
                      className={`p-4 rounded-2xl border transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${
                        showAllWeeks ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      <Layers size={20} /> <span className="hidden sm:inline">Alles</span>
                    </button>
                  </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 text-left text-left">
                    {filteredOrders.length === 0 ? (
                      <div className="p-12 text-center opacity-30 italic font-bold uppercase text-xs">Geen orders voor week {targetWeekNum}</div>
                    ) : (
                      filteredOrders.map((order) => {
                        const produced = productionProgressMap[order.orderId] || 0;
                        const total = Number(order.plan) || 1;
                        const isNew = isOrderNew(order);
                        const dDate = parseDateSafe(order.deliveryDate);

                        return (
                          <div
                            key={order.id} onClick={() => setSelectedOrderId(order.id)}
                            className={`p-4 md:p-5 rounded-[25px] border-2 transition-all cursor-pointer flex items-center justify-between relative overflow-hidden ${
                              selectedOrderId === order.id ? "bg-blue-50 border-blue-500 shadow-sm" : "bg-white border-slate-100 hover:border-blue-200"
                            } text-left`}
                          >
                            {isNew && <div className="absolute top-0 left-0 px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-tighter rounded-br-lg z-10 text-left">Nieuw</div>}
                            <div className="flex items-center gap-4 text-left overflow-hidden">
                              <div className={`p-3 rounded-2xl shrink-0 ${selectedOrderId === order.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400"}`}>
                                <FileText size={20} />
                              </div>
                              <div className="text-left overflow-hidden">
                                <h4 className="font-black text-sm leading-none flex items-center gap-2 text-left">{order.orderId} {isNew && <Sparkles size={10} className="text-emerald-500" />}</h4>
                                <p className="text-[10px] font-bold text-slate-400 truncate uppercase text-left">{order.item}</p>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-wider mt-0.5">{order.machine}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 text-right">
                              <span className="text-[10px] font-black text-slate-900 block italic leading-none">{produced} / {total} ST</span>
                              <span className={`text-[9px] uppercase tracking-tighter ${getUrgencyColor(order.deliveryDate)} text-right`}>
                                {dDate ? format(dDate, "dd-MM", { locale: nl }) : "--"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                {/* Detail Weergave Planning */}
                <div className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedOrderId ? "hidden lg:flex" : "flex"} text-left`}>
                  {selectedOrder ? (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 text-left">
                      <div className="bg-slate-900 rounded-[35px] p-6 text-white shadow-xl flex justify-between items-center relative overflow-hidden text-left">
                        <button onClick={() => setSelectedOrderId(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
                        <div className="text-left flex-1">
                          <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">Actueel Dossier</span>
                          <h2 className="text-3xl font-black italic tracking-tighter leading-none text-left">{selectedOrder.orderId}</h2>
                        </div>
                        <StatusBadge status={selectedOrder.status} />
                      </div>
                      <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left">
                        <div className="space-y-2 text-left text-left">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">Omschrijving</span>
                          <h3 className="text-xl font-black text-slate-800 italic uppercase leading-tight text-left">{selectedOrder.item}</h3>
                        </div>
                        <button onClick={() => setShowStartModal(true)} className="w-full py-6 bg-blue-600 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                          <PlayCircle size={28} /> Start Productie
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-20 text-left">
                      <FileText size={80} className="mb-6 text-slate-200" />
                      <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer een order</h4>
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === "wikkelen" ? (
              /* TAB WIKKELEN */
              <>
                <div className={`w-full lg:w-5/12 p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden ${selectedTrackedId ? "hidden lg:flex" : "flex"} text-left`}>
                  <div className="flex justify-between items-center mb-6 px-2 text-left">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Zap size={16} className="text-orange-500" /> Actieve Wikkelingen
                    </h3>
                    <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black">{activeWikkelingen.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-left text-left">
                    {activeWikkelingen.map((prod) => (
                      <div
                        key={prod.id} onClick={() => setSelectedTrackedId(prod.id)}
                        className={`p-5 rounded-[30px] border-2 transition-all cursor-pointer flex items-center justify-between ${
                          selectedTrackedId === prod.id ? "bg-orange-50 border-orange-500 shadow-md" : "bg-white border-slate-100"
                        } text-left`}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl text-left"><Zap size={20} /></div>
                          <div className="text-left text-left">
                            <h4 className="font-black italic leading-none mb-1 text-left">{prod.lotNumber}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase text-left">Order: {prod.orderId}</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-300" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar ${!selectedTrackedId ? "hidden lg:flex" : "flex"} text-left`}>
                   {selectedWikkeling ? (
                    <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left">
                      <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-orange-500/20 relative overflow-hidden shadow-xl text-left">
                        <button onClick={() => setSelectedTrackedId(null)} className="lg:hidden p-2 text-white/50 mr-2"><ArrowLeft size={20} /></button>
                        <div className="text-left flex-1">
                          <span className="text-[8px] font-black text-orange-400 uppercase block mb-1 text-left">Dossier</span>
                          <h2 className="text-3xl font-black italic leading-none text-left">{selectedWikkeling.lotNumber}</h2>
                        </div>
                        <div className="p-3 bg-orange-600 rounded-2xl shadow-lg animate-pulse"><Zap size={24} /></div>
                      </div>
                      <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left">
                        <button onClick={() => setProductToRelease(selectedWikkeling)} className="w-full py-6 bg-slate-900 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95 group">
                          <ClipboardCheck size={28} /> Product Gereedmelden
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left">
                      <Zap size={80} className="mb-6 text-slate-200" />
                      <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">Selecteer actief lot</h4>
                    </div>
                  )}
                </div>
              </>
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
      {showManualInput && (
        <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in text-left">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden p-10 text-left">
            <h3 className="text-xl font-black uppercase italic mb-6">Snel Zoeken</h3>
            <input
              autoFocus type="text" value={manualInputValue}
              onChange={(e) => setManualInputValue(e.target.value)}
              className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black text-slate-900 outline-none focus:border-blue-600 transition-all uppercase text-center"
              placeholder="NUMMER..."
            />
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowManualInput(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]">Annuleren</button>
              <button
                onClick={() => { setSidebarSearch(manualInputValue); setShowManualInput(false); }}
                className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
              >
                Zoeken
              </button>
            </div>
          </div>
        </div>
      )}

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