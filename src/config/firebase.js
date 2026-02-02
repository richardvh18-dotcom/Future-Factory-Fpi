import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { PATHS } from "./dbPaths";

/**
 * Firebase Configuratie - Project: future-factory-377ef
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(
    "Firebase configuratie ontbreekt. Controleer je .env in de projectroot.",
    missingKeys
  );
  throw new Error("Firebase configuratie ontbreekt.");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const appId = "future-factory-377ef";

/**
 * logActivity - Gecorrigeerd om gebruik te maken van de centrale PATHS
 */
export const logActivity = async (userId, action, details) => {
  try {
    // Gebruik de centrale definitie uit dbPaths.js
    const logsRef = collection(db, ...PATHS.ACTIVITY_LOGS);
    await addDoc(logsRef, {
      userId,
      userEmail: auth.currentUser?.email || "Systeem",
      action,
      details,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.error("Logging failed:", e);
  }
};

export default app;
