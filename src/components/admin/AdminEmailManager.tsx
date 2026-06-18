/* eslint-disable */
import React, { useState, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { 
  Mail, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  History, 
  FileText, 
  ChevronRight, 
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink
} from "lucide-react";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";

import { PATHS, getPathString } from "../../config/dbPaths";

type TimestampLike = { toDate?: () => Date };

type EmailTemplate = {
  id: string;
  name?: string;
  subject?: string;
  body?: string;
  updatedAt?: TimestampLike;
  [key: string]: unknown;
};

type EmailLog = {
  id: string;
  status?: string;
  to?: string;
  subject?: string;
  sentAt?: TimestampLike;
  [key: string]: unknown;
};

/**
 * AdminEmailManager - Beheer van e-mailtemplates en inzicht in verzonden e-mails.
 */
const AdminEmailManager = () => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState("templates"); // 'templates' | 'logs'
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  // Firestore sync for templates
  useEffect(() => {
    const q = query(collection(db, getPathString(PATHS.EMAIL_TEMPLATES)), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: EmailTemplate[] = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(snapshotDoc.data() as Omit<EmailTemplate, "id">),
      }));
      setTemplates(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore sync for logs
  useEffect(() => {
    if (activeTab === 'logs') {
      const q = query(
        collection(db, getPathString(PATHS.EMAIL_LOGS)),
        orderBy("sentAt", "desc"), 
        limit(50)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs: EmailLog[] = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...(snapshotDoc.data() as Omit<EmailLog, "id">),
        }));
        setLogs(docs);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleSaveTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const templateData: Record<string, unknown> = {
      name: String(formData.get("name") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      body: String(formData.get("body") || "").trim(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingTemplate) {
        await updateDoc(doc(db, getPathString(PATHS.EMAIL_TEMPLATES), editingTemplate.id), templateData);
        notify({ type: "success", message: t('emails.templateUpdated') });
      } else {
        templateData.createdAt = serverTimestamp();
        await addDoc(collection(db, getPathString(PATHS.EMAIL_TEMPLATES)), templateData);
        notify({ type: "success", message: t('emails.templateCreated') });
      }
      setShowEditor(false);
      setEditingTemplate(null);
    } catch (error) {
      console.error("Error saving template:", error);
      notify({ type: "error", message: t('common.error') });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (window.confirm(t('emails.confirmDelete'))) {
      try {
        await deleteDoc(doc(db, getPathString(PATHS.EMAIL_TEMPLATES), id));
        notify({ type: "success", message: t('emails.templateDeleted') });
      } catch (error) {
        notify({ type: "error", message: t('common.error') });
      }
    }
  };

  const filteredTemplates = templates.filter((temp) => 
    String(temp.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    String(temp.subject || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Mail size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t('emails.dashboardTitle', 'E-mail Beheer')}
            </h1>
          </div>
          {activeTab === 'templates' && (
            <button 
              onClick={() => { setEditingTemplate(null); setShowEditor(true); }}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span>{t('emails.newTemplate', 'Nieuw Template')}</span>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex space-x-6">
          <button 
            onClick={() => setActiveTab("templates")}
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "templates" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center space-x-2">
              <FileText size={16} />
              <span>{t('emails.templates', 'Templates')}</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("logs")}
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "logs" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center space-x-2">
              <History size={16} />
              <span>{t('emails.logbook', 'Logboek')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'templates' ? (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder={t('emails.searchTemplates', 'Zoek templates...')}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Template List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <div key={template.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate pr-2">{String(template.name || "")}</h3>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingTemplate(template); setShowEditor(true); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-10 overflow-hidden line-clamp-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{t('emails.subject', 'Subject')}:</span> {String(template.subject || "")}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{template.updatedAt?.toDate?.().toLocaleDateString() || 'Nieuw'}</span>
                    <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-medium">
                      <span>{t('emails.viewDetail', 'Details')}</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              ))}
              {filteredTemplates.length === 0 && !loading && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  <Mail className="mx-auto mb-3 opacity-20" size={48} />
                  <p>{t('emails.noTemplatesFound', 'Geen e-mailtemplates gevonden.')}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Logs Tab Content */
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('emails.status', 'Status')}</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('emails.to', 'Ontvanger')}</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('emails.subject', 'Onderwerp')}</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('emails.sentAt', 'Tijdstip')}</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {String(log.status || "") === 'success' ? (
                        <div className="flex items-center text-green-600 space-x-1">
                          <CheckCircle2 size={16} />
                          <span className="text-sm font-medium">{t('common.ok', 'OK')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600 space-x-1">
                          <AlertCircle size={16} />
                          <span className="text-sm font-medium">{t('common.error', 'Error')}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{String(log.to || "")}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-md truncate">{String(log.subject || "")}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                      {log.sentAt?.toDate?.().toLocaleString() || '...'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-slate-400 hover:text-blue-600 p-1">
                        <ExternalLink size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500 italic">
                      {t('emails.noLogsFound', 'Geen recente logboek-items gevonden.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold dark:text-white">
                {editingTemplate ? t('emails.editTemplate', 'Template Aanpassen') : t('emails.createTemplate', 'Nieuw Template')}
              </h2>
              <button onClick={() => setShowEditor(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <Trash2 size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('emails.templateName', 'Template Naam')}</label>
                <input 
                  required
                  name="name"
                  defaultValue={editingTemplate?.name}
                  placeholder={t("placeholders.adminEmailSubjectExample", "bijv. Order Vertraagd")}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('emails.subject', 'E-mail Onderwerp')}</label>
                <input 
                  required
                  name="subject"
                  defaultValue={editingTemplate?.subject}
                  placeholder={t("placeholders.adminEmailBodyOrderUpdate", "Update over uw order {{orderNumber}}")}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('emails.templateBody', 'E-mail Inhoud (HTML)')}
                  <small className="block font-normal text-slate-500">Gebruik {"{{variable}}"} voor dynamische velden.</small>
                </label>
                <textarea 
                  required
                  name="body"
                  rows={8}
                  defaultValue={editingTemplate?.body}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button 
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="px-6 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center space-x-2"
                >
                  <Send size={18} />
                  <span>{t('emails.saveTemplate', 'Template Opslaan')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEmailManager;