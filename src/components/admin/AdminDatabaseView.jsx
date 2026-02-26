import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Database, RefreshCw, Trash2, Layers, Table, SearchCode, Fingerprint, Activity, Terminal, FileText, ShieldCheck, Loader2 } from "lucide-react";
import { db, storage } from "../../config/firebase";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  limit,
  getDoc,
} from "firebase/firestore";
import { PATHS, isValidPath } from "../../config/dbPaths";
import { ref, listAll, getDownloadURL } from "firebase/storage";

/**
 * AdminDatabaseView V4.1 - Root-Ready Forensic Edition
 * Gebruikt PATHS uit dbPaths.js om data te valideren in de /future-factory/ root.
 * Bevat een 'Crawl' functie om door legacy collecties te zoeken.
 * Inclusief Storage viewer.
 */
const AdminDatabaseView = () => {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState("PRODUCTS");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePath, setActivePath] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, doc: null });
  const contextMenuRef = useRef();

  // Close context menu on click outside or escape
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setContextMenu({ ...contextMenu, visible: false });
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
    { key: "PRODUCTS", label: t('adminDatabaseView.modules.products'), icon: <Layers size={18} /> },
    {
      key: "PLANNING",
      label: t('adminDatabaseView.modules.planning'),
      icon: <Activity size={18} />,
    },
    { key: "TRACKING", label: t('adminDatabaseView.modules.tracking'), icon: <SearchCode size={18} /> },
    {
      key: "USERS",
      label: t('adminDatabaseView.modules.users'),
      icon: <Fingerprint size={18} />,
    },
    {
      key: "GENERAL_SETTINGS",
      label: t('adminDatabaseView.modules.generalSettings'),
      icon: <Terminal size={18} />,
    },
    {
      key: "BORE_DIMENSIONS",
      label: t('adminDatabaseView.modules.boreDimensions'),
      icon: <Table size={18} />,
    },
    {
      key: "CB_DIMENSIONS",
      label: t('adminDatabaseView.modules.cbDimensions'),
      icon: <Database size={18} />,
    },
    {
      key: "TB_DIMENSIONS",
      label: t('adminDatabaseView.modules.tbDimensions'),
      icon: <Database size={18} />,
    },
  ];

  const [viewMode, setViewMode] = useState("database"); // "database" of "storage"
  const [storageFiles, setStorageFiles] = useState([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storagePath, setStoragePath] = useState("");

  // 2. PRIMARY FETCH (Gebruikt dbPaths.js)
  const fetchPathData = async () => {
    if (!isValidPath(selectedKey)) return;

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
      } else {
        // Het is een document (bijv. settings/main)
        const docRef = doc(db, ...pathArray);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setDocuments([{ id: snap.id, ...snap.data(), _isSingleDoc: true }]);
        }
      }
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
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
      const files = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          return { name: itemRef.name, url, isFolder: false };
        })
      );
      setStorageFiles([...folders, ...files]);
    } catch (e) {
      console.error("Storage fetch error:", e);
      setStorageFiles([]);
    } finally {
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
    if (!window.confirm(t('common.confirmDeleteDoc'))) return;
    try {
      const docRef = doc(db, ...activePath.split("/"), docId);
      await deleteDoc(docRef);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (error) {
      alert(t('common.deleteFailed') + ': ' + error.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-hidden animate-in fade-in text-left">
      {/* HEADER */}
      <div className="p-6 bg-slate-900 border-b border-white/10 flex justify-between items-center shrink-0 z-10 shadow-2xl">
        <div className="flex items-center gap-5">
          <div className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-xl rotate-2">
            <Database size={28} />
          </div>
          <div className="text-left">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
              {t('adminDatabaseView.title').split(' ')[0]} <span className="text-blue-500">{t('adminDatabaseView.title').split(' ')[1]}</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] mt-2">
              {t('adminDatabaseView.subtitle')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-800 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setViewMode("database")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                viewMode === "database"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t('adminDatabaseView.database')}
            </button>
            <button
              onClick={() => setViewMode("storage")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                viewMode === "storage"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t('common.storage')}
            </button>
          </div>
          <button
            onClick={() => (viewMode === "database" ? fetchPathData() : fetchStorageFiles(storagePath))}
            className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10 active:scale-95"
          >
            <RefreshCw
              size={20}
              className={(viewMode === "database" ? loading : storageLoading) ? "animate-spin text-blue-400" : "text-slate-400"}
            />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-80 border-r border-white/10 bg-slate-950 flex flex-col p-6 gap-6 overflow-y-auto custom-scrollbar shadow-2xl z-20">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-4 px-2">
              <Terminal size={12} className="text-blue-500" />
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                {t('common.validatedFolders')}
              </h3>
            </div>

            {MODULES.map((mod) => (
              <button
                key={mod.key}
                onClick={() => setSelectedKey(mod.key)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left border-2 group ${
                  selectedKey === mod.key
                    ? "bg-blue-600/10 border-blue-500 shadow-lg"
                    : "bg-white/5 border-transparent hover:bg-white/10 text-slate-400"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    selectedKey === mod.key
                      ? "bg-blue-500 text-white"
                      : "bg-slate-900 text-slate-600"
                  }`}
                >
                  {mod.icon}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span
                    className={`text-xs font-black uppercase italic tracking-tight ${
                      selectedKey === mod.key ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {mod.label}
                  </span>
                  <span className="text-[8px] font-mono text-slate-600 truncate uppercase">
                    {mod.key}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto p-6 bg-slate-900 rounded-[30px] border border-white/5 relative overflow-hidden shadow-inner">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">
              {t('common.currentPath')}
            </p>
            <code className="text-[10px] font-mono text-emerald-400 break-all leading-relaxed block bg-black/40 p-3 rounded-xl border border-white/5">
              /{activePath || t('common.selectModule')}
            </code>
          </div>
        </div>

        {/* DATA CONTENT */}
        <div className="flex-1 flex flex-col bg-slate-900 relative overflow-hidden">
          {viewMode === "database" && (
            <div className="flex-1 flex flex-col h-full">
              {/* Breadcrumbs */}
              <div className="px-8 pt-6 pb-2">
                <nav className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="text-blue-400 font-bold">/</span>
                  {activePath
                    ? activePath.split("/").map((seg, idx, arr) => (
                      <span key={idx} className="flex items-center gap-2">
                        <span
                          className={idx === arr.length - 1 ? "text-white font-bold" : "hover:text-blue-400 cursor-pointer"}
                        >
                          {seg}
                        </span>
                        {idx < arr.length - 1 && <span className="text-blue-400 font-bold">/</span>}
                      </span>
                    ))
                    : <span className="text-slate-500">{t('common.selectModule')}</span>}
                </nav>
              </div>

              {/* LIST */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-60">
                    <Loader2
                      className="animate-spin text-blue-400 mb-4"
                      size={40}
                    />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 italic animate-pulse">
                      {t('common.syncing')}
                    </p>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <div className="p-10 bg-white/5 rounded-full mb-6 border-2 border-dashed border-white/10">
                      <Database size={60} className="text-slate-600" />
                    </div>
                    <h4 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-2">
                      {t('common.pathEmpty')}
                    </h4>
                    <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                      {t('common.noDocuments')}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto pb-40">
                    <div className="flex items-center justify-between px-6 py-4 bg-white/5 rounded-t-2xl border border-white/10 mb-0">
                      <div className="flex items-center gap-3">
                        <ShieldCheck size={16} className="text-emerald-500" />
                        <span className="text-xs font-black uppercase italic tracking-widest text-slate-300">
                          {t('common.liveRootData')}: {selectedKey}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {documents.length} {t('common.records')}
                      </span>
                    </div>
                    {/* List header */}
                    <div className="flex items-center px-6 py-2 bg-slate-800 border-x border-white/10 text-xs font-bold text-slate-300 uppercase tracking-widest">
                      <div className="w-12" />
                      <div className="flex-1">{t('common.documentId')}</div>
                      <div className="w-32 text-right">{t('common.actions')}</div>
                    </div>
                    {/* List rows */}
                    <div className="divide-y divide-slate-800 border-x border-b border-white/10 bg-slate-900 rounded-b-2xl">
                      {documents.map((docItem) => (
                        <div
                          key={docItem.id}
                          className="flex items-center px-6 py-3 group hover:bg-blue-950/30 transition-all cursor-pointer relative"
                          onClick={() => setSelectedDoc(docItem)}
                          onContextMenu={e => {
                            e.preventDefault();
                            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, doc: docItem });
                          }}
                        >
                          <div className="w-12 flex items-center justify-center">
                            <FileText size={18} className="text-blue-400 group-hover:text-blue-500" />
                          </div>
                          <div className="flex-1 font-mono text-blue-200 truncate">
                            {docItem.id}
                          </div>
                          <div className="w-32 flex items-center justify-end gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteDoc(docItem.id); }}
                              className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all"
                              title={t('common.delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === "storage" && (
            <div className="flex-1 flex flex-col h-full p-8">
              <h2 className="text-xl font-black text-blue-400 mb-2">
                {t('common.storageBucket')}: <span className="text-white font-mono">future-factory-377ef</span>
              </h2>
              <div className="mb-6 flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="text-blue-400 font-bold">/</span>
                {storagePath
                  ? storagePath.split("/").map((seg, idx, arr) => (
                      <span key={idx} className="flex items-center gap-2">
                        <span
                          className={idx === arr.length - 1 ? "text-white font-bold" : "hover:text-blue-400 cursor-pointer"}
                          onClick={() => {
                            setStoragePath(arr.slice(0, idx + 1).join("/"));
                          }}
                        >
                          {seg}
                        </span>
                        {idx < arr.length - 1 && <span className="text-blue-400 font-bold">/</span>}
                      </span>
                    ))
                  : <span className="text-slate-500">{t('common.root')}</span>}
                {storagePath && (
                  <button className="ml-2 text-blue-400 hover:text-blue-600" onClick={() => setStoragePath(storagePath.split("/").slice(0, -1).join("/"))}>
                    &larr; {t('common.back')}
                  </button>
                )}
              </div>
              {storageLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-60">
                  <Loader2 className="animate-spin text-blue-400 mb-4" size={40} />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 italic animate-pulse">{t('common.loading')}</p>
                </div>
              ) : storageFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center opacity-40">
                  <div className="p-10 bg-white/5 rounded-full mb-6 border-2 border-dashed border-white/10">
                    <Database size={60} className="text-slate-600" />
                  </div>
                  <h4 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-2">{t('common.noFilesFound')}</h4>
                  <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">{t('common.noFilesInRoot')}</p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto w-full">
                  <div className="flex items-center px-6 py-2 bg-slate-800 border-x border-white/10 text-xs font-bold text-slate-300 uppercase tracking-widest rounded-t-2xl">
                    <div className="flex-1">{t('common.filename')}</div>
                    <div className="w-32 text-right">{t('common.actions')}</div>
                  </div>
                  <div className="divide-y divide-slate-800 border-x border-b border-white/10 bg-slate-900 rounded-b-2xl">
                    {storageFiles.map((file) =>
                      file.isFolder ? (
                        <div
                          key={file.fullPath}
                          className="flex items-center px-6 py-3 group hover:bg-blue-950/30 transition-all cursor-pointer"
                          onClick={() => setStoragePath(file.fullPath)}
                        >
                          <div className="flex-1 font-mono text-emerald-400 truncate flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-blue-500 rounded-sm mr-2" />
                            <b>{file.name}/</b>
                          </div>
                          <div className="w-32 flex items-center justify-end gap-2 text-xs text-slate-500">{t('common.folder')}</div>
                        </div>
                      ) : (
                        <div key={file.name} className="flex items-center px-6 py-3 group hover:bg-blue-950/30 transition-all cursor-pointer">
                          <div className="flex-1 font-mono text-blue-200 truncate">{file.name}</div>
                          <div className="w-32 flex items-center justify-end gap-2">
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 rounded transition-all" title={t('common.download')}>
                              <FileText size={16} />
                            </a>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-slate-800 border border-blue-500 rounded-lg shadow-xl min-w-[180px] py-2 text-sm text-white animate-in fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-blue-600/80 transition-all"
            onClick={() => {
              setSelectedDoc(contextMenu.doc);
              setContextMenu({ ...contextMenu, visible: false });
            }}
          >
            📄 {t('common.view')}
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-rose-600/80 transition-all"
            onClick={() => {
              handleDeleteDoc(contextMenu.doc.id);
              setContextMenu({ ...contextMenu, visible: false });
            }}
          >
            🗑️ {t('common.delete')}
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-blue-500/80 transition-all"
            onClick={() => {
              fetchPathData();
              setContextMenu({ ...contextMenu, visible: false });
            }}
          >
            🔄 {t('common.refresh')}
          </button>
        </div>
      )}

      {/* Document detail modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-slate-900 border border-blue-500 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-8 relative animate-in fade-in zoom-in">
            <button
              onClick={() => setSelectedDoc(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-blue-600 text-white"
              title={t('common.close')}
            >
              ×
            </button>
            <h3 className="text-lg font-bold text-blue-400 mb-4">{t('common.document')} <span className="text-white font-mono">{selectedDoc.id}</span></h3>
            <pre className="text-xs font-mono text-slate-200 bg-black/40 p-4 rounded-xl max-h-[60vh] overflow-y-auto border border-white/10">
              {JSON.stringify(selectedDoc, (key, value) => key.startsWith("_") ? undefined : value, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDatabaseView;
