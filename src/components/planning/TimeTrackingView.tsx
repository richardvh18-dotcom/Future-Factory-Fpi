import React, { useState, useEffect, useMemo } from "react";
import { 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Calendar,
  Building2
} from "lucide-react";
import { collection, collectionGroup, onSnapshot, doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getArchiveItemsPath, PATHS, getPathString } from "../../config/dbPaths";
import { format, getISOWeek, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfMonth, endOfMonth, isWithinInterval, isValid, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import { calculateDuration } from "../../utils/efficiencyCalculator";
import { calculateWorkingMinutes } from "../../utils/workingTimeUtils";
import { subscribeScopedEfficiencyHours } from "../../utils/efficiencyScopedReader";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useTranslation } from "react-i18next";

type AnyRecord = Record<string, unknown>;

type TimestampLike = {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
};

type DepartmentConfig = {
  id?: string;
  name?: string;
  isActive?: boolean;
};

type FactoryConfig = {
  departments: DepartmentConfig[];
};

type EfficiencyRow = {
  id?: string;
  orderId?: string;
  quantity?: string | number;
  productionTimeTotal?: string | number;
  postProcessingTimeTotal?: string | number;
  qcTimeTotal?: string | number;
  minutesPerUnit?: string | number;
  [key: string]: unknown;
};

type PlanningOrder = AnyRecord & {
  id?: string;
  orderId?: string;
  item?: string;
  itemCode?: string;
  extraCode?: string;
  quantity?: string | number;
  plan?: string | number;
  totalPlannedHours?: string | number;
  estimatedHours?: string | number;
  machine?: string;
  currentStation?: string;
  originMachine?: string;
  lastStation?: string;
  department?: string;
  departmentId?: string;
  deptId?: string;
  operations?: Record<string, { planned?: unknown; wc?: unknown }>;
};

type TrackingLog = AnyRecord & {
  id?: string;
  lotNumber?: string;
  orderId?: string;
  orderNumber?: string;
  originalOrderId?: string;
  productionOrderId?: string;
  item?: string;
  itemCode?: string;
  machine?: string;
  stationLabel?: string;
  currentStation?: string;
  lastStation?: string;
  originMachine?: string;
  department?: string;
  departmentId?: string;
  deptId?: string;
  status?: string;
  timestamps?: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  _archived?: boolean;
};

type OrderMetric = PlanningOrder & {
  planned: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: "on_track" | "over" | "under";
  hasEfficiency: boolean;
  lotCount: number;
  lotDetails: Array<LotMetric>;
  stationMetrics: {
    wikkelenHours: number;
    lossenHours: number;
    nabewerkingHours: number;
    bm01Hours: number;
    repairHours: number;
  };
  plannedStationMetrics: {
    wikkelenHours: number;
    lossenHours: number;
    nabewerkingHours: number;
    bm01Hours: number;
    repairHours: number;
  };
};

type StationMetrics = {
  wikkelenHours: number;
  lossenHours: number;
  nabewerkingHours: number;
  bm01Hours: number;
  repairHours: number;
};

type TimeBounds = {
  wikkelenStart: Date | null;
  wikkelenEnd: Date | null;
  lossenStart: Date | null;
  lossenEnd: Date | null;
  nabewerkingStart: Date | null;
  nabewerkingEnd: Date | null;
  repairStart: Date | null;
  repairEnd: Date | null;
  bm01Start: Date | null;
  bm01End: Date | null;
};

type LotMetric = {
  id?: string;
  lotNumber: string;
  machine: string;
  status: string;
  currentStation: string;
  actualHours: number;
  stationMetrics: StationMetrics;
  timeBounds: TimeBounds;
};

const toEpochMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof (value as TimestampLike)?.toMillis === "function") return (value as TimestampLike).toMillis?.() || 0;
  if (typeof (value as TimestampLike)?.toDate === "function") return (value as TimestampLike).toDate?.().getTime() || 0;
  if (typeof (value as TimestampLike)?.seconds === "number") return ((value as TimestampLike).seconds || 0) * 1000;
  const d = new Date(value as any);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};

/**
 * TimeTrackingView - Compare actual vs planned time
 * Shows time variance and identifies bottlenecks
 */
