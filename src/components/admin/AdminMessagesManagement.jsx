import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  Users,
  Plus,
  Trash2,
  Edit,
  Loader2,
  CheckCircle,
  AlertCircle,
  Settings,
  Bell,
  Send,
  Mail,
  Archive,
} from "lucide-react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";

/**
 * AdminMessagesManagement V1.0
 * Beheert berichten instellingen, groepen, en notificatie preferences
 */
const AdminMessagesManagement = () => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  const [activeTab, setActiveTab] = useState("groups"); // 'groups', 'settings', 'notifications'
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  // Group Management State
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    members: [],
    color: "bg-blue-500",
  });
  const [editingGroupId, setEditingGroupId] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    maxMessageSize: 5000,
    enableGroupMessages: true,
    enableSystemNotifications: true,
    defaultRetentionDays: 30,
    enableEmailNotifications: false,
  });

  // Notification Form State
  const [notificationForm, setNotificationForm] = useState({
    targetType: "group", // group, user, all
    targetId: "",
    subject: "",
    content: "",
    priority: "normal"
  });

  // Load Groups
  useEffect(() => {
    // Firestore collectie path voor berichten groepen
    // PATHS.MESSAGES = ["future-factory", "production", "messages"] (3 segmenten)
    // We voegen een document en collection toe: messages/config/groups
    const groupsRef = collection(
      db,
      ...PATHS.MESSAGES,
      "config",
      "groups"
    );
    const q = query(groupsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setGroups(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden groepen:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Create New Group
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroup.name.trim()) {
      setStatus({ type: "error", msg: t('adminMessages.groupNameRequired') });
      return;
    }

    setSaving(true);
    try {
      await addDoc(
        collection(db, ...PATHS.MESSAGES, "config", "groups"),
        {
        name: newGroup.name,
        description: newGroup.description,
        color: newGroup.color,
        members: newGroup.members || [],
        createdAt: serverTimestamp(),
        createdBy: user?.email || "Admin",
      });

      setNewGroup({ name: "", description: "", members: [], color: "bg-blue-500" });
      setShowNewGroupForm(false);
      setStatus({ type: "success", msg: t('adminMessages.groupCreated') });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij aanmaken groep:", err);
      setStatus({ type: "error", msg: t('adminMessages.groupCreateError') });
    } finally {
      setSaving(false);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm(t('adminMessages.deleteGroupConfirm')))
      return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, ...PATHS.MESSAGES, "config", "groups", groupId));
      setStatus({ type: "success", msg: t('adminMessages.groupDeleted') });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij verwijderen groep:", err);
      setStatus({ type: "error", msg: t('adminMessages.deleteError') });
    } finally {
      setSaving(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Sla instellingen op in Firebase
      await setDoc(doc(db, ...PATHS.MESSAGES, "config", "settings"), {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || "Admin",
      }, { merge: true });

      setStatus({ type: "success", msg: t('adminMessages.settingsSaved') });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij opslaan instellingen:", err);
      setStatus({ type: "error", msg: t('adminMessages.saveError') });
    } finally {
      setSaving(false);
    }
  };

  // Send System Notification
  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!notificationForm.subject || !notificationForm.content) {
        setStatus({ type: "error", msg: "Onderwerp en inhoud zijn verplicht" });
        return;
    }
    
    setSaving(true);
    try {
        let to = "all";
        if (notificationForm.targetType === "group") to = notificationForm.targetId;
        if (notificationForm.targetType === "user") to = notificationForm.targetId;

        await addDoc(collection(db, ...PATHS.MESSAGES), {
            to: to,
            from: "SYSTEM",
            senderId: user?.uid || "admin",
            senderName: "Systeem Bericht",
            subject: notificationForm.subject,
            content: notificationForm.content,
            timestamp: serverTimestamp(),
            read: false,
            archived: false,
            priority: notificationForm.priority,
            type: "system", // Zorgt voor speciale styling in AdminMessagesView
            targetGroup: notificationForm.targetType === "group" ? notificationForm.targetId : null
        });

        setStatus({ type: "success", msg: "Systeemnotificatie verzonden!" });
        setNotificationForm(prev => ({ ...prev, subject: "", content: "" }));
        setTimeout(() => setStatus(null), 3000);
    } catch (err) {
        console.error(err);
        setStatus({ type: "error", msg: "Kon bericht niet versturen: " + err.message });
    } finally {
        setSaving(false);
    }
  };

  const colorOptions = [
    { name: t('adminMessages.colors.blue'), value: "bg-blue-500" },
    { name: t('adminMessages.colors.green'), value: "bg-green-500" },
    { name: t('adminMessages.colors.purple'), value: "bg-purple-500" },
    { name: t('adminMessages.colors.orange'), value: "bg-orange-500" },
    { name: t('adminMessages.colors.red'), value: "bg-red-500" },
    { name: t('adminMessages.colors.cyan'), value: "bg-cyan-500" },
    { name: t('adminMessages.colors.fuchsia'), value: "bg-fuchsia-500" },
  ];

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">
            {t('common.messages')} <span className="text-blue-600">{t('common.management')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('common.configureGroupsSettingsNotifications')}
          </p>
        </div>
        <Mail className="text-blue-600" size={40} />
      </div>

      {/* Status Messages */}
      {status && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest border ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {status.msg}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: "groups", label: t('adminMessages.tabs.groups'), icon: Users },
          { id: "settings", label: t('adminMessages.tabs.settings'), icon: Settings },
          { id: "notifications", label: t('adminMessages.tabs.notifications'), icon: Bell },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-bold uppercase text-xs tracking-widest transition-all border-b-2 ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* GROEPEN TAB */}
      {activeTab === "groups" && (
        <div className="space-y-6">
          <button
            onClick={() => setShowNewGroupForm(!showNewGroupForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
          >
            <Plus size={16} /> {t('common.newGroup')}
          </button>

          {/* New Group Form */}
          {showNewGroupForm && (
            <form
              onSubmit={handleCreateGroup}
              className="bg-white border-2 border-blue-200 rounded-2xl p-6 space-y-4"
            >
              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  {t('common.groupName')}
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  placeholder={t('adminMessages.groupNamePlaceholder')}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  {t('common.description')}
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 resize-none h-20"
                  placeholder={t('adminMessages.descriptionPlaceholder')}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  {t('common.color')}
                </label>
                <div className="flex gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() =>
                        setNewGroup({ ...newGroup, color: color.value })
                      }
                      className={`w-8 h-8 rounded-lg ${color.value} transition-transform ${
                        newGroup.color === color.value ? "ring-2 ring-offset-2 ring-slate-900 scale-110" : ""
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : t('adminMessages.create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-300 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}

          {/* Groups List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {t('common.noGroupsFound')}
            </div>
          ) : (
            <div className="grid gap-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded-full ${group.color} mt-1`}></div>
                      <div>
                        <h3 className="font-bold text-slate-900">{group.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {group.description || t('adminMessages.noDescription')}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-400 uppercase font-bold">
                          <span>{t('adminMessages.membersCount', { count: (group.members || []).length })}</span>
                          {group.createdBy && <span>{t('adminMessages.createdBy', { name: group.createdBy })}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          /* TODO: Edit group */
                        }}
                        className="p-2 text-slate-600 hover:bg-blue-50 rounded-lg transition-all"
                        title={t('common.edit')}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INSTELLINGEN TAB */}
      {activeTab === "settings" && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 space-y-6">
            {/* Max Message Size */}
            <div>
              <label className="text-xs font-bold uppercase text-slate-600 mb-2 block flex items-center gap-2">
                <Mail size={14} /> {t('adminMessages.settings.maxMessageSize')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={settings.maxMessageSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxMessageSize: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                />
                <span className="text-sm text-slate-600">{t('adminMessages.settings.characters')}</span>
              </div>
            </div>

            {/* Group Messages Toggle */}
            <div className="flex items-center justify-between pb-4 border-b">
              <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
                <Users size={14} /> {t('adminMessages.settings.enableGroupMessages')}
              </label>
              <input
                type="checkbox"
                checked={settings.enableGroupMessages}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableGroupMessages: e.target.checked,
                  })
                }
                className="w-5 h-5"
              />
            </div>

            {/* System Notifications Toggle */}
            <div className="flex items-center justify-between pb-4 border-b">
              <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
                <Bell size={14} /> {t('adminMessages.settings.enableSystemNotifications')}
              </label>
              <input
                type="checkbox"
                checked={settings.enableSystemNotifications}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableSystemNotifications: e.target.checked,
                  })
                }
                className="w-5 h-5"
              />
            </div>

            {/* Message Retention */}
            <div>
              <label className="text-xs font-bold uppercase text-slate-600 mb-2 block flex items-center gap-2">
                <Archive size={14} /> {t('adminMessages.settings.messageRetention')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={settings.defaultRetentionDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultRetentionDays: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                />
                <span className="text-sm text-slate-600">{t('adminMessages.settings.days')}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {t('adminMessages.settings.retentionHelp')}
              </p>
            </div>

            {/* Email Notifications Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
                <Mail size={14} /> {t('adminMessages.settings.enableEmailNotifications')}
              </label>
              <input
                type="checkbox"
                checked={settings.enableEmailNotifications}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableEmailNotifications: e.target.checked,
                  })
                }
                className="w-5 h-5"
              />
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-6"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> {t('adminMessages.saveSettings')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* NOTIFICATIES TAB */}
      {activeTab === "notifications" && (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 space-y-6 max-w-3xl">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Bell className="text-blue-600" size={20} />
            <div>
              <h3 className="font-bold text-blue-900">Systeem Bericht Console</h3>
              <p className="text-xs text-blue-700 mt-1">
                Stuur handmatige systeem-notificaties naar gebruikers of groepen (bijv. voor testen of mededelingen).
              </p>
            </div>
          </div>

          <form onSubmit={handleSendNotification} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">Doelgroep Type</label>
                    <select 
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold"
                        value={notificationForm.targetType}
                        onChange={e => setNotificationForm({...notificationForm, targetType: e.target.value})}
                    >
                        <option value="group">Specifieke Groep</option>
                        <option value="user">Specifieke Gebruiker (Email)</option>
                        <option value="all">Iedereen (Broadcast)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                        {notificationForm.targetType === 'group' ? 'Groep ID / Naam' : notificationForm.targetType === 'user' ? 'Emailadres' : 'Doel'}
                    </label>
                    <input 
                        type="text" 
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm"
                        placeholder={notificationForm.targetType === 'group' ? "bijv. SPOOLS_TEAM" : notificationForm.targetType === 'user' ? "user@example.com" : "Alle gebruikers"}
                        value={notificationForm.targetId}
                        onChange={e => setNotificationForm({...notificationForm, targetId: e.target.value})}
                        disabled={notificationForm.targetType === 'all'}
                    />
                </div>
            </div>

            <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">Prioriteit</label>
                <div className="flex gap-3">
                    {['low', 'normal', 'high', 'urgent'].map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setNotificationForm({...notificationForm, priority: p})}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all ${
                                notificationForm.priority === p 
                                ? (p === 'urgent' ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-800 text-white border-slate-800')
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">Onderwerp</label>
                <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold"
                    value={notificationForm.subject}
                    onChange={e => setNotificationForm({...notificationForm, subject: e.target.value})}
                />
            </div>

            <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">Bericht Inhoud</label>
                <textarea 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 h-24 resize-none"
                    value={notificationForm.content}
                    onChange={e => setNotificationForm({...notificationForm, content: e.target.value})}
                />
            </div>

            <button 
                type="submit" 
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
            >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Verstuur Systeem Bericht
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminMessagesManagement;
