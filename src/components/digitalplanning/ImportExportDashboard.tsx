import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Download, Upload, Database, FileText, ArrowRight, Plus, Calendar, Printer, X, ClipboardCheck } from "lucide-react";
import { endOfISOWeek, format, getISOWeek, isSameDay, isWithinInterval, startOfISOWeek } from "date-fns";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import PlanningImportModal from "./modals/PlanningImportModal";
import InventoryCheckModal from "./modals/InventoryCheckModal";
import { auth, db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { saveLnQrExportHistory as saveLnQrExportHistoryViaBackend } from "../../services/planningSecurityService";

type TimestampLike = { toDate?: () => Date };

type MetaEntry = {
  bucket?: unknown;
  plannedHours?: unknown;
};

type EntryRecord = {
  id?: string;
  orderId?: string;
  item?: string;
  itemCode?: string;
  itemDescription?: string;
  lotNumber?: string;
  activeLot?: string;
  machine?: string;
  originMachine?: string;
  currentStation?: string;
  lastStation?: string;
  status?: string;
  currentStep?: string;
  archivedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  referenceOperationTimes?: Record<string, MetaEntry>;
  operations?: Record<string, unknown>;
  timestamps?: Record<string, unknown>;
  [key: string]: unknown;
};

type CompletedInspectionRow = {
  id: string;
  readyDate: string;
  readyTime: string;
  orderId: string;
  lotNumber: string;
  item: string;
  itemCode: string;
  originStation: string;
  inspectionStation: string;
  status: string;
};

type LnReadyGroupedRow = {
  id: string;
  station: string;
  orderId: string;
  item: string;
  totalOrderCount?: number;
  todoCount?: number;
  nahardingCount?: number;
  wikkelCount?: number;
  refOpsText: string;
  count: number;
};

type LnReadyQrRow = LnReadyGroupedRow & {
  orderQr: string;
  refQr: string;
  countQr: string;
};

type LnExportHistoryKind = "list" | "qr";
type PendingLnExportKind = LnExportHistoryKind | null;

type LnExportHistoryEntry = {
  id: string;
  exportKind: LnExportHistoryKind;
  resetCounters: boolean;
  periodLabel: string;
  rangeMode: string;
  createdAt: Date;
  createdAtIso: string;
  createdByEmail: string;
  createdByUid: string;
  rows: LnReadyGroupedRow[];
};

type ImportExportDashboardProps = {
  currentDepartment?: string;
  departmentDisplayName?: string;
  onCreateOrder?: () => void;
  trackedProducts?: EntryRecord[];
  archivedHistoryProducts?: EntryRecord[];
  effectiveAllowedNorms?: string[];
  planningOrders?: EntryRecord[];
  onOpenMachineExport?: (mode: string) => void;
};

const toDateCandidate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof (value as TimestampLike).toDate === "function") {
    const converted = (value as TimestampLike).toDate?.();
    if (converted && Number.isFinite(converted.getTime())) return converted;
  }
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const toEntryDate = (entry: EntryRecord): Date | null => {
  const candidates = [
    entry?.timestamps?.finished,
    entry?.archivedAt,
    entry?.updatedAt,
    entry?.createdAt,
  ];

  for (const value of candidates) {
    const date = toDateCandidate(value);
    if (date) return date;
  }

  return null;
};

const toWikkelenStartDate = (entry: EntryRecord): Date | null => {
  const candidates = [
    entry?.timestamps?.wikkelen_start,
    entry?.timestamps?.station_start,
    entry?.timestamps?.started,
    entry?.createdAt,
  ];

  for (const value of candidates) {
    const date = toDateCandidate(value);
    if (date) return date;
  }

  return null;
};

const toWikkelenCompletionDate = (entry: EntryRecord): Date | null => {
  const candidates = [
    entry?.timestamps?.wikkelen_end,
    entry?.timestamps?.lossen_start,
    entry?.timestamps?.finished,
    entry?.archivedAt,
    entry?.updatedAt,
    entry?.createdAt,
  ];

  for (const value of candidates) {
    const date = toDateCandidate(value);
    if (date) return date;
  }

  return null;
};

const normalizeStation = (value: unknown = "") => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, ".").replace(/[^0-9.-]/g, "").trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "boolean" || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolvePlanningTodoCount = (order: EntryRecord | undefined, fallback: number): number => {
  if (!order) return Math.max(0, fallback);

  const candidates = [
    order.todoCount,
    order.todo,
    order.toDo,
    order.to_do,
    order.remaining,
    order.open,
    order.plan,
  ];

  for (const candidate of candidates) {
    const parsed = toSafeNumber(candidate);
    if (parsed > 0) return parsed;
  }

  return Math.max(0, fallback);
};

const toLnReferenceCode = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  return digits || raw;
};

const selectPrimaryLnReferenceOperation = (order: EntryRecord) => {
  if (!order || typeof order !== "object") return "";

  const referenceMap = order.referenceOperationTimes || {};
  const mapCandidates = Object.entries(referenceMap).reduce<Array<{ code: string; bucketPriority: number; plannedHours: number }>>((acc, [refOp, meta]) => {
      const code = toLnReferenceCode(refOp);
      if (!code) return acc;
      const bucket = String((meta as MetaEntry)?.bucket || "").toLowerCase();
      const plannedHours = Number((meta as MetaEntry)?.plannedHours || 0);
      const bucketPriority = bucket === "production" ? 0 : bucket === "post" ? 1 : bucket === "qc" ? 2 : 3;
      acc.push({
        code,
        bucketPriority,
        plannedHours: Number.isFinite(plannedHours) ? plannedHours : 0,
      });
      return acc;
    }, []);

  if (mapCandidates.length > 0) {
    mapCandidates.sort((a, b) => {
      if (a.bucketPriority !== b.bucketPriority) return a.bucketPriority - b.bucketPriority;
      if (a.plannedHours !== b.plannedHours) return b.plannedHours - a.plannedHours;
      return a.code.localeCompare(b.code);
    });
    return mapCandidates[0].code;
  }

  const operationCodes = Object.keys(order.operations || {})
    .map((value) => toLnReferenceCode(value))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return operationCodes[0] || "";
};

const formatDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

const formatWeekInputValue = (date: Date) => `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, "0")}`;

