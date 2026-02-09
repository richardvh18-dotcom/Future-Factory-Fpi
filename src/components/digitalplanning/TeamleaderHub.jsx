import React, { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ArrowLeft,
  FileSpreadsheet,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { collection, query, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getISOWeek, format } from "date-fns";
import { PATHS } from "../../config/dbPaths";

// Helpers & Modals
import { normalizeMachine } from "../../utils/hubHelpers";
import StationDetailModal from "./modals/StationDetailModal";
import TraceModal from "./modals/TraceModal";
import PlanningImportModal from "./modals/PlanningImportModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import TeamleaderDashboard from "../teamleader/TeamleaderDashboard";
import TeamleaderGanttView from "../teamleader/TeamleaderGanttView";
import TeamleaderEfficiencyView from "../teamleader/TeamleaderEfficiencyView";
import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView";
import PlanningSidebar from "./PlanningSidebar";
import OrderDetail from "./OrderDetail";

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
  const { user } = useAdminAuth();
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

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return dataStore.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId);
  }, [dataStore, selectedOrderId]);

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
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const validOrderIds = new Set(dataStore.map((o) => o.orderId));

    // Get stations from factory config based on fixedScope
    let stations = [];
    if (factoryConfig && factoryConfig.departments) {
      if (!fixedScope || fixedScope === 'all') {
         // Als geen scope, pak alle stations van alle afdelingen
         stations = factoryConfig.departments.flatMap(d => d.stations || []);
      } else {
          const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools" };
          const targetSlug = scopeMap[fixedScope.toLowerCase()] || fixedScope.toLowerCase();
          
          const dept = factoryConfig.departments.find(
            (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
          );
          stations = dept ? (dept.stations || []) : [];
      }
      // Filter teamleader stations eruit voor de KPI's
      stations = stations.filter(s => {
        const name = (s.name || "").toLowerCase();
        return name !== "teamleader" && name !== "algemeen";
      });
    }

    const machineGridData = stations.map((station) => {
      const stationName = station.name;
      const stationId = station.id;

      const mProducts = rawProducts.filter(
        (p) => (p.machine || "").toLowerCase() === stationName.toLowerCase()
      );
      
      // Verbeterde matching voor occupancy (ID of Naam)
      const currentOccupancy = bezetting.filter((b) => {
          if (b.date !== todayStr) return false;
          const bId = (b.machineId || "").toLowerCase();
          const bName = (b.machineName || "").toLowerCase();
          const sId = (stationId || "").toLowerCase();
          const sName = (stationName || "").toLowerCase();
          
          return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
      });

      const nameUpper = stationName.toUpperCase();
      const isBM01 = nameUpper.includes("BM01");
      const isNabewerking = nameUpper.includes("NABEWERK");
      const isMazak = nameUpper.includes("MAZAK");
      const isLossen = nameUpper.includes("LOSSEN");
      const isAlgemeen = nameUpper.includes("ALGEMEEN");
      
      // Groepeer stations die geen 'Plan' hebben maar 'Aanbod'
      const isDownstream = isBM01 || isNabewerking || isMazak || isLossen;

      let planned = 0;
      let active = 0;
      let finished = 0;

      if (isDownstream) {
          planned = 0;
          
          // Downstream Actief: Items die wachten op dit station (Aanbod)
          active = rawProducts.filter(p => {
             const pStation = (p.currentStation || "").toUpperCase();
             const pStep = (p.currentStep || "").toUpperCase();
             const pStatus = (p.status || "").toUpperCase();
             
             // Check of item actief is
             const isActiveItem = !['COMPLETED', 'FINISHED', 'GEREED', 'REJECTED', 'AFKEUR'].includes(pStatus) && pStep !== 'FINISHED' && pStep !== 'REJECTED';
             if (!isActiveItem) return false;

             if (isBM01) return pStation.includes("BM01") || pStep.includes("INSPECTIE") || pStep === "BM01";
             if (isNabewerking) return pStation.includes("NABEWERK") || pStep.includes("NABEWERK");
             if (isMazak) return pStation.includes("MAZAK") || pStep.includes("MAZAK");
             if (isLossen) return pStation.includes("LOSSEN") || pStep.includes("LOSSEN");
             
             return false;
          }).length;

          // Downstream Klaar: Items die verwerkt zijn door dit station
          finished = rawProducts.filter(p => {
             const pStatus = (p.status || "").toUpperCase();
             const pStep = (p.currentStep || "").toUpperCase();
             const isFinishedItem = ['COMPLETED', 'FINISHED', 'GEREED'].includes(pStatus) || pStep === 'FINISHED';
             if (!isFinishedItem) return false;

             const lastStation = (p.lastStation || "").toUpperCase();
             if (isBM01) return lastStation.includes("BM01");
             if (isNabewerking) return lastStation.includes("NABEWERK");
             if (isMazak) return lastStation.includes("MAZAK");
             if (isLossen) return lastStation.includes("LOSSEN");
             return false;
          }).length;
      } else if (!isAlgemeen) {
          // Standaard Productie Machines (niet Algemeen)
          planned = dataStore
            .filter((o) => (o.machine || "").toLowerCase() === stationName.toLowerCase())
            .reduce((acc, o) => acc + Number(o.plan || 0), 0);
          active = mProducts.filter((p) => p.status === "In Production").length;
          finished = mProducts.filter((p) => p.status === "Finished").length;
      }

      return {
        id: stationName,
        planned,
        finished,
        active,
        operatorCount: currentOccupancy.length,
        operatorNames: currentOccupancy.map((o) => o.operatorName).join(", "),
        isDownstream,
        isAlgemeen
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
<<<<<<< HEAD
      // AANGEPAST: Active Count (Lopend)
      // Telt alles wat niet klaar/afgekeurd is, en nog niet bij BM01 is.
      activeCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        const status = p.status || "";
        const step = p.currentStep || "";
        const station = (p.currentStation || "").toUpperCase();

        const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
        
        if (isFinished || isRejected) return false;

        // Excludeer items die fysiek op BM01/Eindinspectie zijn (grensgeval)
        if (station === 'BM01' || station === 'STATION BM01' || step === 'Eindinspectie') return false;

        return true;
      }).length,

      finishedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
      }).length,

      rejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      }).length,

      // AANGEPAST: Nu som van uren van VANDAAG
      bezettingAantal: bezetting.filter((b) => {
          if (b.date !== todayStr) return false;
          
          // Check of deze occupancy bij een van onze stations hoort
          return stations.some(s => {
             const sId = (s.id || "").toLowerCase();
             const sName = (s.name || "").toLowerCase();
             const bId = (b.machineId || "").toLowerCase();
             const bName = (b.machineName || "").toLowerCase();
             return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
          });
        }).reduce((sum, b) => {
            const val = b.hours ?? b.hoursWorked;
            const parsed = parseFloat(val);
            return sum + (isNaN(parsed) ? 8 : parsed);
        }, 0),