const TimeTrackingView = ({ initialDepartment = "ALLES" }) => {
  const { t } = useTranslation();
  const readPaths = PATHS;
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [, setOccupancy] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [efficiencyData, setEfficiencyData] = useState<Record<string, EfficiencyRow>>({});
  const [trackingLogs, setTrackingLogs] = useState<TrackingLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState("week");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState(initialDepartment || "ALLES");
  const [selectedMachine, setSelectedMachine] = useState("ALLES");
  const [departments, setDepartments] = useState<string[]>(["ALLES"]);
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig>({ departments: [] });
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<OrderMetric | null>(null);
  const [refOpsConfig, setRefOpsConfig] = useState<Record<string, AnyRecord>>({}); // { "1020": { type: "qc", ... }, ... }

  useEffect(() => {
    if (!readPaths) return;

    let rootOrders: PlanningOrder[] = [];
    let scopedOrders: PlanningOrder[] = [];

    const mergeOrders = () => {
      const merged = new Map<string, PlanningOrder>();
      [...rootOrders, ...scopedOrders].forEach((order, idx) => {
        const key = String(order.orderId || order.id || `order-${idx}`).trim();
        if (!key) return;
        merged.set(key, order);
      });
      setOrders(Array.from(merged.values()));
      setLoading(false);
    };

    const unsubRootOrders = onSnapshot(
      collection(db, getPathString(readPaths.PLANNING)),
      (snapshot) => {
        rootOrders = snapshot.docs.map((docSnap): PlanningOrder => ({ id: docSnap.id, __docPath: docSnap.ref.path, ...(docSnap.data() as AnyRecord) }));
        mergeOrders();
      },
      () => {
        rootOrders = [];
        mergeOrders();
      }
    );

    const unsubScopedOrders = onSnapshot(
      collectionGroup(db, "orders"),
      (snapshot) => {
        const planningPrefix = `${getPathString(readPaths.PLANNING)}/`;
        scopedOrders = snapshot.docs
          .filter((d) => {
            const path = d.ref.path || "";
            return (
              path.startsWith(planningPrefix) &&
              path.includes("/machines/") &&
              path.includes("/orders/")
            );
          })
          .map((docSnap) => ({ id: docSnap.id, __docPath: docSnap.ref.path, ...docSnap.data() }));
        mergeOrders();
      },
      () => {
        scopedOrders = [];
        mergeOrders();
      }
    );

    const unsubOccupancy = onSnapshot(
      collection(db, getPathString(readPaths.OCCUPANCY)),
      (snapshot) => {
        const occData = snapshot.docs.map((docEntry): AnyRecord => ({
          id: docEntry.id,
          ...(docEntry.data() as AnyRecord)
        }));
        setOccupancy(occData);
      }
    );

    // Load efficiency/imported hours (scoped)
    const unsubEfficiency = subscribeScopedEfficiencyHours({
      db,
      mode: "active",
      onData: (rows: Array<Record<string, unknown>>) => {
        const data: Record<string, EfficiencyRow> = {};
        rows.forEach((row) => {
          const key = String(row.orderId || row.id || "").trim();
          if (!key) return;
          data[key] = row as EfficiencyRow;
        });
        setEfficiencyData(data);
      },
      onError: (error) => {
        console.warn("Scoped efficiency listener failed:", error);
        setEfficiencyData({});
      },
    });

    // Laad LN Reference Operations stamdata voor DB-gestuurde uren-classificatie
    const unsubRefOps = onSnapshot(
      collection(db, getPathString(readPaths.REFERENCE_OPERATIONS)),
      (snapshot) => {
        const map: Record<string, AnyRecord> = {};
        snapshot.docs.forEach((docSnap) => {
          map[docSnap.id] = docSnap.data() as AnyRecord;
        });
        setRefOpsConfig(map);
      },
      () => {} // niet-kritiek, valt terug op hardcoded classificatie
    );

    // Load tracking logs for actuals calculation
    const mergeTrackingRows = (activeRows: TrackingLog[], archivedRows: TrackingLog[]) => {
      const mergedByLot = new Map<string, TrackingLog>();

      [...activeRows, ...archivedRows].forEach((row) => {
        const lotKey = String(row.lotNumber || row.id || `${row.orderId || ""}-${row.itemCode || ""}`).trim();
        if (!lotKey) return;

        const current = mergedByLot.get(lotKey);
        if (!current) {
          mergedByLot.set(lotKey, row);
          return;
        }

        const currentTsCount = Object.keys(current.timestamps || {}).length;
        const nextTsCount = Object.keys(row.timestamps || {}).length;
        const currentUpdated = toEpochMs(current.updatedAt || current.createdAt);
        const nextUpdated = toEpochMs(row.updatedAt || row.createdAt);

        // Neem de rijkste/nieuwste snapshot per lot (voorkomt root+scoped inconsistenties).
        if (nextTsCount > currentTsCount || (nextTsCount === currentTsCount && nextUpdated >= currentUpdated)) {
          mergedByLot.set(lotKey, {
            ...current,
            ...row,
            timestamps: { ...(current.timestamps || {}), ...(row.timestamps || {}) },
            history: Array.isArray(row.history) && row.history.length > 0 ? row.history : current.history,
          });
        }
      });

      setTrackingLogs(Array.from(mergedByLot.values()));
    };

    let rootTrackingRows: TrackingLog[] = [];
    let scopedTrackingRows: TrackingLog[] = [];
    let archivedTrackingRows: TrackingLog[] = [];

    const mergeAllTrackingRows = () => {
      mergeTrackingRows([...rootTrackingRows, ...scopedTrackingRows], archivedTrackingRows);
    };

    const unsubRootTracking = onSnapshot(
      collection(db, getPathString(readPaths.TRACKING)),
      (snapshot) => {
        rootTrackingRows = snapshot.docs.map((docEntry): TrackingLog => ({ id: docEntry.id, __docPath: docEntry.ref.path, ...(docEntry.data() as AnyRecord) }));
        mergeAllTrackingRows();
      },
      () => {
        rootTrackingRows = [];
        mergeAllTrackingRows();
      }
    );

    const unsubScopedTracking = onSnapshot(
      collectionGroup(db, "items"),
      (snapshot) => {
        scopedTrackingRows = snapshot.docs
          .filter((d) => {
            const path = d.ref.path || "";
            return path.includes("/production/tracked_products/") && path.includes("/items/");
          })
          .map((docSnap) => ({ id: docSnap.id, __docPath: docSnap.ref.path, ...docSnap.data() }));
        mergeAllTrackingRows();
      },
      () => {
        scopedTrackingRows = [];
        mergeAllTrackingRows();
      }
    );

    const archiveYear = selectedDate.getFullYear();
    const unsubArchiveTracking = onSnapshot(
      collection(db, getPathString(getArchiveItemsPath(archiveYear))),
      (snapshot) => {
        archivedTrackingRows = snapshot.docs.map((docEntry): TrackingLog => ({ id: docEntry.id, ...(docEntry.data() as AnyRecord), _archived: true, _archiveYear: archiveYear }));
        mergeAllTrackingRows();
      }
    );

    // Load departments from factory structure
    const unsubConfig = onSnapshot(
      doc(db, getPathString(readPaths.FACTORY_CONFIG)),
      (docSnap) => {
        if (docSnap.exists()) {
          const raw = docSnap.data() as AnyRecord;
          const data: FactoryConfig = {
            departments: Array.isArray(raw.departments)
              ? (raw.departments as DepartmentConfig[])
              : [],
          };
          setFactoryConfig(data);
          const depts = Array.isArray(data.departments) 
            ? data.departments.filter((d) => d.isActive !== false).map((d) => String(d.name || "")).filter(Boolean)
            : [];
          setDepartments(["ALLES", ...depts]);
        }
      }
    );

    return () => {
      unsubRootOrders();
      unsubScopedOrders();
      unsubOccupancy();
      unsubEfficiency();
      unsubRefOps();
      unsubRootTracking();
      unsubScopedTracking();
      unsubArchiveTracking();
      unsubConfig();
    };
  }, [readPaths, selectedDate]);

  useEffect(() => {
    if (!departments.length) return;

    const target = String(initialDepartment || "ALLES").trim();
    if (!target || target.toUpperCase() === "ALLES") {
      setSelectedDepartment("ALLES");
      return;
    }

    const targetLower = target.toLowerCase();
    const match = departments.find((dept) => {
      const normalized = String(dept || "").toLowerCase().trim();
      return (
        normalized === targetLower ||
        normalized.includes(targetLower) ||
        targetLower.includes(normalized)
      );
    });

    setSelectedDepartment(match || target);
  }, [initialDepartment, departments]);

  const toDateValue = (value: unknown): Date | null => {
    if (!value) return null;
    if (typeof (value as TimestampLike)?.toDate === "function") return (value as TimestampLike).toDate?.() || null;
    if (typeof (value as TimestampLike)?.seconds === "number") return new Date(((value as TimestampLike).seconds || 0) * 1000);
    const d = value instanceof Date ? value : new Date(value as any);
    return isValid(d) ? d : null;
  };

  const inferDepartmentFromMachine = (machine: unknown): string => {
    const m = normalizeMachine(machine || "");
    if (m.startsWith("BH")) return "Fittings";
    if (m.startsWith("BA")) return "Pipes";
    if (m.startsWith("BM")) return "Spools";
    return "";
  };

  const normalizeText = (value: unknown): string => String(value || "").trim().toLowerCase();

  const resolveDepartmentNameFromId = (departmentId: unknown): string => {
    if (!departmentId) return "";
    const idLower = String(departmentId).trim().toLowerCase();
    const dept = (factoryConfig.departments || []).find(
      (d) => String(d?.id || "").trim().toLowerCase() === idLower
    );
    return dept?.name || "";
  };

  const parseNumber = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const normalizeStatus = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  const COMPLETED_STATUSES = new Set([
    "completed",
    "finished",
    "gereed",
    "shipped",
    "completed_in_ln",
    "archived",
    "archived_completed",
  ]);

  const isCompletedLikeStatus = (value: unknown) => {
    const normalized = normalizeStatus(value);
    if (!normalized) return false;
    if (COMPLETED_STATUSES.has(normalized)) return true;
    return normalized.includes("gereed") || normalized.includes("finish") || normalized.includes("complet");
  };

  const isInProgressLikeStatus = (value: unknown) => {
    const normalized = normalizeStatus(value);
    if (!normalized) return false;
    if (isCompletedLikeStatus(normalized)) return false;

    return [
      "planned",
      "open",
      "pending",
      "in_progress",
      "in_behandeling",
      "wacht_op_lossen",
      "te_lossen",
      "te_keuren",
      "quality_check",
      "in_productie",
      "processing",
      "running",
    ].some((token) => normalized.includes(token));
  };

  const matchesStatusFilter = (order: PlanningOrder, relatedLogs: TrackingLog[]) => {
    if (filterStatus === "all") return true;

    const statusCandidates = [
      order?.status,
      order?.currentStep,
      order?.currentStation,
      ...(relatedLogs || []).flatMap((log) => [
        log?.status,
        log?.currentStep,
        log?.currentStation,
      ]),
    ].filter(Boolean);

    const hasArchivedLog = (relatedLogs || []).some((log) => Boolean(log?._archived));

    if (filterStatus === "gereed") {
      if (hasArchivedLog || order?._archived) return true;
      return statusCandidates.some((status) => isCompletedLikeStatus(status));
    }

    if (filterStatus === "in_behandeling") {
      if (hasArchivedLog || order?._archived) return false;
      const hasCompleted = statusCandidates.some((status) => isCompletedLikeStatus(status));
      if (hasCompleted) return false;
      return statusCandidates.some((status) => isInProgressLikeStatus(status)) || statusCandidates.length === 0;
    }

    return true;
  };

  const classifyByWc = (wc: unknown) => {
    const upper = String(wc || "").toUpperCase();
    if (upper.includes("BM01") || upper.includes("BA01")) return "qc";
    if (upper.includes("NABEWERK") || upper.includes("NABEW")) return "post";
    return null;
  };

  const classifyReferenceOperation = (refOp: unknown, wc: unknown) => {
    // 1. Database-gestuurde lookup
    if (refOpsConfig && refOp) {
      const entry = refOpsConfig[String(refOp).trim()];
      if (entry?.type) return String(entry.type);
    }
    // 2. WC-fallback
    const wcBucket = classifyByWc(wc);
    if (wcBucket) return wcBucket;
    // 3. Bekende hardcoded codes
    const knownTypes: Record<string, string> = { "1020": "qc", "1715": "production", "1740": "post", "1115": "post" };
    if (knownTypes[String(refOp).trim()]) return knownTypes[String(refOp).trim()];
    // 4. Modulo-heuristiek als laatste fallback
    const digits = parseInt(String(refOp || "").replace(/\D/g, ""), 10);
    if (Number.isNaN(digits)) return "production";
    const opCode = digits % 100;
    if (opCode === 60) return "qc";
    if (opCode === 30) return "post";
    return "production";
  };

  const getSplitPlannedHours = (operations: Record<string, { planned?: unknown; wc?: unknown }> | undefined, fallbackTotalHours = 0) => {
    const split = { productionHours: 0, postHours: 0, qcHours: 0 };
    const entries = Object.entries(operations || {}) as Array<[string, { planned?: unknown; wc?: unknown }]>;

    if (!entries.length) {
      return {
        ...split,
        totalHours: parseNumber(fallbackTotalHours),
        hasReferenceOps: false,
      };
    }

    entries.forEach(([refOp, values]) => {
      const planned = parseNumber(values?.planned);
      const bucket = classifyReferenceOperation(refOp, values?.wc);
      if (bucket === "qc") split.qcHours += planned;
      else if (bucket === "post") split.postHours += planned;
      else split.productionHours += planned;
    });

    const totalHours = split.productionHours + split.postHours + split.qcHours;
    return {
      ...split,
      totalHours,
      hasReferenceOps: true,
    };
  };

  const getOrderActualHours = (orderLike: AnyRecord | null | undefined) => {
    if (!orderLike) return 0;

    const hourCandidates = [
      orderLike.totalActualHours,
      orderLike.actualHours,
      orderLike.spentProductionTime,
      orderLike.hoursWorked,
      orderLike.productionHours,
    ];

    for (const candidate of hourCandidates) {
      const hours = parseNumber(candidate);
      if (hours > 0) return hours;
    }

    const minuteCandidates = [
      orderLike.actualMinutes,
      orderLike.totalActualMinutes,
      orderLike.spentMinutes,
      orderLike.productionMinutes,
    ];

    for (const candidate of minuteCandidates) {
      const minutes = parseNumber(candidate);
      if (minutes > 0) return minutes / 60;
    }

    return 0;
  };

  const getHistoryTimestampBy = (log: TrackingLog, matcher: (h: Record<string, unknown>) => boolean) => {
    if (!Array.isArray(log?.history)) return null;
    const row = log.history.find((h) => matcher(h || {}));
    return toDateValue(row?.timestamp);
  };

  const getLatestHistoryTimestampBy = (log: TrackingLog, matcher: (h: Record<string, unknown>) => boolean) => {
    if (!Array.isArray(log?.history)) return null;
    for (let i = log.history.length - 1; i >= 0; i -= 1) {
      const row = log.history[i] || {};
      if (matcher(row)) {
        return toDateValue(row?.timestamp);
      }
    }
    return null;
  };

  const getTimestampFromObject = (timestamps: Record<string, unknown> | undefined, keys: string[] = []) => {
    for (const key of keys) {
      const value = timestamps?.[key];
      const date = toDateValue(value);
      if (date) return date;
    }
    return null;
  };

  const getLogProcessBounds = (log: TrackingLog) => {
    const ts = log?.timestamps || {};

    const wikkelenStart =
      getTimestampFromObject(ts, ["wikkelen_start", "station_start", "production_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.action || "").toLowerCase().includes("start wikkelen")) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.action || "").toLowerCase().includes("start")) ||
      toDateValue(log?.createdAt);

    const wikkelenEnd =
      getTimestampFromObject(ts, ["wikkelen_end", "wacht_op_lossen_start", "lossen_start"]) ||
      getLatestHistoryTimestampBy(
        log,
        (h) => String(h?.details || "").toLowerCase().includes("wikkelen") && String(h?.details || "").toLowerCase().includes("wacht op lossen")
      ) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("wikkelen naar lossen"));

    const lossenStart =
      getTimestampFromObject(ts, ["lossen_start", "wacht_op_lossen_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("wikkelen naar lossen"));

    const lossenEnd =
      getTimestampFromObject(ts, ["lossen_end", "nabewerking_start", "nabewerken_start"]) ||
      getLatestHistoryTimestampBy(
        log,
        (h) => String(h?.details || "").toLowerCase().includes("lossen") && String(h?.details || "").toLowerCase().includes("nabewerking")
      ) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("lossen naar nabewerking"));

    const nabewerkingStart =
      getTimestampFromObject(ts, ["nabewerking_start", "nabewerken_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("lossen naar nabewerking"));

    const nabewerkingEndCandidate =
      getTimestampFromObject(ts, ["nabewerking_end", "nabewerken_end", "bm01_start", "eindinspectie_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.details || "").toLowerCase().includes("verwerking afgerond")) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.station || "").toUpperCase() === "BM01") ||
      getTimestampFromObject(ts, ["finished", "completed"]) ||
      toDateValue(log?.updatedAt);
    const nabewerkingEnd = nabewerkingStart ? nabewerkingEndCandidate : null;

    const repairStart =
      getTimestampFromObject(ts, ["repair_start", "reparatie_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.action || "").toLowerCase().includes("reparatie"));

    const repairEndCandidate =
      getTimestampFromObject(ts, ["repair_end", "reparatie_end", "bm01_start", "eindinspectie_start"]) ||
      null;
    const repairEnd = repairStart ? repairEndCandidate : null;

    return {
      wikkelenStart,
      wikkelenEnd,
      lossenStart,
      lossenEnd,
      nabewerkingStart,
      nabewerkingEnd,
      repairStart,
      repairEnd,
    };
  };

  const getRangeDurationMinutes = (startValue: unknown, endValue: unknown, context: Record<string, unknown> = {}) => {
    const start = toDateValue(startValue);
    const end = toDateValue(endValue);
    if (!start || !end) return 0;
    const duration = calculateWorkingMinutes(start, end, context);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  };

  const getLotMetrics = (log: TrackingLog): LotMetric => {
    const bounds = getLogProcessBounds(log);
    const contextMachine = log?.originMachine || log?.machine || log?.currentStation || log?.lastStation;
    const contextDepartment = log?.department || inferDepartmentFromMachine(contextMachine);
    const durationContext = {
      department: contextDepartment,
      machine: contextMachine,
      station: log?.currentStation || log?.lastStation,
      originMachine: log?.originMachine,
    };
    const bm01Start =
      getTimestampFromObject(log?.timestamps, ["bm01_start", "eindinspectie_start"]) ||
      getLatestHistoryTimestampBy(log, (h) => String(h?.station || "").toUpperCase() === "BM01");
    const bm01EndCandidate =
      getTimestampFromObject(log?.timestamps, ["bm01_end", "eindinspectie_end", "finished", "completed"]) ||
      toDateValue(log?.updatedAt);
    const bm01End = bm01Start ? bm01EndCandidate : null;

    const wikkelenMinutes = getRangeDurationMinutes(bounds.wikkelenStart, bounds.wikkelenEnd, { ...durationContext, phase: "wikkelen" });
    const lossenMinutes = getRangeDurationMinutes(bounds.lossenStart, bounds.lossenEnd, { ...durationContext, phase: "lossen" });
    const nabewerkingMinutes = getRangeDurationMinutes(bounds.nabewerkingStart, bounds.nabewerkingEnd, { ...durationContext, phase: "nabewerking" });
    const bm01Minutes = getRangeDurationMinutes(bm01Start, bm01End, { ...durationContext, phase: "eindinspectie" });
    const repairMinutes = getRangeDurationMinutes(bounds.repairStart, bounds.repairEnd, { ...durationContext, phase: "reparatie" });
    const totalMinutes = wikkelenMinutes + lossenMinutes + nabewerkingMinutes + bm01Minutes + repairMinutes;

    return {
      id: log?.id,
      lotNumber: log?.lotNumber || log?.id || t("common.unknown", "Onbekend"),
      machine: normalizeMachine(log?.machine || log?.stationLabel || log?.currentStation || "-") || "-",
      status: log?.status || "-",
      currentStation: log?.currentStation || log?.lastStation || "-",
      actualHours: totalMinutes / 60,
      stationMetrics: {
        wikkelenHours: wikkelenMinutes / 60,
        lossenHours: lossenMinutes / 60,
        nabewerkingHours: nabewerkingMinutes / 60,
        bm01Hours: bm01Minutes / 60,
        repairHours: repairMinutes / 60,
      },
      timeBounds: {
        ...bounds,
        bm01Start,
        bm01End,
      },
    };
  };

  const formatDateTime = (value: unknown) => {
    const date = toDateValue(value);
    return date ? format(date, "dd/MM/yy HH:mm") : "-";
  };

  const formatDateRange = (startValue: unknown, endValue: unknown) => {
    const start = formatDateTime(startValue);
    const end = formatDateTime(endValue);
    if (start === "-" && end === "-") return "-";
    return `${start} -> ${end}`;
  };

  const getLogActivityDate = (log: TrackingLog) => {
    const ts = log?.timestamps || {};
    return (
      toDateValue(ts.wikkelen_start) ||
      toDateValue(ts.lossen_start) ||
      toDateValue(ts.nabewerking_start) ||
      toDateValue(ts.bm01_start) ||
      toDateValue(ts.repair_start) ||
      toDateValue(ts.repair_end) ||
      toDateValue(ts.station_start) ||
      toDateValue(ts.started) ||
      toDateValue(ts.nabewerking_end) ||
      toDateValue(ts.completed) ||
      toDateValue(ts.finished) ||
      toDateValue(log?.completedAt) ||
      toDateValue(log?.archivedAt) ||
      toDateValue(log?.updatedAt) ||
      toDateValue(ts.lossen_end) ||
      toDateValue(ts.wikkelen_end) ||
      toDateValue(log?.createdAt)
    );
  };

  const getLogActivityDates = (log: TrackingLog) => {
    const ts = log?.timestamps || {};
    return [
      ts.wikkelen_start,
      ts.lossen_start,
      ts.nabewerking_start,
      ts.bm01_start,
      ts.repair_start,
      ts.repair_end,
      ts.station_start,
      ts.started,
      ts.wikkelen_end,
      ts.lossen_end,
      ts.nabewerking_end,
      ts.finished,
      ts.completed,
      ts.archived,
      log?.startedAt,
      log?.startTime,
      log?.completedAt,
      log?.archivedAt,
      log?.createdAt,
      log?.updatedAt,
    ]
      .map((value) => toDateValue(value))
      .filter(Boolean);
  };

  const getTrackingGroupKey = (log: TrackingLog) => {
    const directOrderKey = String(
      log?.orderId ||
      log?.orderNumber ||
      log?.originalOrderId ||
      log?.productionOrderId ||
      ""
    ).trim();
    if (directOrderKey) return directOrderKey;

    const lotKey = String(log?.lotNumber || log?.id || "").trim();
    if (lotKey) return `LOT:${lotKey}`;

    return "";
  };

  const trackingByOrder = useMemo(() => {
    const grouped = new Map<string, TrackingLog[]>();
    trackingLogs.forEach((log: TrackingLog) => {
      const groupKey = getTrackingGroupKey(log);
      if (!groupKey) return;
      if (!grouped.has(groupKey)) grouped.set(groupKey, []);
      grouped.get(groupKey)?.push(log);
    });
    return grouped;
  }, [trackingLogs]);

  const mergedOrders = useMemo(() => {
    const byOrderId = new Map<string, PlanningOrder>();

    orders.forEach((order: PlanningOrder) => {
      const orderId = String(order?.orderId || order?.id || "").trim();
      if (!orderId) return;
      byOrderId.set(orderId, { ...order, orderId, _trackingGroupKey: orderId } as PlanningOrder);
    });

    trackingByOrder.forEach((logs, groupKey) => {
      if (byOrderId.has(groupKey)) return;
      const sample = (logs[0] || {}) as TrackingLog;
      const lotFallback = String(sample.lotNumber || sample.id || "").trim();
      const displayOrderId = String(sample.orderId || sample.orderNumber || sample.originalOrderId || "").trim() || (lotFallback ? `LOT ${lotFallback}` : groupKey);
      byOrderId.set(groupKey, {
        id: sample.id || groupKey,
        orderId: displayOrderId,
        _trackingGroupKey: groupKey,
        item: sample.item,
        itemCode: sample.itemCode,
        machine: sample.machine || sample.stationLabel || sample.currentStation,
        departmentId: sample.departmentId || sample.deptId,
        department: sample.department,
        status: sample.status || "in_production",
        plannedDate: getLogActivityDate(sample),
        estimatedHours: 0,
      });
    });

    return Array.from(byOrderId.values());
  }, [orders, trackingByOrder]);

  const machineOptions = useMemo(() => {
    const options = new Set<string>();
    const deptFilter = normalizeText(selectedDepartment);

    const matchesDeptForMachine = (departmentCandidate: unknown, machine: unknown) => {
      if (selectedDepartment === "ALLES") return true;
      const inferred = normalizeText(inferDepartmentFromMachine(machine));
      const candidate = normalizeText(departmentCandidate);
      return (
        candidate === deptFilter ||
        candidate.includes(deptFilter) ||
        deptFilter.includes(candidate) ||
        inferred === deptFilter ||
        inferred.includes(deptFilter) ||
        deptFilter.includes(inferred)
      );
    };

    mergedOrders.forEach((order: PlanningOrder) => {
      const machine = normalizeMachine(order?.machine || "");
      if (!machine) return;
      const departmentCandidate =
        order?.department ||
        resolveDepartmentNameFromId(order?.departmentId) ||
        inferDepartmentFromMachine(machine);
      if (!matchesDeptForMachine(departmentCandidate, machine)) return;
      options.add(machine);
    });

    trackingLogs.forEach((log: TrackingLog) => {
      const machine = normalizeMachine(log?.machine || log?.originMachine || log?.currentStation || log?.lastStation || "");
      if (!machine) return;
      const departmentCandidate =
        log?.department ||
        resolveDepartmentNameFromId(log?.departmentId || log?.deptId) ||
        inferDepartmentFromMachine(machine);
      if (!matchesDeptForMachine(departmentCandidate, machine)) return;
      options.add(machine);
    });

    return Array.from(options).sort((a, b) => a.localeCompare(b, "nl"));
  }, [mergedOrders, trackingLogs, selectedDepartment, factoryConfig]);

  useEffect(() => {
    if (selectedMachine === "ALLES") return;
    if (!machineOptions.includes(selectedMachine)) {
      setSelectedMachine("ALLES");
    }
  }, [selectedMachine, machineOptions]);

  // Helper functie voor department matching
  const matchesDepartment = (order: PlanningOrder, filterDepartmentName: string) => {
    if (filterDepartmentName === "ALLES") return true;

    const departmentId = order?.departmentId;
    const directDepartment = String(order?.department || "").trim();
    const inferredDepartment = inferDepartmentFromMachine(order?.machine);
    const filter = filterDepartmentName.toLowerCase().trim();

    if (directDepartment) {
      const name = directDepartment.toLowerCase().trim();
      if (name === filter || name.includes(filter) || filter.includes(name)) return true;
    }

    if (inferredDepartment) {
      const inferred = inferredDepartment.toLowerCase().trim();
      if (inferred === filter || inferred.includes(filter) || filter.includes(inferred)) return true;
    }

    if (!departmentId) return false;
    
    const dept = factoryConfig.departments?.find(
      (d) => String(d.id || "").trim().toLowerCase() === String(departmentId).trim().toLowerCase()
    );
    if (!dept) return false;
    
    const deptName = String(dept.name || "").toLowerCase().trim();
    
    if (deptName === filter) return true;
    if (deptName.includes(filter)) return true;
    if (filter.includes(deptName)) return true;
    
    return false;
  };

  const matchesMachine = (order: PlanningOrder | TrackingLog, filterMachineName: string) => {
    if (filterMachineName === "ALLES") return true;
    const filter = normalizeText(filterMachineName);

    const candidates = [
      normalizeMachine(order?.machine),
      normalizeMachine(order?.currentStation),
      normalizeMachine(order?.originMachine),
      normalizeMachine(order?.lastStation),
    ]
      .map((v) => normalizeText(v))
      .filter(Boolean);

    return candidates.some((machine) =>
      machine === filter || machine.includes(filter) || filter.includes(machine)
    );
  };

  // Filter orders by selected week
  const weekOrders = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    const range = periodMode === "day"
      ? { start: dayStart, end: dayEnd }
      : periodMode === "month"
        ? { start: monthStart, end: monthEnd }
        : { start: weekStart, end: weekEnd };

    return mergedOrders.filter((order: PlanningOrder) => {
      const orderKey = String(order._trackingGroupKey || order.orderId || order.id || "").trim();
      const relatedLogs = trackingByOrder.get(orderKey) || [];
      const hasTrackingData = relatedLogs.length > 0;
      const hasActivityInRange = relatedLogs.some((log: TrackingLog) => {
        const eventDates = getLogActivityDates(log);
        return eventDates.some((eventDate) => isWithinInterval(eventDate as Date, range));
      });

      // Time Tracking toont alleen orders met echte trackingdata binnen de gekozen periode.
      if (!hasTrackingData) return false;
      if (!hasActivityInRange) return false;
      
      if (!matchesStatusFilter(order, relatedLogs)) return false;
      
      // Filter by department
      if (selectedDepartment !== "ALLES" && !matchesDepartment(order, selectedDepartment)) return false;

      // Filter by machine
      if (selectedMachine !== "ALLES" && !matchesMachine(order, selectedMachine)) return false;

      return true;
    });
  }, [mergedOrders, trackingByOrder, selectedDate, periodMode, filterStatus, selectedDepartment, selectedMachine, factoryConfig]);

  const navigatePrevious = () => {
    setSelectedDate((prev) => (
      periodMode === "day"
        ? subDays(prev, 1)
        : periodMode === "month"
          ? subMonths(prev, 1)
          : subWeeks(prev, 1)
    ));
  };

  const navigateNext = () => {
    setSelectedDate((prev) => (
      periodMode === "day"
        ? addDays(prev, 1)
        : periodMode === "month"
          ? addMonths(prev, 1)
          : addWeeks(prev, 1)
    ));
  };

  const jumpToToday = () => setSelectedDate(new Date());

  const dayInputValue = format(selectedDate, "yyyy-MM-dd");
  const monthInputValue = format(selectedDate, "yyyy-MM");
  const weekInputValue = (() => {
    const week = String(getISOWeek(selectedDate)).padStart(2, "0");
    const year = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy");
    return `${year}-W${week}`;
  })();

  const handleDayChange = (value: string) => {
    if (!value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (isValid(parsed)) setSelectedDate(parsed);
  };

  const handleMonthChange = (value: string) => {
    if (!value) return;
    const [year, month] = value.split("-").map((x) => Number(x));
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    const parsed = new Date(year, month - 1, 1);
    if (isValid(parsed)) setSelectedDate(parsed);
  };

  const handleWeekChange = (value: string) => {
    if (!value) return;
    const match = String(value).match(/^(\d{4})-W(\d{2})$/);
    if (!match) return;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return;
    const jan4 = new Date(year, 0, 4);
    const firstIsoMonday = startOfWeek(jan4, { weekStartsOn: 1 });
    const target = addWeeks(firstIsoMonday, week - 1);
    if (isValid(target)) setSelectedDate(target);
  };

  // Calculate time metrics per order
  const orderMetrics = useMemo<OrderMetric[]>(() => {
    return weekOrders.map((order: PlanningOrder): OrderMetric => {
      const currentOrderId = String(order._trackingGroupKey || order.orderId || order.id || "").trim();
      const relatedLogs = trackingByOrder.get(currentOrderId) || [];
      const lotDetails: LotMetric[] = relatedLogs.map((log: TrackingLog) => getLotMetrics(log));
      const planCount = parseNumber(order.quantity) || parseNumber(order.plan) || 0;

      const splitFromReferenceOps = getSplitPlannedHours(order.operations, parseNumber(order.totalPlannedHours) || 0);
      let plannedProductionHours = splitFromReferenceOps.productionHours;
      let plannedPostHours = splitFromReferenceOps.postHours;
      let plannedQcHours = splitFromReferenceOps.qcHours;

      let planned = splitFromReferenceOps.hasReferenceOps
        ? splitFromReferenceOps.totalHours
        : parseNumber(order.totalPlannedHours) || parseNumber(order.estimatedHours) || 0;
      let hasEfficiency = false;

      // Use imported efficiency data if available (Infor LN)
      const importedInfo = efficiencyData[String(order.orderId || "")];
      if (importedInfo) {
        const effQty = parseNumber(importedInfo.quantity) || 1;
        const safePlanCount = planCount > 0 ? planCount : effQty;
        const ratio = effQty > 0 ? safePlanCount / effQty : 1;

        const effProductionHours = (parseNumber(importedInfo.productionTimeTotal) * ratio) / 60;
        const effPostHours = (parseNumber(importedInfo.postProcessingTimeTotal) * ratio) / 60;
        const effQcHours = (parseNumber(importedInfo.qcTimeTotal) * ratio) / 60;
        const effSplitTotal = effProductionHours + effPostHours + effQcHours;

        if (effSplitTotal > 0) {
          if (plannedProductionHours <= 0) plannedProductionHours = effProductionHours;
          if (plannedPostHours <= 0) plannedPostHours = effPostHours;
          if (plannedQcHours <= 0) plannedQcHours = effQcHours;
          if (planned <= 0) planned = effSplitTotal;
          hasEfficiency = true;
        } else if (importedInfo.minutesPerUnit) {
          const plannedFromMinutesPerUnit = (parseNumber(importedInfo.minutesPerUnit) * safePlanCount) / 60;
          if (planned <= 0) planned = plannedFromMinutesPerUnit;
          hasEfficiency = true;
        }
      }

      let calculatedActualMinutes = 0;
      let wikkelenMinutes = 0;
      let lossenMinutes = 0;
      let nabewerkingMinutes = 0;
      let bm01Minutes = 0;
      let repairMinutes = 0;
      
      lotDetails.forEach((lot: LotMetric) => {
        calculatedActualMinutes += lot.actualHours * 60;
        wikkelenMinutes += (lot.stationMetrics?.wikkelenHours || 0) * 60;
        lossenMinutes += (lot.stationMetrics?.lossenHours || 0) * 60;
        nabewerkingMinutes += (lot.stationMetrics?.nabewerkingHours || 0) * 60;
        bm01Minutes += (lot.stationMetrics?.bm01Hours || 0) * 60;
        repairMinutes += (lot.stationMetrics?.repairHours || 0) * 60;
      });

      const actualFromLogs = calculatedActualMinutes / 60;
      const actual = actualFromLogs > 0 ? actualFromLogs : getOrderActualHours(order);

      const variance = actual - planned;
      const variancePercent = planned > 0 ? (variance / planned) * 100 : 0;
      
      const status = Math.abs(variancePercent) < 10
        ? "on_track"
        : variancePercent > 0
          ? "over"
          : "under";

      return {
        ...order,
        planned,
        actual,
        variance,
        variancePercent,
        status,
        hasEfficiency,
        lotCount: lotDetails.length,
        lotDetails,
        stationMetrics: {
          wikkelenHours: wikkelenMinutes / 60,
          lossenHours: lossenMinutes / 60,
          nabewerkingHours: nabewerkingMinutes / 60,
          bm01Hours: bm01Minutes / 60,
          repairHours: repairMinutes / 60,
        },
        plannedStationMetrics: {
          wikkelenHours: plannedProductionHours,
          lossenHours: 0,
          nabewerkingHours: plannedPostHours,
          bm01Hours: plannedQcHours,
          repairHours: 0,
        },
      };
    });
  }, [weekOrders, efficiencyData, trackingByOrder]);

  // Summary statistics
  const summary = useMemo(() => {
    const totalPlanned = orderMetrics.reduce((sum, o) => sum + o.planned, 0);
    const totalActual = orderMetrics.reduce((sum, o) => sum + o.actual, 0);
    const totalVariance = totalActual - totalPlanned;
    const avgVariancePercent = totalPlanned > 0 ? (totalVariance / totalPlanned) * 100 : 0;

    const onTrack = orderMetrics.filter(o => o.status === "on_track").length;
    const over = orderMetrics.filter(o => o.status === "over").length;
    const under = orderMetrics.filter(o => o.status === "under").length;

    return {
      totalPlanned,
      totalActual,
      totalVariance,
      avgVariancePercent,
      onTrack,
      over,
      under
    };
  }, [orderMetrics]);

  const stationTotals = useMemo(() => {
    return orderMetrics.reduce(
      (acc, order) => {
        const metrics = order.stationMetrics || {};
        acc.wikkelen += Number(metrics.wikkelenHours || 0);
        acc.lossen += Number(metrics.lossenHours || 0);
        acc.nabewerking += Number(metrics.nabewerkingHours || 0);
        acc.bm01 += Number(metrics.bm01Hours || 0);
        acc.repair += Number(metrics.repairHours || 0);
        return acc;
      },
      { wikkelen: 0, lossen: 0, nabewerking: 0, bm01: 0, repair: 0 }
    );
  }, [orderMetrics]);

  // Get status icon
  const getStatusIcon = (status: string) => {
    if (status === "on_track") return <CheckCircle className="text-emerald-600" size={20} />;
    if (status === "over") return <TrendingUp className="text-red-600" size={20} />;
    return <TrendingDown className="text-blue-600" size={20} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              {t("timeTrackingView.title", "Time Tracking")}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {t("timeTrackingView.subtitle", "Vergelijk daadwerkelijke vs geplande tijd per order")}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Day/Week Selector */}
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-600" />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPeriodMode("day")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "day" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  {t("timeTrackingView.day", "Dag")}
                </button>
                <button
                  onClick={() => setPeriodMode("week")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "week" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  {t("timeTrackingView.week", "Week")}
                </button>
                <button
                  onClick={() => setPeriodMode("month")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${periodMode === "month" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  {t("timeTrackingView.month", "Maand")}
                </button>
              </div>

              {periodMode === "day" && (
                <input
                  type="date"
                  value={dayInputValue}
                  onChange={(e) => handleDayChange(e.target.value)}
                  className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white"
                />
              )}

              {periodMode === "week" && (
                <input
                  type="week"
                  value={weekInputValue}
                  onChange={(e) => handleWeekChange(e.target.value)}
                  className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white"
                />
              )}

              {periodMode === "month" && (
                <input
                  type="month"
                  value={monthInputValue}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="px-2 py-1.5 rounded-md border-2 border-slate-200 text-xs font-bold text-slate-700 bg-white"
                />
              )}

              <button onClick={navigatePrevious} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                {t("timeTrackingView.previous", "Vorige")}
              </button>
              <span className="text-sm font-bold text-slate-700 min-w-[180px] text-center">
                {periodMode === "day"
                  ? format(selectedDate, "dd-MM-yyyy")
                  : periodMode === "month"
                    ? format(selectedDate, "MMMM yyyy")
                    : `Week ${getISOWeek(selectedDate)} - ${format(selectedDate, "yyyy")}`}
              </span>
              <button onClick={navigateNext} className="px-2 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                {t("timeTrackingView.next", "Volgende")}
              </button>
              <button onClick={jumpToToday} className="px-2 py-1.5 rounded-md bg-blue-500 text-white text-xs font-bold">
                {t("timeTrackingView.today", "Vandaag")}
              </button>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-600" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Clock size={16} className="text-slate-600" />
              <select
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold"
              >
                <option value="ALLES">{t("timeTrackingView.allMachines", "Alle Machines")}</option>
                {machineOptions.map((machine) => (
                  <option key={machine} value={machine}>{machine}</option>
                ))}
              </select>
            </div>

            {/* Filter Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-sm font-bold"
            >
              <option value="all">{t("timeTrackingView.allStatuses", "Alle status")}</option>
              <option value="in_behandeling">{t("timeTrackingView.inTreatment", "In behandeling")}</option>
              <option value="gereed">{t("timeTrackingView.readyIncludingArchive", "Gereed (incl. archief)")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.totalPlanned", "Totaal Gepland")}</span>
            <Clock className="text-blue-600" size={20} />
          </div>
          <div className="text-3xl font-black text-slate-800">{Math.round(summary.totalPlanned)}h</div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.totalActual", "Totaal Daadwerkelijk")}</span>
            <BarChart3 className="text-purple-600" size={20} />
          </div>
          <div className="text-3xl font-black text-slate-800">{Math.round(summary.totalActual)}h</div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.variance", "Variance")}</span>
            {summary.totalVariance >= 0 ? (
              <TrendingUp className="text-red-600" size={20} />
            ) : (
              <TrendingDown className="text-emerald-600" size={20} />
            )}
          </div>
          <div className={`text-3xl font-black ${summary.totalVariance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {summary.totalVariance >= 0 ? '+' : ''}{Math.round(summary.totalVariance)}h
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary.avgVariancePercent >= 0 ? '+' : ''}{Math.round(summary.avgVariancePercent)}%
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.status", "Status")}</span>
            <CheckCircle className="text-emerald-600" size={20} />
          </div>
          <div className="flex gap-2 mt-2">
            <div className="text-center flex-1">
              <div className="text-xl font-black text-emerald-600">{summary.onTrack}</div>
              <div className="text-xs text-slate-500">{t("timeTrackingView.onTrack", "On Track")}</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-xl font-black text-red-600">{summary.over}</div>
              <div className="text-xs text-slate-500">{t("timeTrackingView.over", "Over")}</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-xl font-black text-blue-600">{summary.under}</div>
              <div className="text-xs text-slate-500">{t("timeTrackingView.under", "Under")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">{t("timeTrackingView.totalWinding", "Totaal Wikkelen")}</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.wikkelen.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">{t("timeTrackingView.totalUnloading", "Totaal Lossen")}</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.lossen.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">{t("timeTrackingView.totalPostProcessing", "Totaal Nabewerken")}</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.nabewerking.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-slate-200">
          <div className="text-xs font-bold text-slate-600 uppercase mb-1">{t("timeTrackingView.totalFinalInspection", "Totaal Eindinspectie")}</div>
          <div className="text-2xl font-black text-slate-800">{stationTotals.bm01.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl p-4 border-2 border-amber-200">
          <div className="text-xs font-bold text-amber-700 uppercase mb-1">{t("timeTrackingView.totalRepair", "Totaal Reparatie")}</div>
          <div className="text-2xl font-black text-amber-700">{stationTotals.repair.toFixed(1)}h</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200">
        <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            {t("timeTrackingView.orderTimeAnalysis", "Order Time Analysis")} ({orderMetrics.length} {t("timeTrackingView.orders", "orders")})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.order", "Order")}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.item", "Item")}</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.machine", "Machine")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.winding", "Wikkelen")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.unloading", "Lossen")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.postProcessing", "Nabewerken")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.finalInspection", "Eindinspectie")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.repair", "Reparatie")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.planned", "Gepland")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.actual", "Daadwerkelijk")}</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.variance", "Variance")}</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.status", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {orderMetrics.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    {t("timeTrackingView.noOrdersInSelected", "Geen orders in geselecteerde")} {periodMode === "day" ? t("timeTrackingView.day", "dag") : periodMode === "month" ? t("timeTrackingView.month", "maand") : t("timeTrackingView.week", "week")}
                  </td>
                </tr>
              ) : (
                orderMetrics.map((order: OrderMetric) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                      {Number(order.lotCount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedOrderDetail(order)}
                          className="mt-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                        >
                          {t("timeTrackingView.viewLots", "Bekijk lots")} ({order.lotCount || 0})
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.itemCode || order.extraCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600">{order.machine || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.wikkelenHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.wikkelenHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.lossenHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.lossenHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.nabewerkingHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.nabewerkingHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {order.stationMetrics ? order.stationMetrics.bm01Hours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.bm01Hours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-amber-700">
                        {order.stationMetrics ? order.stationMetrics.repairHours.toFixed(1) : "0.0"}h
                        <span className="text-xs text-slate-400"> / {order.plannedStationMetrics ? order.plannedStationMetrics.repairHours.toFixed(1) : "0.0"}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">
                        {Math.round(order.planned)}h
                        {order.hasEfficiency && (
                          <span className="text-[9px] text-purple-600 ml-1 font-black" title={t("timeTrackingView.basedOnLnEfficiency", "Gebaseerd op Infor LN efficiency")}>({t("timeTrackingView.ln", "LN")})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-bold text-slate-700">{Math.round(order.actual)}h</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-bold ${
                        order.variance >= 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {order.variance >= 0 ? '+' : ''}{Math.round(order.variance)}h
                      </div>
                      <div className={`text-xs ${
                        order.variance >= 0 ? 'text-red-500' : 'text-emerald-500'
                      }`}>
                        {order.variancePercent >= 0 ? '+' : ''}{Math.round(order.variancePercent)}%
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        {getStatusIcon(order.status)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottlenecks */}
      {selectedOrderDetail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-[min(98vw,1800px)] max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="text-lg font-black text-slate-800">{t("timeTrackingView.order", "Order")} {selectedOrderDetail.orderId}</div>
                <div className="text-sm text-slate-500">{t("timeTrackingView.lotDetailsAndStationTimes", "Lotdetails en stationtijden")} ({selectedOrderDetail.lotCount || 0} {t("timeTrackingView.lots", "lots")})</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-300"
              >
                {t("common.close", "Sluiten")}
              </button>
            </div>
            <div className="overflow-y-auto overflow-x-hidden p-4">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.lot", "Lot")}</th>
                    <th className="w-20 px-2 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.machine", "Machine")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.status", "Status")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.winding", "Wikkelen")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.unloading", "Lossen")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.postProcessShort", "Nabew.")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.inspection", "Inspectie")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.repair", "Reparatie")}</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.total", "Totaal")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.windingTime", "Wikkel Tijd")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.unloadingTime", "Lossen Tijd")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.postProcessTime", "Nabew. Tijd")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.repairTime", "Reparatie Tijd")}</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase">{t("timeTrackingView.bm01Time", "BM01 Tijd")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderDetail.lotDetails?.map((lot: LotMetric) => (
                    <tr key={lot.id || lot.lotNumber} className="border-b border-slate-100 align-top">
                      <td
                        className="px-3 py-3 text-sm font-bold text-slate-800 whitespace-nowrap"
                        title={String(lot.lotNumber || "")}
                      >
                        {lot.lotNumber}
                      </td>
                      <td className="w-20 px-2 py-3 text-sm text-slate-600 whitespace-nowrap">{lot.machine}</td>
                      <td className="px-3 py-3 text-sm text-slate-600 truncate">{lot.status}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.wikkelenHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.lossenHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.nabewerkingHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-slate-700 whitespace-nowrap">{lot.stationMetrics.bm01Hours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-amber-700 whitespace-nowrap">{lot.stationMetrics.repairHours.toFixed(1)}h</td>
                      <td className="px-3 py-3 text-sm text-right font-black text-slate-800 whitespace-nowrap">{lot.actualHours.toFixed(1)}h</td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.wikkelenStart, lot.timeBounds.wikkelenEnd)}
                      >
                        {formatDateRange(lot.timeBounds.wikkelenStart, lot.timeBounds.wikkelenEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.lossenStart, lot.timeBounds.lossenEnd)}
                      >
                        {formatDateRange(lot.timeBounds.lossenStart, lot.timeBounds.lossenEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.nabewerkingStart, lot.timeBounds.nabewerkingEnd)}
                      >
                        {formatDateRange(lot.timeBounds.nabewerkingStart, lot.timeBounds.nabewerkingEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.repairStart, lot.timeBounds.repairEnd)}
                      >
                        {formatDateRange(lot.timeBounds.repairStart, lot.timeBounds.repairEnd)}
                      </td>
                      <td
                        className="px-3 py-3 text-[11px] leading-tight text-slate-500 whitespace-normal break-words"
                        title={formatDateRange(lot.timeBounds.bm01Start, lot.timeBounds.bm01End)}
                      >
                        {formatDateRange(lot.timeBounds.bm01Start, lot.timeBounds.bm01End)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {orderMetrics.filter(o => o.status === "over").length > 0 && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border-2 border-red-200 p-6">
          <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} />
            {t("timeTrackingView.bottlenecksTitle", "Bottlenecks (Orders die langer duren dan gepland)")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderMetrics
              .filter(o => o.status === "over")
              .sort((a, b) => b.variance - a.variance)
              .map(order => (
                <div key={order.id} className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm text-slate-800">{order.orderId || order.item}</div>
                    <TrendingUp className="text-red-600" size={16} />
                  </div>
                  <div className="text-xs text-slate-600 mb-2">{order.itemCode}</div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      {Math.round(order.planned)}h → {Math.round(order.actual)}h
                    </div>
                    <div className="text-sm font-black text-red-600">
                      +{Math.round(order.variance)}h
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border-2 border-blue-200">
        <div className="flex items-start gap-4">
          <Clock className="text-blue-600 flex-shrink-0" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{t("timeTrackingView.analysisTitle", "Time Tracking Analysis")}</h3>
            <div className="text-sm text-slate-700 space-y-1">
              <p>✅ <strong>{t("timeTrackingView.onTrack", "On Track")}:</strong> {t("timeTrackingView.analysisOnTrack", "Variance binnen ±10% van gepland")}</p>
              <p>⚠️ <strong>{t("timeTrackingView.over", "Over")}:</strong> {t("timeTrackingView.analysisOver", "Daadwerkelijke tijd is meer dan 10% hoger dan gepland")}</p>
              <p>📉 <strong>{t("timeTrackingView.under", "Under")}:</strong> {t("timeTrackingView.analysisUnder", "Daadwerkelijke tijd is meer dan 10% lager dan gepland")}</p>
              <p>💡 <strong>{t("timeTrackingView.tip", "Tip")}:</strong> {t("timeTrackingView.analysisTip", "Gebruik bottleneck analyse om orders te identificeren die extra aandacht nodig hebben")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeTrackingView;
