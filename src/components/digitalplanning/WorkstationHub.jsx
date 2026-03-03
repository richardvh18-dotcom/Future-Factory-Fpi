import { collection, query, onSnapshot, doc, serverTimestamp, updateDoc, where, addDoc, limit, getDocs, deleteDoc, getDoc, setDoc, arrayUnion, increment } from "firebase/firestore";
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Clock, Calendar } from "lucide-react";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getAuth } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";

import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
  getNextFlowState,
  getStepForStation,
} from "../../utils/workstationLogic";
import { normalizeMachine } from "../../utils/hubHelpers";
import ActiveProductionView from "./views/ActiveProductionView";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";

import Terminal from "./Terminal";
import LossenView from "./LossenView";
import ProductDetailModal from "../products/ProductDetailModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import OperatorLinkModal from "./modals/OperatorLinkModal";
import BM01Hub from "./BM01Hub";
import RepairModal from "./modals/RepairModal";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

// Helper om diameter uit item omschrijving te halen (het eerste getal is de diameter)
const getDiameter = (str) => {
  if (!str) return 0;
  const match = str.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
};

const WorkstationHub = ({ initialStationId, onExit, searchOrder }) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAdminAuth();
  const { showSuccess, showError, showInfo, showWarning } = useNotifications();
  const navigate = useNavigate();

  const [selectedStation, setSelectedStation] = useState(
    (typeof initialStationId === 'object' ? initialStationId.name : initialStationId) || "BH11"
  );
  const [activeTab, setActiveTab] = useState("terminal");
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilterOrder] = useState(searchOrder || null);
  const [archivedStats, setArchivedStats] = useState({ done: 0 });
  
  // Huidige datum/tijd voor display
  const currentDate = new Date();
  const currentWeekInfo = getISOWeekInfo(currentDate);

  // Mobiel menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals & Selecties
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [linkedProductData, setLinkedProductData] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [orderToLink, setOrderToLink] = useState(null);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [itemToFinish, setItemToFinish] = useState(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [itemToRepair, setItemToRepair] = useState(null);

  const currentAppId = getAppId();
  const isPostProcessing = [
    "mazak",
    "nabewerking",
    "nabewerken",
    "bm01",
    "station bm01",
  ].includes((selectedStation || "").toLowerCase());

  const isBM01 = (selectedStation || "").toUpperCase().replace(/\s/g, "") === "BM01" || (selectedStation || "").toUpperCase().includes("BM01");

  // Initiele Tab en Station Setup
  useEffect(() => {
    if (initialStationId) {
      const stationName = typeof initialStationId === 'object' ? initialStationId.name : initialStationId;
      setSelectedStation(stationName);
      if (
        ["Mazak", "Nabewerking"].includes(stationName)
      ) {
        setActiveTab("winding");
      } else {
        setActiveTab("terminal");
      }
    }
  }, [initialStationId]);

  // Als searchOrder is meegegeven, zoek en select die order
  useEffect(() => {
    if (searchFilterOrder && rawOrders.length > 0) {
      console.log(`🔍 WorkstationHub: Zoeken naar order ${searchFilterOrder}`);
      const foundOrder = rawOrders.find(order => 
        order.orderId === searchFilterOrder || order.id === searchFilterOrder
      );
      
      if (foundOrder) {
        console.log(`✅ Order gevonden:`, foundOrder);
        setSelectedOrder(foundOrder);
        setActiveTab("terminal"); // Toon de orders tab
        showInfo(t("digitalplanning.workstation.order_loaded", { order: searchFilterOrder }));
      } else {
        console.log(`⚠️ Order ${searchFilterOrder} niet gevonden in planning`);
        showWarning(t("digitalplanning.workstation.order_not_found", { order: searchFilterOrder }));
      }
    }
  }, [searchFilterOrder, rawOrders]);

  // Data Fetching
  useEffect(() => {
    if (!currentUser) return;
    
    // Prevent fetching if user is guest (no permissions)
    if (!currentUser.role || currentUser.role === 'guest') {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const unsubs = [];
    const initData = async () => {
      const auth = getAuth();
      // 1. Wacht op Auth
      if (!auth.currentUser && currentUser) {
        await new Promise(resolve => {
          const unsubscribe = auth.onAuthStateChanged(() => {
            unsubscribe();
            resolve();
          });
        });
      }
      // 2. Forceer refresh & wacht (Fix voor permission-denied)
      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          await new Promise(r => setTimeout(r, 500));
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) { 
          console.warn("Token refresh warning:", e); 
        }
      }
      if (!isMounted) return;
      setLoading(true);
      const ordersRef = collection(db, ...PATHS.PLANNING);
      const unsubOrders = onSnapshot(query(ordersRef, limit(50)), (snap) => {
        const loadedOrders = snap.docs.map((doc) => {
          const data = doc.data();
          let dateObj = data.plannedDate?.toDate
            ? data.plannedDate.toDate()
            : new Date();
          let { week, year } = getISOWeekInfo(dateObj);
          return {
            id: doc.id,
            ...data,
            orderId: data.orderId || data.orderNumber || doc.id,
            item: data.item || data.productCode || t("digitalplanning.workstation.unknown_item"),
            plan: data.plan || data.quantity || 0,
            dateObj: dateObj,
            weekNumber: parseInt(data.week || data.weekNumber || week),
            weekYear: parseInt(data.year || year),
          };
        });
        if (isMounted) setRawOrders(loadedOrders);
        setLoading(false);
      }, (error) => {
        if (!isMounted) return;
        console.error("Orders sync error:", error);
        setLoading(false);
      });
      unsubs.push(unsubOrders);
      const unsubProds = onSnapshot(
        query(collection(db, ...PATHS.TRACKING), limit(50)),
        (snap) => {
          if (isMounted) setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => console.warn("Tracking Sync Error:", error)
      );
      unsubs.push(unsubProds);
      // Occupancy data ophalen
      const unsubOccupancy = onSnapshot(
        query(collection(db, ...PATHS.OCCUPANCY), limit(50)),
        (snap) => {
          if (isMounted) setOccupancy(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => console.warn("Occupancy Sync Error:", error)
      );
      unsubs.push(unsubOccupancy);
      // Personnel data ophalen
      const unsubPersonnel = onSnapshot(
        query(collection(db, ...PATHS.PERSONNEL), limit(50)),
        (snap) => {
          if (isMounted) setPersonnel(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => console.warn("Personnel Sync Error:", error)
      );
      unsubs.push(unsubPersonnel);
    };
    initData();
    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
    };
  }, [currentUser]);

  // Fetch archive stats for BM01 (Today)
  useEffect(() => {
      if (!isBM01) return;
      
      const today = new Date();
      today.setHours(0,0,0,0);
      const year = today.getFullYear();
      
      const q = query(
          collection(db, "future-factory", "production", "archive", String(year), "items"),
          where("timestamps.finished", ">=", today)
      );
      
      const unsub = onSnapshot(q, (snap) => {
          setArchivedStats({ done: snap.size });
      }, (error) => console.warn("Archive Sync Error:", error));
      
      return () => unsub();
  }, [isBM01]);

  // Reminder Logic
  useEffect(() => {
    const checkAndSendReminders = async () => {
      if (!rawProducts.length) return;

      const overdueItems = rawProducts.filter((p) => {
        const pMachine = String(p.originMachine || p.currentStation || "");
        const currentStationNorm = normalizeMachine(selectedStation);
        const pMachineNorm = normalizeMachine(pMachine);

        const isHere =
          p.currentStation === selectedStation ||
          pMachineNorm === currentStationNorm;
        if (!isHere) return false;

        const isTempReject = p.inspection?.status === "Tijdelijke afkeur";
        const isOverdue =
          isTempReject && isInspectionOverdue(p.inspection?.timestamp);
        const alreadySent = p.reminderSent === true;

        return isOverdue && !alreadySent;
      });

      for (const item of overdueItems) {
        try {
          await addDoc(
            collection(db, ...PATHS.MESSAGES),
            {
              title: t("digitalplanning.workstation.reminder_title"),
              message: t("digitalplanning.workstation.reminder_message", { lot: item.lotNumber, station: selectedStation }),
              type: "alert",
              status: "unread",
              read: false,
              createdAt: serverTimestamp(),
              source: "WorkstationHub",
              relatedLot: item.lotNumber,
            }
          );

          const productRef = doc(
            db,
            ...PATHS.TRACKING,
            item.id || item.lotNumber
          );
          await updateDoc(productRef, {
            reminderSent: true,
            reminderSentAt: serverTimestamp(),
          });
        } catch (err) {
          console.error(t("digitalplanning.workstation.reminder_error"), err);
        }
      }
    };
    const timer = setTimeout(checkAndSendReminders, 2000);
    return () => clearTimeout(timer);
  }, [rawProducts, selectedStation]);

  // Huidige operator voor dit werkstation berekenen  // Shift color helper
  const getShiftColor = (shiftLabel) => {
    const label = (shiftLabel || "").toUpperCase();
    if (label.includes(t("digitalplanning.workstation.shift_morning_label").toUpperCase()) || label.includes("MORNING") || label.includes("EARLY")) {
      return "bg-amber-100 text-amber-800 border-amber-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_evening_label").toUpperCase()) || label.includes("EVENING") || label.includes("LATE")) {
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_night_label").toUpperCase()) || label.includes("NIGHT")) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    }
    if (label.includes(t("digitalplanning.workstation.shift_day_label").toUpperCase()) || label === t("digitalplanning.workstation.shift_daydienst_label").toUpperCase()) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    return "bg-slate-100 text-slate-800 border-slate-300";
  };

  // Helper om te checken of een shift momenteel actief is
  const isShiftActive = (shiftLabel) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // tijd in minuten sinds middernacht
    
    const label = (shiftLabel || "").toUpperCase();
    
    // Ochtend: 05:30 - 14:00
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      const startTime = 5 * 60 + 30; // 05:30
      const endTime = 14 * 60; // 14:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Avond: 14:00 - 22:30
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      const startTime = 14 * 60; // 14:00
      const endTime = 22 * 60 + 30; // 22:30
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Nacht: 22:30 - 05:30 (over middernacht heen)
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      const startTime = 22 * 60 + 30; // 22:30
      const endTime = 5 * 60 + 30; // 05:30
      return currentTime >= startTime || currentTime < endTime;
    }
    
    // Dag: 07:15 - 16:00
    if (label.includes("DAG") || label === "DAGDIENST") {
      const startTime = 7 * 60 + 15; // 07:15
      const endTime = 16 * 60; // 16:00
      return currentTime >= startTime && currentTime < endTime;
    }
    
    // Standaard: altijd tonen als shift niet herkend wordt
    return true;
  };
  // Alle operators voor dit station vandaag - ALLEEN DIE NU AAN HET WERK ZIJN
  const stationOccupancy = useMemo(() => {
    if (!selectedStation || occupancy.length === 0 || personnel.length === 0) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const normalizedStation = normalizeMachine(selectedStation);
    
    return occupancy
      .filter((occ) => {
        if (normalizeMachine(occ.machineId || occ.station) !== normalizedStation) return false;
        if (!occ.date) return false;
        
        const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
        occDate.setHours(0, 0, 0, 0);
        
        if (occDate.getTime() !== today.getTime()) return false;
        
        // FILTER: Alleen tonen als de shift momenteel actief is
        return isShiftActive(occ.shift);
      })
      .map(occ => {
        const operator = personnel.find(p => p.id === occ.operatorNumber || p.employeeNumber === occ.operatorNumber);
        return {
          ...occ,
          operatorName: occ.operatorName || operator?.name || `Operator ${occ.operatorNumber}`,
          shift: occ.shift || "DAGDIENST"
        };
      });
  }, [selectedStation, occupancy, personnel]);

  // NIEUW: Rotatie logica voor operators (elke 10s wisselen)
  const [currentOperatorIndex, setCurrentOperatorIndex] = useState(0);

  useEffect(() => {
    if (stationOccupancy.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentOperatorIndex((prev) => (prev + 1) % stationOccupancy.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [stationOccupancy.length]);

  // Reset index bij verandering van lijst (bijv. station wissel)
  useEffect(() => setCurrentOperatorIndex(0), [stationOccupancy]);

  // Bereken Derived Data (Memoized)
  const stationOrders = useMemo(() => {
    if (!selectedStation) return [];
    if (selectedStation === "BM01" || selectedStation === "Station BM01")
      return rawOrders;

    const currentStationNorm = normalizeMachine(selectedStation);
    const stationField = `started_${selectedStation.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    const orderStats = {};
    rawProducts.forEach((p) => {
      if (!p.orderId) return;
      if (p.status === "rejected" || p.currentStep === "REJECTED") return;

      if (!orderStats[p.orderId])
        orderStats[p.orderId] = { started: 0, finished: 0 };
      orderStats[p.orderId].started++;
      
      // FIX: 'Lossen' verwijderd uit active steps. Zodra een item op 'Lossen' staat, is het klaar voor de machine.
      const activeMachineSteps = ["Wikkelen", "HOLD_AREA"];
      const isFinishedForMachine = !activeMachineSteps.includes(p.currentStep) || p.currentStep === "Finished" || p.status === "completed";
      if (isFinishedForMachine) orderStats[p.orderId].finished++;
    });

    return rawOrders
      .filter((o) => {
        if (o.status === "cancelled") return false;
        const orderMachineNorm = normalizeMachine(o.machine);
        return (
          o.machine === selectedStation ||
          orderMachineNorm === currentStationNorm
        );
      })
      .map((o) => {
        const stats = orderStats[o.orderId] || { started: 0, finished: 0 };
        const startedAtStation = o[stationField] || 0;
        const remainingAtStation = Math.max(0, Number(o.plan || 0) - startedAtStation);
        
        return {
          ...o,
          liveToDo: remainingAtStation,
          liveFinish: stats.finished,
          startedAtStation: startedAtStation,
        };
      })
      .sort(
        (a, b) =>
          a.dateObj - b.dateObj ||
          String(a.orderId).localeCompare(String(b.orderId))
      );
  }, [rawOrders, rawProducts, selectedStation]);

  const stationStats = useMemo(() => {
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");
    
    // Check voor downstream stations (Nabewerking, Mazak, Lossen)
    // BM01 wordt apart afgehandeld via stationOrders (bevat alle orders)
    const isDownstream = ["NABEWERKING", "MAZAK", "LOSSEN", "NABEWERKEN", "BM01", "STATIONBM01"].includes(cleanStationId) || cleanStationId.includes("NABEWERK") || cleanStationId.includes("BM01");
    const isLossenStation = cleanStationId === "LOSSEN";

    if (isDownstream) {
        // BM01 Specifieke KPI Logica
        if (cleanStationId.includes("BM01")) {
            // Plan: Totaal van alle orders (want BM01 is centraal)
            let plan = 0;
            stationOrders.forEach(o => plan += Number(o.plan || 0));
            
            // Todo (Aan te bieden): Items die wachten op BM01
            let todo = 0;
            rawProducts.forEach(p => {
                 const pStationNorm = normalizeMachine(p.currentStation || "");
                 const pStepUpper = (p.currentStep || "").toUpperCase();
                 const isActive = p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected" && p.currentStep !== "REJECTED";
                 
                 if ((pStationNorm === currentStationNorm || pStepUpper.includes("INSPECTIE") || pStepUpper === "BM01") && isActive) {
                     todo++;
                 }
            });
            
            // Done (Gereed): Items uit archief + actieve finished items
            let done = archivedStats.done;
            rawProducts.forEach(p => {
                 if ((p.status === "completed" || p.currentStep === "Finished") && (p.currentStation === "GEREED" || p.lastStation === "BM01")) {
                     done++;
                 }
            });
            
            return { plan, todo, done };
        }

        let todoCount = 0;
        let doneCount = 0;

        rawProducts.forEach(p => {
            const pStationNorm = normalizeMachine(p.currentStation || "");
            const pLastStationNorm = normalizeMachine(p.lastStation || "");
            const pStep = p.currentStep || "";
            
            // Check of item actief is (niet klaar/afgekeurd)
            const isActive = p.status !== "completed" && p.currentStep !== "Finished" && p.status !== "rejected" && p.currentStep !== "REJECTED";

            // 1. Bereken TODO (Nog)
            let isHere = false;
            if (isLossenStation) {
                // Voor Lossen station: items met stap 'Lossen' EN specifieke herkomst regels
                if (pStep === "Lossen" && isActive) {
                    const origin = normalizeMachine(p.originMachine || p.machine || "");
                    const originLabel = normalizeMachine(p.stationLabel || "");
                    const current = normalizeMachine(p.currentStation || "");
                    const targetMachines = ["BH31", "BH16", "BH11", "31", "16", "11"];

                    if (targetMachines.includes(origin) || targetMachines.includes(originLabel) || targetMachines.includes(current)) {
                        isHere = true;
                    } else if (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel) || current === "BH18") {
                        // Alleen ID groter dan 300mm van BH18
                        const diameter = getDiameter(p.item || "");
                        if (diameter > 300) isHere = true;
                    }
                }
            } else {
                // Voor Nabewerking/Mazak/BM01: items op dit station
                if (cleanStationId.includes("BM01")) {
                     const pStepUpper = pStep.toUpperCase();
                     // BM01 specifieke check: ook kijken naar step 'Eindinspectie' of 'BM01'
                     if ((pStationNorm === currentStationNorm || pStepUpper.includes("INSPECTIE") || pStepUpper === "BM01") && isActive) {
                         isHere = true;
                     }
                } else {
                     if (pStationNorm === currentStationNorm && isActive) isHere = true;
                }
            }
            
            if (isHere) todoCount++;

            // 2. Bereken DONE (Gereed)
            let wasHere = false;
            if (isLossenStation) {
                const origin = normalizeMachine(p.originMachine || p.machine || "");
                const originLabel = normalizeMachine(p.stationLabel || "");
                
                const targetMachines = ["BH31", "BH16", "BH11", "31", "16", "11"];
                let isRelevant = false;

                if (targetMachines.includes(origin) || targetMachines.includes(originLabel)) {
                    isRelevant = true;
                } else if (["BH18", "18"].includes(origin) || ["BH18", "18"].includes(originLabel)) {
                    const diameter = getDiameter(p.item || "");
                    if (diameter > 300) isRelevant = true;
                }

                // Als relevant en stap is verder dan Lossen (en niet Wikkelen)
                if (isRelevant && pStep !== "Wikkelen" && pStep !== "Lossen" && pStep !== "HOLD_AREA") {
                    wasHere = true;
                }
            } else {
                if (pLastStationNorm === currentStationNorm) wasHere = true;
                if (pStationNorm === currentStationNorm && (p.status === "completed" || p.currentStep === "Finished")) wasHere = true;
                
                // BM01 specifieke check voor finished items die naar GEREED zijn gegaan
                if (cleanStationId.includes("BM01")) {
                    if ((p.status === "completed" || p.currentStep === "Finished") && (pStationNorm === "GEREED" && pLastStationNorm === "BM01")) {
                        wasHere = true;
                    }
                }
            }
            if (wasHere) doneCount++;
        });

        return { plan: todoCount + doneCount, done: doneCount, todo: todoCount };
    }

    let plan = 0;
    let done = 0;
    
    stationOrders.forEach(o => {
      const orderPlan = Number(o.plan || 0);
      plan += orderPlan;
      
      // FIX: Als order status 'completed' is, tel als volledig gereed (ook als tracking data weg is)
      const status = (o.status || "").toLowerCase();
      if (['completed', 'shipped', 'ready_to_ship', 'gereed', 'finished'].includes(status)) {
        done += orderPlan;
      } else {
        done += Number(o.liveFinish || 0);
      }
    });

    return { plan, done, todo: Math.max(0, plan - done) };
  }, [stationOrders, rawProducts, selectedStation, archivedStats]);

  const activeUnitsHere = useMemo(() => {
    if (!selectedStation) return [];
    const currentStationNorm = normalizeMachine(selectedStation);
    const cleanStationId = (currentStationNorm || "").toUpperCase().replace(/\s/g, "");

    return rawProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;

      const pMachine = String(p.originMachine || p.currentStation || "");
      const pMachineNorm = normalizeMachine(pMachine);
      const pClean = (pMachineNorm || "").toUpperCase().replace(/\s/g, "");

      if (cleanStationId === "MAZAK")
        return pClean === "MAZAK";
      
      if (cleanStationId === "NABEWERKING" || cleanStationId === "NABEWERKEN" || cleanStationId.includes("NABEWERK"))
        return (
          pClean === "NABEWERKING" || pClean === "NABEWERKEN" || pClean === "NABW" || pClean.includes("NABEWERK")
        );
      
      if (cleanStationId === "BM01" || cleanStationId.includes("BM01"))
        return pClean === "BM01" || pClean.includes("BM01");

      // NIEUW: BH31 (Reparatie) - Toon alles wat op dit station staat
      if (cleanStationId === "BH31") {
        return pClean === "BH31";
      }
      
      // Verberg items die in de wacht staan voor reparatie (Tijdelijke afkeur) op reguliere stations
      if (p.currentStep === "HOLD_AREA") return false;

      if (selectedStation.startsWith("BH")) {
        return (
          (pMachine === selectedStation ||
            pMachineNorm === currentStationNorm) &&
          (p.currentStep === "Wikkelen" || p.currentStep === "HOLD_AREA")
        );
      }
      return false;
    });
  }, [rawProducts, selectedStation]);

  // Handlers
  const handleBack = () => {
    if (onExit) {
      onExit();
    } else {
      navigate("/portal");
    }
  };

  const handleStartProduction = async (
    order,
    customLotNumber,
    stringCount = 1
  ) => {
    if (!currentUser || !customLotNumber) return;
    try {
      const now = new Date();
      const prefix = customLotNumber.slice(0, -4);
      const startSeq = parseInt(customLotNumber.slice(-4), 10);
      let overflowItems = [];

      for (let i = 0; i < stringCount; i++) {
        const currentSeq = startSeq + i;
        const currentLotNumber = `${prefix}${String(currentSeq).padStart(
          4,
          "0"
        )}`;
        const productRef = doc(
          db,
          ...PATHS.TRACKING,
          currentLotNumber
        );

        const currentStartedCount = rawProducts.filter(
          (p) => p.orderId === order.orderId
        ).length;
        const plannedAmount = Number(order.plan || 0);
        const isOverflow = currentStartedCount + i + 1 > plannedAmount;

        // Haal personeelsnummers op voor dit station
        const stationOperators = occupancy
          .filter(occ => {
            if (occ.station !== selectedStation) return false;
            if (!occ.date) return false;
            const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
            occDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // Filter: Datum moet vandaag zijn EN de shift moet nu actief zijn
            return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
          })
          .map(occ => occ.operatorNumber)
          .filter(Boolean);

        const flowState = getNextFlowState('START_WINDING');

        const unitData = {
          lotNumber: currentLotNumber,
          orderId: isOverflow ? "NOG_TE_BEPALEN" : order.orderId,
          item: order.item,
          drawing: order.drawing || "",
          originMachine: selectedStation,
          currentStation: selectedStation,
          currentStep: flowState.currentStep || "Wikkelen",
          status: flowState.status || "in_progress",
          startTime: now.toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          operator: currentUser.email,
          timestamps: {
            wikkelen_start: serverTimestamp(),
            station_start: serverTimestamp(),
          },
          personnelTracking: {
            [selectedStation]: stationOperators,
          },
        };
        if (isOverflow) {
          unitData.isOverproduction = true;
          unitData.originalOrderId = order.orderId;
          unitData.note = "Overproductie uit string-run";
          overflowItems.push(currentLotNumber);
        }
        await setDoc(productRef, unitData);
      }

      if (overflowItems.length > 0) {
        await addDoc(
          collection(db, ...PATHS.MESSAGES),
          {
            title: "⚠ Overproductie Melding",
            message: `Op ${selectedStation} zijn ${overflowItems.length} extra producten gemaakt.`,
            type: "warning",
            status: "unread",
            createdAt: serverTimestamp(),
            source: "WorkstationHub",
          }
        );
        alert(
          `Let op: Er zijn ${overflowItems.length} producten meer gemaakt dan gepland.`
        );
      }

      // Update order: decrease counter for this station
      if (order.status !== "completed") {
        const stationField = `started_${selectedStation.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const currentStarted = order[stationField] || 0;
        
        await updateDoc(
          doc(db, ...PATHS.PLANNING, order.id),
          {
            status: "in_progress",
            lastUpdated: serverTimestamp(),
            [stationField]: currentStarted + stringCount,
          }
        );
      }
      setShowStartModal(false);
    } catch (error) {
      console.error(error);
      showError(error.message, "Fout bij starten");
    }
  };

  // Handler voor handmatig verplaatsen van product (Nieuw toegevoegd voor Dossier)
  const handleMoveLot = async (lotNumber, newStation) => {
    if (!lotNumber || !newStation) return;
    try {
      const productRef = doc(db, ...PATHS.TRACKING, lotNumber);
      
      // Bepaal direct de juiste status voor het nieuwe station (bijv. Te Keuren voor BM01)
      const nextState = getStepForStation(newStation);

      await updateDoc(productRef, {
        currentStation: newStation,
        currentStep: nextState.currentStep,
        status: nextState.status || "in_progress",
        isManualMove: true,
        updatedAt: serverTimestamp(),
        note: `Handmatig verplaatst naar ${newStation} door ${currentUser?.email || 'Operator'}`
      });
      showSuccess(`Product ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err) {
      console.error("Fout bij verplaatsen:", err);
      showError("Fout bij verplaatsen: " + err.message);
    }
  };

  const handlePauseResume = async (product) => {
    if (!product) return;
    try {
      const productRef = doc(db, ...PATHS.TRACKING, product.id || product.lotNumber);
      const isPaused = product.status === "PAUSED";
      
      await updateDoc(productRef, {
        status: isPaused ? "In Production" : "PAUSED",
        updatedAt: serverTimestamp(),
      });
      
      if (isPaused) showSuccess("Productie hervat");
      else showInfo("Productie gepauzeerd");
    } catch (err) {
      console.error("Fout bij pauzeren:", err);
      showError("Kon status niet wijzigen");
    }
  };

  const handleLinkProduct = async (docId, product) => {
    try {
      await updateDoc(
        doc(db, ...PATHS.PLANNING, docId),
        {
          linkedProductId: product.id,
          linkedProductImage: product.imageUrl,
          lastUpdated: new Date(),
        }
      );
      showSuccess("Product succesvol gekoppeld!");
      setShowLinkModal(false);
      setOrderToLink(null);
    } catch (error) {
      console.error(error);
      showError("Kon product niet koppelen", "Koppelen mislukt");
    }
  };

  const handlePostProcessingFinish = async (status, data) => {
    if (!itemToFinish) return;
    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        itemToFinish.id || itemToFinish.lotNumber
      );
      
      // Haal personeelsnummers op voor dit station
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const stationOperators = occupancy
        .filter(occ => {
          if (occ.station !== selectedStation) return false;
          if (!occ.date) return false;
          const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
          occDate.setHours(0, 0, 0, 0);
          // Filter: Datum moet vandaag zijn EN de shift moet nu actief zijn
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map(occ => occ.operatorNumber)
        .filter(Boolean);
      
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: currentUser?.email || "Unknown",
      };

      // Maak history entry aan
      const historyEntry = {
          action: status === "completed" ? "Stap Voltooid" : (status === "temp_reject" ? "Tijdelijke Afkeur" : "Definitieve Afkeur"),
          timestamp: new Date().toISOString(),
          user: currentUser?.email || "Operator",
          station: selectedStation,
          details: status === "completed" ? "Verwerking afgerond" : `Reden: ${data.reasons?.join(", ")}`
      };

      // Update personnel tracking
      if (stationOperators.length > 0) {
        updates[`personnelTracking.${selectedStation}`] = stationOperators;
      }

      if (status === "completed") {
        if (selectedStation === "BM01" || selectedStation === "Station BM01") {
          const flowState = getNextFlowState('FINISH_INSPECTION');
          updates.currentStation = flowState.currentStation || "GEREED";
          updates.currentStep = flowState.currentStep || "Finished";
          updates.status = flowState.status || "completed";
          updates["timestamps.finished"] = serverTimestamp();
          updates.lastStation = "BM01"; // Ensure lastStation is set for archiving context

          // ARCHIVERING LOGICA VOOR BM01 (indien hier afgehandeld)
          const year = new Date().getFullYear();
          const archiveRef = doc(db, "future-factory", "production", "archive", String(year), "items", itemToFinish.id || itemToFinish.lotNumber);
          
          const finalData = { 
              ...itemToFinish, 
              ...updates,
              updatedAt: new Date(),
              timestamps: {
                  ...itemToFinish.timestamps,
                  finished: new Date()
              },
              // Override history met array inclusief laatste stap (ipv arrayUnion)
              history: [...(itemToFinish.history || []), historyEntry]
          };

          await setDoc(archiveRef, finalData);
          await deleteDoc(productRef);

          // Update Planning Order
          if (itemToFinish.orderId && itemToFinish.orderId !== "NOG_TE_BEPALEN") {
              try {
                  const planningRef = collection(db, ...PATHS.PLANNING);
                  const q = query(planningRef, where("orderId", "==", itemToFinish.orderId));
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
              } catch (e) {
                  console.error("Error updating planning order:", e);
              }
          }
          
          setFinishModalOpen(false);
          setItemToFinish(null);
          return;
        } else {
          const flowState = getNextFlowState('FINISH_PROCESSING');
          updates.currentStation = flowState.currentStation || "BM01";
          updates.currentStep = flowState.currentStep || "Eindinspectie";
          updates.status = flowState.status || "Te Keuren";
          updates.lastStation = selectedStation;
          updates["timestamps.eindinspectie_start"] = serverTimestamp();
        }
        
        // Voor niet-archivering updates: gebruik arrayUnion
        if (!updates.history) updates.history = arrayUnion(historyEntry);
      } else if (status === "temp_reject") {
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.currentStep = "HOLD_AREA";
        // Sla de vorige staat op zodat we kunnen hervatten
        updates.previousStep = itemToFinish.currentStep;
        updates.previousStatus = itemToFinish.status;
        updates.history = arrayUnion(historyEntry);
      } else if (status === "rejected") {
        updates.status = "rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: data.reasons,
          timestamp: new Date().toISOString(),
        };
        updates.history = arrayUnion(historyEntry);
        
        // Bij definitieve afkeur: update order teller
        if (itemToFinish.orderId && itemToFinish.orderId !== "NOG_TE_BEPALEN") {
          try {
            const orderQuery = query(
              collection(db, ...PATHS.PLANNING),
              where("orderId", "==", itemToFinish.orderId)
            );
            const orderSnap = await getDocs(orderQuery);
            
            if (!orderSnap.empty) {
              const orderDoc = orderSnap.docs[0];
              const orderData = orderDoc.data();
              const originStation = itemToFinish.originMachine || itemToFinish.currentStation;
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
      setFinishModalOpen(false);
      setItemToFinish(null);
    } catch (error) {
      console.error("Fout bij afronden:", error);
      showError("Kon wijzigingen niet opslaan", "Fout bij opslaan");
    }
  };

  const handleProcessUnit = async (product) => {
    const stationCheck = String(selectedStation).toLowerCase();

    // NIEUW: BH31 Reparatie flow
    if (stationCheck === "bh31") {
        setItemToRepair(product);
        setShowRepairModal(true);
        return;
    }

    if (
      stationCheck === "nabewerking" ||
      stationCheck === "mazak" ||
      stationCheck === "bm01" ||
      selectedStation === "Station BM01"
    ) {
      setItemToFinish(product);
      setFinishModalOpen(true);
      return;
    }

    // FIX: Handmatige verplaatsing door Teamleader
    // Bepaal dynamisch de juiste stap op basis van het nieuwe station
    if (product.isManualMove) {
      try {
        const targetStation = product.currentStation || selectedStation;
        const nextState = getStepForStation(targetStation);
        
        const productRef = doc(db, ...PATHS.TRACKING, product.id || product.lotNumber);
        await updateDoc(productRef, {
          currentStep: nextState.currentStep,
          status: nextState.status || "in_progress",
          isManualMove: false,
          updatedAt: serverTimestamp(),
          note: product.note ? product.note + ` (Hervat op ${targetStation})` : `Hervat op ${targetStation}`
        });
        showSuccess(`Product ${product.lotNumber} correct ingesteld voor ${targetStation}`);
        return;
      } catch (error) {
        console.error("Fout bij doorsturen:", error);
        showError("Kon product niet doorsturen", "Fout");
        return;
      }
    }

    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        product.id || product.lotNumber
      );

      // Haal operators op voor station "LOSSEN" (Centrale losplaats)
      const lossenOperators = occupancy
        .filter(occ => {
          const stationName = (occ.station || occ.machineId || "").toUpperCase();
          if (stationName !== "LOSSEN") return false;
          
          if (!occ.date) return false;
          const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
          occDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map(occ => occ.operatorNumber)
        .filter(Boolean);

      const flowState = getNextFlowState('FINISH_WINDING');

      const updates = {
        currentStep: flowState.currentStep || "Wacht op Lossen",
        status: flowState.status || "Te Lossen",
        updatedAt: serverTimestamp(),
        "timestamps.lossen_start": serverTimestamp(),
      };

      if (lossenOperators.length > 0) {
        updates[`personnelTracking.LOSSEN`] = lossenOperators;
      }

      await updateDoc(productRef, updates);
      setActiveTab("lossen");
    } catch (error) {
      console.error("Fout bij proces:", error);
      showError("Kon status niet updaten", "Fout bij proces");
    }
  };

  // NIEUW: Afhandelen van reparatie op BH31
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
                  user: currentUser?.email || "Operator",
                  station: "BH31",
                  details: `Acties: ${data.actions.join(", ")}. ${data.notes}`
              })
          };

          await updateDoc(productRef, updates);
          showSuccess(`Product ${itemToRepair.lotNumber} gerepareerd en doorgestuurd naar BM01`);
          setShowRepairModal(false);
          setItemToRepair(null);
      } catch (err) {
          console.error("Fout bij reparatie afronden:", err);
          showError("Kon reparatie niet opslaan");
      }
  };

  const handleOpenProductInfo = async (productId) => {
    try {
      const productSnap = await getDoc(
        doc(db, ...PATHS.PRODUCTS, productId)
      );
      if (productSnap.exists()) {
        setLinkedProductData({ id: productSnap.id, ...productSnap.data() });
      } else {
        showWarning(t("digitalplanning.workstation.product_not_found"), t("digitalplanning.workstation.not_found"));
      }
    } catch (error) {
      console.error(error);
      showError(t("digitalplanning.workstation.product_load_error"), t("digitalplanning.workstation.load_error"));
    }
  };

  const handleActiveUnitClick = (unit) => {
    const parentOrder = rawOrders.find((o) => o.orderId === unit.orderId);
    if (parentOrder && parentOrder.linkedProductId) {
      handleOpenProductInfo(parentOrder.linkedProductId);
    } else if (unit.originalOrderId) {
      const origOrder = rawOrders.find(
        (o) => o.orderId === unit.originalOrderId
      );
      if (origOrder && origOrder.linkedProductId)
        handleOpenProductInfo(origOrder.linkedProductId);
      else showWarning(t("digitalplanning.workstation.no_dossier_for_order", { order: unit.originalOrderId }), t("digitalplanning.workstation.dossier_missing"));
    } else {
      showWarning(t("digitalplanning.workstation.no_dossier_linked", { order: unit.orderId }), t("digitalplanning.workstation.dossier_missing"));
    }
  };

  return (
    <>
    <div className="flex flex-col w-full h-[100dvh] bg-gray-50/50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3">
            {/* Linkerkant: Terug & Titel */}
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="mr-2 sm:mr-4 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-wider"
              >
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t("digitalplanning.workstation.back")}</span>
              </button>
              <span className="text-lg sm:text-xl font-black text-gray-900 italic tracking-tight truncate max-w-[150px] sm:max-w-none">
                {WORKSTATIONS.find((w) => w.id === selectedStation)?.name ||
                  selectedStation}
              </span>
            </div>

            {/* KPI Tegels */}
            <div className="hidden md:flex items-center gap-2 ml-2 border-l border-slate-200 pl-4">
              <div className="flex flex-col items-center px-3 py-1 bg-blue-50 rounded-lg border border-blue-100 min-w-[60px]">
                <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.plan")}</span>
                <span className="text-sm font-black text-blue-700 leading-none">{stationStats.plan}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-1 bg-orange-50 rounded-lg border border-orange-100 min-w-[60px]">
                <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest leading-none mb-0.5">
                  {["BM01", "Station BM01", "Mazak", "Nabewerking"].includes(selectedStation) ? t("digitalplanning.terminal.tab_to_offer") : t("digitalplanning.workstation.todo")}
                </span>
                <span className="text-sm font-black text-orange-700 leading-none">{stationStats.todo}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-100 min-w-[60px]">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-0.5">{t("digitalplanning.dashboard.ready")}</span>
                <span className="text-sm font-black text-emerald-700 leading-none">{stationStats.done}</span>
              </div>
            </div>

            {/* Midden: Bezetting Info */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm min-w-[200px] justify-center">
              <Clock className="w-4 h-4 text-slate-500" />
              {stationOccupancy.length > 0 ? (
                <div
                  key={currentOperatorIndex}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase border animate-in fade-in slide-in-from-bottom-1 duration-500 ${getShiftColor(
                    stationOccupancy[currentOperatorIndex]?.shift
                  )}`}
                  title={`${stationOccupancy[currentOperatorIndex]?.operatorName} - ${stationOccupancy[currentOperatorIndex]?.shift}`}
                >
                  {stationOccupancy[currentOperatorIndex]?.operatorName}
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-400 uppercase italic">{t("digitalplanning.workstation.no_operator")}</span>
              )}
            </div>

            {/* Rechts: Datum, Tijd & Week - helemaal rechts met flex-1 */}
            <div className="flex-1 hidden md:flex justify-end items-center">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <Calendar size={16} className="text-blue-600" />
                <div className="text-xs font-bold text-gray-700">
                  {t("common.week")} {currentWeekInfo.week} • {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div className="text-xs font-mono font-bold text-blue-600 border-l border-gray-300 pl-3">
                  {currentDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Rechterkant: Mobiel Menu Button */}
            <div className="flex items-center">
              {/* Mobiel Hamburger Menu */}
              <div className="md:hidden relative ml-2">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {isMobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                    {/* KPI Info voor mobiel */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div className="px-2 py-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                        <span className="text-[8px] font-black text-blue-400 uppercase block">{t("digitalplanning.dashboard.plan")}</span>
                        <span className="text-xs font-black text-blue-700">{stationStats.plan}</span>
                      </div>
                      <div className="px-2 py-2 bg-orange-50 rounded-lg border border-orange-100 text-center">
                        <span className="text-[8px] font-black text-orange-400 uppercase block">{t("digitalplanning.terminal.tab_to_offer")}</span>
                        <span className="text-xs font-black text-orange-700">{stationStats.todo}</span>
                      </div>
                      <div className="px-2 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                        <span className="text-[8px] font-black text-emerald-400 uppercase block">{t("digitalplanning.dashboard.ready")}</span>
                        <span className="text-xs font-black text-emerald-700">{stationStats.done}</span>
                      </div>
                    </div>

                    {/* Bezetting Info voor mobiel */}
                    {stationOccupancy.length > 0 && (
                      <div className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>{t("digitalplanning.workstation.scheduled_occupancy")}</span>
                        </div>
                        <div className="space-y-1.5">
                          {stationOccupancy.map((occ, idx) => (
                            <div
                              key={idx}
                              className={`px-2 py-1.5 rounded-md text-[10px] font-bold uppercase border ${getShiftColor(occ.shift)}`}
                            >
                              {occ.operatorName}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <button
                      onClick={() => {
                        setActiveTab("terminal");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "terminal"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.terminal.tab_planning")}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab("winding");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "winding"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("digitalplanning.hub.title")}
                    </button>
                    {!["BM01", "Station BM01"].includes(
                      selectedStation
                    ) && (
                      <button
                        onClick={() => {
                          setActiveTab("lossen");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                          activeTab === "lossen"
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-500"
                        }`}
                      >
                        {t("digitalplanning.terminal.tab_lossen")}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab("efficiency");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${
                        activeTab === "efficiency"
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      {t("common.efficiency")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className={`flex-1 overflow-y-auto w-full ${activeTab === 'terminal' ? 'p-0' : 'p-2 sm:p-6 lg:p-8'}`}>
        {loading ? (
          <div className="flex flex-col justify-center items-center h-full">
            <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600 mb-4" />
          </div>
        ) : (!currentUser?.role || currentUser?.role === 'guest') ? (
          <div className="flex flex-col justify-center items-center h-full text-slate-400">
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center max-w-md">
              <h3 className="text-lg font-black uppercase tracking-widest text-slate-700 mb-2">{t("digitalplanning.workstation.account_pending_title")}</h3>
              <p className="text-sm font-medium mb-6">{t("digitalplanning.workstation.account_pending_message")}</p>
              <button onClick={handleBack} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors">
                {t("digitalplanning.workstation.back_to_portal")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "winding" && (
              <ActiveProductionView
                activeUnits={activeUnitsHere}
                smartSuggestions={isPostProcessing ? [] : []}
                selectedStation={selectedStation}
                onProcessUnit={handleProcessUnit}
                onPauseResume={handlePauseResume}
                onClickUnit={handleActiveUnitClick}
              />
            )}
            {activeTab === "lossen" && (
              <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <LossenView
                  currentUser={currentUser}
                  products={rawProducts}
                  currentStation={selectedStation}
                  stationId={selectedStation}
                  appId={currentAppId}
                />
              </div>
            )}
            {activeTab === "terminal" && (
              <div className="h-full">
                {isBM01 ? (
                  <BM01Hub 
                    onBack={handleBack} 
                    orders={rawOrders}
                    products={rawProducts}
                    onMoveLot={handleMoveLot}
                  />
                ) : (
                  <Terminal
                    currentUser={currentUser}
                    initialStation={selectedStation}
                    products={rawProducts}
                    onBack={() => setActiveTab("planning")}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* MODALS */}
      <ProductionStartModal
        order={selectedOrder}
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        onStart={handleStartProduction}
        stationId={selectedStation}
        existingProducts={rawProducts}
        onOpenProductInfo={handleOpenProductInfo}
      />
      {linkedProductData && (
        <ProductDetailModal
          product={linkedProductData}
          onClose={() => setLinkedProductData(null)}
          userRole={currentUser?.role || "operator"}
        />
      )}
      {showLinkModal && orderToLink && (
        <OperatorLinkModal
          order={orderToLink}
          onClose={() => {
            setShowLinkModal(false);
            setOrderToLink(null);
          }}
          onLinkProduct={handleLinkProduct}
        />
      )}
      {finishModalOpen && itemToFinish && (
        <PostProcessingFinishModal
          product={itemToFinish}
          onClose={() => {
            setFinishModalOpen(false);
            setItemToFinish(null);
          }}
          onConfirm={handlePostProcessingFinish}
          currentStation={selectedStation}
        />
      )}
      {showRepairModal && itemToRepair && (
        <RepairModal
            product={itemToRepair}
            onClose={() => { setShowRepairModal(false); setItemToRepair(null); }}
            onConfirm={handleRepairComplete}
        />
      )}
    </div>
    </>
  );
}
export default WorkstationHub;
