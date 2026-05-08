// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wrench,
  Layers,
  Save,
  Trash2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  getDocs,
  query,
  where,
  getDoc,
  documentId,
  limit,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";

const parseStations = (input) =>
  String(input || "")
    .split(",")
    .map((segment) => segment.trim().toUpperCase())
    .filter(Boolean);

const normalizeInput = (entry, forcedApplication = "") => {
  const cavityParsed = Number.parseInt(String(entry?.cavityCount || ""), 10);
  return {
    name: String(entry?.name || "").trim(),
    itemCode: String(entry?.itemCode || "").trim().toUpperCase(),
    matcher: String(entry?.matcher || "").trim().toUpperCase(),
    stations: parseStations(entry?.stations),
    cavityCount: Number.isFinite(cavityParsed) && cavityParsed > 0 ? cavityParsed : 1,
    active: entry?.active !== false,
    application: forcedApplication || String(entry?.application || "general").trim().toLowerCase(),
  };
};

const rowFromDoc = (entry) => ({
  id: entry.id,
  name: entry.name || "",
  itemCode: entry.itemCode || "",
  matcher: entry.matcher || "",
  stations: Array.isArray(entry.stations) ? entry.stations.join(", ") : "",
  cavityCount: entry.cavityCount || 1,
  active: entry.active !== false,
  application: String(entry.application || "general").trim().toLowerCase(),
});

