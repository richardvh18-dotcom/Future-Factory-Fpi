import React, { useState } from "react";
import { db } from "../../config/firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";
import {
  Database,
  Bug,
  Zap,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { PATHS } from "../../config/dbPaths";

/**
 * FirestoreDebugger V4.2 - Path Integrity Hub
 * Dynamically validates the application's connection to the new root structure.
 */
const FirestoreDebugger = () => {
  const [logs, setLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const activeAppId =
    typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";

  const addLog = (msg) => {
    setLogs((prev) =>
      [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 15)
    );
  };

  const testPath = async (label, pathArray) => {
    const pathStr = pathArray.join("/");
    try {
      // We perform a light read (limit 1) to verify connectivity
      const snap = await getDocs(query(collection(db, ...pathArray), limit(1)));
      if (!snap.empty) {
        addLog(`✅ ${label}: Data gevonden op /${pathStr}`, "success");
      } else {
        addLog(`⚠️ ${label}: Pad bereikbaar, maar map is leeg.`, "warning");
      }
    } catch (e) {
      addLog(`❌ ${label}: FOUT (${e.code}) - /${pathStr}`, "error");
    }
  };

  const runDiagnostics = async () => {
    setIsScanning(true);
    setLogs([]);
    addLog(`Draaiend op Node ID: ${activeAppId}`);
    addLog("Start integriteitscontrole...");

    // 1. Controleer de actieve productie paden uit PATHS
    await testPath("Producten", PATHS.PRODUCTS);
    await testPath("Planning", PATHS.PLANNING);
    await testPath("Gebruikers", PATHS.USERS);
    await testPath("Gereedschap", PATHS.INVENTORY);

    // 2. Controleer Systeem Config
    await testPath("Instellingen", PATHS.GENERAL_SETTINGS.slice(0, -1)); // Test de collectie, niet het doc
    await testPath("Bore Matrix", PATHS.BORE_DIMENSIONS);

    setIsScanning(false);
    addLog("Diagnostiek voltooid.");
  };

  return (
    <div className="bg-slate-900 rounded-[35px] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in flex flex-col h-full max-h-[400px]">
      {/* Header Area */}
      <div className="p-6 bg-white/5 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/40">
            <Bug size={20} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-black uppercase italic tracking-widest text-white leading-none">
              Path <span className="text-blue-400">Debugger</span>
            </h3>
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">
              Systeem Integriteit Monitor
            </p>
          </div>
        </div>

        <button
          onClick={runDiagnostics}
          disabled={isScanning}
          className="px-6 py-2.5 bg-white/10 hover:bg-blue-600 text-white border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-xl"
        >
          {isScanning ? (
            <Activity className="animate-spin" size={14} />
          ) : (
            <Zap size={14} />
          )}
          Scan Database
        </button>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-2 bg-black/20 text-left">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
            <Database size={40} className="text-slate-500 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center">
              Wacht op scan-opdracht
            </p>
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`
                    px-4 py-2.5 rounded-xl border text-[10px] font-mono leading-tight transition-all animate-in slide-in-from-left-2
                    ${
                      log.includes("✅")
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : log.includes("❌")
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                        : log.includes("⚠️")
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        : "bg-white/5 border-white/5 text-slate-400"
                    }
                `}
            >
              {log}
            </div>
          ))
        )}
      </div>

      {/* Status Footer */}
      <div className="px-6 py-3 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck size={12} className="text-blue-500" />
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">
            Node: {activeAppId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-slate-600 uppercase">
            Status:{" "}
          </span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              logs.some((l) => l.includes("❌"))
                ? "bg-rose-500 animate-pulse"
                : "bg-emerald-500"
            }`}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default FirestoreDebugger;
