import React, { useState, useEffect } from "react";
import {
  Loader2,
  Trash2,
  Ruler,
  Search,
  Layout,
  ChevronRight,
  Plus,
  Box,
  Target,
  Save,
  RefreshCw,
  Database,
  Info,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";

/**
 * DimensionsView V7.1 - Vite Fix Edition
 * Beheert Boringen, Mof-maten (CB/TB) en Fitting specificaties in de nieuwe root.
 * FIX: Import van AdminToleranceView verwijderd om build-error op te lossen.
 */
const DimensionsView = ({ libraryData, blueprints, productRange }) => {
  const [activeMode, setActiveMode] = useState("bell"); // bell, fitting, bore
  const [bellSubType, setBellSubType] = useState("cb"); // cb, tb
  const [dimData, setDimData] = useState([]);
  const [editingDim, setEditingDim] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Filters voor nieuwe items
  const [dimFilters, setDimFilters] = useState({
    pn: "",
    id: "",
    extraCode: "",
    type: "",
    drilling: "",
  });

  // --- CONFIGURATIE ---
  const VIEW_MODES = [
    { id: "bell", label: "Bell (Mof)", icon: <Layout size={18} /> },
    { id: "fitting", label: "Fitting", icon: <Ruler size={18} /> },
    { id: "bore", label: "Bore", icon: <Target size={18} /> },
  ];

  const DIMENSION_LABELS = {
    B1: "B1",
    B2: "B2",
    BA: "BA",
    A: "A",
    TW: "TW",
    TWcb: "TWcb",
    TWtb: "TWtb",
    Twtb: "TWtb",
    r1: "r1",
    BD: "BD",
    W: "W",
    L: "L",
    Lo: "Lo",
    Z: "Z",
    R: "R",
    alpha: "alpha",
    Weight: "Weight",
    k: "k",
    d: "d",
    n: "n",
    b: "b",
  };

  const FITTING_ORDER = ["TW", "L", "Lo", "R", "Weight"];
  const DEFAULT_BORE_FIELDS = ["k", "d", "n", "b"];

  const getPathKey = () => {
    if (activeMode === "bore") return "BORE_DIMENSIONS";
    if (activeMode === "bell")
      return bellSubType === "cb" ? "CB_DIMENSIONS" : "TB_DIMENSIONS";
    if (activeMode === "fitting") {
      return dimFilters.type?.toLowerCase().endsWith("_socket")
        ? "SOCKET_SPECS"
        : "FITTING_SPECS";
    }
    return null;
  };

  // --- DATA FETCHING ---
  useEffect(() => {
    const pathKey = getPathKey();
    if (!pathKey) return;

    setLoading(true);
    const colRef = collection(db, ...PATHS[pathKey]);

    const unsubscribe = onSnapshot(
      query(colRef),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDimData(
          data.sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true })
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden maatvoering:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeMode, bellSubType, dimFilters.type]);

  // --- MATRIX LOGICA ---
  const getAvailablePNs = () => {
    const masterPNs = libraryData?.pns || [];
    if (!productRange) return masterPNs;
    const currentMof = bellSubType.toUpperCase();
    const matrixEntry =
      productRange[currentMof] || productRange[`${currentMof}/${currentMof}`];
    if (matrixEntry) {
      return Object.keys(matrixEntry)
        .map(Number)
        .sort((a, b) => a - b);
    }
    return masterPNs;
  };

  const getAvailableIDs = () => {
    const masterIDs = libraryData?.diameters || [];
    if (activeMode === "bore") return libraryData?.diameters || [];
    if (!dimFilters.pn || !productRange) return [];

    const currentMof = bellSubType.toUpperCase();
    const pnKey = String(dimFilters.pn);
    const matrixEntry =
      productRange[currentMof] || productRange[`${currentMof}/${currentMof}`];

    if (matrixEntry && matrixEntry[pnKey]) {
      const pnData = matrixEntry[pnKey];
      if (activeMode === "fitting" && dimFilters.type) {
        return (pnData[dimFilters.type] || pnData["Algemeen"] || []).sort(
          (a, b) => a - b
        );
      } else {
        const allIds = new Set();
        Object.values(pnData).forEach((ids) =>
          ids.forEach((id) => allIds.add(Number(id)))
        );
        return Array.from(allIds).sort((a, b) => a - b);
      }
    }
    return masterIDs;
  };

  // --- ACTIES ---
  const handleCreate = () => {
    const pathKey = getPathKey();
    if (!pathKey) return;

    let id;
    let baseData = {
      pressure: Number(dimFilters.pn),
      diameter: Number(dimFilters.id),
    };

    if (activeMode === "bore") {
      if (!dimFilters.drilling || !dimFilters.id)
        return alert("Selecteer Boring en ID.");
      id = `${dimFilters.drilling.replace(/\s+/g, "_")}_ID${
        dimFilters.id
      }`.toUpperCase();
      baseData = {
        drilling: dimFilters.drilling,
        diameter: Number(dimFilters.id),
      };
    } else {
      if (!dimFilters.pn || !dimFilters.id) return alert("Selecteer PN en ID.");
      const variant = bellSubType.toUpperCase();
      const typePrefix =
        activeMode === "fitting" ? `${dimFilters.type.toUpperCase()}_` : "";
      id = `${typePrefix}${variant}_PN${dimFilters.pn}_ID${dimFilters.id}${
        dimFilters.extraCode ? "_" + dimFilters.extraCode.toUpperCase() : ""
      }`;
    }

    const blueprintKey =
      activeMode === "bore"
        ? `BORE_${dimFilters.drilling}`
        : activeMode === "fitting"
        ? `${dimFilters.type}_${bellSubType.toUpperCase()}`
        : `Algemeen_${bellSubType.toUpperCase()}`;
    const fields =
      blueprints?.[blueprintKey]?.fields ||
      (activeMode === "bore" ? DEFAULT_BORE_FIELDS : FITTING_ORDER);

    const newDoc = { id, ...baseData };
    fields.forEach((f) => (newDoc[f] = ""));
    setEditingDim(newDoc);
  };

  const handleSave = async () => {
    if (!editingDim) return;
    setSaving(true);
    try {
      const pathKey = getPathKey();
      const docRef = doc(db, ...PATHS[pathKey], editingDim.id);
      await setDoc(
        docRef,
        {
          ...editingDim,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      setEditingDim(null);
    } catch (e) {
      alert("Fout bij opslaan: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Item ${id} definitief verwijderen?`)) return;
    try {
      const pathKey = getPathKey();
      await deleteDoc(doc(db, ...PATHS[pathKey], id));
    } catch (e) {
      alert(e.message);
    }
  };

  const getSortedFields = (docItem) => {
    const keys = Object.keys(docItem).filter(
      (k) =>
        !["id", "pressure", "diameter", "drilling", "lastUpdated"].includes(k)
    );
    return keys.sort((a, b) => {
      const indexA = FITTING_ORDER.indexOf(
        a.replace("cb", "").replace("tb", "")
      );
      const indexB = FITTING_ORDER.indexOf(
        b.replace("cb", "").replace("tb", "")
      );
      return indexA - indexB;
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col text-left">
      <div className="bg-white p-4 rounded-[35px] shadow-sm border border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex gap-2">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setActiveMode(mode.id);
                setEditingDim(null);
              }}
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                activeMode === mode.id
                  ? "bg-slate-900 text-white shadow-xl"
                  : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              }`}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        {(activeMode === "bell" || activeMode === "fitting") && (
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            <button
              onClick={() => setBellSubType("cb")}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                bellSubType === "cb"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400"
              }`}
            >
              CB (Lijm)
            </button>
            <button
              onClick={() => setBellSubType("tb")}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                bellSubType === "tb"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-400"
              }`}
            >
              TB (Draad)
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        <div className="w-1/3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm space-y-4 shrink-0">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 italic">
              <Plus size={14} className="text-blue-500" /> Nieuw record
              configureren
            </h4>
            <div className="space-y-3">
              {activeMode === "fitting" && (
                <select
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  value={dimFilters.type}
                  onChange={(e) =>
                    setDimFilters({ ...dimFilters, type: e.target.value })
                  }
                >
                  <option value="">- Selecteer Product -</option>
                  {libraryData?.product_names?.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              {activeMode === "bore" && (
                <select
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  value={dimFilters.drilling}
                  onChange={(e) =>
                    setDimFilters({ ...dimFilters, drilling: e.target.value })
                  }
                >
                  <option value="">- Selecteer Boring -</option>
                  {libraryData?.borings?.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  value={dimFilters.pn}
                  onChange={(e) =>
                    setDimFilters({ ...dimFilters, pn: e.target.value, id: "" })
                  }
                >
                  <option value="">PN</option>
                  {getAvailablePNs().map((pn) => (
                    <option key={pn} value={pn}>
                      PN{pn}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-xs font-bold"
                  value={dimFilters.id}
                  onChange={(e) =>
                    setDimFilters({ ...dimFilters, id: e.target.value })
                  }
                >
                  <option value="">ID (mm)</option>
                  {getAvailableIDs().map((id) => (
                    <option key={id} value={id}>
                      ID{id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!dimFilters.id}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all shadow-lg disabled:opacity-30"
            >
              Configureer Maatvoering
            </button>
          </div>

          <div className="bg-white rounded-[35px] border border-slate-200 flex-1 flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 relative text-left">
              <Search
                className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-300"
                size={16}
              />
              <input
                className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500"
                placeholder="Zoek op ID..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
              {loading ? (
                <div className="p-10 text-center animate-pulse">
                  <Loader2 className="animate-spin inline text-blue-500" />
                </div>
              ) : (
                dimData
                  .filter((d) =>
                    d.id.toLowerCase().includes(listSearch.toLowerCase())
                  )
                  .map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setEditingDim(d)}
                      className={`p-4 rounded-2xl cursor-pointer transition-all flex justify-between items-center group ${
                        editingDim?.id === d.id
                          ? "bg-blue-600 text-white shadow-lg"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <span className="text-[11px] font-mono font-bold truncate">
                        {d.id}
                      </span>
                      <ChevronRight
                        size={14}
                        className={
                          editingDim?.id === d.id
                            ? "text-white"
                            : "opacity-0 group-hover:opacity-100"
                        }
                      />
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {editingDim ? (
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border border-slate-100 relative animate-in slide-in-from-bottom-4">
              <div className="flex justify-between items-start mb-10 pb-8 border-b border-slate-100">
                <div className="text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px] font-black uppercase italic tracking-widest border border-blue-100">
                      Geselecteerde Maatvoering
                    </span>
                    <button
                      onClick={() => handleDelete(editingDim.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 italic tracking-tighter uppercase">
                    {editingDim.id}
                  </h3>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingDim(null)}
                    className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-all"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-xl flex items-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {saving ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}{" "}
                    Opslaan naar Root
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getSortedFields(editingDim).map((key) => (
                  <div key={key} className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      {DIMENSION_LABELS[key] || key}
                    </label>
                    <div className="relative">
                      <input
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-black focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                        value={editingDim[key] || ""}
                        onChange={(e) =>
                          setEditingDim({
                            ...editingDim,
                            [key]: e.target.value,
                          })
                        }
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 pointer-events-none uppercase italic">
                        {key.toLowerCase().includes("weight")
                          ? "kg"
                          : key === "n"
                          ? "st"
                          : "mm"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 p-8 bg-slate-900 rounded-[35px] text-white/50 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
                  <Database size={100} />
                </div>
                <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg">
                  <Info size={20} />
                </div>
                <div className="text-left flex-1 relative z-10 leading-relaxed">
                  Alle wijzigingen worden direct weggeschreven naar de
                  beveiligde productieomgeving onder{" "}
                  <span className="text-blue-400 italic">
                    /{PATHS[getPathKey()]?.join("/")}
                  </span>
                  .
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-100 rounded-[60px] bg-white/50 p-20 opacity-50 text-center">
              <Box size={100} className="mb-6 opacity-10" />
              <p className="font-black text-xl uppercase tracking-widest text-slate-400 max-w-sm italic">
                Selecteer een item uit de lijst of configureer een nieuwe
                maatvoering links.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DimensionsView;
