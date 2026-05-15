import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Database, RefreshCw, Trash2, Layers, Table, SearchCode, Fingerprint, Activity, Terminal, FileText, Loader2, Folder, File, ArrowUp, Bot, Send, X } from "lucide-react";
import { db, storage, auth, logActivity } from "../../config/firebase";
import { collection, getDocs, doc, deleteDoc, query, limit, getDoc, } from "firebase/firestore";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { aiService } from "../../services/aiService";
import { useNotifications } from '../../contexts/NotificationContext';
/**
 * AdminDatabaseView V4.1 - Root-Ready Forensic Edition
 * Gebruikt PATHS uit dbPaths.js om data te valideren in de /future-factory/ root.
 * Bevat een 'Crawl' functie om door legacy collecties te zoeken.
 * Inclusief Storage viewer.
 */
const AdminDatabaseView = () => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [selectedKey, setSelectedKey] = useState("PRODUCTS");
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activePath, setActivePath] = useState("");
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, doc: null });
    const contextMenuRef = useRef();
    // Close context menu on click outside or escape
    useEffect(() => {
        if (!contextMenu.visible)
            return;
        const handleClick = (e) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
                setContextMenu({ ...contextMenu, visible: false });
            }
        };
        const handleEsc = (e) => {
            if (e.key === "Escape")
                setContextMenu({ ...contextMenu, visible: false });
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleEsc);
        };
    }, [contextMenu]);
    // Lijst van modules gebaseerd op dbPaths.js
    const MODULES = [
        { key: "PRODUCTS", label: t('adminDatabaseView.modules.products'), icon: _jsx(Layers, { size: 16 }) },
        {
            key: "PLANNING",
            label: t('adminDatabaseView.modules.planning'),
            icon: _jsx(Activity, { size: 16 }),
        },
        { key: "TRACKING", label: t('adminDatabaseView.modules.tracking'), icon: _jsx(SearchCode, { size: 16 }) },
        {
            key: "USERS",
            label: t('adminDatabaseView.modules.users'),
            icon: _jsx(Fingerprint, { size: 16 }),
        },
        {
            key: "GENERAL_SETTINGS",
            label: t('adminDatabaseView.modules.generalSettings'),
            icon: _jsx(Terminal, { size: 16 }),
        },
        {
            key: "BORE_DIMENSIONS",
            label: t('adminDatabaseView.modules.boreDimensions'),
            icon: _jsx(Table, { size: 16 }),
        },
        {
            key: "CB_DIMENSIONS",
            label: t('adminDatabaseView.modules.cbDimensions'),
            icon: _jsx(Database, { size: 16 }),
        },
        {
            key: "TB_DIMENSIONS",
            label: t('adminDatabaseView.modules.tbDimensions'),
            icon: _jsx(Database, { size: 16 }),
        },
    ];
    const [viewMode, setViewMode] = useState("database"); // "database" of "storage"
    const [storageFiles, setStorageFiles] = useState([]);
    const [storageLoading, setStorageLoading] = useState(false);
    const [storagePath, setStoragePath] = useState("");
    // AI Chat State
    const [showAiChat, setShowAiChat] = useState(false);
    const [aiQuery, setAiQuery] = useState("");
    const [aiMessages, setAiMessages] = useState(() => {
        const saved = localStorage.getItem("admin_db_ai_chat");
        return saved ? JSON.parse(saved) : [{ role: 'ai', content: "Hallo! Ik ben de Database Assistent. Ik heb toegang tot de volledige structuur van de database. Wat wil je weten?" }];
    });
    const [aiLoading, setAiLoading] = useState(false);
    const chatEndRef = useRef(null);
    useEffect(() => {
        if (showAiChat) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [aiMessages, showAiChat]);
    useEffect(() => {
        localStorage.setItem("admin_db_ai_chat", JSON.stringify(aiMessages));
    }, [aiMessages]);
    const generateDbContext = () => {
        let context = "Je bent een Database Architect en Expert voor het Future Factory MES systeem. Je hebt volledige kennis van de Firestore database structuur.\n\nHIER IS DE DATABASE STRUCTUUR (PATHS):\n";
        Object.entries(PATHS).forEach(([key, path]) => {
            if (Array.isArray(path)) {
                context += `- ${key}: /${path.join("/")}\n`;
            }
        });
        context += "\nINSTRUCTIES:\n1. Gebruik deze paden om uit te leggen waar specifieke data wordt opgeslagen.\n2. Als een gebruiker vraagt 'waar staan de producten?', antwoord dan met het pad voor PRODUCTS.\n3. Geef technisch advies over query-structuur indien gevraagd.\n4. Antwoord altijd in het Nederlands.\n5. Wees beknopt en professioneel.";
        return context;
    };
    const handleAskAi = async (e) => {
        e.preventDefault();
        if (!aiQuery.trim())
            return;
        const userQ = aiQuery;
        setAiMessages(prev => [...prev, { role: 'user', content: userQ }]);
        setAiQuery("");
        setAiLoading(true);
        try {
            const systemPrompt = generateDbContext();
            const response = await aiService.chat([{ role: "user", content: userQ }], systemPrompt);
            setAiMessages(prev => [...prev, { role: 'ai', content: response }]);
        }
        catch {
            setAiMessages(prev => [...prev, { role: 'ai', content: "Fout bij verbinden met AI service." }]);
        }
        finally {
            setAiLoading(false);
        }
    };
    const handleClearChat = () => {
        if (window.confirm("Gespreksgeschiedenis wissen?")) {
            const initial = [{ role: 'ai', content: "Hallo! Ik ben de Database Assistent. Ik heb toegang tot de volledige structuur van de database. Wat wil je weten?" }];
            setAiMessages(initial);
        }
    };
    // 2. PRIMARY FETCH (Gebruikt dbPaths.js)
    const fetchPathData = async () => {
        if (!isValidPath(selectedKey))
            return;
        setLoading(true);
        setDocuments([]);
        const pathArray = PATHS[selectedKey];
        const pathStr = pathArray.join("/");
        setActivePath(pathStr);
        try {
            // Als pad-lengte even is, is het een document. Als het oneven is, een collectie.
            if (pathArray.length % 2 !== 0) {
                const colRef = collection(db, ...pathArray);
                const snapshot = await getDocs(query(colRef, limit(50)));
                setDocuments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            }
            else {
                // Het is een document (bijv. settings/main)
                const docRef = doc(db, ...pathArray);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setDocuments([{ id: snap.id, ...snap.data(), _isSingleDoc: true }]);
                }
            }
        }
        catch (e) {
            console.error("Fetch error:", e);
        }
        finally {
            setLoading(false);
        }
    };
    // Ophalen van bestanden uit een submap van de storage bucket
    const fetchStorageFiles = async (path = "") => {
        setStorageLoading(true);
        setStorageFiles([]);
        try {
            const rootRef = ref(storage, path);
            const res = await listAll(rootRef);
            // Combineer folders en bestanden
            const folders = res.prefixes.map((folderRef) => ({
                name: folderRef.name,
                isFolder: true,
                fullPath: folderRef.fullPath,
            }));
            const files = await Promise.all(res.items.map(async (itemRef) => {
                const url = await getDownloadURL(itemRef);
                return { name: itemRef.name, url, isFolder: false };
            }));
            setStorageFiles([...folders, ...files]);
        }
        catch (e) {
            console.error("Storage fetch error:", e);
            setStorageFiles([]);
        }
        finally {
            setStorageLoading(false);
        }
    };
    useEffect(() => {
        fetchPathData();
    }, [selectedKey]);
    useEffect(() => {
        if (viewMode === "storage") {
            fetchStorageFiles(storagePath);
        }
    }, [viewMode, storagePath]);
    const handleDeleteDoc = async (docId) => {
        if (!window.confirm(t('common.confirmDeleteDoc')))
            return;
        try {
            const docRef = doc(db, ...activePath.split("/"), docId);
            await deleteDoc(docRef);
            await logActivity(auth.currentUser?.uid, "DATABASE_DOC_DELETE", `Document verwijderd via AdminDatabaseView: ${activePath}/${docId}`);
            setDocuments((prev) => prev.filter((d) => d.id !== docId));
        }
        catch (error) {
            notify(t('common.deleteFailed') + ': ' + error.message);
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in text-left", children: [_jsxs("div", { className: "h-14 bg-white border-b border-slate-200 flex justify-between items-center px-4 shrink-0 z-20 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100", children: _jsx(Database, { size: 18 }) }), _jsx("h2", { className: "text-sm font-bold text-slate-800", children: "Database Explorer" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setShowAiChat(!showAiChat), className: `p-2 rounded-lg transition-colors border border-transparent ${showAiChat ? 'bg-purple-100 text-purple-600 border-purple-200' : 'hover:bg-slate-100 text-slate-500 hover:text-purple-600'}`, title: "AI Database Assistent", children: _jsx(Bot, { size: 18 }) }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-lg border border-slate-200", children: [_jsx("button", { onClick: () => setViewMode("database"), className: `px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === "database"
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"}`, children: t('adminDatabaseView.database') }), _jsx("button", { onClick: () => setViewMode("storage"), className: `px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === "storage"
                                            ? "bg-white text-blue-600 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"}`, children: t('common.storage') })] }), _jsx("button", { onClick: () => (viewMode === "database" ? fetchPathData() : fetchStorageFiles(storagePath)), className: "p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200", children: _jsx(RefreshCw, { size: 16, className: (viewMode === "database" ? loading : storageLoading) ? "animate-spin text-blue-600" : "" }) })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden relative", children: [_jsxs("div", { className: "w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto py-4", children: [_jsx("div", { className: "px-4 mb-2", children: _jsx("h3", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest", children: t('common.modules') }) }), _jsx("div", { className: "space-y-0.5 px-2", children: MODULES.map((mod) => (_jsxs("button", { onClick: () => setSelectedKey(mod.key), className: `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${selectedKey === mod.key
                                        ? "bg-blue-50 text-blue-700 border border-blue-100"
                                        : "text-slate-600 hover:bg-slate-50 border border-transparent"}`, children: [mod.icon, mod.label] }, mod.key))) })] }), _jsxs("div", { className: "flex-1 flex flex-col bg-slate-50 overflow-hidden", children: [viewMode === "database" && (_jsxs("div", { className: "flex-1 flex flex-col h-full", children: [_jsxs("div", { className: "h-10 bg-white border-b border-slate-200 flex items-center px-4 gap-2", children: [_jsx("span", { className: "text-slate-400", children: _jsx(Terminal, { size: 14 }) }), _jsxs("div", { className: "flex-1 flex items-center text-xs text-slate-600 font-mono", children: [_jsx("span", { className: "text-slate-300 mr-1", children: "/" }), activePath
                                                        ? activePath.split("/").map((seg, idx, arr) => (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: idx === arr.length - 1 ? "text-slate-900 font-bold" : "hover:text-blue-600 cursor-pointer", children: seg }), idx < arr.length - 1 && _jsx("span", { className: "text-slate-300 font-bold", children: "/" })] }, idx)))
                                                        : _jsx("span", { className: "text-slate-500", children: t('common.selectModule') })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 custom-scrollbar", children: loading ? (_jsxs("div", { className: "h-full flex flex-col items-center justify-center opacity-60", children: [_jsx(Loader2, { className: "animate-spin text-blue-600 mb-4", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 italic animate-pulse", children: t('common.syncing') })] })) : documents.length === 0 ? (_jsxs("div", { className: "h-full flex flex-col items-center justify-center py-20 text-center opacity-40", children: [_jsx("div", { className: "p-10 bg-slate-100 rounded-full mb-6 border-2 border-dashed border-slate-200", children: _jsx(Database, { size: 60, className: "text-slate-400" }) }), _jsx("h4", { className: "text-2xl font-black uppercase italic tracking-tighter text-slate-700 mb-2", children: t('common.pathEmpty') }), _jsx("p", { className: "text-xs font-medium text-slate-500 max-w-sm mx-auto", children: t('common.noDocuments') })] })) : (_jsxs("div", { className: "w-full pb-40", children: [_jsxs("div", { className: "flex items-center px-4 py-2 bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest rounded-t-lg", children: [_jsx("div", { className: "w-12" }), _jsx("div", { className: "flex-1", children: t('common.documentId') }), _jsx("div", { className: "w-32 text-right", children: t('common.actions') })] }), _jsx("div", { className: "divide-y divide-slate-100 border-x border-b border-slate-200 bg-white rounded-b-lg", children: documents.map((docItem) => (_jsxs("div", { className: "flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer relative", onClick: () => setSelectedDoc(docItem), onContextMenu: e => {
                                                            e.preventDefault();
                                                            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, doc: docItem });
                                                        }, children: [_jsx("div", { className: "w-12 flex items-center justify-start", children: _jsx(FileText, { size: 16, className: "text-blue-500" }) }), _jsx("div", { className: "flex-1 font-mono text-xs text-slate-700 truncate", children: docItem.id }), _jsx("div", { className: "w-32 flex items-center justify-end gap-2", children: _jsx("button", { onClick: e => { e.stopPropagation(); handleDeleteDoc(docItem.id); }, className: "p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all", title: t('common.delete'), children: _jsx(Trash2, { size: 14 }) }) })] }, docItem.id))) })] })) })] })), viewMode === "storage" && (_jsxs("div", { className: "flex-1 flex flex-col h-full", children: [_jsxs("div", { className: "h-10 bg-white border-b border-slate-200 flex items-center px-4 gap-2", children: [_jsx("span", { className: "text-slate-400", children: _jsx(Database, { size: 14 }) }), _jsxs("div", { className: "flex-1 flex items-center text-xs text-slate-600 font-mono", children: [_jsx("span", { className: "text-slate-300 mr-1", children: "/" }), storagePath
                                                        ? storagePath.split("/").map((seg, idx, arr) => (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: idx === arr.length - 1 ? "text-slate-900 font-bold" : "hover:text-blue-600 cursor-pointer", onClick: () => {
                                                                        setStoragePath(arr.slice(0, idx + 1).join("/"));
                                                                    }, children: seg }), idx < arr.length - 1 && _jsx("span", { className: "text-slate-300 font-bold", children: "/" })] }, idx)))
                                                        : _jsx("span", { className: "text-slate-500", children: t('common.root') })] }), storagePath && (_jsx("button", { className: "ml-2 text-blue-600 hover:text-blue-800", onClick: () => setStoragePath(storagePath.split("/").slice(0, -1).join("/")), children: _jsx(ArrowUp, { size: 16 }) }))] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 custom-scrollbar", children: storageLoading ? (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center opacity-60", children: [_jsx(Loader2, { className: "animate-spin text-blue-600 mb-4", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 italic animate-pulse", children: t('common.loading') })] })) : storageFiles.length === 0 ? (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center py-20 text-center opacity-40", children: [_jsx("div", { className: "p-10 bg-slate-100 rounded-full mb-6 border-2 border-dashed border-slate-200", children: _jsx(Database, { size: 60, className: "text-slate-400" }) }), _jsx("h4", { className: "text-2xl font-black uppercase italic tracking-tighter text-slate-700 mb-2", children: t('common.noFilesFound') }), _jsx("p", { className: "text-xs font-medium text-slate-500 max-w-sm mx-auto", children: t('common.noFilesInRoot') })] })) : (_jsxs("div", { className: "w-full", children: [_jsxs("div", { className: "flex items-center px-4 py-2 bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest rounded-t-lg", children: [_jsx("div", { className: "flex-1", children: t('common.filename') }), _jsx("div", { className: "w-32 text-right", children: t('common.actions') })] }), _jsx("div", { className: "divide-y divide-slate-100 border-x border-b border-slate-200 bg-white rounded-b-lg", children: storageFiles.map((file) => file.isFolder ? (_jsxs("div", { className: "flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer", onClick: () => setStoragePath(file.fullPath), children: [_jsxs("div", { className: "flex-1 font-mono text-xs text-slate-700 truncate flex items-center gap-2", children: [_jsx(Folder, { size: 16, className: "text-yellow-500 fill-yellow-500" }), _jsxs("b", { children: [file.name, "/"] })] }), _jsx("div", { className: "w-32 flex items-center justify-end gap-2 text-xs text-slate-500", children: t('common.folder') })] }, file.fullPath)) : (_jsxs("div", { className: "flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer", children: [_jsxs("div", { className: "flex-1 font-mono text-xs text-slate-600 truncate flex items-center gap-2", children: [_jsx(File, { size: 16, className: "text-slate-400" }), file.name] }), _jsx("div", { className: "w-32 flex items-center justify-end gap-2", children: _jsx("a", { href: file.url, target: "_blank", rel: "noopener noreferrer", className: "p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all", title: t('common.download'), children: _jsx(FileText, { size: 14 }) }) })] }, file.name))) })] })) })] })), showAiChat && (_jsxs("div", { className: "w-96 bg-white border-l border-slate-200 flex flex-col shadow-xl z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right duration-300", children: [_jsxs("div", { className: "p-4 border-b border-slate-100 flex justify-between items-center bg-purple-50/50", children: [_jsxs("div", { className: "flex items-center gap-2 text-purple-700 font-black uppercase text-xs tracking-widest", children: [_jsx(Bot, { size: 16 }), " Database AI"] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: handleClearChat, className: "p-1 hover:bg-white rounded-lg text-slate-400 hover:text-rose-500 transition-colors", title: "Gesprek wissen", children: _jsx(Trash2, { size: 14 }) }), _jsx("button", { onClick: () => setShowAiChat(false), className: "p-1 hover:bg-white rounded-lg text-slate-400 transition-colors", children: _jsx(X, { size: 16 }) })] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar", children: [aiMessages.map((msg, idx) => (_jsx("div", { className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: `max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${msg.role === 'user'
                                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                                        : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`, children: msg.content }) }, idx))), aiLoading && (_jsx("div", { className: "flex justify-start", children: _jsx("div", { className: "bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm", children: _jsx(Loader2, { size: 16, className: "animate-spin text-purple-500" }) }) })), _jsx("div", { ref: chatEndRef })] }), _jsx("form", { onSubmit: handleAskAi, className: "p-4 border-t border-slate-100 bg-white", children: _jsxs("div", { className: "relative", children: [_jsx("input", { className: "w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition-all", placeholder: "Vraag over collecties of paden...", value: aiQuery, onChange: e => setAiQuery(e.target.value) }), _jsx("button", { type: "submit", disabled: aiLoading || !aiQuery.trim(), className: "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors", children: _jsx(Send, { size: 14 }) })] }) })] }))] })] }), contextMenu.visible && (_jsxs("div", { ref: contextMenuRef, className: "fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[180px] py-2 text-sm text-slate-700 animate-in fade-in", style: { left: contextMenu.x, top: contextMenu.y }, children: [_jsxs("button", { className: "w-full text-left px-4 py-2 hover:bg-slate-50 transition-all", onClick: () => {
                            setSelectedDoc(contextMenu.doc);
                            setContextMenu({ ...contextMenu, visible: false });
                        }, children: ["\uD83D\uDCC4 ", t('common.view')] }), _jsxs("button", { className: "w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 transition-all", onClick: () => {
                            handleDeleteDoc(contextMenu.doc.id);
                            setContextMenu({ ...contextMenu, visible: false });
                        }, children: ["\uD83D\uDDD1\uFE0F ", t('common.delete')] }), _jsxs("button", { className: "w-full text-left px-4 py-2 hover:bg-slate-50 transition-all", onClick: () => {
                            fetchPathData();
                            setContextMenu({ ...contextMenu, visible: false });
                        }, children: ["\uD83D\uDD04 ", t('common.refresh')] })] })), selectedDoc && (_jsx("div", { className: "fixed inset-0 bg-black/60 z-50 flex items-center justify-center", children: _jsxs("div", { className: "bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-8 relative animate-in fade-in zoom-in", children: [_jsx("button", { onClick: () => setSelectedDoc(null), className: "absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500", title: t('common.close'), children: "\u00D7" }), _jsxs("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: [t('common.document'), " ", _jsx("span", { className: "text-blue-600 font-mono", children: selectedDoc.id })] }), _jsx("pre", { className: "text-xs font-mono text-slate-700 bg-slate-50 p-4 rounded-xl max-h-[60vh] overflow-y-auto border border-slate-200", children: JSON.stringify(selectedDoc, (key, value) => key.startsWith("_") ? undefined : value, 2) })] }) }))] }));
};
export default AdminDatabaseView;
