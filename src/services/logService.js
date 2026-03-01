import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../config/firebase";

// Het pad dat je aangaf
const LOG_COLLECTION = ['future-factory', 'logs', 'activity_logs'];

export const logActivity = async (action, module, details = {}, level = 'info') => {
  try {
    await addDoc(collection(db, ...LOG_COLLECTION), {
      action,
      module,
      details,
      level, // 'info', 'warning', 'error', 'success'
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'anonymous',
      timestamp: serverTimestamp(),
      userAgent: window.navigator.userAgent
    });
  } catch (error) {
    console.error("Log error:", error);
  }
};