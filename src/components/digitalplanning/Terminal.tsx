/* eslint-disable */
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
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
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
import { getOrderFinishedUnits } from "../../utils/planningProgress";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { shouldHidePlanningOrder } from "../../utils/terminalOrderFilters";

import TerminalPlanningView from "./terminal/TerminalPlanningView";
import TerminalProductionView from "./terminal/TerminalProductionView";
import TerminalManualInput from "./terminal/TerminalManualInput";
import TerminalGereedTab from "./terminal/TerminalGereedTab";
import MalOptimizationPanel from "./MalOptimizationPanel";
import MazakView from "./MazakView";
import RepairModal from "./modals/RepairModal";
import { useNotifications } from '../../contexts/NotificationContext';
import { queuePrintJob, startProductionLots } from "../../services/planningSecurityService";
import { completeTrackedProductRepair } from "../../services/planningSecurityService";

const QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";
const GEREED_TAB_SOURCE_STATIONS = new Set(["BH11", "BH12", "BH15", "BH16", "BH17", "BH18", "BH31"]);

declare const __app_id: string | undefined;

type StationLike = { id?: string; name?: string } | string | null | undefined;

type TrackedProductDoc = {
  id: string;
  orderId?: string;
  lotNumber?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  originMachine?: string;
  machine?: string;
  lastStation?: string;
  item?: string;
  itemCode?: string;
  itemDescription?: string;
  productId?: string;
  drawing?: string;
  isManualMove?: boolean;
  inspection?: {
    status?: string;
    [key: string]: unknown;
  };
  timestamps?: Record<string, unknown>;
  createdAt?: unknown;
  updatedAt?: unknown;
  [key: string]: unknown;
};

type PlanningOrder = {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  item?: string;
  itemCode?: string;
  productId?: string;
  machine?: string;
  originalMachine?: string;
  sourceStation?: string;
  returnStation?: string;
  station?: string;
  workstation?: string;
  machineId?: string;
  wc?: string;
  status?: string;
  plan?: number | string;
  quantity?: number | string;
  produced?: number | string;
  week?: string | number;
  weekNumber?: string | number;
  year?: string | number;
  weekYear?: string | number;
  dateObj?: any;
  sourcePath?: string;
  __docPath?: string;
  priority?: boolean | string;
  isMoved?: boolean;
  isUrgent?: boolean;
  [key: string]: unknown;
};

type EnrichedPlanningOrder = PlanningOrder & {
  produced: number;
  startedAtStation: number;
  parsedYear?: number;
  parsedWeek?: number;
};

type TerminalProps = {
  initialStation?: StationLike;
  onCancelProduction?: (productId: string) => void;
  orders?: PlanningOrder[];
};

/**
 * Workstation Terminal - V22.5
 * - Oplossing voor 2026 weeknotatie (W3 vs W03).
 * - Automatische selectie-reset bij navigatie.
 * - Alles-knop toegevoegd en zoekknop uit toolbar verwijderd.
 */
