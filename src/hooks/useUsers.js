import { useState, useEffect } from "react";
import { fetchUsers } from "../repositories/productsRepository";
export const useUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        fetchUsers()
            .then(setUsers)
            .catch((error) => console.error("Fout bij ophalen gebruikers:", error))
            .finally(() => setLoading(false));
    }, []);
    return { users, loading };
};
