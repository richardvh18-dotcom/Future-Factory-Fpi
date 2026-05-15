import { useState, useEffect, useCallback } from "react";
import { fetchAllProducts } from "../repositories/productsRepository";
/**
 * useProductsData V8.0 - Via productsRepository
 * Haalt de productcatalogus op via de centrale repository laag.
 */
export const useProductsData = (user) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchProducts = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const raw = await fetchAllProducts();
            const data = raw.map((item) => ({
                ...item,
                dn: parseInt(item.dn || item.diameter) || 0,
                pn: parseFloat(item.pn || item.pressure) || 0,
            }));
            setProducts(data);
        }
        catch (err) {
            const e = err;
            console.error("🔥 Firestore Error (Products):", e.code);
            setError(e.message ?? "Onbekende fout");
        }
        finally {
            setLoading(false);
        }
    }, [user]);
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);
    return { products, loading, error, refresh: fetchProducts };
};
