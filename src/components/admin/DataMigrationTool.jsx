import React, { useState, useEffect } from "react";
import { db } from "../../config/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  query,
  limit,
} from "firebase/firestore";
import {
  Database,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  SearchCode,
  Terminal,
  Play,
  Map,
  FolderTree,
  ChevronRight,
  Zap,
  AlertTriangle,
  Info,
  DatabaseZap,
  ArrowRightLeft,
  X,
} from "lucide-react";
import { PATHS, getArtifactsPath } from "../../config/dbPaths";

/**
 * DataMigrationTool V6.0 - Future Factory Root Sync
 * Verhuist data van artifacts/{appId}/public/data/ naar /future-factory/...
 */
const DataMigrationTool = () => {
  const [status, setStatus] = useState("idle"); // idle, scanning, ready, running, done
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({});
  const [sourceId, setSourceId] = useState("fittings-app-v1");

  // DEFINITIE VAN DE MIGRATIE ROUTE - VOLLEDIGE MAPPING
  // 'id' is de mapnaam onder artifacts/{appId}/public/data/
  // 'newKey' is de key in dbPaths.js
  const MIGRATION_MAP = [
    // --- PRODUCTEN & CATALOGUS ---
    {
      label: "Product Catalogus",
      id: "products",
      newKey: "PRODUCTS",
      type: "collection",
    },
    {
      label: "Product Afbeeldingen",
      id: "product_images",
      newKey: "IMAGE_LIBRARY",
      type: "collection",
    },
    {
      label: "Product Conversies",
      id: "product_conversions",
      newKey: "CONVERSION_MATRIX",
      type: "collection",
    },
    
    // --- PLANNING & TRACKING ---
    {
      label: "Digitale Planning",
      id: "digital_planning",
      newKey: "PLANNING",
      type: "collection",
    },
    {
      label: "Live Tracking",
      id: "tracked_products",
      newKey: "TRACKING",
      type: "collection",
    },
    {
      label: "Machine Bezetting",
      id: "machine_occupancy",
      newKey: "OCCUPANCY",
      type: "collection",
    },
    
    // --- INVENTARIS & MATERIALEN ---
    {
      label: "Inventaris & Moffen",
      id: "moffen",
      newKey: "INVENTORY",
      type: "collection",
    },
    
    // --- TECHNISCHE SPECS ---
    {
      label: "CB Mof Dimensies",
      id: "cb_dimensions",
      newKey: "CB_DIMENSIONS",
      type: "collection",
    },
    {
      label: "TB Mof Dimensies",
      id: "tb_dimensions",
      newKey: "TB_DIMENSIONS",
      type: "collection",
    },
    {
      label: "Fitting Specs",
      id: "standard_fitting_specs",
      newKey: "FITTING_SPECS",
      type: "collection",
    },
    {
      label: "Socket Specs",
      id: "standard_socket_specs",
      newKey: "SOCKET_SPECS",
      type: "collection",
    },
    
    // --- GEBRUIKERS & PERSONEEL ---
    {
      label: "Gebruikers & Rollen",
      id: "user_roles",
      newKey: "USERS",
      type: "collection",
    },
    {
      label: "Personeel Database",
      id: "personnel",
      newKey: "PERSONNEL",
      type: "collection",
    },
    
    // --- COMMUNICATIE ---
    {
      label: "Berichten & Inbox",
      id: "messages",
      newKey: "MESSAGES",
      type: "collection",
    },
    
    // --- INSTELLINGEN & CONFIG ---
    {
      label: "Fabriek Configuratie",
      id: "config/factory_config",
      newKey: "FACTORY_CONFIG",
      type: "document",
    },
    {
      label: "Algemene Instellingen",
      id: "app_settings/general",
      newKey: "GENERAL_SETTINGS",
      type: "document",
    },
    {
      label: "Algemene Config (Alt)",
      id: "settings/general_config",
      newKey: "GENERAL_SETTINGS",
      type: "document",
      skipIfExists: true, // Skip als al gemigreerd via app_settings/general
    },
    {
      label: "Productie Structuur",
      id: "settings/production_structure",
      newKey: "FACTORY_CONFIG",
      type: "document",
      merge: true, // Merge met bestaande factory_config
    },
    {
      label: "Product Blueprints",
      id: "settings/product_templates",
      newKey: "BLUEPRINTS",
      type: "document",
    },
    
    // --- MEDIA & DOCUMENTEN ---
    {
      label: "Technische Tekeningen",
      id: "library_drawings",
      newKey: "DRAWING_LIBRARY",
      type: "collection",
    },
    {
      label: "Label Templates",
      id: "label_templates",
      newKey: "LABEL_TEMPLATES",
      type: "collection",
    },
    
    // --- AI & KENNIS ---
    {
      label: "AI Knowledge Base",
      id: "ai_knowledge_base",
      newKey: "AI_KNOWLEDGE_BASE",
      type: "collection",
    },
  ];

  const addLog = (msg) =>
    setLogs((prev) =>
      [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100) // Verhoogd van 30 naar 100
    );

  /**
   * SCAN: Controleert of er data aanwezig is op de oude locaties.
   */
  const performScan = async () => {
    setStatus("scanning");
    setCounts({});
    setLogs([]); // Clear oude logs
    addLog(`🔍 Scan gestart voor bron: /artifacts/${sourceId}/public/data/`);
    addLog(`📊 Controleren van ${MIGRATION_MAP.length} data bronnen...`);

    const newCounts = {};
    let totalFound = 0;
    let totalDocs = 0;
    
    for (const item of MIGRATION_MAP) {
      try {
        const oldPathParts = getArtifactsPath(sourceId, ...item.id.split("/"));

        if (item.type === "collection") {
          const snap = await getDocs(collection(db, ...oldPathParts));
          newCounts[item.id] = snap.size;
          if (snap.size > 0) {
            addLog(`✅ ${item.label}: ${snap.size} documenten`);
            totalFound++;
            totalDocs += snap.size;
          } else {
            addLog(`⚪ ${item.label}: leeg`);
          }
        } else {
          // Voor documenten checken we bestaan
          try {
            const docRef = doc(db, ...oldPathParts);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              newCounts[item.id] = 1;
              addLog(`✅ ${item.label}: configuratie gevonden`);
              totalFound++;
            } else {
              newCounts[item.id] = 0;
              addLog(`⚪ ${item.label}: niet gevonden`);
            }
          } catch (docErr) {
            newCounts[item.id] = 0;
            addLog(`⚪ ${item.label}: niet gevonden`);
          }
        }
      } catch (e) {
        addLog(`❌ ${item.label}: pad niet toegankelijk`);
        newCounts[item.id] = 0;
      }
    }
    
    setCounts(newCounts);
    addLog(`---`);
    addLog(`📈 Scan compleet: ${totalFound}/${MIGRATION_MAP.length} bronnen gevonden`);
    addLog(`📦 Totaal: ${totalDocs} documenten gereed voor migratie`);
    setStatus("ready");
  };

  /**
   * MIGRATIE: De daadwerkelijke verhuizing
   */
  const startMigration = async () => {
    if (
      !window.confirm(
        "Weet je zeker dat je de data wilt kopiëren naar de nieuwe root?\n\n" +
        "Dit overschrijft bestaande data met dezelfde ID's."
      )
    )
      return;
    setStatus("running");
    addLog("🚀 Migratie proces gestart...");

    try {
      for (const item of MIGRATION_MAP) {
        if (!counts[item.id]) {
          addLog(`⏭️  Overgeslagen: ${item.label} (geen data gevonden)`);
          continue;
        }

        const oldPathParts = getArtifactsPath(sourceId, ...item.id.split("/"));
        const targetPath = PATHS[item.newKey];

        if (!targetPath) {
          addLog(`❌ FOUT: Geen mapping gevonden voor ${item.newKey}`);
          continue;
        }

        addLog(`📦 Verhuizen: ${item.label} -> /${targetPath.join("/")}`);

        if (item.type === "collection") {
          // COLLECTIE MIGRATIE
          const snapshot = await getDocs(collection(db, ...oldPathParts));
          let batch = writeBatch(db);
          let count = 0;
          let totalMigrated = 0;

          for (const oldDoc of snapshot.docs) {
            const newDocRef = doc(db, ...targetPath, oldDoc.id);
            batch.set(
              newDocRef,
              {
                ...oldDoc.data(),
                migratedAt: serverTimestamp(),
                sourceNode: sourceId,
              },
              { merge: true }
            );

            count++;
            totalMigrated++;
            
            if (count >= 450) {
              // Batch limiet Firestore
              await batch.commit();
              addLog(`   ✓ Batch committed (${totalMigrated} docs)`);
              batch = writeBatch(db);
              count = 0;
            }
          }
          
          if (count > 0) {
            await batch.commit();
          }
          
          addLog(`   ✅ Compleet: ${totalMigrated} documenten gemigreerd`);
          
        } else if (item.type === "document") {
          // DOCUMENT MIGRATIE
          try {
            // Check of we moeten skippen
            if (item.skipIfExists) {
              const targetDocRef = doc(db, ...targetPath);
              const existingDoc = await getDoc(targetDocRef);
              if (existingDoc.exists()) {
                addLog(`   ⏭️  Overgeslagen: ${item.label} (bestaat al)`);
                continue;
              }
            }

            // Haal het oude document op
            const oldDocRef = doc(db, ...oldPathParts);
            const oldDocSnap = await getDoc(oldDocRef);
            
            if (!oldDocSnap.exists()) {
              addLog(`   ⚠️  Document niet gevonden: ${item.label}`);
              continue;
            }

            const targetDocRef = doc(db, ...targetPath);
            
            if (item.merge) {
              // Merge met bestaand document
              await setDoc(
                targetDocRef,
                {
                  ...oldDocSnap.data(),
                  migratedAt: serverTimestamp(),
                  sourceNode: sourceId,
                },
                { merge: true }
              );
              addLog(`   ✅ Gemerged: ${item.label}`);
            } else {
              // Overschrijf document
              await setDoc(targetDocRef, {
                ...oldDocSnap.data(),
                migratedAt: serverTimestamp(),
                sourceNode: sourceId,
              });
              addLog(`   ✅ Compleet: ${item.label}`);
            }
          } catch (docError) {
            addLog(`   ❌ Fout bij ${item.label}: ${docError.message}`);
          }
        }
      }

      setStatus("done");
      addLog("--- 🎉 MIGRATIE VOLTOOID ---");
      addLog("Alle data is succesvol gekopieerd naar de nieuwe root structuur.");
    } catch (err) {
      addLog(`❌ KRITIEKE FOUT: ${err.message}`);
      console.error("Migration error:", err);
      setStatus("error");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-left space-y-8 animate-in fade-in pb-40">
      {/* HEADER UNIT */}
      <div className="bg-slate-900 p-8 md:p-10 rounded-[45px] text-white shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-5 rotate-12">
          <DatabaseZap size={200} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-blue-600 rounded-3xl shadow-xl shadow-blue-900/40">
              <Database size={40} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none">
                Root <span className="text-blue-500">Migrator</span>
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500" /> Versie
                6.0 | Secure Path Sync
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 flex flex-col justify-center">
              <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">
                Bron ID
              </span>
              <input
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="bg-transparent font-mono text-sm text-emerald-400 font-bold outline-none border-none p-0 w-32"
              />
            </div>
            <button
              onClick={performScan}
              disabled={status === "scanning" || status === "running"}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
            >
              {status === "scanning" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <SearchCode size={18} />
              )}{" "}
              Scan Artifacts
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* MIGRATIE OVERZICHT */}
        <div className="lg:col-span-7 space-y-6">
          {/* Status samenvatting */}
          {status === "ready" && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-[30px] p-6 flex items-center justify-between">
              <div className="text-left">
                <p className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">
                  Scan Compleet
                </p>
                <p className="text-2xl font-black text-blue-600">
                  {Object.values(counts).filter(v => v > 0).length}/{MIGRATION_MAP.length}
                  <span className="text-sm font-bold text-blue-400 ml-2">bronnen gevonden</span>
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  {Object.values(counts).reduce((sum, v) => sum + v, 0)} totaal documenten
                </p>
              </div>
              <Database size={48} className="text-blue-300" />
            </div>
          )}
          
          {/* Scrollable container voor veel items */}
          <div className="max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MIGRATION_MAP.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white p-6 rounded-[30px] border-2 transition-all shadow-sm ${
                    counts[item.id] > 0
                      ? "border-emerald-100 bg-emerald-50/20"
                      : "border-slate-50 opacity-40 grayscale"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-left flex-1">
                      <p className="font-black text-slate-900 uppercase italic text-xs tracking-tight leading-tight">
                        {item.label}
                      </p>
                      <p className="text-[9px] font-mono text-slate-400 mt-1 break-all">
                        {item.id}
                      </p>
                    </div>
                    {counts[item.id] > 0 ? (
                      <span className="text-sm font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg ml-2 shrink-0">
                        {counts[item.id]}
                      </span>
                    ) : (
                      <X size={14} className="text-slate-300 ml-2 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-50">
                    <ArrowRightLeft size={10} className="text-slate-300 shrink-0" />
                    <span className="text-[8px] font-black text-slate-400 uppercase italic break-all">
                      {PATHS[item.newKey]?.join("/")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {status === "ready" && Object.values(counts).some((v) => v > 0) && (
            <button
              onClick={startMigration}
              className="w-full py-7 bg-slate-900 text-white rounded-[35px] font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95 animate-in slide-in-from-bottom-2"
            >
              <Play size={20} fill="currentColor" /> Start Volledige Migratie
            </button>
          )}

          {status === "done" && (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-8 rounded-[40px] flex items-center gap-6 animate-in zoom-in">
              <div className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg">
                <CheckCircle2 size={32} />
              </div>
              <div className="text-left">
                <p className="font-black text-emerald-900 uppercase text-sm tracking-widest leading-none mb-2">
                  Success!
                </p>
                <p className="text-xs text-emerald-700 font-medium italic">
                  Alle data is gekopieerd naar de nieuwe root. Je kunt nu veilig
                  overschakelen.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* LOGS */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 rounded-[45px] p-8 border border-white/5 shadow-2xl flex flex-col h-[600px]">
            <div className="flex items-center gap-3 text-slate-500 mb-6 border-b border-white/5 pb-5">
              <Terminal size={16} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Migration Logic Feed
              </span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2 text-left">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`text-[9px] font-mono leading-relaxed p-2.5 rounded-xl ${
                    log.includes("✅") ||
                    log.includes("SUCCES") ||
                    log.includes("🎉")
                      ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                      : log.includes("❌")
                      ? "bg-rose-500/10 text-rose-400 border-l-2 border-rose-500"
                      : "bg-white/5 text-blue-300/60 border-l-2 border-blue-500/30"
                  }`}
                >
                  {log}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-slate-400 italic">
                  <Info size={32} className="mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">
                    Wacht op scan...
                  </p>
                </div>
              )}
            </div>

            {status === "running" && (
              <div className="mt-6 pt-6 border-t border-white/5 animate-pulse flex items-center justify-center gap-3 text-blue-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Verwerking Bezig...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GUIDELINES */}
      <div className="max-w-4xl mx-auto p-10 bg-blue-50 rounded-[50px] border-2 border-blue-100 flex flex-col md:flex-row items-center gap-8 shadow-inner text-left">
        <div className="p-4 bg-blue-600 rounded-3xl text-white shadow-lg">
          <Info size={32} />
        </div>
        <div className="space-y-3 text-left">
          <h4 className="text-sm font-black uppercase text-blue-900 tracking-widest italic">
            Belangrijke Migratie-Instructies:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2 text-[10px] font-bold text-blue-700/70 uppercase leading-relaxed">
            <p>• Deze tool KOPIEERT data, het verwijderd de oude data niet.</p>
            <p>
              • Na migratie moet je de code omschakelen via{" "}
              <code>dbPaths.js</code>.
            </p>
            <p>• Batched updates worden gebruikt voor optimale snelheid.</p>
            <p>
              • De tool overschrijft bestaande records in de root met dezelfde
              ID's.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataMigrationTool;
