import { useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { db, auth } from "../config/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { PATHS } from "../config/dbPaths";

/**
 * useAdminAuth V14.0 - Unified Identity Guard
 * Beheert de authenticatie en haalt de gebruikersrol op uit de nieuwe
 * /future-factory/Users/Accounts structuur.
 */

const DEBUG_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEBUG_AUTH === "true";
const MASTER_ADMIN_UID = (import.meta.env.VITE_MASTER_ADMIN_UID || "").trim();

const debugLog = (...args: unknown[]) => {
  if (DEBUG_AUTH) console.log(...args);
};

interface AppUser {
  uid: string;
  email: string | null;
  name?: string;
  role?: string;
  isGodMode?: boolean;
  [key: string]: unknown;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  role: string | null;
  isAdmin: boolean;
  error: unknown;
}

type Listener = (state: AuthState) => void;

const initialState: AuthState = {
  user: null,
  loading: true,
  role: null,
  isAdmin: false,
  error: null,
};

const authStore = {
  state: initialState as AuthState,
  subscribers: new Set<Listener>(),
  unsubscribeAuth: null as (() => void) | null,
  unsubscribeRole: null as (() => void) | null,
  active: false,

  emit() {
    this.subscribers.forEach((listener) => listener(this.state));
  },

  setState(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  },

  stopRoleListener() {
    if (this.unsubscribeRole) {
      this.unsubscribeRole();
      this.unsubscribeRole = null;
    }
  },

  start() {
    if (this.active) return;
    this.active = true;

    this.unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      this.stopRoleListener();

      if (!firebaseUser) {
        debugLog("🔐 No active session");
        this.setState({ user: null, role: null, isAdmin: false, loading: false, error: null });
        return;
      }

      const currentUid = String(firebaseUser.uid || "").trim();
      debugLog("🔐 Auth State Changed:", firebaseUser.email || "logged in");

      if (MASTER_ADMIN_UID && currentUid === MASTER_ADMIN_UID) {
        this.setState({
          user: { uid: currentUid, email: firebaseUser.email, name: "Richard (Master Admin)", role: "admin", isGodMode: true },
          role: "admin",
          isAdmin: true,
          loading: false,
          error: null,
        });
        return;
      }

      this.setState({ loading: true, error: null });

      try {
        const userRef = doc(db, ...(PATHS.USERS as [string, ...string[]]), currentUid);
        this.unsubscribeRole = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const userRole = String(data.role || "user").toLowerCase();
              this.setState({
                user: { uid: currentUid, email: firebaseUser.email, ...data },
                role: userRole,
                isAdmin: userRole === "admin",
                loading: false,
                error: null,
              });
              return;
            }

            this.setState({
              user: {
                uid: currentUid,
                email: firebaseUser.email,
                role: "guest",
                name: firebaseUser.displayName || String(firebaseUser.email || "gebruiker").split("@")[0],
              },
              role: "guest",
              isAdmin: false,
              loading: false,
              error: null,
            });
          },
          (err) => {
            console.error("Auth Guard Firestore Error:", (err as { code?: string })?.code || "unknown", err?.message || err);
            this.setState({ role: "guest", isAdmin: false, loading: false, error: err });
          },
        );
      } catch (err) {
        console.error("Auth Guard Process Error:", err);
        this.setState({ loading: false, error: err });
      }
    });
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.unsubscribeAuth) { this.unsubscribeAuth(); this.unsubscribeAuth = null; }
    this.stopRoleListener();
  },

  subscribe(listener: Listener) {
    this.subscribers.add(listener);
    listener(this.state);

    if (this.subscribers.size === 1) this.start();

    return () => {
      this.subscribers.delete(listener);
      if (this.subscribers.size === 0) this.stop();
    };
  },
};

export const useAdminAuth = (): AuthState => {
  const [state, setState] = useState<AuthState>(authStore.state);
  useEffect(() => authStore.subscribe(setState), []);
  return state;
};
