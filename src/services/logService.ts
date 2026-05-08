import { auth, logActivity as logActivityCore } from "../config/firebase";

// Backward-compatible wrapper rond de centrale logger in firebase.jsx
export const logActivity = async (action, module, details = {}, level = "info") => {
  try {
    const meta = {
      module,
      level,
      details,
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "server",
    };

    await logActivityCore(
      auth.currentUser?.uid || "system",
      action,
      JSON.stringify(meta)
    );
  } catch (error) {
    console.error("Log error:", error);
  }
};