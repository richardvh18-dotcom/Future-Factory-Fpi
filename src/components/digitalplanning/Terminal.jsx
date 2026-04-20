import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  ScanBarcode,
  Keyboard,
} from "lucide-react";
import {
  collection,
  collectionGroup,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  arrayUnion,
} from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath } from "../../config/dbPaths";
import { toDateSafe } from "../../utils/dateUtils";
import {
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
  subDays,
} from "date-fns";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import ProductDetailModal from "../products/ProductDetailModal";
import LossenView from "./LossenView";
import Nabewerken from "./Nabewerken";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { normalizeMachine, getStartedCounterField } from "../../utils/hubHelpers";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import TerminalPlanningView from "./terminal/TerminalPlanningView";
import TerminalProductionView from "./terminal/TerminalProductionView";
import TerminalManualInput from "./terminal/TerminalManualInput";
import TerminalGereedTab from "./terminal/TerminalGereedTab";
import MalOptimizationPanel from "./MalOptimizationPanel";
import MazakView from "./MazakView";
import RepairModal from "./modals/RepairModal";
import { useNotifications } from '../../contexts/NotificationContext';
import { startProductionLots } from "../../services/planningSecurityService";
import { completeTrackedProductRepair } from "../../services/planningSecurityService";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const GEREED_TAB_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17", "BH18"]);

/**
 * Workstation Terminal - V22.5
 * - Oplossing voor 2026 weeknotatie (W3 vs W03).
 * - Automatische selectie-reset bij navigatie.
 * - Alles-knop toegevoegd en zoekknop uit toolbar verwijderd.
 */
