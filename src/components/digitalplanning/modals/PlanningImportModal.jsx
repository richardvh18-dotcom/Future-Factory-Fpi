import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Upload,
  Loader2,
  Database,
  ShieldCheck,
} from "lucide-react";
import {
  collection,
  writeBatch,
  doc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import * as XLSX from "xlsx";
import { getISOWeek } from "date-fns";

/**
 * PlanningImportModal v4.7 - Pilot Version (Order Creation Date Support)
 */
const PlanningImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [fileData, setFileData] = useState([]);
  const [availableSheets, setAvailableSheets] = useState([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [rawWorkbook, setRawWorkbook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [existingIds, setExistingIds] = useState(new Set());
  const [importMode, setImportMode] = useState("new_only");
  const [machineFilter, setMachineFilter] = useState("All");
  const [machineGroupFilter, setMachineGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [debugLogs, setDebugLogs] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchExisting = async () => {
      if (!isOpen) return;
      try {
        const snap = await getDocs(collection(db, ...PATHS.PLANNING));
        setExistingIds(new Set(snap.docs.map(d => d.id)));
      } catch (err) {
        addLog("Database connectie mislukt.", "error");
      }
    };
    fetchExisting();
  }, [isOpen]);

  const addLog = (msg, type = "info") => {
    setDebugLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 15)]);
  };

  const clean = (val) => String(val || "").trim();

  const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const s = String(val).replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const normalizeMachine = (val) => {
    let str = clean(val).toUpperCase();
    // Work Center uit LN moet zichtbaar blijven zoals aangeleverd (bijv. 40BH18).
    if (str === "BM18") str = "BH18";
    if (str === "40BM18") str = "40BH18";
    return str || "-";
  };

  const isStatusAllowed = (status) => {
    const s = clean(status).toLowerCase();
    if (s.includes("production completed") || s.includes("completed")) return false;
    const allowed = ["released", "planned", "active", "created", "vrijgegeven", "aangemaakt", "actief"];
    return allowed.some(keyword => s.includes(keyword));
  };

  const getMachinePriority = (machineCode) => {
    const m = clean(machineCode).toUpperCase();
    if (/^40BH\d{2}$/.test(m)) return 600;
    if (/^40BM\d{2}$/.test(m)) return 550;
    if (/^40BA\d{2}$/.test(m)) return 500;
    if (/^40BB\d{2}$/.test(m)) return 450;
    if (/^40AJ\d{2}$/.test(m)) return 300;
    if (/^40\d{4}$/.test(m)) return 150;
    return 50;
  };

  const isFittingsMachine = (machineCode) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    const allowed = new Set(["BH11", "BH12", "BH15", "BH16", "BH17", "BH18", "BH31"]);
    return allowed.has(normalized);
  };

  const isPipesMachine = (machineCode) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    const padded = normalized.replace(/^BA(\d)$/, "BA0$1");
    const allowed = new Set(["BA05", "BA07", "BA08", "BA09"]);
    return allowed.has(padded);
  };

  // LOGICA: Aggregatie van Operations per unieke Productie Order inclusief Creation Date
  const processRawLNDump = (rawRows) => {
    const headerIdx = rawRows.findIndex(r => r.some(c => clean(c).toLowerCase() === "production order"));
    if (headerIdx === -1) {
      addLog("Fout formaat: 'Production Order' niet gevonden.", "error");
      return [];
    }

    const headers = rawRows[headerIdx].map(h => clean(h).toLowerCase());
    const dataRows = rawRows.slice(headerIdx + 1);
    const findCol = (names) => headers.findIndex(h => names.some(n => h.includes(n)));

    const idx = {
      order: findCol(["production order"]),
      delivery: findCol(["planned delivery date"]),
      machine: findCol(["work center"]),
      status: findCol(["order status"]),
      item: findCol(["item", "artikel"]),
      desc: findCol(["item description", "omschrijving"]),
      project: findCol(["project"]),
      projectDesc: findCol(["project description", "project desc"]),
      qty: findCol(["quantity ordered", "aantal"]),
      plannedHours: findCol(["production time", "labor hours"]),
      actualHours: findCol(["spent production time"]),
      refOp: findCol(["reference operation"]),
      drawing: findCol(["drawing number", "tekening"]),
      // Alleen Special Instructions mag naar extraCode (Lot Code mag niet worden geïmporteerd als code).
      special: findCol(["special instructions", "special instruction", "extra code", "extra-code"]),
      todo: findCol(["to do qty"]),
      creation: findCol(["order creation date"]) // Nieuwe kolom voor Dossier
    };

    const orderMap = new Map();

    dataRows.forEach(row => {
      const orderId = clean(row[idx.order]);
      if (!orderId || orderId === "" || orderId === "0") return;

      const refOp = clean(row[idx.refOp]);
      const pTime = parseNum(row[idx.plannedHours]);
      const aTime = parseNum(row[idx.actualHours]);
      const rawStatus = clean(row[idx.status]);
      const rowMachine = normalizeMachine(row[idx.machine]);
      const rowStatusAllowed = isStatusAllowed(rawStatus);

      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          id: orderId,
          orderId: orderId,
          machine: rowMachine,
          itemCode: clean(row[idx.item]),
          itemDescription: clean(row[idx.desc]),
          project: clean(row[idx.project]),
          projectDesc: clean(row[idx.projectDesc]),
          extraCode: clean(row[idx.special]),
          quantity: parseNum(row[idx.qty]),
          toDoQty: parseNum(row[idx.todo]),
          plannedDeliveryDate: row[idx.delivery],
          orderCreationDate: clean(row[idx.creation]), // Alleen voor dossier
          orderStatus: rawStatus,
          drawing: clean(row[idx.drawing]),
          isValidForImport: rowStatusAllowed,
          status: "waiting",
          plan: parseNum(row[idx.todo]) || parseNum(row[idx.qty]) || 0,
          totalPlannedHours: 0,
          totalActualHours: 0,
          operations: {},
          machineTotals: {},
          sourceType: "LN Consolidated"
        });
      }

      const order = orderMap.get(orderId);
      if ((order.machine === "-" || !order.machine) && rowMachine !== "-") {
        order.machine = rowMachine;
      }
      if (!rowStatusAllowed) {
        order.isValidForImport = false;
      }
      if (!order.orderStatus && rawStatus) {
        order.orderStatus = rawStatus;
      }

      if (!order.orderCreationDate) {
        order.orderCreationDate = clean(row[idx.creation]);
      }

      if ((!order.extraCode || order.extraCode === "-") && clean(row[idx.special])) {
        order.extraCode = clean(row[idx.special]);
      }

      if (!order.project) {
        order.project = clean(row[idx.project]);
      }

      if (!order.projectDesc) {
        order.projectDesc = clean(row[idx.projectDesc]);
      }

      if (!order.drawing) {
        order.drawing = clean(row[idx.drawing]);
      }

      if (rowMachine !== "-") {
        const machineWeight = pTime > 0 ? pTime : 0.001;
        order.machineTotals[rowMachine] = (order.machineTotals[rowMachine] || 0) + machineWeight;
      }

      order.totalPlannedHours += pTime;
      order.totalActualHours += aTime;

      if (refOp) {
        order.operations[refOp] = {
          planned: (order.operations[refOp]?.planned || 0) + pTime,
          actual: (order.operations[refOp]?.actual || 0) + aTime
        };
      }
    });

    const result = Array.from(orderMap.values()).map((order) => {
      const rankedMachines = Object.entries(order.machineTotals || {})
        .map(([machineCode, weightedHours]) => ({
          machineCode,
          weightedHours,
          score: getMachinePriority(machineCode) + weightedHours,
        }))
        .sort((a, b) => b.score - a.score);

      const primaryMachine = rankedMachines[0]?.machineCode || order.machine;
      const { machineTotals, ...rest } = order;

      // Planned Delivery Date → deliveryDate (canonical field used throughout the app)
      let deliveryDate = rest.plannedDeliveryDate || null;
      let weekNumber = rest.weekNumber || null;
      if (deliveryDate) {
        const d = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
        if (!isNaN(d.getTime())) {
          deliveryDate = d.toISOString();
          weekNumber = getISOWeek(d);
        } else {
          deliveryDate = null;
        }
      }

      return {
        ...rest,
        machine: primaryMachine,
        deliveryDate,
        weekNumber,
      };
    });
    addLog(`${result.length} orders geconsolideerd.`, "success");
    return result;
  };

  const handleSheetChange = (sheetName, workbookOverride = null) => {
    const workbook = workbookOverride || rawWorkbook;
    if (!workbook) return;
    setSelectedSheetName(sheetName);
    setLoading(true);
    try {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        addLog(`Tabblad niet gevonden: ${sheetName}`, "error");
        setFileData([]);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const data = processRawLNDump(rawRows);
      setFileData(data);
    } catch (err) {
      addLog("Fout bij inlezen tabblad.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      setRawWorkbook(workbook);
      setAvailableSheets(workbook.SheetNames);
      const bestSheet = workbook.SheetNames.find(n => n.toLowerCase().includes("data") || n.toLowerCase().includes("format") || n === "40BM01");
      handleSheetChange(bestSheet || workbook.SheetNames[0], workbook);
    } catch (err) { addLog("Bestand onleesbaar.", "error"); } finally { setLoading(false); }
  };

  const validOrders = useMemo(() => fileData.filter((d) => d.isValidForImport), [fileData]);
  const availableMachines = useMemo(() => ["All", ...Array.from(new Set(validOrders.map(d => d.machine))).sort()], [validOrders]);
  const displayData = useMemo(() => {
    let rows = [...validOrders];

    if (machineGroupFilter === "fittings") {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    } else if (machineGroupFilter === "pipes") {
      rows = rows.filter((d) => isPipesMachine(d.machine));
    } else if (machineGroupFilter === "other") {
      rows = rows.filter((d) => !isFittingsMachine(d.machine) && !isPipesMachine(d.machine));
    }

    if (machineFilter !== "All") {
      rows = rows.filter((d) => d.machine === machineFilter);
    }

    if (statusFilter === "new") {
      rows = rows.filter((d) => !existingIds.has(d.id));
    } else if (statusFilter === "existing") {
      rows = rows.filter((d) => existingIds.has(d.id));
    }

    return rows;
  }, [validOrders, machineFilter, machineGroupFilter, statusFilter, existingIds]);
  const importableCount = useMemo(() => displayData.filter(d => d.isValidForImport && (importMode === "overwrite" || !existingIds.has(d.id))).length, [displayData, importMode, existingIds]);

  const startImport = async () => {
    setImporting(true);
    try {
      const toImport = displayData.filter(d => d.isValidForImport && (importMode === "overwrite" || !existingIds.has(d.id)));

      // Schrijf in chunks van 400 (Firestore batch limiet is 500)
      const CHUNK = 400;
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const { isValidForImport, ...dbData } = item;
          // Planning order
          batch.set(doc(db, ...PATHS.PLANNING, item.id), { ...dbData, updatedAt: serverTimestamp() }, { merge: true });
          // Efficiency record: totalPlannedHours → standardTimeTotal (in minuten)
          const plannedMinutes = (item.totalPlannedHours || 0) * 60;
          const actualMinutes = (item.totalActualHours || 0) * 60;
          const qty = item.quantity || item.toDoQty || 1;
          const effData = {
            orderId: item.id,
            itemCode: item.itemCode || "",
            itemDescription: item.itemDescription || "",
            machine: item.machine || "",
            standardTimeTotal: plannedMinutes,
            productionTimeTotal: plannedMinutes,
            actualTimeTotal: actualMinutes,
            qcTimeTotal: 0,
            postProcessingTimeTotal: 0,
            quantity: qty,
            minutesPerUnit: qty > 0 ? plannedMinutes / qty : 0,
            status: "active",
            source: "ln_import",
            lastSync: new Date().toISOString(),
          };
          batch.set(doc(db, ...PATHS.EFFICIENCY_HOURS, item.id), effData, { merge: true });
        });
        await batch.commit();
      }
      addLog("Import succesvol!", "success");
      await logActivity(auth.currentUser?.uid, "PLANNING_IMPORT", `${toImport.length} orders geimporteerd.`);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch (err) { addLog("Database fout.", "error"); } finally { setImporting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
      <div className="bg-white w-full max-w-7xl max-h-[92vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 text-left">
        <div className="p-8 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-5">
            <div className="bg-blue-600 p-4 rounded-[1.5rem] text-white shadow-xl"><Database size={28} /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight italic leading-none">Planning Import</h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2">v4.7 • Extended Dossier Support</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full text-slate-400 transition-all"><X size={28} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-8 overflow-hidden bg-white custom-scrollbar">
            {fileData.length === 0 ? (
                <div onClick={() => fileInputRef.current?.click()} className="h-full border-4 border-dashed border-slate-100 rounded-[4rem] flex flex-col items-center justify-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group text-center">
                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6 text-blue-600 group-hover:scale-110 transition-transform">
                      {loading ? <Loader2 className="animate-spin" size={50} /> : <Upload size={50} />}
                    </div>
                    <h3 className="text-2xl font-black text-slate-700 uppercase">Selecteer LN Export</h3>
                    <p className="text-slate-400 mt-2 font-medium italic">Geconsolideerde import inclusief Order Creation Date</p>
                    <input type="file" ref={fileInputRef} onChange={handleFile} accept=".xlsx,.xlsm" className="hidden" />
                </div>
            ) : (
              <div className="h-full min-h-0 flex flex-col gap-8">
                <div className="bg-slate-900 p-6 rounded-[2.5rem] flex justify-between items-center shadow-2xl">
                   <div className="flex items-center gap-8 text-white">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-2 tracking-widest">Tabblad</span>
                        <select value={selectedSheetName} onChange={(e) => handleSheetChange(e.target.value)} className="bg-white/10 border border-white/20 rounded-2xl px-5 py-3 font-bold text-sm text-white outline-none focus:border-blue-500">
                          {availableSheets.map(s => <option key={s} value={s} className="text-slate-800">{s}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-2 tracking-widest">Filter</span>
                        <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-2xl px-5 py-3 font-bold text-sm text-white outline-none focus:border-blue-500">
                          {availableMachines.map(m => <option key={m} value={m} className="text-slate-800">{m === "All" ? "ALLE MACHINES" : m}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-2 tracking-widest">Machinegroep</span>
                        <select value={machineGroupFilter} onChange={(e) => setMachineGroupFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-2xl px-5 py-3 font-bold text-sm text-white outline-none focus:border-blue-500">
                          <option value="all" className="text-slate-800">ALLES</option>
                          <option value="fittings" className="text-slate-800">FITTINGS (BH11/12/15/16/17/18/31)</option>
                          <option value="pipes" className="text-slate-800">PIPES (BA05/07/08/09)</option>
                          <option value="other" className="text-slate-800">OVERIG</option>
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-2 tracking-widest">Status</span>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-2xl px-5 py-3 font-bold text-sm text-white outline-none focus:border-blue-500">
                          <option value="all" className="text-slate-800">ALLES</option>
                          <option value="new" className="text-slate-800">NIEUW</option>
                          <option value="existing" className="text-slate-800">BESTAAND</option>
                        </select>
                      </div>
                   </div>
                   <div className="text-right text-white">
                       <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Gevonden Orders</p>
                       <p className="text-3xl font-black tracking-tighter">{displayData.length}</p>
                   </div>
                </div>

                <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-sm flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b">
                      <tr>
                        <th className="px-8 py-5 sticky top-0 bg-slate-50">Order</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50">Machine</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50">Product</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50">ExtraCode (Special Instructions)</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50 text-center">Plan Uren</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50 text-right pr-10">Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayData.slice(0, 50).map((order) => {
                        const isExisting = existingIds.has(order.id);
                        return (
                          <tr key={order.id} className={`hover:bg-blue-50/30 transition-all ${!order.isValidForImport ? 'opacity-30 grayscale italic' : ''}`}>
                            <td className="px-8 py-4 font-black text-slate-900">{order.orderId}</td>
                            <td className="px-6 py-4"><span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl font-black text-[10px] uppercase">{order.machine}</span></td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-800 truncate max-w-sm">{order.itemDescription}</p>
                              <span className="text-[9px] text-slate-400 font-mono">{order.itemCode}</span>
                            </td>
                            <td className="px-6 py-4">
                              {order.extraCode ? (
                                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-black border border-amber-100">{order.extraCode}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className="text-sm font-black text-blue-600">{Number(order.totalPlannedHours).toFixed(1)}h</span>
                            </td>
                            <td className="px-6 py-4 text-right pr-10">
                               {isExisting ? (
                                 <span className="text-amber-500 font-black uppercase text-[10px]">Update</span>
                               ) : (
                                 <span className="text-emerald-500 font-black uppercase text-[10px]">Nieuw</span>
                               )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
          <div className="flex gap-5 bg-white p-1.5 rounded-3xl border border-slate-200">
             <button onClick={() => setImportMode("new_only")} className={`px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "new_only" ? "bg-blue-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>Alleen Nieuwe</button>
             <button onClick={() => setImportMode("overwrite")} className={`px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "overwrite" ? "bg-orange-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>Overschrijf Alles</button>
          </div>
          <div className="flex gap-5">
            <button onClick={onClose} className="px-10 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all">Annuleren</button>
            <button onClick={startImport} disabled={importableCount === 0 || importing} className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-4 disabled:opacity-50 disabled:bg-slate-300">
              {importing ? <Loader2 className="animate-spin" size={24} /> : <ShieldCheck size={24} />}
              Importeer {importableCount} Orders
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanningImportModal;
