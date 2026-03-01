import React, { useState, useEffect } from "react";
import {
  Package,
  Info,
  Layers,
  Copy,
  Check,
  ChevronRight,
  Activity,
  Database,
  AlertCircle,
  Zap,
} from "lucide-react";

/**
 * MatrixView V4.0 - Production Availability Grid
 * Beheert welke PN/ID combinaties per producttype beschikbaar zijn.
 * Wordt opgeslagen via de parent in /future-factory/settings/matrix_configs/main
 */
const MatrixView = ({
  libraryData,
  matrixData = {},
  setMatrixData,
  setHasUnsavedChanges,
}) => {
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedType, setSelectedType] = useState("");

  // State voor de kopieer-functie
  const [copySource, setCopySource] = useState("");
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);

  // Initialiseer selecties als de bibliotheek geladen is
  useEffect(() => {
    if (libraryData.connections?.length > 0 && !selectedConnection) {
      setSelectedConnection(libraryData.connections[0]);
    }
    if (libraryData.product_names?.length > 0 && !selectedType) {
      setSelectedType(libraryData.product_names[0]);
    }
  }, [libraryData, selectedConnection, selectedType]);

  const normalizeConnection = (conn) => {
    if (!conn) return "";
    const c = conn.toUpperCase();
    // Normaliseer TB/TB naar TB, etc. voor consistente opslag-sleutels
    if (c.includes("/")) return c.split("/")[0].trim();
    return c;
  };

  const toggleMatrixItem = (connection, pressure, category, id) => {
    const storageKey = normalizeConnection(connection);
    const pnKey = String(pressure);
    const idStr = String(id);

    setMatrixData((prev) => {
      // Diepe kopie voor veiligheid
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[storageKey]) newData[storageKey] = {};
      if (!newData[storageKey][pnKey]) newData[storageKey][pnKey] = {};

      let currentList = newData[storageKey][pnKey][category] || [];
      if (currentList.includes(idStr))
        currentList = currentList.filter((i) => i !== idStr);
      else currentList.push(idStr);

      // Altijd numeriek sorteren
      currentList.sort((a, b) => Number(a) - Number(b));

      if (currentList.length > 0)
        newData[storageKey][pnKey][category] = currentList;
      else delete newData[storageKey][pnKey][category];

      return newData;
    });
    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const handleCopyFrom = () => {
    if (!copySource || !selectedType || !selectedConnection) return;
    const storageKey = normalizeConnection(selectedConnection);

    setMatrixData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev));
      const connectionData = newData[storageKey] || {};
      let copiedCount = 0;

      Object.keys(connectionData).forEach((pnKey) => {
        const sourceIds = connectionData[pnKey]?.[copySource];
        if (sourceIds && Array.isArray(sourceIds)) {
          // Overschrijf doel met bron data
          if (!connectionData[pnKey]) connectionData[pnKey] = {};
          connectionData[pnKey][selectedType] = [...sourceIds];
          copiedCount++;
        }
      });

      if (copiedCount > 0) {
        setShowCopyConfirm(true);
        setTimeout(() => setShowCopyConfirm(false), 3000);
        if (setHasUnsavedChanges) setHasUnsavedChanges(true);
      } else {
        alert(
          `Geen bron-data gevonden voor '${copySource}' onder verbinding '${storageKey}'.`
        );
      }
      return newData;
    });
  };

  // Render checks
  if (
    !libraryData?.connections?.length ||
    !libraryData?.product_names?.length
  ) {
    return (
      <div className="py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200 m-8">
        <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest italic">
          Vul eerst de 'Bibliotheek' tab in (Moffen & Product Types).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      {/* 1. CONFIGURATIE SELECTIE PANEEL */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 max-w-6xl mx-auto overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12 pointer-events-none">
          <Zap size={120} />
        </div>

        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                <Layers size={14} className="text-blue-500" /> 1. Selecteer
                Verbinding
              </label>
              <div className="relative group">
                <select
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-black text-slate-800 outline-none focus:border-blue-500 transition-all cursor-pointer appearance-none"
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                >
                  {libraryData.connections.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronRight
                  size={18}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 rotate-90"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                <Package size={14} className="text-blue-500" /> 2. Selecteer
                Product Type
              </label>
              <div className="relative group">
                <select
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-black text-slate-800 outline-none focus:border-blue-500 transition-all cursor-pointer appearance-none"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  {libraryData.product_names.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <ChevronRight
                  size={18}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 rotate-90"
                />
              </div>
            </div>
          </div>

          {/* KOPIEER TOOLBOX */}
          <div className="w-full lg:w-auto shrink-0">
            <div className="bg-blue-50/50 p-6 rounded-[30px] border-2 border-blue-100/50 flex flex-col gap-4">
              <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">
                Data Replicatie
              </p>
              <div className="flex gap-2">
                <select
                  className="bg-white border-2 border-blue-100 text-xs font-bold text-slate-600 rounded-xl py-2 px-4 outline-none focus:border-blue-500 shadow-sm"
                  value={copySource}
                  onChange={(e) => setCopySource(e.target.value)}
                >
                  <option value="">Kopieer van...</option>
                  {libraryData.product_names
                    .filter((p) => p !== selectedType)
                    .map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleCopyFrom}
                  disabled={!copySource}
                  className={`px-4 rounded-xl transition-all shadow-lg flex items-center gap-2 font-black text-[10px] uppercase tracking-widest ${
                    showCopyConfirm
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-900 text-white hover:bg-blue-600 disabled:opacity-30"
                  }`}
                >
                  {showCopyConfirm ? <Check size={16} /> : <Copy size={16} />}
                  {showCopyConfirm ? "Klaar" : "Kopieer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PN / ID GRID AREA */}
      {selectedConnection && selectedType ? (
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {libraryData.pns.map((pn) => {
              const storageKey = normalizeConnection(selectedConnection);
              const pnKey = String(pn);
              const activeIDs =
                matrixData[storageKey]?.[pnKey]?.[selectedType] || [];

              return (
                <div
                  key={pn}
                  className="bg-white rounded-[35px] shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl transition-all group"
                >
                  <div className="bg-slate-900 px-6 py-5 flex justify-between items-center border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/40 text-white">
                        <Activity size={16} />
                      </div>
                      <span className="text-sm font-black text-white italic">
                        PN {pn}
                      </span>
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      Matrix Mode
                    </span>
                  </div>

                  <div className="p-6 bg-slate-50/30">
                    <div className="flex flex-wrap gap-2 justify-start content-start min-h-[140px]">
                      {libraryData.diameters.map((id) => {
                        const idStr = String(id);
                        const isActive = activeIDs.includes(idStr);
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              toggleMatrixItem(
                                selectedConnection,
                                pn,
                                selectedType,
                                id
                              )
                            }
                            className={`h-11 w-16 rounded-xl text-[11px] font-black transition-all border-2 flex items-center justify-center shadow-sm ${
                              isActive
                                ? "bg-blue-600 text-white border-blue-400 ring-4 ring-blue-500/10 scale-105 shadow-blue-200"
                                : "bg-white text-slate-400 border-slate-100 hover:border-blue-300 hover:text-blue-600"
                            }`}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-white border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-400 uppercase italic">
                      {activeIDs.length} combinaties actief
                    </span>
                    {activeIDs.length > 0 && (
                      <Check size={12} className="text-emerald-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 opacity-30 italic">
          <Database size={64} className="mb-4 text-slate-300" />
          <p className="text-sm font-black uppercase tracking-widest">
            Maak een selectie om de matrix te laden
          </p>
        </div>
      )}

      {/* 3. INSTRUCTIE VOETNOOT */}
      <div className="max-w-4xl mx-auto mt-12 bg-slate-900 p-8 rounded-[40px] shadow-2xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Info size={100} />
        </div>
        <div className="flex items-start gap-6 relative z-10">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
            <Info size={20} />
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase italic tracking-widest text-blue-400">
              Gebruikershandleiding
            </h4>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed tracking-wider uppercase">
              Vink de diameters aan die technisch produceerbaar zijn voor de
              combinatie van <strong>{selectedConnection}</strong> en{" "}
              <strong>{selectedType}</strong>. Deze selectie bepaalt welke
              keuzes gebruikers hebben in de Product Configurator en
              Calculators.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatrixView;
