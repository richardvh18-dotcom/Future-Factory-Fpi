import React, { useState, useRef } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { db } from "../../../config/firebase";
import * as XLSX from "xlsx";
import { processInforUpdate } from "../../../utils/infor_sync_service";

const CapacityImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStats(null);
    
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // We hebben de ruwe array van arrays nodig voor de service
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rawData || rawData.length < 2) {
          alert("Bestand lijkt leeg of ongeldig.");
          setLoading(false);
          return;
        }

        setProcessing(true);
        
        // Roep de service aan om de data te verwerken
        // appId is niet strikt nodig omdat de service hardcoded paden gebruikt, maar we geven een default mee
        const result = await processInforUpdate(db, "fittings-app-v1", rawData);
        
        setStats(result);
        if (onSuccess) onSuccess();

      } catch (err) {
        console.error("Import error:", err);
        alert("Fout bij verwerken bestand: " + err.message);
      } finally {
        setLoading(false);
        setProcessing(false);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-200">
              <Zap size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">
                Uren & Normen Import
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 italic">
                Update efficiency database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-10">
          {!stats ? (
            <div
              onClick={() => !loading && fileInputRef.current?.click()}
              className={`border-4 border-dashed border-slate-100 rounded-[40px] p-16 text-center transition-all group ${loading ? 'opacity-50 cursor-wait' : 'hover:border-purple-400 hover:bg-purple-50/30 cursor-pointer'}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".csv, .xlsx, .xls"
                disabled={loading}
              />
              {loading || processing ? (
                <Loader2 size={64} className="mx-auto text-purple-500 animate-spin mb-6" />
              ) : (
                <Upload size={64} className="mx-auto text-slate-200 group-hover:text-purple-400 transition-colors mb-6" />
              )}
              <h3 className="text-xl font-black text-slate-800 uppercase italic">
                {loading ? "Verwerken..." : "Selecteer Infor Export"}
              </h3>
              <p className="text-slate-400 font-medium mt-2">
                Upload het Excel bestand met uren en aantallen
              </p>
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Import Succesvol!</h3>
              <p className="text-slate-500 mb-8">
                Er zijn <b>{stats.countMatched}</b> orders gematcht met de planning.<br />
                Hiervan zijn er <b>{stats.countUpdated}</b> bijgewerkt en <b>{stats.countDeleted}</b> gearchiveerd.
              </p>

              {stats.unmatchedOrders && stats.unmatchedOrders.length > 0 && (
                <div className="mb-8 text-left bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <h4 className="text-xs font-bold text-amber-800 uppercase mb-2 flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Niet gevonden in planning ({stats.unmatchedOrders.length})
                  </h4>
                  <div className="max-h-32 overflow-y-auto custom-scrollbar pr-2">
                    <div className="flex flex-wrap gap-2">
                      {stats.unmatchedOrders.map(id => (
                        <span key={id} className="text-[10px] bg-white border border-amber-200 px-2 py-1 rounded text-amber-900 font-mono font-bold">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-800">Sluiten</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CapacityImportModal;