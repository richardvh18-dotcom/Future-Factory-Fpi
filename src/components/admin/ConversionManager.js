import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, Database, Search, Edit2, Trash2, Save, RefreshCw, X, FileSpreadsheet, Plus, ChevronDown, ShieldCheck, Zap, ChevronRight, DatabaseZap, ArrowRightLeft, Loader2, Box, } from "lucide-react";
import { parseCSV, lookupProductByManufacturedId, fetchConversions, uploadConversionBatch, deleteConversion, } from "../../utils/conversionLogic";
import { manualSyncDrawings } from "../../utils/manualSyncDrawings";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";
import { deleteAllConversionRecords, upsertConversionRecord } from "../../services/planningSecurityService";
/**
 * ConversionManager V6.0 - Root Integrated
 * De brug tussen Infor-LN Planning en de Technische Catalogus.
 * Locatie: /future-factory/settings/conversions/mapping/records/
 */
export default function ConversionManager() {
    const { showConfirm, notify } = useNotifications();
    const [activeTab, setActiveTab] = useState("upload");
    // Upload State
    const [fileData, setFileData] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [, setProgress] = useState(0);
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
    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
    const [syncResults, setSyncResults] = useState(null);
    // Sync Search State
    const [syncSearchTerm, setSyncSearchTerm] = useState("");
    const [syncSearchLoading, setSyncSearchLoading] = useState(false);
    const [syncSearchResults, setSyncSearchResults] = useState(null);
    // Helper: Valideer en zet data
    const validateAndSetData = (data) => {
        if (data.length > 0) {
            const firstRow = data[0];
            const hasOldCode = firstRow["Old Item Code"] || firstRow["Item Code"] || firstRow["manufacturedId"];
            if (!hasOldCode)
                throw new Error("Kolom 'Old Item Code' of 'manufacturedId' niet gevonden.");
        }
        else {
            throw new Error("Het bestand is leeg of het tabblad bevat geen data.");
        }
        setFileData(data);
        setStatus("ready");
    };
    // Helper: Process imported data (add label + normalize keys)
    const processImportData = (data, label) => {
        return data.map((item) => {
            const newItem = { ...item };
            if (label)
                newItem.label = label;
            // Mapping van Excel kolommen naar interne veldnamen
            if (item["Old Item Code"])
                newItem.manufacturedId = item["Old Item Code"];
            if (item["Item Code"])
                newItem.manufacturedId = item["Item Code"];
            if (item["New Item Code"])
                newItem.targetProductId = item["New Item Code"];
            if (item["Target Code"])
                newItem.targetProductId = item["Target Code"];
            if (item["Description"])
                newItem.description = item["Description"];
            if (item["Item Description"])
                newItem.description = item["Item Description"];
            if (item["Omschrijving"])
                newItem.description = item["Omschrijving"];
            if (item["Type Description"])
                newItem.description = item["Type Description"];
            if (item["Type"])
                newItem.type = item["Type"];
            if (item["Serie"])
                newItem.serie = item["Serie"];
            if (item["DN"])
                newItem.dn = item["DN"];
            if (item["DN [mm]"])
                newItem.dn = item["DN [mm]"];
            if (item["PN"])
                newItem.pn = item["PN"];
            if (item["PN [bar]"])
                newItem.pn = item["PN [bar]"];
            if (item["Ends"])
                newItem.ends = item["Ends"];
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
        if (!file)
            return;
        setStatus("processing");
        const isExcel = file.name.toLowerCase().endsWith(".xlsx") ||
            file.name.toLowerCase().endsWith(".xls");
        try {
            let parsedData = [];
            if (isExcel) {
                const XLSX = await import("xlsx");
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
            }
            else {
                const text = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(file);
                });
                parsedData = processImportData(parseCSV(text), null);
            }
            validateAndSetData(parsedData);
        }
        catch (err) {
            console.error(err);
            notify("Fout bij lezen bestand: " + err.message);
            setStatus("error");
        }
    };
    const handleToggleSheet = (sheetName) => {
        setSelectedSheets((prev) => prev.includes(sheetName)
            ? prev.filter((n) => n !== sheetName)
            : [...prev, sheetName]);
    };
    const handleConfirmSheetSelection = async () => {
        if (selectedSheets.length === 0)
            return;
        try {
            const XLSX = await import("xlsx");
            let allData = [];
            selectedSheets.forEach((name) => {
                const ws = workbook.Sheets[name];
                const data = processImportData(XLSX.utils.sheet_to_json(ws), name);
                allData = [...allData, ...data];
            });
            validateAndSetData(allData);
        }
        catch (err) {
            notify("Fout bij laden tabbladen: " + err.message);
            resetUpload();
        }
    };
    const handleFullImport = async () => {
        if (fileData.length === 0)
            return;
        setUploading(true);
        setStatus("uploading");
        try {
            const total = fileData.length;
            await uploadConversionBatch(fileData, null, setProgress);
            await logActivity(auth.currentUser?.uid, "MATRIX_UPDATE", `Batch import conversion matrix: ${total} records`);
            setStatus("done");
            notify(`Import voltooid! ${total} records naar de root geschreven.`);
            resetUpload();
        }
        catch (error) {
            console.error(error);
            notify("Fout tijdens uploaden: " + error.message);
            setStatus("error");
        }
        finally {
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
        if (!testCode)
            return;
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
            const { data, lastDoc: newLastDoc } = await fetchConversions(null, null, PAGE_SIZE);
            setConversions(data);
            setLastDoc(newLastDoc);
            setHasMore(data.length === PAGE_SIZE);
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoadingList(false);
        }
    };
    const loadMoreConversions = async () => {
        if (!lastDoc || loadingMore)
            return;
        setLoadingMore(true);
        try {
            const { data, lastDoc: newLastDoc } = await fetchConversions(null, lastDoc, PAGE_SIZE);
            setConversions((prev) => [...prev, ...data]);
            setLastDoc(newLastDoc);
            setHasMore(data.length === PAGE_SIZE);
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoadingMore(false);
        }
    };
    // Live Search Effect
    useEffect(() => {
        if (activeTab !== "manage")
            return;
        const timer = setTimeout(async () => {
            if (searchTerm.length >= 3) {
                setLoadingList(true);
                try {
                    const term = searchTerm.trim().toUpperCase();
                    // Zoek op LN Code (Manufactured ID)
                    const q1 = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("manufacturedId", ">=", term), where("manufacturedId", "<=", term + "\uf8ff"), limit(50));
                    // Zoek op Tekening Code (Target Product ID)
                    const q2 = query(collection(db, ...PATHS.CONVERSION_MATRIX), where("targetProductId", ">=", term), where("targetProductId", "<=", term + "\uf8ff"), limit(50));
                    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                    const resultsMap = new Map();
                    snap1.docs.forEach((doc) => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                    snap2.docs.forEach((doc) => resultsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                    setConversions(Array.from(resultsMap.values()));
                    setHasMore(false);
                }
                catch (err) {
                    console.error("Search error:", err);
                }
                finally {
                    setLoadingList(false);
                }
            }
            else if (searchTerm === "") {
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
            const result = await deleteAllConversionRecords();
            if (!result?.deleted) {
                notify("Database is al leeg.");
                setUploading(false);
                return;
            }
            notify("Alle items zijn verwijderd.");
            setConversions([]);
            setLastDoc(null);
            loadInitialConversions();
        }
        catch (err) {
            console.error(err);
            notify("Fout bij verwijderen: " + err.message);
        }
        finally {
            setUploading(false);
        }
    };
    const handleSaveEdit = async () => {
        if (!editingItem?.manufacturedId)
            return;
        setUploading(true);
        try {
            await upsertConversionRecord({
                recordId: editingItem.manufacturedId.toUpperCase(),
                recordData: {
                    ...editingItem,
                    manufacturedId: editingItem.manufacturedId.toUpperCase(),
                },
            });
            await logActivity(auth.currentUser?.uid, "MATRIX_UPDATE", `Conversion record updated: ${editingItem.manufacturedId}`);
            setEditingItem(null);
            setIsCreating(false);
            loadInitialConversions();
        }
        catch (err) {
            notify("Opslaan mislukt: " + err.message);
        }
        finally {
            setUploading(false);
        }
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirm({
            title: 'Koppeling verwijderen',
            message: `Koppeling ${id} permanent wissen uit de root?`,
            confirmText: 'Verwijderen',
            cancelText: 'Annuleren',
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            await deleteConversion(null, id);
            await logActivity(auth.currentUser?.uid, "MATRIX_UPDATE", `Conversion record deleted: ${id}`);
            setConversions((prev) => prev.filter((c) => c.id !== id));
        }
        catch (err) {
            notify("Fout bij verwijderen: " + err.message);
        }
    };
    const filteredList = useMemo(() => {
        if (!searchTerm)
            return conversions;
        const q = searchTerm.toLowerCase();
        return conversions.filter((c) => c.manufacturedId?.toLowerCase().includes(q) ||
            c.targetProductId?.toLowerCase().includes(q));
    }, [conversions, searchTerm]);
    const handleSyncSearch = async () => {
        const q = syncSearchTerm.trim();
        if (!q || q.length < 3)
            return;
        setSyncSearchLoading(true);
        setSyncSearchResults(null);
        try {
            const qUpper = q.toUpperCase();
            const qLower = q.toLowerCase();
            const results = { conversions: [], planning: [], products: [], chain: null };
            // 1. Conversie Matrix - zoek op manufacturedId en targetProductId
            const convRef = collection(db, ...PATHS.CONVERSION_MATRIX);
            const convSnap = await getDocs(convRef);
            convSnap.docs.forEach((d) => {
                const c = d.data();
                const mid = (c.manufacturedId || "").toUpperCase();
                const tid = (c.targetProductId || "").toUpperCase();
                const desc = (c.description || "").toLowerCase();
                if (mid.includes(qUpper) || tid.includes(qUpper) || desc.includes(qLower) || d.id.toUpperCase().includes(qUpper)) {
                    results.conversions.push({ id: d.id, ...c });
                }
            });
            // 2. Planning - zoek op itemCode, item, productId, doc id
            const planRef = collection(db, ...PATHS.PLANNING);
            const planSnap = await getDocs(planRef);
            planSnap.docs.forEach((d) => {
                const p = d.data();
                const fields = [d.id, p.itemCode, p.item, p.productId, p.manufacturedId, p.articleCode, p.drawing].filter(Boolean);
                if (fields.some((f) => String(f).toUpperCase().includes(qUpper))) {
                    results.planning.push({ id: d.id, ...p });
                }
            });
            // 3. Products - zoek op articleCode, name, id
            const prodRef = collection(db, ...PATHS.PRODUCTS);
            const prodSnap = await getDocs(prodRef);
            const allProducts = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            allProducts.forEach((p) => {
                const fields = [p.id, p.articleCode, p.name, p.manufacturedId, p.erpCode, p.productCode].filter(Boolean);
                if (fields.some((f) => String(f).toUpperCase().includes(qUpper))) {
                    results.products.push(p);
                }
            });
            // 4. Chain Trace: auto-follow conversie target → zoek product (incl. materiaalvarianten CST↔EST)
            if (results.conversions.length > 0 && results.products.length === 0) {
                const targetCodes = [...new Set(results.conversions.map((c) => c.targetProductId).filter(Boolean))];
                // Genereer ook materiaalvarianten (CST↔EST positie 6)
                const allTargetCodes = [...targetCodes];
                targetCodes.forEach((tc) => {
                    const u = tc.toUpperCase();
                    if (u.length >= 8) {
                        if (u[6] === "C")
                            allTargetCodes.push(u.slice(0, 6) + "E" + u.slice(7));
                        else if (u[6] === "E")
                            allTargetCodes.push(u.slice(0, 6) + "C" + u.slice(7));
                    }
                });
                const uniqueTargets = [...new Set(allTargetCodes.map((c) => c.toUpperCase()))];
                const followProducts = [];
                for (const tcUpper of uniqueTargets) {
                    allProducts.forEach((p) => {
                        const fields = [p.id, p.articleCode, p.name, p.manufacturedId, p.erpCode, p.productCode].filter(Boolean);
                        if (fields.some((f) => String(f).toUpperCase().includes(tcUpper))) {
                            if (!followProducts.some((fp) => fp.id === p.id))
                                followProducts.push(p);
                        }
                    });
                }
                results.chain = {
                    sourceCode: q,
                    targetCodes,
                    variantCodes: allTargetCodes.filter((c) => !targetCodes.map((t) => t.toUpperCase()).includes(c.toUpperCase())),
                    targetProducts: followProducts,
                };
            }
            setSyncSearchResults(results);
        }
        catch (err) {
            console.error("Search error:", err);
            setSyncSearchResults({ conversions: [], planning: [], products: [], error: err.message });
        }
        finally {
            setSyncSearchLoading(false);
        }
    };
    const handleDrawingSync = async () => {
        setIsSyncing(true);
        setSyncResults(null);
        setSyncProgress({ current: 0, total: 0 });
        try {
            const results = await manualSyncDrawings((current, total) => {
                setSyncProgress({ current, total });
            });
            setSyncResults(results);
            await logActivity(auth.currentUser?.uid, "DRAWING_SYNC", `Tekeningen sync: ${results.filter(r => r.found).length}/${results.length} matches`);
        }
        catch (err) {
            console.error("Sync error:", err);
            setSyncResults([{ code: "ERROR", found: false, error: err.message }]);
        }
        finally {
            setIsSyncing(false);
        }
    };
    return (_jsxs("div", { className: "h-full flex flex-col p-6 animate-in fade-in duration-500 text-left", children: [_jsxs("div", { className: "mb-10 flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(ArrowRightLeft, { size: 120 }) }), _jsxs("div", { className: "text-left relative z-10 flex items-center gap-6", children: [_jsx("div", { className: "p-4 bg-teal-600 text-white rounded-[22px] shadow-xl shadow-teal-100", children: _jsx(DatabaseZap, { size: 32 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h1", { className: "text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-none", children: ["Conversie ", _jsx("span", { className: "text-teal-600", children: "Matrix" })] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic", children: [_jsx(ShieldCheck, { size: 10 }), " Root Protected"] }), _jsxs("p", { className: "text-[9px] font-mono text-slate-400 uppercase tracking-widest italic", children: ["Sync: /", PATHS.CONVERSION_MATRIX.join("/")] })] })] })] }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-2xl relative z-10", children: [_jsxs("button", { onClick: () => setActiveTab("upload"), className: `flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "upload"
                                    ? "bg-white text-teal-600 shadow-sm border border-slate-200"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Upload, { size: 14 }), " Import"] }), _jsxs("button", { onClick: () => setActiveTab("manage"), className: `flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "manage"
                                    ? "bg-white text-teal-600 shadow-sm border border-slate-200"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(Database, { size: 14 }), " Database"] }), _jsxs("button", { onClick: () => setActiveTab("sync"), className: `flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "sync"
                                    ? "bg-white text-purple-600 shadow-sm border border-slate-200"
                                    : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(RefreshCw, { size: 14 }), " Tekeningen Sync"] })] })] }), _jsx("div", { className: "flex-1 overflow-hidden", children: activeTab === "sync" ? (_jsxs("div", { className: "bg-white rounded-[45px] p-10 shadow-sm border border-slate-200 space-y-8 max-w-4xl mx-auto overflow-y-auto custom-scrollbar", style: { maxHeight: 'calc(100vh - 300px)' }, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(RefreshCw, { size: 16, className: "text-purple-500" }), " Tekeningen Sync"] }), _jsxs("button", { onClick: handleDrawingSync, disabled: isSyncing, className: "flex items-center gap-3 px-8 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50", children: [isSyncing ? (_jsx(Loader2, { size: 18, className: "animate-spin" })) : (_jsx(RefreshCw, { size: 18 })), isSyncing ? "Bezig..." : "Start Sync"] })] }), _jsx("p", { className: "text-sm text-slate-500", children: "Koppelt planning orders aan producten uit de catalogus via de conversie matrix. Orders zonder tekening worden automatisch bijgewerkt." }), _jsxs("div", { className: "space-y-4", children: [_jsx("h4", { className: "text-[10px] font-black uppercase text-slate-400 tracking-widest", children: "Zoeken in alle collecties" }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { size: 16, className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { type: "text", value: syncSearchTerm, onChange: (e) => setSyncSearchTerm(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleSyncSearch(), placeholder: "Zoek op code, artikelnr, naam... (min 3 tekens)", className: "w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none" })] }), _jsx("button", { onClick: handleSyncSearch, disabled: syncSearchLoading || syncSearchTerm.trim().length < 3, className: "px-6 py-3 bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-all disabled:opacity-40", children: syncSearchLoading ? _jsx(Loader2, { size: 16, className: "animate-spin" }) : _jsx(Search, { size: 16 }) })] }), syncSearchResults && (_jsxs("div", { className: "space-y-4 animate-in fade-in", children: [syncSearchResults.error && (_jsxs("div", { className: "bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl border border-red-100", children: [_jsx(AlertTriangle, { size: 12, className: "inline mr-1" }), " ", syncSearchResults.error] })), _jsxs("details", { open: syncSearchResults.conversions.length > 0, className: "group", children: [_jsxs("summary", { className: "flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-teal-600 py-2", children: [_jsx(ArrowRightLeft, { size: 14 }), "Conversie Matrix", _jsx("span", { className: "ml-auto bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-[10px]", children: syncSearchResults.conversions.length })] }), syncSearchResults.conversions.length > 0 ? (_jsxs("div", { className: "border border-teal-100 rounded-xl overflow-hidden mt-2", children: [_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2 bg-teal-50 text-[8px] font-black uppercase text-teal-400 tracking-widest", children: [_jsx("span", { children: "Source (Old Code)" }), _jsx("span", { children: "Target (New Code)" }), _jsx("span", { children: "Omschrijving" })] }), _jsx("div", { className: "max-h-[200px] overflow-y-auto custom-scrollbar divide-y divide-teal-50", children: syncSearchResults.conversions.slice(0, 50).map((c, i) => (_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2 text-xs", children: [_jsx("span", { className: "font-mono text-slate-700 truncate", title: c.manufacturedId, children: c.manufacturedId || c.id }), _jsx("span", { className: "font-mono text-teal-700 truncate", title: c.targetProductId, children: c.targetProductId || "-" }), _jsx("span", { className: "text-slate-500 truncate", title: c.description, children: c.description || "-" })] }, i))) })] })) : (_jsx("p", { className: "text-xs text-slate-400 italic mt-1", children: "Geen resultaten in conversie matrix" }))] }), _jsxs("details", { open: syncSearchResults.planning.length > 0, className: "group", children: [_jsxs("summary", { className: "flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-blue-600 py-2", children: [_jsx(FileText, { size: 14 }), "Planning Orders", _jsx("span", { className: "ml-auto bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px]", children: syncSearchResults.planning.length })] }), syncSearchResults.planning.length > 0 ? (_jsxs("div", { className: "border border-blue-100 rounded-xl overflow-hidden mt-2", children: [_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-blue-50 text-[8px] font-black uppercase text-blue-400 tracking-widest", children: [_jsx("span", { children: "Doc ID" }), _jsx("span", { children: "Item Code" }), _jsx("span", { children: "Omschrijving" }), _jsx("span", { children: "Tekening" })] }), _jsx("div", { className: "max-h-[200px] overflow-y-auto custom-scrollbar divide-y divide-blue-50", children: syncSearchResults.planning.slice(0, 50).map((p, i) => (_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 text-xs", children: [_jsx("span", { className: "font-mono text-slate-700 truncate", title: p.id, children: p.id }), _jsx("span", { className: "font-mono text-blue-700 truncate", title: p.itemCode, children: p.itemCode || "-" }), _jsx("span", { className: "text-slate-500 truncate", title: p.item, children: p.item || "-" }), _jsx("span", { className: `truncate ${p.drawing && p.drawing !== "-" ? "text-emerald-600 font-bold" : "text-slate-300"}`, title: p.drawing, children: p.drawing && p.drawing !== "-" ? p.drawing : "—" })] }, i))) })] })) : (_jsx("p", { className: "text-xs text-slate-400 italic mt-1", children: "Geen resultaten in planning" }))] }), _jsxs("details", { open: syncSearchResults.products.length > 0, className: "group", children: [_jsxs("summary", { className: "flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-purple-600 py-2", children: [_jsx(Box, { size: 14 }), "Product Catalogus", _jsx("span", { className: "ml-auto bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px]", children: syncSearchResults.products.length })] }), syncSearchResults.products.length > 0 ? (_jsxs("div", { className: "border border-purple-100 rounded-xl overflow-hidden mt-2", children: [_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2 bg-purple-50 text-[8px] font-black uppercase text-purple-400 tracking-widest", children: [_jsx("span", { children: "Doc ID" }), _jsx("span", { children: "Article Code" }), _jsx("span", { children: "Naam" })] }), _jsx("div", { className: "max-h-[200px] overflow-y-auto custom-scrollbar divide-y divide-purple-50", children: syncSearchResults.products.slice(0, 50).map((p, i) => (_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2 text-xs", children: [_jsx("span", { className: "font-mono text-slate-700 truncate", title: p.id, children: p.id }), _jsx("span", { className: "font-mono text-purple-700 truncate", title: p.articleCode, children: p.articleCode || "-" }), _jsx("span", { className: "text-slate-500 truncate", title: p.name, children: p.name || "-" })] }, i))) })] })) : (_jsx("p", { className: "text-xs text-slate-400 italic mt-1", children: "Geen resultaten in product catalogus" }))] }), syncSearchResults.chain && (_jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 animate-in fade-in", children: [_jsxs("h4", { className: "text-xs font-black uppercase text-amber-700 tracking-widest flex items-center gap-2", children: [_jsx(Zap, { size: 14 }), " Keten Analyse"] }), _jsxs("div", { className: "text-xs text-amber-800 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("span", { className: "font-mono bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold", children: syncSearchResults.chain.sourceCode }), _jsx(ChevronRight, { size: 14, className: "text-amber-400" }), syncSearchResults.chain.targetCodes.map((tc, i) => (_jsx("span", { className: "font-mono bg-teal-100 text-teal-700 px-2 py-1 rounded font-bold", children: tc }, i))), syncSearchResults.chain.variantCodes?.length > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-[9px] text-amber-500 font-bold uppercase", children: "+ materiaalvariant" }), syncSearchResults.chain.variantCodes.map((vc, i) => (_jsx("span", { className: "font-mono bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold border border-amber-300", children: vc }, i)))] })), _jsx(ChevronRight, { size: 14, className: "text-amber-400" }), syncSearchResults.chain.targetProducts.length > 0 ? (syncSearchResults.chain.targetProducts.map((p, i) => (_jsx("span", { className: "font-mono bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold", children: p.name || p.id }, i)))) : (_jsx("span", { className: "bg-red-100 text-red-600 px-2 py-1 rounded font-bold", children: "\u2716 Geen product gevonden voor target code!" }))] }), syncSearchResults.chain.targetProducts.length === 0 && (_jsxs("p", { className: "text-[11px] text-red-600 mt-2", children: ["De conversie matrix verwijst naar ", _jsx("strong", { className: "font-mono", children: syncSearchResults.chain.targetCodes.join(", ") }), " maar er bestaat geen product in de catalogus met die articleCode. Controleer of de target code klopt of voeg het product toe."] })), syncSearchResults.chain.targetProducts.length > 0 && (_jsxs("p", { className: "text-[11px] text-emerald-700 mt-2 flex items-center gap-1", children: [_jsx(CheckCircle2, { size: 12 }), " Keten compleet", syncSearchResults.chain.variantCodes?.length > 0 ? " (via materiaalvariant CST↔EST)" : "", " \u2014 dit product kan gekoppeld worden via de sync."] }))] })] }))] }))] }), isSyncing && syncProgress.total > 0 && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between text-xs font-bold text-slate-500", children: [_jsx("span", { children: "Voortgang" }), _jsxs("span", { children: [syncProgress.current, " / ", syncProgress.total] })] }), _jsx("div", { className: "w-full bg-slate-100 rounded-full h-3 overflow-hidden", children: _jsx("div", { className: "bg-purple-500 h-3 rounded-full transition-all duration-300", style: { width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` } }) })] })), syncResults && (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { className: "bg-emerald-50 rounded-2xl p-5 text-center border border-emerald-100", children: [_jsx("p", { className: "text-3xl font-black text-emerald-600", children: syncResults.filter(r => r.found).length }), _jsx("p", { className: "text-[9px] font-bold uppercase text-emerald-500 tracking-widest mt-1", children: "Gekoppeld" })] }), _jsxs("div", { className: "bg-orange-50 rounded-2xl p-5 text-center border border-orange-100", children: [_jsx("p", { className: "text-3xl font-black text-orange-600", children: syncResults.filter(r => !r.found && !r.error).length }), _jsx("p", { className: "text-[9px] font-bold uppercase text-orange-500 tracking-widest mt-1", children: "Geen match" })] }), _jsxs("div", { className: "bg-slate-50 rounded-2xl p-5 text-center border border-slate-200", children: [_jsx("p", { className: "text-3xl font-black text-slate-600", children: syncResults.length }), _jsx("p", { className: "text-[9px] font-bold uppercase text-slate-500 tracking-widest mt-1", children: "Totaal" })] })] }), _jsxs("div", { className: "border border-slate-200 rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-5 py-3 bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest", children: [_jsx("span", { children: "Planning Code" }), _jsx("span", { children: "Conversie Target" }), _jsx("span", { children: "Product" }), _jsx("span", { children: "Status" })] }), _jsx("div", { className: "max-h-[400px] overflow-y-auto custom-scrollbar divide-y divide-slate-100", children: syncResults.map((r, i) => (_jsxs("div", { className: `grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-5 py-3 text-xs ${r.found ? "bg-emerald-50/30" : ""}`, children: [_jsx("span", { className: "font-mono text-slate-700 truncate", title: r.code, children: r.code }), _jsx("span", { className: `font-mono truncate ${r.conversionTarget && !r.found ? "text-orange-600" : "text-slate-300"}`, title: r.conversionTarget || "", children: r.conversionTarget || (r.viaConversion ? "✓" : "—") }), _jsx("span", { className: "text-slate-500 truncate", title: r.product || "-", children: r.product || "-" }), _jsx("span", { children: r.found ? (_jsxs("span", { className: "flex items-center gap-1 text-emerald-600 font-bold", children: [_jsx(CheckCircle2, { size: 12 }), r.viaConversion ? "Via Matrix" : "Direct"] })) : r.error ? (_jsxs("span", { className: "flex items-center gap-1 text-red-500 font-bold", children: [_jsx(AlertTriangle, { size: 12 }), " Fout"] })) : r.conversionTarget ? (_jsxs("span", { className: "flex items-center gap-1 text-orange-500 font-bold whitespace-nowrap", children: [_jsx(AlertTriangle, { size: 12 }), " Target \u2260 Product"] })) : (_jsx("span", { className: "text-slate-400", children: "\u2014" })) })] }, i))) })] })] }))] })) : activeTab === "upload" ? (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-8 h-full overflow-y-auto custom-scrollbar pb-20", children: [_jsxs("div", { className: "bg-white rounded-[45px] p-10 shadow-sm border border-slate-200 space-y-8 flex flex-col", children: [_jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(FileSpreadsheet, { size: 16, className: "text-teal-500" }), " Stap 1: Bestand laden"] }), _jsx("div", { className: "border-4 border-dashed border-slate-50 rounded-[40px] p-12 text-center bg-slate-50/50 hover:border-teal-400 transition-all cursor-pointer group flex-1 flex flex-col items-center justify-center", children: status === "processing" ? (_jsxs("div", { className: "flex flex-col items-center animate-in fade-in", children: [_jsx(Loader2, { size: 64, className: "text-teal-500 animate-spin mb-6" }), _jsx("p", { className: "text-sm font-black text-slate-600 uppercase tracking-widest", children: "Bestand verwerken..." })] })) : (_jsxs(_Fragment, { children: [_jsx(FileSpreadsheet, { size: 64, className: "text-slate-200 group-hover:scale-110 group-hover:text-teal-500 transition-all mb-6" }), _jsx("p", { className: "text-sm font-black text-slate-600 uppercase tracking-widest mb-2", children: "Sleep Excel of CSV Bestand" }), _jsx("p", { className: "text-xs text-slate-400 font-medium max-w-[200px] leading-relaxed italic", children: "Kolommen: 'Old Item Code' & 'New Item Code'" }), _jsxs("label", { className: "mt-8 bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-teal-600 transition-all shadow-xl active:scale-95", children: ["Bestand Kiezen", _jsx("input", { type: "file", accept: ".csv, .xlsx, .xls", className: "hidden", onChange: handleFileUpload, onClick: (e) => (e.target.value = null) })] })] })) }), status === "selecting_sheet" && (_jsxs("div", { className: "animate-in slide-in-from-bottom-4 space-y-4", children: [_jsx("div", { className: "bg-blue-50 text-blue-700 p-4 rounded-2xl border border-blue-100 font-bold text-xs uppercase tracking-wide text-center", children: "Meerdere tabbladen gevonden. Selecteer welke je wilt importeren:" }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: sheetNames.map((name) => {
                                                const isSelected = selectedSheets.includes(name);
                                                return (_jsxs("button", { onClick: () => handleToggleSheet(name), className: `p-4 border-2 rounded-xl text-left transition-all group relative ${isSelected
                                                        ? "bg-teal-50 border-teal-500"
                                                        : "bg-white border-slate-100 hover:border-teal-300"}`, children: [_jsx("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1", children: "Sheet" }), _jsx("span", { className: `font-bold ${isSelected ? "text-teal-700" : "text-slate-800"}`, children: name }), isSelected && (_jsx("div", { className: "absolute top-2 right-2 text-teal-600", children: _jsx(CheckCircle2, { size: 16 }) }))] }, name));
                                            }) }), _jsxs("div", { className: "flex gap-3 pt-2", children: [_jsx("button", { onClick: () => setSelectedSheets(sheetNames), className: "flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all", children: "Alles Selecteren" }), _jsxs("button", { onClick: handleConfirmSheetSelection, disabled: selectedSheets.length === 0, className: "flex-[2] py-3 bg-teal-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed", children: ["Importeer ", selectedSheets.length, " Sheet", selectedSheets.length !== 1 && 's'] })] })] })), status === "ready" && (_jsxs("div", { className: "animate-in slide-in-from-bottom-4", children: [_jsxs("div", { className: "bg-emerald-50 text-emerald-700 p-6 rounded-3xl border-2 border-emerald-100 mb-6 font-black uppercase text-xs tracking-widest flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(CheckCircle2, { size: 20 }), " ", fileData.length, " Mappings Gevonden"] }), _jsx("span", { className: "text-[10px] bg-white px-2 py-1 rounded shadow-sm italic", children: "Status: Gereed voor Root" })] }), _jsxs("button", { onClick: handleFullImport, disabled: uploading, className: "w-full bg-teal-600 text-white py-6 rounded-[30px] font-black uppercase text-xs tracking-[0.3em] hover:bg-teal-700 transition-all shadow-xl flex items-center justify-center gap-4 active:scale-95", children: [uploading ? (_jsx(Loader2, { size: 20, className: "animate-spin" })) : (_jsx(Zap, { size: 20 })), "Start Batch Import naar Root"] })] }))] }), _jsxs("div", { className: "bg-white rounded-[45px] p-10 shadow-sm border border-slate-200 space-y-8 flex flex-col", children: [_jsxs("h3", { className: "text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3 italic", children: [_jsx(Search, { size: 16, className: "text-blue-500" }), " Stap 2: Validatie Test"] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "relative group", children: [_jsx(Search, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-all", size: 20 }), _jsx("input", { type: "text", placeholder: "Voer een planning-code in...", className: "w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-slate-100 rounded-[25px] font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner text-sm uppercase", value: testCode, onChange: (e) => setTestCode(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleTestLookup() }), _jsx("button", { onClick: handleTestLookup, className: "absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 active:scale-90 transition-all", children: _jsx(ChevronRight, { size: 18, strokeWidth: 3 }) })] }), testResult && (_jsxs("div", { className: "bg-slate-900 rounded-[35px] p-8 text-white animate-in zoom-in-95 relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5", children: _jsx(Zap, { size: 100 }) }), testResult.error ? (_jsxs("div", { className: "flex flex-col items-center gap-4 py-10 opacity-60", children: [_jsx(AlertTriangle, { size: 48, className: "text-rose-500" }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-[0.3em]", children: testResult.error })] })) : (_jsxs("div", { className: "space-y-6 text-left relative z-10", children: [_jsxs("div", { className: "grid grid-cols-2 gap-6", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: "Bron (Infor-LN)" }), _jsx("p", { className: "font-mono text-xs font-bold text-teal-400 break-all", children: testResult.manufacturedId })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: "Doel (Tekening)" }), _jsx("p", { className: "font-mono text-sm font-black text-white break-all", children: testResult.targetProductId })] })] }), _jsxs("div", { className: "pt-4 border-t border-white/10", children: [_jsx("span", { className: "text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: "Resultaat Beschrijving" }), _jsx("p", { className: "text-sm font-bold italic text-slate-300", children: testResult.description ||
                                                                        "Geen omschrijving beschikbaar." })] }), testResult.isFallback && (_jsxs("div", { className: "bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center gap-3", children: [_jsx(AlertTriangle, { size: 14, className: "text-amber-500" }), _jsx("span", { className: "text-[9px] font-black text-amber-500 uppercase tracking-widest", children: "Smart Fallback naar EST Template" })] }))] }))] }))] })] })] })) : (
                /* TAB 2: DATABASE BEHEER */
                _jsxs("div", { className: "bg-white rounded-[50px] shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden animate-in fade-in", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex flex-col sm:row justify-between items-center gap-4 bg-slate-50/30", children: [_jsxs("div", { className: "relative w-full max-w-md group", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-teal-600 transition-colors", size: 20 }), _jsx("input", { type: "text", placeholder: "Filter op code of tekening...", className: "pl-12 pr-4 py-3.5 w-full bg-white border-2 border-slate-100 rounded-[22px] outline-none focus:border-teal-500 shadow-sm font-bold text-sm", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), _jsxs("div", { className: "flex gap-3", children: [_jsxs("button", { onClick: () => {
                                                handleCreateNew();
                                                setActiveTab("manage");
                                            }, className: "bg-teal-600 text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-teal-700 transition-all shadow-lg active:scale-95", children: [_jsx(Plus, { size: 18, strokeWidth: 3 }), " Handmatig Toevoegen"] }), _jsx("button", { onClick: handleDeleteAll, disabled: uploading || loadingList, className: "p-3.5 bg-white text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl border border-slate-200 transition-all shadow-sm disabled:opacity-50", title: "Alles Verwijderen", children: uploading ? _jsx(Loader2, { className: "animate-spin", size: 20 }) : _jsx(Trash2, { size: 20 }) }), _jsx("button", { onClick: loadInitialConversions, className: "p-3.5 bg-white text-slate-400 hover:text-teal-600 rounded-2xl border border-slate-200 transition-all shadow-sm", children: _jsx(RefreshCw, { size: 20 }) })] })] }), _jsxs("div", { className: "flex-1 overflow-auto custom-scrollbar", children: [_jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { className: "bg-slate-50/80 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-slate-100 backdrop-blur-md shadow-sm", children: _jsxs("tr", { children: [_jsx("th", { className: "px-10 py-5", children: "Planning Code (Source)" }), _jsx("th", { className: "px-10 py-5 text-teal-600", children: "Tekening Code (Target)" }), _jsx("th", { className: "px-10 py-5", children: "Configuratie" }), _jsx("th", { className: "px-10 py-5 text-right", children: "Beheer" })] }) }), _jsxs("tbody", { className: "divide-y divide-slate-50", children: [filteredList.map((item) => (_jsxs("tr", { className: "hover:bg-blue-50/30 cursor-pointer transition-all group", onClick: () => setDetailItem(item), children: [_jsx("td", { className: "px-10 py-4", children: _jsx("code", { className: "text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase tracking-tighter", children: item.manufacturedId }) }), _jsx("td", { className: "px-10 py-4", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(FileText, { size: 16, className: "text-blue-400" }), _jsx("span", { className: "font-mono text-sm font-black text-blue-700 uppercase tracking-tight", children: item.targetProductId })] }) }), _jsx("td", { className: "px-10 py-4", children: _jsxs("div", { className: "flex flex-col text-left", children: [_jsxs("span", { className: "text-xs font-black text-slate-800 uppercase italic tracking-tighter", children: [item.type, " ", item.serie] }), _jsxs("span", { className: "text-[9px] font-bold text-slate-400 uppercase tracking-widest", children: ["DN", item.dn, " / PN", item.pn] }), item.label && (_jsx("span", { className: "text-[8px] font-bold text-teal-600 uppercase tracking-widest mt-0.5", children: item.label }))] }) }), _jsx("td", { className: "px-10 py-4 text-right", children: _jsxs("div", { className: "flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all", children: [_jsx("button", { onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            setIsCreating(false);
                                                                            setEditingItem(item);
                                                                        }, className: "p-3 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all", title: "Bewerken", children: _jsx(Edit2, { size: 18 }) }), _jsx("button", { onClick: (e) => {
                                                                            e.stopPropagation();
                                                                            handleDelete(item.id);
                                                                        }, className: "p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all", title: "Wissen", children: _jsx(Trash2, { size: 18 }) })] }) })] }, item.id))), filteredList.length === 0 && !loadingList && (_jsx("tr", { children: _jsxs("td", { colSpan: "4", className: "py-32 text-center opacity-30 italic", children: [_jsx(Database, { size: 64, className: "mx-auto mb-4 text-slate-200" }), _jsx("p", { className: "text-sm font-black uppercase tracking-[0.3em] text-slate-400", children: "Geen koppelingen gevonden" })] }) }))] })] }), _jsx("div", { className: "p-8 flex justify-center border-t border-slate-50 bg-slate-50/30", children: loadingList ? (_jsx(Loader2, { className: "animate-spin text-teal-500" })) : hasMore && !searchTerm ? (_jsx("button", { onClick: loadMoreConversions, disabled: loadingMore, className: "px-10 py-4 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all shadow-sm flex items-center gap-3 active:scale-95", children: loadingMore ? (_jsx(Loader2, { className: "animate-spin", size: 14 })) : (_jsxs(_Fragment, { children: ["Meer Records Laden ", _jsx(ChevronDown, { size: 14 })] })) })) : (_jsxs("div", { className: "flex items-center gap-2 text-slate-300 italic text-[10px] font-bold uppercase tracking-widest", children: [_jsx(ShieldCheck, { size: 14 }), " Einde van Mapping Catalogus"] })) })] })] })) }), detailItem && (_jsx("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 border border-white/10", children: [_jsxs("div", { className: "bg-slate-950 p-10 flex justify-between items-start text-left", children: [_jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-3xl font-black text-white italic tracking-tighter uppercase leading-none", children: ["Mapping ", _jsx("span", { className: "text-teal-400", children: "Detail" })] }), _jsx("p", { className: "text-slate-500 text-[10px] font-bold uppercase mt-3 tracking-widest italic", children: "Conversie Matrix Node Integrity" })] }), _jsx("button", { onClick: () => setDetailItem(null), className: "p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-400 transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "p-10 space-y-8 text-left", children: [_jsxs("div", { className: "grid grid-cols-2 gap-6 text-left", children: [_jsxs("div", { className: "bg-slate-50 p-6 rounded-[30px] border-2 border-slate-100 text-left", children: [_jsx("p", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1", children: "Bron (Planning)" }), _jsx("p", { className: "font-mono text-sm font-black text-slate-700 break-all", children: detailItem.manufacturedId })] }), _jsxs("div", { className: "bg-teal-50 p-6 rounded-[30px] border-2 border-teal-100 text-left shadow-lg shadow-teal-900/5", children: [_jsx("p", { className: "text-[10px] font-black text-teal-400 uppercase tracking-widest mb-2 ml-1", children: "Doel (Tekening)" }), _jsx("p", { className: "font-mono text-base font-black text-teal-700 break-all leading-none", children: detailItem.targetProductId })] })] }), _jsxs("div", { className: "bg-slate-50 p-8 rounded-[35px] border-2 border-slate-100 text-left", children: [_jsx("p", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1", children: "Infor-LN Omschrijving" }), _jsxs("p", { className: "font-black text-base text-slate-800 italic uppercase leading-relaxed", children: ["\"", detailItem.description || "-", "\""] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4 text-center", children: [_jsxs("div", { className: "p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm", children: [_jsx("p", { className: "text-[8px] font-black uppercase text-slate-400 mb-1", children: "Type/Serie" }), _jsxs("p", { className: "font-black text-slate-800 text-xs italic truncate", children: [detailItem.type, " ", detailItem.serie] })] }), _jsxs("div", { className: "p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm", children: [_jsx("p", { className: "text-[8px] font-black uppercase text-slate-400 mb-1", children: "Afmeting" }), _jsxs("p", { className: "font-mono font-black text-slate-800 text-xs", children: ["DN", detailItem.dn, " / PN", detailItem.pn] })] }), _jsxs("div", { className: "p-5 bg-white border-2 border-slate-100 rounded-3xl shadow-sm", children: [_jsx("p", { className: "text-[8px] font-black uppercase text-slate-400 mb-1", children: "Ends" }), _jsx("p", { className: "font-black text-slate-800 text-xs italic", children: detailItem.ends || "CB/CB" })] })] }), _jsxs("div", { className: "pt-6 border-t border-slate-50", children: [_jsx("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1", children: "Extra Eigenschappen" }), _jsx("div", { className: "grid grid-cols-2 gap-4", children: [
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
                                                if (!val)
                                                    return null;
                                                return (_jsxs("div", { className: "bg-slate-50 p-3 rounded-xl border border-slate-100", children: [_jsx("p", { className: "text-[8px] font-black text-slate-400 uppercase mb-1", children: label }), _jsx("p", { className: "text-xs font-bold text-slate-700 break-all", children: val })] }, key));
                                            }) })] })] })] }) })), editingItem && (_jsx("div", { className: "fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6", children: _jsxs("div", { className: "bg-white rounded-[50px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col border border-white/10", children: [_jsxs("div", { className: "p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-3xl font-black text-slate-900 italic tracking-tighter uppercase leading-none", children: [isCreating ? "Nieuwe" : "Mapping", " ", _jsx("span", { className: "text-teal-600", children: "Config" })] }), _jsx("p", { className: "text-slate-400 text-[10px] font-bold uppercase mt-3 tracking-widest italic leading-none", children: "Record Editor v6.0" })] }), _jsx("button", { onClick: () => {
                                        setEditingItem(null);
                                        setIsCreating(false);
                                    }, className: "p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "p-12 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar text-left", children: [_jsxs("div", { className: "grid grid-cols-2 gap-8 text-left", children: [_jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block italic", children: "Bron: Old Item Code" }), _jsx("input", { disabled: !isCreating, value: editingItem.manufacturedId, onChange: (e) => setEditingItem({
                                                        ...editingItem,
                                                        manufacturedId: e.target.value,
                                                    }), className: `w-full p-5 rounded-[22px] text-lg font-black font-mono border-2 transition-all outline-none ${!isCreating
                                                        ? "bg-slate-100 border-slate-200 text-slate-400 italic"
                                                        : "bg-slate-50 border-slate-100 focus:border-teal-500 focus:bg-white shadow-inner"}`, placeholder: "CODE..." })] }), _jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-teal-600 uppercase tracking-widest ml-2 block italic", children: "Doel: New Item Code" }), _jsx("input", { value: editingItem.targetProductId, onChange: (e) => setEditingItem({
                                                        ...editingItem,
                                                        targetProductId: e.target.value,
                                                    }), className: "w-full p-5 bg-teal-50/30 border-2 border-teal-100 rounded-[22px] text-lg font-black font-mono text-teal-700 outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner", placeholder: "DRAWING..." })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-8 pt-6 border-t border-slate-50", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Product Type" }), _jsx("input", { value: editingItem.type, onChange: (e) => setEditingItem({ ...editingItem, type: e.target.value }), className: "w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500" })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Serie" }), _jsx("input", { value: editingItem.serie, onChange: (e) => setEditingItem({ ...editingItem, serie: e.target.value }), className: "w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500" })] })] }), _jsxs("div", { className: "space-y-1.5 text-left pt-6 border-t border-slate-50", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Label / Groep" }), _jsx("input", { value: editingItem.label || "", onChange: (e) => setEditingItem({ ...editingItem, label: e.target.value }), className: "w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500", placeholder: "Bijv. Wavistrong" })] }), _jsxs("div", { className: "pt-6 border-t border-slate-50", children: [_jsx("p", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2", children: "Dimensies (a-n)" }), _jsx("div", { className: "grid grid-cols-4 sm:grid-cols-7 gap-3", children: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map((key) => (_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-[8px] font-black uppercase text-slate-400 ml-1 block text-center", children: key.toUpperCase() }), _jsx("input", { value: editingItem[key] || "", onChange: (e) => setEditingItem({ ...editingItem, [key]: e.target.value }), className: "w-full p-2 bg-slate-50 border-2 border-slate-100 rounded-lg font-mono text-xs font-bold text-center outline-none focus:border-blue-500" })] }, key))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-8 text-left", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Diameter (DN)" }), _jsx("input", { type: "number", value: editingItem.dn, onChange: (e) => setEditingItem({ ...editingItem, dn: e.target.value }), className: "w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500" })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Druk (PN)" }), _jsx("input", { type: "number", value: editingItem.pn, onChange: (e) => setEditingItem({ ...editingItem, pn: e.target.value }), className: "w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold outline-none focus:border-blue-500" })] })] }), _jsxs("div", { className: "space-y-1.5 text-left pt-6 border-t border-slate-50", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block", children: "Infor-LN Beschrijving" }), _jsx("textarea", { rows: "3", value: editingItem.description, onChange: (e) => setEditingItem({
                                                ...editingItem,
                                                description: e.target.value,
                                            }), className: "w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-[30px] font-bold text-sm italic outline-none focus:border-blue-500 resize-none shadow-inner", placeholder: "..." })] }), _jsxs("button", { onClick: handleSaveEdit, disabled: uploading, className: "w-full py-7 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-teal-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 mt-6", children: [uploading ? (_jsx(Loader2, { className: "animate-spin" })) : (_jsx(Save, { size: 24 })), isCreating ? "Configuratie Vastleggen" : "Mapping Bijwerken"] })] })] }) }))] }));
}
