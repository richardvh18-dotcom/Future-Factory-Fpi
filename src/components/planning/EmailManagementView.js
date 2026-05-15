import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { Mail, Plus, Edit, Trash2, CheckCircle, XCircle, LayoutTemplate, History } from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
const EmailManagementView = () => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [activeTab, setActiveTab] = useState("templates"); // "templates" or "logs"
    const [templates, setTemplates] = useState([]);
    const [logs, setLogs] = useState([]);
    // Editor state
    const [showEditor, setShowEditor] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({
        name: "",
        subject: "",
        html: "",
    });
    useEffect(() => {
        // Load Templates
        const unsubTemplates = onSnapshot(collection(db, ...PATHS.EMAIL_TEMPLATES), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTemplates(data);
        });
        // Load Logs (limit to 100)
        const logsQuery = query(collection(db, ...PATHS.EMAIL_LOGS), orderBy("createdAt", "desc"), limit(100));
        const unsubLogs = onSnapshot(logsQuery, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLogs(data);
        });
        return () => {
            unsubTemplates();
            unsubLogs();
        };
    }, []);
    const handleSave = async () => {
        if (!formData.name || !formData.subject || !formData.html) {
            notify(t("email.management.requiredFields", "Naam, onderwerp en e-mailtekst zijn verplicht."), "warning");
            return;
        }
        try {
            if (editingTemplate) {
                await updateDoc(doc(db, ...PATHS.EMAIL_TEMPLATES, editingTemplate.id), {
                    ...formData,
                    updatedAt: serverTimestamp(),
                });
                await logActivity(auth.currentUser?.uid, "EMAIL_TEMPLATE_UPDATE", `E-mail template bijgewerkt: ${formData.name}`);
                notify(t("email.management.updated", "Template succesvol bijgewerkt!"), "success");
            }
            else {
                await addDoc(collection(db, ...PATHS.EMAIL_TEMPLATES), {
                    ...formData,
                    createdAt: serverTimestamp(),
                });
                await logActivity(auth.currentUser?.uid, "EMAIL_TEMPLATE_CREATE", `E-mail template aangemaakt: ${formData.name}`);
                notify(t("email.management.created", "Template succesvol aangemaakt!"), "success");
            }
            setShowEditor(false);
            setEditingTemplate(null);
            setFormData({ name: "", subject: "", html: "" });
        }
        catch (err) {
            console.error(err);
            notify(t("email.management.error", "Er is een fout opgetreden."), "error");
        }
    };
    const handleDelete = async (id, name) => {
        const confirm = await showConfirm({
            title: t("email.management.deleteTitle", "Template verwijderen"),
            message: t("email.management.deleteMessage", `Weet je zeker dat je het template "${name}" wilt verwijderen? Dit kan automations breken!`),
            confirmText: t("common.delete", "Verwijderen"),
            cancelText: t("common.cancel", "Annuleren"),
            tone: "danger"
        });
        if (confirm) {
            await deleteDoc(doc(db, ...PATHS.EMAIL_TEMPLATES, id));
            await logActivity(auth.currentUser?.uid, "EMAIL_TEMPLATE_DELETE", `E-mail template verwijderd: ${name}`);
            notify(t("email.management.deleted", "Template succesvol verwijderd!"), "success");
        }
    };
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800 flex items-center gap-3", children: [_jsx(Mail, { className: "text-blue-600", size: 32 }), t("email.management.title", "E-mail"), " ", _jsx("span", { className: "text-blue-600", children: t("email.management.subtitle", "Beheer") })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: t("email.management.description", "Beheer e-mail templates voor automations en bekijk verzonden e-mails.") })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => setActiveTab("templates"), className: `flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "templates" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(LayoutTemplate, { size: 18 }), t("email.management.tabTemplates", "Templates")] }), _jsxs("button", { onClick: () => setActiveTab("logs"), className: `flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "logs" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`, children: [_jsx(History, { size: 18 }), t("email.management.tabLogs", "Verzonden (Logs)")] })] })] }) }), activeTab === "templates" && (_jsx("div", { className: "space-y-6", children: !showEditor ? (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h2", { className: "text-lg font-bold text-slate-800", children: t("email.management.templatesTitle", "Jouw Templates") }), _jsxs("button", { onClick: () => {
                                        setEditingTemplate(null);
                                        setFormData({ name: "", subject: "", html: "" });
                                        setShowEditor(true);
                                    }, className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors", children: [_jsx(Plus, { size: 16 }), t("email.management.newTemplate", "Nieuw Template")] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: [templates.map(tpl => (_jsxs("div", { className: "p-4 border-2 border-slate-200 rounded-xl hover:border-blue-300 transition-colors", children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("h3", { className: "font-bold text-slate-800", children: tpl.name }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => { setEditingTemplate(tpl); setFormData(tpl); setShowEditor(true); }, className: "text-slate-400 hover:text-blue-600", children: _jsx(Edit, { size: 16 }) }), _jsx("button", { onClick: () => handleDelete(tpl.id, tpl.name), className: "text-slate-400 hover:text-red-600", children: _jsx(Trash2, { size: 16 }) })] })] }), _jsxs("p", { className: "text-xs text-slate-500 mb-1", children: [_jsx("strong", { children: "Onderwerp:" }), " ", tpl.subject] }), _jsxs("div", { className: "text-xs text-slate-400 truncate mt-2 bg-slate-50 p-2 rounded", children: [tpl.html.replace(/<[^>]*>?/gm, '').substring(0, 50), "..."] })] }, tpl.id))), templates.length === 0 && (_jsx("div", { className: "col-span-full text-center py-10 text-slate-500", children: t("email.management.noTemplates", "Geen templates gevonden. Maak er een aan!") }))] })] })) : (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-6", children: [_jsx("h2", { className: "text-lg font-bold text-slate-800 mb-4", children: editingTemplate ? t("email.management.editTemplate", "Template Bewerken") : t("email.management.createTemplate", "Nieuw Template Maken") }), _jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-700 uppercase mb-1", children: t("email.management.templateName", "Template Naam") }), _jsx("input", { type: "text", value: formData.name, onChange: e => setFormData({ ...formData, name: e.target.value }), placeholder: "Bijv. Machine Storing Alert", className: "w-full p-2 border-2 border-slate-200 rounded-lg" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-700 uppercase mb-1", children: t("email.management.subject", "E-mail Onderwerp") }), _jsx("input", { type: "text", value: formData.subject, onChange: e => setFormData({ ...formData, subject: e.target.value }), placeholder: "Bijv. Let op: {{machine}} heeft een storing!", className: "w-full p-2 border-2 border-slate-200 rounded-lg" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-bold text-slate-700 uppercase mb-1", children: t("email.management.html", "E-mail Tekst (HTML toegestaan)") }), _jsx("textarea", { value: formData.html, onChange: e => setFormData({ ...formData, html: e.target.value }), placeholder: "Typ hier de tekst. Je kunt HTML tags zoals <b>, <i>, <br> gebruiken.", rows: 8, className: "w-full p-2 border-2 border-slate-200 rounded-lg font-mono text-sm" })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx("button", { onClick: handleSave, className: "px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700", children: t("common.save", "Opslaan") }), _jsx("button", { onClick: () => setShowEditor(false), className: "px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300", children: t("common.cancel", "Annuleren") })] })] }), _jsxs("div", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200 h-fit", children: [_jsxs("h3", { className: "font-bold text-slate-700 mb-2", children: ["\uD83D\uDCA1 ", t("email.management.tipsTitle", "Variabelen & Tips")] }), _jsx("p", { className: "text-xs text-slate-600 mb-4", children: t("email.management.tipsText", "Je kunt in het onderwerp of de tekst variabelen gebruiken. Deze worden automatisch ingevuld door de Automation Engine.") }), _jsxs("ul", { className: "text-xs text-slate-600 space-y-2 font-mono", children: [_jsxs("li", { children: [_jsx("span", { className: "font-bold text-blue-600", children: "{{trigger_message}}" }), " = Het standaard waarschuwingsbericht"] }), _jsxs("li", { children: [_jsx("span", { className: "font-bold text-blue-600", children: "{{machine}}" }), " = De desbetreffende machine"] }), _jsxs("li", { children: [_jsx("span", { className: "font-bold text-blue-600", children: "{{order}}" }), " = Order ID (indien van toepassing)"] }), _jsxs("li", { children: [_jsx("span", { className: "font-bold text-blue-600", children: "{{time}}" }), " = Huidige tijd/datum"] })] }), _jsxs("div", { className: "mt-4 p-3 bg-blue-50 text-blue-800 rounded border border-blue-100 text-xs", children: ["Voorbeeld tekst:", _jsx("br", {}), _jsxs("i", { children: ["Beste manager,<br><br>Er is een automatische alert getriggerd:<br> <b>", "{{trigger_message}}", "</b><br><br>Groet, Systeem."] })] })] })] })] })) })), activeTab === "logs" && (_jsx("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-slate-600 border-b-2 border-slate-200", children: _jsxs("tr", { children: [_jsx("th", { className: "p-4 font-bold", children: "Status" }), _jsx("th", { className: "p-4 font-bold", children: "Datum & Tijd" }), _jsx("th", { className: "p-4 font-bold", children: "Ontvanger" }), _jsx("th", { className: "p-4 font-bold", children: "Onderwerp" }), _jsx("th", { className: "p-4 font-bold", children: "Template Gebruikt" })] }) }), _jsxs("tbody", { children: [logs.map((log) => (_jsxs("tr", { className: "border-b border-slate-100 hover:bg-slate-50", children: [_jsx("td", { className: "p-4", children: log.status === "success" ? _jsx(CheckCircle, { className: "text-emerald-500", size: 18 }) : _jsx(XCircle, { className: "text-red-500", size: 18 }) }), _jsx("td", { className: "p-4 text-slate-600", children: log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString('nl-NL') : "Onbekend" }), _jsx("td", { className: "p-4 font-medium text-slate-800", children: Array.isArray(log.to) ? log.to.join(', ') : log.to }), _jsx("td", { className: "p-4 text-slate-600", children: log.subject }), _jsx("td", { className: "p-4 text-slate-500 text-xs", children: log.templateName || "Geen template" })] }, log.id))), logs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: "5", className: "p-8 text-center text-slate-500", children: "Nog geen e-mails verstuurd." }) }))] })] }) }))] }));
};
export default EmailManagementView;
