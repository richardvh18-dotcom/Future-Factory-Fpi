import React, { useState } from "react";
import { Check, Layers, Activity, Hash, Info, AlertCircle, Copy, ArrowRight } from "lucide-react";

/**
 * AvailabilityView V6.0 - Matrix Validation Core
 * Beheert de PN vs ID matrix voor elke verbinding.
 * Deze data wordt opgeslagen in /future-factory/settings/matrix/main
 */
const AvailabilityView = ({
  libraryData,
  matrixData,
  setMatrixData,
  setHasUnsavedChanges,
}) => {
  // Selecteer standaard de eerste verbinding uit de bibliotheek
  const [selectedConn, setSelectedConn] = useState(
    libraryData?.connections?.[0] || ""
  );
  const [copySourceConn, setCopySourceConn] = useState("");

  const pns = libraryData?.pns || [];
  const diameters = libraryData?.diameters || [];

  const toggleCell = (pn, id) => {
    if (!selectedConn) return;

    setMatrixData((prev) => {
      const current = JSON.parse(JSON.stringify(prev));
      if (!current[selectedConn]) current[selectedConn] = {};

      const pnStr = String(pn);
      const idNum = Number(id);

      let currentIds = Array.isArray(current[selectedConn][pnStr])
        ? [...current[selectedConn][pnStr]]
        : [];

      if (currentIds.includes(idNum)) {
        currentIds = currentIds.filter((i) => i !== idNum);
      } else {
        currentIds.push(idNum);
      }

      current[selectedConn][pnStr] = currentIds.sort((a, b) => a - b);
      return current;
    });

    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const isChecked = (pn, id) => {
    if (!selectedConn || !matrixData[selectedConn]) return false;
    const currentIds = matrixData[selectedConn][String(pn)] || [];
    return currentIds.includes(Number(id));
  };

  const handleCopyConnection = () => {
    if (!copySourceConn || !selectedConn || copySourceConn === selectedConn) return;
    
    if (!window.confirm(`Weet je zeker dat je de configuratie van ${copySourceConn} wilt kopiëren naar ${selectedConn}? Dit overschrijft de huidige selectie.`)) return;

    setMatrixData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev));
      const sourceData = newData[copySourceConn] || {};
      newData[selectedConn] = JSON.parse(JSON.stringify(sourceData));
      return newData;
    });

    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const toggleRow = (pn) => {
    if (!selectedConn) return;
    setMatrixData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[selectedConn]) newData[selectedConn] = {};
      
      const pnStr = String(pn);
      const currentIds = newData[selectedConn][pnStr] || [];
      const allIds = diameters.map(Number);
      const allSelected = allIds.every(id => currentIds.includes(id));
      
      newData[selectedConn][pnStr] = allSelected ? [] : [...allIds];
      return newData;
    });
    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const toggleCol = (id) => {
    if (!selectedConn) return;
    const idNum = Number(id);
    setMatrixData((prev) => {
      const newData = JSON.parse(JSON.stringify(prev));
      if (!newData[selectedConn]) newData[selectedConn] = {};
      
      const allSelected = pns.every(pn => (newData[selectedConn][String(pn)] || []).includes(idNum));
      
      pns.forEach(pn => {
        const pnStr = String(pn);
        let currentIds = newData[selectedConn][pnStr] || [];
        if (allSelected) {
          currentIds = currentIds.filter(i => i !== idNum);
        } else {
          if (!currentIds.includes(idNum)) currentIds.push(idNum);
        }
        newData[selectedConn][pnStr] = currentIds.sort((a, b) => a - b);
      });
      return newData;
    });
    if (setHasUnsavedChanges) setHasUnsavedChanges(true);
  };

  if (!libraryData?.connections?.length) {
    return (
      <div className="bg-white p-20 rounded-[40px] border-2 border-dashed border-slate-200 text-center animate-in fade-in">
        <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest">
          Vul eerst de Bibliotheek (Moffen & Diameters) in bij het tabblad
          Bibliotheek.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      {/* Verbinding Selectie Balk */}
      <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2.5 bg-orange-50 rounded-2xl text-orange-600 border border-orange-100">
            <Layers size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Selectie:
          </span>
        </div>
        <div className="flex gap-2">
          {libraryData.connections.map((conn) => (
            <button
              key={conn}
              onClick={() => setSelectedConn(conn)}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                selectedConn === conn
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-200"
                  : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              }`}
            >
              {conn}
            </button>
          ))}
        </div>
      </div>

      {/* Copy Tool */}
      <div className="bg-slate-50 p-4 rounded-[25px] border border-slate-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Copy size={16} />
            <span>Kopieer configuratie van:</span>
        </div>
        <select 
            className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
            value={copySourceConn}
            onChange={(e) => setCopySourceConn(e.target.value)}
        >
            <option value="">- Selecteer Bron -</option>
            {libraryData.connections.filter(c => c !== selectedConn).map(c => (
                <option key={c} value={c}>{c}</option>
            ))}
        </select>
        <ArrowRight size={16} className="text-slate-400" />
        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{selectedConn}</span>
        <button
            onClick={handleCopyConnection}
            disabled={!copySourceConn}
            className="ml-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
        >
            Kopiëren
        </button>
      </div>

      {/* De Matrix Grid */}
      <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-6 border-b border-r border-slate-100 w-32 sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase italic">
                    <Activity size={14} /> PN \ ID <Hash size={14} />
                  </div>
                </th>
                {diameters.map((id) => (
                  <th
                    key={id}
                    className="p-4 border-b border-slate-100 min-w-[80px] text-center cursor-pointer hover:bg-blue-50 transition-colors group"
                    onClick={() => toggleCol(id)}
                    title="Klik om hele kolom te selecteren"
                  >
                    <span className="text-[11px] font-black text-slate-700">
                      ID {id}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pns.map((pn) => (
                <tr key={pn} className="hover:bg-slate-50/30 transition-colors">
                  <td 
                    className="p-6 border-r border-b border-slate-100 font-black text-slate-600 text-sm sticky left-0 z-10 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)] cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => toggleRow(pn)}
                    title="Klik om hele rij te selecteren"
                  >
                    PN {pn}
                  </td>
                  {diameters.map((id) => {
                    const checked = isChecked(pn, id);
                    return (
                      <td
                        key={`${pn}-${id}`}
                        onClick={() => toggleCell(pn, id)}
                        className="p-1 border-b border-slate-50 text-center cursor-pointer group"
                      >
                        <div
                          className={`mx-auto w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            checked
                              ? "bg-emerald-500 text-white shadow-md scale-105"
                              : "bg-slate-50 text-transparent group-hover:bg-slate-100 group-hover:text-slate-300"
                          }`}
                        >
                          <Check size={20} strokeWidth={4} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend / Info Footer */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center gap-3">
          <Info size={16} className="text-blue-500" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Klik op een cel om een combinatie te activeren of deactiveren voor{" "}
            <span className="text-blue-600 font-black">{selectedConn}</span>.
            Actieve combinaties zijn direct zichtbaar in de Product
            Configurator.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityView;
