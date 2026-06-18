import React, { useState, useEffect } from "react";
import i18n from "i18next";
import {
  AlertTriangle,
  BrainCircuit,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  CheckCircle2,
  Clock,
  MessageSquareQuote,
  RefreshCw,
  History as LucideHistory, // Voorkomt conflict met window.history
} from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, appId, auth, logActivity } from "../../../config/firebase";

type TimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type TrainingLogItem = {
  id: string;
  question?: string;
  answer?: string;
  feedback?: string;
  verified?: boolean;
  timestamp?: TimestampLike;
};

/**
 * AiTrainingView: Module voor kwaliteitsborging van AI antwoorden.
 * Slaat interacties op en staat correcties toe door Teamleaders/QC.
 */
const AiTrainingView = () => {
  const [logs, setLogs] = useState<TrainingLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "artifacts", appId, "public", "data", "ai_knowledge_base")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as TrainingLogItem[];
        const sorted = data.sort(
          (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
        );
        setLogs(sorted);
        setLoading(false);
      },
      (error: unknown) => {
        console.error("Fout bij laden AI logs:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleVerify = async (id: string, correctedText: string | null = null) => {
    try {
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "ai_knowledge_base",
        id
      );
      await updateDoc(docRef, {
        verified: true,
        correctedAnswer: correctedText || null,
        verifiedAt: serverTimestamp(),
      });
      await logActivity(
        auth.currentUser?.uid || "system",
        "AI_TRAINING_VERIFY",
        `AI kennisitem geverifieerd: ${id}${correctedText ? " (met correctie)" : ""}`
      );
      setEditingId(null);
      setCorrection("");
    } catch (error: unknown) {
      console.error("Fout bij verifiëren:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deze interactie verwijderen uit de kennisbank?"))
      return;
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "public", "data", "ai_knowledge_base", id)
      );
      await logActivity(
        auth.currentUser?.uid || "system",
        "AI_TRAINING_DELETE",
        `AI kennisitem verwijderd: ${id}`
      );
    } catch (error: unknown) {
      console.error("Fout bij verwijderen:", error);
    }
  };

  const negativeLogs = logs.filter(
    (l) => l.feedback === "negative" && !l.verified
  );
  const recentLogs = logs
    .filter((l) => l.feedback !== "negative" || l.verified)
    .slice(0, 15);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-400">
        <RefreshCw className="animate-spin mb-4" size={32} />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Kennisbank laden...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* SECTIE 1: TE CORRIGEREN */}
      <div>
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-4">
          <AlertTriangle className="text-red-500" size={20} /> Correcties
          Vereist
          <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-black">
            {negativeLogs.length}
          </span>
        </h3>

        {negativeLogs.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-[2rem] text-center text-emerald-600 italic">
            <CheckCircle2 size={40} className="mx-auto mb-2 opacity-50" />
            <p className="font-bold uppercase text-xs tracking-widest">
              Geen openstaande correcties.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {negativeLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border-2 border-red-100 rounded-[2rem] overflow-hidden shadow-sm hover:border-red-200 transition-colors"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                      <Clock size={12} />{" "}
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : "Zojuist"}
                    </div>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-all rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <MessageSquareQuote size={12} /> Vraag:
                      </p>
                      <p className="text-sm font-bold text-slate-700 italic">
                        "{log.question}"
                      </p>
                    </div>
                    <div className="bg-red-50/30 p-4 rounded-2xl border border-red-50">
                      <p className="text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1">
                        <ThumbsDown size={12} /> AI Antwoord:
                      </p>
                      <p className="text-sm text-slate-600">{log.answer}</p>
                    </div>
                  </div>

                  {editingId === log.id ? (
                    <div className="mt-6 space-y-3 animate-in slide-in-from-top-2">
                      <textarea
                        className="w-full bg-blue-50/50 border-2 border-blue-200 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:border-blue-500 transition-all min-h-[100px]"
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        placeholder={i18n.t("placeholders.aiTrainingCorrectAnswer", "Voer het juiste technische antwoord in...")}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVerify(log.id, correction)}
                          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-blue-700 shadow-lg shadow-blue-100"
                        >
                          Verifieer Antwoord
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-6 bg-slate-100 text-slate-400 py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200"
                        >
                          Annuleer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(log.id);
                        setCorrection(String(log.answer || ""));
                      }}
                      className="mt-6 w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md"
                    >
                      <BrainCircuit size={18} className="inline mr-2" />{" "}
                      Corrigeer & Leer Systeem
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTIE 2: HISTORIE */}
      <div className="opacity-80">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <LucideHistory size={16} /> Interactie Historie
        </h3>
        <div className="space-y-2">
          {recentLogs.map((log) => (
            <div
              key={log.id}
              className={`p-4 rounded-2xl border bg-white flex items-center justify-between transition-all ${
                log.verified
                  ? "border-emerald-100 shadow-sm"
                  : "border-slate-100 hover:border-blue-200"
              }`}
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  {log.verified ? (
                    <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded text-[8px] font-black uppercase italic">
                      Geverifieerd
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded text-[8px] font-black uppercase">
                      Onverwerkt
                    </span>
                  )}
                  <span className="text-[9px] font-bold text-slate-300 italic">
                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : "Log"}
                  </span>
                </div>
                <p className="text-xs font-black text-slate-700 truncate">
                  {log.question}
                </p>
              </div>
              <div className="flex gap-1">
                {!log.verified && (
                  <button
                    onClick={() => handleVerify(log.id)}
                    className="p-2 text-slate-300 hover:text-emerald-500 transition-colors"
                    title="Markeer als correct"
                  >
                    <ThumbsUp size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(log.id)}
                  className="p-2 text-slate-200 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AiTrainingView;
