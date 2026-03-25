import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, isValidPath } from "../config/dbPaths";

/**
 * useProductsData V7.0 - Optimized
 * Haalt de productcatalogus op uit /future-factory/production/products
 * Gebruikt getDocs in plaats van onSnapshot voor betere performance.
 */
export const useProductsData = (user) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    if (!isValidPath("PRODUCTS")) {
      console.error("❌ Kritieke fout: Pad 'PRODUCTS' niet gevonden in dbPaths.js");
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const colRef = collection(db, ...PATHS.PRODUCTS);
      const q = query(colRef, orderBy("lastUpdated", "desc"));

      const snap = await getDocs(q);

      const data = snap.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        // Zorg dat DN/PN altijd nummers zijn voor de filters
        dn: parseInt(doc.data().dn || doc.data().diameter) || 0,
        pn: parseFloat(doc.data().pn || doc.data().pressure) || 0,
      }));

      setProducts(data);
    } catch (err) {
      console.error("🔥 Firestore Error (Products):", err.code);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refresh: fetchProducts };
};