const parseDateInputValue = (value: unknown): Date => {
  const parsed = new Date(`${String(value || "").trim()}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

const parseWeekInputValue = (value: unknown): Date => {
  const match = String(value || "").trim().match(/^(\d{4})-W(\d{2})$/i);
  if (!match) return new Date();

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return new Date();

  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Day + 1 + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const buildFullWidthColumnStyles = (doc: any, ratios: number[] = [], horizontalMargin = 10): Record<number, { cellWidth: number }> => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const availableWidth = pageWidth - horizontalMargin * 2;
  const totalRatio = ratios.reduce((sum, value) => sum + value, 0) || 1;

  return ratios.reduce<Record<number, { cellWidth: number }>>((styles, ratio, index) => {
    styles[index] = {
      cellWidth: Number(((availableWidth * ratio) / totalRatio).toFixed(2)),
    };
    return styles;
  }, {});
};

const LN_EXPORT_HISTORY_WINDOW_DAYS = 5;
const LN_EXPORT_HISTORY_STORAGE_KEY = "fpiff_ln_qr_history_v1";

const isAtNahardingOrFurther = (entry: EntryRecord): boolean => {
  const station = normalizeStation(entry?.currentStation || "");
  const step = normalizeStation(entry?.currentStep || "");
  const status = normalizeStation(entry?.status || "");

  const signatures = [station, step, status];
  return signatures.some((value) => value.includes("NAHARD") || value.includes("OVEN"));
};

const hasNahardingSignal = (entry: EntryRecord): boolean => {
  const station = normalizeStation(entry?.currentStation || "");
  const step = normalizeStation(entry?.currentStep || "");
  const status = normalizeStation(entry?.status || "");
  const lastStation = normalizeStation(entry?.lastStation || "");
  const timestampSignals = [
    entry?.timestamps?.oven_naharding_start,
    entry?.timestamps?.naharding_start,
    entry?.timestamps?.naharding_end,
  ];
  const hasTimestampSignal = timestampSignals.some((value) => Boolean(value));

  return (
    hasTimestampSignal ||
    [station, step, status, lastStation].some((value) => value.includes("NAHARD") || value.includes("OVEN"))
  );
};

const hasWikkelSignal = (entry: EntryRecord): boolean => {
  const station = normalizeStation(entry?.currentStation || "");
  const step = normalizeStation(entry?.currentStep || "");
  const status = normalizeStation(entry?.status || "");
  const lastStation = normalizeStation(entry?.lastStation || "");
  return [station, step, status, lastStation].some((value) => value.includes("WIKKEL"));
};

const toLnQrRows = (rows: LnReadyGroupedRow[], periodToken: string): LnReadyQrRow[] =>
  rows.map((row): LnReadyQrRow => ({
    ...row,
    orderQr: `ORDER:${row.orderId}`,
    refQr: `REFOPS:${row.refOpsText}`,
    countQr: `COUNT:${row.count}|PERIOD:${periodToken}|STATION:${row.station}`,
  }));

const readLocalLnExportHistory = (): LnExportHistoryEntry[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = String(window.localStorage.getItem(LN_EXPORT_HISTORY_STORAGE_KEY) || "").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cutoffTime = Date.now() - LN_EXPORT_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return parsed
      .map((entry) => {
        const source = (entry || {}) as Record<string, unknown>;
        const createdAt = toDateCandidate(source.createdAtIso) || toDateCandidate(source.createdAt) || new Date();
        const rows = Array.isArray(source.rows)
          ? source.rows.map((row, index) => {
              const item = (row || {}) as Record<string, unknown>;
              return {
                id: String(item.id || `${String(item.station || "")}_${String(item.orderId || "")}_${index}`),
                station: String(item.station || "").trim(),
                orderId: String(item.orderId || "").trim(),
                item: String(item.item || "").trim(),
                totalOrderCount: Number(item.totalOrderCount || 0),
                todoCount: Number(item.todoCount || 0),
                nahardingCount: Number(item.nahardingCount || 0),
                wikkelCount: Number(item.wikkelCount || 0),
                refOpsText: String(item.refOpsText || "20").trim() || "20",
                count: Number(item.count || 0),
              } as LnReadyGroupedRow;
            })
          : [];

        return {
          id: String(source.id || "").trim(),
          exportKind: String(source.exportKind || "qr") === "list" ? "list" : "qr",
          resetCounters: Boolean(source.resetCounters),
          periodLabel: String(source.periodLabel || "-").trim() || "-",
          rangeMode: String(source.rangeMode || "day").trim() || "day",
          createdAt,
          createdAtIso: String(source.createdAtIso || createdAt.toISOString()),
          createdByEmail: String(source.createdByEmail || "").trim(),
          createdByUid: String(source.createdByUid || "").trim(),
          rows,
        } as LnExportHistoryEntry;
      })
      .filter((entry) => entry.id && entry.createdAt.getTime() >= cutoffTime)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
};

const writeLocalLnExportHistory = (entries: LnExportHistoryEntry[]) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      LN_EXPORT_HISTORY_STORAGE_KEY,
      JSON.stringify(
        entries.map((entry) => ({
          ...entry,
          createdAtIso: entry.createdAtIso || entry.createdAt.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        }))
      )
    );
  } catch {
    // ignore local storage failures
  }
};

const mergeLnExportHistory = (remoteEntries: LnExportHistoryEntry[], localEntries: LnExportHistoryEntry[]) => {
  const merged = new Map<string, LnExportHistoryEntry>();
  [...remoteEntries, ...localEntries].forEach((entry) => {
    if (!entry?.id) return;
    const existing = merged.get(entry.id);
    if (!existing || entry.createdAt.getTime() > existing.createdAt.getTime()) {
      merged.set(entry.id, entry);
    }
  });

  return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

const ImportExportDashboard = ({
  currentDepartment,
  departmentDisplayName,
  onCreateOrder,
  trackedProducts = [],
  archivedHistoryProducts = [],
  effectiveAllowedNorms = [],
  planningOrders = [],
  onOpenMachineExport,
}: ImportExportDashboardProps) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState("import"); // 'import', 'export'
  const [showLegacyModal, setShowLegacyModal] = useState(false);
  const [showCompletedExportModal, setShowCompletedExportModal] = useState(false);
  const [showLnReadyExportModal, setShowLnReadyExportModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [completedRangeMode, setCompletedRangeMode] = useState("day");
  const [completedDateValue, setCompletedDateValue] = useState(formatDateInputValue(new Date()));
  const [completedWeekValue, setCompletedWeekValue] = useState(formatWeekInputValue(new Date()));
  const [lnRangeMode, setLnRangeMode] = useState("export");
  const [lnDateValue, setLnDateValue] = useState(formatDateInputValue(new Date()));
  const [lnWeekValue, setLnWeekValue] = useState(formatWeekInputValue(new Date()));
  const [lastLnResetAt, setLastLnResetAt] = useState<Date | null>(null);
  const [lnExportHistory, setLnExportHistory] = useState<LnExportHistoryEntry[]>([]);
  const [lnHistoryLoading, setLnHistoryLoading] = useState(false);
  const [pendingLnExportKind, setPendingLnExportKind] = useState<PendingLnExportKind>(null);

  const departmentLabel = String(departmentDisplayName || currentDepartment || "all").trim() || "all";

  const selectedCompletedDate = useMemo(() => {
    if (completedRangeMode === "week") return parseWeekInputValue(completedWeekValue);
    return parseDateInputValue(completedDateValue);
  }, [completedDateValue, completedWeekValue, completedRangeMode]);

  const selectedLnDate = useMemo(() => {
    if (lnRangeMode === "week") return parseWeekInputValue(lnWeekValue);
    return parseDateInputValue(lnDateValue);
  }, [lnDateValue, lnWeekValue, lnRangeMode]);

  const lnPeriodLabel = useMemo(() => {
    if (lnRangeMode === "day") return format(selectedLnDate, "yyyy-MM-dd");
    if (lnRangeMode === "week") return `week_${String(getISOWeek(selectedLnDate)).padStart(2, "0")}_${selectedLnDate.getFullYear()}`;
    return lastLnResetAt
      ? `export_since_${format(lastLnResetAt, "yyyy-MM-dd_HH-mm")}`
      : `export_since_${format(new Date(), "yyyy-MM-dd")}`;
  }, [lnRangeMode, selectedLnDate, lastLnResetAt]);

  const lnPeriodDisplayLabel = useMemo(() => {
    if (lnRangeMode === "day") return format(selectedLnDate, "yyyy-MM-dd");
    if (lnRangeMode === "week") return `Week ${String(getISOWeek(selectedLnDate)).padStart(2, "0")} ${selectedLnDate.getFullYear()}`;
    if (lastLnResetAt) return `Sinds laatste export (${format(lastLnResetAt, "yyyy-MM-dd HH:mm")})`;
    return "Sinds vandaag";
  }, [lnRangeMode, selectedLnDate, lastLnResetAt]);

  useEffect(() => {
    if (!showLnReadyExportModal) return;

    setLnRangeMode("export");

    setLnHistoryLoading(true);
    const historyPath = getPathString(PATHS.LN_QR_EXPORT_HISTORY);
    const cutoffIso = new Date(Date.now() - LN_EXPORT_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const currentUserId = String(auth.currentUser?.uid || "").trim();
    if (!currentUserId) {
      const localEntries = readLocalLnExportHistory();
      setLnExportHistory(localEntries);
      setLastLnResetAt(localEntries.find((entry) => entry.resetCounters)?.createdAt || null);
      setLnHistoryLoading(false);
      return;
    }
    const historyRef = collection(db, historyPath);
    const historyQuery = query(
      historyRef,
      where("userId", "==", currentUserId),
      where("createdAtIso", ">=", cutoffIso),
      orderBy("createdAtIso", "desc"),
      limit(75)
    );

    return onSnapshot(
      historyQuery,
      (snapshot) => {
        const localEntries = readLocalLnExportHistory();
        const parsed = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const createdAtDate = toDateCandidate(data.createdAt) || toDateCandidate(data.createdAtIso) || new Date();
          const rawRows = Array.isArray(data.rows) ? data.rows : [];
          const rows = rawRows
            .map((row, index) => {
              const source = (row || {}) as Record<string, unknown>;
              const station = String(source.station || "").trim();
              const orderId = String(source.orderId || "").trim();
              if (!station || !orderId) return null;
              const countValue = Number(source.count || 0);
              return {
                id: String(source.id || `${station}__${orderId}__${index}`),
                station,
                orderId,
                item: String(source.item || "").trim(),
                totalOrderCount: Number(source.totalOrderCount || 0),
                nahardingCount: Number(source.nahardingCount || 0),
                wikkelCount: Number(source.wikkelCount || 0),
                refOpsText: String(source.refOpsText || "20").trim() || "20",
                count: Number.isFinite(countValue) ? countValue : 0,
              } as LnReadyGroupedRow;
            })
            .filter(Boolean) as LnReadyGroupedRow[];

          const exportKind = String(data.exportKind || "qr") === "list" ? "list" : "qr";

          return {
            id: docSnap.id,
            exportKind,
            resetCounters: Boolean(data.resetCounters),
            periodLabel: String(data.periodLabel || "-").trim() || "-",
            rangeMode: String(data.rangeMode || "day").trim() || "day",
            createdAt: createdAtDate,
            createdAtIso: String(data.createdAtIso || createdAtDate.toISOString()),
            createdByEmail: String(data.createdByEmail || "").trim(),
            createdByUid: String(data.createdByUid || "").trim(),
            rows,
          } as LnExportHistoryEntry;
        });

        const mergedHistory = mergeLnExportHistory(parsed, localEntries);
        setLnExportHistory(mergedHistory);
        setLastLnResetAt(mergedHistory.find((entry) => entry.resetCounters)?.createdAt || null);
        setLnHistoryLoading(false);
      },
      (error) => {
        console.error("Kon LN exporthistorie niet laden:", error);
        const localEntries = readLocalLnExportHistory();
        setLnExportHistory(localEntries);
        setLastLnResetAt(localEntries.find((entry) => entry.resetCounters)?.createdAt || null);
        setLnHistoryLoading(false);
      }
    );
  }, [showLnReadyExportModal]);

  const completedInspectionRows = useMemo(() => {
    const combinedProducts = [...trackedProducts, ...archivedHistoryProducts];
    const uniqueEntries = new Map<string, CompletedInspectionRow>();

    combinedProducts.forEach((product: EntryRecord) => {
      const completedAt = toEntryDate(product);
      if (!completedAt) return;

      const originStation = normalizeStation(product?.originMachine || product?.machine || "");
      const currentStation = normalizeStation(product?.currentStation || "");
      const lastStation = normalizeStation(product?.lastStation || "");
      const inAllowedScope =
        effectiveAllowedNorms.length === 0 ||
        [originStation, currentStation, lastStation].some((station) => station && effectiveAllowedNorms.includes(station));

      if (!inAllowedScope) return;

      const status = String(product?.status || "").trim().toLowerCase();
      const step = String(product?.currentStep || "").trim().toUpperCase();
      const isInspectionCompleted =
        lastStation === "BM01" &&
        (status === "completed" || step === "FINISHED" || currentStation === "GEREED");

      if (!isInspectionCompleted) return;

      const inRange = completedRangeMode === "day"
        ? isSameDay(completedAt, selectedCompletedDate)
        : isWithinInterval(completedAt, {
            start: startOfISOWeek(selectedCompletedDate),
            end: endOfISOWeek(selectedCompletedDate),
          });

      if (!inRange) return;

      const orderId = String(product?.orderId || "").trim();
      const lotNumber = String(product?.lotNumber || product?.activeLot || product?.id || "").trim();
      const dedupeKey = `${orderId}__${lotNumber}`;
      if (uniqueEntries.has(dedupeKey)) return;

      uniqueEntries.set(dedupeKey, {
        id: dedupeKey,
        readyDate: format(completedAt, "yyyy-MM-dd"),
        readyTime: format(completedAt, "HH:mm"),
        orderId,
        lotNumber,
        item: product?.item || product?.itemDescription || "",
        itemCode: product?.itemCode || "",
        originStation: product?.originMachine || product?.machine || "",
        inspectionStation: product?.lastStation || "BM01",
        status: "Gereed gemeld",
      });
    });

    return Array.from(uniqueEntries.values()).sort((a, b) => {
      const aKey = `${a.readyDate} ${a.readyTime}`;
      const bKey = `${b.readyDate} ${b.readyTime}`;
      return aKey < bKey ? 1 : -1;
    });
  }, [trackedProducts, archivedHistoryProducts, effectiveAllowedNorms, completedRangeMode, selectedCompletedDate]);

  const completedPeriodLabel = useMemo(() => {
    if (completedRangeMode === "day") return format(selectedCompletedDate, "yyyy-MM-dd");
    return `week_${String(getISOWeek(selectedCompletedDate)).padStart(2, "0")}_${selectedCompletedDate.getFullYear()}`;
  }, [completedRangeMode, selectedCompletedDate]);

  const planningOrdersByOrderId = useMemo(() => {
    const map = new Map<string, EntryRecord>();
    planningOrders.forEach((order: EntryRecord) => {
      const key = String(order?.orderId || order?.id || "").trim();
      if (!key || map.has(key)) return;
      map.set(key, order);
    });
    return map;
  }, [planningOrders]);

  const lnReadyQrRows = useMemo(() => {
    const combinedProducts = [...trackedProducts];
    const groupedRows = new Map<string, LnReadyGroupedRow>();
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minuten pauze
    const exportFallbackStart = new Date();
    exportFallbackStart.setHours(0, 0, 0, 0);
    const exportAnchor = lastLnResetAt || exportFallbackStart;
    const orderStats = new Map<string, { totalOrderCount: number; nahardingCount: number; wikkelCount: number }>();

    combinedProducts.forEach((product: EntryRecord) => {
      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const current = orderStats.get(orderId) || {
        totalOrderCount: 0,
        nahardingCount: 0,
        wikkelCount: 0,
      };

      current.totalOrderCount += 1;
      if (hasNahardingSignal(product)) current.nahardingCount += 1;
      if (hasWikkelSignal(product)) current.wikkelCount += 1;
      orderStats.set(orderId, current);
    });

    combinedProducts.forEach((product: EntryRecord) => {
      const originStation = normalizeStation(product?.originMachine || product?.machine || "");
      if (!originStation.startsWith("BH") && !originStation.startsWith("BA") && !originStation.startsWith("BM")) return;

      const inAllowedScope =
        effectiveAllowedNorms.length === 0 ||
        effectiveAllowedNorms.includes(originStation);
      if (!inAllowedScope) return;

      const status = String(product?.status || "").trim().toLowerCase();
      const step = String(product?.currentStep || "").trim().toUpperCase();
      if (status === "rejected" || step === "REJECTED" || status === "deleted" || status === "cancelled" || status === "geannuleerd") return;

      const startDate = toWikkelenStartDate(product);
      if (!startDate) return;

      if (startDate > cutoff) return;
      if (startDate <= exportAnchor) return;
      if (isAtNahardingOrFurther(product)) return;

      const inRange = lnRangeMode === "export"
        ? true
        : lnRangeMode === "day"
          ? isSameDay(startDate, selectedLnDate)
          : isWithinInterval(startDate, {
              start: startOfISOWeek(selectedLnDate),
              end: endOfISOWeek(selectedLnDate),
            });
      if (!inRange) return;

      const orderId = String(product?.orderId || "").trim();
      if (!orderId) return;

      const order = planningOrdersByOrderId.get(orderId);
      const orderPlan = toSafeNumber(order?.plan);
      const orderQuantity = toSafeNumber(order?.quantity);
      const stats = orderStats.get(orderId);
      const totalOrderCount = Number.isFinite(orderPlan) && orderPlan > 0
        ? orderPlan
        : Number.isFinite(orderQuantity) && orderQuantity > 0
          ? orderQuantity
          : stats?.totalOrderCount || 0;
      const refOpsText = "20"; // Vast ingesteld op referentiecode 20
      const rowKey = `${originStation}__${orderId}`;
      const existingRow = groupedRows.get(rowKey);
      const nahardingCount = stats?.nahardingCount || 0;
      const todoCount = resolvePlanningTodoCount(order, Math.max(0, totalOrderCount - nahardingCount));
      const current: LnReadyGroupedRow = existingRow || {
        id: rowKey,
        station: originStation,
        orderId,
        item: product?.item || product?.itemDescription || order?.item || "",
        totalOrderCount,
        todoCount,
        nahardingCount,
        wikkelCount: stats?.wikkelCount || 0,
        refOpsText,
        count: 0,
      };

      current.count += 1;
      groupedRows.set(rowKey, current);
    });

    const periodToken = lnPeriodLabel;

    const groupedRowsArray = Array.from(groupedRows.values()).sort((a, b) => {
      if (a.station !== b.station) return a.station.localeCompare(b.station);
      return a.orderId.localeCompare(b.orderId);
    });

    return toLnQrRows(groupedRowsArray, periodToken);
  }, [
    trackedProducts,
    effectiveAllowedNorms,
    lnRangeMode,
    selectedLnDate,
    lnPeriodLabel,
    planningOrdersByOrderId,
    lastLnResetAt,
  ]);

  const handleExportCompletedExcel = async () => {
    if (!completedInspectionRows.length) return;

    const XLSX = await import("xlsx");
    const headerRow = [
      "Gereed datum",
      "Tijd",
      "Order",
      "Lot",
      "Product",
      "Item code",
      "Bron station",
      "Eindinspectie",
      "Status",
    ];
    const aoa = [
      headerRow,
      ...completedInspectionRows.map((row) => [
        row.readyDate,
        row.readyTime,
        row.orderId,
        row.lotNumber,
        row.item,
        row.itemCode,
        row.originStation,
        row.inspectionStation,
        row.status,
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 32 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Gereedlijst");
    XLSX.writeFile(workbook, `teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.xlsx`);
  };

  const handleExportCompletedPdf = async () => {
    if (!completedInspectionRows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const horizontalMargin = 10;
    const completedColumnStyles = buildFullWidthColumnStyles(
      doc,
      [0.09, 0.06, 0.09, 0.1, 0.31, 0.1, 0.11, 0.08, 0.06],
      horizontalMargin
    );
    doc.setFontSize(14);
    doc.text("Eindinspectie Gereedlijst", 14, 14);
    doc.setFontSize(9);
    doc.text(`Periode: ${completedPeriodLabel}`, 14, 20);
    doc.text(`Afdeling: ${departmentLabel}`, 75, 20);
    doc.text(`Totaal: ${completedInspectionRows.length}`, 145, 20);

    autoTable(doc, {
      startY: 25,
      margin: { left: horizontalMargin, right: horizontalMargin },
      tableWidth: doc.internal.pageSize.getWidth() - horizontalMargin * 2,
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      head: [["Gereed datum", "Tijd", "Order", "Lot", "Product", "Item code", "Bron station", "Eindinspectie", "Status"]],
      body: completedInspectionRows.map((row) => [
        row.readyDate,
        row.readyTime,
        row.orderId,
        row.lotNumber,
        row.item,
        row.itemCode,
        row.originStation,
        row.inspectionStation,
        row.status,
      ]),
      columnStyles: completedColumnStyles,
    });

    doc.save(`teamleader_gereedlijst_${completedRangeMode}_${completedPeriodLabel}.pdf`);
  };

  const saveLnExportHistory = async (
    kind: LnExportHistoryKind,
    rows: LnReadyQrRow[],
    periodLabel: string,
    rangeMode: string,
    resetCounters = true
  ) => {
    if (!rows.length) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const currentUser = auth.currentUser;
    const localHistoryEntry: LnExportHistoryEntry = {
      id: `local_${kind}_${now.getTime()}`,
      exportKind: kind,
      resetCounters,
      periodLabel,
      rangeMode,
      createdAt: now,
      createdAtIso: nowIso,
      createdByUid: String(currentUser?.uid || ""),
      createdByEmail: String(currentUser?.email || ""),
      rows: rows.map((row) => ({
        id: row.id,
        station: row.station,
        orderId: row.orderId,
        item: row.item,
        totalOrderCount: row.totalOrderCount,
        todoCount: row.todoCount,
        nahardingCount: row.nahardingCount,
        wikkelCount: row.wikkelCount,
        refOpsText: row.refOpsText,
        count: row.count,
      })),
    };

    const mergedLocalHistory = mergeLnExportHistory([localHistoryEntry], readLocalLnExportHistory());
    writeLocalLnExportHistory(mergedLocalHistory);
    setLnExportHistory((prev) => mergeLnExportHistory([localHistoryEntry], prev));
    if (resetCounters) setLastLnResetAt(now);

    try {
      await saveLnQrExportHistoryViaBackend({
        exportKind: kind,
        resetCounters,
        clientTempId: localHistoryEntry.id,
        periodLabel,
        rangeMode,
        rows: rows.map((row) => ({
          id: row.id,
          station: row.station,
          orderId: row.orderId,
          item: row.item,
          totalOrderCount: row.totalOrderCount,
          todoCount: row.todoCount,
          nahardingCount: row.nahardingCount,
          wikkelCount: row.wikkelCount,
          refOpsText: row.refOpsText,
          count: row.count,
        })),
      });
    } catch (error) {
      console.error("Kon LN exporthistorie niet opslaan:", error);
    }
  };

  const exportLnReadyListPdf = async (
    rows: LnReadyQrRow[],
    meta: { periodLabel: string; rangeMode: string; exportedAt?: Date }
  ) => {
    if (!rows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text("Gereed voor LN (Lijst)", 14, 14);
    doc.setFontSize(9);
    doc.text(`Periode: ${meta.periodLabel}`, 14, 20);
    doc.text(`Afdeling: ${departmentLabel}`, 75, 20);
    doc.text(`Totaal regels: ${rows.length}`, 145, 20);
    if (meta.exportedAt) {
      doc.text(`Export: ${format(meta.exportedAt, "yyyy-MM-dd HH:mm")}`, 14, 25);
    }

    autoTable(doc, {
      startY: meta.exportedAt ? 30 : 25,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      head: [["Station", "Order", "Product", "Totaal order", "To do", "Naharding (geweest)", "Aantal"]],
      body: rows.map((row) => [
        String(row.station || "-"),
        String(row.orderId || "-"),
        String(row.item || "-"),
        Number(row.totalOrderCount || 0),
        Number(row.todoCount || 0),
        Number(row.nahardingCount || 0),
        Number(row.count || 0),
      ]),
    });

    doc.save(`teamleader_ln_gereed_lijst_${meta.rangeMode}_${meta.periodLabel}.pdf`);
  };

  const exportLnReadyQrPdf = async (
    rows: LnReadyQrRow[],
    meta: { periodLabel: string; rangeMode: string; exportedAt?: Date }
  ) => {
    if (!rows.length) return;

    const [{ jsPDF }, qrModule] = await Promise.all([
      import("jspdf"),
      import("qrcode"),
    ]);
    const QRCode = qrModule?.default || qrModule;

    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(14);
    doc.text("Gereed voor LN", 14, 14);
    doc.setFontSize(9);
    doc.text(`Periode: ${meta.periodLabel}`, 14, 20);
    doc.text(`Afdeling: ${departmentLabel}`, 75, 20);
    doc.text(`Totaal: ${rows.length}`, 145, 20);
    if (meta.exportedAt) {
      doc.text(`Export: ${format(meta.exportedAt, "yyyy-MM-dd HH:mm")}`, 14, 25);
    }

    let y = meta.exportedAt ? 33 : 28;
    let activeStation = "";
    const qrSize = 22;
    const blockHeight = 44;
    const qrOrderX = 68;
    const qrRefX = 110;
    const qrCountX = 152;

    for (const row of rows) {
      if (activeStation !== row.station) {
        if (y + 10 > 285) {
          doc.addPage();
          y = 14;
        }
        activeStation = row.station;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Station ${activeStation}`, 12, y);
        y += 6;
      }

      if (y + blockHeight > 285) {
        doc.addPage();
        y = 14;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Station ${activeStation}`, 12, y);
        y += 6;
      }

      const [orderDataUrl, refDataUrl, countDataUrl] = await Promise.all([
        QRCode.toDataURL(row.orderQr, { width: 220, margin: 1 }),
        QRCode.toDataURL(row.refQr, { width: 220, margin: 1 }),
        QRCode.toDataURL(row.countQr, { width: 220, margin: 1 }),
      ]);

      doc.setDrawColor(225, 230, 238);
      doc.roundedRect(10, y - 2, 190, blockHeight - 2, 2, 2);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Order ${row.orderId}`, 12, y + 3);
      doc.setFont("helvetica", "normal");
      doc.text(`RefOps: ${row.refOpsText}`, 12, y + 8);
      doc.text(`Aantal: ${row.count}`, 12, y + 13);
      doc.text(`Item: ${String(row.item || "-")}`, 12, y + 18);
      doc.text(`Totaal order: ${Number(row.totalOrderCount || 0)}`, 12, y + 23);
      doc.text(`Naharding (geweest): ${Number(row.nahardingCount || 0)}`, 12, y + 28);

      doc.addImage(orderDataUrl, "PNG", qrOrderX, y, qrSize, qrSize);
      doc.addImage(refDataUrl, "PNG", qrRefX, y, qrSize, qrSize);
      doc.addImage(countDataUrl, "PNG", qrCountX, y, qrSize, qrSize);

      doc.setFontSize(7);
      doc.text("ORDER", qrOrderX + qrSize / 2, y + qrSize + 3, { align: "center" });
      doc.text("REF OPS", qrRefX + qrSize / 2, y + qrSize + 3, { align: "center" });
      doc.text("AANTAL", qrCountX + qrSize / 2, y + qrSize + 3, { align: "center" });

      doc.setFontSize(8);
      doc.text(String(row.orderId || "-"), qrOrderX + qrSize / 2, y + qrSize + 7, { align: "center" });
      doc.text(String(row.refOpsText || "-"), qrRefX + qrSize / 2, y + qrSize + 7, { align: "center" });
      doc.text(String(row.count || 0), qrCountX + qrSize / 2, y + qrSize + 7, { align: "center" });

      y += blockHeight;
    }

    doc.save(`teamleader_ln_gereed_${meta.rangeMode}_${meta.periodLabel}.pdf`);
  };

  const executeLnExport = async (kind: LnExportHistoryKind, resetCounters: boolean) => {
    if (!lnReadyQrRows.length) return;

    const meta = {
      periodLabel: lnPeriodDisplayLabel,
      rangeMode: lnRangeMode,
      exportedAt: new Date(),
    };

    if (kind === "list") {
      await exportLnReadyListPdf(lnReadyQrRows, meta);
    } else {
      await exportLnReadyQrPdf(lnReadyQrRows, meta);
    }

    await saveLnExportHistory(kind, lnReadyQrRows, lnPeriodLabel, lnRangeMode, resetCounters);
    setPendingLnExportKind(null);
  };

  const handleExportLnReadyListPdf = async () => {
    if (!lnReadyQrRows.length) return;
    setPendingLnExportKind("list");
  };

  const handleExportLnReadyPdf = async () => {
    if (!lnReadyQrRows.length) return;
    setPendingLnExportKind("qr");
  };

  const handleDownloadHistoryEntry = async (entry: LnExportHistoryEntry) => {
    if (!entry?.rows?.length) return;
    const rows = toLnQrRows(entry.rows, entry.periodLabel);
    const meta = {
      periodLabel: entry.periodLabel,
      rangeMode: entry.rangeMode || "history",
      exportedAt: entry.createdAt,
    };

    if (entry.exportKind === "list") {
      await exportLnReadyListPdf(rows, meta);
      return;
    }
    await exportLnReadyQrPdf(rows, meta);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="p-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">
            Import <span className="text-emerald-600">& Export</span>
          </h2>
          <p className="text-sm text-slate-500 font-bold mt-1">
            Data-uitwisseling voor de werkvloer en systemen
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSection("import")}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeSection === "import" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Upload size={16} /> Importeren
          </button>
          <button
            onClick={() => setActiveSection("export")}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeSection === "export" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Download size={16} /> Exporteren
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto">
          {activeSection === "import" ? (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm">
                 <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2">
                   <FileSpreadsheet className="text-emerald-600" /> {t("importExportDashboard.excelImportTitle", "Excel Import (Infor LN)")}
                 </h3>
                 <p className="text-sm text-slate-500 mb-6">
                   {t("importExportDashboard.excelImportSubtitle", "Upload de actuele productieplanning vanuit Excel om de digitale werkvloer te voeden.")}
                 </p>

                 <div className="mb-6 flex justify-end">
                   <button
                     onClick={() => onCreateOrder?.()}
                     className="px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap hover:bg-emerald-700"
                   >
                     <Plus size={16} /> {t('teamleader.new_order', 'Nieuwe Order')}
                   </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                     <h4 className="font-bold text-emerald-900 text-sm mb-2">{t("importExportDashboard.hybridTransition", "Hybride Transitie")}</h4>
                     <p className="text-xs text-emerald-700 mb-6">
                       {t("importExportDashboard.hybridTransitionBody", "We zitten momenteel in een hybride fase. Je kunt handmatig data inladen voor machines die al digitaal zijn.")}
                     </p>
                     <button 
                       onClick={() => setShowLegacyModal(true)}
                       className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                     >
                       <Upload size={18} /> {t("importExportDashboard.startImportFlow", "Start Import Flow")}
                     </button>
                   </div>

                   <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center opacity-60">
                     <Database size={32} className="text-slate-400 mb-3" />
                     <h4 className="font-bold text-slate-700 text-sm mb-1">{t("importExportDashboard.automaticSync", "Automatische Sync")}</h4>
                     <p className="text-xs text-slate-500">
                       {t("importExportDashboard.automaticSyncBody", "Binnenkort beschikbaar via directe API koppeling met LN.")}
                     </p>
                   </div>
                 </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm">
                 <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2">
                   <Database className="text-blue-600" /> {t("importExportDashboard.shopFloorExports", "Werkvloer Exports")}
                 </h3>
                 <p className="text-sm text-slate-500 mb-6">
                   {t("importExportDashboard.shopFloorExportsSubtitle", "Genereer overzichten voor controle, administratie of machines die nog op papier werken.")}
                 </p>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group">
                     <div className="flex justify-between items-start mb-4">
                       <FileText size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.currentTodoList", "Actuele To Do Lijst")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.currentTodoListBody", "Lijst van alle nog niet gestarte orders binnen jouw afdeling")}</p>
                   </button>

                   <button
                     type="button"
                     onClick={() => setShowLnReadyExportModal(true)}
                     className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group"
                   >
                     <div className="flex justify-between items-start mb-4">
                       <FileSpreadsheet size={24} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.readyForLn", "Gereed voor LN")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.readyForLnBody", "Export van gereedgemelde producten om terug te boeken in ERP (Per export, Per dag, Per week)")}</p>
                   </button>

                   <button
                     type="button"
                     onClick={() => setShowCompletedExportModal(true)}
                     className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group"
                   >
                     <div className="flex justify-between items-start mb-4">
                       <FileSpreadsheet size={24} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.finalInspectionReadyList", "Eindinspectie Gereedlijst")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.finalInspectionReadyListBody", "Open popup voor dag- of weekexport naar PDF of Excel met kolommen en headers")}</p>
                   </button>

                   <button
                     type="button"
                     onClick={() => onOpenMachineExport?.("planning")}
                     className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                   >
                     <div className="flex justify-between items-start mb-4">
                       <Download size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.machineExportPlanning", "Machine Export - Planning")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.machineExportPlanningBody", "Open planningexport direct met machinefilter en statusfilters")}</p>
                   </button>

                   <button
                     type="button"
                     onClick={() => onOpenMachineExport?.("lotnummers")}
                     className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                   >
                     <div className="flex justify-between items-start mb-4">
                       <Download size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.machineExportLots", "Machine Export - Lotnummers")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.machineExportLotsBody", "Open werkvoorraadexport voor actieve lotnummers per machine")}</p>
                   </button>

                   <button
                     type="button"
                     onClick={() => setShowInventoryModal(true)}
                     className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-purple-300 hover:bg-purple-50 transition-all text-left group"
                   >
                     <div className="flex justify-between items-start mb-4">
                       <ClipboardCheck size={24} className="text-slate-400 group-hover:text-purple-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-purple-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">{t("importExportDashboard.floorCheckRound", "Vloercontrole (Ronde)")}</h4>
                     <p className="text-[10px] text-slate-500 font-medium">{t("importExportDashboard.floorCheckRoundBody", "Controleer fysieke lotnummers per station via tablet/scanner")}</p>
                   </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showLegacyModal && (
        <PlanningImportModal
          isOpen={true}
          onClose={() => setShowLegacyModal(false)}
          onSuccess={() => setShowLegacyModal(false)}
          currentDepartment={currentDepartment}
        />
      )}

      {showCompletedExportModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-6xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-emerald-50/70 flex items-start justify-between gap-4 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 italic">{t("importExportDashboard.finalInspectionReadyList", "Eindinspectie Gereedlijst")}</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">{t("importExportDashboard.finalInspectionReadyListExportHelp", "Export van wat bij Eindinspectie gereed is gemeld, gefilterd op dag of week.")}</p>
              </div>
              <button
                onClick={() => setShowCompletedExportModal(false)}
                className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr_1fr] gap-4">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <select
                    value={completedRangeMode}
                    onChange={(e) => setCompletedRangeMode(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                  >
                    <option value="day">{t("importExportDashboard.perDay", "Per dag")}</option>
                    <option value="week">{t("importExportDashboard.perWeek", "Per week")}</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    {completedRangeMode === "day" ? (
                      <input
                        type="date"
                        value={completedDateValue}
                        onChange={(e) => setCompletedDateValue(e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                      />
                    ) : (
                      <input
                        type="week"
                        value={completedWeekValue}
                        onChange={(e) => setCompletedWeekValue(e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedDateValue(formatDateInputValue(new Date()));
                      setCompletedWeekValue(formatWeekInputValue(new Date()));
                    }}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors shrink-0"
                    title={t("importExportDashboard.backToToday", "Terug naar vandaag")}
                  >
                    {t("importExportDashboard.today", "Vandaag")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportCompletedPdf}
                  disabled={completedInspectionRows.length === 0}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportCompletedExcel}
                  disabled={completedInspectionRows.length === 0}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Excel
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-widest text-slate-400">
                <span>{t("importExportDashboard.period", "Periode")}: {completedPeriodLabel}</span>
                <span>{completedInspectionRows.length} {t("importExportDashboard.rows", "regels")}</span>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[9rem_6rem_8rem_8rem_minmax(0,1fr)_8rem] gap-3 bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>{t("importExportDashboard.date", "Datum")}</span>
                  <span>{t("importExportDashboard.time", "Tijd")}</span>
                  <span>{t("importExportDashboard.order", "Order")}</span>
                  <span>{t("importExportDashboard.lot", "Lot")}</span>
                  <span>{t("importExportDashboard.product", "Product")}</span>
                  <span>{t("importExportDashboard.code", "Code")}</span>
                </div>
                <div className="max-h-[22rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {completedInspectionRows.length === 0 ? (
                    <div className="px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                      {t("importExportDashboard.noReadyMessagesForSelection", "Geen gereedmeldingen gevonden voor deze selectie.")}
                    </div>
                  ) : (
                    completedInspectionRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-[9rem_6rem_8rem_8rem_minmax(0,1fr)_8rem] gap-3 px-4 py-3 text-xs text-slate-700 items-start">
                        <span className="font-bold">{row.readyDate || "-"}</span>
                        <span>{row.readyTime || "-"}</span>
                        <span className="font-bold">{row.orderId || "-"}</span>
                        <span>{row.lotNumber || "-"}</span>
                        <span className="font-medium truncate">{row.item || "-"}</span>
                        <span>{row.itemCode || "-"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLnReadyExportModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-6xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-emerald-50/70 flex items-start justify-between gap-4 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 italic">{t("importExportDashboard.readyForLn", "Gereed voor LN")}</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">{t("importExportDashboard.readyForLnBody", "Export van gereedgemelde producten om terug te boeken in ERP (Per export, Per dag, Per week).")}</p>
              </div>
              <button
                onClick={() => setShowLnReadyExportModal(false)}
                className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr_1fr] gap-4">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <select
                    value={lnRangeMode}
                    onChange={(e) => setLnRangeMode(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                  >
                    <option value="export">Per export</option>
                    <option value="day">{t("importExportDashboard.perDay", "Per dag")}</option>
                    <option value="week">{t("importExportDashboard.perWeek", "Per week")}</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    {lnRangeMode === "day" ? (
                      <input
                        type="date"
                        value={lnDateValue}
                        onChange={(e) => setLnDateValue(e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                      />
                    ) : lnRangeMode === "week" ? (
                      <input
                        type="week"
                        value={lnWeekValue}
                        onChange={(e) => setLnWeekValue(e.target.value)}
                        className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value="Sinds laatste PDF export"
                        readOnly
                        className="w-full pl-9 pr-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-700"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLnDateValue(formatDateInputValue(new Date()));
                      setLnWeekValue(formatWeekInputValue(new Date()));
                      setLnRangeMode("export");
                    }}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors shrink-0"
                    title={t("importExportDashboard.backToToday", "Terug naar vandaag")}
                  >
                    Reset view
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportLnReadyListPdf}
                  disabled={lnReadyQrRows.length === 0}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <FileText size={14} /> {t("importExportDashboard.listPdf", "Lijst PDF")}
                </button>
                <button
                  type="button"
                  onClick={handleExportLnReadyPdf}
                  disabled={lnReadyQrRows.length === 0}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> {t("importExportDashboard.qrPdf", "QR PDF")}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-widest text-slate-400">
                <span>{t("importExportDashboard.period", "Periode")}: {lnPeriodDisplayLabel}</span>
                <span>{lnReadyQrRows.length} {t("importExportDashboard.orderRows", "orderregels")}</span>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                <p className="font-black uppercase tracking-widest text-[10px]">Reset teller</p>
                <p className="mt-1 font-semibold">
                  {lastLnResetAt
                    ? `Laatste reset na PDF-export: ${format(lastLnResetAt, "yyyy-MM-dd HH:mm")}`
                    : "Nog geen LN PDF-export gevonden."}
                </p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  Items die Naharding/oven hebben bereikt, worden niet meer meegeteld in deze lijst.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[6rem_8rem_minmax(0,1fr)_5rem_5rem_5rem_5rem] gap-3 bg-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>{t("importExportDashboard.station", "Station")}</span>
                  <span>{t("importExportDashboard.order", "Order")}</span>
                  <span>{t("importExportDashboard.product", "Product")}</span>
                  <span>Totaal</span>
                  <span>To do</span>
                  <span>Naharding</span>
                  <span>{t("importExportDashboard.amount", "Aantal")}</span>
                </div>
                <div className="max-h-[22rem] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {lnReadyQrRows.length === 0 ? (
                    <div className="px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                      {t("importExportDashboard.noLnQrRulesForSelection", "Geen LN QR-exportregels gevonden voor deze selectie.")}
                    </div>
                  ) : (
                    lnReadyQrRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-[6rem_8rem_minmax(0,1fr)_5rem_5rem_5rem_5rem] gap-3 px-4 py-3 text-xs text-slate-700 items-center">
                        <span className="font-bold">{row.station || "-"}</span>
                        <span className="font-bold">{row.orderId || "-"}</span>
                        <span className="truncate" title={row.item}>{row.item || "-"}</span>
                        <span className="font-bold text-slate-700">{row.totalOrderCount || 0}</span>
                        <span className="font-bold text-orange-700">{row.todoCount || 0}</span>
                        <span className="font-bold text-amber-700">{row.nahardingCount || 0}</span>
                        <span className="font-bold text-blue-600">{row.count || 0}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-100 flex items-center justify-between gap-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">QR export geschiedenis (laatste 5 dagen)</h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{lnExportHistory.length} exports</span>
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {lnHistoryLoading ? (
                    <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                      Historie laden...
                    </div>
                  ) : lnExportHistory.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                      Geen exports in de laatste 5 dagen.
                    </div>
                  ) : (
                    lnExportHistory.map((entry) => (
                      <div key={entry.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                            {entry.exportKind === "qr" ? "QR PDF" : "Lijst PDF"} - {entry.periodLabel}
                          </p>
                          <p className="text-[11px] text-slate-500 font-semibold truncate">
                            {format(entry.createdAt, "yyyy-MM-dd HH:mm")} - {entry.rows.length} regels
                            {entry.createdByEmail ? ` - ${entry.createdByEmail}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadHistoryEntry(entry)}
                          disabled={entry.rows.length === 0}
                          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                        >
                          <Download size={12} /> Opnieuw
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showLnReadyExportModal && pendingLnExportKind && (
        <div className="fixed inset-0 z-[140] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-[28px] border border-amber-200 bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 bg-amber-50 border-b border-amber-100 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-black text-amber-900 uppercase tracking-widest">
                  {pendingLnExportKind === "qr" ? "QR PDF export" : "Lijst PDF export"}
                </h4>
                <p className="mt-2 text-sm font-semibold text-amber-800">
                  Kies of deze export ook direct het telmoment reset. Bij reset tellen nieuwe items vanaf dit exportmoment opnieuw op.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingLnExportKind(null)}
                className="p-2 rounded-full bg-white border border-amber-200 text-amber-700 hover:bg-amber-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => executeLnExport(pendingLnExportKind, true)}
                className="w-full px-4 py-4 bg-amber-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-700 transition-colors"
              >
                Exporteren en resetten
              </button>
              <button
                type="button"
                onClick={() => executeLnExport(pendingLnExportKind, false)}
                className="w-full px-4 py-4 bg-white border border-amber-200 text-amber-800 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-50 transition-colors"
              >
                Alleen exporteren
              </button>
              <button
                type="button"
                onClick={() => setPendingLnExportKind(null)}
                className="w-full px-4 py-4 bg-slate-100 border border-slate-200 text-slate-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {showInventoryModal && (
        <InventoryCheckModal
          isOpen={showInventoryModal}
          onClose={() => setShowInventoryModal(false)}
          trackedProducts={trackedProducts as any[]}
        />
      )}
    </div>
  );
};

export default ImportExportDashboard;