import React, { useState, useEffect } from "react";
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
  Shield,
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
      setStatus({ type: "error", msg: "Groepnaam is verplicht" });
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
      setStatus({ type: "success", msg: "✅ Groep aangemaakt!" });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij aanmaken groep:", err);
      setStatus({ type: "error", msg: "❌ Fout bij aanmaken groep" });
    } finally {
      setSaving(false);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("Groep verwijderen? Dit kan niet ongedaan gemaakt worden."))
      return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, ...PATHS.MESSAGES, "config", "groups", groupId));
      setStatus({ type: "success", msg: "✅ Groep verwijderd" });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij verwijderen groep:", err);
      setStatus({ type: "error", msg: "❌ Fout bij verwijderen" });
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

      setStatus({ type: "success", msg: "✅ Instellingen opgeslagen!" });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error("Fout bij opslaan instellingen:", err);
      setStatus({ type: "error", msg: "❌ Fout bij opslaan" });
    } finally {
      setSaving(false);
    }
  };

  const colorOptions = [
    { name: "Blauw", value: "bg-blue-500" },
    { name: "Groen", value: "bg-green-500" },
    { name: "Paars", value: "bg-purple-500" },
    { name: "Oranje", value: "bg-orange-500" },
    { name: "Rood", value: "bg-red-500" },
    { name: "Cyaan", value: "bg-cyan-500" },
    { name: "Fuchsia", value: "bg-fuchsia-500" },
  ];

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">
            Berichten <span className="text-blue-600">Beheer</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Groepen, instellingen & notificaties configureren
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
          { id: "groups", label: "👥 Groepen", icon: Users },
          { id: "settings", label: "⚙️ Instellingen", icon: Settings },
          { id: "notifications", label: "🔔 Notificaties", icon: Bell },
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
            <Plus size={16} /> Nieuwe Groep
          </button>

          {/* New Group Form */}
          {showNewGroupForm && (
            <form
              onSubmit={handleCreateGroup}
              className="bg-white border-2 border-blue-200 rounded-2xl p-6 space-y-4"
            >
              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  Groepnaam
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  placeholder="Bijv. Marketing Team"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  Beschrijving
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 resize-none h-20"
                  placeholder="Optionele beschrijving..."
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-600 mb-2 block">
                  Kleur
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
                  {saving ? <Loader2 className="animate-spin" size={16} /> : "✅ Aanmaken"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewGroupForm(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-300 transition-all"
                >
                  Annuleren
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
              Geen groepen gevonden. Maak de eerste groep aan!
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
                          {group.description || "Geen beschrijving"}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-400 uppercase font-bold">
                          <span>👥 {(group.members || []).length} leden</span>
                          {group.createdBy && <span>👤 {group.createdBy}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          /* TODO: Edit group */
                        }}
                        className="p-2 text-slate-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Bewerken"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all"
                        title="Verwijderen"
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
                <Mail size={14} /> Maximale bericht grootte
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
                <span className="text-sm text-slate-600">karakters</span>
              </div>
            </div>

            {/* Group Messages Toggle */}
            <div className="flex items-center justify-between pb-4 border-b">
              <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
                <Users size={14} /> Groep berichten inschakelen
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
                <Bell size={14} /> Systeemnotificaties
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
                <Archive size={14} /> Berichtretentie
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
                <span className="text-sm text-slate-600">dagen</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Berichten ouder dan dit aantal dagen worden automatisch verwijderd
              </p>
            </div>

            {/* Email Notifications Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-slate-600 flex items-center gap-2">
                <Mail size={14} /> E-mailnotificaties
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
                  <Loader2 className="animate-spin" size={16} /> Opslaan...
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Instellingen Opslaan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* NOTIFICATIES TAB */}
      {activeTab === "notifications" && (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Bell className="text-blue-600" size={20} />
            <div>
              <h3 className="font-bold text-blue-900">Notificatie Instellingen</h3>
              <p className="text-xs text-blue-700 mt-1">
                Hier kunt u notificatie voorkeuren per gebruiker of groep instellen
              </p>
            </div>
          </div>

          <div className="text-center py-12 text-slate-500">
            <Shield size={32} className="mx-auto mb-4 opacity-50" />
            <p className="font-bold">Functie in uitvoering</p>
            <p className="text-xs">Notificatie instellingen worden binnenkort beschikbaar</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMessagesManagement;
