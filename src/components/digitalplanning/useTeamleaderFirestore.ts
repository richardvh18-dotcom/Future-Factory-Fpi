import { useState, useEffect } from "react";
import { collection, collectionGroup, query, onSnapshot, doc, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";
import { subDays } from "date-fns";
import { PATHS, getArchiveItemsPath, getArchiveRejectedItemsPath, getPathString } from "../../config/dbPaths";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { normalizeMachine } from "../../utils/hubHelpers";

type TeamleaderUser = {
  role?: string;
};

type FirestoreOrder = {
  id?: string;
  docId?: string;
  sourceDataId?: string | null;
  __docPath?: string;
  sourcePath?: string;
  orderId?: string;
  orderNumber?: string;
  machine?: string;
  status?: string;
  [key: string]: unknown;
};

type FirestoreTrackedProduct = {
  id?: string;
  timestamps?: { finished?: { toMillis?: () => number } };
  updatedAt?: { toMillis?: () => number } | string | number | Date;
  _archiveYear?: number;
  [key: string]: unknown;
};

type FactoryConfig = Record<string, unknown> | null;

type AnyRecord = Record<string, any>;

const toMillisSafe = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === "object") {
    const maybeToMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof maybeToMillis === "function") {
      const ms = maybeToMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
  }
  return 0;
};

/**
 * useTeamleaderFirestore
 *
 * Manages all Firestore real-time listeners for the TeamleaderHub.
 * Provides: rawOrders, rawProducts, bezetting, archivedProducts,
 *           archivedHistoryProducts, archivedRejectedProducts, factoryConfig,
 *           loading, dbError.
 */
