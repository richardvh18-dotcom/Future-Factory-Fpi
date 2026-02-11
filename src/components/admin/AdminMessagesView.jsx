import React, { useState, useEffect, useMemo } from "react";
import {
  Mail,
  Archive,
  Trash2,
  CheckCircle,
  Inbox,
  User,
  Plus,
  X,
  Send,
  Clock,
  ChevronRight,
  Reply,
  ShieldCheck,
  Loader2,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

/**
 * AdminMessagesView V6.0 - Master Communication Hub
 * Beheert de inbox en verzending via de root: /future-factory/production/messages/
 */
const AdminMessagesView = ({ user: propUser }) => {
  const { user: authUser, isAdmin } = useAdminAuth();
  const user = propUser || authUser;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox', 'archived'
  const [filterType, setFilterType] = useState('all'); // 'all', 'crash'
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // 1. Live Sync met de Root Messages collectie
  useEffect(() => {
    if (!isValidPath("MESSAGES")) return;

    setLoading(true);
    const messagesRef = collection(db, ...PATHS.MESSAGES);

    // We filteren berichten gericht aan de huidige gebruiker OF berichten aan 'admin'
    const q = query(messagesRef, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date(),
        }));

        // Filteren op basis van rechten
        const visibleMsgs = msgs.filter((m) => {
          const isOwn = m.to === user?.email || m.senderId === user?.uid;
          // Admin berichten zijn voor 'admin', de groep 'admins' of systeem errors
          const isForAdmins = m.to === "admin" || m.targetGroup === "admins" || m.type === "SYSTEM_ERROR";
          
          // Admins zien alles voor admins + eigen berichten
          if (isAdmin) return isOwn || isForAdmins;
          
          // Niet-admins zien alleen eigen berichten
          return isOwn;
        });

        setMessages(visibleMsgs);
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden berichten:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  // 2. Bericht Acties
  const handleMarkAsRead = async (msg) => {
    if (msg.read || msg.senderId === user?.uid) return;
    try {
      const docRef = doc(db, ...PATHS.MESSAGES, msg.id);
      await updateDoc(docRef, { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchive = async (msg) => {
    try {
      const docRef = doc(db, ...PATHS.MESSAGES, msg.id);
      await updateDoc(docRef, { archived: !msg.archived });
      if (selectedMessage?.id === msg.id) setSelectedMessage(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (msg) => {
    if (
      !window.confirm(
        "Dit bericht definitief verwijderen uit de root database?"
      )
    )
      return;
    try {
      const docRef = doc(db, ...PATHS.MESSAGES, msg.id);
      await deleteDoc(docRef);
      if (selectedMessage?.id === msg.id) setSelectedMessage(null);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (activeTab === "inbox") return !m.archived;
      if (activeTab === "archived") return m.archived;
      if (filterType === "crash") return m.type === "SYSTEM_ERROR";
      return true;
    });
  }, [messages, activeTab, filterType]);

  if (loading)
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Syncing Hub...
        </p>
      </div>
    );

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden animate-in fade-in text-left">
      {/* SIDEBAR: MESSAGES LIST */}
      <div
        className={`w-full md:w-1/3 xl:w-1/4 border-r border-slate-200 flex flex-col bg-white ${
          selectedMessage ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header Tools */}
        <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
              Messages
            </h2>
            <button
              onClick={() => setIsComposeOpen(true)}
              className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>

          {/* Filter Knoppen (Crash Reports) */}
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${
                  filterType === 'all' 
                    ? 'bg-slate-800 text-white border-slate-800' 
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                <MessageSquare size={12} /> Alles
              </button>
              <button
                onClick={() => setFilterType('crash')}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${
                  filterType === 'crash' 
                    ? 'bg-red-600 text-white border-red-600 shadow-sm' 
                    : 'bg-white text-red-400 border-red-100 hover:bg-red-50'
                }`}
              >
                <AlertTriangle size={12} /> Crashes
              </button>
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => {
                setActiveTab("inbox");
                setSelectedMessage(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                activeTab === "inbox"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <Inbox size={14} /> Inbox
            </button>
            <button
              onClick={() => {
                setActiveTab("archived");
                setSelectedMessage(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                activeTab === "archived"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <Archive size={14} /> Archief
            </button>
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredMessages.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center text-slate-300 opacity-40">
              <Mail size={48} strokeWidth={1} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest italic">
                Geen berichten
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isFromMe = msg.senderId === user?.uid;
              const isUnread = !msg.read && !isFromMe;

              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    setSelectedMessage(msg);
                    handleMarkAsRead(msg);
                  }}
                  className={`p-6 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 group relative
                    ${isUnread ? "bg-blue-50/40" : ""}
                    ${msg.type === 'SYSTEM_ERROR' ? "bg-red-50/30 hover:bg-red-50/50" : ""}
                    ${
                      selectedMessage?.id === msg.id
                        ? "bg-blue-50 border-l-4 border-l-blue-600"
                        : "border-l-4 border-l-transparent"
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`text-[11px] uppercase italic tracking-tighter truncate max-w-[70%] ${
                        isUnread
                          ? "font-black text-slate-900"
                          : "font-bold text-slate-500"
                      }`}
                    >
                      {isFromMe
                        ? `Aan: ${msg.toName || msg.to}`
                        : msg.senderName || msg.from}
                    </span>
                    <span className="text-[9px] font-bold text-slate-300 whitespace-nowrap ml-2">
                      {format(msg.timestamp, "HH:mm")}
                    </span>
                  </div>
                  <h4
                    className={`text-sm truncate mb-1 leading-none ${
                      isUnread
                        ? "font-black text-blue-700"
                        : "font-bold text-slate-700"
                    } ${msg.type === 'SYSTEM_ERROR' ? "text-red-700" : ""}`}
                  >
                    {msg.type === 'SYSTEM_ERROR' && "🔥 "}
                    {msg.subject || "Geen onderwerp"}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-1 font-medium italic">
                    {msg.content}
                  </p>
                  {isUnread && (
                    <div className="absolute top-6 right-3 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse"></div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MAIN VIEW: MESSAGE CONTENT */}
      <div
        className={`flex-1 flex-col bg-slate-50 transition-all duration-500 ${
          !selectedMessage ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedMessage ? (
          <>
            {/* Detail Header */}
            <div className="p-8 bg-white border-b border-slate-200 shadow-sm z-10 text-left">
              <div className="flex justify-between items-start mb-6">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="md:hidden p-2 bg-slate-100 rounded-xl text-slate-400 mr-4"
                >
                  <X size={20} />
                </button>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-slate-900 text-blue-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest italic border border-white/5 shadow-lg">
                      Subject Analysis
                    </span>
                    {selectedMessage.priority === "urgent" && (
                      <span className="bg-rose-100 text-rose-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase animate-pulse border border-rose-200">
                        Spoed
                      </span>
                    )}
                    {selectedMessage.type === "SYSTEM_ERROR" && (
                      <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase border border-red-700 shadow-sm">
                        Systeem Crash
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 leading-tight italic tracking-tighter uppercase">
                    {selectedMessage.subject}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleArchive(selectedMessage)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-[18px] border border-slate-100 transition-all shadow-sm"
                    title="Archiveren"
                  >
                    <Archive size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedMessage)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-[18px] border border-slate-100 transition-all shadow-sm"
                    title="Verwijderen"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[25px] border border-slate-100 shadow-inner">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                    <User size={24} />
                  </div>
                  <div className="text-left">
                    <span className="font-black text-slate-800 block text-sm uppercase italic leading-none mb-1">
                      {selectedMessage.senderName || selectedMessage.from}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Gekoppeld ID:{" "}
                      {selectedMessage.senderId?.substring(0, 8) || "Unknown"}
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col gap-1 pr-2">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                    <Clock size={12} className="text-blue-500" />
                    {format(selectedMessage.timestamp, "eeee dd MMMM", {
                      locale: nl,
                    })}
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 font-mono">
                    {format(selectedMessage.timestamp, "HH:mm:ss")}
                  </span>
                </div>
              </div>
            </div>

            {/* Detail Body */}
            <div className="p-10 overflow-y-auto flex-1 text-left">
              <div className="max-w-4xl mx-auto bg-white p-10 rounded-[40px] shadow-sm border border-slate-100 min-h-[300px] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12">
                  <Mail size={200} />
                </div>
                
                {selectedMessage.type === 'SYSTEM_ERROR' ? (
                  <pre className="relative z-10 bg-slate-900 text-red-400 p-6 rounded-2xl overflow-x-auto font-mono text-xs leading-relaxed border border-slate-800 shadow-inner">
                    {selectedMessage.content}
                  </pre>
                ) : (
                  <div className="relative z-10 prose prose-slate max-w-none text-slate-700 leading-relaxed text-base italic font-medium whitespace-pre-wrap">
                    "{selectedMessage.content}"
                  </div>
                )}

                {selectedMessage.type === "validation_alert" && (
                  <div className="mt-12 p-8 bg-emerald-50 border-2 border-emerald-100 rounded-[30px] flex flex-col md:flex-row items-center gap-8 shadow-lg shadow-emerald-100 animate-in zoom-in">
                    <div className="bg-white p-5 rounded-full shadow-xl text-emerald-500 ring-8 ring-emerald-500/10">
                      <CheckCircle size={40} />
                    </div>
                    <div className="text-left flex-1">
                      <h4 className="font-black text-emerald-900 text-xl uppercase italic tracking-tighter">
                        Validatie Nodig
                      </h4>
                      <p className="text-sm text-emerald-700/80 font-bold uppercase tracking-widest mt-1">
                        Nieuw product wacht op uw oordeel.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate("/admin/products")}
                      className="bg-emerald-600 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-3 shrink-0"
                    >
                      Catalogus Openen <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-8 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-500" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  End-to-End Secure Hub Sync
                </span>
              </div>
              <button
                onClick={() => {
                  // Simpele reply mock
                  setIsComposeOpen(true);
                }}
                className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center gap-3 active:scale-95"
              >
                <Reply size={18} /> Beantwoorden
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-20 text-center opacity-40">
            <div className="bg-white p-10 rounded-[60px] shadow-inner mb-8 border border-slate-200/50">
              <Mail size={100} strokeWidth={1} className="text-slate-200" />
            </div>
            <h3 className="text-2xl font-black text-slate-400 uppercase italic tracking-tighter mb-2">
              Communicatie Hub
            </h3>
            <p className="text-xs font-bold uppercase tracking-widest max-w-xs leading-relaxed text-slate-400">
              Selecteer een bericht uit de lijst aan de linkerzijde om de inhoud
              te inspecteren.
            </p>
          </div>
        )}
      </div>

      {/* COMPOSE MODAL INTEGRATION */}
      {isComposeOpen && (
        <ComposeModal onClose={() => setIsComposeOpen(false)} user={user} />
      )}
    </div>
  );
};

/**
 * SUB-COMPONENT: ComposeModal
 * Wordt binnen hetzelfde bestand gedefinieerd voor stabiliteit.
 */
const ComposeModal = ({ onClose, user }) => {
  const [formData, setFormData] = useState({
    to: "admin",
    subject: "",
    content: "",
    priority: "normal",
  });
  const [sending, setSending] = useState(false);
  const [userList, setUserList] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const q = collection(db, ...PATHS.USERS);
      const snap = await getDocs(q);
      setUserList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    fetchUsers();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.subject || !formData.content) return;
    setSending(true);

    try {
      await addDoc(collection(db, ...PATHS.MESSAGES), {
        ...formData,
        senderId: user?.uid,
        senderName: user?.name || user?.displayName || user?.email,
        from: user?.email,
        timestamp: serverTimestamp(),
        read: false,
        archived: false,
        type: "user_message",
      });
      onClose();
    } catch (err) {
      alert("Verzenden mislukt: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 flex flex-col">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="text-left">
            <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Nieuw <span className="text-blue-600">Bericht</span>
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">
              Interne Communicatie
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm group border border-transparent hover:border-slate-100"
          >
            <X
              size={20}
              className="text-slate-400 group-hover:text-slate-900"
            />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-10 space-y-6 text-left">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Ontvanger
              </label>
              <select
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm appearance-none cursor-pointer"
                value={formData.to}
                onChange={(e) =>
                  setFormData({ ...formData, to: e.target.value })
                }
              >
                <option value="admin">Administrators (Groep)</option>
                {userList
                  .filter((u) => u.email !== user?.email)
                  .map((u) => (
                    <option key={u.id} value={u.email}>
                      {u.name || u.email} ({u.role})
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Prioriteit
              </label>
              <select
                className={`w-full p-4 border-2 rounded-2xl font-black outline-none transition-all text-sm appearance-none cursor-pointer ${
                  formData.priority === "urgent"
                    ? "bg-rose-50 border-rose-100 text-rose-600"
                    : "bg-slate-50 border-slate-100 text-slate-700"
                }`}
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value })
                }
              >
                <option value="normal">Normaal</option>
                <option value="urgent">Directe Actie (Spoed)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Onderwerp
            </label>
            <input
              required
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 focus:bg-white transition-all text-sm"
              placeholder="Waar gaat het over?"
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Inhoud
            </label>
            <textarea
              required
              rows={5}
              className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-medium outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-inner resize-none italic"
              placeholder="Typ hier je bericht voor collega's of admins..."
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
            />
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-4 rounded-2xl font-black text-slate-400 hover:text-slate-600 transition-all text-[10px] uppercase tracking-widest"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3"
            >
              {sending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Send size={16} />
              )}{" "}
              Versturen naar Hub
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminMessagesView;
