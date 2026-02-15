import React, { useState } from "react";
import { DatabaseZap, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { manualSyncDrawings } from "../../utils/manualSyncDrawings";
import ProductDetailModal from "../products/ProductDetailModal";

export default function ManualSyncDrawings() {

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    try {
      const res = await manualSyncDrawings((current, total, partialResults) => {
        setProgress({ current, total });
        setResult([...partialResults]);
      });
      console.log("Sync resultaat:", res);
      setResult(res);
      setProgress({ current: res.length, total: res.length });
    } catch (err) {
      setError(err.message || "Onbekende fout");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
    <div className="max-w-5xl mx-auto p-10 bg-white rounded-[40px] shadow-2xl border border-slate-200 my-12 text-left animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
      {/* Decorative background element */}
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
              Catalogus & Planning Integratie
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
              Synchroniseren...
            </>
          ) : (
            "Start Synchronisatie"
          )}
        </button>
      </div>

      {/* Progress Bar */}
      {syncing && progress.total > 0 && (
        <div className="mb-10 bg-slate-50 p-8 rounded-[30px] border border-slate-100 relative z-10">
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">
            <span>Verwerking</span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(34,197,94,0.5)]"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
          <p className="text-center text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-widest">
            Item {progress.current} van {progress.total}
          </p>
        </div>
      )}

      {result && (
        <div className="mt-8 animate-in slide-in-from-bottom-4 relative z-10">
          <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex items-center gap-3 text-green-700 font-black uppercase tracking-widest text-[10px] bg-green-50 px-4 py-2 rounded-xl border border-green-100">
              <CheckCircle2 size={16} /> 
              Sync voltooid
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Resultaat: {result.filter(r => r.found).length} matches
            </span>
          </div>
          
          <div className="max-h-[600px] overflow-y-auto border-2 border-slate-100 rounded-[30px] bg-white custom-scrollbar shadow-inner">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Code</th>
                  <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Status</th>
                  <th className="py-5 px-8 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Koppeling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.map((r, idx) => (
                  <tr key={r.code + idx} className={`hover:bg-slate-50/80 transition-colors ${r.found ? "bg-green-50/20" : ""}`}>
                    <td className="py-4 px-8 font-mono text-xs font-bold text-slate-600">
                      {r.code}
                      {r.sourceFields && r.sourceFields.length > 0 && (
                        <div className="text-[9px] text-slate-400 font-normal mt-1 lowercase">
                          via: {r.sourceFields.join(", ")}
                        </div>
                      )}
                      {r.viaConversion && (
                        <div className="text-[9px] text-purple-600 font-bold mt-0.5 uppercase tracking-wider">
                          Via Conversie Matrix
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-8">
                      {r.found ? (
                        <span className="text-green-600 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5 bg-green-100/50 px-2.5 py-1.5 rounded-lg w-fit border border-green-100">
                          <CheckCircle2 size={12} /> Gekoppeld
                        </span>
                      ) : r.removed ? (
                        <span className="text-orange-500 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5 bg-orange-50 px-2.5 py-1.5 rounded-lg w-fit border border-orange-100" title="Oude koppeling verwijderd">
                          <AlertTriangle size={12} /> Ontkoppeld
                        </span>
                      ) : (
                        <span className="text-rose-500 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5 bg-rose-50 px-2.5 py-1.5 rounded-lg w-fit border border-rose-100" title={r.reason || "Geen bestand gevonden"}>
                          <AlertTriangle size={12} /> Niet gevonden
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-8 text-slate-500 truncate max-w-[300px]">
                      {r.found ? (
                        <button 
                          onClick={() => setSelectedProduct(r.fullProduct)}
                          className="font-bold text-blue-600 text-xs hover:underline text-left flex items-center gap-2 hover:text-blue-700 transition-colors"
                        >
                          {r.product}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs italic opacity-50">-</span>
                      )}
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
          <div className="p-2 bg-white rounded-full shadow-sm">
            <AlertTriangle size={20} />
          </div>
          {error}
        </div>
      )}
    </div>

    {selectedProduct && (
      <ProductDetailModal 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
          userRole="admin" 
      />
    )}
    </>
  );
}
