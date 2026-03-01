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
  AlertTriangle,
  MessageSquare,
  Quote,
  Edit3,
  Download,
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
  getDoc,
  or,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { storage } from "../../config/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * AdminMessagesView V6.0 - Master Communication Hub
 * Beheert de inbox en verzending via de root: /future-factory/production/messages/
 */
const AdminMessagesView = ({ user: propUser }) => {
  const { user: authUser, isAdmin } = useAdminAuth();
  const { showSuccess, showError } = useNotifications();
  const user = propUser || authUser;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox', 'archived'
  const [filterType, setFilterType] = useState('all'); // 'all', 'crash'
  const [selectedThread, setSelectedThread] = useState(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyContext, setReplyContext] = useState(null);

  // Bepaal relevante groepen voor de huidige gebruiker (voor filtering en query)
  const userGroups = useMemo(() => {
    if (!user?.email) return [];
    const groups = [user.email];
    
    if (user.department) {
        const dept = user.department.toLowerCase();
        if (dept.includes('spools')) groups.push('SPOOLS_TEAM');
        if (dept.includes('fittings')) groups.push('FITTINGS_TEAM');
        if (dept.includes('pipes')) groups.push('PIPES_TEAM');
    }
    return groups;
  }, [user]);

  // 1. Live Sync met de Root Messages collectie
  useEffect(() => {
    if (!isValidPath("MESSAGES")) return;

    setLoading(true);
    const messagesRef = collection(db, ...PATHS.MESSAGES);

    let q;
    setError(null);

    if (isAdmin) {
      // Admins mogen alles ophalen (security rule checkt role == 'admin')
      q = query(messagesRef, orderBy("timestamp", "desc"));
    } else {
      // Niet-admins mogen alleen eigen berichten zien (security rule checkt senderId/to)
      // Dit voorkomt 'Missing or insufficient permissions' errors
      if (!user?.email) return;
      
      q = query(
        messagesRef,
        // We verwijderen orderBy hier om de index-fout te voorkomen. Sortering gebeurt nu client-side.
        or(where("to", "in", userGroups), where("senderId", "==", user.uid))
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date(),
        }));

        // Client-side sorteren (nieuwste eerst)
        msgs.sort((a, b) => b.timestamp - a.timestamp);

        // Filteren op basis van rechten
        const visibleMsgs = msgs.filter((m) => {
          const isForMe = userGroups.includes(m.to);
          const isFromMe = m.senderId === user?.uid;
          // Admin berichten zijn voor 'admin', de groep 'admins' of systeem errors
          const isForAdmins = m.to === "admin" || m.targetGroup === "admins" || m.type === "SYSTEM_ERROR";
          
          // Admins zien alles voor admins + eigen berichten
          if (isAdmin) return isForMe || isFromMe || isForAdmins;
          
          // Niet-admins zien alleen eigen berichten
          return isForMe || isFromMe;
        });

        setMessages(visibleMsgs);
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden berichten:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin, userGroups]);

  // 2. Bericht Acties
  const handleMarkAsRead = async (thread) => {
    const unreadMessages = thread.messages.filter(m => !m.read && m.senderId !== user?.uid);
    if (unreadMessages.length === 0) return;

    unreadMessages.forEach(async (msg) => {
      try {
        const docRef = doc(db, ...PATHS.MESSAGES, msg.id);
        await updateDoc(docRef, { read: true });
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleArchive = async (thread) => {
    try {
      const targetStatus = activeTab === "inbox"; // Als in inbox -> archiveer (true). Anders herstel (false).
      await Promise.all(thread.messages.map(msg => 
        updateDoc(doc(db, ...PATHS.MESSAGES, msg.id), { archived: targetStatus })
      ));
      
      if (selectedThread?.id === thread.id) setSelectedThread(null);
      showSuccess(targetStatus ? "Conversatie gearchiveerd" : "Conversatie hersteld");
    } catch (err) {
      console.error(err);
      showError("Actie mislukt: " + err.message);
    }
  };

  const handleDelete = async (thread) => {
    if (
      !window.confirm(
        "Deze hele conversatie definitief verwijderen?"
      )
    )
      return;
    try {
      await Promise.all(thread.messages.map(msg => 
        deleteDoc(doc(db, ...PATHS.MESSAGES, msg.id))
      ));
      if (selectedThread?.id === thread.id) setSelectedThread(null);
      showSuccess("Conversatie verwijderd");
    } catch (err) {
      console.error(err);
      showError("Verwijderen mislukt: " + err.message);
    }
  };

  const handleSaveConversation = (thread) => {
    if (!thread) return;
    
    const lines = [];
    lines.push(`Onderwerp: ${thread.subject}`);
    lines.push(`Laatste update: ${format(thread.timestamp, "dd-MM-yyyy HH:mm")}`);
    lines.push(`Deelnemers: ${Array.from(thread.participants).join(", ")}`);
    lines.push("-".repeat(50));
    lines.push("");
    
    const sortedMessages = [...thread.messages].sort((a, b) => {
        const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return tA - tB;
    });

    sortedMessages.forEach(msg => {
      const time = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
      const timeStr = format(time, "dd-MM-yyyy HH:mm");
      const sender = msg.senderName || msg.from || "Onbekend";
      
      lines.push(`[${timeStr}] ${sender}:`);
      lines.push(msg.content);
      if (msg.attachmentUrl) {
          lines.push(`[Bijlage: ${msg.attachmentMeta?.name || "Bestand"}]`);
      }
      lines.push("");
    });
    
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conversatie_${thread.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Grouping Logic (Threads)
  const threads = useMemo(() => {
    const groups = {};
    
    messages.forEach(m => {
      // Filter logic inline
      if (activeTab === "inbox" && m.archived) return;
      if (activeTab === "archived" && !m.archived) return;
      if (filterType === "crash" && m.type !== "SYSTEM_ERROR") return;
      
      // Normalize subject (remove RE:, FW:, etc.)
      const subject = (m.subject || "(Geen onderwerp)").replace(/^(RE:|FW:|FWD:)\s*/i, "").trim();
      const key = subject.toLowerCase();

      if (!groups[key]) {
        groups[key] = {
          id: key,
          subject: subject,
          messages: [],
          lastMessage: null,
          hasUnread: false,
          timestamp: new Date(0), // Voor sortering
          participants: new Set()
        };
      }

      const group = groups[key];
      group.messages.push(m);
      
      // Update stats
      if (m.timestamp > group.timestamp) {
        group.timestamp = m.timestamp;
        group.lastMessage = m;
      }
      if (!m.read && m.senderId !== user?.uid) {
        group.hasUnread = true;
      }
      if (m.senderName && m.senderId !== user?.uid) {
        group.participants.add(m.senderName);
      }
    });

    // Convert to array and sort by latest message
    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
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

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50 gap-4 p-8 text-center">
        <AlertTriangle className="text-red-500" size={48} />
        <h3 className="text-lg font-black text-slate-700 uppercase tracking-widest">Fout bij laden</h3>
        <p className="text-xs text-slate-500 font-mono bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-lg">
          {error}
        </p>
        {error.includes("index") && (
          <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-xs font-bold max-w-md border border-blue-100">
            <p className="uppercase tracking-widest mb-1">⚠️ Database Index Vereist</p>
            Open de browser console (F12) en klik op de gegenereerde link om de index aan te maken.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden animate-in fade-in text-left">
      {/* SIDEBAR: MESSAGES LIST */}
      <div
        className={`w-full md:w-1/3 xl:w-1/4 border-r border-slate-200 flex flex-col bg-white ${
          selectedThread ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header Tools */}
        <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
              Messages
            </h2>
            <button
              onClick={() => {
                setReplyContext(null);
                setIsComposeOpen(true);
              }}
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
                setSelectedThread(null);
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
                setSelectedThread(null);
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
          {threads.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center text-slate-300 opacity-40">
              <Mail size={48} strokeWidth={1} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest italic">
                Geen berichten
              </p>
            </div>
          ) : (
            threads.map((thread) => {
              const lastMsg = thread.lastMessage;
              const isFromMe = lastMsg.senderId === user?.uid;
              const isUnread = thread.hasUnread;
              const participants = Array.from(thread.participants).join(", ") || (isFromMe ? `Aan: ${lastMsg.toName || lastMsg.to}` : "Onbekend");

              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    setSelectedThread(thread);
                    handleMarkAsRead(thread);
                  }}
                  className={`p-6 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 group relative
                    ${isUnread ? "bg-blue-50/40" : ""}
                    ${lastMsg.type === 'SYSTEM_ERROR' ? "bg-red-50/30 hover:bg-red-50/50" : ""}
                    ${
                      selectedThread?.id === thread.id
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
                      {participants}
                      {thread.messages.length > 1 && <span className="ml-1 text-slate-400">({thread.messages.length})</span>}
                    </span>
                    <span className="text-[9px] font-bold text-slate-300 whitespace-nowrap ml-2">
                      {format(thread.timestamp, "HH:mm")}
                    </span>
                  </div>
                  <h4
                    className={`text-sm truncate mb-1 leading-none ${
                      isUnread
                        ? "font-black text-blue-700"
                        : "font-bold text-slate-700"
                    } ${lastMsg.type === 'SYSTEM_ERROR' ? "text-red-700" : ""}`}
                  >
                    {lastMsg.type === 'SYSTEM_ERROR' && "🔥 "}
                    {thread.subject}
                  </h4>
                  <p className="text-xs text-slate-400 line-clamp-1 font-medium italic">
                    {lastMsg.content}
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
          !selectedThread ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedThread ? (
          <>
            {/* Detail Header */}
            <div className="p-8 bg-white border-b border-slate-200 shadow-sm z-10 text-left">
              <div className="flex justify-between items-start mb-6">
                <button
                  onClick={() => setSelectedThread(null)}
                  className="md:hidden p-2 bg-slate-100 rounded-xl text-slate-400 mr-4"
                >
                  <X size={20} />
                </button>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-slate-900 text-blue-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest italic border border-white/5 shadow-lg">
                      Conversatie
                    </span>
                    {selectedThread.lastMessage.priority === "urgent" && (
                      <span className="bg-rose-100 text-rose-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase animate-pulse border border-rose-200">
                        Spoed
                      </span>
                    )}
                    {selectedThread.lastMessage.type === "SYSTEM_ERROR" && (
                      <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase border border-red-700 shadow-sm">
                        Systeem Crash
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 leading-tight italic tracking-tighter uppercase">
                    {selectedThread.subject}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveConversation(selectedThread)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-[18px] border border-slate-100 transition-all shadow-sm"
                    title="Opslaan als tekstbestand"
                  >
                    <Download size={20} />
                  </button>
                  <button
                    onClick={() => handleArchive(selectedThread)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-[18px] border border-slate-100 transition-all shadow-sm"
                    title="Archiveren"
                  >
                    <Archive size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedThread)}
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
                      {Array.from(selectedThread.participants).join(", ") || "Diverse"}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {selectedThread.messages.length} berichten
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col gap-1 pr-2">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                    <Clock size={12} className="text-blue-500" />
                    {format(selectedThread.timestamp, "eeee dd MMMM", {
                      locale: nl,
                    })}
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 font-mono">
                    Laatste update: {format(selectedThread.timestamp, "HH:mm")}
                  </span>
                </div>
              </div>
            </div>

            {/* Detail Body */}
            <div className="p-6 overflow-y-auto flex-1 text-left bg-slate-50/50">
              <div className="max-w-4xl mx-auto space-y-6">
                {selectedThread.messages.sort((a,b) => a.timestamp - b.timestamp).map((msg) => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] p-6 rounded-[24px] shadow-sm border ${
                        isMe 
                          ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none' 
                          : 'bg-white text-slate-700 border-slate-100 rounded-tl-none'
                      }`}>
                        <div className="flex justify-between items-center mb-2 gap-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                            {isMe ? 'Ik' : (msg.senderName || msg.from)}
                          </span>
                          <span className={`text-[9px] font-mono ${isMe ? 'text-blue-200' : 'text-slate-300'}`}>
                            {format(msg.timestamp, "dd MMM HH:mm")}
                          </span>
                        </div>
                        
                        {msg.type === 'SYSTEM_ERROR' ? (
                          <pre className="bg-black/20 p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap overflow-x-auto">
                            {msg.content}
                          </pre>
                        ) : (
                          <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed">
                            {msg.content}
                          </div>
                        )}

                        {msg.attachmentUrl && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 text-xs font-bold underline ${isMe ? 'text-white' : 'text-blue-600'}`}>
                              📎 Bijlage openen
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {selectedThread.lastMessage.type === "validation_alert" && (
                  <div className="mt-8 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[24px] flex flex-col md:flex-row items-center gap-6 shadow-sm mx-auto max-w-2xl">
                    <div className="bg-white p-3 rounded-full shadow-md text-emerald-500">
                      <CheckCircle size={24} />
                    </div>
                    <div className="text-left flex-1">
                      <h4 className="font-black text-emerald-900 text-sm uppercase italic tracking-tighter">
                        Validatie Verzoek
                      </h4>
                      <p className="text-xs text-emerald-700/80 font-bold mt-1">
                        Dit bericht betreft een goedkeuringsproces.
                      </p>
                    </div>
                    <button
                      onClick={() => window.location.href = "/admin/products"}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 shrink-0"
                    >
                      Naar Catalogus <ChevronRight size={14} />
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
                  setReplyContext(selectedThread.lastMessage);
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
              Selecteer een conversatie uit de lijst om de geschiedenis te bekijken.
            </p>
          </div>
        )}
      </div>

      {/* COMPOSE MODAL INTEGRATION */}
      {isComposeOpen && (
        <ComposeModal onClose={() => setIsComposeOpen(false)} user={user} replyTo={replyContext} />
      )}
    </div>
  );
};

/**
 * SUB-COMPONENT: ComposeModal
 * Wordt binnen hetzelfde bestand gedefinieerd voor stabiliteit.
 */
const ComposeModal = ({ onClose, user, replyTo }) => {
  const { showSuccess, showError } = useNotifications();
  const [formData, setFormData] = useState({
    to: replyTo?.from || "admin",
    subject: replyTo ? (replyTo.subject.startsWith("RE:") ? replyTo.subject : `RE: ${replyTo.subject}`) : "",
    content: `\n\nMet vriendelijke groet,\n${user?.name || user?.displayName || user?.email || "Gebruiker"}`,
    priority: "normal",
  });
  const [sending, setSending] = useState(false);
  const [userList, setUserList] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [uploadProgress] = useState(0);
  const [customSignature, setCustomSignature] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Users ophalen voor dropdown
      const q = collection(db, ...PATHS.USERS);
      const snap = await getDocs(q);
      setUserList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // 2. Handtekening ophalen van huidige gebruiker
      if (user?.uid) {
        try {
          const userDoc = await getDoc(doc(db, ...PATHS.USERS, user.uid));
          if (userDoc.exists() && userDoc.data().signature) {
            setCustomSignature(userDoc.data().signature);
          }
        } catch (e) {
          console.error("Fout bij ophalen handtekening:", e);
        }
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    if (customSignature) {
      setFormData(prev => {
        const defaultSig = `\n\nMet vriendelijke groet,\n${user?.name || user?.displayName || user?.email || "Gebruiker"}`;
        if (!prev.content || prev.content.trim() === defaultSig.trim() || prev.content.trim() === "") {
          return { ...prev, content: `\n\n${customSignature}` };
        }
        return prev;
      });
    }
  }, [customSignature, user]);

  const handleInsertQuote = () => {
    if (!replyTo) return;
    const quote = `\n\n> Op ${new Date(replyTo.timestamp).toLocaleString('nl-NL')} schreef ${replyTo.senderName || "Gebruiker"}:\n> ${(replyTo.content || "").replace(/\n/g, "\n> ")}`;
    setFormData(prev => ({ ...prev, content: prev.content + quote }));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.subject || !formData.content) return;
    setSending(true);

    try {
      let attachmentUrl = null;
      let attachmentMeta = null;

      if (attachment) {
        const fileRef = storageRef(storage, `messages/${Date.now()}_${attachment.name}`);
        await uploadBytes(fileRef, attachment);
        attachmentUrl = await getDownloadURL(fileRef);
        attachmentMeta = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size
        };
      }

      await addDoc(collection(db, ...PATHS.MESSAGES), {
        ...formData,
        senderId: user?.uid,
        senderName: user?.name || user?.displayName || user?.email,
        from: user?.email,
        timestamp: serverTimestamp(),
        read: false,
        archived: false,
        type: "user_message",
        attachmentUrl: attachmentUrl || null,
        attachmentMeta: attachmentMeta || null,
      });
      showSuccess("Bericht succesvol verzonden!");
      onClose();
    } catch (err) {
      showError("Verzenden mislukt: " + err.message);
    } finally {
      setSending(false);
    }
  };

  // Preview tonen voor afbeeldingen
  useEffect(() => {
    if (attachment && attachment.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setAttachmentPreview(e.target.result);
      reader.readAsDataURL(attachment);
    } else {
      setAttachmentPreview(null);
    }
  }, [attachment]);

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
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Inhoud
              </label>
              {replyTo && (
                <button
                  type="button"
                  onClick={handleInsertQuote}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Quote size={12} /> Citeer vorig bericht
                </button>
              )}
            </div>
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

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Bijlage (foto of bestand)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,.txt,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx"
              className="w-full p-2 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium outline-none focus:border-blue-500 transition-all text-xs"
              onChange={e => setAttachment(e.target.files[0])}
            />
            {attachmentPreview && (
              <img src={attachmentPreview} alt="Preview" className="mt-2 max-h-40 rounded-xl border border-slate-200 shadow" />
            )}
            {attachment && !attachmentPreview && (
              <div className="mt-2 text-xs text-slate-500">Bestand geselecteerd: {attachment.name}</div>
            )}
            {sending && attachment && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                  <span>Uploaden...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-1">
            <a href="/profile" className="text-[9px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1.5 transition-colors">
              <Edit3 size={10} /> Handtekening wijzigen in Mijn Dossier
            </a>
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
