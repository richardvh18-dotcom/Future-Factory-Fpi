import { useState, useEffect, useCallback } from "react";
import { fetchAllProducts } from "../repositories/productsRepository";
import type { User } from "firebase/auth";

interface Product {
  id: string;
  dn: number;
  pn: number;
  [key: string]: unknown;
}

interface UseProductsDataResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * useProductsData V8.0 - Via productsRepository
 * Haalt de productcatalogus op via de centrale repository laag.
 */
export const useProductsData = (user: User | null | undefined): UseProductsDataResult => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const raw = await fetchAllProducts() as Array<{ id: string; [key: string]: unknown }>;
      const data: Product[] = raw.map((item) => ({
        ...item,
        dn: parseInt((item.dn as string) || (item.diameter as string)) || 0,
        pn: parseFloat((item.pn as string) || (item.pressure as string)) || 0,
      }));
      setProducts(data);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error("🔥 Firestore Error (Products):", e.code);
      setError(e.message ?? "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refresh: fetchProducts };
};
