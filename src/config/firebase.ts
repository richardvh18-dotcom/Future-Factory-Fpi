import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
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

const createFirestoreInstance = () => {
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

  // Enable IndexedDB offline persistence with a safe 50MB cache size limit
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
