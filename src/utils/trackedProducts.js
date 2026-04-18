import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { PATHS } from "../config/dbPaths";
import { FITTING_MACHINES, PIPE_MACHINES, normalizeMachine } from "./hubHelpers";

const DEFAULT_TRACKING_DEPARTMENTS = ["Fittings", "Pipes"];
const DEFAULT_TRACKING_MACHINES = [...FITTING_MACHINES, ...PIPE_MACHINES];

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const sortByNewest = (items = []) =>
  [...items].sort((a, b) => {
    const bMs = Math.max(toMillis(b?.updatedAt), toMillis(b?.createdAt));
    const aMs = Math.max(toMillis(a?.updatedAt), toMillis(a?.createdAt));
    return bMs - aMs;
  });

const mergeTrackingDocs = (rootDocs = [], scopedDocs = []) => {
  const merged = new Map();
  rootDocs.forEach((item) => merged.set(item.id, item));
  scopedDocs.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
};

const toScopedMachineSegment = (machine) => {
  const normalized = normalizeMachine(machine || "");
  if (!normalized) return "";
  if (/^(BH|BM|BA)\d+$/.test(normalized)) return `40${normalized}`;
  return normalized;
};

const buildScopedTrackingTargets = ({ departments, machines }) => {
  const departmentList = Array.from(new Set((departments || DEFAULT_TRACKING_DEPARTMENTS).filter(Boolean)));
  const machineList = Array.from(new Set((machines || DEFAULT_TRACKING_MACHINES).map(toScopedMachineSegment).filter(Boolean)));

  const targets = [];
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
}) => {
  let rootDocs = [];
  const scopedBuckets = new Map();
  const excluded = new Set(statusExclusions.map(normalizeStatus));

  const emit = () => {
    const scopedDocs = Array.from(scopedBuckets.values()).flat();
    let next = mergeTrackingDocs(rootDocs, scopedDocs);
    if (excluded.size > 0) {
      next = next.filter((item) => !excluded.has(normalizeStatus(item?.status)));
    }
    next = sortByNewest(next);
    if (Number.isFinite(maxItems) && maxItems > 0) {
      next = next.slice(0, maxItems);
    }
    onData(next);
  };

  const rootUnsub = onSnapshot(
    collection(db, ...PATHS.TRACKING),
    (snap) => {
      rootDocs = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        __docPath: docSnap.ref.path,
        sourcePath: docSnap.ref.path,
        ...docSnap.data(),
      }));
      emit();
    },
    (error) => onError?.(error)
  );

  const scopedTargets = buildScopedTrackingTargets({ departments, machines });
  const scopedUnsubs = scopedTargets.map(({ department, machine, key }) =>
    onSnapshot(
      collection(db, ...PATHS.TRACKING, department, "machines", machine, "items"),
      (snap) => {
        scopedBuckets.set(
          key,
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            __docPath: docSnap.ref.path,
            sourcePath: docSnap.ref.path,
            ...docSnap.data(),
          }))
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

export const trackedLotExistsActive = async ({ db, lotNumber, excludeDocId = null }) => {
  const normalizedLot = String(lotNumber || "").trim().toUpperCase();
  if (!normalizedLot) return false;

  const rootSnap = await getDocs(query(collection(db, ...PATHS.TRACKING), where("lotNumber", "==", normalizedLot), limit(5)));
  const hasRootConflict = rootSnap.docs.some((docSnap) => docSnap.id !== excludeDocId);
  if (hasRootConflict) return true;

  const scopedTargets = buildScopedTrackingTargets({});
  const scopedSnaps = await Promise.all(
    scopedTargets.map(({ department, machine }) =>
      getDocs(
        query(
          collection(db, ...PATHS.TRACKING, department, "machines", machine, "items"),
          where("lotNumber", "==", normalizedLot),
          limit(1)
        )
      )
    )
  );

  return scopedSnaps.some((snap) => snap.docs.some((docSnap) => docSnap.id !== excludeDocId));
};