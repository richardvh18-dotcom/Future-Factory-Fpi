import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  Zap,
  CheckCircle2,
  Search,
  Clock,
  ChevronRight,
  FileText,
  AlertCircle,
  Package,
  ChevronLeft,
  CalendarDays,
  Boxes,
  X,
  ClipboardCheck,
  History,
  Keyboard,
  MessageSquare,
  Sparkles,
  Inbox,
  ArrowRight,
  MapPin,
  Tag,
  PlayCircle,
} from "lucide-react"; // Gecorrigeerd van 'lucide-center' naar 'lucide-react'
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
  addWeeks,
  subWeeks,
  differenceInDays,
  format,
  isValid,
} from "date-fns";
import { nl } from "date-fns/locale";
import StatusBadge from "./common/StatusBadge";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import LossenView from "./LossenView";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine } from "../../utils/hubHelpers";

/**
 * Workstation Terminal - V19.1
 * FIX: 'lucide-center' module error hersteld door correcte import van 'lucide-react'.
 * De Z-index van de header blijft verlaagd zodat de global Sidebar eroverheen kan vallen.
 */
const Terminal = ({ initialStation, onBack }) => {
  const { user } = useAdminAuth();

  const stationId =
    typeof initialStation === "object" ? initialStation.id : initialStation;
  const stationName =
    typeof initialStation === "object" ? initialStation.name : initialStation;
  const normalizedStationId = (normalizeMachine(stationId) || "")
    .toUpperCase()
    .trim();

  const isNabewerking = normalizedStationId === "NABEWERKING";

  const [activeTab, setActiveTab] = useState(
    isNabewerking ? "lossen" : "planning"
  );
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

  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const selectedWeek = getISOWeek(referenceDate);

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

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
    const createdAt = order.createdAt.toMillis
      ? order.createdAt.toMillis()
      : new Date(order.createdAt).getTime();
    return createdAt > Date.now() - 24 * 60 * 60 * 1000;
  };

  useEffect(() => {
    if (!stationId) return;
    
    setLoading(true);
    
    // Firestore listeners voor orders en products
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snap) => {
        setAllOrders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.error("Orders listener error:", error);
        setLoading(false);
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snap) => {
        setAllTracked(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Products listener error:", error);
        setLoading(false);
      }
    );

    // Cleanup functie die ALTIJD de listeners afsluit wanneer component unmount of dependencies veranderen
    return () => {
      console.log(`[Terminal ${stationId}] Cleanup: listeners worden afgesloten`);
      unsubOrders();
      unsubProducts();
    };
  }, [stationId]); // appId verwijderd - deze is constant en hoeft niet in dependencies

  const myOrders = useMemo(() => {
    return allOrders.filter(
      (o) =>
        (normalizeMachine(o.machine) || "").toUpperCase() ===
        normalizedStationId
    );
  }, [allOrders, normalizedStationId]);

  const myTracked = useMemo(() => {
    return allTracked.filter(
      (p) =>
        (normalizeMachine(p.machine) || "").toUpperCase() ===
        normalizedStationId
    );
  }, [allTracked, normalizedStationId]);

  const productionProgressMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      if (!map[p.orderId]) map[p.orderId] = 0;
      map[p.orderId]++;
    });
    return map;
  }, [allTracked]);

  const activeInbound = useMemo(() => {
    return myTracked
      .filter((p) => p.status === "In Production" || p.status === "Held_QC")
      .sort(
        (a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
      );
  }, [myTracked]);

  const activeWikkelingen = useMemo(() => {
    const active = myTracked.filter(
      (p) => p.status === "In Production" || p.status === "Held_QC"
    );
    if (!sidebarSearch) return active;
    const term = sidebarSearch.toLowerCase();
    return active.filter(
      (p) =>
        (p.lotNumber || "").toLowerCase().includes(term) ||
        (p.orderId || "").toLowerCase().includes(term)
    );
  }, [myTracked, sidebarSearch]);

  const filteredOrders = useMemo(() => {
    const base = myOrders.filter((o) => {
      if (o.status !== "pending" && o.status !== "in_progress") return false;
      if (showAllWeeks || sidebarSearch) return true;
      const oWeek = o.weekNumber || o.week;
      return oWeek === selectedWeek;
    });
    if (!sidebarSearch)
      return base.sort((a, b) =>
        a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1
      );
    const term = sidebarSearch.toLowerCase();
    return base.filter(
      (o) =>
        (o.orderId || "").toLowerCase().includes(term) ||
        (o.item || "").toLowerCase().includes(term)
    );
  }, [myOrders, selectedWeek, showAllWeeks, sidebarSearch]);

  const selectedOrder = useMemo(
    () =>
      myOrders.find(
        (o) => o.id === selectedOrderId || o.orderId === selectedOrderId
      ),
    [myOrders, selectedOrderId]
  );
  const selectedWikkeling = useMemo(
    () => activeWikkelingen.find((p) => p.id === selectedTrackedId),
    [activeWikkelingen, selectedTrackedId]
  );

  const handleStartProduction = async (order, lot) => {
    try {
      const timestamp = serverTimestamp();
      const cleanOrderId = String(order.orderId).trim();
      const cleanItemCode = String(order.itemCode || order.productId).trim();
      const docId = `${cleanOrderId}_${cleanItemCode}_${lot}`.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      );

      await setDoc(
        doc(db, ...PATHS.TRACKING, docId),
        {
          id: docId,
          orderId: order.orderId,
          lotNumber: lot,
          itemCode: cleanItemCode,
          machine: normalizedStationId,
          stationLabel: stationName,
          status: "In Production",
          currentStep: "Wikkelen",
          createdAt: timestamp,
          updatedAt: timestamp,
          history: [
            {
              action: "Start Wikkelen",
              station: stationName,
              timestamp: new Date().toISOString(),
              user: user?.email || "Operator",
            },
          ],
          item: order.item || "",
        }
      );

      await updateDoc(
        doc(db, ...PATHS.PLANNING, order.id),
        {
          status: "in_progress",
          activeLot: lot,
          actualStart: timestamp,
        }
      );

      setShowStartModal(false);
      if (!isNabewerking) setActiveTab("wikkelen");
    } catch (err) {
      alert("Fout: " + err.message);
    }
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
      {/* TAB NAVIGATIE & ZOEKEN */}
      {!isNabewerking && (
        <div className="p-4 bg-white border-b border-slate-200 shrink-0 shadow-sm">
          <div className="flex items-center gap-4 justify-between">
            <div className="flex bg-slate-100 p-1 rounded-2xl flex-1 max-w-xl">
              <button
                onClick={() => setActiveTab("planning")}
                className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "planning"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Planning
              </button>
              <button
                onClick={() => setActiveTab("wikkelen")}
                className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "wikkelen"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Wikkelen
              </button>
              <button
                onClick={() => setActiveTab("lossen")}
                className={`flex-1 px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "lossen"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Lossen
              </button>
            </div>
            
            <button
              onClick={() => setShowManualInput(true)}
              className="p-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
            >
              <Keyboard size={18} />
              <span className="hidden sm:inline">Zoeken</span>
            </button>
          </div>
        </div>
      )}

      {/* CONTENT AREA */}

      <div className="flex-1 overflow-hidden flex flex-col">
        {isNabewerking ? (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-white">
            <div className="w-full lg:w-1/3 border-r border-slate-100 flex flex-col bg-slate-50/40">
              <div className="p-6 border-b border-slate-100 bg-white text-left">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 text-left leading-none">
                    <Inbox size={16} className="text-blue-500" /> Wachtrij
                    Ontvangst
                  </h3>
                  <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase">
                    {activeInbound.length}
                  </span>
                </div>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Filter lotnummer..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 transition-all shadow-sm"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-left text-left">
                {activeInbound.length === 0 ? (
                  <div className="p-10 text-center flex flex-col items-center opacity-30 mt-10">
                    <Package size={48} className="text-slate-300 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-left">
                      Geen inkomende items
                    </p>
                  </div>
                ) : (
                  activeInbound
                    .filter(
                      (p) =>
                        !sidebarSearch ||
                        p.lotNumber
                          ?.toLowerCase()
                          .includes(sidebarSearch.toLowerCase())
                    )
                    .map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => setSelectedTrackedId(prod.id)}
                        className={`p-5 rounded-[25px] border-2 transition-all cursor-pointer flex items-center justify-between group ${
                          selectedTrackedId === prod.id
                            ? "bg-blue-600 border-blue-600 text-white shadow-xl translate-x-1"
                            : "bg-white border-slate-100 hover:border-blue-200"
                        }`}
                      >
                        <div className="text-left text-left">
                          <h4 className="font-black italic text-lg leading-none mb-1">
                            {prod.lotNumber}
                          </h4>
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-[10px] font-bold uppercase tracking-tighter ${
                                selectedTrackedId === prod.id
                                  ? "text-blue-100"
                                  : "text-slate-400"
                              }`}
                            >
                              Model: {prod.itemCode}
                            </p>
                            <span
                              className={`text-[9px] font-black px-1.5 rounded border ${
                                selectedTrackedId === prod.id
                                  ? "border-white/20 bg-white/10"
                                  : "border-slate-100 bg-slate-50"
                              }`}
                            >
                              {prod.lastStation || "???"}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={18}
                          className={
                            selectedTrackedId === prod.id
                              ? "text-white"
                              : "text-slate-300"
                          }
                        />
                      </div>
                    ))
                )}
              </div>
            </div>
            <div className="flex-1 bg-slate-50 overflow-y-auto custom-scrollbar p-6 lg:p-12 text-left text-left">
              {selectedTrackedId ? (
                <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="bg-slate-900 rounded-[45px] p-8 text-white shadow-2xl flex flex-col md:row justify-between items-center relative overflow-hidden text-left">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Package size={180} />
                    </div>
                    <div className="text-left flex-1">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2 text-left">
                        Actueel Dossier
                      </span>
                      <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter leading-none text-left">
                        {selectedWikkeling?.lotNumber}
                      </h2>
                    </div>
                    <div className="bg-white/10 px-6 py-3 rounded-[20px] border border-white/5 text-right">
                      <span className="text-[9px] font-black text-slate-500 uppercase block mb-1 text-left">
                        Herkomst
                      </span>
                      <span className="text-lg font-black text-emerald-400 uppercase italic tracking-widest">
                        {selectedWikkeling?.lastStation || "Onbekend"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white rounded-[45px] p-8 md:p-12 border border-slate-200 shadow-sm space-y-10 text-left text-left">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
                      <div className="space-y-6 text-left">
                        <div className="text-left">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">
                            Item Info
                          </span>
                          <p className="text-2xl font-black text-slate-800 italic uppercase leading-tight text-left">
                            {selectedWikkeling?.item}
                          </p>
                        </div>
                        <div className="p-5 bg-slate-50 rounded-3xl border-2 border-slate-100 text-left text-left">
                          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">
                            Code
                          </span>
                          <p className="text-sm font-mono font-black text-blue-700 text-left">
                            {selectedWikkeling?.itemCode}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-6 text-left text-left">
                        <div className="text-left">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left text-left text-left">
                            Gekoppelde Order
                          </span>
                          <p className="text-2xl font-black text-slate-800 italic leading-none text-left">
                            {selectedWikkeling?.orderId}
                          </p>
                        </div>
                        <StatusBadge status={selectedWikkeling?.status} />
                      </div>
                    </div>
                    <button
                      onClick={() => setProductToRelease(selectedWikkeling)}
                      className="w-full py-8 bg-slate-900 text-white rounded-[35px] font-black uppercase text-lg shadow-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-6 active:scale-95 group"
                    >
                      <ClipboardCheck size={32} /> Afronden & Vrijgeven
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                  <Inbox size={80} className="text-slate-300 mb-4" />
                  <h4 className="text-3xl font-black uppercase italic tracking-tighter">
                    Wacht op selectie
                  </h4>
                  <p className="text-sm font-medium text-slate-400">
                    Kies een lotnummer om te verwerken
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row text-left">
            {activeTab === "planning" ? (
              <>
                <div
                  className={`w-full lg:w-5/12 p-4 md:p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden text-left ${
                    selectedOrderId ? "hidden lg:flex" : "flex"
                  }`}
                >
                  <div className="relative mb-4 group text-left">
                    <Search
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="Zoek order..."
                      className="w-full pl-12 pr-10 py-4 bg-slate-50 border-2 border-slate-100 rounded-[20px] text-sm font-bold outline-none focus:border-blue-500 transition-all"
                      value={sidebarSearch}
                      onChange={(e) => setSidebarSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-2 rounded-[25px] border border-slate-100 mb-6 shrink-0 text-left">
                    <button
                      onClick={() =>
                        setReferenceDate(subWeeks(referenceDate, 1))
                      }
                      className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div className="text-center px-4 text-left">
                      <span className="text-[10px] font-black text-slate-400 uppercase block mb-0.5 text-center">
                        Week
                      </span>
                      <span className="text-xl font-black text-slate-900 italic tracking-tighter text-center">
                        {showAllWeeks || sidebarSearch
                          ? "Resultaten"
                          : selectedWeek}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setReferenceDate(addWeeks(referenceDate, 1))
                      }
                      className="p-3 bg-white rounded-2xl shadow-sm hover:text-blue-500 transition-all"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 text-left text-left">
                    {filteredOrders.length === 0 ? (
                      <div className="p-12 text-center opacity-30 italic font-bold uppercase text-xs">
                        Geen orders gevonden
                      </div>
                    ) : (
                      filteredOrders.map((order) => {
                        const produced =
                          productionProgressMap[order.orderId] || 0;
                        const total = parseInt(order.plan) || 1;
                        const isNew = isOrderNew(order);
                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrderId(order.id)}
                            className={`p-4 md:p-5 rounded-[25px] border-2 transition-all cursor-pointer flex items-center justify-between relative overflow-hidden text-left ${
                              selectedOrderId === order.id
                                ? "bg-blue-50 border-blue-500 shadow-sm"
                                : "bg-white border-slate-100 hover:border-blue-200"
                            }`}
                          >
                            {isNew && (
                              <div className="absolute top-0 left-0 px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black uppercase tracking-tighter rounded-br-lg z-10">
                                Nieuw
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-left text-left overflow-hidden">
                              <div
                                className={`p-3 rounded-2xl shrink-0 ${
                                  selectedOrderId === order.id
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-50 text-slate-400"
                                }`}
                              >
                                <FileText size={20} />
                              </div>
                              <div className="text-left text-left overflow-hidden text-left">
                                <h4 className="font-black text-sm leading-none flex items-center gap-2 text-left">
                                  {order.orderId}{" "}
                                  {isNew && (
                                    <Sparkles
                                      size={10}
                                      className="text-emerald-500"
                                    />
                                  )}
                                </h4>
                                <p className="text-[10px] font-bold text-slate-400 truncate uppercase text-left">
                                  {order.item}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0 text-right text-right">
                              <span className="text-[10px] font-black text-slate-900 block italic leading-none">
                                {produced} / {total} ST
                              </span>
                              <span
                                className={`text-[9px] uppercase tracking-tighter ${getUrgencyColor(
                                  order.deliveryDate
                                )}`}
                              >
                                {order.deliveryDate
                                  ? format(
                                      parseDateSafe(order.deliveryDate),
                                      "dd-MM"
                                    )
                                  : "--"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div
                  className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar text-left text-left ${
                    !selectedOrderId ? "hidden lg:flex" : "flex"
                  }`}
                >
                  {selectedOrder ? (
                    <div className="space-y-6 text-left text-left animate-in slide-in-from-right-4 duration-500">
                      <div className="bg-slate-900 rounded-[35px] p-6 text-white shadow-xl flex justify-between items-center relative overflow-hidden text-left text-left">
                        <button
                          onClick={() => setSelectedOrderId(null)}
                          className="lg:hidden p-2 text-white/50 mr-2"
                        >
                          <ArrowLeft size={20} />
                        </button>
                        <div className="text-left text-left flex-1">
                          <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">
                            Actueel Dossier
                          </span>
                          <h2 className="text-3xl font-black italic tracking-tighter leading-none text-left">
                            {selectedOrder.orderId}
                          </h2>
                        </div>
                        <StatusBadge status={selectedOrder.status} />
                      </div>
                      <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left text-left">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-6 text-left">
                          <div className="space-y-2 flex-1 text-left text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">
                              Omschrijving
                            </span>
                            <h3 className="text-xl font-black text-slate-800 italic uppercase leading-tight text-left">
                              {selectedOrder.item}
                            </h3>
                          </div>
                          <div className="flex gap-4">
                            <div className="bg-slate-50 px-6 py-4 rounded-3xl border border-slate-100 text-center">
                              <span className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-center">
                                Gepland
                              </span>
                              <span className="text-2xl font-black text-slate-800 italic">
                                {selectedOrder.plan} ST
                              </span>
                            </div>
                            <div className="bg-blue-50 px-6 py-4 rounded-3xl border border-blue-100 text-center">
                              <span className="text-[9px] font-black text-blue-500 uppercase block mb-1 text-center">
                                Nog doen
                              </span>
                              <span className="text-2xl font-black text-blue-600 italic">
                                {Math.max(
                                  0,
                                  parseInt(selectedOrder.plan) -
                                    (productionProgressMap[
                                      selectedOrder.orderId
                                    ] || 0)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowStartModal(true)}
                          className="w-full py-6 bg-blue-600 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-4 active:scale-95"
                        >
                          <PlayCircle size={28} /> Start Productie
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-20">
                      <FileText size={80} className="mb-6 text-slate-200" />
                      <h4 className="text-2xl font-black uppercase italic text-slate-300">
                        Selecteer een order
                      </h4>
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === "wikkelen" ? (
              <>
                <div
                  className={`w-full lg:w-5/12 p-6 bg-white border-r border-slate-100 flex flex-col overflow-hidden text-left text-left ${
                    selectedTrackedId ? "hidden lg:flex" : "flex"
                  }`}
                >
                  <div className="flex justify-between items-center mb-6 px-2 text-left text-left">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 text-left text-left">
                      <Zap size={16} className="text-orange-500" /> Actieve
                      Wikkelingen
                    </h3>
                    <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black">
                      {activeWikkelingen.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-left text-left">
                    {activeWikkelingen.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => setSelectedTrackedId(prod.id)}
                        className={`p-5 rounded-[30px] border-2 transition-all cursor-pointer flex items-center justify-between text-left ${
                          selectedTrackedId === prod.id
                            ? "bg-orange-50 border-orange-500 shadow-md"
                            : "bg-white border-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-4 text-left text-left">
                          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                            <Zap size={20} />
                          </div>
                          <div className="text-left text-left">
                            <h4 className="font-black italic leading-none mb-1">
                              {prod.lotNumber}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              Order: {prod.orderId}
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-300" />
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className={`flex-1 p-6 md:p-8 bg-slate-50 flex flex-col overflow-y-auto custom-scrollbar text-left text-left ${
                    !selectedTrackedId ? "hidden lg:flex" : "flex"
                  }`}
                >
                  {selectedWikkeling ? (
                    <div className="max-w-4xl mx-auto space-y-6 text-left text-left animate-in slide-in-from-right-4 duration-500">
                      <div className="bg-slate-900 rounded-[35px] p-6 text-white flex justify-between items-center border-4 border-orange-500/20 relative overflow-hidden shadow-xl text-left text-left text-left text-left">
                        <button
                          onClick={() => setSelectedTrackedId(null)}
                          className="lg:hidden p-2 text-white/50 mr-2"
                        >
                          <ArrowLeft size={20} />
                        </button>
                        <div className="text-left text-left flex-1">
                          <span className="text-[8px] font-black text-orange-400 uppercase block mb-1 text-left">
                            Dossier
                          </span>
                          <h2 className="text-3xl font-black italic leading-none text-left">
                            {selectedWikkeling.lotNumber}
                          </h2>
                        </div>
                        <div className="p-3 bg-orange-600 rounded-2xl shadow-lg animate-pulse">
                          <Zap size={24} />
                        </div>
                      </div>
                      <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8 text-left text-left text-left">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-2 text-left">
                              Gekoppelde Order
                            </span>
                            <p className="text-xl font-black text-slate-800 leading-none mb-2 text-left">
                              {selectedWikkeling.orderId}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase text-left">
                              {selectedWikkeling.item}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-2 text-left">
                              Model
                            </span>
                            <p className="text-sm font-mono font-bold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 text-left">
                              {selectedWikkeling.itemCode}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setProductToRelease(selectedWikkeling)}
                          className="w-full py-6 bg-slate-900 text-white rounded-[30px] font-black uppercase text-base shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95"
                        >
                          <ClipboardCheck size={28} /> Product Gereedmelden
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center">
                      <Zap size={80} className="mb-6 text-slate-200" />
                      <h4 className="text-2xl font-black uppercase italic text-slate-300">
                        Selecteer actief lot
                      </h4>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-hidden h-full">
                <LossenView stationId={stationId} appId={appId} />
              </div>
            )}
          </div>
        )}
      </div>

      {showManualInput && (
        <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden p-10 text-left text-left">
            <h3 className="text-xl font-black uppercase italic mb-6 text-left">
              Snel Zoeken
            </h3>
            <input
              autoFocus
              type="text"
              value={manualInputValue}
              onChange={(e) => setManualInputValue(e.target.value)}
              className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black text-slate-900 outline-none focus:border-blue-600 transition-all uppercase text-center"
              placeholder="NUMMER..."
            />
            <div className="flex gap-4 mt-8 text-left">
              <button
                onClick={() => setShowManualInput(false)}
                className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  setSidebarSearch(manualInputValue);
                  setShowManualInput(false);
                }}
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
          isOpen={true}
          onClose={() => setShowStartModal(false)}
          order={selectedOrder}
          stationId={stationId}
          onStart={handleStartProduction}
          existingProducts={allTracked}
        />
      )}
      {productToRelease && (
        <ProductReleaseModal
          isOpen={true}
          product={productToRelease}
          onClose={() => {
            setProductToRelease(null);
            setSelectedTrackedId(null);
          }}
          appId={appId}
        />
      )}
    </div>
  );
};

export default Terminal;
