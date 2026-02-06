import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Zap,
  CheckCircle2,
  AlertOctagon,
  FileText,
  X,
  Layers,
  List,
  Activity,
  ArrowLeft,
  Cpu,
  Users,
  Monitor,
  FileSpreadsheet,
  ClipboardList,
  TrendingUp,
  Clock,
  CalendarDays,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import GanttPlanning from "./GanttPlanning";
import { collection, query, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getISOWeek } from "date-fns";
import { PATHS } from "../../config/dbPaths";

// Helpers & Modals
import { normalizeMachine } from "../../utils/hubHelpers";
import PersonnelOccupancy from "./PersonnelOccupancy";
import StatusBadge from "./common/StatusBadge";
import StationDetailModal from "./modals/StationDetailModal";
import TerminalSelectionModal from "./modals/TerminalSelectionModal";
import TraceModal from "./modals/TraceModal";
import PlanningSidebar from "./PlanningSidebar";
import PlanningImportModal from "./modals/PlanningImportModal";

/**
 * TeamleaderHub V7.0 - Error Resilience Update
 * Fix voor wit scherm: Voegt extra checks toe voor database paden en appId.
 */
const TeamleaderHub = ({
  onBack,
  onExit,
  fixedScope = "all",
  departmentName = "Algemeen",
  allowedMachines = [],
}) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [bezetting, setBezetting] = useState([]);
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // Modals state
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalData, setModalData] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStationDetail, setSelectedStationDetail] = useState(null);
  const [showTerminalSelection, setShowTerminalSelection] = useState(false);

  useEffect(() => {
    const unsubOrders = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snap) => {
        setRawOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Planning Sync Error:", err);
        setDbError(err.code);
        setLoading(false);
      }
    );

    const unsubProds = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snap) =>
        setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Tracked Products Sync Error:", err.code)
    );

    const unsubOcc = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => setBezetting(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Occupancy Sync Error:", err.code)
    );

    const unsubConfig = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (snap) => {
        if (snap.exists()) setFactoryConfig(snap.data());
      },
      (err) => console.warn("Factory Config Sync Error:", err)
    );

    return () => {
      unsubOrders();
      unsubProds();
      unsubOcc();
      unsubConfig();
    };
  }, []);

  // Voorkom crashes door lege arrays of undefined machines
  const allowedNorms = useMemo(
    () => (allowedMachines || []).map((m) => normalizeMachine(m)),
    [allowedMachines]
  );

  useEffect(() => {
    console.log('[TeamleaderHub] fixedScope:', fixedScope);
    console.log('[TeamleaderHub] allowedMachines:', allowedMachines);
    console.log('[TeamleaderHub] allowedNorms:', allowedNorms);
  }, [fixedScope, allowedMachines, allowedNorms]);

  useEffect(() => {
    console.log('[TeamleaderHub] selectedStationDetail changed:', selectedStationDetail);
  }, [selectedStationDetail]);

  const dataStore = useMemo(() => {
    if (!rawOrders) return [];
    // Filter orders op juiste afdeling (pipes, fittings, spools)
    const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools" };
    const targetSlug = scopeMap[fixedScope.toLowerCase()] || fixedScope.toLowerCase();
    return rawOrders
      .map((o) => ({ ...o, normMachine: normalizeMachine(o.machine || "") }))
      .filter((o) => {
        // Order moet bij juiste afdeling horen
        if (o.department && typeof o.department === "string") {
          if (o.department.toLowerCase() !== targetSlug) return false;
        }
        // Machine filter
        return allowedNorms.includes(o.normMachine) || allowedNorms.length === 0;
      });
  }, [rawOrders, allowedNorms]);

  // Dashboard Data Berekening
  const metrics = useMemo(() => {
    if (loading)
      return {
        totalPlanned: 0,
        activeCount: 0,
        finishedCount: 0,
        rejectedCount: 0,
        bezettingAantal: 0,
        machineGridData: [],
      };

    const currentWeek = getISOWeek(new Date());
    const validOrderIds = new Set(dataStore.map((o) => o.orderId));

    // Get stations from factory config based on fixedScope
    let stations = [];
    if (factoryConfig && factoryConfig.departments) {
      const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools" };
      const targetSlug = scopeMap[fixedScope.toLowerCase()] || fixedScope.toLowerCase();
      console.log('[TeamleaderHub metrics] fixedScope:', fixedScope, 'targetSlug:', targetSlug);
      console.log('[TeamleaderHub metrics] departments:', factoryConfig.departments.map(d => ({ id: d.id, slug: d.slug, name: d.name })));
      
      const dept = factoryConfig.departments.find(
        (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
      );
      console.log('[TeamleaderHub metrics] found dept:', dept?.name, 'stations count:', dept?.stations?.length);
      stations = dept ? (dept.stations || []).filter(s => s.name?.toLowerCase() !== "teamleader") : [];
    }

    const machineGridData = stations.map((station) => {
      const stationName = station.name;
      const mProducts = rawProducts.filter(
        (p) => (p.machine || "").toLowerCase() === stationName.toLowerCase()
      );
      const currentOccupancy = bezetting.filter(
        (b) => (b.machineId || "").toLowerCase() === stationName.toLowerCase()
      );

      return {
        id: stationName,
        planned: dataStore
          .filter((o) => (o.machine || "").toLowerCase() === stationName.toLowerCase())
          .reduce((acc, o) => acc + Number(o.plan || 0), 0),
        finished: mProducts.filter((p) => p.status === "Finished").length,
        active: mProducts.filter((p) => p.status === "In Production").length,
        operatorCount: currentOccupancy.length,
        operatorNames: currentOccupancy.map((o) => o.operatorName).join(", "),
      };
    });

    return {
      // Totaal Plan: Som van 'plan' veld van alle orders (exclusief geannuleerd/afgekeurd), alleen juiste afdeling
      totalPlanned: dataStore
        .filter(o => {
          if (!['cancelled', 'rejected', 'REJECTED'].includes(o.status)) {
            // Alleen pipes orders meenemen
            const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools" };
            const targetSlug = scopeMap[fixedScope.toLowerCase()] || fixedScope.toLowerCase();
            if (o.department && typeof o.department === "string") {
              return o.department.toLowerCase() === targetSlug;
            }
            // Orders zonder department niet meenemen
            return false;
          }
          return false;
        })
        .reduce((acc, o) => acc + Number(o.plan || 0), 0),
      activeCount: rawProducts.filter(
        (p) => p.status === "In Production" && validOrderIds.has(p.orderId)
      ).length,
      finishedCount: rawProducts.filter(
        (p) => p.status === "Finished" && validOrderIds.has(p.orderId)
      ).length,
      rejectedCount: rawProducts.filter(
        (p) => p.status === "Rejected" && validOrderIds.has(p.orderId)
      ).length,
      bezettingAantal: bezetting.filter((b) =>
        stations.some(s => (s.name || "").toLowerCase() === (b.machineId || "").toLowerCase())
      ).length,
      machineGridData,
    };
  }, [
    loading,
    dataStore,
    rawProducts,
    bezetting,
    factoryConfig,
    fixedScope,
  ]);

  // Render Logica
  if (loading)
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Productiedata synchroniseren...
        </p>
      </div>
    );

  if (dbError)
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center">
        <AlertTriangle size={48} className="text-rose-500 mb-4" />
        <h3 className="text-xl font-black uppercase italic">
          Database Verbindingsfout
        </h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">
          De app kon geen verbinding maken met Firestore (Fout: {dbError}).
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
        >
          Opnieuw Proberen
        </button>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left w-full animate-in fade-in duration-300 overflow-hidden relative">
      {/* HEADER */}
      <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 z-40 shadow-sm px-6">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack || onExit}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-left">
            <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">
              Teamleader Hub
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
              {departmentName} Dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all"
          >
            <FileSpreadsheet size={16} /> Import
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">
        {/* TABS */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl mb-6 w-fit shrink-0">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "dashboard"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("bezetting")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "bezetting"
                ? "bg-white text-emerald-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Personeel
          </button>
          <button
            onClick={() => setActiveTab("efficiency")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "efficiency"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Efficiëntie
          </button>
          <button
            onClick={() => setActiveTab("planning")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "planning"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Volledige Lijst
          </button>
          <button
            onClick={() => setActiveTab("gantt")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "gantt"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Gantt-planning
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {activeTab === "dashboard" ? (
            <div className="h-full overflow-y-auto custom-scrollbar space-y-8 pr-2 pb-20">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[
                  {
                    id: "gepland",
                    label: "Totaal Plan",
                    val: metrics.totalPlanned,
                    icon: Layers,
                    color: "text-slate-400",
                  },
                  {
                    id: "in_proces",
                    label: "Lopend",
                    val: metrics.activeCount,
                    icon: Zap,
                    color: "text-blue-500",
                  },
                  {
                    id: "gereed",
                    label: "Gereed",
                    val: metrics.finishedCount,
                    icon: CheckCircle2,
                    color: "text-emerald-500",
                  },
                  {
                    id: "afkeur",
                    label: "Afkeur",
                    val: metrics.rejectedCount,
                    icon: AlertOctagon,
                    color: "text-rose-500",
                  },
                  {
                    id: "bezetting",
                    label: "Bezetting",
                    val: metrics.bezettingAantal,
                    icon: Users,
                    color: "text-indigo-500",
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="bg-white p-6 rounded-[35px] border-2 border-slate-100 shadow-sm text-left group hover:border-blue-200 transition-all cursor-pointer"
                    onClick={() => {
                      // Open modal met bijbehorende lijst
                      setModalTitle(item.label);
                      if (item.id === "gepland" || item.id === "in_proces" || item.id === "gereed" || item.id === "afkeur") {
                        // Orders of producten tonen afhankelijk van KPI
                        let list = [];
                        if (item.id === "gepland") {
                          list = rawOrders;
                        } else if (item.id === "in_proces") {
                          list = rawProducts.filter((p) => p.status === "In Production");
                        } else if (item.id === "gereed") {
                          list = rawProducts.filter((p) => p.status === "Finished");
                        } else if (item.id === "afkeur") {
                          list = rawProducts.filter((p) => p.status === "Rejected");
                        }
                        setModalData(list);
                        setShowTraceModal(true);
                      } else if (item.id === "bezetting") {
                        setModalData(bezetting);
                        setShowTraceModal(true);
                      }
                    }}
                  >
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <item.icon size={14} className={item.color} />{" "}
                      {item.label}
                    </p>
                    <p className="text-3xl font-black text-slate-800 italic">
                      {item.val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase italic tracking-widest ml-1">
                  Live Station Monitor
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {metrics.machineGridData.map((machine) => (
                    <div
                      key={machine.id}
                      onClick={() => {
                        setSelectedStationDetail(machine.id);
                      }}
                      className="bg-white border border-slate-200 rounded-[35px] p-6 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all cursor-pointer group relative overflow-hidden text-left"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Cpu size={80} />
                      </div>
                      <div className="text-left mb-4">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                          Station
                        </span>
                        <h4 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">
                          {machine.id}
                        </h4>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-50">
                        <div>
                          <span className="text-[8px] font-black text-slate-400 uppercase block mb-0.5">
                            Plan
                          </span>
                          <span className="text-sm font-black text-slate-700 italic">
                            {machine.planned}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black text-blue-400 uppercase block mb-0.5">
                            Actief
                          </span>
                          <span className="text-sm font-black text-blue-600 italic">
                            {machine.active}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black text-emerald-400 uppercase block mb-0.5">
                            Klaar
                          </span>
                          <span className="text-sm font-black text-emerald-600 italic">
                            {machine.finished}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === "bezetting" ? (
            <div className="h-full overflow-y-auto custom-scrollbar pb-20">
              <div className="flex items-center justify-between mb-4 px-4">
                <h2 className="text-lg font-black uppercase tracking-widest text-slate-700">Bezetting per station</h2>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs tracking-widest hover:bg-blue-700 transition-all"
                  onClick={() => {/* TODO: kopieer vorige dag functionaliteit */}}
                >
                  Kopie vorige dag
                </button>
              </div>
              <PersonnelOccupancy
                scope={fixedScope}
                machines={allowedMachines}
                editable={true}
                mode="station-grid"
              />
            </div>
          ) : activeTab === "efficiency" ? (
            <div className="h-full overflow-y-auto custom-scrollbar pb-20">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mt-8">
                {/* Totaal Beschikbare Uren */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Users className="text-slate-600" size={24} />
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                      Totaal
                    </span>
                  </div>
                  <div className="text-4xl font-black text-slate-600 mb-2">
                    {metrics.bezettingAantal}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Alle uren
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Stations</span>
                      <span className="font-bold">{metrics.machineGridData.length}</span>
                    </div>
                  </div>
                </div>

                {/* Productie-uren */}
                <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Activity className="text-emerald-600" size={24} />
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
                      Productie
                    </span>
                  </div>
                  <div className="text-4xl font-black text-emerald-600 mb-2">
                    {metrics.finishedCount}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Afgerond
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Actief</span>
                      <span className="font-bold">{metrics.activeCount}</span>
                    </div>
                  </div>
                </div>

                {/* Geplande Vraag */}
                <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <CalendarDays className="text-blue-600" size={24} />
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
                      Planning
                    </span>
                  </div>
                  <div className="text-4xl font-black text-blue-600 mb-2">
                    {metrics.totalPlanned}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Geplande uren
                  </div>
                </div>

                {/* Efficiëntie */}
                <div className={`bg-white border-2 rounded-2xl p-6 ${metrics.totalPlanned > metrics.finishedCount ? 'border-rose-200' : 'border-emerald-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    {metrics.totalPlanned > metrics.finishedCount ? (
                      <AlertTriangle className="text-rose-600" size={24} />
                    ) : (
                      <CheckCircle2 className="text-emerald-600" size={24} />
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${metrics.totalPlanned > metrics.finishedCount ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {metrics.totalPlanned > metrics.finishedCount ? 'Tekort' : 'Overschot'}
                    </span>
                  </div>
                  <div className={`text-4xl font-black mb-2 ${metrics.totalPlanned > metrics.finishedCount ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {metrics.totalPlanned > 0 ? Math.round(((metrics.finishedCount - metrics.totalPlanned) / metrics.totalPlanned) * 100) : 0}%
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    {metrics.totalPlanned > metrics.finishedCount ? 'Ondercapaciteit' : 'Overcapaciteit'}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "gantt" ? (
            <div className="h-full overflow-y-auto custom-scrollbar pb-20 flex flex-col items-center">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mt-8 mb-8 w-full">
                {/* Totaal Beschikbare Uren */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Users className="text-slate-600" size={24} />
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                      Totaal
                    </span>
                  </div>
                  <div className="text-4xl font-black text-slate-600 mb-2">
                    {metrics.bezettingAantal}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Alle uren
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Stations</span>
                      <span className="font-bold">{metrics.machineGridData.length}</span>
                    </div>
                  </div>
                </div>

                {/* Productie-uren */}
                <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Activity className="text-emerald-600" size={24} />
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
                      Productie
                    </span>
                  </div>
                  <div className="text-4xl font-black text-emerald-600 mb-2">
                    {metrics.finishedCount}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Afgerond
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Actief</span>
                      <span className="font-bold">{metrics.activeCount}</span>
                    </div>
                  </div>
                </div>

                {/* Geplande Vraag */}
                <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <CalendarDays className="text-blue-600" size={24} />
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
                      Planning
                    </span>
                  </div>
                  <div className="text-4xl font-black text-blue-600 mb-2">
                    {metrics.totalPlanned}u
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    Geplande uren
                  </div>
                </div>

                {/* Efficiëntie */}
                <div className={`bg-white border-2 rounded-2xl p-6 ${metrics.totalPlanned > metrics.finishedCount ? 'border-rose-200' : 'border-emerald-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    {metrics.totalPlanned > metrics.finishedCount ? (
                      <AlertTriangle className="text-rose-600" size={24} />
                    ) : (
                      <CheckCircle2 className="text-emerald-600" size={24} />
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${metrics.totalPlanned > metrics.finishedCount ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {metrics.totalPlanned > metrics.finishedCount ? 'Tekort' : 'Overschot'}
                    </span>
                  </div>
                  <div className={`text-4xl font-black mb-2 ${metrics.totalPlanned > metrics.finishedCount ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {metrics.totalPlanned > 0 ? Math.round(((metrics.finishedCount - metrics.totalPlanned) / metrics.totalPlanned) * 100) : 0}%
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
                    {metrics.totalPlanned > metrics.finishedCount ? 'Ondercapaciteit' : 'Overcapaciteit'}
                  </div>
                </div>
              </div>
              <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl p-8 flex flex-col items-center">
                <h2 className="text-2xl font-black text-orange-700 mb-4 uppercase tracking-widest">Gantt-planning</h2>
                <GanttPlanning />
              </div>
            </div>
          ) : (
            <div className="h-full flex gap-6 overflow-hidden">
              <div className="w-80 shrink-0 flex flex-col min-h-0">
                <PlanningSidebar
                  orders={dataStore}
                  selectedOrderId={selectedOrderId}
                  onSelect={setSelectedOrderId}
                />
              </div>
              <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-center items-center opacity-40 italic text-center">
                <ClipboardList size={64} className="mb-4 text-slate-300" />
                <p className="font-black uppercase tracking-widest text-xs text-slate-400">
                  Selecteer een order uit de lijst
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODALS (Simplified) */}
      {showImportModal && (
        <PlanningImportModal
          isOpen={true}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {selectedStationDetail && (
        <StationDetailModal
          stationId={selectedStationDetail}
          allOrders={dataStore}
          allProducts={rawProducts}
          onClose={() => setSelectedStationDetail(null)}
        />
      )}
      {/* KPI Pop-up Modal */}
      <TraceModal
        isOpen={showTraceModal}
        onClose={() => setShowTraceModal(false)}
        title={modalTitle}
        data={modalData}
        onRowClick={(item) => {
          // Toon dossier van order of product
          setModalTitle(`Dossier: ${item.lotNumber || item.orderId || item.itemCode || item.productId}`);
          setModalData([item]);
        }}
      />
    </div>
  );
};

export default TeamleaderHub;
