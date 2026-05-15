import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { Mail, Archive, Trash2, CheckCircle, Inbox, User, Plus, X, Send, Clock, ChevronRight, Reply, ShieldCheck, Loader2, AlertTriangle, MessageSquare, Quote, Edit3, Download, } from "lucide-react";
import { doc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, onSnapshot, query, where, orderBy, getDocs, getDoc, or, } from "firebase/firestore";
import { db, storage, logActivity } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useTranslation } from "react-i18next";
/**
 * AdminMessagesView V6.0 - Master Communication Hub
 * Beheert de inbox en verzending via de root: /future-factory/production/messages/
 */
const AdminMessagesView = ({ user: propUser }) => {
    const { t } = useTranslation();
    const { user: authUser, isAdmin } = useAdminAuth();
    const { showSuccess, showError, showConfirm } = useNotifications();
    const user = propUser || authUser;
    // Live user profile sync om instellingen (zoals receivesCrashReports) direct toe te passen
    const [liveUser, setLiveUser] = useState(user);
    useEffect(() => {
        if (!user?.uid)
            return;
        const unsub = onSnapshot(doc(db, ...PATHS.USERS, user.uid), (snap) => {
            if (snap.exists()) {
                setLiveUser({ ...user, ...snap.data() });
            }
        });
        return () => unsub();
    }, [user?.uid]);
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
        if (!liveUser?.email)
            return [];
        const groups = [liveUser.email];
        if (liveUser.department) {
            const dept = liveUser.department.toLowerCase();
            if (dept.includes('spools'))
                groups.push('SPOOLS_TEAM');
            if (dept.includes('fittings'))
                groups.push('FITTINGS_TEAM');
            if (dept.includes('pipes'))
                groups.push('PIPES_TEAM');
        }
        return groups;
    }, [liveUser]);
    // 1. Live Sync met de Root Messages collectie
    useEffect(() => {
        if (!isValidPath("MESSAGES"))
            return;
        setLoading(true);
        const messagesRef = collection(db, ...PATHS.MESSAGES);
        let q;
        setError(null);
        if (isAdmin) {
            // Admins mogen alles ophalen (security rule checkt role == 'admin')
            q = query(messagesRef, orderBy("timestamp", "desc"));
        }
        else {
            // Niet-admins mogen alleen eigen berichten zien (security rule checkt senderId/to)
            // Dit voorkomt 'Missing or insufficient permissions' errors
            if (!liveUser?.email)
                return;
            q = query(messagesRef, 
            // We verwijderen orderBy hier om de index-fout te voorkomen. Sortering gebeurt nu client-side.
            or(where("to", "in", userGroups), where("senderId", "==", liveUser.uid)));
        }
        const unsubscribe = onSnapshot(q, (snapshot) => {
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
                const isFromMe = m.senderId === liveUser?.uid;
                // Admin berichten zijn voor 'admin', de groep 'admins' of systeem errors
                const isForAdmins = m.to === "admin" || m.targetGroup === "admins";
                // Admins zien alles voor admins + eigen berichten
                if (isAdmin) {
                    if (m.type === "SYSTEM_ERROR") {
                        return liveUser?.receivesCrashReports === true;
                    }
                    return isForMe || isFromMe || isForAdmins;
                }
                // Niet-admins zien alleen eigen berichten
                return isForMe || isFromMe;
            });
            setMessages(visibleMsgs);
            setLoading(false);
        }, (err) => {
            console.error("Fout bij laden berichten:", err);
            setError(err.message);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [liveUser, isAdmin, userGroups]);
    // 2. Bericht Acties
    const handleMarkAsRead = async (thread) => {
        const unreadMessages = thread.messages.filter(m => !m.read && m.senderId !== liveUser?.uid);
        if (unreadMessages.length === 0)
            return;
        try {
            await Promise.all(unreadMessages.map((msg) => updateDoc(doc(db, ...PATHS.MESSAGES, msg.id), { read: true })));
            await logActivity(liveUser?.uid || "system", "MESSAGE_MARK_READ", `Berichten als gelezen gemarkeerd in thread ${thread.id}: ${unreadMessages.length}`);
        }
        catch (err) {
            console.error(err);
        }
    };
    const handleArchive = async (thread) => {
        try {
            const targetStatus = activeTab === "inbox"; // Als in inbox -> archiveer (true). Anders herstel (false).
            await Promise.all(thread.messages.map(msg => updateDoc(doc(db, ...PATHS.MESSAGES, msg.id), { archived: targetStatus })));
            await logActivity(liveUser?.uid || "system", targetStatus ? "MESSAGE_ARCHIVE" : "MESSAGE_UNARCHIVE", `Conversatie ${thread.id} ${targetStatus ? "gearchiveerd" : "hersteld"}`);
            if (selectedThread?.id === thread.id)
                setSelectedThread(null);
            showSuccess(targetStatus ? t('adminMessagesView.conversationArchived') : t('adminMessagesView.conversationRestored'));
        }
        catch (err) {
            console.error(err);
            showError(t('adminMessagesView.actionFailed') + err.message);
        }
    };
    const handleDelete = async (thread) => {
        const confirmed = await showConfirm({
            title: t('adminMessagesView.deleteConversationTitle', 'Conversatie verwijderen'),
            message: t('adminMessagesView.deleteConversationConfirm'),
            confirmText: t('common.delete', 'Verwijderen'),
            cancelText: t('common.cancel', 'Annuleren'),
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            await Promise.all(thread.messages.map(msg => deleteDoc(doc(db, ...PATHS.MESSAGES, msg.id))));
            await logActivity(liveUser?.uid || "system", "MESSAGE_DELETE_THREAD", `Conversatie verwijderd: ${thread.id}, berichten: ${thread.messages.length}`);
            if (selectedThread?.id === thread.id)
                setSelectedThread(null);
            showSuccess(t('adminMessagesView.conversationDeleted'));
        }
        catch (err) {
            console.error(err);
            showError(t('adminMessagesView.deleteFailed') + err.message);
        }
    };
    const handleSaveConversation = (thread) => {
        if (!thread)
            return;
        const lines = [];
        lines.push(`${t('adminMessagesView.subject')}: ${thread.subject}`);
        lines.push(`${t('adminMessagesView.lastUpdate')}: ${format(thread.timestamp, "dd-MM-yyyy HH:mm")}`);
        lines.push(`${t('adminMessagesView.participants')}: ${Array.from(thread.participants).join(", ")}`);
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
            const sender = msg.senderName || msg.from || t('common.unknown');
            lines.push(`[${timeStr}] ${sender}:`);
            lines.push(msg.content);
            if (msg.attachmentUrl) {
                lines.push(`[${t('adminMessagesView.attachment')}: ${msg.attachmentMeta?.name || t('adminMessagesView.file')}]`);
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
            if (activeTab === "inbox" && m.archived)
                return;
            if (activeTab === "archived" && !m.archived)
                return;
            if (filterType === "crash" && m.type !== "SYSTEM_ERROR")
                return;
            // Normalize subject (remove RE:, FW:, etc.)
            const subject = (m.subject || t('adminMessagesView.noSubject')).replace(/^(RE:|FW:|FWD:)\s*/i, "").trim();
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
            if (!m.read && m.senderId !== liveUser?.uid) {
                group.hasUnread = true;
            }
            if (m.senderName && m.senderId !== liveUser?.uid) {
                group.participants.add(m.senderName);
            }
        });
        // Convert to array and sort by latest message
        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [messages, activeTab, filterType]);
    if (loading)
        return (_jsxs("div", { className: "h-full flex flex-col items-center justify-center bg-slate-50 gap-4", children: [_jsx(Loader2, { className: "animate-spin text-blue-600", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: t('adminMessagesView.syncingHub') })] }));
    if (error) {
        return (_jsxs("div", { className: "h-full flex flex-col items-center justify-center bg-slate-50 gap-4 p-8 text-center", children: [_jsx(AlertTriangle, { className: "text-red-500", size: 48 }), _jsx("h3", { className: "text-lg font-black text-slate-700 uppercase tracking-widest", children: t('common.errorLoading') }), _jsx("p", { className: "text-xs text-slate-500 font-mono bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-lg", children: error }), error.includes("index") && (_jsxs("div", { className: "bg-blue-50 text-blue-700 p-4 rounded-xl text-xs font-bold max-w-md border border-blue-100", children: [_jsx("p", { className: "uppercase tracking-widest mb-1", children: t('adminMessagesView.databaseIndexRequired') }), t('adminMessagesView.databaseIndexHelp')] }))] }));
    }
    return (_jsxs("div", { className: "flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden animate-in fade-in text-left", children: [_jsxs("div", { className: `w-full md:w-1/3 xl:w-1/4 border-r border-slate-200 flex flex-col bg-white ${selectedThread ? "hidden md:flex" : "flex"}`, children: [_jsxs("div", { className: "p-6 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-4", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("h2", { className: "text-xl font-black text-slate-900 uppercase italic tracking-tighter", children: t('common.messages') }), _jsx("button", { onClick: () => {
                                            setReplyContext(null);
                                            setIsComposeOpen(true);
                                        }, className: "p-2.5 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all active:scale-95", children: _jsx(Plus, { size: 20, strokeWidth: 3 }) })] }), isAdmin && (_jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => setFilterType('all'), className: `flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${filterType === 'all'
                                            ? 'bg-slate-800 text-white border-slate-800'
                                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`, children: [_jsx(MessageSquare, { size: 12 }), " ", t('common.all')] }), _jsxs("button", { onClick: () => setFilterType('crash'), className: `flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${filterType === 'crash'
                                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                            : 'bg-white text-red-400 border-red-100 hover:bg-red-50'}`, children: [_jsx(AlertTriangle, { size: 12 }), " ", t('adminMessagesView.crashes')] })] })), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-2xl", children: [_jsxs("button", { onClick: () => {
                                            setActiveTab("inbox");
                                            setSelectedThread(null);
                                        }, className: `flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === "inbox"
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-500"}`, children: [_jsx(Inbox, { size: 14 }), " ", t('adminMessagesView.inbox')] }), _jsxs("button", { onClick: () => {
                                            setActiveTab("archived");
                                            setSelectedThread(null);
                                        }, className: `flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === "archived"
                                            ? "bg-white text-slate-800 shadow-sm"
                                            : "text-slate-500"}`, children: [_jsx(Archive, { size: 14 }), " ", t('adminMessagesView.archive')] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto custom-scrollbar", children: threads.length === 0 ? (_jsxs("div", { className: "p-12 text-center flex flex-col items-center text-slate-300 opacity-40", children: [_jsx(Mail, { size: 48, strokeWidth: 1, className: "mb-4" }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest italic", children: t('adminMessagesView.noMessages') })] })) : (threads.map((thread) => {
                            const lastMsg = thread.lastMessage;
                            const isFromMe = lastMsg.senderId === liveUser?.uid;
                            const isUnread = thread.hasUnread;
                            const participants = Array.from(thread.participants).join(", ") || (isFromMe ? `${t('adminMessagesView.to')}: ${lastMsg.toName || lastMsg.to}` : t('common.unknown'));
                            return (_jsxs("div", { onClick: () => {
                                    setSelectedThread(thread);
                                    handleMarkAsRead(thread);
                                }, className: `p-6 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 group relative
                    ${isUnread ? "bg-blue-50/40" : ""}
                    ${lastMsg.type === 'SYSTEM_ERROR' ? "bg-red-50/30 hover:bg-red-50/50" : ""}
                    ${selectedThread?.id === thread.id
                                    ? "bg-blue-50 border-l-4 border-l-blue-600"
                                    : "border-l-4 border-l-transparent"}
                  `, children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsxs("span", { className: `text-[11px] uppercase italic tracking-tighter truncate max-w-[70%] ${isUnread
                                                    ? "font-black text-slate-900"
                                                    : "font-bold text-slate-500"}`, children: [participants, thread.messages.length > 1 && _jsxs("span", { className: "ml-1 text-slate-400", children: ["(", thread.messages.length, ")"] })] }), _jsx("span", { className: "text-[9px] font-bold text-slate-300 whitespace-nowrap ml-2", children: format(thread.timestamp, "HH:mm") })] }), _jsxs("h4", { className: `text-sm truncate mb-1 leading-none ${isUnread
                                            ? "font-black text-blue-700"
                                            : "font-bold text-slate-700"} ${lastMsg.type === 'SYSTEM_ERROR' ? "text-red-700" : ""}`, children: [lastMsg.type === 'SYSTEM_ERROR' && "🔥 ", thread.subject] }), _jsx("p", { className: "text-xs text-slate-400 line-clamp-1 font-medium italic", children: lastMsg.content }), isUnread && (_jsx("div", { className: "absolute top-6 right-3 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" }))] }, thread.id));
                        })) })] }), _jsx("div", { className: `flex-1 flex-col bg-slate-50 transition-all duration-500 ${!selectedThread ? "hidden md:flex" : "flex"}`, children: selectedThread ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "p-8 bg-white border-b border-slate-200 shadow-sm z-10 text-left", children: [_jsxs("div", { className: "flex justify-between items-start mb-6", children: [_jsx("button", { onClick: () => setSelectedThread(null), className: "md:hidden p-2 bg-slate-100 rounded-xl text-slate-400 mr-4", children: _jsx(X, { size: 20 }) }), _jsxs("div", { className: "flex-1 text-left", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("span", { className: "bg-slate-900 text-blue-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest italic border border-white/5 shadow-lg", children: t('adminMessagesView.conversation') }), selectedThread.lastMessage.priority === "urgent" && (_jsx("span", { className: "bg-rose-100 text-rose-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase animate-pulse border border-rose-200", children: t('adminMessagesView.urgent') })), selectedThread.lastMessage.type === "SYSTEM_ERROR" && (_jsx("span", { className: "bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase border border-red-700 shadow-sm", children: t('adminMessagesView.systemCrash') }))] }), _jsx("h2", { className: "text-3xl font-black text-slate-900 leading-tight italic tracking-tighter uppercase", children: selectedThread.subject })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => handleSaveConversation(selectedThread), className: "p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-[18px] border border-slate-100 transition-all shadow-sm", title: t('adminMessagesView.saveAsTextFile'), children: _jsx(Download, { size: 20 }) }), _jsx("button", { onClick: () => handleArchive(selectedThread), className: "p-3 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-[18px] border border-slate-100 transition-all shadow-sm", title: t('adminMessagesView.archiveAction'), children: _jsx(Archive, { size: 20 }) }), _jsx("button", { onClick: () => handleDelete(selectedThread), className: "p-3 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-[18px] border border-slate-100 transition-all shadow-sm", title: t('common.delete'), children: _jsx(Trash2, { size: 20 }) })] })] }), _jsxs("div", { className: "flex items-center justify-between p-4 bg-slate-50 rounded-[25px] border border-slate-100 shadow-inner", children: [_jsxs("div", { className: "flex items-center gap-4 text-left", children: [_jsx("div", { className: "w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-blue-600 shadow-sm border border-slate-100", children: _jsx(User, { size: 24 }) }), _jsxs("div", { className: "text-left", children: [_jsx("span", { className: "font-black text-slate-800 block text-sm uppercase italic leading-none mb-1", children: Array.from(selectedThread.participants).join(", ") || t('adminMessagesView.multiple') }), _jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest", children: t('adminMessagesView.messagesCount', { count: selectedThread.messages.length }) })] })] }), _jsxs("div", { className: "text-right flex flex-col gap-1 pr-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter", children: [_jsx(Clock, { size: 12, className: "text-blue-500" }), format(selectedThread.timestamp, "eeee dd MMMM", {
                                                            locale: nl,
                                                        })] }), _jsxs("span", { className: "text-[10px] font-bold text-slate-300 font-mono", children: [t('adminMessagesView.lastUpdate'), ": ", format(selectedThread.timestamp, "HH:mm")] })] })] })] }), _jsx("div", { className: "p-6 overflow-y-auto flex-1 text-left bg-slate-50/50", children: _jsxs("div", { className: "max-w-4xl mx-auto space-y-6", children: [selectedThread.messages.sort((a, b) => a.timestamp - b.timestamp).map((msg) => {
                                        const isMe = msg.senderId === liveUser?.uid;
                                        return (_jsx("div", { className: `flex flex-col ${isMe ? 'items-end' : 'items-start'}`, children: _jsxs("div", { className: `max-w-[85%] p-6 rounded-[24px] shadow-sm border ${isMe
                                                    ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none'
                                                    : 'bg-white text-slate-700 border-slate-100 rounded-tl-none'}`, children: [_jsxs("div", { className: "flex justify-between items-center mb-2 gap-4", children: [_jsx("span", { className: `text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-blue-200' : 'text-slate-400'}`, children: isMe ? t('adminMessagesView.me') : (msg.senderName || msg.from) }), _jsx("span", { className: `text-[9px] font-mono ${isMe ? 'text-blue-200' : 'text-slate-300'}`, children: format(msg.timestamp, "dd MMM HH:mm") })] }), msg.type === 'SYSTEM_ERROR' ? (_jsxs("div", { className: "space-y-3", children: [_jsx("pre", { className: "bg-black/20 p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap overflow-x-auto", children: msg.content }), (msg.data || msg.errorDetails || msg.stack) && (_jsxs("div", { className: "bg-red-50 border border-red-100 p-3 rounded-xl", children: [_jsx("p", { className: "text-[9px] font-black text-red-700 uppercase tracking-widest mb-2", children: t('adminMessagesView.technicalDetails') }), _jsx("pre", { className: "text-[9px] font-mono text-red-600 whitespace-pre-wrap overflow-x-auto", children: typeof (msg.data || msg.errorDetails || msg.stack) === 'object' ? JSON.stringify(msg.data || msg.errorDetails || msg.stack, null, 2) : (msg.data || msg.errorDetails || msg.stack) })] }))] })) : (_jsx("div", { className: "whitespace-pre-wrap text-sm font-medium leading-relaxed", children: msg.content })), msg.attachmentUrl && (_jsx("div", { className: "mt-3 pt-3 border-t border-white/10", children: _jsx("a", { href: msg.attachmentUrl, target: "_blank", rel: "noopener noreferrer", className: `flex items-center gap-2 text-xs font-bold underline ${isMe ? 'text-white' : 'text-blue-600'}`, children: t('adminMessagesView.openAttachment') }) }))] }) }, msg.id));
                                    }), selectedThread.lastMessage.type === "validation_alert" && (_jsxs("div", { className: "mt-8 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[24px] flex flex-col md:flex-row items-center gap-6 shadow-sm mx-auto max-w-2xl", children: [_jsx("div", { className: "bg-white p-3 rounded-full shadow-md text-emerald-500", children: _jsx(CheckCircle, { size: 24 }) }), _jsxs("div", { className: "text-left flex-1", children: [_jsx("h4", { className: "font-black text-emerald-900 text-sm uppercase italic tracking-tighter", children: t('adminMessagesView.validationRequest') }), _jsx("p", { className: "text-xs text-emerald-700/80 font-bold mt-1", children: t('adminMessagesView.validationRequestHelp') })] }), _jsxs("button", { onClick: () => window.location.href = "/admin/products", className: "bg-emerald-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 shrink-0", children: [t('adminMessagesView.toCatalog'), " ", _jsx(ChevronRight, { size: 14 })] })] }))] }) }), _jsxs("div", { className: "p-8 bg-white border-t border-slate-100 flex justify-between items-center shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(ShieldCheck, { size: 18, className: "text-emerald-500" }), _jsx("span", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest", children: t('adminMessagesView.secureHubSync') })] }), _jsxs("button", { onClick: () => {
                                        // Simpele reply mock
                                        setReplyContext(selectedThread.lastMessage);
                                        setIsComposeOpen(true);
                                    }, className: "px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center gap-3 active:scale-95", children: [_jsx(Reply, { size: 18 }), " ", t('adminMessagesView.reply')] })] })] })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center text-slate-300 p-20 text-center opacity-40", children: [_jsx("div", { className: "bg-white p-10 rounded-[60px] shadow-inner mb-8 border border-slate-200/50", children: _jsx(Mail, { size: 100, strokeWidth: 1, className: "text-slate-200" }) }), _jsx("h3", { className: "text-2xl font-black text-slate-400 uppercase italic tracking-tighter mb-2", children: t('adminMessagesView.communicationHub') }), _jsx("p", { className: "text-xs font-bold uppercase tracking-widest max-w-xs leading-relaxed text-slate-400", children: t('adminMessagesView.selectConversationHint') })] })) }), isComposeOpen && (_jsx(ComposeModal, { onClose: () => setIsComposeOpen(false), user: user, replyTo: replyContext }))] }));
};
/**
 * SUB-COMPONENT: ComposeModal
 * Wordt binnen hetzelfde bestand gedefinieerd voor stabiliteit.
 */
