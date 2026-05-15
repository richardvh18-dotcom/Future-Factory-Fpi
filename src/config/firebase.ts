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
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
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

/**
 * logActivity - Gecorrigeerd om gebruik te maken van de centrale PATHS
 */
export const logActivity = async (userId: string, action: string, details: unknown) => {
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

    // Gebruik de centrale definitie uit dbPaths.js
    const logsRef = collection(db, getPathString(PATHS.ACTIVITY_LOGS));
    await addDoc(logsRef, {
      userId,
      userEmail: auth.currentUser?.email || "Systeem",
      action,
      details,
      year,
      month,
      yearMonth,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    const code = getErrorCode(e).toLowerCase();
    if (code.includes("permission-denied") || code.includes("insufficient-permission")) {
      return;
    }

    console.error("Logging failed:", e);
  }
};

export default app;
