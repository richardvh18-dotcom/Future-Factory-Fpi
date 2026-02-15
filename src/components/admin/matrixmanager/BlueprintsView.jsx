import React, { useState, useMemo, useRef } from "react";
import {
  Layers,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  Database,
  Info,
  Type,
  AlertCircle,
  Sparkles,
  Target,
  Copy,
  Zap,
} from "lucide-react";

/**
 * BlueprintsView V2.3: Beheert templates voor Fittings én Boringen.
 * Alle wijzigingen worden via props gesynchroniseerd met de AdminMatrixManager
 * die ze vervolgens opslaat in de root: /future-factory/settings/blueprints/main
 */
const BlueprintsView = ({
  blueprints,
  setBlueprints,
  libraryData,
  setHasUnsavedChanges,
}) => {
  const [selectedBlueprintKey, setSelectedBlueprintKey] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({ BORINGEN: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewAnim, setIsNewAnim] = useState(false);
  const [designMode, setDesignMode] = useState("fitting"); // 'fitting' | 'bore'
  const [copySourceKey, setCopySourceKey] = useState(""); // Voor de kopieer-functie

  const editorRef = useRef(null);

  const [newBlueprint, setNewBlueprint] = useState({
    productType: "",
    connectionType: "",
    extraCode: "",
    boreType: "",
    fields: [],
  });
  const [newField, setNewField] = useState("");

  // --- DATA KOPPELING ---
  const availableTypes = useMemo(
    () => libraryData?.product_names || [],
    [libraryData]
  );
  const availableConnections = useMemo(
    () => libraryData?.connections || [],
    [libraryData]
  );
  const availableExtraCodes = useMemo(
    () => libraryData?.extraCodes || libraryData?.codes || [],
    [libraryData]
  );
  const availableBorings = useMemo(
    () => libraryData?.borings || [],
    [libraryData]
  );

  // Lijst van alle bestaande sleutels voor de kopieer-dropdown
  const allExistingKeys = useMemo(
    () => Object.keys(blueprints || {}).sort(),
    [blueprints]
  );

  const groupedBlueprints = useMemo(() => {
    const groups = {};
    const keys = Object.keys(blueprints || {}).sort();
    keys.forEach((key) => {
      if (searchTerm && !key.toLowerCase().includes(searchTerm.toLowerCase()))
        return;

      let type = "OVERIG";
      if (key.startsWith("BORE_")) {
        type = "BORINGEN";
      } else {
        type = key.split("_")[0];
      }

      if (!groups[type]) groups[type] = [];
      groups[type].push(key);
    });
    return groups;
  }, [blueprints, searchTerm]);

  const toggleGroup = (group) =>
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));

  const handleSelect = (key) => {
    setSelectedBlueprintKey(key);

    if (key.startsWith("BORE_")) {
      setDesignMode("bore");
      setNewBlueprint({
        boreType: key.replace("BORE_", ""),
        productType: "",
        connectionType: "",
        extraCode: "",
        fields: blueprints[key].fields || [],
        angle: "",
      });
    } else {
      setDesignMode("fitting");
      const parts = key.split("_");
      setNewBlueprint({
        productType: parts[0],
        connectionType: parts[1],
        extraCode: parts.slice(2).join("_") || "",
        boreType: "",
        fields: blueprints[key].fields || [],
      });
    }

    editorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setSelectedBlueprintKey(null);
    setNewBlueprint({
      productType: "",
      connectionType: "",
      extraCode: "",
      boreType: "",
      fields: [],
    });
    setNewField("");
    setCopySourceKey("");
    setIsNewAnim(true);
    setTimeout(() => setIsNewAnim(false), 1000);
    editorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- KOPIEER LOGICA ---
  const handleCopyFields = () => {
    if (!copySourceKey || !blueprints[copySourceKey]) return;

    const sourceFields = blueprints[copySourceKey].fields || [];
    if (sourceFields.length === 0) {
      alert("Deze bron bevat geen velden.");
      return;
    }

    // Voeg velden toe, voorkom duplicaten
    setNewBlueprint((prev) => {
      const mergedFields = [...new Set([...prev.fields, ...sourceFields])];
      return { ...prev, fields: mergedFields };
    });

    setCopySourceKey(""); // Reset selectie
  };

  const handleAddField = () => {
    const field = newField.trim().toUpperCase();
    if (field && !newBlueprint.fields.includes(field)) {
      setNewBlueprint({
        ...newBlueprint,
        fields: [...newBlueprint.fields, field],
      });
      setNewField("");
    }
  };

  const handleRemoveField = (fieldToRemove) => {
    setNewBlueprint({
      ...newBlueprint,
      fields: newBlueprint.fields.filter((f) => f !== fieldToRemove),
    });
  };

  const handleSaveToLocalState = () => {
    let key = "";
    if (designMode === "bore") {
      if (!newBlueprint.boreType) return alert("Selecteer een Boring Type.");
      key = `BORE_${newBlueprint.boreType}`;
    } else {
      if (!newBlueprint.productType || !newBlueprint.connectionType) {
        return alert("Selecteer Product Type en Mof.");
      }
      key = `${newBlueprint.productType}_${newBlueprint.connectionType}${
        newBlueprint.extraCode && newBlueprint.extraCode !== "-"
          ? "_" + newBlueprint.extraCode
          : ""
      }`;
    }

    setBlueprints({ ...blueprints, [key]: { fields: newBlueprint.fields } });
    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
    setSelectedBlueprintKey(key);
  };

  const handleDelete = (key) => {
    if (window.confirm(`Blauwdruk '${key}' verwijderen?`)) {
      const updated = { ...blueprints };
      delete updated[key];
      setBlueprints(updated);
      if (setHasUnsavedChanges) setHasUnsavedChanges(true);
      if (selectedBlueprintKey === key) resetForm();
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-220px)] animate-in fade-in duration-500 text-left">
      {/* LINKER KOLOM: LIJST */}
      <div className="w-1/3 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 space-y-4 shrink-0 text-left">
          <div className="flex justify-between items-center">
            <div className="text-left text-left">
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2">
                <Layers size={18} className="text-purple-600" />
                Templates
              </h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 italic">
                Matrix Configuratie
              </p>
            </div>
            <button
              onClick={resetForm}
              className={`p-3 rounded-2xl transition-all shadow-lg flex items-center justify-center ${
                selectedBlueprintKey === null
                  ? "bg-emerald-500 text-white shadow-emerald-200 scale-110"
                  : "bg-purple-600 text-white shadow-purple-200 hover:scale-105"
              }`}
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>

          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
              size={16}
            />
            <input
              className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-purple-400 transition-all shadow-inner"
              placeholder="Zoek template..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-white">
          {Object.entries(groupedBlueprints).map(([group, items]) => (
            <div
              key={group}
              className={`border rounded-[30px] overflow-hidden ${
                group === "BORINGEN"
                  ? "border-blue-100 bg-blue-50/20"
                  : "border-slate-100 bg-slate-50/30"
              }`}
            >
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <span className="font-black text-slate-700 text-[10px] uppercase tracking-widest flex items-center gap-2">
                  {group === "BORINGEN" ? (
                    <Target size={14} className="text-blue-500" />
                  ) : (
                    <FileText size={14} className="text-slate-400" />
                  )}
                  {group}
                </span>
                {expandedGroups[group] ? (
                  <ChevronDown size={14} className="text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400" />
                )}
              </button>
              {(expandedGroups[group] || searchTerm) && (
                <div className="bg-white p-2 space-y-1">
                  {items.map((key) => (
                    <div
                      key={key}
                      onClick={() => handleSelect(key)}
                      className={`p-3 pl-4 rounded-xl cursor-pointer text-[10px] font-bold transition-all flex justify-between items-center group ${
                        selectedBlueprintKey === key
                          ? key.startsWith("BORE_")
                            ? "bg-blue-600 text-white shadow-md"
                            : "bg-purple-600 text-white shadow-md"
                          : "hover:bg-slate-50 text-slate-500"
                      }`}
                    >
                      <span className="truncate font-mono">
                        {key.replace("BORE_", "")}
                      </span>
                      <Trash2
                        size={14}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(key);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RECHTER KOLOM: EDITOR */}
      <div
        ref={editorRef}
        className="flex-1 bg-white rounded-[50px] border border-slate-200 shadow-sm p-12 overflow-y-auto custom-scrollbar relative text-left"
      >
        {isNewAnim && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 animate-bounce bg-emerald-500 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 z-10 shadow-xl shadow-emerald-200">
            <Sparkles size={14} /> Designer Gereed
          </div>
        )}

        <div className="max-w-3xl mx-auto text-left">
          {/* Header */}
          <div className="flex justify-between items-start mb-10 pb-10 border-b border-slate-100">
            <div className="text-left text-left">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                  <button
                    onClick={() =>
                      !selectedBlueprintKey && setDesignMode("fitting")
                    }
                    disabled={!!selectedBlueprintKey}
                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                      designMode === "fitting"
                        ? "bg-white text-purple-600 shadow-sm"
                        : "text-slate-400"
                    }`}
                  >
                    Fitting
                  </button>
                  <button
                    onClick={() =>
                      !selectedBlueprintKey && setDesignMode("bore")
                    }
                    disabled={!!selectedBlueprintKey}
                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                      designMode === "bore"
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-400"
                    }`}
                  >
                    Boring
                  </button>
                </div>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase">
                {selectedBlueprintKey
                  ? selectedBlueprintKey.replace("BORE_", "")
                  : `${designMode === "bore" ? "Boring" : "Fitting"} Designer`}
              </h3>
            </div>
            {selectedBlueprintKey && (
              <button
                onClick={resetForm}
                className="p-4 bg-slate-50 text-slate-400 rounded-3xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100 shadow-sm active:scale-95"
              >
                <Plus size={28} />
              </button>
            )}
          </div>

          {/* Formulier: Fitting */}
          {designMode === "fitting" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 animate-in slide-in-from-left duration-300">
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  1. Product Type
                </label>
                <select
                  className={`w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${
                    selectedBlueprintKey
                      ? "bg-slate-50 border-slate-100 text-slate-400"
                      : "bg-white border-slate-200 focus:border-purple-500"
                  }`}
                  value={newBlueprint.productType}
                  onChange={(e) =>
                    setNewBlueprint({
                      ...newBlueprint,
                      productType: e.target.value,
                    })
                  }
                  disabled={!!selectedBlueprintKey}
                >
                  <option value="">- Kies Type -</option>
                  {availableTypes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  2. Connectie / Mof
                </label>
                <select
                  className={`w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${
                    selectedBlueprintKey
                      ? "bg-slate-50 border-slate-100 text-slate-400"
                      : "bg-white border-slate-200 focus:border-purple-500"
                  }`}
                  value={newBlueprint.connectionType}
                  onChange={(e) =>
                    setNewBlueprint({
                      ...newBlueprint,
                      connectionType: e.target.value,
                    })
                  }
                  disabled={!!selectedBlueprintKey}
                >
                  <option value="">- Kies Mof -</option>
                  {availableConnections.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  3. Extra Code (Optioneel)
                </label>
                <select
                  className={`w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${
                    selectedBlueprintKey
                      ? "bg-slate-50 border-slate-100 text-slate-400"
                      : "bg-white border-slate-200 focus:border-purple-500"
                  }`}
                  value={newBlueprint.extraCode}
                  onChange={(e) =>
                    setNewBlueprint({
                      ...newBlueprint,
                      extraCode: e.target.value,
                    })
                  }
                  disabled={!!selectedBlueprintKey}
                >
                  <option value="-">- Standaard (Geen code) -</option>
                  {availableExtraCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* Formulier: Boring */
            <div className="mb-12 animate-in slide-in-from-right duration-300 space-y-2 text-left">
              <label className="block text-[10px] font-black text-blue-600 uppercase mb-2 ml-1 flex items-center gap-2 italic tracking-widest">
                <Target size={14} /> Selecteer Boring Type
              </label>
              <select
                className={`w-full border-2 rounded-[25px] px-7 py-6 text-base font-black outline-none transition-all shadow-md ${
                  selectedBlueprintKey
                    ? "bg-blue-50 border-blue-100 text-blue-700"
                    : "bg-white border-blue-200 focus:border-blue-500"
                }`}
                value={newBlueprint.boreType}
                onChange={(e) =>
                  setNewBlueprint({ ...newBlueprint, boreType: e.target.value })
                }
                disabled={!!selectedBlueprintKey}
              >
                <option value="">- Kies een boringstype -</option>
                {availableBorings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Kopieer Sectie */}
          <div className="mb-12 bg-emerald-50/50 border-2 border-dashed border-emerald-100 rounded-[35px] p-8 animate-in fade-in duration-700 text-left">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-emerald-500 rounded-2xl text-white shadow-lg">
                <Copy size={18} />
              </div>
              <h4 className="text-[11px] font-black text-emerald-700 uppercase tracking-widest italic">
                Snelstart: Kopieer Velden van bestaande template
              </h4>
            </div>
            <div className="flex gap-4">
              <select
                className="flex-1 bg-white border-2 border-emerald-100 rounded-2xl px-6 py-5 text-xs font-bold outline-none focus:border-emerald-400 shadow-sm"
                value={copySourceKey}
                onChange={(e) => setCopySourceKey(e.target.value)}
              >
                <option value="">- Kies een bron template -</option>
                {allExistingKeys.map((key) => (
                  <option key={key} value={key}>
                    {key.startsWith("BORE_")
                      ? "Boring: " + key.replace("BORE_", "")
                      : "Fitting: " + key}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCopyFields}
                disabled={!copySourceKey}
                className="bg-emerald-600 text-white px-10 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-700 disabled:opacity-30 transition-all shadow-xl active:scale-95"
              >
                <Zap size={16} fill="currentColor" /> Kopieer
              </button>
            </div>
          </div>

          {/* Velden Editor */}
          <div
            className={`rounded-[40px] p-10 border mb-12 shadow-inner transition-colors text-left ${
              designMode === "bore"
                ? "bg-blue-50/30 border-blue-100"
                : "bg-slate-50 border-slate-100"
            }`}
          >
            <div className="flex justify-between items-center mb-8">
              <h4
                className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 italic ${
                  designMode === "bore" ? "text-blue-500" : "text-slate-500"
                }`}
              >
                <Type size={16} /> Actieve Variabelen (
                {newBlueprint.fields.length})
              </h4>
            </div>

            <div className="flex gap-4 mb-10">
              <input
                className="flex-1 bg-white border-2 border-slate-200 rounded-[20px] px-6 py-5 text-sm font-bold focus:border-blue-500 outline-none transition-all placeholder:text-slate-300 shadow-sm"
                placeholder={
                  designMode === "bore"
                    ? "Bijv. k, d, n, b..."
                    : "Bijv. TW, L, r1..."
                }
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddField()}
              />
              <button
                onClick={handleAddField}
                disabled={!newField}
                className={`px-10 rounded-2xl font-black transition-all disabled:opacity-20 shadow-xl text-white ${
                  designMode === "bore"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-slate-900 hover:bg-purple-600"
                }`}
              >
                <Plus size={28} />
              </button>
            </div>

            <div className="flex flex-wrap gap-3 min-h-[160px] content-start">
              {newBlueprint.fields.length === 0 ? (
                <div className="w-full py-20 text-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[30px] bg-white/50">
                  <p className="text-[11px] font-black uppercase tracking-widest italic opacity-60">
                    Geen technische variabelen gekoppeld
                  </p>
                </div>
              ) : (
                newBlueprint.fields.map((field) => (
                  <span
                    key={field}
                    className="bg-white border-2 border-slate-100 px-6 py-4 rounded-2xl text-[12px] font-black text-slate-700 flex items-center gap-5 shadow-sm hover:border-blue-200 transition-all animate-in zoom-in group"
                  >
                    {field}
                    <button
                      onClick={() => handleRemoveField(field)}
                      className="text-slate-200 group-hover:text-red-500 p-1 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col items-center pt-10 border-t border-slate-100">
            <button
              onClick={handleSaveToLocalState}
              disabled={
                (designMode === "fitting" &&
                  (!newBlueprint.productType ||
                    !newBlueprint.connectionType)) ||
                (designMode === "bore" && !newBlueprint.boreType)
              }
              className={`w-full max-w-sm py-7 rounded-[35px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-30 active:scale-95 text-white ${
                designMode === "bore"
                  ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  : "bg-slate-900 hover:bg-purple-600 shadow-purple-200"
              }`}
            >
              <Save size={24} /> Bevestig{" "}
              {designMode === "bore" ? "Boring" : "Blauwdruk"}
            </button>
            <div className="mt-10 p-8 bg-slate-50 rounded-[35px] border border-slate-100 flex items-start gap-5 max-w-xl text-left">
              <AlertCircle
                size={24}
                className="text-slate-400 shrink-0 mt-0.5"
              />
              <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed tracking-wider opacity-80">
                Zodra je een template bevestigt, verschijnen de variabelen
                direct in de <strong>Maatvoering</strong> tab voor alle ID's
                binnen die configuratie.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlueprintsView;
