import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Save, RotateCcw, Loader2, FileText, AlertCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import { DEFAULT_CONTEXT } from "./AiChatView";
import { saveAiContextConfig } from "../../services/planningSecurityService";
const AiContextManager = () => {
    const { t } = useTranslation();
    const { showSuccess, showError } = useNotifications();
    const [context, setContext] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        const loadContext = async () => {
            try {
                const docRef = doc(db, ...(PATHS?.AI_CONFIG || ['future-factory', 'settings', 'ai_config', 'main']));
                const snap = await getDoc(docRef);
                if (snap.exists() && snap.data().systemPrompt) {
                    setContext(snap.data().systemPrompt);
                }
                else {
                    setContext(DEFAULT_CONTEXT);
                }
            }
            catch (err) {
                console.error(t('ai.context.load_error'), err);
                showError(t('ai.context.load_error'));
            }
            finally {
                setLoading(false);
            }
        };
        loadContext();
    }, []);
    const handleSave = async () => {
        setSaving(true);
        try {
            await saveAiContextConfig(context);
            await logActivity(auth.currentUser?.uid, "AI_CONTEXT_UPDATE", "AI System Prompt updated");
            showSuccess(t('ai.context.save_success'));
        }
        catch (err) {
            console.error(t('ai.context.save_error'), err);
            showError(t('ai.context.save_error'));
        }
        finally {
            setSaving(false);
        }
    };
    const handleReset = () => {
        if (window.confirm(t('ai.context.reset_confirm'))) {
            setContext(DEFAULT_CONTEXT);
        }
    };
    if (loading)
        return (_jsx("div", { className: "flex items-center justify-center h-64", children: _jsx(Loader2, { className: "animate-spin text-blue-600", size: 32 }) }));
    return (_jsx("div", { className: "p-6 max-w-5xl mx-auto space-y-6", children: _jsxs("div", { className: "bg-white p-6 rounded-2xl border border-slate-200 shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-lg font-black text-slate-800 flex items-center gap-2", children: [_jsx(FileText, { className: "text-blue-600", size: 20 }), "Systeem Context Configuratie"] }), _jsx("p", { className: "text-sm text-slate-500", children: "Beheer hier de basisinstructies en kennis van de AI." })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleReset, className: "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors", title: "Reset naar standaard", children: _jsx(RotateCcw, { size: 20 }) }), _jsxs("button", { onClick: handleSave, disabled: saving, className: "flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50", children: [saving ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Save, { size: 16 }), "Opslaan"] })] })] }), _jsxs("div", { className: "relative", children: [_jsx("textarea", { value: context, onChange: (e) => setContext(e.target.value), className: "w-full h-[600px] p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none", placeholder: "Voer hier de systeem prompt in..." }), _jsxs("div", { className: "absolute bottom-4 right-4 text-xs text-slate-400 font-mono", children: [context.length, " karakters"] })] }), _jsxs("div", { className: "mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3", children: [_jsx(AlertCircle, { className: "text-blue-600 shrink-0 mt-0.5", size: 18 }), _jsxs("div", { className: "text-xs text-blue-800", children: [_jsx("strong", { children: "Tip:" }), " Gebruik Markdown voor structuur. De AI reageert goed op secties zoals ", _jsx("code", { children: "## INSTRUCTIES" }), " en ", _jsx("code", { children: "## KENNIS" }), ". Wijzigingen zijn direct actief voor nieuwe chatsessies."] })] })] }) }));
};
export default AiContextManager;