const OrderSearchModal = ({ isOpen, onClose, onSelectItems, newRow, setNewRow }) => {
  const [orderStr, setOrderStr] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleSearchOrder = async () => {
    if (!orderStr.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setResults([]);
    setSelectedItems([]);

    try {
      let searchStr = orderStr.trim().toUpperCase();
      if (searchStr.includes("/")) {
        searchStr = searchStr.split("/").filter(Boolean).pop();
      }

      let searchOptions = [searchStr];
      const digitsMatch = searchStr.match(/\d+/);
      if (digitsMatch) {
        const digits = digitsMatch[0];
        if (digits.length >= 3 && !searchStr.startsWith("N") && !searchStr.startsWith("P")) {
          searchOptions.push(`N${digits}`, `N20${digits}`, `N200${digits}`, `N21${digits}`, `N210${digits}`, `P${digits}`);
        }
      }

      const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
      const colRef = collection(db, ...PATHS.TEMP_PLANNING);
      const planRef = collection(db, ...PATHS.PLANNING);
      const trackRef = collection(db, ...PATHS.TRACKING);

      let foundDocs = new Map();
      const addDocs = (snap) => {
        if (snap && snap.docs) {
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            foundDocs.set(d.id, data);
          });
        }
      };

      console.log(`🔍 Zoeken naar: "${searchStr}" met opties: [${uniqueOptions.join(", ")}]`);

      // Search in scoped orders - load all and filter client-side since they might have complex doc IDs
      try {
        const allScopedSnap = await getDocs(collectionGroup(db, "orders"));
        console.log(`📊 Totaal scoped orders gevonden: ${allScopedSnap.docs.length}`);
        
        allScopedSnap.docs.forEach((d) => {
          const docId = d.id.toUpperCase();
          const data = d.data();
          
          // Check if any search option matches in doc ID or fields
          const matches = uniqueOptions.some(opt => {
            const searchOpt = opt.toUpperCase();
            // Check document ID
            if (docId.includes(searchOpt)) return true;
            // Check common fields
            const fieldsToCheck = [
              data.orderId?.toString().toUpperCase(),
              data.orderNumber?.toString().toUpperCase(),
              data.Order?.toString().toUpperCase(),
              data.Productieorder?.toString().toUpperCase(),
              data.order?.toString().toUpperCase(),
              data.itemCode?.toString().toUpperCase(),
              data.productCode?.toString().toUpperCase(),
              data.articleCode?.toString().toUpperCase(),
            ];
            return fieldsToCheck.some(f => f?.includes(searchOpt));
          });
          
          if (matches) {
            foundDocs.set(d.id, { id: d.id, ...data });
            console.log(`✓ Matched in scoped orders: ${d.id}`);
          }
        });
        console.log(`✓ Scoped orders search completed. Found: ${foundDocs.size}`);
      } catch (err) {
        console.warn("Fout bij zoeken in scoped orders:", err);
      }

      // Direct doc ID lookup
      for (const opt of uniqueOptions) {
        try {
          const snaps = await Promise.all([
            getDoc(doc(db, ...PATHS.TEMP_PLANNING, opt)),
            getDoc(doc(db, ...PATHS.PLANNING, opt)),
            getDoc(doc(db, ...PATHS.TRACKING, opt)),
          ]);
          snaps.forEach((s) => {
            if (s.exists()) {
              foundDocs.set(s.id, { id: s.id, ...s.data() });
              console.log(`✓ Gevonden via doc ID: ${s.id}`);
            }
          });
        } catch (err) {
          console.warn(`Doc ID lookup fout voor ${opt}:`, err);
        }
      }

      // Exact field queries for root collections - search all relevant fields
      try {
        const fieldNames = ["orderId", "orderNumber", "Order", "Productieorder", "order", "originalOrderId", "itemCode", "productCode", "articleCode"];
        const exactQueries = [];
        
        for (const field of fieldNames) {
          exactQueries.push(
            getDocs(query(planRef, where(field, "==", searchStr))).catch(() => null),
            getDocs(query(trackRef, where(field, "==", searchStr))).catch(() => null),
            getDocs(query(colRef, where(field, "==", searchStr))).catch(() => null)
          );
        }
        
        const exactSnaps = await Promise.all(exactQueries);
        exactSnaps.forEach(snap => snap && addDocs(snap));
        console.log(`✓ Root collection search completed. Total found: ${foundDocs.size}`);
      } catch (err) {
        console.warn("Fout bij exact queries:", err);
      }

      setResults(Array.from(foundDocs.values()));
      if (foundDocs.size === 0) {
        console.warn(`⚠️ Geen resultaten gevonden voor: "${searchStr}"`);
      } else {
        console.log(`✅ ${foundDocs.size} resultaat(en) gevonden!`);
      }
    } catch (e) {
      console.error("Zoekfout:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (item) => {
    const itemCode = item.itemCode || item.item || item.productCode || item.id;
    // Check if already selected by itemCode
    if (!selectedItems.some(sel => (sel.itemCode || sel.item || sel.productCode || sel.id) === itemCode)) {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const handleRemoveSelected = (itemCode) => {
    setSelectedItems(selectedItems.filter((item) => {
      const code = item.itemCode || item.item || item.productCode || item.id;
      return code !== itemCode;
    }));
  };

  const handleConfirm = () => {
    // Combine itemCodes
    const itemCodes = selectedItems.map(item => item.itemCode || item.item || item.productCode || item.id).join(",");
    
    // Extract matchers - try multiple field names
    const matchers = selectedItems
      .map(item => item.matcher || item.Matcher || item.description || item.itemDescription || item.specs || "")
      .filter(Boolean)
      .join(" | ");

    setNewRow((prev) => ({
      ...prev,
      itemCode: itemCodes,
      matcher: matchers || prev.matcher, // Only update if we found matchers
    }));
    setOrderStr("");
    setResults([]);
    setSelectedItems([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden border border-slate-100">
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-slate-900 uppercase italic">
              Items via <span className="text-blue-600">Ordernummer</span>
            </h3>
            <button
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={orderStr}
              onChange={(e) => setOrderStr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchOrder()}
              placeholder="Typ ordernummer (bijv. N20024783)..."
              className="flex-1 p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <button
              onClick={handleSearchOrder}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            </button>
          </div>

          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto mb-4 border border-slate-200 rounded-xl">
              {results.map((item, idx) => {
                const itemCode = item.itemCode || item.item || item.productCode || item.id;
                const matcher = item.matcher || item.Matcher || item.description || item.itemDescription || "";
                const desc = item.itemDescription || item.description || "";
                return (
                  <div
                    key={idx}
                    className="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                    onClick={() => handleSelectItem(item)}
                  >
                    <div>
                      <p className="text-xs font-black text-slate-900">{itemCode}</p>
                      {matcher && <p className="text-[10px] text-slate-600 font-semibold">{matcher}</p>}
                      {desc && desc !== matcher && <p className="text-[10px] text-slate-500">{desc}</p>}
                    </div>
                    <button className="px-3 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 rounded-lg text-[10px] font-bold">
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {selectedItems.length > 0 && (
            <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-600 uppercase mb-2">Geselecteerde items ({selectedItems.length}):</p>
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item, idx) => {
                  const code = item.itemCode || item.item || item.productCode || item.id;
                  return (
                    <div key={idx} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2">
                      {code}
                      <button
                        onClick={() => handleRemoveSelected(code)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase text-xs hover:bg-slate-200"
            >
              Annuleer
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              Bevestigen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminToolingMoldsView = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("flange_series");
  const [rows, setRows] = useState([]);
  const [showOrderSearch, setShowOrderSearch] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [newRow, setNewRow] = useState({
    itemCode: "",
    matcher: "",
    stations: "",
    cavityCount: 1,
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, ...PATHS.TOOLING_MOLDS),
      (snap) => {
        const parsed = snap.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .map((entry) => rowFromDoc(entry))
          .sort((a, b) => String(a.name || a.itemCode).localeCompare(String(b.name || b.itemCode)));
        setRows(parsed);
        setLoading(false);
      },
      (error) => {
        console.error("Kon gereedschappen/mallen niet laden:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredRows = useMemo(() => {
    setSelectedRows(new Set()); // Clear selection when tab changes
    if (activeTab === "all") return rows;
    return rows.filter((entry) => entry.application === activeTab);
  }, [rows, activeTab]);

  const handleRowChange = (rowId, field, value) => {
    setRows((prev) => prev.map((entry) => (entry.id === rowId ? { ...entry, [field]: value } : entry)));
  };

  const resolveApplicationForNewRow = () => {
    if (activeTab === "all") return "general";
    return activeTab;
  };

  const handleAddRow = async () => {
    const application = resolveApplicationForNewRow();
    const payload = normalizeInput(newRow, application);

    if (!payload.itemCode && !payload.matcher) {
      setStatus({ type: "error", msg: "Vul minimaal itemCode of matcher in." });
      return;
    }

    setBusy(true);
    try {
      await addDoc(collection(db, ...PATHS.TOOLING_MOLDS), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "admin",
      });
      setNewRow({ itemCode: "", matcher: "", stations: "", cavityCount: 1 });
      setStatus({ type: "success", msg: "Record toegevoegd." });
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      console.error("Toevoegen mislukt:", error);
      setStatus({ type: "error", msg: "Toevoegen mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRow = async (entry) => {
    const payload = normalizeInput(entry);
    if (!payload.itemCode && !payload.matcher) {
      setStatus({ type: "error", msg: "Vul minimaal itemCode of matcher in." });
      return;
    }

    setBusy(true);
    try {
      await updateDoc(doc(db, ...PATHS.TOOLING_MOLDS, entry.id), {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || "admin",
      });
      setStatus({ type: "success", msg: "Record opgeslagen." });
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      console.error("Opslaan mislukt:", error);
      setStatus({ type: "error", msg: "Opslaan mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRow = async (rowId) => {
    setBusy(true);
    try {
      await deleteDoc(doc(db, ...PATHS.TOOLING_MOLDS, rowId));
      setStatus({ type: "success", msg: "Record verwijderd." });
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      console.error("Verwijderen mislukt:", error);
      setStatus({ type: "error", msg: "Verwijderen mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const toggleRowSelection = (rowId) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowId)) {
      newSelected.delete(rowId);
    } else {
      newSelected.add(rowId);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) {
      setStatus({ type: "error", msg: "Selecteer eerst records om te verwijderen." });
      return;
    }

    if (!window.confirm(`${selectedRows.size} record(s) verwijderen?`)) {
      return;
    }

    setBusy(true);
    let successCount = 0;
    try {
      for (const rowId of selectedRows) {
        try {
          await deleteDoc(doc(db, ...PATHS.TOOLING_MOLDS, rowId));
          successCount++;
        } catch (e) {
          console.error(`Fout bij verwijderen ${rowId}:`, e);
        }
      }
      setSelectedRows(new Set());
      setStatus({ type: "success", msg: `${successCount} record(s) verwijderd.` });
      setTimeout(() => setStatus(null), 2500);
    } catch (error) {
      console.error("Batch delete mislukt:", error);
      setStatus({ type: "error", msg: "Batch delete mislukt." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Gereedschappen laden...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 h-full overflow-y-auto custom-scrollbar pb-28">
      <div className="bg-white p-8 rounded-[36px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between gap-6 items-center">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-slate-900 text-white rounded-[20px] shadow-xl">
            <Wrench size={30} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight leading-none">
              Mallen & Gereedschappen
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
              Product & Data Management
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab("flange_series")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${
              activeTab === "flange_series"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            <Layers size={14} className="inline-block mr-2" />
            Flenzen
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${
              activeTab === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            Alle Mallen
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setShowOrderSearch(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 shadow-lg flex gap-2 items-center"
            >
              <Search size={18} /> Zoeken op ordernummer
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
            Handmatig toevoegen
          </div>
          <div className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <input
              value={newRow.itemCode}
              onChange={(e) => setNewRow((prev) => ({ ...prev, itemCode: e.target.value.toUpperCase() }))}
              placeholder="ItemCode"
              className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
            />
            <input
              value={newRow.matcher}
              onChange={(e) => setNewRow((prev) => ({ ...prev, matcher: e.target.value.toUpperCase() }))}
              placeholder="Matcher (bijv FL 50 PN 40)"
              className="col-span-12 md:col-span-3 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
            />
            <input
              value={newRow.stations}
              onChange={(e) => setNewRow((prev) => ({ ...prev, stations: e.target.value }))}
              placeholder="Stations: BH12, MAZAK"
              className="col-span-12 md:col-span-3 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
            />
            <input
              type="number"
              min="1"
              value={newRow.cavityCount || 1}
              onChange={(e) => setNewRow((prev) => ({ ...prev, cavityCount: Math.max(1, parseInt(e.target.value) || 1) }))}
              className="col-span-6 md:col-span-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-black"
            />
            <button
              onClick={handleAddRow}
              disabled={busy}
              className="col-span-6 md:col-span-2 p-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus size={14} className="inline-block mr-1" /> Toevoegen
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {filteredRows.length > 0 && (
            <div className="grid grid-cols-12 gap-2 items-center bg-slate-100 p-3 rounded-2xl border border-slate-200 sticky top-0 z-10">
              <input
                type="checkbox"
                checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                onChange={toggleSelectAll}
                className="col-span-1 w-5 h-5 cursor-pointer"
              />
              <button
                onClick={() => filteredRows.forEach((entry) => handleSaveRow(entry))}
                disabled={busy}
                className="col-span-3 md:col-span-2 p-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={13} className="inline-block mr-1" /> Alles Opslaan
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={busy || selectedRows.size === 0}
                className="col-span-3 md:col-span-2 p-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 size={13} className="inline-block mr-1" /> Delete ({selectedRows.size})
              </button>
              <div className="col-span-5 md:col-span-8 text-[10px] text-slate-600 font-bold">
                {filteredRows.length} record(s) | {selectedRows.size} geselecteerd
              </div>
            </div>
          )}
          {filteredRows.map((entry) => (
            <div key={entry.id} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-2xl p-3">
              <input
                type="checkbox"
                checked={selectedRows.has(entry.id)}
                onChange={() => toggleRowSelection(entry.id)}
                className="col-span-1 w-5 h-5 cursor-pointer"
              />
              <input
                value={entry.itemCode}
                onChange={(e) => handleRowChange(entry.id, "itemCode", e.target.value.toUpperCase())}
                className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
              />
              <input
                value={entry.matcher}
                onChange={(e) => handleRowChange(entry.id, "matcher", e.target.value.toUpperCase())}
                className="col-span-12 md:col-span-3 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
              />
              <input
                value={entry.stations}
                onChange={(e) => handleRowChange(entry.id, "stations", e.target.value)}
                className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
              />
              <input
                type="number"
                min="1"
                value={entry.cavityCount}
                onChange={(e) => handleRowChange(entry.id, "cavityCount", e.target.value)}
                className="col-span-4 md:col-span-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-black"
              />
              <select
                value={entry.application || "general"}
                onChange={(e) => handleRowChange(entry.id, "application", e.target.value)}
                className="col-span-4 md:col-span-1 p-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase"
              >
                <option value="general">Algemeen</option>
                <option value="flange_series">Flenzen</option>
              </select>
              <button
                onClick={() => handleRowChange(entry.id, "active", !entry.active)}
                className={`col-span-2 md:col-span-2 p-2 rounded-lg text-[10px] font-black uppercase border ${
                  entry.active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {entry.active ? "Actief" : "Uit"}
              </button>
            </div>
          ))}
          {filteredRows.length === 0 && (
            <p className="text-xs font-bold text-slate-500 p-2">
              Geen records in deze tab.
            </p>
          )}
        </div>
      </div>

      {status && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 ${
            status.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {status.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-xs font-black uppercase tracking-widest">{status.msg}</span>
        </div>
      )}

      <OrderSearchModal
        isOpen={showOrderSearch}
        onClose={() => setShowOrderSearch(false)}
        onSelectItems={() => {}}
        newRow={newRow}
        setNewRow={setNewRow}
      />
    </div>
  );
};

export default AdminToolingMoldsView;
