import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../config/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { PATHS } from "../config/dbPaths";

/**
 * useAdminAuth V14.0 - Unified Identity Guard
 * Beheert de authenticatie en haalt de gebruikersrol op uit de nieuwe
 * /future-factory/Users/Accounts structuur.
 */
export const useAdminAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState(null);

  // Master UID voor directe God Mode toegang (configureer via .env)
  const MASTER_ADMIN_UID = (import.meta.env.VITE_MASTER_ADMIN_UID || "").trim();

  useEffect(() => {
    let isMounted = true;
    let unsubscribeRole = () => {};

    // Monitor de Firebase Auth status
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      console.log("🔐 Auth State Changed:", firebaseUser?.email || "logged out");

      if (firebaseUser) {
        const currentUid = firebaseUser.uid.trim();
        console.log("🔐 Current UID:", currentUid);
        console.log("🔐 Master Admin UID:", MASTER_ADMIN_UID || "(niet ingesteld)");

        // 1. MASTER BYPASS (Altijd volledige rechten voor Richard)
        if (MASTER_ADMIN_UID && currentUid === MASTER_ADMIN_UID) {
          console.log("✅ Master Admin detected!");
          const adminProfile = {
            uid: currentUid,
            email: firebaseUser.email,
            name: "Richard (Master Admin)",
            role: "admin",
            isGodMode: true,
          };
          setUser(adminProfile);
          setRole("admin");
          setIsAdmin(true);
          setLoading(false);
          return;
        }

        // 2. DATABASE SYNC VOOR ANDERE GEBRUIKERS
        try {
          console.log("🔐 Looking up user in database...");
          // Gebruik het pad uit dbPaths.js: future-factory/Users/Accounts/[UID]
          const userRef = doc(db, ...PATHS.USERS, currentUid);

          unsubscribeRole = onSnapshot(
            userRef,
            (snap) => {
              if (!isMounted) return;

              if (snap.exists()) {
                console.log("✅ User found in database:", snap.data());
                const data = snap.data();
                setUser({
                  uid: currentUid,
                  email: firebaseUser.email,
                  ...data,
                });
                const userRole = (data.role || "user").toLowerCase();
                setRole(userRole);
                setIsAdmin(userRole === "admin");
              } else {
                console.log("⚠️ User not in database, setting as guest");
                // Geen record gevonden: gebruiker is een gast met beperkte rechten
                setUser({
                  uid: currentUid,
                  email: firebaseUser.email,
                  role: "guest",
                  name:
                    firebaseUser.displayName ||
                    firebaseUser.email.split("@")[0],
                });
                setRole("guest");
                setIsAdmin(false);
              }
              setLoading(false);
            },
            (err) => {
              console.error("🔐 Auth Guard Firestore Error:", err.code, err.message);
              // Bij een permissie-fout (Rules) vallen we terug op guest status
              setRole("guest");
              setLoading(false);
            }
          );
        } catch (err) {
          console.error("🔐 Auth Guard Process Error:", err);
          setLoading(false);
        }
      } else {
        // Geen actieve sessie
        console.log("🔐 No active session");
        setUser(null);
        setRole(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    // Cleanup functie bij het unmounten van de component
    return () => {
      isMounted = false;
      unsubscribeAuth();
      unsubscribeRole();
    };
  }, []);

  return { user, role, isAdmin, loading, error };
};
