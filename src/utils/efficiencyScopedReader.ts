import {
  collectionGroup,
  getDocs,
  limit,
  onSnapshot,
  query,
} from "firebase/firestore";
import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";

const EFFICIENCY_SCOPE_TYPE = "efficiency_hours";

type ScopedEfficiencyMode = "active" | "archive";

type ScopedEfficiencyDocData = DocumentData & {
  _scopeType?: unknown;
};

type ScopedEfficiencyDocSnap = QueryDocumentSnapshot<ScopedEfficiencyDocData>;

type ScopedEfficiencySnapshot = QuerySnapshot<ScopedEfficiencyDocData>;

type ScopedEfficiencyRow = ScopedEfficiencyDocData & {
  id: string;
  __docPath: string;
};

type ScopedEfficiencyReaderArgs = {
  db: Firestore;
  mode?: ScopedEfficiencyMode;
  year?: number;
  onData?: (rows: ScopedEfficiencyRow[]) => void;
  onError?: (error: unknown) => void;
};

type ScopedEfficiencyFetcherArgs = ScopedEfficiencyReaderArgs & {
  maxDocs?: number;
};

const isScopedActiveEfficiencyPath = (path: unknown): boolean => {
  const safePath = String(path || "");
  return (
    safePath.includes("/production/efficiency_hours/") &&
    safePath.includes("/machines/") &&
    safePath.includes("/items/")
  );
};

const isScopedArchiveEfficiencyPath = (path: unknown, year: unknown): boolean => {
  const safePath = String(path || "");
  return (
    safePath.includes(`/production/archive/${year}/efficiency_scoped/`) &&
    safePath.includes("/machines/") &&
    safePath.includes("/items/")
  );
};

const isMatchingScopedEfficiencyDoc = (
  docSnap: ScopedEfficiencyDocSnap,
  { mode = "active", year }: { mode?: ScopedEfficiencyMode; year?: number } = {}
) => {
  const path = docSnap?.ref?.path || "";
  const data = docSnap.data() || {};
  const scopeType = String(data._scopeType || "");

  if (scopeType && scopeType !== EFFICIENCY_SCOPE_TYPE) return false;

  if (mode === "archive") {
    if (!Number.isFinite(Number(year))) return false;
    return isScopedArchiveEfficiencyPath(path, Number(year));
  }

  return isScopedActiveEfficiencyPath(path);
};

const toRows = (
  snapshot: ScopedEfficiencySnapshot,
  options: { mode?: ScopedEfficiencyMode; year?: number }
): ScopedEfficiencyRow[] => {
  return snapshot.docs
    .filter((docSnap) => isMatchingScopedEfficiencyDoc(docSnap, options))
    .map((docSnap) => ({
      id: docSnap.id,
      __docPath: docSnap.ref.path,
      ...docSnap.data(),
    }));
};

export const subscribeScopedEfficiencyHours = ({
  db,
  mode = "active",
  year,
  onData,
  onError,
}: ScopedEfficiencyReaderArgs) => {
  return onSnapshot(
    collectionGroup(db, "items"),
    (snapshot: ScopedEfficiencySnapshot) => {
      const rows = toRows(snapshot, { mode, year });
      onData?.(rows);
    },
    (error: unknown) => {
      onError?.(error);
    }
  );
};

export const fetchScopedEfficiencyHours = async ({
  db,
  mode = "active",
  year,
  maxDocs = 5000,
}: ScopedEfficiencyFetcherArgs): Promise<ScopedEfficiencyRow[]> => {
  const capped = Math.max(1, Math.min(Number(maxDocs) || 5000, 20000));
  const snapshot = await getDocs(query(collectionGroup(db, "items"), limit(capped)));
  return toRows(snapshot, { mode, year });
};
