import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { PATHS } from "../config/dbPaths";

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

export const subscribeTrackedProducts = ({
  db,
  onData,
  onError,
  statusExclusions = [],
  maxItems = null,
}) => {
  let rootDocs = [];
  let scopedDocs = [];
  const excluded = new Set(statusExclusions.map(normalizeStatus));

  const emit = () => {
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
      rootDocs = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      emit();
    },
    (error) => onError?.(error)
  );

  const scopedUnsub = onSnapshot(
    collectionGroup(db, "items"),
    (snap) => {
      scopedDocs = snap.docs
        .filter((docSnap) => String(docSnap.ref.path || "").includes("/tracked_products/"))
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      emit();
    },
    (error) => onError?.(error)
  );

  return () => {
    rootUnsub();
    scopedUnsub();
  };
};

export const trackedLotExistsActive = async ({ db, lotNumber, excludeDocId = null }) => {
  const normalizedLot = String(lotNumber || "").trim().toUpperCase();
  if (!normalizedLot) return false;

  const [rootSnap, scopedSnap] = await Promise.all([
    getDocs(query(collection(db, ...PATHS.TRACKING), where("lotNumber", "==", normalizedLot), limit(5))),
    getDocs(query(collectionGroup(db, "items"), where("lotNumber", "==", normalizedLot), limit(5))),
  ]);

  const hasRootConflict = rootSnap.docs.some((docSnap) => docSnap.id !== excludeDocId);
  if (hasRootConflict) return true;

  return scopedSnap.docs.some(
    (docSnap) =>
      docSnap.id !== excludeDocId &&
      String(docSnap.ref.path || "").includes("/tracked_products/")
  );
};