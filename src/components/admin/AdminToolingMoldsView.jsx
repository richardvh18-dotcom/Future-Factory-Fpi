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
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
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

const AdminToolingMoldsView = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("flange_series");
  const [rows, setRows] = useState([]);
  const [newRow, setNewRow] = useState({
    name: "",
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
      setNewRow({ name: "", itemCode: "", matcher: "", stations: "", cavityCount: 1 });
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

        <div className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <input
            value={newRow.name}
            onChange={(e) => setNewRow((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Naam"
            className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
          />
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
            className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
          />
          <input
            type="number"
            min="1"
            value={newRow.cavityCount}
            onChange={(e) => setNewRow((prev) => ({ ...prev, cavityCount: e.target.value }))}
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

        <div className="space-y-2">
          {filteredRows.map((entry) => (
            <div key={entry.id} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-2xl p-3">
              <input
                value={entry.name}
                onChange={(e) => handleRowChange(entry.id, "name", e.target.value)}
                className="col-span-12 md:col-span-2 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
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
                className={`col-span-2 md:col-span-1 p-2 rounded-lg text-[10px] font-black uppercase border ${
                  entry.active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {entry.active ? "Actief" : "Uit"}
              </button>
              <button
                onClick={() => handleSaveRow(entry)}
                disabled={busy}
                className="col-span-2 md:col-span-1 p-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={13} className="inline-block mr-1" /> Opslaan
              </button>
              <button
                onClick={() => handleDeleteRow(entry.id)}
                disabled={busy}
                className="col-span-2 md:col-span-1 p-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 size={13} className="inline-block mr-1" /> Delete
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
    </div>
  );
};

export default AdminToolingMoldsView;
