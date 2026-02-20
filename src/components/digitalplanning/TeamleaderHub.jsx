import React, { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ArrowLeft,
  FileSpreadsheet,
  AlertTriangle,
  ClipboardList,
  Download,
} from "lucide-react";
import { collection, query, onSnapshot, doc, writeBatch, serverTimestamp, updateDoc, where, addDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getISOWeek, format, subDays, startOfISOWeek, endOfISOWeek } from "date-fns";
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
import ProductDossierModal from "./modals/ProductDossierModal";

/**
 * TeamleaderHub V7.2 - Strict Filtering Update
 * Fix voor dubbele planning en vervuiling tussen afdelingen.
 * Gebruikt 'effectiveStations' als centrale bron van waarheid.
 */
const TeamleaderHub = React.memo(({
  onBack,
  onExit,
  fixedScope = "all",
  departmentName = "Algemeen",
  allowedMachines = [],
  title = "Teamleader Hub",
}) => {
  const { user } = useAdminAuth();
  // Debug: toon user rol en modules
  console.log("[TeamleaderHub] User:", user);
  if (user) {
    console.log("[TeamleaderHub] Rol:", user.role);
    console.log("[TeamleaderHub] Modules:", user.modules);
  }
  const [activeTab, setActiveTab] = useState("dashboard");
  const [rawProducts, setRawProducts] = useState([]);
  const [bezetting, setBezetting] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Modals state
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalData, setModalData] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [returnToTrace, setReturnToTrace] = useState(false);
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
        if (err.code === 'permission-denied') return;
        setDbError(err.code);
        setLoading(false);
      }
    );

    const unsubProds = onSnapshot(
      collection(db, ...PATHS.TRACKING),
      (snap) =>
        setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        if (err.code === 'permission-denied') return;
        console.warn("Tracked Products Sync Error:", err.code);
      }
    );

    const unsubConfig = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (snap) => {
        if (snap.exists()) setFactoryConfig(snap.data());
      },
      (err) => {
        if (err.code === 'permission-denied') return;
        console.warn("Factory Config Sync Error:", err);
      }
    );

    const now = new Date();
    const start = startOfISOWeek(now);
    const end = endOfISOWeek(now);
    const year = now.getFullYear();
    
    const unsubArchive = onSnapshot(
      query(
        collection(db, "future-factory", "production", "archive", String(year), "items"),
        where("timestamps.finished", ">=", start),
        where("timestamps.finished", "<=", end)
      ),
      (snap) => {
        setArchivedProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Archive Sync Error (Week Stats):", err.code)
    );

    return () => {
      unsubOrders();
      unsubProds();
      unsubOcc();
      unsubConfig();
      unsubArchive();
    };
  }, []);

  // 1. CENTRALE STATION LOGICA
  // Bepaal welke stations van toepassing zijn. Dit is de enige bron van waarheid.
  // Verplaats deze declaraties naar boven zodat ze overal beschikbaar zijn in de useMemo
  const safeScope = (fixedScope || "all").toLowerCase();
  const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools", pipe: "pipes" };
  const targetSlug = scopeMap[safeScope] || safeScope;
  const effectiveStations = useMemo(() => {
    // DEBUG: Toon welke afdeling en stations uit de config worden gevonden
    if (factoryConfig && factoryConfig.departments) {
      const debugDept = factoryConfig.departments.find(
        (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
      );
      console.log('[TeamleaderHub][DEBUG] fixedScope:', safeScope);
      if (debugDept) {
        console.log('[TeamleaderHub][DEBUG] Afdeling gevonden:', debugDept.name, debugDept);
        console.log('[TeamleaderHub][DEBUG] Stations in afdeling:', debugDept.stations);
      } else {
        console.log('[TeamleaderHub][DEBUG] Geen afdeling gevonden voor:', targetSlug);
      }
    }
    let stations = [];

    // Zoek de juiste afdeling (indien niet 'all')
    let deptStations = [];
    if (factoryConfig && factoryConfig.departments && safeScope !== 'all') {
      const dept = factoryConfig.departments.find(
        (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
      );
      deptStations = dept ? (dept.stations || []) : [];
    } else if (factoryConfig && factoryConfig.departments) {
      deptStations = factoryConfig.departments.flatMap(d => d.stations || []);
    }

    // A. Gebruik props als die er zijn (doorgegeven vanuit parent Hub)
    if (allowedMachines && allowedMachines.length > 0) {
      // Filter allowedMachines op alleen stations uit de juiste afdeling
      stations = allowedMachines.map(m => {
        const found = deptStations.find(s => normalizeMachine(s.name) === normalizeMachine(m));
        return found || null;
      }).filter(Boolean); // Verwijder nulls
    }
    // B. Fallback naar Factory Config op basis van scope (als props leeg zijn)
    else {
      stations = deptStations;
    }

    // C. FAILSAFE FILTERING OP NAAMCONVENTIES
    // Dit voorkomt dat configuratiefouten in de database leiden tot vervuiling in de UI
    if (safeScope === 'fittings') {
      // Fittings mag GEEN BA05, BA07, BA08, BA09 (pipes) tonen
      const excludedBA = ["BA05", "BA07", "BA08", "BA09"];
      stations = stations.filter(s => {
        const n = normalizeMachine(s.name || "");
        return !excludedBA.includes(n);
      });
    } else if (safeScope === 'pipes' || safeScope === 'pipe') {
      // Pipes mag GEEN 'BM' (Bovenloop), 'Mazak' of 'Nabewerking' bevatten
      stations = stations.filter(s => {
        const n = normalizeMachine(s.name || "");
        return !n.startsWith("BM") && !n.includes("MAZAK") && !n.includes("NABEWERK");
      });
    }

    return stations;
  }, [allowedMachines, factoryConfig, fixedScope]);

  // 2. Genereer genormaliseerde lijst voor filtering
  const effectiveAllowedNorms = useMemo(() => {
     return effectiveStations
        .map(s => normalizeMachine(s.name))
        .filter(n => n && n !== "TEAMLEADER" && n !== "ALGEMEEN");
  }, [effectiveStations]);

  useEffect(() => {
    console.log('[TeamleaderHub] fixedScope:', fixedScope);
    console.log('[TeamleaderHub] effectiveStations:', effectiveStations.length);
    console.log('[TeamleaderHub] effectiveAllowedNorms:', effectiveAllowedNorms);
  }, [fixedScope, effectiveStations, effectiveAllowedNorms]);

  const dataStore = useMemo(() => {
    if (!rawOrders) return [];
    const scopeMap = { fittings: "fittings", pipes: "pipes", spools: "spools" };
    const safeScope = (fixedScope || "all").toLowerCase();
    const targetSlug = scopeMap[safeScope] || safeScope;

    return rawOrders
      .map((o) => ({ ...o, normMachine: normalizeMachine(o.machine || "") }))
      .filter((o) => {
        // Order moet bij juiste afdeling horen
        if (targetSlug !== "all" && o.department && typeof o.department === "string") {
          if (o.department.toLowerCase() !== targetSlug) return false;
        }

        // 1. HARD EXCLUDES OP BASIS VAN SCOPE (FAILSAFE)
        // Dit voorkomt dat BA orders in Fittings verschijnen, zelfs als de config niet klopt
        if (targetSlug === 'fittings') {
            if (o.normMachine.startsWith("BA")) return false;
            // Extra failsafe: als station BA is, altijd uitsluiten
            if (o.station && normalizeMachine(o.station).startsWith("BA")) return false;
        }
        if (targetSlug === 'pipes' || targetSlug === 'pipe') {
            if (o.normMachine.startsWith("BM") || o.normMachine.includes("MAZAK") || o.normMachine.includes("NABEWERK")) return false;
            if (o.station && (normalizeMachine(o.station).startsWith("BM") || normalizeMachine(o.station).includes("MAZAK") || normalizeMachine(o.station).includes("NABEWERK"))) return false;
        }

        // Machine filter
        if (targetSlug === "all") return true;

        if (effectiveAllowedNorms.length > 0) {
          if (o.normMachine) {
            return effectiveAllowedNorms.includes(o.normMachine);
          }
          // Als order GEEN machine heeft (backlog), toon hem wel (zodat planning niet 0 is)
          return true;
        }
        // Als er geen stations bekend zijn (en scope is niet 'all'), toon niets om vervuiling te voorkomen
        return false;
      });
  }, [rawOrders, effectiveAllowedNorms, fixedScope]);

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

    // Gebruik de centraal berekende stations
    const stations = effectiveStations.filter(s => {
      const name = (s.name || "").toLowerCase();
      // Failsafe: als scope fittings is, sluit BA-machines uit
      if (safeScope === 'fittings') {
        if (name.startsWith('ba')) return false;
        // Alleen stations uit de afdeling 'fittings'
        if (s.department && s.department.toLowerCase() !== 'fittings') return false;
      }
      if (safeScope === 'pipes' || safeScope === 'pipe') {
        // Alleen stations uit de afdeling 'pipes'
        if (s.department && s.department.toLowerCase() !== 'pipes') return false;
      }
      // Voor andere scopes, filter op afdeling indien beschikbaar
      if (safeScope !== 'all' && s.department && s.department.toLowerCase() !== safeScope) return false;
      return name !== "teamleader" && name !== "algemeen";
    });

    const machineGridData = stations.map((station) => {
      const stationName = station.name;
      const stationId = station.id;

      const mProducts = rawProducts.filter(
        (p) => (p.machine || "").toLowerCase() === stationName.toLowerCase()
      );

      const mArchived = archivedProducts.filter(
        (p) => (p.machine || p.originMachine || "").toLowerCase() === stationName.toLowerCase()
      );
      
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
      
      const isDownstream = isBM01 || isNabewerking || isMazak || isLossen;

      let planned = 0;
      let active = 0;
      let finished = 0;

      if (isDownstream) {
          planned = 0;
          
          const checkActive = (p) => {
             const pStation = (p.currentStation || "").toUpperCase();
             const pStep = (p.currentStep || "").toUpperCase();
             const pStatus = (p.status || "").toUpperCase();
             
             const isActiveItem = !['COMPLETED', 'FINISHED', 'GEREED', 'REJECTED', 'AFKEUR'].includes(pStatus) && pStep !== 'FINISHED' && pStep !== 'REJECTED';
             if (!isActiveItem) return false;

             if (isBM01) return pStation.includes("BM01") || pStep.includes("INSPECTIE") || pStep === "BM01";
             if (isNabewerking) return pStation.includes("NABEWERK") || pStep.includes("NABEWERK");
             if (isMazak) return pStation.includes("MAZAK") || pStep.includes("MAZAK");
             if (isLossen) return pStation.includes("LOSSEN") || pStep.includes("LOSSEN");
             
             return false;
          };
          active = rawProducts.filter(checkActive).length;

          const checkFinished = (p) => {
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
          };
          finished = rawProducts.filter(checkFinished).length + archivedProducts.filter(checkFinished).length;
      } else if (!isAlgemeen) {
          planned = dataStore
            .filter((o) => (o.machine || "").toLowerCase() === stationName.toLowerCase())
            .reduce((acc, o) => acc + Number(o.plan || 0), 0);
          active = mProducts.filter((p) => p.status === "In Production").length;
          finished = mProducts.filter((p) => p.status === "Finished").length + mArchived.length;
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
      totalPlanned: dataStore
        .filter(o => !['cancelled', 'rejected', 'REJECTED'].includes(o.status))
        .reduce((acc, o) => acc + Number(o.plan || 0), 0),
      
      activeCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        // STRICT FILTER OP MACHINE
        if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) {
                return false;
            }
        }

        const status = p.status || "";
        const step = p.currentStep || "";
        const station = (p.currentStation || "").toUpperCase();

        const isFinished = ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        const isRejected = ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
        
        if (isFinished || isRejected) return false;
        if (station === 'BM01' || station === 'STATION BM01' || step === 'Eindinspectie') return false;

        return true;
      }).length,

      finishedCount: (() => {
        const activeFinished = rawProducts.filter((p) => {
          if (!validOrderIds.has(p.orderId)) return false;
          
          if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) return false;
          }

          const status = p.status || "";
          const step = p.currentStep || "";
          return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
        });
        const archivedFinished = archivedProducts.filter(p => validOrderIds.has(p.orderId));
        return activeFinished.length + archivedFinished.length;
      })(),

      rejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        
        if (effectiveAllowedNorms.length > 0) {
            const m1 = normalizeMachine(p.machine || "");
            const m2 = normalizeMachine(p.originMachine || "");
            const m3 = normalizeMachine(p.currentStation || "");
            if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3)) return false;
        }

        const status = p.status || "";
        const step = p.currentStep || "";
        return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      }).length,

      tempRejectedCount: rawProducts.filter((p) => {
        if (!validOrderIds.has(p.orderId)) return false;
        return p.inspection?.status === "Tijdelijke afkeur";
      }).length,

      ...(() => {
        let totalHours = 0;
        let productionHours = 0;
        let supportHours = 0;
        let weeklyTotalHours = 0;
        let weeklyProductionHours = 0;
        let weeklySupportHours = 0;

        const relevantOccupancy = bezetting.filter((b) => {
            if (!b.date) return false;
            return stations.some(s => {
               const sId = (s.id || "").toLowerCase();
               const sName = (s.name || "").toLowerCase();
               const bId = (b.machineId || "").toLowerCase();
               const bName = (b.machineName || "").toLowerCase();
               return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
            });
        });

        relevantOccupancy.forEach(b => {
            const val = b.hours ?? b.hoursWorked;
            const hours = parseFloat(val);
            const netHours = isNaN(hours) ? 8 : hours;
            
            if (b.date === todayStr) {
                totalHours += netHours;
                const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                const isBH = machineId.includes("BH");
                const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                if (isBH || isBA) {
                    productionHours += netHours;
                } else {
                    supportHours += netHours;
                }
            }

            const bDate = new Date(b.date);
            if (getISOWeek(bDate) === currentWeek) {
                weeklyTotalHours += netHours;
                const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                const isBH = machineId.includes("BH");
                const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                if (isBH || isBA) {
                    weeklyProductionHours += netHours;
                } else {
                    weeklySupportHours += netHours;
                }
            }
        });

        const efficiency = totalHours > 0 ? (productionHours / totalHours) * 100 : 0;
        const weeklyEfficiency = weeklyTotalHours > 0 ? (weeklyProductionHours / weeklyTotalHours) * 100 : 0;

        return {
            bezettingAantal: totalHours,
            productionHours,
            supportHours,
            efficiency,
            weeklyTotalHours,
            weeklyProductionHours,
            weeklySupportHours,
            weeklyEfficiency
        };
      })(),

      machineGridData,
    };
  }, [
    loading,
    dataStore,
    rawProducts,
    bezetting,
    factoryConfig,
    fixedScope,
    archivedProducts,
    effectiveAllowedNorms,
    effectiveStations
  ]);

  const handleKpiClick = (kpiId, label) => {
    setModalTitle(label);
    if (kpiId === "gepland") {
      // Zelfde filtering als dataStore, zodat alleen relevante stations/orders getoond worden
      const filteredOrders = rawOrders
        .map((o) => ({ ...o, normMachine: normalizeMachine(o.machine || "") }))
        .filter((o) => {
          if (targetSlug !== "all" && o.department && typeof o.department === "string") {
            if (o.department.toLowerCase() !== targetSlug) return false;
          }
          if (targetSlug === 'fittings') {
            if (o.normMachine.startsWith("BA")) return false;
            if (o.station && normalizeMachine(o.station).startsWith("BA")) return false;
          }
          if (targetSlug === 'pipes' || targetSlug === 'pipe') {
            if (o.normMachine.startsWith("BM") || o.normMachine.includes("MAZAK") || o.normMachine.includes("NABEWERK")) return false;
            if (o.station && (normalizeMachine(o.station).startsWith("BM") || normalizeMachine(o.station).includes("MAZAK") || normalizeMachine(o.station).includes("NABEWERK"))) return false;
          }
          if (targetSlug === "all") return true;
          if (effectiveAllowedNorms.length > 0) {
            if (o.normMachine) {
              return effectiveAllowedNorms.includes(o.normMachine);
            }
            return true;
          }
          return false;
        });
      setModalData(filteredOrders);
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
      const activeList = rawProducts.filter((p) => {
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Finished', 'completed', 'GEREED'].includes(status) || step === 'Finished';
      });
      const validOrderIds = new Set(dataStore.map((o) => o.orderId));
      const archivedList = archivedProducts.filter(p => validOrderIds.has(p.orderId));
      const combined = [...activeList, ...archivedList];
      setModalData(combined);
      setShowTraceModal(true);
    } else if (kpiId === "afkeur") {
      const list = rawProducts.filter((p) => {
         const status = p.status || "";
         const step = p.currentStep || "";
         return ['Rejected', 'rejected', 'AFKEUR'].includes(status) || step === 'REJECTED';
      });
      setModalData(list);
      setShowTraceModal(true);
    } else if (kpiId === "tijdelijke_afkeur" || kpiId === "temp_rejected" || kpiId === "tijdelijke afkeur" || kpiId === "tijdelijk_afkeur") {
      const list = rawProducts
        .filter((p) => p.inspection?.status === "Tijdelijke afkeur")
        .sort((a, b) => new Date(a.inspection?.timestamp || 0) - new Date(b.inspection?.timestamp || 0));
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

  const handleExport = () => {
    if (dataStore.length === 0) {
      alert("Geen data om te exporteren.");
      return;
    }
    const headers = ["Order", "Item", "Item Code", "Machine", "Plan", "Gereed", "Status", "Datum", "Afdeling"];
    const rows = dataStore.map(o => {
      const dateStr = o.dateObj ? format(o.dateObj, "yyyy-MM-dd") : "";
      return [
        o.orderId || "",
        `"${(o.item || "").replace(/"/g, '""')}"`,
        o.itemCode || "",
        o.machine || "",
        o.plan || 0,
        o.finishValue || 0,
        o.status || "",
        dateStr,
        o.department || ""
      ];
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `teamleader_export_${fixedScope}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyYesterday = async (targetDeptId) => {
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const yesterdayData = bezetting.filter(
      (o) => o.date === yesterdayStr && o.operatorNumber && o.departmentId === targetDeptId
    );

    if (yesterdayData.length === 0) {
      alert("Geen bezetting van gisteren gevonden voor deze afdeling.");
      return;
    }
    if (!window.confirm(`Wil je ${yesterdayData.length} toewijzingen van gisteren kopiëren naar vandaag?`)) return;

    setIsCopying(true);
    try {
      const batch = writeBatch(db);
      yesterdayData.forEach((old) => {
        const newId = `${todayStr}_${old.departmentId}_${old.machineId}_${old.operatorNumber}`.replace(/[^a-zA-Z0-9]/g, "_");
        const newRef = doc(db, ...PATHS.OCCUPANCY, newId);
        batch.set(newRef, { ...old, id: newId, date: todayStr, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Fout bij kopiëren:", err);
      alert("Fout bij kopiëren: " + err.message);
    } finally {
      setIsCopying(false);
    }
  };

  const handleClearToday = async (targetDeptId) => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayData = bezetting.filter(
      (o) => o.date === todayStr && o.departmentId === targetDeptId
    );

    if (todayData.length === 0) {
      alert("Geen bezetting gevonden voor vandaag om te wissen.");
      return;
    }
    if (!window.confirm(`Weet je zeker dat je de bezetting van VANDAAG (${todayData.length} items) voor deze afdeling wilt wissen?`)) return;

    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      todayData.forEach((docItem) => {
        const ref = doc(db, ...PATHS.OCCUPANCY, docItem.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("Fout bij wissen:", err);
      alert("Fout bij wissen: " + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleMoveLot = async (lotNumber, newStation) => {
    if (!lotNumber || !newStation) return;
    try {
      const productRef = doc(db, ...PATHS.TRACKING, lotNumber);
      await updateDoc(productRef, {
        currentStation: newStation,
        isManualMove: true,
        status: "in_progress",
        updatedAt: serverTimestamp(),
        note: `Handmatig verplaatst naar ${newStation} door ${user?.email || 'Teamleader'}`
      });
      alert(`Product ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err) {
      console.error("Fout bij verplaatsen:", err);
      alert("Fout bij verplaatsen: " + err.message);
    }
  };

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
        <h3 className="text-xl font-black uppercase italic">Database Verbindingsfout</h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">De app kon geen verbinding maken met Firestore (Fout: {dbError}).</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">
          Opnieuw Proberen
        </button>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left w-full animate-in fade-in duration-300 overflow-hidden relative">
      <div className="bg-white border-b border-slate-200 shrink-0 z-40 shadow-sm px-6 py-3">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-6 w-full xl:w-auto">
            <button onClick={onBack || onExit} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90 shrink-0">
              <ArrowLeft size={24} />
            </button>
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none whitespace-nowrap">{title}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate">{departmentName} Dashboard</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar w-full xl:w-auto justify-start xl:justify-center">
            <button onClick={() => setActiveTab("dashboard")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "dashboard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Dashboard</button>
            <button onClick={() => setActiveTab("planning")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Volledige Lijst</button>
            <button onClick={() => setActiveTab("bezetting")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "bezetting" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Personeel</button>
            <button onClick={() => setActiveTab("efficiency")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "efficiency" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Efficiëntie</button>
            <button onClick={() => setActiveTab("gantt")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === "gantt" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Gantt-planning</button>
          </div>

          <div className="flex items-center gap-3 w-full xl:w-auto justify-end">
            <button onClick={handleExport} className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl shadow-sm hover:bg-slate-50 transition-all" title="Exporteer CSV"><Download size={20} /></button>
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"><FileSpreadsheet size={16} /> <span className="hidden sm:inline">Import</span></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {activeTab === "dashboard" ? (
            <TeamleaderDashboard metrics={metrics} onKpiClick={handleKpiClick} onStationSelect={setSelectedStationDetail} />
          ) : activeTab === "bezetting" ? (
            <PersonnelOccupancyView scope={fixedScope} onCopyYesterday={handleCopyYesterday} isCopying={isCopying} onClearToday={handleClearToday} isClearing={isClearing} />
          ) : activeTab === "efficiency" ? (
            <TeamleaderEfficiencyView departmentName={departmentName} />
          ) : activeTab === "gantt" ? (
            <TeamleaderGanttView metrics={metrics} />
          ) : (
            <div className="h-full flex gap-6 overflow-hidden">
              <div className="w-80 shrink-0 flex flex-col min-h-0">
                <PlanningSidebar orders={dataStore} selectedOrderId={selectedOrderId} onSelect={setSelectedOrderId} />
              </div>
              <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                {selectedOrder ? (
                  <OrderDetail order={selectedOrder} products={rawProducts} onClose={() => setSelectedOrderId(null)} isManager={true} onMoveLot={handleMoveLot} onOpenDossier={setViewingDossier} showAllStations={true} />
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
                    <ClipboardList size={64} className="mb-4 text-slate-300" />
                    <p className="font-black uppercase tracking-widest text-xs text-slate-400">Selecteer een order uit de lijst</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showImportModal && <PlanningImportModal isOpen={true} onClose={() => setShowImportModal(false)} />}
      {selectedStationDetail && <StationDetailModal stationId={selectedStationDetail} allOrders={dataStore} allProducts={rawProducts} onClose={() => setSelectedStationDetail(null)} />}
      <TraceModal isOpen={showTraceModal} onClose={() => { setShowTraceModal(false); setReturnToTrace(false); }} title={modalTitle} data={modalData} onRowClick={(item) => { setShowTraceModal(false); setViewingDossier(item); setReturnToTrace(true); }} />
      {viewingDossier && <ProductDossierModal isOpen={true} product={viewingDossier} onClose={() => { setViewingDossier(null); if (returnToTrace) setShowTraceModal(true); }} orders={rawOrders} onMoveLot={handleMoveLot} />}
    </div>
  );
});

export default TeamleaderHub;
