import { auth, logActivity as logActivityCore } from "../config/firebase";

type LogLevel = "info" | "warn" | "error" | "debug";

// Backward-compatible wrapper rond de centrale logger in firebase.jsx
export const logActivity = async (
  action: string,
  module: string,
  details: Record<string, unknown> = {},
  level: LogLevel = "info",
) => {
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