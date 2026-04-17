import { useState, useEffect } from "react";
import { db } from "../config/firebase";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { PATHS } from "../config/dbPaths"; // Importeer de centrale paden

/**
 * usePlanningData - Haalt de planning op uit de nieuwe root-structuur.
 * Realtime: Gebruikt onSnapshot voor live updates.
 */
export const usePlanningData = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Gebruik het nieuwe pad: /future-factory/production/digital_planning
    const planningRef = collection(db, ...PATHS.PLANNING);
    const maxOrders = Math.max(10, Number(import.meta.env.VITE_PLANNING_LIMIT || 50));
    const q = query(planningRef, orderBy("deliveryDate", "asc"), limit(maxOrders));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const normalizeStatus = (status) => String(status || "").toLowerCase().trim();
        const isRunningStatus = (status) => {
          const s = normalizeStatus(status);
          return [
            "in_progress",
            "in production",
            "active",
            "post_processing",
            "to_unload",
            "unloading",
            "to_inspect",
            "held_qc",
            "on_hold",
            "delegated",
          ].includes(s);
        };

        const orderList = snapshot.docs.map((doc) => {
          const data = doc.data();
          const hidden = Boolean(data.planningHidden);
          const keepVisible = !hidden || isRunningStatus(data.status);

          if (!keepVisible) return null;

          return {
            id: doc.id,
            ...data,
            deliveryDate: data.deliveryDate?.toDate
              ? data.deliveryDate.toDate()
              : new Date(data.deliveryDate),
          };
        }).filter(Boolean);

        setOrders(orderList);
        setLoading(false);
      },
      (err) => {
        console.error("Planning database error (Check Rules):", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
};
