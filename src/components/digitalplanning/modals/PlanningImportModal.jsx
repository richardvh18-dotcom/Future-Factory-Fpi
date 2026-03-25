import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Table,
  RefreshCw,
  PlusCircle,
  Info,
  Filter,
} from "lucide-react";
import {
  collection,
  writeBatch,
  doc,
  serverTimestamp,
  getDocs,
  query,
  where,
  documentId,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import {
  format,
  differenceInDays,
} from "date-fns";

const PlanningImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [fileData, setFileData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState("new_only");
  const [importTarget, setImportTarget] = useState("planning");
  const [selectedSheet, setSelectedSheet] = useState("All");
  const [machineFilter, setMachineFilter] = useState("All");
  const fileInputRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (!isOpen) {
      setLoadingMessage("");
    }
  }, [isOpen]);

  // Helper voor de kleurcodering op basis van de leverdatum t.o.v. vandaag
  const getDateStatusStyles = (deliveryDate) => {
    if (!deliveryDate) return "text-slate-900";

    const today = new Date();
    const daysUntilDelivery = differenceInDays(deliveryDate, today);

    // Rood: 1 week (7 dagen) of minder
    if (daysUntilDelivery <= 7) {
      return "text-red-600 font-black";
    }
    // Blauw: 2 weken (14 dagen) of minder
    if (daysUntilDelivery <= 14) {
      return "text-blue-600 font-black";
    }
    // Zwart: Meer dan 2 weken
    return "text-slate-900 font-bold";
  };

  const mapExistingFlags = async (rows, target) => {
    if (!rows.length) return rows;

    const targetPath = target === "temp_labels" ? PATHS.TEMP_PLANNING : PATHS.PLANNING;
    const ids = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));
    const found = new Set();
    const chunkSize = 30;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const existingSnap = await getDocs(
        query(collection(db, ...targetPath), where(documentId(), "in", slice))
      );
      existingSnap.docs.forEach((d) => found.add(d.id));
    }

    return rows.map((item) => ({ ...item, isExisting: found.has(item.id) }));
  };

  const parseWorkbookInWorker = async (arrayBuffer) => {
    const worker = new globalThis.Worker(
      new URL("../../../workers/planningImportWorker.js", import.meta.url),
      { type: "module" }
    );

    try {
      const parsedRows = await new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
          const { type, payload, error } = event.data || {};
          if (type === "success") {
            resolve(payload || []);
          } else if (type === "error") {
            reject(new Error(error || "Onbekende parse fout"));
          }
        };
        worker.onerror = (err) => reject(err);
        worker.postMessage({ arrayBuffer }, [arrayBuffer]);
      });

      return parsedRows.map((row) => ({
        ...row,
        deliveryDate: row.deliveryDate ? new Date(row.deliveryDate) : null,
        plannedDate: row.plannedDate ? new Date(row.plannedDate) : null,
      }));
    } finally {
      worker.terminate();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setLoadingMessage("Bestand verwerken op achtergrond...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedRows = await parseWorkbookInWorker(arrayBuffer);

      if (!parsedRows.length) {
        alert(
          "Geen geldige sheets gevonden. Zorg dat de kolommen 'Machine' en 'order' aanwezig zijn in ten minste één tabblad."
        );
        return;
      }

      setLoadingMessage("Bestaande orders controleren...");
      const withExistingFlags = await mapExistingFlags(parsedRows, importTarget);

      setFileData(withExistingFlags);
      setMachineFilter("All");
      setSelectedSheet("All");
    } catch (err) {
      console.error(err);
      alert("Fout bij het verwerken van het bestand.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const uniqueSheets = useMemo(() => {
    const sheets = new Set(fileData.map((item) => item.sourceSheet).filter(Boolean));
    return ["All", ...Array.from(sheets)];
  }, [fileData]);

  const uniqueMachines = useMemo(() => {
    const machines = new Set(fileData.map((item) => item.machine).filter(Boolean));
    return ["All", ...Array.from(machines).sort()];
  }, [fileData]);

  const filteredData = useMemo(() => {
    let data = fileData;
    if (selectedSheet !== "All") {
      data = data.filter((item) => item.sourceSheet === selectedSheet);
    }
    if (machineFilter !== "All") {
      data = data.filter((item) => item.machine === machineFilter);
    }
    return data;
  }, [fileData, selectedSheet, machineFilter]);

  const startImport = async () => {
    if (fileData.length === 0 || importing) return;
    setImporting(true);

    const dataToProcess =
      importTarget === "temp_labels"
        ? fileData
        : importMode === "new_only"
        ? filteredData.filter((item) => !item.isExisting)
        : filteredData;

    if (dataToProcess.length === 0) {
      alert("Geen nieuwe orders om te importeren.");
      setImporting(false);
      return;
    }

    const batchSize = 400;
    let processed = 0;

    try {
      for (let i = 0; i < dataToProcess.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = dataToProcess.slice(i, i + batchSize);

        chunk.forEach((item) => {
          const dbData = Object.fromEntries(
            Object.entries(item).filter(([key]) => key !== "isExisting")
          );
          const targetPath =
            importTarget === "temp_labels" ? PATHS.TEMP_PLANNING : PATHS.PLANNING;
          const docRef = doc(db, ...targetPath, item.id);
          batch.set(
            docRef,
            {
              ...dbData,
              importTarget,
              lastUpdated: serverTimestamp(),
              importDate: serverTimestamp(),
            },
            { merge: true }
          );
        });

        await batch.commit();
        processed += chunk.length;
      }

      await logActivity(
        auth.currentUser?.uid,
        "PLANNING_IMPORT",
        `Planning imported (${importTarget}): ${processed} records`
      );

      alert(`Import voltooid! ${processed} regels verwerkt.`);
      if (onSuccess) onSuccess();
      onClose();
    } catch {
      alert("Fout tijdens opslaan.");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen || location.pathname.includes("/login")) return null;

  const newCount = filteredData.filter((i) => !i.isExisting).length;
  const existingCount = filteredData.filter((i) => i.isExisting).length;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">
                Planning Import
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 italic">
                Urgentie:{" "}
                <span className="text-slate-900 font-black">Zwart &gt; 2w</span>{" "}
                | <span className="text-blue-600 font-black">Blauw 2w</span> |{" "}
                <span className="text-red-600 font-black">Rood 1w</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {fileData.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-slate-100 rounded-[40px] p-16 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".csv, .xlsx, .xls"
              />
              {loading ? (
                <div className="flex flex-col items-center gap-3 mb-6">
                  <Loader2
                    size={64}
                    className="mx-auto text-blue-500 animate-spin"
                  />
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                    {loadingMessage || "Bezig met verwerken..."}
                  </p>
                </div>
              ) : (
                <Upload
                  size={64}
                  className="mx-auto text-slate-200 group-hover:text-blue-400 transition-colors mb-6"
                />
              )}
              <h3 className="text-xl font-black text-slate-800 uppercase italic">
                Selecteer Planning Bestand
              </h3>
              <p className="text-slate-400 font-medium mt-2">
                Berekening startdatum en urgentie vindt automatisch plaats
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">
                    Nieuwe Orders
                  </span>
                  <span className="text-3xl font-black text-emerald-600 italic">
                    {newCount}
                  </span>
                </div>
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-center">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">
                    Reeds in Systeem
                  </span>
                  <span className="text-3xl font-black text-blue-600 italic">
                    {existingCount}
                  </span>
                </div>
                <div className="bg-slate-900 p-6 rounded-3xl text-white">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 italic">
                    Import Strategie
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setImportMode("new_only")}
                      className={`w-full py-2 px-4 rounded-xl text-[10px] font-black uppercase flex items-center justify-between border ${
                        importMode === "new_only"
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                    >
                      Alleen Nieuwe <PlusCircle size={14} />
                    </button>
                    <button
                      onClick={() => setImportMode("overwrite")}
                      className={`w-full py-2 px-4 rounded-xl text-[10px] font-black uppercase flex items-center justify-between border ${
                        importMode === "overwrite"
                          ? "bg-orange-600 border-orange-500 text-white"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                    >
                      Overschrijf alles <RefreshCw size={14} />
                    </button>
                  </div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mt-4 mb-2 italic">
                    Bestemming
                  </label>
                  <div className="space-y-2">
                    <button
                      onClick={() => setImportTarget("planning")}
                      className={`w-full py-2 px-4 rounded-xl text-[10px] font-black uppercase flex items-center justify-between border ${
                        importTarget === "planning"
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                    >
                      Productie Planning
                    </button>
                    <button
                      onClick={() => setImportTarget("temp_labels")}
                      className={`w-full py-2 px-4 rounded-xl text-[10px] font-black uppercase flex items-center justify-between border ${
                        importTarget === "temp_labels"
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                    >
                      Temp Labels (Hele Planning)
                    </button>
                  </div>
                </div>
              </div>

              {importTarget === "temp_labels" && (
                <div className="bg-violet-50 border border-violet-200 p-4 rounded-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">
                    Let op: tijdelijke labels import actief
                  </p>
                  <p className="text-xs text-violet-900 font-medium mt-1">
                    Deze import schrijft de volledige planning naar
                    <span className="font-black"> /future-factory/temp_labels/orders</span>
                    voor tijdelijke label printing.
                  </p>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-[30px] overflow-hidden shadow-sm">
                <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between items-center font-black uppercase text-[10px] text-slate-500 tracking-widest">
                  <div className="flex items-center gap-4">
                    <span>Preview & Urgentie Controle</span>
                    {uniqueSheets.length > 2 && (
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                        <Filter size={12} className="text-blue-500" />
                        <select
                          value={selectedSheet}
                          onChange={(e) => setSelectedSheet(e.target.value)}
                          className="bg-transparent outline-none font-bold text-slate-700 cursor-pointer text-[10px] uppercase"
                        >
                          {uniqueSheets.map((sheet) => (
                            <option key={sheet} value={sheet}>
                              {sheet}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {uniqueMachines.length > 2 && (
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm ml-2">
                        <Filter size={12} className="text-purple-500" />
                        <select
                          value={machineFilter}
                          onChange={(e) => setMachineFilter(e.target.value)}
                          className="bg-transparent outline-none font-bold text-slate-700 cursor-pointer text-[10px] uppercase"
                        >
                          {uniqueMachines.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <Table size={16} className="opacity-30" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Sheet</th>
                        <th className="px-6 py-4">Order</th>
                        <th className="px-6 py-4">Leverdatum (E)</th>
                        <th className="px-6 py-4">Productie Start (-2w)</th>
                        <th className="px-6 py-4">Machine</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredData.slice(0, 15).map((row, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <span
                              className={`${
                                row.isExisting
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-emerald-100 text-emerald-700"
                              } px-2 py-0.5 rounded-lg text-[9px] font-black uppercase`}
                            >
                              {row.isExisting ? "Bestaand" : "Nieuw"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-[10px] font-bold uppercase">
                            {row.sourceSheet}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900">
                            {row.orderId}
                          </td>
                          <td className="px-6 py-4 text-slate-400">
                            {row.deliveryDate
                              ? format(row.deliveryDate, "dd-MM-yyyy")
                              : "-"}
                          </td>
                          <td
                            className={`px-6 py-4 ${getDateStatusStyles(
                              row.deliveryDate
                            )}`}
                          >
                            {row.plannedDate
                              ? format(row.plannedDate, "dd-MM-yyyy")
                              : "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-bold uppercase">
                            {row.machine}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 p-5 rounded-3xl flex items-start gap-4 shadow-sm">
                <Info className="text-blue-500 shrink-0 mt-1" size={24} />
                <div>
                  <h4 className="text-sm font-black text-blue-900 uppercase">
                    Kleurcodering Productie Start
                  </h4>
                  <p className="text-xs text-blue-800 font-medium leading-relaxed mt-1 italic">
                    Het systeem bepaalt de kleur van de startdatum op basis van
                    de resterende tijd tot levering:
                    <br />•{" "}
                    <span className="text-slate-900 font-bold">Zwart:</span>{" "}
                    Productie start ligt nog in de toekomst.
                    <br />•{" "}
                    <span className="text-blue-600 font-bold">Blauw:</span>{" "}
                    Vandaag is de uiterste startdatum (2 weken zone).
                    <br />•{" "}
                    <span className="text-red-600 font-bold">Rood:</span> De
                    order is urgent of de startdatum is al verstreken (1 week
                    zone).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
          <button
            onClick={() => setFileData([])}
            disabled={fileData.length === 0 || importing}
            className="text-slate-400 hover:text-slate-600 font-black text-[10px] uppercase tracking-widest disabled:opacity-0 transition-all"
          >
            Bestand Wissen
          </button>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-100"
            >
              Annuleren
            </button>
            <button
              onClick={startImport}
              disabled={fileData.length === 0 || importing}
              className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-3 disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
              {importing
                ? "Importeren..."
                : `Importeer ${
                    importTarget === "temp_labels"
                      ? fileData.length
                      : importMode === "new_only"
                      ? newCount
                      : filteredData.length
                  } Regels`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanningImportModal;
