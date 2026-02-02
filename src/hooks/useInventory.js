import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";

/**
 * useInventory.js - Nieuw in Fase 2
 * Haalt gereedschappen en locatiegegevens op.
 */
const useInventory = (shouldFetch = true) => {
  const [moffen, setMoffen] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldFetch) return;

    setLoading(true);
    const q = collection(db, ...PATHS.INVENTORY);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMoffen(list);
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden inventory:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [shouldFetch]);

  return { moffen, loading };
};

export default useInventory;
