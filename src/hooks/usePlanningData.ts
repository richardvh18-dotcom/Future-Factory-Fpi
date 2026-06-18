import { useState, useEffect } from "react";
import { subscribePlanningOrders } from "../repositories/planningRepository";
import { isActivePlanningOrder } from "../utils/trackingHelpers";
import type { QueryDocumentSnapshot } from "firebase/firestore";

interface PlanningOrder {
  id: string;
  deliveryDate: Date;
  [key: string]: unknown;
}

interface UsePlanningDataResult {
  orders: PlanningOrder[];
  loading: boolean;
  error: Error | null;
}

/**
 * usePlanningData - Haalt de planning op uit de nieuwe root-structuur.
 * Realtime: Gebruikt onSnapshot voor live updates.
 */
export const usePlanningData = (): UsePlanningDataResult => {
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePlanningOrders(
      (docs: QueryDocumentSnapshot[]) => {
        const orderList = docs
          .map((doc) => {
            const data = doc.data();
            const hidden = Boolean(data.planningHidden);
            const keepVisible = !hidden || isActivePlanningOrder(data);

            if (!keepVisible) return null;

            return {
              id: doc.id,
              ...data,
              deliveryDate: data.deliveryDate?.toDate
                ? data.deliveryDate.toDate()
                : new Date(data.deliveryDate),
            } as PlanningOrder;
          })
          .filter((o): o is PlanningOrder => o !== null);

        setOrders(orderList);
        setLoading(false);
      },
      (err: Error) => {
        console.error("Planning database error (Check Rules):", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { orders, loading, error };
};