export const useTeamleaderFirestore = ({ user }: { user: TeamleaderUser | null | undefined }) => {
  const [rawOrders, setRawOrders] = useState<FirestoreOrder[]>([]);
  const [rawProducts, setRawProducts] = useState<FirestoreTrackedProduct[]>([]);
  const [bezetting, setBezetting] = useState<Record<string, unknown>[]>([]);
  const [archivedHistoryProducts, setArchivedHistoryProducts] = useState<FirestoreTrackedProduct[]>([]);
  const [archivedRejectedProducts, setArchivedRejectedProducts] = useState<FirestoreTrackedProduct[]>([]);
  const [activeDowntimes, setActiveDowntimes] = useState<AnyRecord[]>([]);
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const unsubs: Array<() => void> = [];
    let loadedCount = 0;

    const markStreamReady = () => {
      loadedCount++;
      if (loadedCount >= 2 && isMounted) {
        setLoading(false);
      }
    };

    const initData = async () => {
      const auth = getAuth();

      if (!user.role || user.role === "guest") {
        setLoading(false);
        return;
      }

      setLoading(true);
      setDbError(null);

      // LISTENER 1: Orders (legacy root + scoped /machines/*/orders)
      let rootOrders: FirestoreOrder[] = [];
      let scopedOrders: FirestoreOrder[] = [];

      const mapOrderDoc = (docSnap: import("firebase/firestore").QueryDocumentSnapshot) => {
        const data = docSnap.data() || {};
        const sourceDataId = String(data?.id || "").trim();
        return {
          ...data,
          id: docSnap.id,
          docId: docSnap.id,
          sourceDataId: sourceDataId || null,
          __docPath: docSnap.ref.path,
          sourcePath: data?.sourcePath || docSnap.ref.path,
          orderId: data.orderId || data.orderNumber || docSnap.id,
        };
      };

      const mergeOrders = () => {
        if (!isMounted) return;
        const merged = new Map<string, FirestoreOrder>();

        const getMergeKey = (order: FirestoreOrder): string => {
          const pathKey = String(order?.__docPath || order?.sourcePath || "").trim();
          if (pathKey) return pathKey;
          const orderKey = String(order?.orderId || order?.id || "").trim();
          if (!orderKey) return "";
          const machineKey = String(normalizeMachine(order?.machine || "") || "").trim();
          return machineKey ? `${orderKey}::${machineKey}` : orderKey;
        };

        rootOrders.forEach((order) => {
          const key = getMergeKey(order);
          if (!key) return;
          merged.set(key, order);
        });

        scopedOrders.forEach((order) => {
          const key = getMergeKey(order);
          if (!key) return;
          merged.set(key, order);
        });

        setRawOrders(Array.from(merged.values()));
      };

      const unsubRootOrders = onSnapshot(
        collection(db, getPathString(PATHS.PLANNING)),
        (snap) => {
          rootOrders = snap.docs
            .map(mapOrderDoc)
            .filter((entry) => !!String(entry?.orderId || entry?.id || "").trim());
          mergeOrders();
          markStreamReady();
        },
        (err: unknown) => {
          if (!isMounted) return;
          console.error("Planning Root Sync Error:", err);
          setDbError((err as { code?: string })?.code || "permission-denied");
          markStreamReady();
        }
      );
      unsubs.push(unsubRootOrders);

      const unsubScopedOrders = onSnapshot(
        collectionGroup(db, "orders"),
        (snap) => {
          const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;
          scopedOrders = snap.docs
            .filter((d) => {
              const path = d.ref.path || "";
              return (
                path.startsWith(planningPrefix) &&
                path.includes("/machines/") &&
                path.includes("/orders/")
              );
            })
            .map(mapOrderDoc)
            .filter((entry) => !!String(entry?.orderId || entry?.id || "").trim());
          mergeOrders();
          markStreamReady();
        },
        (err: { code?: string }) => {
          if (!isMounted) return;
          console.error("Planning Scoped Sync Error:", err);
        }
      );
      unsubs.push(unsubScopedOrders);

      // LISTENER 2: Products
      const unsubProds = subscribeTrackedProducts({
        db,
        onData: (items: AnyRecord[]) => {
          if (!isMounted) return;
          setRawProducts(items as FirestoreTrackedProduct[]);
        },
        onError: (err: unknown) => {
          const code = (err as { code?: string })?.code;
          if (code === "permission-denied") return;
          console.warn("Tracked Products Sync Error:", code);
          markStreamReady();
        },
      });
      unsubs.push(unsubProds);
      markStreamReady();

      // LISTENER 3: Occupancy
      const unsubOcc = onSnapshot(
        collection(db, getPathString(PATHS.OCCUPANCY)),
        (snap) => {
          isMounted && setBezetting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err: { code?: string }) => {
          if (err.code === "permission-denied") return;
          console.warn("Occupancy Sync Error:", err.code);
        }
      );
      unsubs.push(unsubOcc);

      // LISTENER 4: Factory Config
      const unsubConfig = onSnapshot(
        doc(db, getPathString(PATHS.FACTORY_CONFIG)),
        (snap) => {
          if (isMounted && snap.exists()) setFactoryConfig(snap.data());
        },
        (err: { code?: string }) => {
          if (err.code === "permission-denied") return;
          console.warn("Factory Config Sync Error:", err);
        }
      );
      unsubs.push(unsubConfig);

      // LISTENER 5: Downtime
      const unsubDowntime = onSnapshot(
        query(
          collection(db, getPathString(PATHS.DOWNTIME)),
          where("endTime", "==", null)
        ),
        (snap) => {
          if (isMounted) setActiveDowntimes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        },
        (err: { code?: string }) => {
          if (err.code === "permission-denied") return;
          console.warn("Downtime Sync Error:", err);
        }
      );
      unsubs.push(unsubDowntime);

      const now = new Date();
      const minArchiveDate = subDays(now, 365);
      const archiveDataByYear: Record<number, FirestoreTrackedProduct[]> = {};

      const syncArchiveHistory = () => {
        if (!isMounted) return;
        const combined = Object.values(archiveDataByYear)
          .flatMap((items) => items || [])
          .sort((a, b) => {
            const aMs =
              a?.timestamps?.finished?.toMillis?.() ||
              toMillisSafe(a?.updatedAt) ||
              0;
            const bMs =
              b?.timestamps?.finished?.toMillis?.() ||
              toMillisSafe(b?.updatedAt) ||
              0;
            return bMs - aMs;
          });
        setArchivedHistoryProducts(combined);
      };

      // LISTENERS 6+: Archive history (current + previous year)
      [now.getFullYear(), now.getFullYear() - 1].forEach((historyYear) => {
        const unsubArchiveYear = onSnapshot(
          query(
            collection(db, getPathString(getArchiveItemsPath(historyYear))),
            where("timestamps.finished", ">=", minArchiveDate)
          ),
          (snap) => {
            if (!isMounted) return;
            archiveDataByYear[historyYear] = snap.docs.map((d) => ({
              id: `${historyYear}_${d.id}`,
              archiveDocId: d.id,
              archived: true,
              _archived: true,
              _archiveYear: historyYear,
              ...d.data(),
            }));
            syncArchiveHistory();
          },
          (err: { code?: string }) => console.warn("Archive Sync Error (KPI History):", historyYear, err.code)
        );
        unsubs.push(unsubArchiveYear);

        const unsubRejectedYear = onSnapshot(
          collection(db, getPathString(getArchiveRejectedItemsPath(historyYear))),
          (snap) => {
            if (!isMounted) return;
            const items = snap.docs.map((d) => ({
              id: d.id,
              _archiveYear: historyYear,
              ...d.data(),
            }));
            setArchivedRejectedProducts((prev) => {
              const filtered = prev.filter((p) => p._archiveYear !== historyYear);
              return [...filtered, ...items];
            });
          },
          (err: { code?: string }) => console.warn("Archive Rejected Sync Error:", historyYear, err.code)
        );
        unsubs.push(unsubRejectedYear);
      });

      // Background token refresh
      if (!auth.currentUser && user) {
        auth.onAuthStateChanged(() => {});
      }
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch((e) => {
          console.warn("Token refresh failed:", e);
        });
      }
    };

    initData();

    return () => {
      isMounted = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [user]);

  return {
    rawOrders,
    rawProducts,
    bezetting,
    archivedHistoryProducts,
    archivedRejectedProducts,
    activeDowntimes,
    factoryConfig,
    loading,
    dbError,
  };
};
