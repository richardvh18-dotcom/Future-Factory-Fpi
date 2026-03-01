import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Database, RefreshCw, Trash2, Layers, Table, SearchCode, Fingerprint, Activity, Terminal, FileText, Loader2, Folder, File, ArrowUp } from "lucide-react";
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
    { key: "PRODUCTS", label: t('adminDatabaseView.modules.products'), icon: <Layers size={16} /> },
    {
      key: "PLANNING",
      label: t('adminDatabaseView.modules.planning'),
      icon: <Activity size={16} />,
    },
    { key: "TRACKING", label: t('adminDatabaseView.modules.tracking'), icon: <SearchCode size={16} /> },
    {
      key: "USERS",
      label: t('adminDatabaseView.modules.users'),
      icon: <Fingerprint size={16} />,
    },
    {
      key: "GENERAL_SETTINGS",
      label: t('adminDatabaseView.modules.generalSettings'),
      icon: <Terminal size={16} />,
    },
    {
      key: "BORE_DIMENSIONS",
      label: t('adminDatabaseView.modules.boreDimensions'),
      icon: <Table size={16} />,
    },
    {
      key: "CB_DIMENSIONS",
      label: t('adminDatabaseView.modules.cbDimensions'),
      icon: <Database size={16} />,
    },
    {
      key: "TB_DIMENSIONS",
      label: t('adminDatabaseView.modules.tbDimensions'),
      icon: <Database size={16} />,
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
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden animate-in fade-in text-left">
      {/* HEADER - Windows Explorer Style */}
      <div className="h-14 bg-white border-b border-slate-200 flex justify-between items-center px-4 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
            <Database size={18} />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Database Explorer</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode("database")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === "database"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t('adminDatabaseView.database')}
            </button>
            <button
              onClick={() => setViewMode("storage")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                viewMode === "storage"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t('common.storage')}
            </button>
          </div>
          <button
            onClick={() => (viewMode === "database" ? fetchPathData() : fetchStorageFiles(storagePath))}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200"
          >
            <RefreshCw
              size={16}
              className={(viewMode === "database" ? loading : storageLoading) ? "animate-spin text-blue-600" : ""}
            />
          </button>
        </div>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR - Tree View */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto py-4">
          <div className="px-4 mb-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {t('common.modules')}
            </h3>
          </div>
          <div className="space-y-0.5 px-2">
            {MODULES.map((mod) => (
              <button
                key={mod.key}
                onClick={() => setSelectedKey(mod.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left ${
                  selectedKey === mod.key
                    ? "bg-blue-50 text-blue-700 border border-blue-100"
                    : "text-slate-600 hover:bg-slate-50 border border-transparent"
                }`}
              >
                {mod.icon}
                {mod.label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT - List View */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {viewMode === "database" && (
            <div className="flex-1 flex flex-col h-full">
              {/* Address Bar */}
              <div className="h-10 bg-white border-b border-slate-200 flex items-center px-4 gap-2">
                <span className="text-slate-400"><Terminal size={14} /></span>
                <div className="flex-1 flex items-center text-xs text-slate-600 font-mono">
                  <span className="text-slate-300 mr-1">/</span>
                  {activePath
                    ? activePath.split("/").map((seg, idx, arr) => (
                      <span key={idx} className="flex items-center gap-2">
                        <span
                          className={idx === arr.length - 1 ? "text-slate-900 font-bold" : "hover:text-blue-600 cursor-pointer"}
                        >
                          {seg}
                        </span>
                        {idx < arr.length - 1 && <span className="text-slate-300 font-bold">/</span>}
                      </span>
                    ))
                    : <span className="text-slate-500">{t('common.selectModule')}</span>}
                </div>
              </div>

              {/* LIST */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-60">
                    <Loader2
                      className="animate-spin text-blue-600 mb-4"
                      size={40}
                    />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 italic animate-pulse">
                      {t('common.syncing')}
                    </p>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <div className="p-10 bg-slate-100 rounded-full mb-6 border-2 border-dashed border-slate-200">
                      <Database size={60} className="text-slate-400" />
                    </div>
                    <h4 className="text-2xl font-black uppercase italic tracking-tighter text-slate-700 mb-2">
                      {t('common.pathEmpty')}
                    </h4>
                    <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                      {t('common.noDocuments')}
                    </p>
                  </div>
                ) : (
                  <div className="w-full pb-40">
                    {/* List header */}
                    <div className="flex items-center px-4 py-2 bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest rounded-t-lg">
                      <div className="w-12" />
                      <div className="flex-1">{t('common.documentId')}</div>
                      <div className="w-32 text-right">{t('common.actions')}</div>
                    </div>
                    {/* List rows */}
                    <div className="divide-y divide-slate-100 border-x border-b border-slate-200 bg-white rounded-b-lg">
                      {documents.map((docItem) => (
                        <div
                          key={docItem.id}
                          className="flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer relative"
                          onClick={() => setSelectedDoc(docItem)}
                          onContextMenu={e => {
                            e.preventDefault();
                            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, doc: docItem });
                          }}
                        >
                          <div className="w-12 flex items-center justify-start">
                            <FileText size={16} className="text-blue-500" />
                          </div>
                          <div className="flex-1 font-mono text-xs text-slate-700 truncate">
                            {docItem.id}
                          </div>
                          <div className="w-32 flex items-center justify-end gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteDoc(docItem.id); }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                              title={t('common.delete')}
                            >
                              <Trash2 size={14} />
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
            <div className="flex-1 flex flex-col h-full">
              <div className="h-10 bg-white border-b border-slate-200 flex items-center px-4 gap-2">
                <span className="text-slate-400"><Database size={14} /></span>
                <div className="flex-1 flex items-center text-xs text-slate-600 font-mono">
                <span className="text-slate-300 mr-1">/</span>
                {storagePath
                  ? storagePath.split("/").map((seg, idx, arr) => (
                      <span key={idx} className="flex items-center gap-2">
                        <span
                          className={idx === arr.length - 1 ? "text-slate-900 font-bold" : "hover:text-blue-600 cursor-pointer"}
                          onClick={() => {
                            setStoragePath(arr.slice(0, idx + 1).join("/"));
                          }}
                        >
                          {seg}
                        </span>
                        {idx < arr.length - 1 && <span className="text-slate-300 font-bold">/</span>}
                      </span>
                    ))
                  : <span className="text-slate-500">{t('common.root')}</span>}
                </div>
                {storagePath && (
                  <button className="ml-2 text-blue-600 hover:text-blue-800" onClick={() => setStoragePath(storagePath.split("/").slice(0, -1).join("/"))}>
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {storageLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-60">
                  <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 italic animate-pulse">{t('common.loading')}</p>
                </div>
              ) : storageFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center opacity-40">
                  <div className="p-10 bg-slate-100 rounded-full mb-6 border-2 border-dashed border-slate-200">
                    <Database size={60} className="text-slate-400" />
                  </div>
                  <h4 className="text-2xl font-black uppercase italic tracking-tighter text-slate-700 mb-2">{t('common.noFilesFound')}</h4>
                  <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">{t('common.noFilesInRoot')}</p>
                </div>
              ) : (
                <div className="w-full">
                  <div className="flex items-center px-4 py-2 bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest rounded-t-lg">
                    <div className="flex-1">{t('common.filename')}</div>
                    <div className="w-32 text-right">{t('common.actions')}</div>
                  </div>
                  <div className="divide-y divide-slate-100 border-x border-b border-slate-200 bg-white rounded-b-lg">
                    {storageFiles.map((file) =>
                      file.isFolder ? (
                        <div
                          key={file.fullPath}
                          className="flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer"
                          onClick={() => setStoragePath(file.fullPath)}
                        >
                          <div className="flex-1 font-mono text-xs text-slate-700 truncate flex items-center gap-2">
                            <Folder size={16} className="text-yellow-500 fill-yellow-500" />
                            <b>{file.name}/</b>
                          </div>
                          <div className="w-32 flex items-center justify-end gap-2 text-xs text-slate-500">{t('common.folder')}</div>
                        </div>
                      ) : (
                        <div key={file.name} className="flex items-center px-4 py-2 group hover:bg-blue-50 transition-all cursor-pointer">
                          <div className="flex-1 font-mono text-xs text-slate-600 truncate flex items-center gap-2">
                            <File size={16} className="text-slate-400" />
                            {file.name}
                          </div>
                          <div className="w-32 flex items-center justify-end gap-2">
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" title={t('common.download')}>
                              <FileText size={14} />
                            </a>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[180px] py-2 text-sm text-slate-700 animate-in fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-all"
            onClick={() => {
              setSelectedDoc(contextMenu.doc);
              setContextMenu({ ...contextMenu, visible: false });
            }}
          >
            📄 {t('common.view')}
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 transition-all"
            onClick={() => {
              handleDeleteDoc(contextMenu.doc.id);
              setContextMenu({ ...contextMenu, visible: false });
            }}
          >
            🗑️ {t('common.delete')}
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-slate-50 transition-all"
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
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-8 relative animate-in fade-in zoom-in">
            <button
              onClick={() => setSelectedDoc(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
              title={t('common.close')}
            >
              ×
            </button>
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t('common.document')} <span className="text-blue-600 font-mono">{selectedDoc.id}</span></h3>
            <pre className="text-xs font-mono text-slate-700 bg-slate-50 p-4 rounded-xl max-h-[60vh] overflow-y-auto border border-slate-200">
              {JSON.stringify(selectedDoc, (key, value) => key.startsWith("_") ? undefined : value, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDatabaseView;
