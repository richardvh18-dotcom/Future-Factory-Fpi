import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { AlertTriangle, BrainCircuit, ThumbsDown, ThumbsUp, Trash2, CheckCircle2, Clock, MessageSquareQuote, RefreshCw, History as LucideHistory, // Voorkomt conflict met window.history
 } from "lucide-react";
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, } from "firebase/firestore";
import { db, appId, auth, logActivity } from "../../../config/firebase";
/**
 * AiTrainingView: Module voor kwaliteitsborging van AI antwoorden.
 * Slaat interacties op en staat correcties toe door Teamleaders/QC.
 */
const AiTrainingView = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [correction, setCorrection] = useState("");
    useEffect(() => {
        const q = query(collection(db, "artifacts", appId, "public", "data", "ai_knowledge_base"));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const sorted = data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setLogs(sorted);
            setLoading(false);
        }, (err) => {
            console.error("Fout bij laden AI logs:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    const handleVerify = async (id, correctedText = null) => {
        try {
            const docRef = doc(db, "artifacts", appId, "public", "data", "ai_knowledge_base", id);
            await updateDoc(docRef, {
                verified: true,
                correctedAnswer: correctedText || null,
                verifiedAt: serverTimestamp(),
            });
            await logActivity(auth.currentUser?.uid, "AI_TRAINING_VERIFY", `AI kennisitem geverifieerd: ${id}${correctedText ? " (met correctie)" : ""}`);
            setEditingId(null);
            setCorrection("");
        }
        catch (e) {
            console.error("Fout bij verifiëren:", e);
        }
    };
    const handleDelete = async (id) => {
        if (!window.confirm("Deze interactie verwijderen uit de kennisbank?"))
            return;
        try {
            await deleteDoc(doc(db, "artifacts", appId, "public", "data", "ai_knowledge_base", id));
            await logActivity(auth.currentUser?.uid, "AI_TRAINING_DELETE", `AI kennisitem verwijderd: ${id}`);
        }
        catch (e) {
            console.error("Fout bij verwijderen:", e);
        }
    };
    const negativeLogs = logs.filter((l) => l.feedback === "negative" && !l.verified);
    const recentLogs = logs
        .filter((l) => l.feedback !== "negative" || l.verified)
        .slice(0, 15);
    if (loading) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center p-20 text-slate-400", children: [_jsx(RefreshCw, { className: "animate-spin mb-4", size: 32 }), _jsx("p", { className: "text-xs font-black uppercase tracking-widest text-slate-400", children: "Kennisbank laden..." })] }));
    }
    return (_jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-4", children: [_jsx(AlertTriangle, { className: "text-red-500", size: 20 }), " Correcties Vereist", _jsx("span", { className: "bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-black", children: negativeLogs.length })] }), negativeLogs.length === 0 ? (_jsxs("div", { className: "bg-emerald-50 border border-emerald-100 p-8 rounded-[2rem] text-center text-emerald-600 italic", children: [_jsx(CheckCircle2, { size: 40, className: "mx-auto mb-2 opacity-50" }), _jsx("p", { className: "font-bold uppercase text-xs tracking-widest", children: "Geen openstaande correcties." })] })) : (_jsx("div", { className: "grid grid-cols-1 gap-4", children: negativeLogs.map((log) => (_jsx("div", { className: "bg-white border-2 border-red-100 rounded-[2rem] overflow-hidden shadow-sm hover:border-red-200 transition-colors", children: _jsxs("div", { className: "p-6", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsxs("div", { className: "flex items-center gap-2 text-[10px] font-black uppercase text-slate-400", children: [_jsx(Clock, { size: 12 }), " ", log.timestamp?.toDate().toLocaleString() || "Zojuist"] }), _jsx("button", { onClick: () => handleDelete(log.id), className: "p-2 text-slate-300 hover:text-red-500 transition-all rounded-lg", children: _jsx(Trash2, { size: 16 }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-slate-50 p-4 rounded-2xl border border-slate-100", children: [_jsxs("p", { className: "text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1", children: [_jsx(MessageSquareQuote, { size: 12 }), " Vraag:"] }), _jsxs("p", { className: "text-sm font-bold text-slate-700 italic", children: ["\"", log.question, "\""] })] }), _jsxs("div", { className: "bg-red-50/30 p-4 rounded-2xl border border-red-50", children: [_jsxs("p", { className: "text-[10px] font-black text-red-400 uppercase mb-1 flex items-center gap-1", children: [_jsx(ThumbsDown, { size: 12 }), " AI Antwoord:"] }), _jsx("p", { className: "text-sm text-slate-600", children: log.answer })] })] }), editingId === log.id ? (_jsxs("div", { className: "mt-6 space-y-3 animate-in slide-in-from-top-2", children: [_jsx("textarea", { className: "w-full bg-blue-50/50 border-2 border-blue-200 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:border-blue-500 transition-all min-h-[100px]", value: correction, onChange: (e) => setCorrection(e.target.value), placeholder: "Voer het juiste technische antwoord in..." }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => handleVerify(log.id, correction), className: "flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase hover:bg-blue-700 shadow-lg shadow-blue-100", children: "Verifieer Antwoord" }), _jsx("button", { onClick: () => setEditingId(null), className: "px-6 bg-slate-100 text-slate-400 py-3 rounded-xl font-black text-xs uppercase hover:bg-slate-200", children: "Annuleer" })] })] })) : (_jsxs("button", { onClick: () => {
                                            setEditingId(log.id);
                                            setCorrection(log.answer);
                                        }, className: "mt-6 w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md", children: [_jsx(BrainCircuit, { size: 18, className: "inline mr-2" }), " ", "Corrigeer & Leer Systeem"] }))] }) }, log.id))) }))] }), _jsxs("div", { className: "opacity-80", children: [_jsxs("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2", children: [_jsx(LucideHistory, { size: 16 }), " Interactie Historie"] }), _jsx("div", { className: "space-y-2", children: recentLogs.map((log) => (_jsxs("div", { className: `p-4 rounded-2xl border bg-white flex items-center justify-between transition-all ${log.verified
                                ? "border-emerald-100 shadow-sm"
                                : "border-slate-100 hover:border-blue-200"}`, children: [_jsxs("div", { className: "flex-1 min-w-0 pr-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [log.verified ? (_jsx("span", { className: "bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded text-[8px] font-black uppercase italic", children: "Geverifieerd" })) : (_jsx("span", { className: "bg-slate-100 text-slate-400 px-2 py-0.5 rounded text-[8px] font-black uppercase", children: "Onverwerkt" })), _jsx("span", { className: "text-[9px] font-bold text-slate-300 italic", children: log.timestamp?.toDate().toLocaleTimeString() || "Log" })] }), _jsx("p", { className: "text-xs font-black text-slate-700 truncate", children: log.question })] }), _jsxs("div", { className: "flex gap-1", children: [!log.verified && (_jsx("button", { onClick: () => handleVerify(log.id), className: "p-2 text-slate-300 hover:text-emerald-500 transition-colors", title: "Markeer als correct", children: _jsx(ThumbsUp, { size: 16 }) })), _jsx("button", { onClick: () => handleDelete(log.id), className: "p-2 text-slate-200 hover:text-red-400 transition-colors", children: _jsx(Trash2, { size: 16 }) })] })] }, log.id))) })] })] }));
};
export default AiTrainingView;