=======
      
      // AANGEPAST: Active Count (Lopend)
      // Telt alles wat niet klaar/afgekeurd is, en nog niet bij BM01 is.
      activeCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        const status = p.status || "";
        const step = p.currentStep || "";
        const station = (p.currentStation || "").toUpperCase();

        const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
        
        if (isFinished || isRejected) return false;

        // Excludeer items die fysiek op BM01/Eindinspectie zijn (grensgeval)
        if (station === 'BM01' || station === 'STATION BM01' || step === 'Eindinspectie') return false;

        return true;
      }).length,

      finishedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
      }).length,

      rejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      }).length,

      // AANGEPAST: Nu som van uren van VANDAAG
      bezettingAantal: bezetting.filter((b) => {
          if (b.date !== todayStr) return false;
          
          // Check of deze occupancy bij een van onze stations hoort
          return stations.some(s => {
             const sId = (s.id || "").toLowerCase();
             const sName = (s.name || "").toLowerCase();
             const bId = (b.machineId || "").toLowerCase();
             const bName = (b.machineName || "").toLowerCase();
             return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
          });
        }).reduce((sum, b) => {
            const val = b.hours ?? b.hoursWorked;
            const parsed = parseFloat(val);
            return sum + (isNaN(parsed) ? 8 : parsed);
        }, 0),