const Terminal = ({ initialStation, onCancelProduction, orders = [] }: TerminalProps) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();

  // Station configuratie
  const stationId = initialStation && typeof initialStation === "object" ? initialStation.id : initialStation;
  const stationName = initialStation && typeof initialStation === "object" ? initialStation.name : initialStation;
  const effectiveStationId = (stationName || stationId) as string;
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
  const [lossenPlanningFilter, setLossenPlanningFilter] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState<PlanningOrder[]>([]);
  const [allTracked, setAllTracked] = useState<TrackedProductDoc[]>([]);
  const [archiveTrackedItems, setArchiveTrackedItems] = useState<TrackedProductDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTrackedId, setSelectedTrackedId] = useState<string | null>(null);
  const [planningSearch, setPlanningSearch] = useState("");
  const [wikkelenSearch, setWikkelenSearch] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [productToRelease, setProductToRelease] = useState<TrackedProductDoc | null>(null);
  const [bulkProductsToRelease, setBulkProductsToRelease] = useState<TrackedProductDoc[]>([]);
  const [releaseAutoApproveToken, setReleaseAutoApproveToken] = useState(0);
  const [viewingProduct, setViewingProduct] = useState<TrackedProductDoc | null>(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [itemToRepair, setItemToRepair] = useState<TrackedProductDoc | null>(null);
  const [pendingQcSteekproefLot, setPendingQcSteekproefLot] = useState<string | null>(null);
  const [releaseDefaultStatus, setReleaseDefaultStatus] = useState<string | undefined>(undefined);
  const [releaseDefaultReasons, setReleaseDefaultReasons] = useState<string[] | undefined>(undefined);

  // Scan functionaliteit voor wikkelen tab
  const [scanInput, setScanInput] = useState("");
  const [scannerMode, setScannerMode] = useState(true);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

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
  const parseDateSafe = (dateInput: unknown) => {
    return toDateSafe(dateInput as any);
  };

  const normalizePlanningStatus = (status: unknown) => String(status || "").trim().toLowerCase();

  const normalizeTrackedStatus = (status: unknown) => String(status || "").trim().toLowerCase();

  const isTrackedProductionActive = (product: TrackedProductDoc) => {
    const status = normalizeTrackedStatus(product?.status);
    return ["in production", "in productie", "held_qc", "in_progress", "paused"].includes(status);
  };

  const isInactivePlanningStatus = (status: unknown) => {
    const normalized = normalizePlanningStatus(status);
    return ["completed", "cancelled", "shipped", "rejected", "finished", "deleted"].includes(normalized);
  };

  const isPlannedLikeStatus = (status: unknown) => {
    const normalized = normalizePlanningStatus(status);
    return ["planned", "delegated", "pending", "waiting"].includes(normalized);
  };

  const isDefinitiveRejectedOrRemoved = (product: TrackedProductDoc) => {
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

  const toFiniteNumber = (value: unknown) => {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;

    const raw = String(value || "").trim();
    if (!raw) return 0;
    const normalized = raw.replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
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
    const byYear: Record<number, TrackedProductDoc[]> = {};

    const syncCombined = () => {
      if (!isMounted) return;
      const combined = Object.values(byYear).flatMap((items) => items || []);
      setArchiveTrackedItems(combined);
    };

    const unsubs = years.map((year) =>
      onSnapshot(
        query(
          collection(db, getArchiveItemsPath(year).join("/")),
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
    const map = new Map<string, { active: number; total: number }>();
    const stationNorm = String(normalizedStationId || "").toUpperCase().trim();
    const stationClean = stationNorm.replace(/\s/g, "");
    const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(stationClean);

    const matchesStation = (value: unknown) => {
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
      if (product.isVirtualLot) return;
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
      const isWaitingForLossen = stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN";
      const isClosed =
        ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) ||
        stepUpper === "FINISHED" ||
        stepUpper === "REJECTED" ||
        (isWikkelToLossenSourceStation && !isBH18 && isWaitingForLossen);

      const entry = map.get(orderId) || { active: 0, total: 0 };
      entry.total += 1;
      if (!isClosed) entry.active += 1;
      map.set(orderId, entry);
    });

    return map;
  }, [allTracked, normalizedStationId]);

  // Centrale gemaakte teller: unieke lots per order uit tracked + archief.
  const madeCountMap = useMemo(() => {
    const perOrderLots = new Map<string, Set<string>>();

    const addLot = (orderIdRaw: unknown, lotRaw: unknown) => {
      const orderId = String(orderIdRaw || "").trim();
      const lot = String(lotRaw || "").trim();
      if (!orderId || !lot) return;
      if (!perOrderLots.has(orderId)) perOrderLots.set(orderId, new Set<string>());
      perOrderLots.get(orderId)?.add(lot);
    };

    allTracked.forEach((p) => {
      if (isDefinitiveRejectedOrRemoved(p)) return;
      if (p.isVirtualLot) return;
      addLot(p?.orderId, p?.lotNumber || p?.id);
    });

    archiveTrackedItems.forEach((p) => {
      if (isDefinitiveRejectedOrRemoved(p)) return;
      if (p.isVirtualLot) return;
      addLot(p?.orderId, p?.lotNumber || p?.id);
    });

    const result: Record<string, number> = {};
    perOrderLots.forEach((lots, orderId) => {
      result[orderId] = lots.size;
    });
    return result;
  }, [allTracked, archiveTrackedItems]);

  // Gefilterde data voor het huidige station
  const myOrders = useMemo(() => {
    if (isBM01) return allOrders;
    if (isLossen1218Station) {
      const sourceMachines = new Set(["BH12", "BH15", "BH17", "BH18", "12", "15", "17", "18"]);
      const isLossenOrder = (order: PlanningOrder) => {
        const values = [
          order?.machine,
          order?.originalMachine,
          order?.sourceStation,
          order?.returnStation,
          order?.station,
          order?.workstation,
          order?.machineId,
          order?.wc,
        ];

        const normalized = values
          .map((value: unknown) => (normalizeMachine(value) || "").toUpperCase().trim())
          .filter(Boolean);

        const path = String(order?.__docPath || order?.sourcePath || "").toUpperCase();
        if (path.includes("BH12") || path.includes("40BH12")) normalized.push("BH12");
        if (path.includes("BH15") || path.includes("40BH15")) normalized.push("BH15");
        if (path.includes("BH17") || path.includes("40BH17")) normalized.push("BH17");
        if (path.includes("BH18") || path.includes("40BH18")) normalized.push("BH18");

        return normalized.some((candidate) => sourceMachines.has(candidate));
      };

      return allOrders.filter(isLossenOrder);
    }

    const waitingForLossenOnlyByOrder = new Map<string, { totalActive: number; waitingForLossen: number }>();
    if (["BH12", "BH15", "BH17", "BH18"].includes(cleanStationId)) {
      allTracked.forEach((p) => {
        const orderId = String(p?.orderId || "").trim();
        if (!orderId) return;

        const stationNorm = (normalizeMachine(p?.originMachine || p?.machine || p?.currentStation) || "").toUpperCase().trim();
        if (stationNorm !== normalizedStationId) return;

        const statusUpper = String(p?.status || "").toUpperCase();
        const stepUpper = String(p?.currentStep || "").toUpperCase();
        const isActive =
          !["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper) &&
          stepUpper !== "FINISHED" &&
          stepUpper !== "REJECTED";
        if (!isActive) return;

        const entry = waitingForLossenOnlyByOrder.get(orderId) || { totalActive: 0, waitingForLossen: 0 };
        entry.totalActive += 1;
        if (stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN") {
            entry.waitingForLossen += 1;
        }
        waitingForLossenOnlyByOrder.set(orderId, entry);
      });
    }

    const result = allOrders.filter((o: PlanningOrder) => {
      const machineNorm = (normalizeMachine(o.machine) || "").toUpperCase().trim();
      const returnNorm = (normalizeMachine(o.returnStation) || "").toUpperCase().trim();
        const orderId = String(o.orderId || "").trim();
        const startedAtStation = Number(stationCounterField ? o?.[stationCounterField] || 0 : 0);
        const planAtStation = Number(o.plan || o.quantity || 0);
        const actualStartedCount = madeCountMap[orderId] || 0;
        const hasShortage = planAtStation > 0 && actualStartedCount < planAtStation;
        const hasRemainingPlan = (startedAtStation > 0 && planAtStation > startedAtStation) || hasShortage;
        const meta = stationOrderMeta.get(orderId);
        const hasStationActivity = (meta?.active || 0) > 0;

        const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(cleanStationId);
        if (isWikkelToLossenSourceStation) {
          const waitingOnlyMeta = waitingForLossenOnlyByOrder.get(orderId);
          // Wikkelmachine: laat filteredOrders/shouldHidePlanningOrder via readyForReturnMap oordelen.
          // Lot met step "Wacht op Lossen" is fysiek nog op BH18 en moet zichtbaar blijven.
          const realRemainingToStart = Math.max(0, planAtStation - actualStartedCount);
          const computedRemainingQueue = Math.max(0, planAtStation - startedAtStation, realRemainingToStart);
          
          if (
            !isBH18 &&
            waitingOnlyMeta &&
            waitingOnlyMeta.totalActive > 0 &&
            waitingOnlyMeta.waitingForLossen === waitingOnlyMeta.totalActive &&
            computedRemainingQueue <= 0  // Verberg alleen als er ook geen resterende startvolgorde meer is
          ) {
            return false;
          }

          const waitingForLossenCount = allTracked.filter((p) => {
            if (String(p?.orderId || "").trim() !== orderId) return false;
            const stationNorm = (normalizeMachine(p?.originMachine || p?.machine || p?.currentStation) || "").toUpperCase().trim();
            if (stationNorm !== normalizedStationId) return false;
            const stepUpper = String(p?.currentStep || "").toUpperCase();
            const statusUpper = String(p?.status || "").toUpperCase();
            return stepUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("WACHT OP LOSSEN") || statusUpper.includes("TE LOSSEN") || stepUpper === "LOSSEN";
          }).length;

          if (!isBH18 && waitingForLossenCount > 0 && !hasStationActivity && computedRemainingQueue <= 0) {
            return false;
          }
        }

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
    const map: Record<string, number> = {};
    allTracked.forEach((p) => {
      if (p.isVirtualLot) return;
      const oid = String(p.orderId || "").trim();
      if (!oid) return;
      // Alleen actieve (niet-afgeronde) producten tellen mee
      const statusUpper = String(p.status || "").toUpperCase();
      const stepUpper = String(p.currentStep || "").toUpperCase();
      const isDone = ["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR"].includes(statusUpper)
        || stepUpper === "FINISHED" || stepUpper === "REJECTED";
      if (isDone) return;
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
    });
    return map;
  }, [allTracked]);

  const rejectedCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    allTracked.forEach((p) => {
      if (p.isVirtualLot) return;
      const oid = String(p.orderId || "").trim();
      if (!oid) return;
      const statusValue = String(p.status || "");
      const isRejected = ['rejected', 'Rejected', 'AFKEUR', 'REJECTED'].includes(statusValue) || p.currentStep === 'REJECTED';
      if (!isRejected) return;
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
    });
    return map;
  }, [allTracked]);

  const readyForReturnMap = useMemo(() => {
    const map: Record<string, number> = {};
    allTracked.forEach((p) => {
      if (p.isVirtualLot) return;
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

  const waitingForLossenMap = useMemo(() => {
    const map: Record<string, number> = {};
    allTracked.forEach((p) => {
      if (p.isVirtualLot) return;
      const originNorm = (normalizeMachine(p.originMachine || p.machine || p.currentStation) || "").toUpperCase().trim();
      const stepNorm = String(p.currentStep || "").trim().toLowerCase();
      const statusNorm = String(p.status || "").trim().toLowerCase();

      if (originNorm !== normalizedStationId) return;
      
      const isWaiting = stepNorm.includes("wacht op lossen") || 
                        statusNorm.includes("wacht op lossen") || 
                        statusNorm.includes("te lossen") ||
                        stepNorm === "lossen";
      if (!isWaiting) return;

      const oid = String(p.orderId || "").trim();
      if (!oid) return;
      if (!map[oid]) map[oid] = 0;
      map[oid]++;
    });
    return map;
  }, [allTracked, normalizedStationId]);

  const activeWikkelingen = useMemo(() => {
    const active = allTracked
      .filter(p => {
        if (p.isVirtualLot) return false;
        const currentNorm = (normalizeMachine(p.currentStation) || "").toUpperCase().trim();
        const fallbackNorm = (normalizeMachine(p.originMachine || p.machine) || "").toUpperCase().trim();

        // currentStation is leidend; fallback alleen voor legacy records zonder currentStation.
        if (currentNorm) return currentNorm === normalizedStationId;
        return fallbackNorm === normalizedStationId;
      })
      .filter((p) => isTrackedProductionActive(p));
    
    if (!wikkelenSearch) return active;
    const term = wikkelenSearch.toLowerCase();
    return active.filter(p => (p.lotNumber || "").toLowerCase().includes(term) || (p.orderId || "").toLowerCase().includes(term));
  }, [allTracked, normalizedStationId, wikkelenSearch]);

  const lotConflictMeta = useMemo(() => {
    const buckets = new Map<string, { productSignatures: Set<string>; orderIds: Set<string> }>();

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

    const meta: Record<string, { hasConflict: boolean; productCount: number; orderCount: number }> = {};
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

  const filteredOrders = useMemo<EnrichedPlanningOrder[]>(() => {
    // Eerst verrijken met live data
    const enrichedOrders: EnrichedPlanningOrder[] = myOrders.map((o: PlanningOrder) => ({
        ...o,
        // Lot-first: unieke lots uit tracked+archief zijn de primaire bron.
        // Legacy velden blijven als fallback om ondertelling te voorkomen.
        produced: getOrderFinishedUnits(o, {
          trackedFinishedCount: Number(madeCountMap[String(o.orderId || "").trim()]) || 0,
        }),
        startedAtStation: Number(o[stationCounterField] || 0)
    }));

    const base = enrichedOrders.filter((o: EnrichedPlanningOrder) => {
      // Bepaal de effectieve geplande hoeveelheid.
      // Als plan handmatig omlaag is gezet (bijv. "nog maar 1 maken van de 7"), wint plan.
      // Anders wint de hoogste waarde (bijv. bij een verhoging).
      const rawQuantity = toFiniteNumber(o.quantity);
      const rawPlanVal = toFiniteNumber(o.plan);
      const quantity = rawPlanVal > 0 && rawPlanVal < rawQuantity ? rawPlanVal : Math.max(rawQuantity, rawPlanVal);
      const startedAtStation = toFiniteNumber(o.startedAtStation);
      const producedAtOrder = toFiniteNumber(o.produced);
      const orderId = String(o.orderId || "").trim();
      const madeCount = madeCountMap[orderId] || 0;
      const liveStartedCount = productionProgressMap[orderId] || 0;
      const hasActiveTracked = liveStartedCount > 0;
      let hasStationActivity = (readyForReturnMap[orderId] || 0) > 0;
      const waitingForLossenCount = waitingForLossenMap[orderId] || 0;
      
      if (isBH18 && waitingForLossenCount > 0) {
        hasStationActivity = true;
      }
      const stationPlan = quantity;
      
      const isActiveStatus = !isInactivePlanningStatus(o.status);
      // Detecteer of er een ECHT tekort is: we hebben recente lots gevonden (madeCount > 0) maar minder dan gepland.
      // Dit voorkomt dat oude "spook"-orders waarvan de lots gearchiveerd zijn onterecht weer opduiken.
      const hasShortage = stationPlan > 0 && madeCount > 0 && madeCount < stationPlan;
      const effectiveStarted = (hasShortage && isActiveStatus) ? madeCount : startedAtStation;
      const bh18StartedCount = isBH18 && isActiveStatus
        ? Math.min(stationPlan || Number.POSITIVE_INFINITY, Math.max(effectiveStarted, liveStartedCount))
        : effectiveStarted;
      const remainingAtOrder = Math.max(0, stationPlan - bh18StartedCount);
      const isFullyProduced = quantity > 0 && producedAtOrder >= quantity;
      const stationWorkCompleted = quantity > 0 && remainingAtOrder <= 0;

      // BH filter logic is now strictly based on To Do amount, so we don't need additional patches here.
      const isWikkelToLossenSourceStation = ["BH12", "BH15", "BH17", "BH18"].includes(cleanStationId);
      if (isWikkelToLossenSourceStation) {
        const producedDisplay = Math.max(producedAtOrder, madeCount);
        const rejectedCount = rejectedCountMap[orderId] || 0;
        const effectiveGood = Math.max(producedDisplay - rejectedCount, 0);
        const exactToDo = Math.max(0, stationPlan - effectiveGood);
        
        if (exactToDo <= 0) {
          return false;
        }
      }

      // LOSSEN 12/18 UITZONDERING: order blijft in de lijst zolang er nog actieve tracked
      // producten zijn voor deze order. Verdwijnt pas als alles volledig afgerond is.
      if (isLossen1218Station) {
        if (!hasActiveTracked && isInactivePlanningStatus(o.status)) return false;
        if (!hasActiveTracked && isFullyProduced) return false;
        // Verberg Lossen 12/18 orders die absoluut inactief zijn (cancelled, deleted)
        const statusLower = String(o.status || "").toLowerCase();
        if (["cancelled", "deleted", "shipped"].includes(statusLower)) return false;
        return true;
      }

      // Reguliere stations: verberg zodra orderniveau geen resterende stuks meer heeft.
      // Uitzondering: als er nog actieve tracked lots zijn, blijft de order zichtbaar —
      // er kan nog work-in-progress zijn dat nog niet in produced/madeCount is verwerkt.
      if (!isBM01 && remainingAtOrder <= 0 && (stationWorkCompleted || isFullyProduced) && !hasActiveTracked && !hasStationActivity) return false;

      // Volledig geproduceerd zonder actieve lots → altijd verbergen, ook als status "In Productie" is.
      // Dit vangt orders waarbij de station-counter ontbreekt maar madeCount >= quantity.
      if (isFullyProduced && !hasActiveTracked && !hasStationActivity) return false;

      // Als een order opnieuw opengezet is via plan-verhoging (bijv. 10 -> 17),
      // moet deze zichtbaar blijven zolang er orderniveau resthoeveelheid is.
      const isManuallyIncreased = rawPlanVal > rawQuantity;
      if (isInactivePlanningStatus(o.status) && !hasStationActivity && !hasActiveTracked) {
          if (!(isManuallyIncreased && madeCount < rawPlanVal)) {
              return false;
          }
      }
      
      // FIX: BH31 (Reparatie) orders verdwijnen uit planning zodra ze in behandeling zijn
      // Tenzij er specifiek naar gezocht wordt
      const isRepairStation = normalizedStationId === "BH31" || normalizedStationId.includes("REPARATIE") || normalizedStationId.includes("SPECIAL");
      if (isRepairStation && !planningSearch) {
          const oid = String(o.orderId || "").trim();
          const started = productionProgressMap[oid] || 0;
          if (started > 0 || ["in_progress", "in production", "in productie"].includes(String(o.status || "").trim().toLowerCase())) return false;
      }

      // BM01: Geen week filter, toon alles (behalve als search actief is, wat hieronder gebeurt)
      if (isBM01) return true;

      if (showAllWeeks || planningSearch) return true;
      
      // FORCEER ZICHTBAARHEID ALS ER ACTIVITEIT IS (ZELFS ALS WEEK NIET MATCHT)
      if (hasStationActivity || hasActiveTracked) return true;

      const absOrder = (o.parsedYear || 0) * 52 + (o.parsedWeek || 0);
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

    if (!planningSearch) {
      return base.sort((a, b) => {
        const priorityRank = (order: EnrichedPlanningOrder) => {
          if (order?.demandOrder) return 4; // Pegging/Demand Order heeft absolute prioriteit
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

        const absOrderA = (a.parsedYear || 0) * 52 + (a.parsedWeek || 0);
        const absOrderB = (b.parsedYear || 0) * 52 + (b.parsedWeek || 0);
        
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
    
    const searchValue = String(planningSearch || "").toLowerCase().trim();
    const tokens = searchValue.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) return base;

    const hasAlphaToken = tokens.some((t) => /[a-z]/i.test(t));

    return base.filter((o: EnrichedPlanningOrder) => {
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
  }, [myOrders, madeCountMap, stationCounterField, targetWeekNum, targetYearNum, showAllWeeks, planningSearch, isBM01, isBH18, normalizedStationId, productionProgressMap, waitingForLossenMap, readyForReturnMap, absCurrentReal]);

  // LOSSEN 12/18: gefilterde planning per machine (filter via filterbar)
  const lossenFilteredOrders = useMemo(() => {
    if (!lossenPlanningFilter) return filteredOrders;
    return filteredOrders.filter((o: EnrichedPlanningOrder) => {
      const machineNorm = (normalizeMachine(o.machine) || "").toUpperCase().trim();
      return machineNorm === lossenPlanningFilter;
    });
  }, [filteredOrders, lossenPlanningFilter]);

  const selectedOrder = useMemo<EnrichedPlanningOrder | PlanningOrder | null>(() => {
    const planningSource = isLossen1218Station ? lossenFilteredOrders : filteredOrders;
    const fromPlanning = planningSource.find(
      (o) => o.id === selectedOrderId || o.orderId === selectedOrderId
    );
    if (fromPlanning) return fromPlanning;

    // Fallback voor gevallen waarin selectie nog bestaat maar tijdelijk niet in de zichtbare lijst zit.
    return myOrders.find(
      (o) => o.id === selectedOrderId || o.orderId === selectedOrderId
    ) || null;
  }, [isLossen1218Station, lossenFilteredOrders, filteredOrders, myOrders, selectedOrderId]);

  const selectedWikkeling = useMemo(() => activeWikkelingen.find(p => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

  // Auto-focus voor scan input in wikkelen tab
  useEffect(() => {
    // Alleen auto-focus gebruiken als Scanner Modus AAN staat
    if (!scannerMode) return;

      const handleClick = (e: MouseEvent) => {
        const target = e?.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [data-scan-ignore]')) return;
      
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
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim();
      if (!code) return;

      const codeUpper = code.toUpperCase();

      // Zelfde OK-QR als Nabewerken: alleen toegestaan op BH18 in de Wikkelen->Lossen overgang.
      if (codeUpper === QR_CODE_OK_CONFIRMATION) {
        const isWikkelenStep = (selectedWikkeling?.currentStep || "").toLowerCase() === "wikkelen";

        if (!isBH18) {
          notify((String(t("digitalplanning.terminal.ok_qr_not_available", "OK-QR is op dit station niet beschikbaar. Gebruik deze alleen op BH18 (Wikkelen) en in Nabewerken/BM01."))) as any);
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
          notify((String(t("digitalplanning.terminal.select_active_bh18_before_qr", "Selecteer eerst een actief BH18-item in stap Wikkelen voordat je de OK-QR scant."))) as any);
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
        notify((String(t("digitalplanning.terminal.lot_duplicate_conflict", "Lot {{code}} bestaat meerdere keren met verschillend product/order. Kies handmatig het juiste item in de lijst.", { code }))) as any);
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
        notify((String(t("digitalplanning.terminal.item_not_found_active_winding", "Item {{code}} niet gevonden in actieve wikkelingen.", { code }))) as any);
        setScanInput("");
      }
      // Na scan altijd weer focus op het scanveld
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
    }
  };

  // Handlers
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const handleOpenReleaseModal = (product: TrackedProductDoc, bulkProducts: TrackedProductDoc[] = []) => {
    setProductToRelease(product || null);
    if (Array.isArray(bulkProducts) && bulkProducts.length > 1) {
      setBulkProductsToRelease(bulkProducts);
    } else {
      setBulkProductsToRelease([]);
    }
  };

  const handleViewDrawing = async (productId: string | TrackedProductDoc) => {
    if (!productId) return;
    try {
      if (typeof productId === 'object') {
        setViewingProduct(productId);
        return;
      }
      // 1. Direct op document ID
      const docRef = doc(db, `${getPathString(PATHS.PRODUCTS)}/${productId}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setViewingProduct({ id: snap.id, ...snap.data() });
        return;
      }
      // 2. Zoek op articleCode
      const productsRef = collection(db, getPathString(PATHS.PRODUCTS));
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
    notify((String(t("digitalplanning.terminal.product_not_found"))) as any);
    } catch (err) {
      console.error("Fout bij laden product:", err);
    }
  };

  const handleStartProduction = async (
    order: PlanningOrder,
    lot: string,
    _stringCount: number | string,
    _manualOrderInput?: string,
    _operatorInput?: string,
    _selectedOperatorName?: string,
    labelZplData?: string,
    labelTemplateId?: string,
    startOptions: Record<string, unknown> = {}
  ) => {
    const previousTab = activeTab;
    const shouldJumpToWinding = !isNabewerking && !isLossenStation && !isBM01 && !isBH31;

    try {
      const cleanOrderId = String(order.orderId).trim();
      const cleanItemCode = String(order.itemCode || order.productId).trim();
      const startLot = String(lot || "").trim().toUpperCase();
      const explicitLotNumbers = Array.isArray(startOptions?.lotNumbers)
        ? startOptions.lotNumbers.map((entry: unknown) => String(entry || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const totalToProduce = explicitLotNumbers.length > 0 ? explicitLotNumbers.length : Math.max(1, parseInt(String(_stringCount), 10) || 1);
      const seriesGroupId = String(startOptions?.seriesGroupId || "").trim() || null;

      setShowStartModal(false);
      if (shouldJumpToWinding) {
        setActiveTab("wikkelen");
      }

      const startResult = await startProductionLots({
        orderDocId: order.id as string,
        orderDocPath: order?.__docPath || "",
        orderSourcePath: order?.sourcePath || "",
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
        lotNumbers: explicitLotNumbers,
        stringCount: totalToProduce,
      }) as { createdLots?: string[], firstLot?: string };

      const createdLots = Array.isArray(startResult?.createdLots)
        ? startResult.createdLots
        : [startResult?.firstLot || startLot].filter(Boolean);

      const startLabelZpl = String(labelZplData || "").trim();
      const printerId = String((startOptions as any)?.printerId || "").trim();
      const skipStartLabel = Boolean((startOptions as any)?.skipStartLabel);
      const requestedLabelCount = Math.max(
        1,
        Number.parseInt(String((startOptions as any)?.requestedLabelCount || "1"), 10) || 1
      );

      if (!skipStartLabel && startLabelZpl && printerId) {
        try {
          await queuePrintJob(printerId, startLabelZpl, {
            source: "production_start",
            orderId: cleanOrderId,
            lotNumber: startLot,
            quantity: requestedLabelCount,
            labelCount: requestedLabelCount,
            forceQuantityCopies: true,
            stationId: effectiveStationId,
            machineId: effectiveStationId,
            originMachine: effectiveStationId,
            labelTemplateId: String(labelTemplateId || "").trim(),
            description: `Startlabel voor ${cleanOrderId} (Lot: ${startLot}) (x${requestedLabelCount})`,
          });
        } catch (queueError) {
          console.error("Kon startlabel niet in de printqueue zetten:", queueError);
        }
      }

      if (startOptions?.isQcSteekproef && createdLots.length > 0) {
        setPendingQcSteekproefLot(createdLots[0]);
      }

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

  useEffect(() => {
    if (pendingQcSteekproefLot && allTracked && allTracked.length > 0) {
      const foundProduct = allTracked.find((p) => p.lotNumber === pendingQcSteekproefLot);
      if (foundProduct) {
        setProductToRelease(foundProduct as TrackedProductDoc);
        setReleaseDefaultStatus("rejected");
        setReleaseDefaultReasons(["rejection.qcSample"]);
        setPendingQcSteekproefLot(null);
      }
    }
  }, [allTracked, pendingQcSteekproefLot]);

  const handleRepair = (item: TrackedProductDoc) => {
    setItemToRepair(item);
    setShowRepairModal(true);
  };

  const handleRepairComplete = async (data: { actions?: string[], notes?: string }) => {
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
          <Nabewerken products={allTracked as any} orders={orders} />
        </div>
      );
    }
    if (isMazak) {
      return (
        <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
          <div className="flex-1 overflow-hidden h-full text-left">
            <MazakView stationId={effectiveStationId || undefined} products={allTracked as any} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in">
        <div className="flex-1 overflow-hidden h-full text-left">
          <LossenView stationId={effectiveStationId || undefined} appId={appId || undefined} products={allTracked as any} />
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
                <div className="flex-1 overflow-hidden flex lg:flex-row">
                <TerminalPlanningView
                    orders={lossenFilteredOrders as any}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={(id: string | null | undefined) => setSelectedOrderId(id || null)}
                    searchTerm={planningSearch}
                    onSearchChange={setPlanningSearch}
                    referenceDate={referenceDate}
                    onDateChange={(direction: 'reset' | 'prev' | 'next') => {
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
                    trackedProducts={allTracked as any}
                    onStartProduction={undefined}
                    selectedOrder={selectedOrder as any}
                    onViewDrawing={handleViewDrawing}
                    repairItems={[]}
                    onRepair={undefined}
                    optimizationPanel={
                      <MalOptimizationPanel
                        currentOrder={selectedOrder as any}
                        allOrders={myOrders as any[]}
                        onSelectOrder={(id: string | undefined) => setSelectedOrderId(id || null)}
                      />
                    }
                  />
                </div>
              </div>
            ) : activeTab === "planning" ? (
            <TerminalPlanningView
                orders={filteredOrders as any}
                selectedOrderId={selectedOrderId}
                onSelectOrder={(id: string | null | undefined) => setSelectedOrderId(id || null)}
                searchTerm={planningSearch}
                onSearchChange={setPlanningSearch}
                referenceDate={referenceDate}
                onDateChange={(direction: 'reset' | 'prev' | 'next') => {
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
                trackedProducts={allTracked as any}
                onStartProduction={() => setShowStartModal(true)}
                selectedOrder={selectedOrder as any}
                onViewDrawing={handleViewDrawing}
                repairItems={repairItems as any}
                onRepair={handleRepair}
                // Mal Optimalisatie: Toon gerelateerde orders in het paneel
                optimizationPanel={
                  <MalOptimizationPanel 
                    currentOrder={selectedOrder as any}
                    allOrders={myOrders as any[]}
                    onSelectOrder={(id: string | undefined) => setSelectedOrderId(id || null)}
                  />
                }
              />
            ) : activeTab === "wikkelen" ? (
              /* TAB WIKKELEN */
            <TerminalProductionView
                activeWikkelingen={activeWikkelingen as any}
                lotConflictMeta={lotConflictMeta}
                selectedTrackedId={selectedTrackedId}
                onSelectTracked={(id: string | null | undefined) => setSelectedTrackedId(id || null)}
                selectedWikkeling={selectedWikkeling}
                onReleaseProduct={handleOpenReleaseModal}
                scanInput={scanInput}
                setScanInput={setScanInput as any}
                onScan={handleScan as any}
                scanInputRef={scanInputRef}
                scannerMode={scannerMode}
                onCancelProduction={onCancelProduction}
                activeTab={activeTab}
              />
            ) : activeTab === "gereed" ? (
              <TerminalGereedTab
                allTracked={allTracked as any}
                stationId={stationId || undefined}
                effectiveStationId={effectiveStationId || undefined}
              />
            ) : (
              /* TAB LOSSEN */
              <div className="flex-1 overflow-hidden h-full text-left">
                {isMazak ? (
                  <MazakView stationId={effectiveStationId || undefined} products={allTracked as any} />
                ) : (
                  <LossenView stationId={effectiveStationId || undefined} appId={appId || undefined} products={allTracked as any} />
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
          if (activeTab === "wikkelen") {
            setWikkelenSearch(manualInputValue);
          } else {
            setPlanningSearch(manualInputValue);
          }
          setShowManualInput(false);
        }}
      />

      {showStartModal && selectedOrder && (
        <div className="fixed z-[9999]">
      <ProductionStartModal
            isOpen={true} onClose={() => setShowStartModal(false)}
            order={selectedOrder} stationId={stationId || undefined}
            onStartInitiated={() => {
              setShowStartModal(false);
              if (!isNabewerking && !isLossenStation && !isBM01 && !isBH31) {
                setActiveTab("wikkelen");
              }
            }}
          onStart={handleStartProduction} existingProducts={allTracked as any[]}
          />
        </div>
      )}
      
      {productToRelease && (
        <div className="fixed z-[9999]">
      <ProductReleaseModal
            isOpen={true} product={productToRelease}
          bulkProducts={bulkProductsToRelease}
            autoApproveTrigger={releaseAutoApproveToken}
            defaultStatus={releaseDefaultStatus}
            defaultReasons={releaseDefaultReasons}
            onClose={() => {
              setProductToRelease(null);
              setBulkProductsToRelease([]);
              setSelectedTrackedId(null);
              setReleaseDefaultStatus(undefined);
              setReleaseDefaultReasons(undefined);
            }}
            appId={appId || undefined}
          />
        </div>
      )}

      {showRepairModal && itemToRepair && (
        <div className="fixed z-[9999]">
          <RepairModal
              product={itemToRepair}
              onClose={() => { setShowRepairModal(false); setItemToRepair(null); }}
              onConfirm={handleRepairComplete}
          />
        </div>
      )}

      {viewingProduct && (
        <div className="fixed z-[9999]">
          <ProductDetailModal
            product={viewingProduct}
            onClose={() => setViewingProduct(null)}
            userRole={user?.role || "operator"}
          />
        </div>
      )}
    </>
  );
};

export default Terminal;
