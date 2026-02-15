import React, { useState, useEffect } from "react";
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
  History as LucideHistory,
  Database,
  ShieldCheck,
  Save,
  X,
  Loader2, // Toegevoegd om de error te voorkomen
} from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

/**
 * AiTrainingView V6.1 - Root Path Edition
 * Module voor kwaliteitsborging van AI antwoorden in de root: /future-factory/settings/ai_knowledge_base/
 */
const AiTrainingView = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Gebruik het nieuwe root pad uit dbPaths.js
    const colRef = collection(db, ...PATHS.AI_KNOWLEDGE_BASE);
    const q = query(colRef, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden AI logs:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleVerify = async (id, correctedText = null) => {
    setSaving(true);
    try {
      const docRef = doc(db, ...PATHS.AI_KNOWLEDGE_BASE, id);
      await updateDoc(docRef, {
        verified: true,
        correctedAnswer: correctedText || null,
        verifiedAt: serverTimestamp(),
        verifiedBy: "Admin",
      });
      setEditingId(null);
      setCorrection("");
    } catch (e) {
      console.error("Fout bij verifiëren:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deze interactie verwijderen uit de kennisbank?"))
      return;
    try {
      await deleteDoc(doc(db, ...PATHS.AI_KNOWLEDGE_BASE, id));
    } catch (e) {
      console.error("Fout bij verwijderen:", e);
    }
  };

  const negativeLogs = logs.filter(
    (l) => l.feedback === "negative" && !l.verified
  );
  const recentLogs = logs
    .filter((l) => l.feedback !== "negative" || l.verified)
    .slice(0, 15);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Kennisbank synchroniseren...
        </p>
      </div>
    );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto p-6 text-left pb-32">
      {/* HEADER INFO */}
      <div className="bg-slate-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between relative overflow-hidden shadow-xl mb-10 border border-white/5 gap-6">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <BrainCircuit size={150} />
        </div>
        <div className="relative z-10 text-left flex-1">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
            AI <span className="text-blue-500">Learning Center</span>
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 bg-white/5 px-2 py-0.5 rounded uppercase border border-white/10 italic">
              <ShieldCheck size={10} /> Root Protected
            </span>
            <span className="text-[9px] font-mono text-slate-500 italic">
              /{PATHS.AI_KNOWLEDGE_BASE.join("/")}
            </span>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-right shrink-0 relative z-10">
          <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">
            Kennis Records
          </span>
          <span className="text-xl font-black text-blue-400 italic leading-none">
            {logs.length} interacties
          </span>
        </div>
      </div>

      {/* SECTIE 1: TE CORRIGEREN */}
      <div className="space-y-4 text-left">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6 ml-2">
          <AlertTriangle className="text-rose-500" size={18} /> Training Vereist
          <span className="bg-rose-100 text-rose-600 px-3 py-0.5 rounded-full text-[10px] font-black">
            {negativeLogs.length}
          </span>
        </h3>

        {negativeLogs.length === 0 ? (
          <div className="bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[3rem] text-center opacity-80">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-300" />
            <p className="font-black uppercase text-[10px] tracking-[0.2em] text-emerald-600 italic">
              Alle AI antwoorden zijn momenteel gevalideerd
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {negativeLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border-2 border-rose-100 rounded-[3rem] overflow-hidden shadow-sm hover:shadow-xl transition-all animate-in slide-in-from-bottom-2 text-left"
              >
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400">
                      <Clock size={14} className="text-blue-500" />
                      {log.timestamp?.toDate
                        ? log.timestamp.toDate().toLocaleString("nl-NL")
                        : "Zojuist"}
                    </div>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="p-2.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 relative">
                      <div className="absolute -top-3 left-6 bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase italic">
                        Vraag van Gebruiker
                      </div>
                      <p className="text-sm font-black text-slate-800 leading-relaxed italic">
                        "{log.question}"
                      </p>
                    </div>
                    <div className="bg-rose-50/50 p-6 rounded-[2rem] border border-rose-100 relative">
                      <div className="absolute -top-3 left-6 bg-rose-200 text-rose-700 px-3 py-1 rounded-lg text-[8px] font-black uppercase italic">
                        AI Response
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed italic">
                        "{log.answer}"
                      </p>
                    </div>
                  </div>

                  {editingId === log.id ? (
                    <div className="mt-8 space-y-4 animate-in zoom-in-95 text-left">
                      <div className="bg-blue-600 p-1 rounded-[2.2rem] shadow-xl shadow-blue-200">
                        <textarea
                          className="w-full bg-white border-none rounded-[2rem] p-6 text-sm font-bold outline-none min-h-[120px] shadow-inner text-slate-700"
                          value={correction}
                          onChange={(e) => setCorrection(e.target.value)}
                          placeholder="Voer het juiste technische antwoord in..."
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleVerify(log.id, correction)}
                          disabled={saving}
                          className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"
                        >
                          {saving ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Save size={14} />
                          )}{" "}
                          Systeem Trainen
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(log.id);
                        setCorrection(log.answer);
                      }}
                      className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.3em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
                    >
                      <BrainCircuit size={20} className="text-blue-400" />{" "}
                      Corrigeer & Valideer Antwoord
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTIE 2: HISTORIE */}
      <div className="opacity-80 pt-10 text-left">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6 flex items-center gap-2 ml-2 italic leading-none">
          <LucideHistory size={16} className="text-blue-500" /> Interactie
          Historie (Laatste 15)
        </h3>
        <div className="space-y-3">
          {recentLogs.map((log) => (
            <div
              key={log.id}
              className={`p-5 rounded-[2rem] border-2 bg-white flex items-center justify-between transition-all group ${
                log.verified
                  ? "border-emerald-100 shadow-sm"
                  : "border-slate-100 hover:border-blue-200"
              }`}
            >
              <div className="flex-1 min-w-0 pr-6 text-left">
                <div className="flex items-center gap-3 mb-2">
                  {log.verified ? (
                    <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase italic border border-emerald-200">
                      Kennis Gevalideerd
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border border-slate-200">
                      Draft Log
                    </span>
                  )}
                  <span className="text-[9px] font-bold text-slate-300 italic">
                    {log.timestamp?.toDate
                      ? log.timestamp.toDate().toLocaleTimeString()
                      : "Log"}
                  </span>
                </div>
                <p className="text-xs font-black text-slate-700 truncate italic">
                  "{log.question}"
                </p>
              </div>
              <div className="flex gap-2">
                {!log.verified && (
                  <button
                    onClick={() => handleVerify(log.id)}
                    className="p-3 text-slate-300 hover:text-emerald-500 bg-slate-50 rounded-xl transition-all"
                    title="Bevestig correctheid"
                  >
                    <ThumbsUp size={18} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(log.id)}
                  className="p-3 text-slate-200 hover:text-rose-500 bg-slate-50 rounded-xl transition-all"
                >
                  <Trash2 size={18} />
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
