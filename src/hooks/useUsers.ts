import { useState, useEffect } from "react";
import { fetchUsers } from "../repositories/productsRepository";

interface User {
  id: string;
  [key: string]: unknown;
}

interface UseUsersResult {
  users: User[];
  loading: boolean;
}

export const useUsers = (): UseUsersResult => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((error) => console.error("Fout bij ophalen gebruikers:", error))
      .finally(() => setLoading(false));
  }, []);

  return { users, loading };
};
