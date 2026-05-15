import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BrainCircuit, ThumbsUp, Trash2, CheckCircle2, Clock, RefreshCw, History as LucideHistory, ShieldCheck, Save, X, Loader2, } from "lucide-react";
import { collection, query, onSnapshot, orderBy, } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from '../../contexts/NotificationContext';
import { verifyAiKnowledgeEntry, deleteAiKnowledgeEntry, migrateAiKnowledgeFields, } from "../../services/planningSecurityService";
/**
 * AiTrainingView V6.1 - Root Path Edition
 * Module voor kwaliteitsborging van AI antwoorden in de root: /future-factory/settings/ai_knowledge_base/
 */
const AiTrainingView = () => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [correction, setCorrection] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        // Gebruik het nieuwe root pad uit dbPaths.js
        const colRef = collection(db, ...(PATHS?.AI_KNOWLEDGE_BASE || ['future-factory', 'settings', 'ai_knowledge_base']));
        const q = query(colRef, orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (snap) => {
            setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error(t('ai.training.load_error'), err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    const handleVerify = async (id, correctedText = null) => {
        setSaving(true);
        try {
            await verifyAiKnowledgeEntry({
                entryId: id,
                correctedAnswer: correctedText || null,
            });
            setEditingId(null);
            await logActivity(auth.currentUser?.uid, 'AI_VERIFY', `Training verified for ID: ${id}. Correction: ${correctedText ? 'Yes' : 'No'}`);
            setCorrection("");
        }
        catch (e) {
            console.error(t('ai.training.verify_error'), e);
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        if (!window.confirm(t('ai.training.delete_confirm')))
            return;
        try {
            await deleteAiKnowledgeEntry(id);
        }
        catch (e) {
            console.error(t('ai.training.delete_error'), e);
        }
    };
    const handleMigration = async () => {
        if (!window.confirm(t('ai.training.migrate_confirm')))
            return;
        try {
            const result = await migrateAiKnowledgeFields();
            notify(t('ai.training.migrate_done', { count: result?.updated || 0 }));
        }
        catch (e) {
            console.error(e);
            notify(t('ai.training.migrate_error', { message: e.message }));
        }
    };
    const negativeLogs = logs.filter((l) => (l.feedback === "negative" || l.type === "rejected") && !l.verified);
    const recentLogs = logs
        .filter((l) => l.feedback !== "negative" || l.verified)
        .slice(0, 15);
    if (loading)
        return (_jsxs("div", { className: "flex flex-col items-center justify-center p-20 gap-4 h-full", children: [_jsx(Loader2, { className: "animate-spin text-blue-500", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: "Kennisbank synchroniseren..." })] }));
    return (_jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto p-6 text-left pb-32", children: [_jsxs("div", { className: "bg-slate-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between relative overflow-hidden shadow-xl mb-10 border border-white/5 gap-6", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(BrainCircuit, { size: 150 }) }), _jsxs("div", { className: "relative z-10 text-left flex-1", children: [_jsxs("h2", { className: "text-2xl font-black uppercase italic tracking-tighter leading-none", children: ["AI ", _jsx("span", { className: "text-blue-500", children: "Learning Center" })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-400 bg-white/5 px-2 py-0.5 rounded uppercase border border-white/10 italic", children: [_jsx(ShieldCheck, { size: 10 }), " Root Protected"] }), _jsxs("span", { className: "text-[9px] font-mono text-slate-500 italic", children: ["/", (PATHS?.AI_KNOWLEDGE_BASE || ['future-factory', 'settings', 'ai_knowledge_base']).join("/")] })] })] }), _jsxs("div", { className: "bg-white/5 border border-white/10 p-4 rounded-2xl text-right shrink-0 relative z-10 group", children: [_jsx("span", { className: "text-[8px] font-black text-slate-500 uppercase block mb-1", children: "Kennis Records" }), _jsxs("span", { className: "text-xl font-black text-blue-400 italic leading-none", children: [logs.length, " interacties"] }), _jsx("button", { onClick: handleMigration, className: "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-blue-400", title: "Normaliseer database velden (Fix lege vragen)", children: _jsx(RefreshCw, { size: 12 }) })] })] }), _jsxs("div", { className: "space-y-4 text-left", children: [_jsxs("h3", { className: "text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6 ml-2", children: [_jsx(AlertTriangle, { className: "text-rose-500", size: 18 }), " Training Vereist", _jsx("span", { className: "bg-rose-100 text-rose-600 px-3 py-0.5 rounded-full text-[10px] font-black", children: negativeLogs.length })] }), negativeLogs.length === 0 ? (_jsxs("div", { className: "bg-emerald-50 border-2 border-emerald-100 p-10 rounded-[3rem] text-center opacity-80", children: [_jsx(CheckCircle2, { size: 48, className: "mx-auto mb-4 text-emerald-300" }), _jsx("p", { className: "font-black uppercase text-[10px] tracking-[0.2em] text-emerald-600 italic", children: "Alle AI antwoorden zijn momenteel gevalideerd" })] })) : (_jsx("div", { className: "grid grid-cols-1 gap-6", children: negativeLogs.map((log) => (_jsx("div", { className: "bg-white border-2 border-rose-100 rounded-[3rem] overflow-hidden shadow-sm hover:shadow-xl transition-all animate-in slide-in-from-bottom-2 text-left", children: _jsxs("div", { className: "p-8 space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center pb-4 border-b border-slate-50", children: [_jsxs("div", { className: "flex items-center gap-3 text-[10px] font-black uppercase text-slate-400", children: [_jsx(Clock, { size: 14, className: "text-blue-500" }), log.timestamp?.toDate
                                                        ? log.timestamp.toDate().toLocaleString("nl-NL")
                                                        : "Zojuist"] }), _jsx("button", { onClick: () => handleDelete(log.id), className: "p-2.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", children: _jsx(Trash2, { size: 18 }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 text-left", children: [_jsxs("div", { className: "bg-slate-50 p-6 rounded-[2rem] border border-slate-100 relative", children: [_jsx("div", { className: "absolute -top-3 left-6 bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase italic", children: "Vraag van Gebruiker" }), _jsxs("p", { className: "text-sm font-black text-slate-800 leading-relaxed italic", children: ["\"", log.question || log.userInput, "\""] })] }), _jsxs("div", { className: "bg-rose-50/50 p-6 rounded-[2rem] border border-rose-100 relative", children: [_jsx("div", { className: "absolute -top-3 left-6 bg-rose-200 text-rose-700 px-3 py-1 rounded-lg text-[8px] font-black uppercase italic", children: "AI Response" }), _jsxs("p", { className: "text-sm text-slate-600 leading-relaxed italic", children: ["\"", log.answer, "\""] })] })] }), editingId === log.id ? (_jsxs("div", { className: "mt-8 space-y-4 animate-in zoom-in-95 text-left", children: [_jsx("div", { className: "bg-blue-600 p-1 rounded-[2.2rem] shadow-xl shadow-blue-200", children: _jsx("textarea", { className: "w-full bg-white border-none rounded-[2rem] p-6 text-sm font-bold outline-none min-h-[120px] shadow-inner text-slate-700", value: correction, onChange: (e) => setCorrection(e.target.value), placeholder: "Voer het juiste technische antwoord in...", autoFocus: true }) }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("button", { onClick: () => handleVerify(log.id, correction), disabled: saving, className: "flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2", children: [saving ? (_jsx(Loader2, { className: "animate-spin", size: 14 })) : (_jsx(Save, { size: 14 })), " ", "Systeem Trainen"] }), _jsx("button", { onClick: () => setEditingId(null), className: "px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200", children: _jsx(X, { size: 14 }) })] })] })) : (_jsxs("button", { onClick: () => {
                                            setEditingId(log.id);
                                            setCorrection(log.answer);
                                        }, className: "w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.3em] hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3", children: [_jsx(BrainCircuit, { size: 20, className: "text-blue-400" }), " ", "Corrigeer & Valideer Antwoord"] }))] }) }, log.id))) }))] }), _jsxs("div", { className: "opacity-80 pt-10 text-left", children: [_jsxs("h3", { className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6 flex items-center gap-2 ml-2 italic leading-none", children: [_jsx(LucideHistory, { size: 16, className: "text-blue-500" }), " Interactie Historie (Laatste 15)"] }), _jsx("div", { className: "space-y-3", children: recentLogs.map((log) => (_jsxs("div", { className: `p-5 rounded-[2rem] border-2 bg-white flex items-center justify-between transition-all group ${log.verified
                                ? "border-emerald-100 shadow-sm"
                                : "border-slate-100 hover:border-blue-200"}`, children: [_jsxs("div", { className: "flex-1 min-w-0 pr-6 text-left", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [log.verified ? (_jsx("span", { className: "bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase italic border border-emerald-200", children: "Kennis Gevalideerd" })) : (_jsx("span", { className: "bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border border-slate-200", children: "Draft Log" })), _jsx("span", { className: "text-[9px] font-bold text-slate-300 italic", children: log.timestamp?.toDate
                                                        ? log.timestamp.toDate().toLocaleTimeString()
                                                        : "Log" })] }), _jsxs("p", { className: "text-xs font-black text-slate-700 truncate italic", children: ["\"", log.question || log.userInput, "\""] })] }), _jsxs("div", { className: "flex gap-2", children: [!log.verified && (_jsx("button", { onClick: () => handleVerify(log.id), className: "p-3 text-slate-300 hover:text-emerald-500 bg-slate-50 rounded-xl transition-all", title: "Bevestig correctheid", children: _jsx(ThumbsUp, { size: 18 }) })), _jsx("button", { onClick: () => handleDelete(log.id), className: "p-3 text-slate-200 hover:text-rose-500 bg-slate-50 rounded-xl transition-all", children: _jsx(Trash2, { size: 18 }) })] })] }, log.id))) })] })] }));
};
export default AiTrainingView;
