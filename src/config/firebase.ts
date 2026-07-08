import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { PATHS, getPathString } from "./dbPaths";

const getErrorCode = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code || "");
  }
  return "";
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return "";
};

const sanitizeForFirestore = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === undefined || value === null) return null;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }
  if (valueType === "bigint") return String(value);
  if (valueType === "function" || valueType === "symbol") return String(value);

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForFirestore(entry, seen));
  }

  if (valueType === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[circular]";
    seen.add(obj);

    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      cleaned[key] = sanitizeForFirestore(entry, seen);
    }

    seen.delete(obj);
    return cleaned;
  }

  return String(value);
};

/**
 * Firebase Configuratie - Project: future-factory-377ef
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const FIRESTORE_PERSISTENCE_DISABLED_UNTIL_KEY = "fpi_firestore_persistence_disabled_until";
const FIRESTORE_QUOTA_RECOVERY_RELOAD_KEY = "fpi_firestore_quota_recovery_reload_done";

const readNumberFromStorage = (key: string): number => {
  if (typeof window === "undefined") return 0;
  try {
    const raw = String(window.localStorage.getItem(key) || "").trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const shouldUseMemoryFirestoreCache = (): boolean => {
  const disabledUntil = readNumberFromStorage(FIRESTORE_PERSISTENCE_DISABLED_UNTIL_KEY);
  return disabledUntil > Date.now();
};

const clearFirestoreLocalStorageArtifacts = () => {
  if (typeof window === "undefined") return;
  try {
    const projectId = String(firebaseConfig.projectId || "").trim();
    if (!projectId) return;

    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = String(window.localStorage.key(i) || "");
      if (!key) continue;

      const isFirestoreKey = key.startsWith("firestore_");
      const matchesProject = key.includes(projectId);
      if (isFirestoreKey && matchesProject) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore remove failures
      }
    });
  } catch {
    // ignore storage cleanup failures
  }
};

const clearFirestoreIndexedDbArtifacts = () => {
  if (typeof window === "undefined" || !window.indexedDB) return;
  try {
    const projectId = String(firebaseConfig.projectId || "").trim();
    if (!projectId) return;

    window.indexedDB.deleteDatabase(`firestore/[DEFAULT]/${projectId}/main`);
    window.indexedDB.deleteDatabase(`firestore/[DEFAULT]/${projectId}`);
  } catch {
    // ignore indexeddb cleanup failures
  }
};

const installFirestoreQuotaRecovery = () => {
  if (typeof window === "undefined") return;

  const alreadyInstalled = (window as any).__fpiFirestoreQuotaRecoveryInstalled;
  if (alreadyInstalled) return;
  (window as any).__fpiFirestoreQuotaRecoveryInstalled = true;

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reasonText = String((event as PromiseRejectionEvent)?.reason || "").toLowerCase();
      if (!reasonText.includes("quotaexceedederror") && !reasonText.includes("failed to persist write")) {
        return;
      }

      const now = Date.now();
      const disableForMs = 24 * 60 * 60 * 1000;
      window.localStorage.setItem(FIRESTORE_PERSISTENCE_DISABLED_UNTIL_KEY, String(now + disableForMs));

      clearFirestoreLocalStorageArtifacts();
      clearFirestoreIndexedDbArtifacts();

      const hasReloaded = String(window.sessionStorage.getItem(FIRESTORE_QUOTA_RECOVERY_RELOAD_KEY) || "") === "1";
      if (!hasReloaded) {
        window.sessionStorage.setItem(FIRESTORE_QUOTA_RECOVERY_RELOAD_KEY, "1");
        window.location.reload();
      }
    } catch {
      // ignore quota recovery handler failures
    }
  });
};

const createFirestoreInstance = () => {
  installFirestoreQuotaRecovery();

  if (typeof window !== "undefined" && window.indexedDB) {
    try {
      const CURRENT_CACHE_VERSION = "v3";
      const storedVersion = localStorage.getItem("fpi_firestore_cache_version");
      if (storedVersion !== CURRENT_CACHE_VERSION) {
        window.indexedDB.deleteDatabase("firestore/[DEFAULT]/future-factory-377ef/main");
        window.indexedDB.deleteDatabase("firestore/[DEFAULT]/future-factory-377ef");
        localStorage.setItem("fpi_firestore_cache_version", CURRENT_CACHE_VERSION);
        console.log("Firestore IndexedDB cache cleared (upgraded to v3).");
      }
    } catch (e) {
      console.warn("Could not check firestore cache version:", e);
    }
  }

  // Enable IndexedDB offline persistence with a safe 50MB cache size limit.
  // When quota recovery is active, force memory cache temporarily.
  if (shouldUseMemoryFirestoreCache()) {
    try {
      console.warn("Firestore persistence tijdelijk uitgeschakeld na quota-fout; memory cache actief.");
    } catch {
      // no-op
    }
    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
      });
    } catch {
      return getFirestore(app);
    }
  }

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 50 * 1024 * 1024,
      }),
    });
  } catch (error) {
    const code = getErrorCode(error).toLowerCase();
    const message = getErrorMessage(error);

    if (
      code !== "failed-precondition" &&
      code !== "unimplemented" &&
      !message.toLowerCase().includes("already been initialized")
    ) {
      console.warn("Firestore persistence fallback actief:", error);
    }

    return getFirestore(app);
  }
};

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');
export const appId = firebaseConfig.projectId;

let appCheckInitialized = false;

export const initializeOptionalAppCheck = (): void => {
  if (appCheckInitialized || typeof window === "undefined") return;

  const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
  if (!siteKey) return;

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    console.warn("App Check init overgeslagen:", error);
  }
};

import { httpsCallable } from "firebase/functions";

/**
 * logActivity - ISO 9001/27001 compliant frontend logging.
 * Roep de backend callable aan zodat deze veilig in het Audit Log geschreven wordt.
 */
export const logActivity = async (userId: string, action: string, details: unknown) => {
  try {
    const logActivityCallable = httpsCallable(functions, "clientLogActivity");
    await logActivityCallable({
      action,
      details: sanitizeForFirestore(details),
    });
  } catch (e) {
    console.error("Logging failed:", e);
  }
};

export default app;