const Terminal = ({ initialStation, onCancelProduction, orders = [] }) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();

  // Station configuratie
  const stationId = typeof initialStation === "object" ? initialStation.id : initialStation;
  const stationName = typeof initialStation === "object" ? initialStation.name : initialStation;
  const effectiveStationId = stationName || stationId;
  const normalizedStationId = (normalizeMachine(effectiveStationId) || "").toUpperCase().trim();
  const cleanStationId = normalizedStationId.replace(/\s/g, "");

  const isNabewerking = useMemo(() => normalizedStationId === "NABEWERKING" || cleanStationId === "NABEWERKING" || normalizedStationId.includes("NABEWERKING") || normalizedStationId.includes("NABEWERKEN"), [normalizedStationId, cleanStationId]);
  const isMazak = normalizedStationId === "MAZAK" || cleanStationId === "MAZAK";
  const isLossen1218Station = cleanStationId === "LOSSEN12/18";
  const isLossenStation = normalizedStationId === "LOSSEN" && !isLossen1218Station;
  const isSimpleViewStation = isNabewerking || isMazak || isLossenStation;
  const isBH18 = cleanStationId === "BH18" || normalizedStationId === "BH18";
  const isGereedTabSourceStation = GEREED_TAB_SOURCE_STATIONS.has(cleanStationId);
  const isBH31 = normalizedStationId === "BH31";
  const isBM01 = cleanStationId === "BM01" || cleanStationId === "STATIONBM01" || normalizedStationId.includes("BM01");

  // State management
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState("planning");
  const [lossenPlanningFilter, setLossenPlanningFilter] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [allTracked, setAllTracked] = useState([]);
  const [archiveTrackedItems, setArchiveTrackedItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedTrackedId, setSelectedTrackedId] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [productToRelease, setProductToRelease] = useState(null);
  const [bulkProductsToRelease, setBulkProductsToRelease] = useState([]);
  const [releaseAutoApproveToken, setReleaseAutoApproveToken] = useState(0);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [itemToRepair, setItemToRepair] = useState(null);

  // Scan functionaliteit voor wikkelen tab
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef(null);

  // Planning filters (Week / Alles)
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showAllWeeks, setShowAllWeeks] = useState(true); // STANDAARD AAN: Toon alle weken met weekdividers
  
  const targetWeekNum = getISOWeek(referenceDate);
  const targetYearNum = getISOWeekYear(referenceDate);

  // NIEUW: Huidige datum voor backlog berekening (Absoluut 'Nu')
  const currentRealDate = new Date();
  const currentRealWeek = getISOWeek(currentRealDate);
  const currentRealYear = getISOWeekYear(currentRealDate);
  const absCurrentReal = currentRealYear * 52 + currentRealWeek;

  const appId = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";
  const stationCounterField = getStartedCounterField(effectiveStationId || stationId);

  // Forceer tab reset bij station wissel
  useEffect(() => {
    if (isLossen1218Station) {
      setActiveTab("lossen"); // LOSSEN 12/18: standaard lossen tab
    } else {
      setActiveTab("planning");
    }
  }, [effectiveStationId, isLossen1218Station]);

  // RESET EFFECT: Zorg dat de details sluiten bij navigatie acties
  useEffect(() => {
    setSelectedOrderId(null);
    setSelectedTrackedId(null);
  }, [referenceDate, showAllWeeks, activeTab]);

  useEffect(() => {
    if (isGereedTabSourceStation && activeTab === "lossen") {
      setActiveTab("gereed");
    }
  }, [isGereedTabSourceStation, activeTab]);
  // Helpers
  const parseDateSafe = (dateInput) => {
    return toDateSafe(dateInput);
  };

  const normalizePlanningStatus = (status) => String(status || "").trim().toLowerCase();

  const normalizeTrackedStatus = (status) => String(status || "").trim().toLowerCase();

  const isTrackedProductionActive = (product) => {
    const status = normalizeTrackedStatus(product?.status);
    return ["in production", "in productie", "held_qc", "in_progress", "paused"].includes(status);
  };

  const isInactivePlanningStatus = (status) => {
    const normalized = normalizePlanningStatus(status);
    return ["completed", "cancelled", "shipped", "rejected", "finished", "deleted"].includes(normalized);
  };

  const isPlannedLikeStatus = (status) => {
    const normalized = normalizePlanningStatus(status);
    return ["planned", "delegated", "pending", "waiting"].includes(normalized);
  };

  const isDefinitiveRejectedOrRemoved = (product) => {
    const statusNorm = normalizeTrackedStatus(product?.status);
    const stepNorm = String(product?.currentStep || "").trim().toLowerCase();
    const inspectionNorm = String(product?.inspection?.status || "").trim().toLowerCase();
    const isTemporaryReject = inspectionNorm.includes("tijdelijke afkeur");

    const isRejected =
      (["rejected", "afkeur", "archived_rejected", "definitieve_afkeur", "definitief_afkeur"].includes(statusNorm) ||
        stepNorm === "rejected") &&
      !isTemporaryReject;

    const isRemoved = ["deleted", "cancelled", "canceled"].includes(statusNorm);
    return isRejected || isRemoved;
  };

  // Real-time Data Sync - ONLY for tracked products (orders come from prop)
  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    
    // Set orders from prop (already filtered by WorkstationHub)
    if (orders && orders.length > 0) {
      setAllOrders(orders);
    } else {
      // Fallback if no orders provided
      setAllOrders([]);
    }

    // Voor robuuste lot-telling houden we actieve tracked lots breed beschikbaar.
    const unsubProducts = subscribeTrackedProducts({
      db,
      statusExclusions: ["deleted", "archived_rejected"],
      maxItems: 200,
      onData: (items) => {
        setAllTracked(items);
        setLoading(false);
      },
      onError: (err) => {
        console.error("Products sync error:", err);
        setLoading(false);
      },
    });

    return () => {
      unsubProducts();
    };
  }, [stationId, orders]);  // Added orders as dependency

  // Sync archief-items (meerdere jaren) voor lot-gedreven gemaakte teller.
  useEffect(() => {
    let isMounted = true;
    const now = new Date();
    const minArchiveDate = subDays(now, 365 * 6);
    const years = [
      now.getFullYear(),
      now.getFullYear() - 1,
      now.getFullYear() - 2,
      now.getFullYear() - 3,
      now.getFullYear() - 4,
      now.getFullYear() - 5,
    ];
    const byYear = {};

    const syncCombined = () => {
      if (!isMounted) return;
      const combined = Object.values(byYear).flatMap((items) => items || []);
      setArchiveTrackedItems(combined);
    };

    const unsubs = years.map((year) =>
      onSnapshot(
        query(
          collection(db, ...getArchiveItemsPath(year)),
          where("timestamps.finished", ">=", minArchiveDate)
        ),
        (snap) => {
          byYear[year] = snap.docs.map((d) => ({ id: d.id, __docPath: d.ref.path, ...d.data() }));
          syncCombined();
        },
        () => {
          byYear[year] = [];
          syncCombined();
        }
      )
    );

    return () => {
      isMounted = false;
      unsubs.forEach((u) => u && u());
    };
  }, []);

  const stationOrderMeta = useMemo(() => {
    const map = new Map();
    const stationNorm = String(normalizedStationId || "").toUpperCase().trim();
    const stationClean = stationNorm.replace(/\s/g, "");

    const matchesStation = (value) => {
      const norm = (normalizeMachine(value) || "").toUpperCase().trim();
      if (!norm) return false;
      const clean = norm.replace(/\s/g, "");
      if (stationClean.includes("NABEWERK")) {
        return clean.includes("NABEWERK") || clean === "NABW";
      }
      if (stationClean.includes("BM01")) {
        return clean.includes("BM01");
      }
      return norm === stationNorm;
    };

    allTracked.forEach((product) => {
      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const isLinked = [
        product?.originMachine,
        product?.currentStation,
        product?.lastStation,
        product?.machine,
      ].some(matchesStation);
      if (!isLinked) return;

      const statusUpper = String(product?.status || "").toUpperCase();
      const stepUpper = String(product?.currentStep || "").toUpperCase();
      const isClosed =
        ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) ||
        stepUpper === "FINISHED" ||
        stepUpper === "REJECTED";

      const entry = map.get(orderId) || { active: 0, total: 0 };
      entry.total += 1;
      if (!isClosed) entry.active += 1;
      map.set(orderId, entry);
    });

    return map;
  }, [allTracked, normalizedStationId]);

  // Gefilterde data voor het huidige station
  const myOrders = useMemo(() => {
    if (isBM01) return allOrders;
    if (isLossen1218Station) {
      const sourceMachines = new Set(["BH12", "BH15", "BH17", "BH18"]);
      return allOrders.filter(o => sourceMachines.has((normalizeMachine(o.machine) || "").toUpperCase().trim()));
    }
    const result = allOrders.filter(o => {
      const machineNorm = (normalizeMachine(o.machine) || "").toUpperCase().trim();
      const returnNorm = (normalizeMachine(o.returnStation) || "").toUpperCase().trim();
        const orderId = String(o.orderId || "").trim();
        const startedAtStation = Number(stationCounterField ? o?.[stationCounterField] || 0 : 0);
        const planAtStation = Number(o.plan || o.quantity || 0);
        const hasRemainingPlan = startedAtStation > 0 && planAtStation > startedAtStation;
        const meta = stationOrderMeta.get(orderId);
        const hasStationActivity = (meta?.active || 0) > 0 || (meta?.total || 0) > 0;

        return (
          machineNorm === normalizedStationId ||
          returnNorm === normalizedStationId ||
          hasRemainingPlan ||
          hasStationActivity
        );
    });
    
    return result;
  }, [allOrders, normalizedStationId, isBM01, isLossen1218Station, stationCounterField, stationOrderMeta]);

  const productionProgressMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      const oid = String(p.orderId || "").trim();
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
    });
    return map;
  }, [allTracked]);

  const rejectedCountMap = useMemo(() => {
    const map = {};
    allTracked.forEach((p) => {
      const oid = String(p.orderId || "").trim();
      if (!oid) return;
      const isRejected = ['rejected', 'Rejected', 'AFKEUR', 'REJECTED'].includes(p.status) || p.currentStep === 'REJECTED';
      if (!isRejected) return;
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
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

  // Centrale gemaakte teller: unieke lots per order uit tracked + archief.
  const madeCountMap = useMemo(() => {
    const perOrderLots = new Map();

    const addLot = (orderIdRaw, lotRaw) => {
      const orderId = String(orderIdRaw || "").trim();
      const lot = String(lotRaw || "").trim();
      if (!orderId || !lot) return;
      if (!perOrderLots.has(orderId)) perOrderLots.set(orderId, new Set());
      perOrderLots.get(orderId).add(lot);
    };

    allTracked.forEach((p) => {
      if (isDefinitiveRejectedOrRemoved(p)) return;
      addLot(p?.orderId, p?.lotNumber || p?.id);
    });

    archiveTrackedItems.forEach((p) => {
      if (isDefinitiveRejectedOrRemoved(p)) return;
      addLot(p?.orderId, p?.lotNumber || p?.id);
    });

    const result = {};
    perOrderLots.forEach((lots, orderId) => {
      result[orderId] = lots.size;
    });
    return result;
  }, [allTracked, archiveTrackedItems]);

  const activeWikkelingen = useMemo(() => {
    const active = allTracked
      .filter(p => {
        const currentNorm = (normalizeMachine(p.currentStation) || "").toUpperCase().trim();
        const fallbackNorm = (normalizeMachine(p.originMachine || p.machine) || "").toUpperCase().trim();

        // currentStation is leidend; fallback alleen voor legacy records zonder currentStation.
        if (currentNorm) return currentNorm === normalizedStationId;
        return fallbackNorm === normalizedStationId;
      })
      .filter((p) => isTrackedProductionActive(p));
    
    if (!sidebarSearch) return active;
    const term = sidebarSearch.toLowerCase();
    return active.filter(p => (p.lotNumber || "").toLowerCase().includes(term) || (p.orderId || "").toLowerCase().includes(term));
  }, [allTracked, normalizedStationId, sidebarSearch]);

  const lotConflictMeta = useMemo(() => {
    const buckets = new Map();

    allTracked.forEach((p) => {
      const lotKey = String(p?.lotNumber || "").trim().toUpperCase();
      if (!lotKey) return;

      const productSignature = [
        String(p?.itemCode || "").trim().toUpperCase(),
        String(p?.item || "").trim().toUpperCase(),
        String(p?.drawing || "").trim().toUpperCase(),
      ].join("|");

      const existing = buckets.get(lotKey) || {
        productSignatures: new Set(),
        orderIds: new Set(),
      };

      if (productSignature.replace(/\|/g, "").trim()) {
        existing.productSignatures.add(productSignature);
      }

      const oid = String(p?.orderId || "").trim();
      if (oid) existing.orderIds.add(oid);

      buckets.set(lotKey, existing);
    });

    const meta = {};
    buckets.forEach((entry, lotKey) => {
      const hasProductConflict = entry.productSignatures.size > 1;
      const hasOrderConflict = entry.orderIds.size > 1;
      meta[lotKey] = {
        hasConflict: hasProductConflict || hasOrderConflict,
        productCount: entry.productSignatures.size,
        orderCount: entry.orderIds.size,
      };
    });

    return meta;
  }, [allTracked]);

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
        // Lot-first: unieke lots uit tracked+archief zijn de primaire bron.
        // Legacy velden blijven als fallback om ondertelling te voorkomen.
        produced: Math.max(
          Number(madeCountMap[String(o.orderId || "").trim()]) || 0,
          Number(o.produced) || 0,
          Number(o.finishValue) || 0,
          Number(o.wrapped) || 0
        ),
        startedAtStation: Number(o[stationCounterField] || 0)
    }));

    const base = enrichedOrders.filter((o) => {
      // FIX: Gebruik 'plan' als fallback voor 'quantity', anders is quantity 0 en wordt de order verborgen (0 >= 0)
      const quantity = o.quantity || o.plan || 0;
      const startedAtStation = Number(o.startedAtStation || 0);
      
      // Verberg order zodra alle geplande stuks voor dit station gestart zijn.
      // Als later een definitieve afkeur de started-teller verlaagt, komt de order automatisch terug.
      if (!isBM01 && quantity > 0 && startedAtStation >= quantity) return false;

      // Fallback: ook volledig geproduceerde orders uit actieve lijst houden.
      // MAAR: Alleen als ze NIET meer in_progress zijn!
      if (quantity > 0 && o.produced >= quantity && !["in_progress", "in production", "in productie"].includes(String(o.status || "").toLowerCase())) return false;

      if (isInactivePlanningStatus(o.status)) return false;
      
      // FIX: BH31 (Reparatie) orders verdwijnen uit planning zodra ze in behandeling zijn
      // Tenzij er specifiek naar gezocht wordt
      const isRepairStation = normalizedStationId === "BH31" || normalizedStationId.includes("REPARATIE") || normalizedStationId.includes("SPECIAL");
      if (isRepairStation && !sidebarSearch) {
          const oid = String(o.orderId || "").trim();
          const started = productionProgressMap[oid] || 0;
          if (started > 0 || ["in_progress", "in production", "in productie"].includes(String(o.status || "").trim().toLowerCase())) return false;
      }

      // BM01: Geen week filter, toon alles (behalve als search actief is, wat hieronder gebeurt)
      if (isBM01) return true;

      if (showAllWeeks || sidebarSearch) return true;
      
      const absOrder = o.parsedYear * 52 + o.parsedWeek;
      const absTarget = targetYearNum * 52 + targetWeekNum;

      // Als we de HUIDIGE week bekijken, toon ook de backlog (alles uit verleden dat niet af is)
      if (absTarget === absCurrentReal) {
            if (normalizePlanningStatus(o.status) === "in_progress" || normalizePlanningStatus(o.status) === "in production") return true;
          if (absOrder === absTarget) return true;
          if (absOrder < absTarget) return true;
      } else {
          // Voor andere weken (toekomst/verleden) alleen die week tonen
          if (absOrder === absTarget) return true;
      }
      
      return false;
    });

    if (!sidebarSearch) {
      return base.sort((a, b) => {
        const priorityRank = (order) => {
          const normalizedPriority =
            order?.priority === true
              ? "high"
              : String(order?.priority || "").toLowerCase().trim();
          if (normalizedPriority === "immediate") return 3;
          if (normalizedPriority === "urgent" || order?.isUrgent) return 2;
          if (normalizedPriority === "high" || order?.isMoved) return 1;
          return 0;
        };

        const prioDiff = priorityRank(b) - priorityRank(a);
        if (prioDiff !== 0) return prioDiff;

        const absOrderA = a.parsedYear * 52 + a.parsedWeek;
        const absOrderB = b.parsedYear * 52 + b.parsedWeek;
        
        const isBacklogA = absOrderA < absCurrentReal;
        const isBacklogB = absOrderB < absCurrentReal;

        // 1. Backlog ONDERAAN (Splitsing: Huidig/Toekomst eerst, dan Verleden)
        if (isBacklogA && !isBacklogB) return 1;
        if (!isBacklogA && isBacklogB) return -1;

        // 2. Status 'planned' of 'delegated' (Nieuw toegewezen) bovenaan binnen de groep
        const isPlannedA = isPlannedLikeStatus(a.status);
        const isPlannedB = isPlannedLikeStatus(b.status);
        if (isPlannedA !== isPlannedB) return isPlannedA ? -1 : 1;

        // 3. Urgentie (legacy fallback)
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        
        // 4. Week (Oplopend)
        if (absOrderA !== absOrderB) return absOrderA - absOrderB;
        
        // 5. Order ID
        return String(a.orderId).localeCompare(String(b.orderId));
      });
    }
    
    const searchValue = String(sidebarSearch || "").toLowerCase().trim();
    const tokens = searchValue.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) return base;

    const hasAlphaToken = tokens.some((t) => /[a-z]/i.test(t));

    return base.filter((o) => {
      const orderFields = [
        o.orderId,
        o.orderNumber,
      ].map((v) => String(v || "").toLowerCase());

      const productFields = [
        o.item,
        o.itemCode,
        o.productId,
        o.machine,
        o.extraCode,
      ].map((v) => String(v || "").toLowerCase());

      const orderText = orderFields.join(" ");
      const productText = productFields.join(" ");
      const combinedText = `${orderText} ${productText}`;

      return tokens.every((token) => {
        const isNumeric = /^\d+$/.test(token);
        const isOrderLike = /^n\d+$/i.test(token);

        // Slim gedrag: als de query productgericht is (bevat letters),
        // match numerieke delen niet op ordernummer maar alleen op productvelden.
        if (hasAlphaToken) {
          if (isNumeric) return productText.includes(token);
          if (isOrderLike) return combinedText.includes(token);
          return productText.includes(token);
        }

        // Pure numerieke query's mogen breed zoeken (incl. ordernummer).
        return combinedText.includes(token);
      });
    });
  }, [myOrders, madeCountMap, stationCounterField, targetWeekNum, targetYearNum, showAllWeeks, sidebarSearch, isBM01, normalizedStationId, productionProgressMap, absCurrentReal]);

  // LOSSEN 12/18: gefilterde planning per machine (filter via filterbar)
  const lossenFilteredOrders = useMemo(() => {
    if (!lossenPlanningFilter) return filteredOrders;
    return filteredOrders.filter(o => {
      const machineNorm = (normalizeMachine(o.machine) || "").toUpperCase().trim();
      return machineNorm === lossenPlanningFilter;
    });
  }, [filteredOrders, lossenPlanningFilter]);

  const selectedOrder = useMemo(() => {
    const planningSource = isLossen1218Station ? lossenFilteredOrders : filteredOrders;
    const fromPlanning = planningSource.find(
      (o) => o.id === selectedOrderId || o.orderId === selectedOrderId
    );
    if (fromPlanning) return fromPlanning;

    // Fallback voor gevallen waarin selectie nog bestaat maar tijdelijk niet in de zichtbare lijst zit.
    return myOrders.find(
      (o) => o.id === selectedOrderId || o.orderId === selectedOrderId
    );
  }, [isLossen1218Station, lossenFilteredOrders, filteredOrders, myOrders, selectedOrderId]);

  const selectedWikkeling = useMemo(() => activeWikkelingen.find(p => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

  // Auto-focus voor scan input in wikkelen tab
  useEffect(() => {
    // Alleen auto-focus gebruiken als Scanner Modus AAN staat
    if (!scannerMode) return;

      const handleClick = (e) => {
        const target = e?.target;
        if (!target) return;
        if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
      
      if (activeTab === "wikkelen" && !selectedTrackedId && !productToRelease && !showStartModal) {
        scanInputRef.current?.focus();
      }
    };
    
    if (activeTab === "wikkelen") {
      scanInputRef.current?.focus();
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeTab, selectedTrackedId, productToRelease, showStartModal, scannerMode]);

  // Scan handler voor wikkelen tab
  const handleScan = (e) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim();
      if (!code) return;

      const codeUpper = code.toUpperCase();

      // Zelfde OK-QR als Nabewerken: alleen toegestaan op BH18 in de Wikkelen->Lossen overgang.
      if (codeUpper === QR_CODE_OK_CONFIRMATION) {
        const isWikkelenStep = (selectedWikkeling?.currentStep || "").toLowerCase() === "wikkelen";

        if (!isBH18) {
          notify(
            t(
              "digitalplanning.terminal.ok_qr_not_available",
              "OK-QR is op dit station niet beschikbaar. Gebruik deze alleen op BH18 (Wikkelen) en in Nabewerken/BM01."
            )
          );
          setScanInput("");
          setTimeout(() => {
            scanInputRef.current?.focus();
          }, 50);
          return;
        }

        if (selectedWikkeling && isWikkelenStep) {
          setProductToRelease(selectedWikkeling);
          setBulkProductsToRelease([]);
          setReleaseAutoApproveToken(Date.now());
          setScanInput("");
        } else {
          notify(
            t(
              "digitalplanning.terminal.select_active_bh18_before_qr",
              "Selecteer eerst een actief BH18-item in stap Wikkelen voordat je de OK-QR scant."
            )
          );
          setScanInput("");
          setTimeout(() => {
            scanInputRef.current?.focus();
          }, 50);
        }
        return;
      }
      
      const found = activeWikkelingen.find(i => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );

      const normalizedCode = code.toUpperCase();
      const lotMatches = activeWikkelingen.filter(
        (i) => String(i.lotNumber || "").toUpperCase() === normalizedCode
      );
      const conflictOnScannedLot = lotConflictMeta[normalizedCode]?.hasConflict;

      if (lotMatches.length > 1 && conflictOnScannedLot) {
        notify(
          t(
            "digitalplanning.terminal.lot_duplicate_conflict",
            "Lot {{code}} bestaat meerdere keren met verschillend product/order. Kies handmatig het juiste item in de lijst.",
            { code }
          )
        );
        setScanInput("");
        setTimeout(() => {
          scanInputRef.current?.focus();
        }, 50);
        return;
      }
      
      if (found) {
        setSelectedTrackedId(found.id);
        setScanInput("");
      } else {
        notify(
          t(
            "digitalplanning.terminal.item_not_found_active_winding",
            "Item {{code}} niet gevonden in actieve wikkelingen.",
            { code }
          )
        );
        setScanInput("");
      }
      // Na scan altijd weer focus op het scanveld
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  // Handlers
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleOpenReleaseModal = (product, bulkProducts = []) => {
    setProductToRelease(product || null);
    if (Array.isArray(bulkProducts) && bulkProducts.length > 1) {
      setBulkProductsToRelease(bulkProducts);
    } else {
      setBulkProductsToRelease([]);
    }
  };

  const handleViewDrawing = async (productId) => {
    if (!productId) return;
    try {
      if (typeof productId === 'object') {
        setViewingProduct(productId);
        return;
      }
      // 1. Direct op document ID
      const docRef = doc(db, ...PATHS.PRODUCTS, productId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setViewingProduct({ id: snap.id, ...snap.data() });
        return;
      }
      // 2. Zoek op articleCode
      const productsRef = collection(db, ...PATHS.PRODUCTS);
      const q = query(productsRef, where("articleCode", "==", productId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        setViewingProduct({ id: qSnap.docs[0].id, ...qSnap.docs[0].data() });
        return;
      }
      // 3. Materiaalvariant fallback: CST(C) ↔ EST(E) op positie 6
      const upper = String(productId).toUpperCase();
      let variantCode = null;
      if (upper.length >= 8) {
        if (upper[6] === "C") variantCode = upper.slice(0, 6) + "E" + upper.slice(7);
        else if (upper[6] === "E") variantCode = upper.slice(0, 6) + "C" + upper.slice(7);
      }
      if (variantCode) {
        const vq = query(productsRef, where("articleCode", "==", variantCode));
        const vSnap = await getDocs(vq);
        if (!vSnap.empty) {
          setViewingProduct({ id: vSnap.docs[0].id, ...vSnap.docs[0].data() });
          return;
        }
      }
      notify(t("digitalplanning.terminal.product_not_found"));
    } catch (err) {
      console.error("Fout bij laden product:", err);
    }
  };

  const handleStartProduction = async (
    order,
    lot,
    _stringCount,
    _manualOrderInput,
    _operatorInput,
    _selectedOperatorName,
    labelZplData,
    labelTemplateId,
    startOptions = {}
  ) => {
    const previousTab = activeTab;
    const shouldJumpToWinding = !isNabewerking && !isLossenStation && !isBM01 && !isBH31;

    try {
      const cleanOrderId = String(order.orderId).trim();
      const cleanItemCode = String(order.itemCode || order.productId).trim();
      const totalToProduce = Math.max(1, parseInt(_stringCount, 10) || 1);
      const startLot = String(lot || "").trim().toUpperCase();
      const seriesGroupId =
        startOptions?.seriesGroupId ||
        (totalToProduce > 1
          ? `${String(order?.orderId || "ORDER").replace(/[^a-zA-Z0-9]/g, "_")}_${startLot}`
          : null);

      setShowStartModal(false);
      if (shouldJumpToWinding) {
        setActiveTab("wikkelen");
      }

      const startResult = await startProductionLots({
        orderDocId: order.id,
        orderId: cleanOrderId,
        itemCode: cleanItemCode,
        item: order.item || "",
        lotStart: startLot,
        totalToProduce,
        stationId: effectiveStationId,
        stationLabel: stationName,
        actorLabel: user?.email || "Operator",
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: labelTemplateId || "",
        seriesGroupId,
        isFlangeSeries: !!startOptions?.isFlangeSeries,
      });

      const createdLots = Array.isArray(startResult?.createdLots)
        ? startResult.createdLots
        : [startResult?.firstLot || startLot].filter(Boolean);

      void logActivity(
        user?.uid || "system",
        "ORDER_RELEASE",
        `Terminal start productie: order ${order.orderId}, station ${effectiveStationId}, lots ${createdLots.join(", ")}`
      ).catch((logError) => {
        console.error("LogActivity fout na productie-start:", logError);
      });
    } catch (err) {
      console.error("Fout bij starten productie:", err);
      setShowStartModal(true);
      setActiveTab(previousTab);
      throw err;
    }
  };

  const handleRepair = (item) => {
    setItemToRepair(item);
    setShowRepairModal(true);
  };

  const handleRepairComplete = async (data) => {
    if (!itemToRepair) return;
    try {
      await completeTrackedProductRepair({
        productId: itemToRepair.id || itemToRepair.lotNumber,
        station: effectiveStationId,
        actions: data.actions || [],
        note: data.notes || "",
        actorLabel: user?.email || "Operator",
        source: "Terminal",
      });

        await logActivity(
          user?.uid || "system",
          "QUALITY_REPAIR_COMPLETE",
          `Reparatie voltooid: lot ${itemToRepair.lotNumber || itemToRepair.id}, station ${effectiveStationId}`
        );

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

  if (isSimpleViewStation) {
    if (isNabewerking) {
      return (
        <div className="flex-1 overflow-hidden h-full text-left">
          <Nabewerken products={allTracked} orders={orders} />
        </div>
      );
    }
    if (isMazak) {
      return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
          <div className="flex-1 overflow-hidden h-full text-left">
            <MazakView stationId={effectiveStationId} products={allTracked} />
          </div>
        </div>
      );
    }
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
          <div className="flex items-center justify-center relative">
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-xl">
              {(() => {
                const tabLabels = isLossen1218Station
                  ? [t("digitalplanning.terminal.tab_lossen"), t("digitalplanning.terminal.tab_planning")]
                  : isBM01
                    ? [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_to_offer")]
                    : isGereedTabSourceStation
                      ? [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_winding"), t("digitalplanning.terminal.tab_ready", "Gereed")]
                      : [t("digitalplanning.terminal.tab_planning"), t("digitalplanning.terminal.tab_winding"), t("digitalplanning.terminal.tab_lossen")];

                const tabKeys = isLossen1218Station
                  ? ["lossen", "planning"]
                  : isBM01
                    ? ["planning", "aan te bieden"]
                    : isGereedTabSourceStation
                      ? ["planning", "wikkelen", "gereed"]
                      : ["planning", "wikkelen", "lossen"];

                return tabLabels.map((tabLabel, idx) => {
                  const tabKey = tabKeys[idx];
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
                });
              })()}
            </div>

            {/* Scanner Mode Toggle */}
            {activeTab === "wikkelen" && (
                <button 
                    onClick={() => setScannerMode(!scannerMode)}
                    className={`absolute right-0 md:right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-2 rounded-lg border-2 font-bold text-[10px] uppercase tracking-widest transition-all ${scannerMode ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-400'}`}
                  title={scannerMode ? t("digitalplanning.terminal.scanner_keyboard_hidden", "Toetsenbord verborgen (Scanner modus)") : t("digitalplanning.terminal.normal_input", "Normale invoer")}
                >
                    {scannerMode ? <ScanBarcode size={16} /> : <Keyboard size={16} />}
                  <span className="hidden sm:inline">{scannerMode ? t("digitalplanning.terminal.scanner", "Scanner") : t("digitalplanning.terminal.keyboard", "Toetsenbord")}</span>
                </button>
            )}
          </div>
        </div>

      {/* CONTENT GEBIED */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {
          /* STANDAARD PLANNING & WIKKELEN FLOW */
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row text-left">
            {activeTab === "planning" && isLossen1218Station ? (
              /* LOSSEN 12/18: Volledige planning van BH12/15/17/18 met machinefilter */
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Machine filter bar */}
                <div className="flex items-center gap-2 px-3 pt-2 pb-2 bg-white border-b border-slate-100 shrink-0 flex-wrap">
                  {[null, "BH12", "BH15", "BH17", "BH18"].map(f => (
                    <button
                      key={f ?? "all"}
                      onClick={() => setLossenPlanningFilter(f)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        lossenPlanningFilter === f
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {f ?? t("common.all", "Alles")}
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-auto">
                    {lossenFilteredOrders.length} {t("digitalplanning.terminal.orders", "orders")}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <TerminalPlanningView
                    orders={lossenFilteredOrders}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={setSelectedOrderId}
                    searchTerm={sidebarSearch}
                    onSearchChange={setSidebarSearch}
                    referenceDate={referenceDate}
                    onDateChange={(direction) => {
                      if (direction === 'reset') setReferenceDate(new Date());
                      else setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1));
                    }}
                    showAllWeeks={showAllWeeks}
                    onToggleAllWeeks={() => setShowAllWeeks(!showAllWeeks)}
                    targetWeekNum={targetWeekNum}
                    productionProgressMap={productionProgressMap}
                    rejectedCountMap={rejectedCountMap}
                    readyForReturnMap={readyForReturnMap}
                    isBM01={false}
                    trackedProducts={allTracked}
                    onStartProduction={null}
                    selectedOrder={selectedOrder}
                    onViewDrawing={handleViewDrawing}
                    repairItems={[]}
                    onRepair={null}
                    optimizationPanel={
                      <MalOptimizationPanel
                        currentOrder={selectedOrder}
                        allOrders={myOrders}
                        onSelectOrder={setSelectedOrderId}
                      />
                    }
                  />
                </div>
              </div>
            ) : activeTab === "planning" ? (
              <TerminalPlanningView
                orders={filteredOrders}
                selectedOrderId={selectedOrderId}
                onSelectOrder={setSelectedOrderId}
                searchTerm={sidebarSearch}
                onSearchChange={setSidebarSearch}
                referenceDate={referenceDate}
                onDateChange={(direction) => {
                  if (direction === 'reset') setReferenceDate(new Date());
                  else setReferenceDate(direction === 'prev' ? subWeeks(referenceDate, 1) : addWeeks(referenceDate, 1));
                }}
                showAllWeeks={showAllWeeks}
                onToggleAllWeeks={() => setShowAllWeeks(!showAllWeeks)}
                targetWeekNum={targetWeekNum}
                productionProgressMap={productionProgressMap}
                rejectedCountMap={rejectedCountMap}
                readyForReturnMap={readyForReturnMap}
                isBM01={isBM01}
                trackedProducts={allTracked}
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
                lotConflictMeta={lotConflictMeta}
                selectedTrackedId={selectedTrackedId}
                onSelectTracked={setSelectedTrackedId}
                selectedWikkeling={selectedWikkeling}
                onReleaseProduct={handleOpenReleaseModal}
                scanInput={scanInput}
                setScanInput={setScanInput}
                onScan={handleScan}
                scanInputRef={scanInputRef}
                scannerMode={scannerMode}
                onCancelProduction={onCancelProduction}
              />
            ) : activeTab === "gereed" ? (
              <TerminalGereedTab
                allTracked={allTracked}
                stationId={stationId}
                effectiveStationId={effectiveStationId}
              />
            ) : (
              /* TAB LOSSEN */
              <div className="flex-1 overflow-hidden h-full text-left">
                {isMazak ? (
                  <MazakView stationId={effectiveStationId} products={allTracked} />
                ) : (
                  <LossenView stationId={effectiveStationId} appId={appId} products={allTracked} />
                )}
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
          onStartInitiated={() => {
            setShowStartModal(false);
            if (!isNabewerking && !isLossenStation && !isBM01 && !isBH31) {
              setActiveTab("wikkelen");
            }
          }}
          onStart={handleStartProduction} existingProducts={allTracked}
        />
      )}
      
      {productToRelease && (
        <ProductReleaseModal
          isOpen={true} product={productToRelease}
          bulkProducts={bulkProductsToRelease}
          autoApproveTrigger={releaseAutoApproveToken}
          onClose={() => {
            setProductToRelease(null);
            setBulkProductsToRelease([]);
            setSelectedTrackedId(null);
          }}
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