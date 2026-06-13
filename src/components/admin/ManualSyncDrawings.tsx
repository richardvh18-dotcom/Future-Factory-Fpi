import React, { useState, useEffect } from "react";
import { DatabaseZap, Loader2, CheckCircle2, AlertTriangle, Zap, Clock, ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { manualSyncDrawings } from "../../utils/manualSyncDrawings";
import ProductDetailModal from "../products/ProductDetailModal";
import { auth, db, logActivity } from "../../config/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  doc,
  updateDoc
} from "firebase/firestore";
import { PATHS, getPathString } from "../../config/dbPaths";

type SyncResultItem = {
  code: string;
  found?: boolean;
  removed?: boolean;
  reason?: string;
  product?: string;
  fullProduct?: Record<string, unknown>;
  sourceFields?: string[];
  viaConversion?: boolean;
};

type SyncProgress = {
  current: number;
  total: number;
};

type SyncLogEntry = {
  id: string;
  code: string;
  productName: string;
  productId: string;
  timestamp: any;
  method?: string;
};

type AppSettings = {
  drawingSyncEnabled: boolean;
  lastDrawingSync?: any;
};

export default function ManualSyncDrawings() {
  const { t } = useTranslation();

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({ current: 0, total: 0 });
  const [selectedProduct, setSelectedProduct] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Load settings and logs
  useEffect(() => {
    const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as AppSettings);
      }
    });

    const logsPath = getPathString(PATHS.GENERAL_SETTINGS).replace('/general_configs/main', '/drawing_sync_logs');
    const logsQuery = query(
      collection(db, logsPath),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as SyncLogEntry));
      setLogs(entries);
    });

    return () => {
      unsubSettings();
      unsubLogs();
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    try {
      const res = (await manualSyncDrawings((current: number, total: number, partialResults: SyncResultItem[]) => {
        setProgress({ current, total });
        setResult([...partialResults]);
      })) as SyncResultItem[];
      console.log("Sync resultaat:", res);
      setResult(res);
      setProgress({ current: res.length, total: res.length });
      await logActivity(auth.currentUser?.uid || "system", "MASTER_SYNC", `Manual sync executed. Matches: ${res.filter(r => r.found).length}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || "");
      setError(message || t('manualSync.unknownError', "Onbekende fout"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Sync Tool */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 p-10 relative overflow-hidden h-full">
            <div className="absolute top-0 right-0 p-12 opacity-5 -rotate-12 pointer-events-none">
              <DatabaseZap size={200} />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-green-50 text-green-600 rounded-[25px] shadow-sm border border-green-100">
                  <DatabaseZap size={40} />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">
                    Sync <span className="text-green-600">Tekeningen</span>
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
                    {t('manualSync.subtitle', 'Catalogus & Planning Integratie')}
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3"
              >
                {syncing ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> 
                    {t('manualSync.syncing', 'Synchroniseren...')}
                  </>
                ) : (
                  t('manualSync.startSync', 'Start Synchronisatie')
                )}
              </button>
            </div>

            {/* Status & Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                  <Zap size={18} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto-Automation</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">Status</span>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${settings?.drawingSyncEnabled ? 'bg-green-100 text-green-600' : 'bg-rose-100 text-rose-600'}`}>
                      {settings?.drawingSyncEnabled ? 'Actief' : 'Gepauzeerd'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={settings?.drawingSyncEnabled !== false}
                        onChange={async (e) => {
                          const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
                          await updateDoc(settingsRef, { drawingSyncEnabled: e.target.checked });
                        }}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                  <Clock size={18} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Laatste Backend Run</span>
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {settings?.lastDrawingSync ? (
                    new Date(settings.lastDrawingSync.seconds * 1000).toLocaleString('nl-NL')
                  ) : (
                    'Nooit gedraaid'
                  )}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {syncing && progress.total > 0 && (
              <div className="mb-10 bg-slate-50 p-8 rounded-[30px] border border-slate-100 relative z-10">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">
                  <span>{t('manualSync.processing', 'Verwerking')}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {result && (
              <div className="mt-8 animate-in slide-in-from-bottom-4 relative z-10">
                <div className="flex items-center justify-between mb-6 px-2">
                  <div className="flex items-center gap-3 text-green-700 font-black uppercase tracking-widest text-[10px] bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                    <CheckCircle2 size={16} /> 
                    {t('manualSync.syncComplete', 'Sync voltooid')}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('manualSync.resultMatches', { count: result.filter(r => r.found).length, defaultValue: `Resultaat: ${result.filter(r => r.found).length} matches` })}
                  </span>
                </div>
                
                <div className="max-h-[500px] overflow-y-auto border-2 border-slate-100 rounded-[30px] bg-white custom-scrollbar shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">{t('manualSync.code', 'Code')}</th>
                        <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">{t('manualSync.status', 'Status')}</th>
                        <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">{t('manualSync.link', 'Koppeling')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {result.map((r, idx) => (
                        <tr key={r.code + idx} className={`hover:bg-slate-50/80 transition-colors ${r.found ? "bg-green-50/20" : ""}`}>
                          <td className="py-4 px-8 font-mono text-xs font-bold text-slate-600">
                            {r.code}
                          </td>
                          <td className="py-4 px-8">
                            {r.found ? (
                              <span className="text-green-600 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5 bg-green-100/50 px-2.5 py-1.5 rounded-lg w-fit border border-green-100">
                                <CheckCircle2 size={12} /> {t('manualSync.linked', 'Gekoppeld')}
                              </span>
                            ) : (
                              <span className="text-rose-500 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5 bg-rose-50 px-2.5 py-1.5 rounded-lg w-fit border border-rose-100">
                                <AlertTriangle size={12} /> {t('manualSync.notFound', 'Niet gevonden')}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-8 text-slate-500 truncate max-w-[200px]">
                            {r.found ? (
                              <button 
                                onClick={() => r.fullProduct && setSelectedProduct(r.fullProduct)}
                                className="font-bold text-blue-600 text-xs hover:underline text-left flex items-center gap-2"
                              >
                                {r.product}
                              </button>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {error && (
              <div className="mt-8 p-6 bg-rose-50 border-2 border-rose-100 rounded-[25px] text-xs font-bold text-rose-600 flex items-center gap-4 animate-in shake relative z-10">
                <AlertTriangle size={20} />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Audit Log / Success History */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 rounded-[40px] shadow-2xl p-8 h-full flex flex-col">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-white/10 rounded-2xl text-green-400">
                <ListFilter size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Activiteit</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Succesvolle Koppelingen</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                  <Clock size={40} className="mb-4 opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Geen recente logs</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-black text-green-400 uppercase tracking-widest bg-green-400/10 px-2 py-0.5 rounded-md">Match</span>
                      <span className="text-[9px] font-bold text-slate-500">
                        {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString('nl-NL') : '...'}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-300 font-bold truncate mb-1">
                      {log.code}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium truncate italic">
                      → {log.productName}
                    </div>
                    {log.method === 'MANUAL' && (
                      <div className="mt-2 text-[8px] text-slate-600 uppercase font-black tracking-tighter">Via Handmatige Sync</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {selectedProduct && (
        <ProductDetailModal 
            product={selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
            userRole="admin" 
        />
      )}
    </div>
  );
}
