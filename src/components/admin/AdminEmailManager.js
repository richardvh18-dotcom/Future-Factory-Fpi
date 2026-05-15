import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { Mail, Plus, Search, Trash2, Edit2, History, FileText, ChevronRight, Send, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";
import { PATHS } from "../../config/dbPaths";
/**
 * AdminEmailManager - Beheer van e-mailtemplates en inzicht in verzonden e-mails.
 */
const AdminEmailManager = () => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [activeTab, setActiveTab] = useState("templates"); // 'templates' | 'logs'
    const [templates, setTemplates] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showEditor, setShowEditor] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    // Firestore sync for templates
    useEffect(() => {
        const q = query(collection(db, ...PATHS.EMAIL_TEMPLATES), orderBy("name", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTemplates(docs);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    // Firestore sync for logs
    useEffect(() => {
        if (activeTab === 'logs') {
            const q = query(collection(db, ...PATHS.EMAIL_LOGS), orderBy("sentAt", "desc"), limit(50));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setLogs(docs);
            });
            return () => unsubscribe();
        }
    }, [activeTab]);
    const handleSaveTemplate = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const templateData = {
            name: formData.get("name"),
            subject: formData.get("subject"),
            body: formData.get("body"),
            updatedAt: serverTimestamp(),
        };
        try {
            if (editingTemplate) {
                await updateDoc(doc(db, ...PATHS.EMAIL_TEMPLATES, editingTemplate.id), templateData);
                notify(t('emails.templateUpdated'), 'success');
            }
            else {
                templateData.createdAt = serverTimestamp();
                await addDoc(collection(db, ...PATHS.EMAIL_TEMPLATES), templateData);
                notify(t('emails.templateCreated'), 'success');
            }
            setShowEditor(false);
            setEditingTemplate(null);
        }
        catch (error) {
            console.error("Error saving template:", error);
            notify(t('common.error'), 'error');
        }
    };
    const handleDeleteTemplate = async (id) => {
        if (window.confirm(t('emails.confirmDelete'))) {
            try {
                await deleteDoc(doc(db, ...PATHS.EMAIL_TEMPLATES, id));
                notify(t('emails.templateDeleted'), 'success');
            }
            catch (error) {
                notify(t('common.error'), 'error');
            }
        }
    };
    const filteredTemplates = templates.filter(temp => temp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        temp.subject.toLowerCase().includes(searchTerm.toLowerCase()));
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden", children: [_jsxs("div", { className: "bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("div", { className: "flex items-center space-x-3", children: [_jsx("div", { className: "p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400", children: _jsx(Mail, { size: 24 }) }), _jsx("h1", { className: "text-xl font-bold text-slate-900 dark:text-white", children: t('emails.dashboardTitle', 'E-mail Beheer') })] }), activeTab === 'templates' && (_jsxs("button", { onClick: () => { setEditingTemplate(null); setShowEditor(true); }, className: "flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm", children: [_jsx(Plus, { size: 18 }), _jsx("span", { children: t('emails.newTemplate', 'Nieuw Template') })] }))] }), _jsxs("div", { className: "flex space-x-6", children: [_jsx("button", { onClick: () => setActiveTab("templates"), className: `pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${activeTab === "templates"
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`, children: _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(FileText, { size: 16 }), _jsx("span", { children: t('emails.templates', 'Templates') })] }) }), _jsx("button", { onClick: () => setActiveTab("logs"), className: `pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${activeTab === "logs"
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`, children: _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(History, { size: 16 }), _jsx("span", { children: t('emails.logbook', 'Logboek') })] }) })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: activeTab === 'templates' ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "relative max-w-md", children: [_jsx(Search, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400", size: 18 }), _jsx("input", { type: "text", placeholder: t('emails.searchTemplates', 'Zoek templates...'), className: "w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: [filteredTemplates.map(template => (_jsxs("div", { className: "bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group", children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsx("h3", { className: "font-bold text-slate-900 dark:text-white truncate pr-2", children: template.name }), _jsxs("div", { className: "flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity", children: [_jsx("button", { onClick: () => { setEditingTemplate(template); setShowEditor(true); }, className: "p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded", children: _jsx(Edit2, { size: 16 }) }), _jsx("button", { onClick: () => handleDeleteTemplate(template.id), className: "p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded", children: _jsx(Trash2, { size: 16 }) })] })] }), _jsxs("div", { className: "text-sm text-slate-500 dark:text-slate-400 mb-4 h-10 overflow-hidden line-clamp-2", children: [_jsx("span", { className: "font-semibold text-slate-700 dark:text-slate-300", children: "Subject:" }), " ", template.subject] }), _jsxs("div", { className: "flex items-center justify-between text-xs text-slate-400", children: [_jsx("span", { children: template.updatedAt?.toDate().toLocaleDateString() || 'Nieuw' }), _jsxs("div", { className: "flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-medium", children: [_jsx("span", { children: t('emails.viewDetail', 'Details') }), _jsx(ChevronRight, { size: 14 })] })] })] }, template.id))), filteredTemplates.length === 0 && !loading && (_jsxs("div", { className: "col-span-full py-12 text-center text-slate-500", children: [_jsx(Mail, { className: "mx-auto mb-3 opacity-20", size: 48 }), _jsx("p", { children: t('emails.noTemplatesFound', 'Geen e-mailtemplates gevonden.') })] }))] })] })) : (
                /* Logs Tab Content */
                _jsx("div", { className: "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm", children: _jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700", children: [_jsx("th", { className: "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500", children: t('emails.status', 'Status') }), _jsx("th", { className: "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500", children: t('emails.to', 'Ontvanger') }), _jsx("th", { className: "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500", children: t('emails.subject', 'Onderwerp') }), _jsx("th", { className: "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500", children: t('emails.sentAt', 'Tijdstip') }), _jsx("th", { className: "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500" })] }) }), _jsxs("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-700", children: [logs.map(log => (_jsxs("tr", { className: "hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: log.status === 'success' ? (_jsxs("div", { className: "flex items-center text-green-600 space-x-1", children: [_jsx(CheckCircle2, { size: 16 }), _jsx("span", { className: "text-sm font-medium", children: "OK" })] })) : (_jsxs("div", { className: "flex items-center text-red-600 space-x-1", children: [_jsx(AlertCircle, { size: 16 }), _jsx("span", { className: "text-sm font-medium", children: "Error" })] })) }), _jsx("td", { className: "px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-[200px] truncate", children: log.to }), _jsx("td", { className: "px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-md truncate", children: log.subject }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap text-sm text-slate-500", children: log.sentAt?.toDate().toLocaleString() || '...' }), _jsx("td", { className: "px-4 py-3 text-right", children: _jsx("button", { className: "text-slate-400 hover:text-blue-600 p-1", children: _jsx(ExternalLink, { size: 16 }) }) })] }, log.id))), logs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: "5", className: "px-4 py-12 text-center text-slate-500 italic", children: t('emails.noLogsFound', 'Geen recente logboek-items gevonden.') }) }))] })] }) })) }), showEditor && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm", children: _jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700", children: [_jsx("h2", { className: "text-xl font-bold dark:text-white", children: editingTemplate ? t('emails.editTemplate', 'Template Aanpassen') : t('emails.createTemplate', 'Nieuw Template') }), _jsx("button", { onClick: () => setShowEditor(false), className: "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200", children: _jsx(Trash2, { size: 20 }) })] }), _jsxs("form", { onSubmit: handleSaveTemplate, className: "p-6 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1", children: t('emails.templateName', 'Template Naam') }), _jsx("input", { required: true, name: "name", defaultValue: editingTemplate?.name, placeholder: "bijv. Order Vertraagd", className: "w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1", children: t('emails.subject', 'E-mail Onderwerp') }), _jsx("input", { required: true, name: "subject", defaultValue: editingTemplate?.subject, placeholder: "Update over uw order {{orderNumber}}", className: "w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1", children: [t('emails.templateBody', 'E-mail Inhoud (HTML)'), _jsxs("small", { className: "block font-normal text-slate-500", children: ["Gebruik ", "{{variable}}", " voor dynamische velden."] })] }), _jsx("textarea", { required: true, name: "body", rows: 8, defaultValue: editingTemplate?.body, className: "w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500" })] }), _jsxs("div", { className: "flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-700", children: [_jsx("button", { type: "button", onClick: () => setShowEditor(false), className: "px-6 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg", children: t('common.cancel') }), _jsxs("button", { type: "submit", className: "px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center space-x-2", children: [_jsx(Send, { size: 18 }), _jsx("span", { children: t('emails.saveTemplate', 'Template Opslaan') })] })] })] })] }) }))] }));
};
export default AdminEmailManager;
