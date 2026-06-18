import React, { useState, useRef } from "react";
import i18n from "i18next";
import {
  X,
  Upload,
  Loader2,
  Zap,
} from "lucide-react";
import { db } from "../../../config/firebase";
import { processInforUpdate } from "../../../utils/infor_sync_service";
import { useNotifications } from '../../../contexts/NotificationContext';

type CapacityImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const CapacityImportModal = ({ isOpen, onClose, onSuccess }: CapacityImportModalProps) => {
  const { showSuccess, showError } = useNotifications();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInFlightRef = useRef(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (importInFlightRef.current) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];

      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[];
      if (!rawData || rawData.length < 2) {
        setLoading(false);
        showError("Bestand lijkt leeg of ongeldig.", "Uren & Normen Import");
        return;
      }

      importInFlightRef.current = true;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setLoading(false);
      onClose();

      void (async () => {
        try {
          const result = await processInforUpdate(db, "fittings-app-v1", rawData);
          onSuccess?.();
          showSuccess(
            `Import klaar: ${result.countMatched || 0} gematcht, ${result.countUpdated || 0} bijgewerkt, ${result.countDeleted || 0} gearchiveerd.`,
            "Uren & Normen Import"
          );
        } catch (err: unknown) {
          console.error("Import error:", err);
          const message = err instanceof Error ? err.message : String(err);
          showError(`Fout bij verwerken bestand: ${message}`, "Uren & Normen Import");
        } finally {
          importInFlightRef.current = false;
        }
      })();
    } catch (err: unknown) {
      console.error("Import error:", err);
      const message = err instanceof Error ? err.message : String(err);
      setLoading(false);
      showError(`Fout bij verwerken bestand: ${message}`, "Uren & Normen Import");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
            {loading ? (
              <Loader2 size={64} className="mx-auto text-purple-500 animate-spin mb-6" />
            ) : (
              <Upload size={64} className="mx-auto text-slate-200 group-hover:text-purple-400 transition-colors mb-6" />
            )}
            <h3 className="text-xl font-black text-slate-800 uppercase italic">
              {loading ? "Import starten..." : "Selecteer Infor Export"}
            </h3>
            <p className="text-slate-400 font-medium mt-2">
              Upload het Excel bestand met uren en aantallen
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapacityImportModal;