import React, { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  Check,
  X,
  Loader2,
  Save,
} from "lucide-react";
import { doc, updateDoc, serverTimestamp, query, where, collection, getDocs } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { REJECTION_REASONS } from "../../../utils/workstationLogic";
import { useNotifications } from "../../../contexts/NotificationContext";

const PostProcessingFinishModal = ({
  product,
  onClose,
  onConfirm,
  currentStation,
}) => {
  const { showWarning } = useNotifications();
  const [status, setStatus] = useState("completed");
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleReason = (reason) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  const handleConfirm = async () => {
    if (status !== "completed" && selectedReasons.length === 0) {
      showWarning("Selecteer minimaal één reden voor afkeur", "Incompleet");
      return;
    }
    setIsProcessing(true);
    await onConfirm(status, { reasons: selectedReasons, note });
    setIsProcessing(false);
  };

  // Bepaal tekst voor de groene knop
  const getOkButtonText = () => {
    if (currentStation === "BM01") return "Afronden / Gereed";
    return "Naar Eindinspectie (BM01)";
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Kwaliteitscontrole & Afronden
            </h3>
            <p className="text-xs text-slate-500 font-mono font-bold">
              {product.lotNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setStatus("completed")}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                status === "completed"
                  ? "border-green-500 bg-green-50 text-green-700 shadow-md transform scale-105"
                  : "border-slate-100 hover:border-green-200 text-slate-400"
              }`}
            >
              <CheckCircle size={24} />
              <span className="font-black text-xs uppercase">Akkoord</span>
            </button>
            <button
              onClick={() => setStatus("temp_reject")}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                status === "temp_reject"
                  ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md transform scale-105"
                  : "border-slate-100 hover:border-orange-200 text-slate-400"
              }`}
            >
              <AlertTriangle size={24} />
              <span className="font-black text-xs uppercase">Herstel</span>
            </button>
            <button
              onClick={() => setStatus("rejected")}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                status === "rejected"
                  ? "border-red-500 bg-red-50 text-red-700 shadow-md transform scale-105"
                  : "border-slate-100 hover:border-red-200 text-slate-400"
              }`}
            >
              <XCircle size={24} />
              <span className="font-black text-xs uppercase">Afkeur</span>
            </button>
          </div>

          {status !== "completed" && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in slide-in-from-top-2">
              <h4 className="font-bold text-red-900 text-xs uppercase mb-3 flex items-center gap-2">
                <AlertOctagon size={14} /> Reden van{" "}
                {status === "temp_reject" ? "Herstel" : "Afkeur"}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REJECTION_REASONS.map((reason) => (
                  <div
                    key={reason}
                    onClick={() => toggleReason(reason)}
                    className={`p-2 rounded-lg border cursor-pointer text-xs font-medium transition-all flex items-center gap-2 ${
                      selectedReasons.includes(reason)
                        ? "bg-white border-red-500 text-red-700 shadow-sm"
                        : "bg-white/50 border-transparent text-slate-500 hover:bg-white"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                        selectedReasons.includes(reason)
                          ? "bg-red-500 border-red-500"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedReasons.includes(reason) && (
                        <Check size={8} className="text-white" />
                      )}
                    </div>
                    {reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
              Opmerking (Optioneel)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Bijv. kras op flensvlak..."
              rows={3}
            />
          </div>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-200 text-sm"
          >
            Annuleren
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`px-6 py-2 rounded-lg font-bold text-white text-sm shadow-md flex items-center gap-2 transition-all active:scale-95 ${
              status === "completed"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {isProcessing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {status === "completed" ? getOkButtonText() : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostProcessingFinishModal;
