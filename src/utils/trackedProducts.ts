import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { PATHS, getPathString } from "../config/dbPaths";
import { FITTING_MACHINES, PIPE_MACHINES, normalizeMachine } from "./hubHelpers";

type TimestampLike = { toMillis?: () => number; seconds?: number };

type TrackedProductDoc = Record<string, unknown> & {
  id: string;
  status?: string;
  updatedAt?: TimestampLike | string | number | Date | null;
  createdAt?: TimestampLike | string | number | Date | null;
};

type ScopedTarget = {
  department: string;
  machine: string;
  key: string;
};

type SubscribeTrackedProductsParams = {
  db: any;
  onData: (items: TrackedProductDoc[]) => void;
  onError?: (error: unknown) => void;
  statusExclusions?: string[];
  maxItems?: number | null;
  departments?: string[];
  machines?: string[];
};

const DEFAULT_TRACKING_DEPARTMENTS = ["Fittings", "Pipes"];
const DEFAULT_TRACKING_MACHINES = [...FITTING_MACHINES, ...PIPE_MACHINES];

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

const toMillis = (
  value: TimestampLike | string | number | Date | null | undefined
): number => {
  if (!value) return 0;
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof value.seconds === "number"
  ) {
    return value.seconds * 1000;
  }
  const ms =
    value instanceof Date
      ? value.getTime()
      : new Date(
          typeof value === "string" || typeof value === "number"
            ? value
            : String(value)
        ).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const sortByNewest = (items: TrackedProductDoc[] = []): TrackedProductDoc[] =>
  [...items].sort((a, b) => {
    const bMs = Math.max(toMillis(b?.updatedAt), toMillis(b?.createdAt));
    const aMs = Math.max(toMillis(a?.updatedAt), toMillis(a?.createdAt));
    return bMs - aMs;
  });

const mergeTrackingDocs = (
  rootDocs: TrackedProductDoc[] = [],
  scopedDocs: TrackedProductDoc[] = []
): TrackedProductDoc[] => {
  const merged = new Map<string, TrackedProductDoc>();
  rootDocs.forEach((item) => merged.set(item.id, item));
  scopedDocs.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
};

const toScopedMachineSegment = (machine: string | null | undefined) => {
  const normalized = normalizeMachine(machine || "");
  if (!normalized) return "";
  if (/^(BH|BM|BA)\d+$/.test(normalized)) return `40${normalized}`;
  return normalized;
};

const buildScopedTrackingTargets = ({
  departments,
  machines,
}: {
  departments?: string[];
  machines?: string[];
}) => {
  const departmentList = Array.from(new Set((departments || DEFAULT_TRACKING_DEPARTMENTS).filter(Boolean)));
  const machineList = Array.from(new Set((machines || DEFAULT_TRACKING_MACHINES).map(toScopedMachineSegment).filter(Boolean)));

  const targets: ScopedTarget[] = [];
  departmentList.forEach((department) => {
    machineList.forEach((machine) => {
      targets.push({ department, machine, key: `${department}__${machine}` });
    });
  });
  return targets;
};

export const subscribeTrackedProducts = ({
  db,
  onData,
  onError,
  statusExclusions = [],
  maxItems = null,
  departments = DEFAULT_TRACKING_DEPARTMENTS,
  machines = DEFAULT_TRACKING_MACHINES,
}: SubscribeTrackedProductsParams) => {
  let rootDocs: TrackedProductDoc[] = [];
  const scopedBuckets = new Map<string, TrackedProductDoc[]>();
  const excluded = new Set(statusExclusions.map(normalizeStatus));

  const emit = () => {
    const scopedDocs = Array.from(scopedBuckets.values()).flat() as TrackedProductDoc[];
    let next = mergeTrackingDocs(rootDocs, scopedDocs);
    if (excluded.size > 0) {
      next = next.filter((item) => !excluded.has(normalizeStatus(item?.status)));
    }
    next = sortByNewest(next);
    const cap = typeof maxItems === "number" && Number.isFinite(maxItems) && maxItems > 0 ? maxItems : null;
    if (cap !== null) {
      next = next.slice(0, cap);
    }
    onData(next);
  };

  const rootUnsub = onSnapshot(
    collection(db, getPathString(PATHS.TRACKING)),
    (snap) => {
      rootDocs = snap.docs.map((docSnap) => ({
        ...(docSnap.data() as Record<string, unknown>),
        id: docSnap.id,
        __docPath: docSnap.ref.path,
        sourcePath: docSnap.ref.path,
      })) as TrackedProductDoc[];
      emit();
    },
    (error) => onError?.(error)
  );

  const scopedTargets = buildScopedTrackingTargets({ departments, machines });
  const scopedUnsubs = scopedTargets.map(({ department, machine, key }) =>
    onSnapshot(
      collection(db, getPathString([...PATHS.TRACKING, department, "machines", machine, "items"])),
      (snap) => {
        scopedBuckets.set(
          key,
          snap.docs.map((docSnap) => ({
            ...(docSnap.data() as Record<string, unknown>),
            id: docSnap.id,
            __docPath: docSnap.ref.path,
            sourcePath: docSnap.ref.path,
          })) as TrackedProductDoc[]
        );
        emit();
      },
      (error) => onError?.(error)
    )
  );

  return () => {
    rootUnsub();
    scopedUnsubs.forEach((unsub) => unsub());
  };
};

export const trackedLotExistsActive = async ({
  db,
  lotNumber,
  excludeDocId = null,
}: {
  db: any;
  lotNumber: string;
  excludeDocId?: string | null;
}) => {
  const normalizedLot = String(lotNumber || "").trim().toUpperCase();
  if (!normalizedLot) return false;

  const rootSnap = await getDocs(query(collection(db, getPathString(PATHS.TRACKING)), where("lotNumber", "==", normalizedLot), limit(5)));
  const hasRootConflict = rootSnap.docs.some((docSnap) => docSnap.id !== excludeDocId);
  if (hasRootConflict) return true;

  const scopedTargets = buildScopedTrackingTargets({ departments: DEFAULT_TRACKING_DEPARTMENTS, machines: DEFAULT_TRACKING_MACHINES });
  const scopedSnaps = await Promise.all(
    scopedTargets.map(({ department, machine }) =>
      getDocs(
        query(
          collection(db, getPathString([...PATHS.TRACKING, department, "machines", machine, "items"])),
          where("lotNumber", "==", normalizedLot),
          limit(1)
        )
      )
    )
  );

  return scopedSnaps.some((snap) => snap.docs.some((docSnap) => docSnap.id !== excludeDocId));
};