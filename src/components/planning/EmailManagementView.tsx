// @ts-nocheck
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { Mail, Plus, Edit, Trash2, CheckCircle, XCircle, Search, LayoutTemplate, History } from "lucide-react";
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
      } else {
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
    } catch (err) {
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

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Mail className="text-blue-600" size={32} />
              {t("email.management.title", "E-mail")} <span className="text-blue-600">{t("email.management.subtitle", "Beheer")}</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {t("email.management.description", "Beheer e-mail templates voor automations en bekijk verzonden e-mails.")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("templates")}
              className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "templates" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              <LayoutTemplate size={18} />
              {t("email.management.tabTemplates", "Templates")}
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "logs" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              <History size={18} />
              {t("email.management.tabLogs", "Verzonden (Logs)")}
            </button>
          </div>
        </div>
      </div>

      {activeTab === "templates" && (
        <div className="space-y-6">
          {!showEditor ? (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-800">{t("email.management.templatesTitle", "Jouw Templates")}</h2>
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setFormData({ name: "", subject: "", html: "" });
                    setShowEditor(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
                >
                  <Plus size={16} />
                  {t("email.management.newTemplate", "Nieuw Template")}
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(tpl => (
                  <div key={tpl.id} className="p-4 border-2 border-slate-200 rounded-xl hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-800">{tpl.name}</h3>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingTemplate(tpl); setFormData(tpl); setShowEditor(true); }} className="text-slate-400 hover:text-blue-600"><Edit size={16}/></button>
                        <button onClick={() => handleDelete(tpl.id, tpl.name)} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-1"><strong>Onderwerp:</strong> {tpl.subject}</p>
                    <div className="text-xs text-slate-400 truncate mt-2 bg-slate-50 p-2 rounded">{tpl.html.replace(/<[^>]*>?/gm, '').substring(0, 50)}...</div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="col-span-full text-center py-10 text-slate-500">
                    {t("email.management.noTemplates", "Geen templates gevonden. Maak er een aan!")}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">{editingTemplate ? t("email.management.editTemplate", "Template Bewerken") : t("email.management.createTemplate", "Nieuw Template Maken")}</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">{t("email.management.templateName", "Template Naam")}</label>
                    <input 
                      type="text" 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                      placeholder="Bijv. Machine Storing Alert" 
                      className="w-full p-2 border-2 border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">{t("email.management.subject", "E-mail Onderwerp")}</label>
                    <input 
                      type="text" 
                      value={formData.subject} 
                      onChange={e => setFormData({...formData, subject: e.target.value})} 
                      placeholder="Bijv. Let op: {{machine}} heeft een storing!" 
                      className="w-full p-2 border-2 border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">{t("email.management.html", "E-mail Tekst (HTML toegestaan)")}</label>
                    <textarea 
                      value={formData.html} 
                      onChange={e => setFormData({...formData, html: e.target.value})} 
                      placeholder="Typ hier de tekst. Je kunt HTML tags zoals <b>, <i>, <br> gebruiken." 
                      rows={8}
                      className="w-full p-2 border-2 border-slate-200 rounded-lg font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">{t("common.save", "Opslaan")}</button>
                    <button onClick={() => setShowEditor(false)} className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300">{t("common.cancel", "Annuleren")}</button>
                  </div>
                </div>
                
                {/* Help Panel */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-fit">
                  <h3 className="font-bold text-slate-700 mb-2">💡 {t("email.management.tipsTitle", "Variabelen & Tips")}</h3>
                  <p className="text-xs text-slate-600 mb-4">{t("email.management.tipsText", "Je kunt in het onderwerp of de tekst variabelen gebruiken. Deze worden automatisch ingevuld door de Automation Engine.")}</p>
                  <ul className="text-xs text-slate-600 space-y-2 font-mono">
                    <li><span className="font-bold text-blue-600">{"{{trigger_message}}"}</span> = Het standaard waarschuwingsbericht</li>
                    <li><span className="font-bold text-blue-600">{"{{machine}}"}</span> = De desbetreffende machine</li>
                    <li><span className="font-bold text-blue-600">{"{{order}}"}</span> = Order ID (indien van toepassing)</li>
                    <li><span className="font-bold text-blue-600">{"{{time}}"}</span> = Huidige tijd/datum</li>
                  </ul>
                  <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded border border-blue-100 text-xs">
                    Voorbeeld tekst:<br/>
                    <i>Beste manager,&lt;br&gt;&lt;br&gt;Er is een automatische alert getriggerd:&lt;br&gt;
                    &lt;b&gt;{"{{trigger_message}}"}&lt;/b&gt;&lt;br&gt;&lt;br&gt;Groet, Systeem.</i>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden">
           <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b-2 border-slate-200">
              <tr>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Datum & Tijd</th>
                <th className="p-4 font-bold">Ontvanger</th>
                <th className="p-4 font-bold">Onderwerp</th>
                <th className="p-4 font-bold">Template Gebruikt</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4">
                    {log.status === "success" ? <CheckCircle className="text-emerald-500" size={18}/> : <XCircle className="text-red-500" size={18}/>}
                  </td>
                  <td className="p-4 text-slate-600">
                    {log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString('nl-NL') : "Onbekend"}
                  </td>
                  <td className="p-4 font-medium text-slate-800">{Array.isArray(log.to) ? log.to.join(', ') : log.to}</td>
                  <td className="p-4 text-slate-600">{log.subject}</td>
                  <td className="p-4 text-slate-500 text-xs">{log.templateName || "Geen template"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500">
                    Nog geen e-mails verstuurd.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmailManagementView;
