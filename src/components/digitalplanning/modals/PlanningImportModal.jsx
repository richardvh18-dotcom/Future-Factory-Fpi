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
import { getISOWeek, format, startOfISOWeek, differenceInCalendarWeeks } from "date-fns";

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
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [selectedWeekCutoff, setSelectedWeekCutoff] = useState("");
  const [hybridImportEnabled, setHybridImportEnabled] = useState(false);
  const [hybridMachines, setHybridMachines] = useState([]);
  const [, setDebugLogs] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchExisting = async () => {
      if (!isOpen) return;
      try {
        const snap = await getDocs(collection(db, ...PATHS.PLANNING));
        setExistingIds(new Set(snap.docs.map(d => d.id)));
      } catch {
        addLog("Database connectie mislukt.", "error");
      }
    };
    fetchExisting();
  }, [isOpen]);

  const addLog = (msg, type = "info") => {
    setDebugLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 15)]);
  };

  const clean = (val) => String(val || "").trim();

  const normalizeMachineCodeForFilter = (machineCode) => {
    const raw = clean(machineCode).toUpperCase();
    if (!raw) return "-";
    return raw.startsWith("40") ? raw.slice(2) : raw;
  };

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

  const isActivePlanningStatus = (status) => {
    const s = clean(status).toLowerCase();
    return ["active", "released", "planned", "in productie", "lopend"].some((keyword) => s.includes(keyword));
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

  const getDeliveryMeta = (order) => {
    const raw = order?.deliveryDate || order?.plannedDeliveryDate;
    const parsed = raw ? new Date(raw) : null;
    const isValidDate = parsed && !isNaN(parsed.getTime());
    if (!isValidDate) {
      return { dateLabel: "-", weekLabel: "W?", weekDiff: null };
    }

    const nowWeekStart = startOfISOWeek(new Date());
    const targetWeekStart = startOfISOWeek(parsed);
    const weekDiff = differenceInCalendarWeeks(targetWeekStart, nowWeekStart);
    const weekNumber = order?.weekNumber || getISOWeek(parsed);

    return {
      dateLabel: format(parsed, "dd-MM-yyyy"),
      weekLabel: `W${weekNumber}`,
      weekDiff,
    };
  };

  const getDeliveryColorClass = (weekDiff) => {
    if (weekDiff === null) return "bg-slate-100 text-slate-500 border-slate-200";
    if (weekDiff < 0) return "bg-red-50 text-red-700 border-red-200";
    if (weekDiff === 0) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  // QC-stations per afdeling: wc na normalizeMachine ("40BM01" → "BM01")
  const QC_STATIONS = ["BM01", "BA01"];

  const classifyByWc = (wc) => {
    const upper = (wc || "").toUpperCase();
    if (QC_STATIONS.some(s => upper.includes(s))) return "qc";
    if (upper.includes("NABEWERK") || upper.includes("NABEW")) return "post";
    return null; // geen WC-match, val terug op refOp-code
  };

  const classifyReferenceOperation = (refOp, wc) => {
    const wcBucket = classifyByWc(wc);
    if (wcBucket) return wcBucket;
    const digits = parseInt(String(refOp || "").replace(/\D/g, ""), 10);
    if (isNaN(digits)) return "production";
    const opCode = digits % 100;
    if (opCode === 60) return "qc";
    if (opCode === 30) return "post";
    return "production";
  };

  const getSplitPlannedHours = (operations, fallbackTotalHours) => {
    const split = { productionHours: 0, postHours: 0, qcHours: 0 };
    const entries = Object.entries(operations || {});

    if (entries.length === 0) {
      split.productionHours = fallbackTotalHours || 0;
      return split;
    }

    entries.forEach(([refOp, values]) => {
      const planned = Number(values?.planned || 0);
      const bucket = classifyReferenceOperation(refOp, values?.wc);
      if (bucket === "qc") split.qcHours += planned;
      else if (bucket === "post") split.postHours += planned;
      else split.productionHours += planned;
    });

    // Veiligheidsnet: als er niets herkend is, val terug op totaal zodat tijd niet verdwijnt.
    if (split.productionHours === 0 && split.postHours === 0 && split.qcHours === 0) {
      split.productionHours = fallbackTotalHours || 0;
    }

    return split;
  };

  const buildReferenceOperationSummary = (operations = {}) => {
    const byCode = {};

    Object.entries(operations).forEach(([refOp, values]) => {
      const planned = Number(values?.planned || 0);
      const actual = Number(values?.actual || 0);
      const wc = normalizeMachine(values?.wc || "");
      const bucket = classifyReferenceOperation(refOp, wc);

      byCode[refOp] = {
        plannedHours: planned,
        actualHours: actual,
        workCenter: wc,
        bucket,
      };
    });

    return byCode;
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
      notes: findCol(["production order text", "po text", "po-text", "po note", "opmerking"]),
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
          item: clean(row[idx.desc]),
          itemDescription: clean(row[idx.desc]),
          project: clean(row[idx.project]),
          projectDesc: clean(row[idx.projectDesc]),
          notes: clean(row[idx.notes]),
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

      if (!order.notes) {
        order.notes = clean(row[idx.notes]);
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
          actual: (order.operations[refOp]?.actual || 0) + aTime,
          wc: order.operations[refOp]?.wc || normalizeMachine(row[idx.machine] || "")
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
      const rest = { ...order };
      delete rest.machineTotals;

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
    } catch {
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
    } catch { addLog("Bestand onleesbaar.", "error"); } finally { setLoading(false); }
  };

  const validOrders = useMemo(() => fileData.filter((d) => d.isValidForImport), [fileData]);
  useEffect(() => {
    setSelectedOrderIds(new Set(validOrders.map((d) => d.id)));
  }, [validOrders]);

  const availableWeeks = useMemo(() => {
    return Array.from(
      new Set(
        validOrders
          .map((d) => Number(d.weekNumber))
          .filter((w) => Number.isFinite(w) && w > 0)
      )
    ).sort((a, b) => a - b);
  }, [validOrders]);

  useEffect(() => {
    if (!availableWeeks.length) {
      setSelectedWeekCutoff("");
      return;
    }
    setSelectedWeekCutoff((prev) => {
      if (prev && availableWeeks.includes(Number(prev))) return prev;
      return String(availableWeeks[availableWeeks.length - 1]);
    });
  }, [availableWeeks]);

  const availableMachines = useMemo(() => ["All", ...Array.from(new Set(validOrders.map(d => d.machine))).sort()], [validOrders]);
  const availableHybridMachines = useMemo(
    () => Array.from(new Set(validOrders.map((d) => normalizeMachineCodeForFilter(d.machine)).filter(Boolean))).sort(),
    [validOrders]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("planningImportHybridConfig");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setHybridImportEnabled(Boolean(parsed?.enabled));
      setHybridMachines(Array.isArray(parsed?.machines) ? parsed.machines.map((m) => normalizeMachineCodeForFilter(m)) : []);
    } catch {
      // Geen opgeslagen voorkeuren of ongeldige JSON.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "planningImportHybridConfig",
        JSON.stringify({
          enabled: hybridImportEnabled,
          machines: hybridMachines,
        })
      );
    } catch {
      // Storage kan uitstaan in sommige browsers/profielen.
    }
  }, [hybridImportEnabled, hybridMachines]);

  useEffect(() => {
    setHybridMachines((prev) => prev.filter((machine) => availableHybridMachines.includes(machine)));
  }, [availableHybridMachines]);

  const isAllowedByHybridMachineFilter = (order) => {
    if (!hybridImportEnabled) return true;
    if (!hybridMachines.length) return false;
    return hybridMachines.includes(normalizeMachineCodeForFilter(order.machine));
  };

  const toggleHybridMachine = (machineCode) => {
    setHybridMachines((prev) => {
      if (prev.includes(machineCode)) return prev.filter((m) => m !== machineCode);
      return [...prev, machineCode].sort();
    });
  };

  const selectHybridMachines = (machines) => {
    const unique = Array.from(new Set(machines.map((m) => normalizeMachineCodeForFilter(m)))).filter((m) => availableHybridMachines.includes(m));
    setHybridMachines(unique.sort());
  };

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

  const importCandidates = useMemo(() => {
    let rows = validOrders.filter((d) => importMode === "overwrite" || !existingIds.has(d.id));
    rows = rows.filter((d) => isAllowedByHybridMachineFilter(d));
    return rows;
  }, [validOrders, importMode, existingIds, hybridImportEnabled, hybridMachines]);

  const importableCount = useMemo(
    () => importCandidates.length,
    [importCandidates]
  );
  const deliveryBuckets = useMemo(() => {
    return displayData.reduce(
      (acc, order) => {
        const { weekDiff } = getDeliveryMeta(order);
        if (weekDiff === null) acc.unknown += 1;
        else if (weekDiff < 0) acc.overdue += 1;
        else if (weekDiff === 0) acc.current += 1;
        else acc.upcoming += 1;
        return acc;
      },
      { overdue: 0, current: 0, upcoming: 0, unknown: 0 }
    );
  }, [displayData]);

  const toggleOrderSelection = (id) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setVisibleSelection = (selected) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      displayData.forEach((order) => {
        if (selected) next.add(order.id);
        else next.delete(order.id);
      });
      return next;
    });
  };

  const selectThroughWeek = () => {
    const cutoff = Number(selectedWeekCutoff);
    if (!Number.isFinite(cutoff) || cutoff <= 0) return;

    const keepVisible = new Set(
      validOrders
        .filter((order) => {
          const orderWeek = Number(order.weekNumber);
          if (Number.isFinite(orderWeek) && orderWeek > 0 && orderWeek <= cutoff) return true;
          return isActivePlanningStatus(order.orderStatus);
        })
        .map((order) => order.id)
    );

    setSelectedOrderIds(keepVisible);
  };

  const startImport = async () => {
    setImporting(true);
    try {
      const toImport = importCandidates;

      // Schrijf in chunks van 400 (Firestore batch limiet is 500)
      const CHUNK = 400;
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const dbData = { ...item };
          delete dbData.isValidForImport;
          const normalizedItem = dbData.item || dbData.itemDescription || "";
          const normalizedItemDescription = dbData.itemDescription || dbData.item || "";
          const { productionHours, postHours, qcHours } = getSplitPlannedHours(item.operations, item.totalPlannedHours || 0);
          const operationByCode = buildReferenceOperationSummary(item.operations);

          // Planning order
          batch.set(
            doc(db, ...PATHS.PLANNING, item.id),
            {
              ...dbData,
              item: normalizedItem,
              itemDescription: normalizedItemDescription,
              // Houd station-specifieke importuren op orderniveau voor planning/efficiency fallback.
              plannedHoursBH: productionHours,
              plannedHoursNabewerken: postHours,
              plannedHoursBM01: qcHours,
              plannedMinutesBH: productionHours * 60,
              plannedMinutesNabewerken: postHours * 60,
              plannedMinutesBM01: qcHours * 60,
              referenceOperationTimes: operationByCode,
              planningHidden: !selectedOrderIds.has(item.id),
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
          // Efficiency record: totalPlannedHours → standardTimeTotal (in minuten)
          const productionMinutes = productionHours * 60;
          const postProcessingMinutes = postHours * 60;
          const qcMinutes = qcHours * 60;
          const standardMinutes = productionMinutes + postProcessingMinutes;
          const actualMinutes = (item.totalActualHours || 0) * 60;
          const qty = item.quantity || item.toDoQty || 1;
          const effData = {
            orderId: item.id,
            itemCode: item.itemCode || "",
            itemDescription: normalizedItemDescription,
            machine: item.machine || "",
            standardTimeTotal: standardMinutes,
            productionTimeTotal: productionMinutes,
            actualTimeTotal: actualMinutes,
            qcTimeTotal: qcMinutes,
            postProcessingTimeTotal: postProcessingMinutes,
            quantity: qty,
            minutesPerUnit: qty > 0 ? standardMinutes / qty : 0,
            status: "active",
            source: "ln_import",
            lastSync: new Date().toISOString(),
          };
          batch.set(doc(db, ...PATHS.EFFICIENCY_HOURS, item.id), effData, { merge: true });
        });
        await batch.commit();
      }
      addLog("Import succesvol!", "success");
      const visibleCount = toImport.filter((item) => selectedOrderIds.has(item.id)).length;
      const hiddenCount = toImport.length - visibleCount;
      await logActivity(auth.currentUser?.uid, "PLANNING_IMPORT", `${toImport.length} orders geimporteerd (${visibleCount} zichtbaar, ${hiddenCount} verborgen).`);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch { addLog("Database fout.", "error"); } finally { setImporting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
      <div className="bg-white w-full max-w-[96vw] max-h-[92vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 text-left">
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
                       <p className="text-[10px] mt-1 text-blue-200 font-black uppercase tracking-widest">In Planning: {displayData.filter((order) => selectedOrderIds.has(order.id)).length}</p>
                       <div className="mt-3 flex flex-wrap justify-end gap-2">
                         <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-200 text-[10px] font-black uppercase tracking-widest">Achter: {deliveryBuckets.overdue}</span>
                         <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-[10px] font-black uppercase tracking-widest">Deze week: {deliveryBuckets.current}</span>
                         <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 text-[10px] font-black uppercase tracking-widest">Komend: {deliveryBuckets.upcoming}</span>
                       </div>
                   </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4 bg-slate-50 border border-slate-200 rounded-3xl p-4">
                  <div className="flex items-end gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1">Week t/m</span>
                      <select
                        value={selectedWeekCutoff}
                        onChange={(e) => setSelectedWeekCutoff(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-4 py-2 font-bold text-xs text-slate-700 outline-none focus:border-blue-500"
                      >
                        {availableWeeks.length === 0 ? (
                          <option value="">Geen weekdata</option>
                        ) : (
                          availableWeeks.map((week) => (
                            <option key={week} value={week}>Week {week}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <button
                      onClick={selectThroughWeek}
                      disabled={!selectedWeekCutoff}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow hover:bg-blue-700 disabled:opacity-50"
                    >
                      Selecteer t/m week + lopende orders
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVisibleSelection(true)}
                      className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100"
                    >
                      Alles zichtbaar
                    </button>
                    <button
                      onClick={() => setVisibleSelection(false)}
                      className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100"
                    >
                      Alles verborgen
                    </button>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Hybride Import</p>
                      <p className="text-xs font-bold text-amber-900">Beperk import tot gekozen workcenters (bijv. BH12/BH18).</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-black text-amber-900 uppercase tracking-widest cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hybridImportEnabled}
                        onChange={(e) => setHybridImportEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                      />
                      Alleen geselecteerde machines importeren
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => selectHybridMachines(["BH12", "BH18"])}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-100"
                    >
                      BH12 + BH18
                    </button>
                    <button
                      onClick={() => selectHybridMachines(availableHybridMachines)}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-100"
                    >
                      Alles selecteren
                    </button>
                    <button
                      onClick={() => setHybridMachines([])}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-100"
                    >
                      Leegmaken
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                    {availableHybridMachines.map((machineCode) => {
                      const selected = hybridMachines.includes(machineCode);
                      return (
                        <button
                          key={machineCode}
                          onClick={() => toggleHybridMachine(machineCode)}
                          className={`px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-widest border transition-all ${selected ? "bg-amber-600 text-white border-amber-600" : "bg-white text-amber-800 border-amber-300 hover:bg-amber-100"}`}
                        >
                          {machineCode}
                        </button>
                      );
                    })}
                  </div>

                  {hybridImportEnabled && hybridMachines.length === 0 && (
                    <p className="text-[11px] font-bold text-red-700">Hybride import staat aan, maar er zijn nog geen machines geselecteerd. Resultaat: 0 imports.</p>
                  )}
                </div>

                <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-sm flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b">
                      <tr>
                        <th className="px-8 py-5 sticky top-0 bg-slate-50">Order</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50">Machine</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50">Product</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50 text-center">Leverdatum</th>
                        <th className="px-4 py-5 sticky top-0 bg-slate-50 text-center">Status</th>
                        <th className="px-4 py-5 sticky top-0 bg-slate-50 text-center">Aantal</th>
                        <th className="px-4 py-5 sticky top-0 bg-slate-50 text-center w-[120px]">ExtraCode</th>
                        <th className="px-4 py-5 sticky top-0 bg-slate-50">PO Text</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50 text-center">Plan Uren</th>
                        <th className="px-6 py-5 sticky top-0 bg-slate-50 text-right pr-10">In Planning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayData.slice(0, 50).map((order) => {
                        const isExisting = existingIds.has(order.id);
                        const deliveryMeta = getDeliveryMeta(order);
                        const deliveryColor = getDeliveryColorClass(deliveryMeta.weekDiff);
                        return (
                          <tr key={order.id} className={`hover:bg-blue-50/30 transition-all ${!order.isValidForImport ? 'opacity-30 grayscale italic' : ''}`}>
                            <td className="px-8 py-4 font-black text-slate-900">{order.orderId}</td>
                            <td className="px-6 py-4"><span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl font-black text-[10px] uppercase">{order.machine}</span></td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-800 truncate max-w-sm">{order.itemDescription}</p>
                              <span className="text-[9px] text-slate-400 font-mono">{order.itemCode}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`px-2 py-1 rounded-lg border text-[10px] font-black ${deliveryColor}`}>{deliveryMeta.weekLabel}</span>
                                <span className="text-[10px] font-bold text-slate-500">{deliveryMeta.dateLabel}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase max-w-[110px] truncate">{order.orderStatus || "-"}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="text-[11px] font-black text-slate-700">{Number(order.toDoQty || order.quantity || 0)}</span>
                            </td>
                            <td className="px-4 py-4 text-center w-[120px]">
                              {order.extraCode ? (
                                <span className="inline-block max-w-[96px] truncate text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-black border border-amber-100">{order.extraCode}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {order.notes ? (
                                <span className="inline-block max-w-[260px] truncate text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-black border border-indigo-100">{order.notes}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className="text-sm font-black text-blue-600">{Number(order.totalPlannedHours).toFixed(1)}h</span>
                            </td>
                            <td className="px-6 py-4 text-right pr-10">
                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.has(order.id)}
                                  onChange={() => toggleOrderSelection(order.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                {isExisting ? (
                                  <span className="text-amber-500 font-black uppercase text-[10px]">Update</span>
                                ) : (
                                  <span className="text-emerald-500 font-black uppercase text-[10px]">Nieuw</span>
                                )}
                              </label>
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
