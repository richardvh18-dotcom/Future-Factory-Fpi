import React from "react";
import { auth } from "../../config/firebase";

/**
 * DatabaseSetup V3.0 - Future Factory Root Edition
 * Schrijft de initiële systeemdata naar de nieuwe beveiligde root: /future-factory/
 */
const DatabaseSetup = () => {
  const location = window.location;
  const isAuthenticated = auth.currentUser && !location.pathname.includes("/login");

  // Render niets als niet ingelogd of op login pagina
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
      <div className="max-w-2xl w-full bg-white/5 border border-white/10 rounded-[50px] p-10 backdrop-blur-xl relative shadow-2xl">
        {/* ...existing code... */}
      </div>
    </div>
  );
};

export default DatabaseSetup;