>>>>>>> preview
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

  // Handler voor KPI tegels (opent trace modal met juiste data)
  const handleKpiClick = (kpiId, label) => {
    setModalTitle(label);
    
    if (kpiId === "gepland") {
      setModalData(rawOrders);
      setShowTraceModal(true);
    } else if (kpiId === "in_proces") {
      const list = rawProducts.filter((p) => {
         const status = p.status || "";
         const step = p.currentStep || "";
         const station = (p.currentStation || "").toUpperCase();
         const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
         const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
         const isAtBM01 = (station === 'BM01' || station === 'STATION BM01' || step === 'Eindinspectie');
         return !isFinished && !isRejected && !isAtBM01;
      });
      setModalData(list);
      setShowTraceModal(true);
    } else if (kpiId === "gereed") {
      const list = rawProducts.filter((p) => {
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
      });
      setModalData(list);
      setShowTraceModal(true);
    } else if (kpiId === "afkeur") {
      const list = rawProducts.filter((p) => {
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      });
      setModalData(list);
      setShowTraceModal(true);
    } else if (kpiId === "bezetting") {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayData = bezetting
        .filter(b => b.date === todayStr)
        .map(b => ({
          ...b,
          lotNumber: b.operatorName,
          orderId: b.machineName || b.machineId,
          item: `${b.hours || 8} uur`,
          status: b.shift || "N/A"
        }));
      setModalData(todayData);
      setShowTraceModal(true);
    }
  };

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
      {/* HEADER MET GEINTEGREERDE TABS */}
      <div className="bg-white border-b border-slate-200 shrink-0 z-40 shadow-sm px-6 py-3">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
          
          {/* Links: Titel & Back */}
          <div className="flex items-center gap-6 w-full xl:w-auto">
            <button
              onClick={onBack || onExit}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90 shrink-0"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none whitespace-nowrap">
                Teamleader Hub
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate">
                {departmentName} Dashboard
              </p>
            </div>
          </div>

          {/* Midden: Tabs (Scrollable op mobiel) */}
          <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar w-full xl:w-auto justify-start xl:justify-center">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === "dashboard"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("planning")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === "planning"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Volledige Lijst
            </button>
            <button
              onClick={() => setActiveTab("bezetting")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === "bezetting"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Personeel
            </button>
            <button
              onClick={() => setActiveTab("efficiency")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === "efficiency"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Efficiëntie
            </button>
            <button
              onClick={() => setActiveTab("gantt")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === "gantt"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Gantt-planning
            </button>
          </div>

          {/* Rechts: Acties */}
          <div className="flex items-center gap-3 w-full xl:w-auto justify-end">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"
            >
              <FileSpreadsheet size={16} /> <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">

        <div className="flex-1 overflow-hidden relative">
          {activeTab === "dashboard" ? (
            <TeamleaderDashboard 
              metrics={metrics}
              onKpiClick={handleKpiClick}
              onStationSelect={setSelectedStationDetail}
            />
          ) : activeTab === "bezetting" ? (
            <PersonnelOccupancyView scope={fixedScope} />
          ) : activeTab === "efficiency" ? (
            <TeamleaderEfficiencyView departmentName={departmentName} />
          ) : activeTab === "gantt" ? (
            <TeamleaderGanttView metrics={metrics} />
          ) : (
            <div className="h-full flex gap-6 overflow-hidden">
              <div className="w-80 shrink-0 flex flex-col min-h-0">
                <PlanningSidebar
                  orders={dataStore}
                  selectedOrderId={selectedOrderId}
                  onSelect={setSelectedOrderId}
                />
              </div>
              <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                {selectedOrder ? (
                  <OrderDetail
                    order={selectedOrder}
                    products={rawProducts}
                    onClose={() => setSelectedOrderId(null)}
                    isManager={true}
                    showAllStations={true}
                  />
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
                    <ClipboardList size={64} className="mb-4 text-slate-300" />
                    <p className="font-black uppercase tracking-widest text-xs text-slate-400">
                      Selecteer een order uit de lijst
                    </p>
                  </div>
                )}
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
