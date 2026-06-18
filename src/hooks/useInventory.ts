import { useState, useEffect } from "react";
import { fetchInventory } from "../repositories/inventoryRepository";

interface InventoryItem {
  id: string;
  [key: string]: unknown;
}

interface UseInventoryResult {
  moffen: InventoryItem[];
  loading: boolean;
  error: Error | null;
}

/**
 * useInventory - Via inventoryRepository
 * Haalt gereedschappen en locatiegegevens op.
 */
const useInventory = (shouldFetch = true): UseInventoryResult => {
  const [moffen, setMoffen] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shouldFetch) return;

    let isMounted = true;
    setLoading(true);

    fetchInventory()
      .then((list) => {
        if (isMounted) {
          setMoffen(list as InventoryItem[]);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        console.error("Fout bij laden inventory:", err);
        if (isMounted) { setError(err); setLoading(false); }
      });

    return () => { isMounted = false; };
  }, [shouldFetch]);

  return { moffen, loading, error };
};

export default useInventory;
