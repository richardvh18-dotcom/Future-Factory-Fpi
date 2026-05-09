// @ts-nocheck
import { useState, useEffect } from "react";
import { collection, collectionGroup, query, onSnapshot, doc, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../config/firebase";
import { subDays } from "date-fns";
import { PATHS, getArchiveItemsPath, getArchiveRejectedItemsPath } from "../../config/dbPaths";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { normalizeMachine } from "../../utils/hubHelpers";

/**
 * useTeamleaderFirestore
 *
 * Manages all Firestore real-time listeners for the TeamleaderHub.
 * Provides: rawOrders, rawProducts, bezetting, archivedProducts,
 *           archivedHistoryProducts, archivedRejectedProducts, factoryConfig,
 *           loading, dbError.
 */
export const useTeamleaderFirestore = ({ user }) => {
  const [rawOrders, setRawOrders] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [bezetting, setBezetting] = useState([]);
  const [archivedHistoryProducts, setArchivedHistoryProducts] = useState([]);
  const [archivedRejectedProducts, setArchivedRejectedProducts] = useState([]);
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const unsubs = [];
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
      let rootOrders = [];
      let scopedOrders = [];

      const mapOrderDoc = (docSnap) => {
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
        const merged = new Map();

        const getMergeKey = (order) => {
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
        collection(db, ...PATHS.PLANNING),
        (snap) => {
          rootOrders = snap.docs
            .map(mapOrderDoc)
            .filter((entry) => !!String(entry?.orderId || entry?.id || "").trim());
          mergeOrders();
          markStreamReady();
        },
        (err) => {
          if (!isMounted) return;
          console.error("Planning Root Sync Error:", err);
          setDbError(err.code || "permission-denied");
          markStreamReady();
        }
      );
      unsubs.push(unsubRootOrders);

      const unsubScopedOrders = onSnapshot(
        collectionGroup(db, "orders"),
        (snap) => {
          scopedOrders = snap.docs
            .filter((d) => {
              const path = d.ref.path || "";
              return (
                path.includes("/production/digital_planning/") &&
                path.includes("/machines/") &&
                path.includes("/orders/")
              );
            })
            .map(mapOrderDoc)
            .filter((entry) => !!String(entry?.orderId || entry?.id || "").trim());
          mergeOrders();
          markStreamReady();
        },
        (err) => {
          if (!isMounted) return;
          console.error("Planning Scoped Sync Error:", err);
        }
      );
      unsubs.push(unsubScopedOrders);

      // LISTENER 2: Products
      const unsubProds = subscribeTrackedProducts({
        db,
        onData: (items) => {
          if (!isMounted) return;
          setRawProducts(items);
        },
        onError: (err) => {
          if (err.code === "permission-denied") return;
          console.warn("Tracked Products Sync Error:", err.code);
          markStreamReady();
        },
      });
      unsubs.push(unsubProds);
      markStreamReady();

      // LISTENER 3: Occupancy
      const unsubOcc = onSnapshot(
        collection(db, ...PATHS.OCCUPANCY),
        (snap) => {
          isMounted && setBezetting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => {
          if (err.code === "permission-denied") return;
          console.warn("Occupancy Sync Error:", err.code);
        }
      );
      unsubs.push(unsubOcc);

      // LISTENER 4: Factory Config
      const unsubConfig = onSnapshot(
        doc(db, ...PATHS.FACTORY_CONFIG),
        (snap) => {
          if (isMounted && snap.exists()) setFactoryConfig(snap.data());
        },
        (err) => {
          if (err.code === "permission-denied") return;
          console.warn("Factory Config Sync Error:", err);
        }
      );
      unsubs.push(unsubConfig);

      const now = new Date();
      const minArchiveDate = subDays(now, 365);
      const archiveDataByYear = {};

      const syncArchiveHistory = () => {
        if (!isMounted) return;
        const combined = Object.values(archiveDataByYear)
          .flatMap((items) => items || [])
          .sort((a, b) => {
            const aMs =
              a?.timestamps?.finished?.toMillis?.() ||
              a?.updatedAt?.toMillis?.() ||
              new Date(a?.updatedAt || 0).getTime() ||
              0;
            const bMs =
              b?.timestamps?.finished?.toMillis?.() ||
              b?.updatedAt?.toMillis?.() ||
              new Date(b?.updatedAt || 0).getTime() ||
              0;
            return bMs - aMs;
          });
        setArchivedHistoryProducts(combined);
      };

      // LISTENERS 6+: Archive history (current + previous year)
      [now.getFullYear(), now.getFullYear() - 1].forEach((historyYear) => {
        const unsubArchiveYear = onSnapshot(
          query(
            collection(db, ...getArchiveItemsPath(historyYear)),
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
          (err) => console.warn("Archive Sync Error (KPI History):", historyYear, err.code)
        );
        unsubs.push(unsubArchiveYear);

        const unsubRejectedYear = onSnapshot(
          collection(db, ...getArchiveRejectedItemsPath(historyYear)),
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
          (err) => console.warn("Archive Rejected Sync Error:", historyYear, err.code)
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
    factoryConfig,
    loading,
    dbError,
  };
};
