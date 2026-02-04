import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Layers, Clock, Tv, Calendar } from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  getDoc,
  serverTimestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";

import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
} from "../../utils/workstationLogic";
import { normalizeMachine } from "../../utils/hubHelpers";
import { calculateDuration } from "../../utils/efficiencyCalculator";
import PlanningListView from "./views/PlanningListView";
import ActiveProductionView from "./views/ActiveProductionView";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";

import Terminal from "./Terminal";
import LossenView from "./LossenView";
import EfficiencyDashboard from "./EfficiencyDashboard";
import ProductDetailModal from "../products/ProductDetailModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import OperatorLinkModal from "./modals/OperatorLinkModal";

const COLLECTION_NAME = "digital_planning";

const getAppId = () => {
  if (typeof window !== "undefined" && window.__app_id) return window.__app_id;
  return "fittings-app-v1";
};

// Machine Config
const FITTING_MACHINES = [
  "BM01",
  "BH11",
  "BH12",
  "BH15",
  "BH16",
  "BH17",
  "BH18",
  "BH31",
  "Mazak",
  "Nabewerking",
];
const PIPE_MACHINES = ["BH05", "BH07", "BH08", "BH09"];

const WorkstationHub = ({ initialStationId, onExit, searchOrder }) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAdminAuth();
  const { showSuccess, showError, showInfo, showWarning } = useNotifications();
  const navigate = useNavigate();

  const [selectedStation, setSelectedStation] = useState(
    initialStationId || "BH11"
  );
  const [activeTab, setActiveTab] = useState("terminal");
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilterOrder, setSearchFilterOrder] = useState(searchOrder || null);
  
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

  const currentAppId = getAppId();
  const isPostProcessing = [
    "mazak",
    "nabewerking",
    "bm01",
    "station bm01",
  ].includes((selectedStation || "").toLowerCase());

  // Initiele Tab en Station Setup
  useEffect(() => {
    if (initialStationId) {
      setSelectedStation(initialStationId);
      if (
        ["Mazak", "Nabewerking", "BM01", "Station BM01"].includes(
          initialStationId
        )
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
        showInfo(`Order ${searchFilterOrder} geladen`);
      } else {
        console.log(`⚠️ Order ${searchFilterOrder} niet gevonden in planning`);
        showWarning(`Order ${searchFilterOrder} niet gevonden`);
      }
    }
  }, [searchFilterOrder, rawOrders]);

  // Data Fetching
  useEffect(() => {
    setLoading(true);

    const ordersRef = collection(db, ...PATHS.PLANNING);
    const unsubOrders = onSnapshot(query(ordersRef), (snap) => {
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
          item: data.item || data.productCode || "Onbekend Item",
          plan: data.plan || data.quantity || 0,
          dateObj: dateObj,
          weekNumber: parseInt(data.week || data.weekNumber || week),
          weekYear: parseInt(data.year || year),
        };
      });
      setRawOrders(loadedOrders);
      setLoading(false);
    });

    const unsubProds = onSnapshot(
      query(collection(db, ...PATHS.TRACKING)),
      (snap) => {
        setRawProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    // Occupancy data ophalen
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => {
        setOccupancy(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    // Personnel data ophalen
    const unsubPersonnel = onSnapshot(
      collection(db, ...PATHS.PERSONNEL),
      (snap) => {
        setPersonnel(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubOrders();
      unsubProds();
      unsubOccupancy();
      unsubPersonnel();
    };
  }, []);

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
              title: "⏰ Automatische Reminder: Tijdelijke Afkeur",
              message: `Product ${item.lotNumber} ligt al meer dan 7 dagen op ${selectedStation} ter reparatie. Graag actie.`,
              type: "alert",
              status: "unread",
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
          console.error("Fout bij versturen auto-reminder:", err);
        }
      }
    };
    const timer = setTimeout(checkAndSendReminders, 2000);
    return () => clearTimeout(timer);
  }, [rawProducts, selectedStation]);

  // Huidige operator voor dit werkstation berekenen  // Shift color helper
  const getShiftColor = (shiftLabel) => {
    const label = (shiftLabel || "").toUpperCase();
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return "bg-amber-100 text-amber-800 border-amber-300";
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
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
  const currentOperator = useMemo(() => {
    if (!selectedStation || !occupancy.length || !personnel.length) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Vind de meest recente occupancy voor dit station van vandaag
    const todayOccupancy = occupancy
      .filter((occ) => {
        if (occ.station !== selectedStation) return false;
        if (!occ.date) return false;
        
        const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
        occDate.setHours(0, 0, 0, 0);
        
        return occDate.getTime() === today.getTime();
      })
      .sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return timeB - timeA;
      })[0];

    if (!todayOccupancy) return null;

    // Vind de operator
    const operator = personnel.find(
      (p) => p.operatorNumber === todayOccupancy.operatorNumber
    );

    if (!operator) return null;

    const timestamp = todayOccupancy.timestamp?.toDate 
      ? todayOccupancy.timestamp.toDate() 
      : new Date(todayOccupancy.timestamp);

    return {
      name: operator.name || operator.operatorNumber,
      operatorNumber: operator.operatorNumber,
      timestamp: timestamp,
      date: todayOccupancy.date.toDate ? todayOccupancy.date.toDate() : new Date(todayOccupancy.date),
    };
  }, [selectedStation, occupancy, personnel]);

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
      if (p.currentStep === "Finished") orderStats[p.orderId].finished++;
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

  const activeUnitsHere = useMemo(() => {
    if (!selectedStation) return [];
    const currentStationNorm = normalizeMachine(selectedStation);
    return rawProducts.filter((p) => {
      if (p.currentStep === "Finished" || p.currentStep === "REJECTED")
        return false;

      const pMachine = String(p.originMachine || p.currentStation || "");
      const pMachineNorm = normalizeMachine(pMachine);

      if (selectedStation === "Mazak")
        return p.currentStation === "Mazak" || p.currentStation === "MAZAK";
      if (selectedStation === "Nabewerking")
        return (
          p.currentStation === "Nabewerking" || p.currentStation === "NABW"
        );
      if (selectedStation === "BM01" || selectedStation === "Station BM01")
        return p.currentStation === "BM01";

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
    stringCount = 1,
    isPrinterEnabled = false,
    selectedLabel = null
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
            return occDate.getTime() === today.getTime();
          })
          .map(occ => occ.operatorNumber)
          .filter(Boolean);

        const unitData = {
          lotNumber: currentLotNumber,
          orderId: isOverflow ? "NOG_TE_BEPALEN" : order.orderId,
          item: order.item,
          drawing: order.drawing || "",
          originMachine: selectedStation,
          currentStation: selectedStation,
          currentStep: "Wikkelen",
          status: "in_progress",
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
            [stationField]: currentStarted + count,
          }
        );
      }
      setShowStartModal(false);
    } catch (error) {
      console.error(error);
      showError(error.message, "Fout bij starten");
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
          return occDate.getTime() === today.getTime();
        })
        .map(occ => occ.operatorNumber)
        .filter(Boolean);
      
      const updates = {
        updatedAt: serverTimestamp(),
        note: data.note || "",
        processedBy: currentUser?.email || "Unknown",
      };

      // Update personnel tracking
      if (stationOperators.length > 0) {
        updates[`personnelTracking.${selectedStation}`] = stationOperators;
      }

      if (status === "completed") {
        if (selectedStation === "BM01" || selectedStation === "Station BM01") {
          updates.currentStation = "GEREED";
          updates.currentStep = "Finished";
          updates.status = "completed";
          updates["timestamps.finished"] = serverTimestamp();
        } else {
          updates.currentStation = "BM01";
          updates.currentStep = "Eindinspectie";
          updates["timestamps.eindinspectie_start"] = serverTimestamp();
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

    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        product.id || product.lotNumber
      );
      await updateDoc(productRef, {
        currentStep: "Lossen",
        updatedAt: serverTimestamp(),
        "timestamps.lossen_start": serverTimestamp(),
      });
      setActiveTab("lossen");
    } catch (error) {
      console.error("Fout bij proces:", error);
      showError("Kon status niet updaten", "Fout bij proces");
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
        showWarning("Product niet gevonden in database", "Niet gevonden");
      }
    } catch (error) {
      console.error(error);
      showError("Kon product niet laden", "Fout bij laden");
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
      else showWarning(`Geen dossier bij order ${unit.originalOrderId}`, "Dossier ontbreekt");
    } else {
      showWarning(`Geen dossier gekoppeld aan order ${unit.orderId}`, "Dossier ontbreekt");
    }
  };

  return (
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
                <span className="hidden sm:inline">Terug</span>
              </button>
              <span className="text-lg sm:text-xl font-black text-gray-900 italic tracking-tight truncate max-w-[150px] sm:max-w-none">
                {WORKSTATIONS.find((w) => w.id === selectedStation)?.name ||
                  selectedStation}
              </span>
            </div>

            {/* Midden: Bezetting Info */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              <div className="flex items-center gap-1.5 flex-wrap">
                {stationOccupancy.map((occ, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase border ${getShiftColor(occ.shift)}`}
                    title={`${occ.operatorName} - ${occ.shift}`}
                  >
                    {occ.operatorName}
                  </div>
                ))}
              </div>
            </div>

            {/* Rechts: Datum, Tijd & Week - helemaal rechts met flex-1 */}
            <div className="flex-1 hidden md:flex justify-end items-center">
              <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <Calendar size={16} className="text-blue-600" />
                <div className="text-xs font-bold text-gray-700">
                  Week {currentWeekInfo.week} • {currentDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                    {/* Bezetting Info voor mobiel */}
                    {stationOccupancy.length > 0 && (
                      <div className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-200 mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>Ingeplande Bezetting</span>
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
                      Planning
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
                      {selectedStation === "BM01" ||
                      selectedStation === "Station BM01"
                        ? "Inspectie"
                        : "Productie"}
                    </button>
                    {!["BM01", "Station BM01", "Mazak", "Nabewerking"].includes(
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
                        Lossen
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
                      Efficiency
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto w-full p-2 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-full">
            <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600 mb-4" />
          </div>
        ) : (
          <>
            {activeTab === "winding" && (
              <ActiveProductionView
                activeUnits={activeUnitsHere}
                smartSuggestions={isPostProcessing ? [] : []}
                selectedStation={selectedStation}
                onProcessUnit={handleProcessUnit}
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
                <Terminal
                  currentUser={currentUser}
                  initialStation={selectedStation}
                  products={rawProducts}
                  onBack={() => setActiveTab("planning")}
                />
              </div>
            )}
            {activeTab === "efficiency" && (
              <div className="h-full">
                <EfficiencyDashboard selectedStation={selectedStation} />
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
    </div>
  );
};

export default WorkstationHub;
