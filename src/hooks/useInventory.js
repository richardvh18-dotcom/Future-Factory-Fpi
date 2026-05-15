import { useState, useEffect } from "react";
import { fetchInventory } from "../repositories/inventoryRepository";
/**
 * useInventory - Via inventoryRepository
 * Haalt gereedschappen en locatiegegevens op.
 */
const useInventory = (shouldFetch = true) => {
    const [moffen, setMoffen] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!shouldFetch)
            return;
        let isMounted = true;
        setLoading(true);
        fetchInventory()
            .then((list) => {
            if (isMounted) {
                setMoffen(list);
                setLoading(false);
            }
        })
            .catch((err) => {
            console.error("Fout bij laden inventory:", err);
            if (isMounted) {
                setError(err);
                setLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, [shouldFetch]);
    return { moffen, loading, error };
};
export default useInventory;
