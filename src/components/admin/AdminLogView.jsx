import React, { useState, useEffect } from "react";
import {
  History,
  Search,
  Filter,
  Download,
  Loader2,
  AlertCircle,
  User,
  Clock,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  Database,
  Tag,
} from "lucide-react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * AdminLogView V4.1 - Path Integrity Fix
 * Herstelt het witte scherm door gebruik te maken van het gecorrigeerde 3-segmenten pad.
 */
const AdminLogView = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [limitCount, setLimitCount] = useState(50);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState(null);

  const actionTypes = [
    "PRODUCT_CREATE",
    "PRODUCT_UPDATE",
    "PRODUCT_DELETE",
    "MATRIX_UPDATE",
    "SETTINGS_UPDATE",
    "MASTER_SYNC",
    "LOGIN",
    "DRILL_ADD",
    "TOOL_ADD",
    "TOOL_UPDATE",
  ];

  useEffect(() => {
    if (!isValidPath("ACTIVITY_LOGS")) {
      setError("Systeempad voor logging is niet geconfigureerd.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const colRef = collection(db, ...PATHS.ACTIVITY_LOGS);

      // Let op: Bij gebruik van filterType (where) + timestamp (orderBy)
      // is een index in Firebase vereist. De default "ALL" werkt altijd.
      let q = query(colRef, orderBy("timestamp", "desc"), limit(limitCount));

      if (filterType !== "ALL") {
        q = query(
          colRef,
          where("action", "==", filterType),
          orderBy("timestamp", "desc"),
          limit(limitCount)
        );
      }

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const logData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate() || new Date(),
          }));
          setLogs(logData);
          setLoading(false);
        },
        (err) => {
          console.error("Audit Sync Error:", err);
          // FIX: Voorkom foutmelding bij uitloggen
          if (err.code === 'permission-denied') return;
          if (err.code === "failed-precondition") {
            setError(
              "Filter-index ontbreekt. Gebruik 'Alle Activiteiten' of maak de index aan in Firebase."
            );
          } else {
            setError(`Database fout: ${err.code}`);
          }
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Critical Render Error:", err);
      setError("Interne render fout. Controleer de console.");
      setLoading(false);
    }
  }, [filterType, limitCount]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.userEmail?.toLowerCase().includes(q) ||
      log.details?.toLowerCase().includes(q) ||
      log.action?.toLowerCase().includes(q)
    );
  });

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ["Datum", "Tijd", "Actie", "Gebruiker", "Details"];
    const rows = filteredLogs.map((log) => [
      format(log.timestamp, "dd-MM-yyyy"),
      format(log.timestamp, "HH:mm:ss"),
      log.action,
      log.userEmail || "Systeem",
      `"${log.details?.replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute(
      "download",
      `audit_log_${format(new Date(), "yyyyMMdd")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionColor = (action) => {
    if (action.includes("DELETE"))
      return "bg-rose-50 text-rose-600 border-rose-100";
    if (action.includes("CREATE") || action.includes("ADD"))
      return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (action.includes("UPDATE"))
      return "bg-blue-50 text-blue-600 border-blue-100";
    return "bg-slate-50 text-slate-500 border-slate-100";
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 animate-in fade-in duration-500 text-left overflow-hidden">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 p-8 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-sm gap-6">
        <div className="flex items-center gap-6 text-left">
          <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-lg">
            <History size={28} />
          </div>
          <div className="text-left">
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Activity <span className="text-blue-600">Audit</span>
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-lg border border-blue-100 italic uppercase">
                {logs.length} Records In-Memory
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-500" /> Root: /
                {PATHS.ACTIVITY_LOGS.join("/")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLimitCount((prev) => prev + 50)}
            className="p-4 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all shadow-sm border border-slate-100"
            title="Load More Records"
          >
            <RefreshCw
              size={20}
              className={loading ? "animate-spin text-blue-500" : ""}
            />
          </button>
          <button
            onClick={handleExportCSV}
            className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center gap-3"
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-8 mt-6 bg-rose-50 border-2 border-rose-100 p-4 rounded-2xl flex items-center gap-4 text-rose-600 animate-in shake">
          <AlertCircle size={20} />
          <p className="text-xs font-black uppercase tracking-widest">
            {error}
          </p>
        </div>
      )}

      {/* FILTERS */}
      <div className="p-6 bg-white border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 shrink-0">
        <div className="relative group">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder="Zoek op gebruiker, ID of detail..."
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500 transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="relative">
          <Filter
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
            size={18}
          />
          <select
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 outline-none focus:border-blue-500 appearance-none cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="ALL">Alle Activiteiten</option>
            {actionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronRight
            size={16}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 rotate-90"
          />
        </div>

        <div className="flex items-center justify-end px-4 gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <span>
              Resultaat:{" "}
              <span className="text-blue-600">{filteredLogs.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* LOG FEED */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-2 pb-40">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center gap-4 opacity-50">
              <Loader2 className="animate-spin text-blue-500" size={40} />
              <p className="text-[10px] font-black uppercase tracking-[0.4em]">
                Audit Trail Sync...
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-32 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-100">
              <Database size={64} className="mx-auto mb-4 text-slate-200" />
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-300">
                Geen logs gevonden
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all group flex items-center gap-6"
              >
                <div className="w-32 shrink-0 flex flex-col border-r border-slate-50">
                  <span className="text-xs font-black text-slate-900 tracking-tighter italic">
                    {format(log.timestamp, "dd MMM yyyy", { locale: nl })}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                    {format(log.timestamp, "HH:mm:ss")}
                  </span>
                </div>
                <div className="w-64 shrink-0 flex items-center gap-3 overflow-hidden border-r border-slate-50 px-2 text-left">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-[11px] shadow-lg shrink-0">
                    {log.userEmail?.charAt(0).toUpperCase() || "S"}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-black text-slate-700 truncate uppercase tracking-tight">
                      {log.userEmail || "Systeem"}
                    </span>
                    <span className="text-[8px] font-mono text-slate-300 uppercase">
                      UID: {log.userId?.substring(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="w-48 shrink-0 flex justify-center border-r border-slate-50 px-2">
                  <span
                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${getActionColor(
                      log.action
                    )}`}
                  >
                    {log.action
                      ?.replace("PRODUCT_", "")
                      .replace("MATRIX_", "")
                      .replace("TOOL_", "")}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-slate-600 leading-none group-hover:text-blue-600 transition-colors">
                    {log.details || "Details..."}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-100 group-hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogView;