const ComposeModal = ({ onClose, user, replyTo }) => {
    const { t } = useTranslation();
    const { showSuccess, showError } = useNotifications();
    const [formData, setFormData] = useState({
        to: replyTo?.from || "admin",
        subject: replyTo ? (replyTo.subject.startsWith("RE:") ? replyTo.subject : `RE: ${replyTo.subject}`) : "",
        content: `\n\n${t('adminMessagesView.kindRegards')}\n${user?.name || user?.displayName || user?.email || t('common.employee')}`,
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
                }
                catch (e) {
                    console.error("Fout bij ophalen handtekening:", e);
                }
            }
        };
        fetchData();
    }, [user]);
    useEffect(() => {
        if (customSignature) {
            setFormData(prev => {
                const defaultSig = `\n\n${t('adminMessagesView.kindRegards')}\n${user?.name || user?.displayName || user?.email || t('adminMessagesView.userFallback')}`;
                if (!prev.content || prev.content.trim() === defaultSig.trim() || prev.content.trim() === "") {
                    return { ...prev, content: `\n\n${customSignature}` };
                }
                return prev;
            });
        }
    }, [customSignature, user, t]);
    const handleInsertQuote = () => {
        if (!replyTo)
            return;
        const quote = `\n\n> ${t('adminMessagesView.onDate')} ${new Date(replyTo.timestamp).toLocaleString()} ${t('adminMessagesView.wrote')} ${replyTo.senderName || t('common.employee')}:\n> ${(replyTo.content || "").replace(/\n/g, "\n> ")}`;
        setFormData(prev => ({ ...prev, content: prev.content + quote }));
    };
    const handleSend = async (e) => {
        e.preventDefault();
        if (!formData.subject || !formData.content)
            return;
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
            await logActivity(user?.uid || "system", "MESSAGE_SEND", `Bericht verzonden aan ${formData.to} met onderwerp '${formData.subject}'`);
            showSuccess(t('adminMessagesView.messageSent'));
            onClose();
        }
        catch (err) {
            showError(t('adminMessagesView.sendFailed') + err.message);
        }
        finally {
            setSending(false);
        }
    };
    // Preview tonen voor afbeeldingen
    useEffect(() => {
        if (attachment && attachment.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => setAttachmentPreview(e.target.result);
            reader.readAsDataURL(attachment);
        }
        else {
            setAttachmentPreview(null);
        }
    }, [attachment]);
    return (_jsx("div", { className: "fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300", children: _jsxs("div", { className: "bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 flex flex-col", children: [_jsxs("div", { className: "p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('common.new'), " ", _jsx("span", { className: "text-blue-600", children: t('common.messages') })] }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic", children: t('adminMessagesView.internalCommunication') })] }), _jsx("button", { onClick: onClose, className: "p-3 hover:bg-white rounded-2xl transition-all shadow-sm group border border-transparent hover:border-slate-100", children: _jsx(X, { size: 20, className: "text-slate-400 group-hover:text-slate-900" }) })] }), _jsxs("form", { onSubmit: handleSend, className: "p-10 space-y-6 text-left", children: [_jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: t('adminMessagesView.recipient') }), _jsxs("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm appearance-none cursor-pointer", value: formData.to, onChange: (e) => setFormData({ ...formData, to: e.target.value }), children: [_jsx("option", { value: "admin", children: t('adminMessagesView.adminGroup') }), userList
                                                    .filter((u) => u.email !== user?.email)
                                                    .map((u) => (_jsxs("option", { value: u.email, children: [u.name || u.email, " (", u.role, ")"] }, u.id)))] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: t('adminMessagesView.priority') }), _jsxs("select", { className: `w-full p-4 border-2 rounded-2xl font-black outline-none transition-all text-sm appearance-none cursor-pointer ${formData.priority === "urgent"
                                                ? "bg-rose-50 border-rose-100 text-rose-600"
                                                : "bg-slate-50 border-slate-100 text-slate-700"}`, value: formData.priority, onChange: (e) => setFormData({ ...formData, priority: e.target.value }), children: [_jsx("option", { value: "normal", children: t('adminMessagesView.priorityNormal') }), _jsx("option", { value: "urgent", children: t('adminMessagesView.priorityUrgentAction') })] })] })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: t('adminMessagesView.subject') }), _jsx("input", { required: true, className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 focus:bg-white transition-all text-sm", placeholder: t('adminMessagesView.subjectPlaceholder'), value: formData.subject, onChange: (e) => setFormData({ ...formData, subject: e.target.value }) })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: t('adminMessagesView.content') }), replyTo && (_jsxs("button", { type: "button", onClick: handleInsertQuote, className: "text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1", children: [_jsx(Quote, { size: 12 }), " ", t('adminMessagesView.quotePreviousMessage')] }))] }), _jsx("textarea", { required: true, rows: 5, className: "w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-medium outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-inner resize-none italic", placeholder: t('adminMessagesView.contentPlaceholder'), value: formData.content, onChange: (e) => setFormData({ ...formData, content: e.target.value }) })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: t('adminMessagesView.attachmentLabel') }), _jsx("input", { type: "file", accept: "image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,.txt,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx", className: "w-full p-2 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium outline-none focus:border-blue-500 transition-all text-xs", onChange: e => setAttachment(e.target.files[0]) }), attachmentPreview && (_jsx("img", { src: attachmentPreview, alt: t('adminMessagesView.preview'), className: "mt-2 max-h-40 rounded-xl border border-slate-200 shadow" })), attachment && !attachmentPreview && (_jsxs("div", { className: "mt-2 text-xs text-slate-500", children: [t('adminMessagesView.fileSelected'), ": ", attachment.name] })), sending && attachment && (_jsxs("div", { className: "mt-3", children: [_jsxs("div", { className: "flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1", children: [_jsx("span", { children: t('adminMessagesView.uploading') }), _jsxs("span", { children: [Math.round(uploadProgress), "%"] })] }), _jsx("div", { className: "w-full bg-slate-100 rounded-full h-2 overflow-hidden", children: _jsx("div", { className: "bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out", style: { width: `${uploadProgress}%` } }) })] }))] }), _jsx("div", { className: "flex justify-end mt-1", children: _jsxs("a", { href: "/profile", className: "text-[9px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1.5 transition-colors", children: [_jsx(Edit3, { size: 10 }), " ", t('adminMessagesView.editSignatureInProfile')] }) }), _jsxs("div", { className: "pt-6 border-t border-slate-100 flex justify-end gap-4", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-8 py-4 rounded-2xl font-black text-slate-400 hover:text-slate-600 transition-all text-[10px] uppercase tracking-widest", children: t('common.cancel') }), _jsxs("button", { type: "submit", disabled: sending, className: "px-12 py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3", children: [sending ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(Send, { size: 16 })), " ", t('adminMessagesView.sendToHub')] })] })] })] }) }));
};
export default AdminMessagesView;
