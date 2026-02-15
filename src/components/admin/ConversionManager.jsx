import React, { useState, useEffect, useMemo } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Database,
  Search,
  Edit2,
  Trash2,
  Save,
  RefreshCw,
  X,
  FileSpreadsheet,
  Eye,
  Info,
  PlusCircle,
  ArrowRightCircle,
  Plus,
  ChevronDown,
  ShieldCheck,
  Zap,
  ChevronRight,
  DatabaseZap,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";
import {
  parseCSV,
  uploadConversionBatch,
  lookupProductByManufacturedId,
  fetchConversions,
} from "../../utils/conversionLogic";
import { doc, setDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, writeBatch } from "firebase/firestore";
import { db, auth } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import * as XLSX from "xlsx";

/**
 * ConversionManager V6.0 - Root Integrated
 * De brug tussen Infor-LN Planning en de Technische Catalogus.
 * Locatie: /future-factory/settings/conversions/mapping/records/
 */
export default function ConversionManager() {
  const [activeTab, setActiveTab] = useState("upload");

  // Upload State
  const [fileData, setFileData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [testCode, setTestCode] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [workbook, setWorkbook] = useState(null);

  // Beheer State
  const [conversions, setConversions] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Paginatie State
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  // Helper: Valideer en zet data
  const validateAndSetData = (data) => {
    if (data.length > 0) {
      const firstRow = data[0];
      const hasOldCode = firstRow["Old Item Code"] || firstRow["Item Code"] || firstRow["manufacturedId"];
      if (!hasOldCode)
        throw new Error("Kolom 'Old Item Code' of 'manufacturedId' niet gevonden.");
    } else {
      throw new Error("Het bestand is leeg of het tabblad bevat geen data.");
    }
    setFileData(data);
    setStatus("ready");
  };

  // Helper: Process imported data (add label + normalize keys)
  const processImportData = (data, label) => {
    return data.map((item) => {
      const newItem = { ...item };
      if (label) newItem.label = label;
      
      // Mapping van Excel kolommen naar interne veldnamen
      if (item["Old Item Code"]) newItem.manufacturedId = item["Old Item Code"];
      if (item["Item Code"]) newItem.manufacturedId = item["Item Code"];
      
      if (item["New Item Code"]) newItem.targetProductId = item["New Item Code"];
      if (item["Target Code"]) newItem.targetProductId = item["Target Code"];

      if (item["Description"]) newItem.description = item["Description"];
      if (item["Item Description"]) newItem.description = item["Item Description"];
      if (item["Omschrijving"]) newItem.description = item["Omschrijving"];
      if (item["Type Description"]) newItem.description = item["Type Description"];

      if (item["Type"]) newItem.type = item["Type"];
      if (item["Serie"]) newItem.serie = item["Serie"];
      
      if (item["DN"]) newItem.dn = item["DN"];
      if (item["DN [mm]"]) newItem.dn = item["DN [mm]"];

      if (item["PN"]) newItem.pn = item["PN"];
      if (item["PN [bar]"]) newItem.pn = item["PN [bar]"];

      if (item["Ends"]) newItem.ends = item["Ends"];

      // Normaliseer dimensies A-N naar lowercase a-n
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].forEach((key) => {
        // Check zowel uppercase key als lowercase key in bron data
        const val = item[key] !== undefined ? item[key] : item[key.toLowerCase()];
        if (val !== undefined) {
          newItem[key.toLowerCase()] = val;
        }
      });
      return newItem;
    });
  };

  // --- UPLOAD HANDLERS ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus("processing");
    const isExcel =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.name.toLowerCase().endsWith(".xls");

    try {
      let parsedData = [];
      if (isExcel) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: "array" });
        
        if (wb.SheetNames.length > 1) {
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);
          setSelectedSheets([]);
          setStatus("selecting_sheet");
          return;
        }
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        parsedData = processImportData(XLSX.utils.sheet_to_json(ws), sheetName);
      } else {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        parsedData = processImportData(parseCSV(text), null);
      }
      
      validateAndSetData(parsedData);
    } catch (err) {
      console.error(err);
      alert("Fout bij lezen bestand: " + err.message);
      setStatus("error");
    }
  };

  const handleToggleSheet = (sheetName) => {
    setSelectedSheets((prev) =>
      prev.includes(sheetName)
        ? prev.filter((n) => n !== sheetName)
        : [...prev, sheetName]
    );
  };

  const handleConfirmSheetSelection = () => {
    if (selectedSheets.length === 0) return;

    try {
      let allData = [];
      selectedSheets.forEach((name) => {
        const ws = workbook.Sheets[name];
        const data = processImportData(XLSX.utils.sheet_to_json(ws), name);
        allData = [...allData, ...data];
      });
      validateAndSetData(allData);
    } catch (err) {
      alert("Fout bij laden tabbladen: " + err.message);
      resetUpload();
    }
  };

  const handleFullImport = async () => {
    if (fileData.length === 0) return;
    setUploading(true);
    setStatus("uploading");

    try {
      // We implementeren de upload lokaal om zeker te zijn dat alle velden (a-n, label) mee gaan.
      const BATCH_SIZE = 400;
      const total = fileData.length;
      let processed = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = fileData.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((item) => {
          // Zorg dat we een ID hebben
          const docId = (item.manufacturedId || item["Old Item Code"] || item["Item Code"] || "").toString().trim().toUpperCase();
          if (!docId) return;

          const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, docId);
          
          // Schoon item op voor opslag en voeg metadata toe
          const storageItem = {
            ...item,
            manufacturedId: docId,
            lastUpdated: serverTimestamp(),
            updatedBy: auth.currentUser?.email || "Import",
          };
          
          // Verwijder undefined waarden
          Object.keys(storageItem).forEach(key => storageItem[key] === undefined && delete storageItem[key]);

          batch.set(docRef, storageItem, { merge: true });
        });

        await batch.commit();
        processed += chunk.length;
        setProgress(Math.round((processed / total) * 100));
      }

      setStatus("done");
      alert(
        `Import voltooid! ${total} records naar de root geschreven.`
      );
      resetUpload();
    } catch (error) {
      console.error(error);
      alert("Fout tijdens uploaden: " + error.message);
      setStatus("error");
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setTimeout(() => {
      setStatus("idle");
      setFileData([]);
      setProgress(0);
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheets([]);
    }, 2000);
  };

  const handleTestLookup = async () => {
    if (!testCode) return;
    const result = await lookupProductByManufacturedId(null, testCode);
    setTestResult(result || { error: "Geen match gevonden" });
  };

  const handleCreateNew = () => {
    setEditingItem({
      manufacturedId: "",
      targetProductId: "",
      type: "",
      serie: "",
      dn: "",
      pn: "",
      description: "",
      label: "",
      a: "", b: "", c: "", d: "", e: "", f: "", g: "",
      h: "", i: "", j: "", k: "", l: "", m: "", n: ""
    });
    setIsCreating(true);
  };

  // --- BEHEER HANDLERS ---
  const loadInitialConversions = async () => {
    setLoadingList(true);
    setLastDoc(null);
    try {
      const { data, lastDoc: newLastDoc } = await fetchConversions(
        null,
        null,
        PAGE_SIZE
      );
      setConversions(data);
      setLastDoc(newLastDoc);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  const loadMoreConversions = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, lastDoc: newLastDoc } = await fetchConversions(
        null,
        lastDoc,
        PAGE_SIZE
      );
      setConversions((prev) => [...prev, ...data]);
      setLastDoc(newLastDoc);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Live Search Effect
  useEffect(() => {
    if (activeTab !== "manage") return;

    const timer = setTimeout(async () => {
      if (searchTerm.length >= 3) {
        setLoadingList(true);
        try {
          const term = searchTerm.trim().toUpperCase();
          
          // Zoek op LN Code (Manufactured ID)
          const q1 = query(
            collection(db, ...PATHS.CONVERSION_MATRIX),
            where("manufacturedId", ">=", term),
            where("manufacturedId", "<=", term + "\uf8ff"),
            limit(50)
          );
          
          // Zoek op Tekening Code (Target Product ID)
          const q2 = query(
            collection(db, ...PATHS.CONVERSION_MATRIX),
            where("targetProductId", ">=", term),
            where("targetProductId", "<=", term + "\uf8ff"),
            limit(50)
          );

          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          
          const resultsMap = new Map();
          snap1.docs.forEach((doc) => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
          snap2.docs.forEach((doc) => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
          
          setConversions(Array.from(resultsMap.values()));
          setHasMore(false);
        } catch (err) {
          console.error("Search error:", err);
        } finally {
          setLoadingList(false);
        }
      } else if (searchTerm === "") {
        loadInitialConversions();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [activeTab, searchTerm]);

  const handleDeleteAll = async () => {
    const confirmation = window.prompt("⚠️ WAARSCHUWING: Dit verwijdert ALLE conversie-items uit de database!\n\nTyp 'DELETE' om te bevestigen:");
    
    if (confirmation !== "DELETE") {
      return;
    }

    setUploading(true);
    try {
      const colRef = collection(db, ...PATHS.CONVERSION_MATRIX);
      const snapshot = await getDocs(colRef);
      
      if (snapshot.size === 0) {
        alert("Database is al leeg.");
        setUploading(false);
        return;
      }

      const batchSize = 400;
      const total = snapshot.size;
      
      for (let i = 0; i < total; i += batchSize) {
        const batch = writeBatch(db);
        snapshot.docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }

      alert("Alle items zijn verwijderd.");
      setConversions([]);
      setLastDoc(null);
      loadInitialConversions();
    } catch (err) {
      console.error(err);
      alert("Fout bij verwijderen: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem?.manufacturedId) return;
    setUploading(true);

    try {
      const docRef = doc(
        db,
        ...PATHS.CONVERSION_MATRIX,
        editingItem.manufacturedId.toUpperCase()
      );
      await setDoc(
        docRef,
        {
          ...editingItem,
          manufacturedId: editingItem.manufacturedId.toUpperCase(),
          lastUpdated: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "Admin",
        },
        { merge: true }
      );

      setEditingItem(null);
      setIsCreating(false);
      loadInitialConversions();
    } catch (err) {
      alert("Opslaan mislukt: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Koppeling ${id} permanent wissen uit de root?`))
      return;
    try {
      await deleteDoc(doc(db, ...PATHS.CONVERSION_MATRIX, id));
      setConversions((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert("Delete failed");
    }
  };

  const filteredList = useMemo(() => {
    if (!searchTerm) return conversions;
    const q = searchTerm.toLowerCase();
    return conversions.filter(
      (c) =>
        c.manufacturedId?.toLowerCase().includes(q) ||
        c.targetProductId?.toLowerCase().includes(q)
    );
  }, [conversions, searchTerm]);

  return (
    <div className="h-full flex flex-col p-6 animate-in fade-in duration-500 text-left">
      {/* HEADER UNIT */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <ArrowRightLeft size={120} />
        </div>
        <div className="text-left relative z-10 flex items-center gap-6">
          <div className="p-4 bg-teal-600 text-white rounded-[22px] shadow-xl shadow-teal-100">
            <DatabaseZap size={32} />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
              Conversie <span className="text-teal-600">Matrix</span>
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> Root Protected
              </span>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest italic">
                Sync: /{PATHS.CONVERSION_MATRIX.join("/")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl relative z-10">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "upload"
                ? "bg-white text-teal-600 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === "manage"
                ? "bg-white text-teal-600 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Database size={14} /> Database
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "upload" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full overflow-y-auto custom-scrollbar pb-20">
            {/* 1. UPLOADER */}
            <div className="bg-white rounded-[45px] p-10 shadow-sm border border-slate-200 space-y-8 flex flex-col">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
                <FileSpreadsheet size={16} className="text-teal-500" /> Stap 1:
                Bestand laden
              </h3>
              <div className="border-4 border-dashed border-slate-50 rounded-[40px] p-12 text-center bg-slate-50/50 hover:border-teal-400 transition-all cursor-pointer group flex-1 flex flex-col items-center justify-center">
                {status === "processing" ? (
                  <div className="flex flex-col items-center animate-in fade-in">
                    <Loader2 size={64} className="text-teal-500 animate-spin mb-6" />
                    <p className="text-sm font-black text-slate-600 uppercase tracking-widest">
                      Bestand verwerken...
                    </p>
                  </div>
                ) : (
                  <>
                    <FileSpreadsheet
                      size={64}
                      className="text-slate-200 group-hover:scale-110 group-hover:text-teal-500 transition-all mb-6"
                    />
                    <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-2">
                      Sleep Excel of CSV Bestand
                    </p>
                    <p className="text-xs text-slate-400 font-medium max-w-[200px] leading-relaxed italic">
                      Kolommen: 'Old Item Code' & 'New Item Code'
                    </p>
                    <label className="mt-8 bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-teal-600 transition-all shadow-xl active:scale-95">
                      Bestand Kiezen
                      <input
                        type="file"
                        accept=".csv, .xlsx, .xls"
                        className="hidden"
                        onChange={handleFileUpload}
                        onClick={(e) => (e.target.value = null)}
                      />
                    </label>
                  </>
                )}
              </div>

              {status === "selecting_sheet" && (
                <div className="animate-in slide-in-from-bottom-4 space-y-4">
                  <div className="bg-blue-50 text-blue-700 p-4 rounded-2xl border border-blue-100 font-bold text-xs uppercase tracking-wide text-center">
                    Meerdere tabbladen gevonden. Selecteer welke je wilt importeren:
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {sheetNames.map((name) => {
                      const isSelected = selectedSheets.includes(name);
                      return (
                      <button
                        key={name}
                        onClick={() => handleToggleSheet(name)}
                        className={`p-4 border-2 rounded-xl text-left transition-all group relative ${
                          isSelected 
                            ? "bg-teal-50 border-teal-500" 
                            : "bg-white border-slate-100 hover:border-teal-300"
                        }`}
                      >
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Sheet</span>
                        <span className={`font-bold ${isSelected ? "text-teal-700" : "text-slate-800"}`}>{name}</span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 text-teal-600">
                            <CheckCircle2 size={16} />
                          </div>
                        )}
                      </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 pt-2">
                     <button
                      onClick={() => setSelectedSheets(sheetNames)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Alles Selecteren
                    </button>
                    <button
                      onClick={handleConfirmSheetSelection}
                      disabled={selectedSheets.length === 0}
                      className="flex-[2] py-3 bg-teal-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Importeer {selectedSheets.length} Sheet{selectedSheets.length !== 1 && 's'}
                    </button>
                  </div>
                </div>
              )}

              {status === "ready" && (
                <div className="animate-in slide-in-from-bottom-4">
                  <div className="bg-emerald-50 text-emerald-700 p-6 rounded-3xl border-2 border-emerald-100 mb-6 font-black uppercase text-xs tracking-widest flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 size={20} /> {fileData.length} Mappings
                      Gevonden
                    </div>
                    <span className="text-[10px] bg-white px-2 py-1 rounded shadow-sm italic">
                      Status: Gereed voor Root
                    </span>
                  </div>
                  <button
                    onClick={handleFullImport}
                    disabled={uploading}
                    className="w-full bg-teal-600 text-white py-6 rounded-[30px] font-black uppercase text-xs tracking-[0.3em] hover:bg-teal-700 transition-all shadow-xl flex items-center justify-center gap-4 active:scale-95"
                  >
                    {uploading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Zap size={20} />
                    )}
                    Start Batch Import naar Root
                  </button>
                </div>
              )}
            </div>

            {/* 2. LOOKUP TESTER */}
            <div className="bg-white rounded-[45px] p-10 shadow-sm border border-slate-200 space-y-8 flex flex-col">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic">
                <Search size={16} className="text-blue-500" /> Stap 2: Validatie
                Test
              </h3>
              <div className="space-y-6">
                <div className="relative group">
                  <Search
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-all"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="Voer een planning-code in..."
                    className="w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner text-sm uppercase"
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTestLookup()}
                  />
                  <button
                    onClick={handleTestLookup}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 active:scale-90 transition-all"
                  >
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>

                {testResult && (
                  <div className="bg-slate-900 rounded-[35px] p-8 text-white animate-in zoom-in-95 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Zap size={100} />
                    </div>
                    {testResult.error ? (
                      <div className="flex flex-col items-center gap-4 py-10 opacity-60">
                        <AlertTriangle size={48} className="text-rose-500" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                          {testResult.error}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6 text-left relative z-10">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Bron (Infor-LN)
                            </span>
                            <p className="font-mono text-xs font-bold text-teal-400 break-all">
                              {testResult.manufacturedId}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Doel (Tekening)
                            </span>
                            <p className="font-mono text-sm font-black text-white break-all">
                              {testResult.targetProductId}
                            </p>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-white/10">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Resultaat Beschrijving
                          </span>
                          <p className="text-sm font-bold italic text-slate-300">
                            {testResult.description ||
                              "Geen omschrijving beschikbaar."}
                          </p>
                        </div>
                        {testResult.isFallback && (
                          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center gap-3">
                            <AlertTriangle
                              size={14}
                              className="text-amber-500"
                            />
                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                              Smart Fallback naar EST Template
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* TAB 2: DATABASE BEHEER */
          <div className="bg-white rounded-[50px] shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:row justify-between items-center gap-4 bg-slate-50/30">
              <div className="relative w-full max-w-md group">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-teal-600 transition-colors"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Filter op code of tekening..."
                  className="pl-12 pr-4 py-3.5 w-full bg-white border-2 border-slate-100 rounded-[22px] outline-none focus:border-teal-500 shadow-sm font-bold text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    handleCreateNew();
                    setActiveTab("manage");
                  }}
                  className="bg-teal-600 text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-teal-700 transition-all shadow-lg active:scale-95"
                >
                  <Plus size={18} strokeWidth={3} /> Handmatig Toevoegen
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={uploading || loadingList}
                  className="p-3.5 bg-white text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl border border-slate-200 transition-all shadow-sm disabled:opacity-50"
                  title="Alles Verwijderen"
                >
                  {uploading ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                </button>
                <button
                  onClick={loadInitialConversions}
                  className="p-3.5 bg-white text-slate-400 hover:text-teal-600 rounded-2xl border border-slate-200 transition-all shadow-sm"
                >
                  <RefreshCw size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/80 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-slate-100 backdrop-blur-md shadow-sm">
                  <tr>
                    <th className="px-10 py-5">Planning Code (Source)</th>
                    <th className="px-10 py-5 text-teal-600">
                      Tekening Code (Target)
                    </th>
                    <th className="px-10 py-5">Configuratie</th>
                    <th className="px-10 py-5 text-right">Beheer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredList.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-blue-50/30 cursor-pointer transition-all group"
                      onClick={() => setDetailItem(item)}
                    >
                      <td className="px-10 py-4">
                        <code className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase tracking-tighter">
                          {item.manufacturedId}
                        </code>
                      </td>
                      <td className="px-10 py-4">
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-blue-400" />
                          <span className="font-mono text-sm font-black text-blue-700 uppercase tracking-tight">
                            {item.targetProductId}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-4">
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-black text-slate-800 uppercase italic tracking-tighter">
                            {item.type} {item.serie}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            DN{item.dn} / PN{item.pn}
                          </span>
                          {item.label && (
                            <span className="text-[8px] font-bold text-teal-600 uppercase tracking-widest mt-0.5">
                              {item.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-4 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCreating(false);
                              setEditingItem(item);
                            }}
                            className="p-3 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Bewerken"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                            className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Wissen"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredList.length === 0 && !loadingList && (
                    <tr>
                      <td
                        colSpan="4"
                        className="py-32 text-center opacity-30 italic"
                      >
                        <Database
                          size={64}
                          className="mx-auto mb-4 text-slate-200"
                        />
                        <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">
                          Geen koppelingen gevonden
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="p-8 flex justify-center border-t border-slate-50 bg-slate-50/30">
                {loadingList ? (
                  <Loader2 className="animate-spin text-teal-500" />
                ) : hasMore && !searchTerm ? (
                  <button
                    onClick={loadMoreConversions}
                    disabled={loadingMore}
                    className="px-10 py-4 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-3 active:scale-95"
                  >
                    {loadingMore ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <>
                        Meer Records Laden <ChevronDown size={14} />
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-slate-300 italic text-[10px] font-bold uppercase tracking-widest">
                    <ShieldCheck size={14} /> Einde van Mapping Catalogus
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {detailItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 border border-white/10">
            <div className="bg-slate-950 p-10 flex justify-between items-start text-left">
              <div className="text-left">
                <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                  Mapping <span className="text-teal-400">Detail</span>
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-3 tracking-widest italic">
                  Conversie Matrix Node Integrity
                </p>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-400 transition-all"
              >
                <X size={28} />
              </button>
            </div>
            <div className="p-10 space-y-8 text-left">
              <div className="grid grid-cols-2 gap-6 text-left">
                <div className="bg-slate-50 p-6 rounded-[30px] border-2 border-slate-100 text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Bron (Planning)
                  </p>
                  <p className="font-mono text-sm font-black text-slate-700 break-all">
                    {detailItem.manufacturedId}
                  </p>
                </div>
                <div className="bg-teal-50 p-6 rounded-[30px] border-2 border-teal-100 text-left shadow-lg shadow-teal-900/5">
                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-2 ml-1">
                    Doel (Tekening)
                  </p>
                  <p className="font-mono text-base font-black text-teal-700 break-all leading-none">
                    {detailItem.targetProductId}
                  </p>
                </div>
              </div>
              <div className="bg-slate-50 p-8 rounded-[35px] border-2 border-slate-100 text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                  Infor-LN Omschrijving
                </p>
                <p className="font-black text-base text-slate-800 italic uppercase leading-relaxed">
                  "{detailItem.description || "-"}"
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm">
                  <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                    Type/Serie
                  </p>
                  <p className="font-black text-slate-800 text-xs italic truncate">
                    {detailItem.type} {detailItem.serie}
                  </p>
                </div>
                <div className="p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm">
                  <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                    Afmeting
                  </p>
                  <p className="font-mono font-black text-slate-800 text-xs">
                    DN{detailItem.dn} / PN{detailItem.pn}
                  </p>
                </div>
                <div className="p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm">
                  <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                    Ends
                  </p>
                  <p className="font-black text-slate-800 text-xs italic">
                    {detailItem.ends || "CB/CB"}
                  </p>
                </div>
              </div>
              
              <div className="pt-6 border-t border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                  Extra Eigenschappen
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "Sheet", label: "Sheet" },
                    { key: "Rev", label: "Revisie" },
                    { key: "Variant", label: "Variant" },
                    { key: "Item Code Total", label: "Full Code" },
                    { key: "DN1 [mm]", label: "DN1" },
                    { key: "Drilling", label: "Drilling" },
                    { key: "End1", label: "End 1" },
                    { key: "End2", label: "End 2" },
                    { key: "PN/PU [bar]", label: "PN/PU" },
                    { key: "PU [bar]", label: "PU" }
                  ].map(({ key, label }) => {
                    const val = detailItem[key];
                    if (!val) return null;
                    return (
                      <div key={key} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{label}</p>
                        <p className="text-xs font-bold text-slate-700 break-all">{val}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col border border-white/10">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="text-left">
                <h3 className="text-3xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">
                  {isCreating ? "Nieuwe" : "Mapping"}{" "}
                  <span className="text-teal-600">Config</span>
                </h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase mt-3 tracking-widest italic leading-none">
                  Record Editor v6.0
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsCreating(false);
                }}
                className="p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all"
              >
                <X size={28} />
              </button>
            </div>

            <div className="p-12 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar text-left">
              <div className="grid grid-cols-2 gap-8 text-left">
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block italic">
                    Bron: Old Item Code
                  </label>
                  <input
                    disabled={!isCreating}
                    value={editingItem.manufacturedId}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        manufacturedId: e.target.value,
                      })
                    }
                    className={`w-full p-5 rounded-[22px] text-lg font-black font-mono border-2 transition-all outline-none ${
                      !isCreating
                        ? "bg-slate-100 border-slate-200 text-slate-400 italic"
                        : "bg-slate-50 border-slate-100 focus:border-teal-500 focus:bg-white shadow-inner"
                    }`}
                    placeholder="CODE..."
                  />
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest ml-2 block italic">
                    Doel: New Item Code
                  </label>
                  <input
                    value={editingItem.targetProductId}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        targetProductId: e.target.value,
                      })
                    }
                    className="w-full p-5 bg-teal-50/30 border-2 border-teal-100 rounded-[22px] text-lg font-black font-mono text-teal-700 outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner"
                    placeholder="DRAWING..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-50">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Product Type
                  </label>
                  <input
                    value={editingItem.type}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, type: e.target.value })
                    }
                    className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Serie
                  </label>
                  <input
                    value={editingItem.serie}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, serie: e.target.value })
                    }
                    className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left pt-6 border-t border-slate-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                  Label / Groep
                </label>
                <input
                  value={editingItem.label || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, label: e.target.value })
                  }
                  className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500"
                  placeholder="Bijv. Wavistrong"
                />
              </div>

              <div className="pt-6 border-t border-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">
                  Dimensies (a-n)
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-1 block text-center">{key.toUpperCase()}</label>
                      <input
                        value={editingItem[key] || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, [key]: e.target.value })}
                        className="w-full p-2 bg-slate-50 border-2 border-slate-100 rounded-lg font-mono text-xs font-bold text-center outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 text-left">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Diameter (DN)
                  </label>
                  <input
                    type="number"
                    value={editingItem.dn}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, dn: e.target.value })
                    }
                    className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Druk (PN)
                  </label>
                  <input
                    type="number"
                    value={editingItem.pn}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, pn: e.target.value })
                    }
                    className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left pt-6 border-t border-slate-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                  Infor-LN Beschrijving
                </label>
                <textarea
                  rows="3"
                  value={editingItem.description}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      description: e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-[30px] font-bold text-sm italic outline-none focus:border-blue-500 resize-none shadow-inner"
                  placeholder="..."
                />
              </div>

              <button
                onClick={handleSaveEdit}
                disabled={uploading}
                className="w-full py-7 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-teal-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 mt-6"
              >
                {uploading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={24} />
                )}
                {isCreating ? "Configuratie Vastleggen" : "Mapping Bijwerken"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
