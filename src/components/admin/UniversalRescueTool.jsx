import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { db, auth } from "../../config/firebase";
import {
  getDocs,
  query,
  limit,
  collectionGroup,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  Database,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Globe,
  Terminal,
  ShieldCheck,
  TestTube2,
  DatabaseZap,
  FolderSearch,
  ChevronRight,
} from "lucide-react";

/**
 * UniversalRescueTool V6.0 - Advanced Forensic Validator
 * Deze tool is het ultieme redmiddel om data-integriteit te controleren
 * en verloren paden te identificeren in zowel /artifacts/ als /future-factory/.
 */
const UniversalRescueTool = () => {
  const { t } = useTranslation();
  const [foundCollections, setFoundCollections] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [authStatus, setAuthStatus] = useState(t('universalRescueTool.checking', "Controleren..."));

  const activeProjectId = db?._databaseId?.projectId || t('common.unknown', "ONBEKEND");

  const addLog = (msg) => {
    setLogs((prev) =>
      [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30)
    );
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthStatus(`${t('universalRescueTool.loggedIn', 'Ingelogd')} (${user.uid.substring(0, 8)})`);
        addLog(t('universalRescueTool.sessionActive', "Sessie actief en geautoriseerd."));
      } else {
        setAuthStatus(t('universalRescueTool.notLoggedIn', "Niet ingelogd..."));
        signInAnonymously(auth).catch((err) =>
          addLog(t('universalRescueTool.authError', "Auth Fout: ") + err.message)
        );
      }
    });
    return () => unsub();
  }, []);

  /**
   * TEST: Schrijf-validatie naar de Root
   * Controleert of de Security Rules schrijven naar de nieuwe structuur toestaan.
   */
  const runWriteTest = async () => {
    setIsTesting(true);
    setError(null);
    addLog(t('universalRescueTool.startIntegrityTest', "Start integriteits-test voor Root Rules..."));
    try {
      // We proberen een verborgen test-document in de settings te schrijven
      const testRef = doc(
        db,
        "future-factory",
        "settings",
        "connection_test",
        "ping"
      );
      await setDoc(testRef, {
        timestamp: new Date().toISOString(),
        status: "Success",
        projectId: activeProjectId,
      });
      addLog(t('universalRescueTool.rulesCheckOk', "✅ RULES CHECK OK: Je kunt schrijven naar /future-factory/"));

      // Direct weer opruimen
      await deleteDoc(testRef);
      addLog(t('universalRescueTool.systemReady', "Systeem is gereed voor data-migratie."));
    } catch (err) {
      addLog(`${t('universalRescueTool.accessDenied', "❌ TOEGANG GEWEIGERD: ")}${err.code}`);
      setError(
        t('universalRescueTool.writeTestFailed', { code: err.code, defaultValue: `Schrijf-test mislukt (${err.code}). Je Firestore Rules blokkeren toegang tot de nieuwe root.` })
      );
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * SCAN: Forensisch onderzoek naar collecties
   * Zoekt via collectionGroup overal in de database naar bekende namen.
   */
  const runDeepForensicScan = async () => {
    setIsScanning(true);
    setError(null);
    setFoundCollections([]);
    setLogs([]);
    addLog(t('universalRescueTool.scanStarted', { projectId: activeProjectId, defaultValue: `Forensische scan gestart voor Project: ${activeProjectId}` }));

    const targetCollections = [
      "products",
      "digital_planning",
      "user_roles",
      "settings",
      "tracked_products",
      "inventory",
      "activity_logs",
    ];

    try {
      addLog(t('universalRescueTool.startDeepSearch', "Start Deep Search via Collection Groups..."));
      for (const colName of targetCollections) {
        try {
          const groupRef = collectionGroup(db, colName);
          const q = query(groupRef, limit(1));
          const snap = await getDocs(q);

          if (!snap.empty) {
            const fullPath = snap.docs[0].ref.path;
            const folderPath = fullPath.replace(`/${snap.docs[0].id}`, "");

            addLog(t('universalRescueTool.dataFound', { colName, defaultValue: `🔥 DATA GEVONDEN: '${colName}'` }));
            setFoundCollections((prev) => [
              ...prev,
              {
                name: colName,
                path: folderPath,
                isNewRoot: folderPath.startsWith("future-factory"),
                isArtifact: folderPath.startsWith("artifacts"),
              },
            ]);
          } else {
            addLog(t('universalRescueTool.nothingFoundFor', { colName, defaultValue: `- Niets gevonden voor '${colName}'` }));
          }
        } catch {
          addLog(t('universalRescueTool.skipNoRights', { colName, defaultValue: `⚠️ Overslaan '${colName}': Geen leesrechten.` }));
        }
      }

      if (foundCollections.length === 0) {
        setError(
          t('universalRescueTool.noDataFoundCheckKey', { projectId: activeProjectId, defaultValue: `Geen data gevonden. Controleer of de API Key in firebase.js echt bij project '${activeProjectId}' hoort.` })
        );
      }
      addLog(t('universalRescueTool.scanComplete', "Scan voltooid."));
    } catch (err) {
      setError(t('universalRescueTool.fatalError', "Fataal systeem-onderzoek fout: ") + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 md:p-6 text-white font-sans text-left">
      <div className="max-w-5xl w-full bg-white/5 border border-white/10 rounded-[50px] p-8 md:p-12 backdrop-blur-xl relative overflow-hidden shadow-2xl">
        {/* Decoratie */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl"></div>

        <div className="flex flex-col md:flex-row items-center gap-6 mb-12 relative z-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 rotate-3 shrink-0">
            <DatabaseZap size={40} strokeWidth={2.5} />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">
              {t('universalRescueTool.database', "Database")} <span className="text-blue-500">{t('universalRescueTool.forensics', "Forensics")}</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 italic">
              {t('universalRescueTool.versionInfo', "Versie 6.0 | Advanced Rescue & Root Validation")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          {/* LINKER KOLOM: STATUS & ACTIES */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-black/40 rounded-[35px] p-8 border border-white/5 space-y-6">
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} /> {t('universalRescueTool.systemIdentity', "Systeem Identiteit")}
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase mb-1">
                    {t('universalRescueTool.liveProjectId', "Live Project ID:")}
                  </p>
                  <p className="font-mono text-lg text-emerald-400 font-bold truncate">
                    {activeProjectId}
                  </p>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase mb-2">
                    {t('universalRescueTool.connectionStatus', "Verbindingsstatus:")}
                  </p>
                  <p className="font-mono text-[10px] text-blue-400 italic bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
                    <ShieldCheck
                      size={12}
                      className="inline mr-2 text-emerald-500"
                    />{" "}
                    {authStatus}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={runWriteTest}
                disabled={isTesting || isScanning}
                className="py-6 bg-emerald-600/10 text-emerald-400 border-2 border-emerald-500/30 rounded-[30px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-600/20 transition-all disabled:opacity-50 active:scale-95"
              >
                {isTesting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <TestTube2 size={20} />
                )}
                {t('universalRescueTool.rulesValidationTest', "Rules Validatie Test")}
              </button>
              <button
                onClick={runDeepForensicScan}
                disabled={isScanning || isTesting}
                className="py-8 bg-blue-600 text-white rounded-[35px] font-black uppercase text-sm tracking-[0.2em] shadow-xl hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-4"
              >
                {isScanning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderSearch size={24} />
                )}
                {t('universalRescueTool.startDeepScan', "Start Deep Scan")}
              </button>
            </div>
          </div>

          {/* RECHTER KOLOM: LOGS */}
          <div className="lg:col-span-7">
            <div className="bg-black/60 rounded-[40px] border border-white/10 p-8 flex flex-col h-[500px] shadow-inner">
              <div className="flex items-center justify-between text-slate-500 mb-6 border-b border-white/5 pb-5">
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {t('universalRescueTool.forensicLog', "Forensic Investigation Log")}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                    <Search size={48} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">
                      {t('universalRescueTool.waitingForScan', "Wacht op scan-trigger...")}
                    </p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <p
                      key={i}
                      className={`text-[11px] font-mono leading-relaxed p-2 rounded-lg ${
                        log.includes("✅") || log.includes("🔥")
                          ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                          : log.includes("❌")
                          ? "bg-rose-500/10 text-rose-400 border-l-2 border-rose-500"
                          : "text-slate-400"
                      }`}
                    >
                      {log}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* GEVONDEN LOCATIES OVERVIEW */}
        {foundCollections.length > 0 && (
          <div className="mt-10 space-y-4 animate-in slide-in-from-bottom-6 duration-700">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest ml-6 flex items-center gap-2">
              <CheckCircle2 size={16} /> {t('universalRescueTool.foundDataSources', "Gevonden Databronnen in Root:")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {foundCollections.map((col, i) => (
                <div
                  key={i}
                  className="bg-white/5 border border-white/10 p-6 rounded-[30px] flex items-center justify-between hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`p-4 rounded-2xl shadow-inner ${
                        col.isNewRoot
                          ? "bg-blue-600/20 text-blue-400"
                          : "bg-amber-600/20 text-amber-400"
                      }`}
                    >
                      <Database size={24} />
                    </div>
                    <div className="text-left overflow-hidden">
                      <p
                        className={`text-xs font-black uppercase tracking-widest mb-1 ${
                          col.isNewRoot ? "text-blue-400" : "text-amber-400"
                        }`}
                      >
                        {col.name}{" "}
                        {col.isNewRoot && (
                          <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded ml-2">
                            {t('universalRescueTool.rootReady', "Root Ready")}
                          </span>
                        )}
                      </p>
                      <code className="text-[10px] font-mono text-slate-400 truncate block">
                        /{col.path}/{col.name}
                      </code>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-slate-700 group-hover:text-white transition-colors shrink-0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 p-6 bg-rose-500/10 border-2 border-rose-500/30 rounded-[30px] flex items-start gap-5 animate-in shake">
            <AlertTriangle size={32} className="text-rose-500 shrink-0" />
            <div className="text-left">
              <h4 className="text-sm font-black uppercase text-rose-400">
                {t('universalRescueTool.scanInterrupted', "Scan Onderbroken")}
              </h4>
              <p className="text-xs text-rose-200/70 leading-relaxed mt-1">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* FEEDBACK INSTRUCTIE */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 opacity-60">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <ShieldCheck size={14} /> {t('universalRescueTool.systemToolName', "Systeem: Future Factory MES Forensic Tool")}
          </div>
          <div className="bg-blue-600/20 text-blue-400 px-6 py-2 rounded-full border border-blue-500/20 text-[9px] font-black uppercase tracking-[0.2em] italic">
            {t('universalRescueTool.readyForMigration', "Ready for Node Migration")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniversalRescueTool;
