import { useState, useEffect } from "react";
import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import { isProductionInventoryScopedDoc } from "../utils/inventoryPaths";

/**
 * useInventory.js - Optimized
 * Haalt gereedschappen en locatiegegevens op.
 * Geoptimaliseerd: Gebruikt getDocs in plaats van onSnapshot.
 */
const useInventory = (shouldFetch = true) => {
  const [moffen, setMoffen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shouldFetch) return;

    let isMounted = true;
    setLoading(true);

    const fetchInventory = async () => {
      try {
        const legacyRef = collection(db, ...PATHS.INVENTORY);
        const scopedRef = query(
          collectionGroup(db, "items"),
          where("_scopeType", "==", "inventory")
        );

        const [legacySnapshot, scopedSnapshot] = await Promise.all([
          getDocs(legacyRef),
          getDocs(scopedRef),
        ]);

        if (isMounted) {
          const legacyList = legacySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            _source: "legacy",
          }));

          const scopedList = scopedSnapshot.docs
            .filter((doc) => isProductionInventoryScopedDoc(doc.ref.path))
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              _source: "scoped",
            }));

          // Scoped docs krijgen voorrang, legacy blijft fallback tijdens migratie.
          const byId = new Map();
          legacyList.forEach((entry) => byId.set(entry.id, entry));
          scopedList.forEach((entry) => byId.set(entry.id, entry));

          const list = Array.from(byId.values());
          setMoffen(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Fout bij laden inventory:", err);
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      }
    };

    fetchInventory();

    return () => {
      isMounted = false;
    };
  }, [shouldFetch]);

  return { moffen, loading, error };
};

export default useInventory;
