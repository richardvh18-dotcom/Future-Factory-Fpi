import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Upload,
  Loader2,
  Database,
  ShieldCheck,
  Clipboard,
} from "lucide-react";
import {
  collection,
  collectionGroup,
  getDocs,
} from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { importPlanningOrders } from "../../../services/planningSecurityService";
import * as XLSX from "xlsx";
import { getISOWeek, format, startOfISOWeek, differenceInCalendarWeeks, parse, parseISO, isValid, subWeeks } from "date-fns";

/**
 * PlanningImportModal v4.7 - Pilot Version (Order Creation Date Support)
 */
const PlanningImportModal = ({ isOpen, onClose, onSuccess, currentDepartment = "all" }) => {
  const { t } = useTranslation();
  const [fileData, setFileData] = useState([]);
  const [rawWorkbook, setRawWorkbook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [existingIds, setExistingIds] = useState(new Set());
  const [existingOrderMap, setExistingOrderMap] = useState(new Map());
  const [importMode, setImportMode] = useState("smart_update");
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [machineGroupFilter, setMachineGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [pasteMode, setPasteMode] = useState(false);
  const [importProgressPct, setImportProgressPct] = useState(0);
  const [importProgressLabel, setImportProgressLabel] = useState("");
  const [importEtaLabel, setImportEtaLabel] = useState("");
  const [, setDebugLogs] = useState([]);

  const fileInputRef = useRef(null);
  const pasteTextAreaRef = useRef(null);

  useEffect(() => {
    const fetchExisting = async () => {
      if (!isOpen) return;
      try {
        const [rootSnap, scopedSnap] = await Promise.all([
          getDocs(collection(db, ...PATHS.PLANNING)),
          getDocs(collectionGroup(db, "orders")),
        ]);

        const mergedDocs = [...rootSnap.docs, ...scopedSnap.docs];
        const keySet = new Set();
        const byKey = new Map();

        mergedDocs.forEach((docEntry) => {
          const data = docEntry.data() || {};
          const key = getOrderKey({ ...data, id: docEntry.id });
          if (!key) return;
          keySet.add(key);
          if (!byKey.has(key)) {
            byKey.set(key, data);
          }
        });

        setExistingIds(keySet);
        setExistingOrderMap(byKey);
      } catch {
        addLog(t("digitalplanning.planning_import.logs.db_connect_failed", "Database connectie mislukt."), "error");
      }
    };
    fetchExisting();
  }, [isOpen, t]);

  const addLog = (msg, type = "info") => {
    setDebugLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 15)]);
  };

  const clean = (val) => String(val || "").trim();
  const getOrderKey = (entry) => clean(entry?.orderId || entry?.id).toUpperCase();
  const isExistingOrder = (order) => existingIds.has(getOrderKey(order));
  const normalizeDepartment = (value) => String(value || "").trim().toLowerCase();
  const departmentScope = normalizeDepartment(currentDepartment);
  const isFittingsScoped = departmentScope === "fittings";

  useEffect(() => {
    if (!isOpen) return;
    setImportMode("smart_update");
    setPasteMode(false);
    setSelectedMachines([]);
    setMachineGroupFilter(isFittingsScoped ? "fittings" : "all");
    setImportProgressPct(0);
    setImportProgressLabel("");
    setImportEtaLabel("");
  }, [isOpen, isFittingsScoped]);

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

  const parsePastedTabularData = (text) => {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "\t" && !inQuotes) {
        row.push(cell.trim());
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && inQuotes) {
        cell += " ";
        continue;
      }

      cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      rows.push(row);
    }

    return rows.filter((r) => r.some((c) => clean(c) !== ""));
  };

  const normalizeHeader = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const firstIndex = (headers, candidates) => {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates) {
      const idx = normalized.findIndex((h) => h === normalizeHeader(candidate));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const parseFlexibleDate = (rawValue) => {
    if (!rawValue) return null;
    if (rawValue instanceof Date && !isNaN(rawValue.getTime())) return rawValue;

    const raw = String(rawValue).trim();
    if (!raw) return null;

    const candidates = [
      parse(raw, "dd/MM/yyyy", new Date()),
      parse(raw, "d/M/yyyy", new Date()),
      parse(raw, "dd-MM-yyyy", new Date()),
      parse(raw, "d-M-yyyy", new Date()),
      parse(raw, "MM/dd/yyyy", new Date()),
      parse(raw, "M/d/yyyy", new Date()),
      parse(raw, "MM-dd-yyyy", new Date()),
      parse(raw, "M-d-yyyy", new Date()),
      parseISO(raw),
      new Date(raw),
    ];

    return candidates.find((d) => isValid(d)) || null;
  };

  const processTabularPlanningRows = (rawRows) => {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

    const headerIdx = rawRows.findIndex((row) => {
      const headers = (row || []).map((h) => normalizeHeader(h));
      return headers.includes("order") && (headers.includes("machine") || headers.includes("datum") || headers.includes("date"));
    });

    if (headerIdx === -1) return [];

    const headers = (rawRows[headerIdx] || []).map((h) => String(h || "").trim());
    const dataRows = rawRows.slice(headerIdx + 1);

    const idxOrder = firstIndex(headers, ["order", "order id", "ordernummer", "production order"]);
    const idxMachine = firstIndex(headers, ["machine", "work center", "station"]);
    const idxItemCode = firstIndex(headers, ["manufactured item", "item code", "item"]);
    const idxItemDesc = firstIndex(headers, ["item desc", "item description", "description", "omschrijving"]);
    const idxDatum = firstIndex(headers, ["datum", "date", "delivery date", "leverdatum", "planned delivery date"]);
    const idxWeek = firstIndex(headers, ["week", "week number", "weeknumber"]);
    const idxPlan = firstIndex(headers, ["plan", "qty", "quantity", "aantal"]);
    const idxToDo = firstIndex(headers, ["to do", "to do qty", "todo", "to_do"]);
    const idxProduced = firstIndex(headers, ["gewikkeld", "produced", "gemaakt"]);
    const idxStatus = firstIndex(headers, ["status", "order status"]);
    const idxCode = firstIndex(headers, ["code", "extra code", "special instructions"]);
    const idxPoText = firstIndex(headers, ["po text", "po-text", "po note", "opmerking"]);
    const idxProject = firstIndex(headers, ["project"]);
    const idxProjectDesc = firstIndex(headers, ["project desc", "project description"]);
    const idxDrawing = firstIndex(headers, ["drawing", "drawing number", "tekening"]);

    if (idxOrder === -1) return [];

    const orders = dataRows
      .map((row) => {
        const orderId = clean(row[idxOrder]);
        if (!orderId) return null;

        const machine = normalizeMachine(idxMachine !== -1 ? row[idxMachine] : "-");
        const itemCode = idxItemCode !== -1 ? clean(row[idxItemCode]) : "";
        const itemDescription = idxItemDesc !== -1 ? clean(row[idxItemDesc]) : "";
        const rawStatus = idxStatus !== -1 ? clean(row[idxStatus]) : "released";
        const deliveryObj = idxDatum !== -1 ? parseFlexibleDate(row[idxDatum]) : null;
        const parsedWeek = idxWeek !== -1 ? Number(row[idxWeek]) : null;
        const weekNumber = Number.isFinite(parsedWeek) && parsedWeek > 0
          ? parsedWeek
          : (deliveryObj ? getISOWeek(deliveryObj) : null);

        const plan = idxToDo !== -1
          ? parseNum(row[idxToDo])
          : (idxPlan !== -1 ? parseNum(row[idxPlan]) : 0);

        const produced = idxProduced !== -1 ? parseNum(row[idxProduced]) : 0;
        const quantity = idxPlan !== -1 ? parseNum(row[idxPlan]) : plan;
        const idBase = `${orderId}_${itemCode || itemDescription || machine}`;

        return {
          id: idBase.replace(/[^a-zA-Z0-9]/g, "_") || orderId,
          orderId,
          machine,
          itemCode,
          item: itemDescription,
          itemDescription,
          project: idxProject !== -1 ? clean(row[idxProject]) : "",
          projectDesc: idxProjectDesc !== -1 ? clean(row[idxProjectDesc]) : "",
          notes: idxPoText !== -1 ? clean(row[idxPoText]) : "",
          extraCode: idxCode !== -1 ? clean(row[idxCode]) : "",
          quantity,
          toDoQty: plan || quantity,
          plan: plan || quantity,
          produced,
          plannedDeliveryDate: deliveryObj ? deliveryObj.toISOString() : null,
          deliveryDate: deliveryObj ? deliveryObj.toISOString() : null,
          plannedDate: deliveryObj ? subWeeks(deliveryObj, 3).toISOString() : null,
          weekNumber,
          orderStatus: rawStatus,
          drawing: idxDrawing !== -1 ? clean(row[idxDrawing]) : "",
          isValidForImport: isStatusAllowed(rawStatus),
          status: "waiting",
          totalPlannedHours: 0,
          totalActualHours: 0,
          operations: {},
          sourceType: "Pasted Table",
        };
      })
      .filter(Boolean);

    // Dedupe op id: laatste regel wint.
    const byId = new Map();
    orders.forEach((o) => byId.set(o.id, o));
    return Array.from(byId.values());
  };

  const normalizeMachine = (val) => {
    let str = clean(val).toUpperCase();
    // Work Center uit LN moet zichtbaar blijven zoals aangeleverd (bijv. 40BH18).
    if (str === "BM18") str = "BH18";
    if (str === "40BM18") str = "40BH18";
    return str || "-";
  };

  const extractMachineHint = (...values) => {
    const machinePattern = /(?:^|[^A-Z0-9])((?:40)?[A-Z]{2}\d{2})(?=$|[^A-Z0-9])/i;

    for (const value of values.flat(Infinity)) {
      const text = String(value || "").trim().toUpperCase();
      if (!text) continue;
      const match = text.match(machinePattern);
      if (match?.[1]) return match[1].toUpperCase();
    }

    return "";
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


  // LOGICA: Aggregatie van Operations per unieke Productie Order inclusief Creation Date
  const processRawLNDump = (rawRows) => {
    const headerIdx = rawRows.findIndex(r => r.some(c => clean(c).toLowerCase() === "production order"));
    if (headerIdx === -1) {
      addLog(t("digitalplanning.planning_import.logs.invalid_format", "Fout formaat: 'Production Order' niet gevonden."), "error");
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
      operation: findCol(["operation"]),
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

      const refOp = clean(row[idx.refOp]) || clean(row[idx.operation]);
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
          // Sitebrede regel: productie start standaard 3 weken voor levering.
          if (!rest.plannedDate) {
            rest.plannedDate = subWeeks(d, 3).toISOString();
          }
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
    addLog(
      t("digitalplanning.planning_import.logs.orders_consolidated", {
        count: result.length,
        defaultValue: "{{count}} orders geconsolideerd.",
      }),
      "success"
    );
    return result;
  };

  const handleSheetChange = (sheetName, workbookOverride = null) => {
    const workbook = workbookOverride || rawWorkbook;
    if (!workbook) return;
    setLoading(true);
    try {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        addLog(
          t("digitalplanning.planning_import.logs.sheet_not_found", {
            name: sheetName,
            defaultValue: "Tabblad niet gevonden: {{name}}",
          }),
          "error"
        );
        setFileData([]);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const data = processRawLNDump(rawRows);
      setFileData(data);
    } catch {
      addLog(t("digitalplanning.planning_import.logs.sheet_read_failed", "Fout bij inlezen tabblad."), "error");
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
      const bestSheet = workbook.SheetNames.find(n => n.toLowerCase().includes("data") || n.toLowerCase().includes("format") || n === "40BM01");
      handleSheetChange(bestSheet || workbook.SheetNames[0], workbook);
    } catch { addLog(t("digitalplanning.planning_import.logs.file_unreadable", "Bestand onleesbaar."), "error"); } finally { setLoading(false); }
  };

  const handlePasteImport = async () => {
    const pastedText = pasteTextAreaRef.current?.value || "";
    if (!clean(pastedText)) {
      alert(t("digitalplanning.planning_import.alerts.paste_first", "Plak eerst Excel-gegevens in het tekstveld."));
      return;
    }

    setLoading(true);
    try {
      let rows = parsePastedTabularData(pastedText);
      if (!rows.length) {
        alert(t("digitalplanning.planning_import.alerts.no_valid_paste_data", "Geen geldige geplakte data gevonden."));
        return;
      }

      let machineHintFromFlattened = extractMachineHint(pastedText);

      // Herstel voor enkele Office-plakvarianten waar alles in 1 lange regel terechtkomt.
      if (rows.length <= 2 && (rows[0]?.length || 0) > 40) {
        const allCells = rows.flat();
        const lowered = allCells.map((c) => String(c || "").toLowerCase().trim());
        const headerStart = lowered.findIndex(
          (c, i) =>
            c === "datum" &&
            lowered[i + 1] === "week" &&
            lowered[i + 2] === "order"
        );

        if (headerStart !== -1) {
          const machineCell = extractMachineHint(allCells.slice(0, headerStart));
          if (machineCell) machineHintFromFlattened = machineCell;

          const headerLen = 11;
          const header = allCells.slice(headerStart, headerStart + headerLen);
          const dataCells = allCells.slice(headerStart + headerLen);
          const rebuilt = [header];

          for (let i = 0; i < dataCells.length; i += headerLen) {
            const chunk = dataCells.slice(i, i + headerLen);
            if (!chunk.length) continue;
            while (chunk.length < headerLen) chunk.push("");
            if (chunk.some((v) => String(v || "").trim() !== "")) rebuilt.push(chunk);
          }

          if (rebuilt.length > 1) rows = rebuilt;
        }
      }

      let headerIndex = rows.findIndex((row) => {
        const lowered = row.map((h) => String(h || "").toLowerCase());
        return lowered.includes("machine") && lowered.includes("order");
      });

      if (headerIndex === -1) {
        headerIndex = rows.findIndex((row) => {
          const lowered = row.map((h) => String(h || "").toLowerCase());
          return lowered.includes("order") && lowered.includes("datum");
        });
      }

      if (headerIndex === -1) {
        alert(t("digitalplanning.planning_import.alerts.columns_not_found", "Fout: kolommen 'Machine' en 'order' niet gevonden."));
        return;
      }

      const normalizedRows = rows.slice(headerIndex);
      const headerRow = normalizedRows[0] || [];
      let hasMachineCol = headerRow.some((h) => String(h || "").toLowerCase().includes("machine"));

      let machineFromContext = machineHintFromFlattened || "";
      if (!machineFromContext) {
        for (let i = 0; i < headerIndex; i++) {
          const row = rows[i] || [];
          const hit = extractMachineHint(row);
          if (hit) {
            machineFromContext = hit;
            break;
          }
        }
      }

      let preparedRows = normalizedRows;
      if (!hasMachineCol && machineFromContext) {
        preparedRows = normalizedRows.map((row, idx) => {
          if (idx === 0) return ["Machine", ...row];
          if (!row.some((cell) => String(cell || "").trim() !== "")) return ["", ...row];
          return [machineFromContext, ...row];
        });
        hasMachineCol = true;
      }

      // Vul lege datum/week velden op met vorige waarde voor compacte plakblokken.
      if (preparedRows.length > 1) {
        const header = preparedRows[0].map((h) => String(h || "").toLowerCase().trim());
        const idxDate = header.indexOf("datum");
        const idxWeek = header.indexOf("week");
        const idxOrder = header.indexOf("order");
        let lastDate = "";
        let lastWeek = "";

        preparedRows = preparedRows.map((row, idx) => {
          if (idx === 0) return row;
          const next = [...row];
          if (idxDate !== -1) {
            const dateVal = String(next[idxDate] || "").trim();
            if (dateVal) lastDate = dateVal;
            else if (lastDate && String(next[idxOrder] || "").trim()) next[idxDate] = lastDate;
          }
          if (idxWeek !== -1) {
            const weekVal = String(next[idxWeek] || "").trim();
            if (weekVal) lastWeek = weekVal;
            else if (lastWeek && String(next[idxOrder] || "").trim()) next[idxWeek] = lastWeek;
          }
          return next;
        });
      }

      let parsedData = processRawLNDump(preparedRows);
      if (!parsedData.length) {
        parsedData = processTabularPlanningRows(preparedRows);
      }
      if (!parsedData.length) {
        alert(t("digitalplanning.planning_import.alerts.no_importable_orders", "Geen importeerbare orders gevonden in geplakte data."));
        return;
      }

      setRawWorkbook(null);
      setFileData(parsedData);
      addLog(
        t("digitalplanning.planning_import.logs.paste_rows_loaded", {
          count: parsedData.length,
          defaultValue: "{{count}} regels geladen uit plakdata.",
        }),
        "success"
      );
    } catch {
      addLog(t("digitalplanning.planning_import.logs.paste_processing_failed", "Fout bij verwerken van geplakte data."), "error");
      alert(t("digitalplanning.planning_import.alerts.paste_processing_failed", "Fout bij verwerken van geplakte data."));
    } finally {
      setLoading(false);
    }
  };

  const validOrders = useMemo(() => fileData.filter((d) => d.isValidForImport), [fileData]);

  const availableMachines = useMemo(() => {
    let machines = Array.from(new Set(validOrders.map((d) => normalizeMachineCodeForFilter(d.machine)).filter(Boolean))).sort();
    if (isFittingsScoped) {
      machines = machines.filter((machine) => isFittingsMachine(machine));
    }
    return machines;
  }, [validOrders, isFittingsScoped]);

  useEffect(() => {
    setSelectedMachines((prev) => {
      return prev.filter((machine) => availableMachines.includes(machine));
    });
  }, [availableMachines]);

  const isSpoolsMachine = (machineCode) => {
    const m = clean(machineCode).toUpperCase();
    const normalized = m.startsWith("40") ? m.slice(2) : m;
    return /^BB\d{2}$/.test(normalized) || /^BM\d{2}$/.test(normalized);
  };

  const getDepartmentGroupMachines = (groupName) => {
    if (groupName === "fittings") return availableMachines.filter((machine) => isFittingsMachine(machine));
    if (groupName === "pipes") return availableMachines.filter((machine) => isPipesMachine(machine));
    if (groupName === "spools") return availableMachines.filter((machine) => isSpoolsMachine(machine));
    return availableMachines;
  };

  const toggleMachineSelection = (machineCode) => {
    setSelectedMachines((prev) => {
      if (prev.includes(machineCode)) return prev.filter((m) => m !== machineCode);
      return [...prev, machineCode].sort();
    });
  };

  const selectMachines = (machines) => {
    const unique = Array.from(new Set(machines.map((m) => normalizeMachineCodeForFilter(m)))).filter((m) => availableMachines.includes(m));
    setSelectedMachines(unique.sort());
  };

  const isAllowedBySelectedMachines = (order) => {
    if (!selectedMachines.length) return false;
    return selectedMachines.includes(normalizeMachineCodeForFilter(order.machine));
  };

  const getComparableQty = (order) => {
    const raw =
      order?.quantity ??
      order?.plan ??
      order?.toDoQty ??
      0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizePoText = (value) =>
    clean(value)
      .replace(/\s+/g, " ")
      .trim();

  const orderChangeMeta = useMemo(() => {
    const byId = new Map();
    validOrders.forEach((order) => {
      const existing = existingOrderMap.get(getOrderKey(order));
      if (!existing) {
        byId.set(order.id, {
          isExisting: false,
          quantityChanged: false,
          notesChanged: false,
          oldQuantity: null,
          newQuantity: getComparableQty(order),
          oldNotes: "",
          newNotes: clean(order.notes),
          hasSmartChange: false,
        });
        return;
      }

      const oldQuantity = getComparableQty(existing);
      const newQuantity = getComparableQty(order);
      const oldNotes = normalizePoText(existing?.notes);
      const newNotes = normalizePoText(order?.notes);
      const quantityChanged = oldQuantity !== newQuantity;
      const notesChanged = oldNotes !== newNotes;

      byId.set(order.id, {
        isExisting: true,
        quantityChanged,
        notesChanged,
        oldQuantity,
        newQuantity,
        oldNotes,
        newNotes,
        hasSmartChange: quantityChanged || notesChanged,
      });
    });
    return byId;
  }, [validOrders, existingOrderMap]);

  const displayData = useMemo(() => {
    let rows = [...validOrders];

    if (isFittingsScoped) {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    } else if (machineGroupFilter === "fittings") {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    } else if (machineGroupFilter === "pipes") {
      rows = rows.filter((d) => isPipesMachine(d.machine));
    } else if (machineGroupFilter === "spools") {
      rows = rows.filter((d) => isSpoolsMachine(d.machine));
    }

    rows = rows.filter((d) => isAllowedBySelectedMachines(d));

    if (statusFilter === "new") {
      rows = rows.filter((d) => !isExistingOrder(d));
    } else if (statusFilter === "existing") {
      rows = rows.filter((d) => isExistingOrder(d));
    }

    if (importMode === "smart_update") {
      rows = rows.filter((d) => {
        const meta = orderChangeMeta.get(d.id);
        return meta ? (!meta.isExisting || meta.hasSmartChange) : false;
      });

      rows.sort((a, b) => {
        const aMeta = orderChangeMeta.get(a.id);
        const bMeta = orderChangeMeta.get(b.id);
        const aEligible = aMeta ? (!aMeta.isExisting || aMeta.hasSmartChange) : false;
        const bEligible = bMeta ? (!bMeta.isExisting || bMeta.hasSmartChange) : false;
        if (Number(bEligible) !== Number(aEligible)) return Number(bEligible) - Number(aEligible);
        return String(a.orderId || a.id).localeCompare(String(b.orderId || b.id));
      });
    }

    return rows;
  }, [validOrders, machineGroupFilter, statusFilter, existingIds, selectedMachines, importMode, orderChangeMeta, isFittingsScoped]);

  const importCandidates = useMemo(() => {
    let rows;
    if (importMode === "smart_update") {
      rows = validOrders.filter((d) => !isExistingOrder(d) || orderChangeMeta.get(d.id)?.hasSmartChange);
    } else {
      rows = validOrders.filter((d) =>
        importMode === "overwrite" ||
        !isExistingOrder(d)
      );
    }
    rows = rows.filter((d) => isAllowedBySelectedMachines(d));
    if (isFittingsScoped) {
      rows = rows.filter((d) => isFittingsMachine(d.machine));
    }
    return rows;
  }, [validOrders, importMode, existingIds, selectedMachines, orderChangeMeta, isFittingsScoped]);

  useEffect(() => {
    if (importMode === "smart_update") {
      setSelectedOrderIds(new Set(importCandidates.map((d) => d.id)));
      return;
    }
    setSelectedOrderIds(new Set(validOrders.map((d) => d.id)));
  }, [validOrders, importMode, importCandidates]);

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

  const startImport = async () => {
    setImporting(true);
    setImportProgressPct(0);
    setImportProgressLabel(t("digitalplanning.planning_import.progress_preparing", "Import voorbereiden..."));
    setImportEtaLabel("");
    try {
      const toImport = importCandidates;
      const importStartMs = Date.now();

      // Callable in chunks om payload-grootte stabiel te houden.
      const CHUNK = 250;
      const totalChunks = Math.max(1, Math.ceil(toImport.length / CHUNK));
      for (let i = 0; i < toImport.length; i += CHUNK) {
        const chunk = toImport.slice(i, i + CHUNK);
        const payloadOrders = chunk.map((item) => ({
          ...item,
          isExistingOrder: isExistingOrder(item),
          planningVisible: selectedOrderIds.has(item.id),
        }));

        await importPlanningOrders({
          orders: payloadOrders,
          importMode,
        });

        const chunkNumber = Math.floor(i / CHUNK) + 1;
        const pct = Math.round((chunkNumber / totalChunks) * 100);
        setImportProgressPct(pct);
        setImportProgressLabel(
          t("digitalplanning.planning_import.progress_chunks", {
            current: chunkNumber,
            total: totalChunks,
            defaultValue: "Import bezig: chunk {{current}}/{{total}}",
          })
        );

        const elapsedMs = Date.now() - importStartMs;
        const avgChunkMs = elapsedMs / chunkNumber;
        const remainingChunks = Math.max(0, totalChunks - chunkNumber);
        const remainingMs = Math.max(0, Math.round(avgChunkMs * remainingChunks));
        const remainingSec = Math.ceil(remainingMs / 1000);
        const etaMin = Math.floor(remainingSec / 60);
        const etaSec = remainingSec % 60;
        setImportEtaLabel(
          remainingChunks > 0
            ? t("digitalplanning.planning_import.progress_eta", {
                min: etaMin,
                sec: etaSec,
                defaultValue: "Nog ~{{min}}m {{sec}}s",
              })
            : t("digitalplanning.planning_import.progress_finalizing", "Afronden...")
        );
      }

      const newCount = toImport.filter((item) => !isExistingOrder(item)).length;
      const updateCount = toImport.length - newCount;
      const logMsg = importMode === "smart_update"
        ? `${toImport.length} orders gesynchroniseerd (${newCount} nieuw, ${updateCount} bijgewerkt).`
        : `${toImport.length} orders geimporteerd.`;
      setImportProgressPct(100);
      setImportProgressLabel(t("digitalplanning.planning_import.progress_done", "Import voltooid"));
      setImportEtaLabel("");
      addLog(t("digitalplanning.planning_import.logs.import_success", "Import succesvol!"), "success");
      await logActivity(auth.currentUser?.uid, "PLANNING_IMPORT", logMsg);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch {
      addLog(t("digitalplanning.planning_import.logs.database_error", "Database fout."), "error");
      setImportProgressLabel(t("digitalplanning.planning_import.progress_failed", "Import mislukt"));
      setImportEtaLabel("");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
      <div className="bg-white w-full max-w-[96vw] max-h-[92vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 text-left">
        <div className="p-5 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-[1.1rem] text-white shadow-xl"><Database size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight italic leading-none">{t("digitalplanning.planning_import.title", "Planning Import")}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">v4.7 • Extended Dossier Support</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-all"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-8 overflow-hidden bg-white custom-scrollbar">
            {fileData.length === 0 ? (
                <div className="h-full rounded-[4rem] border-2 border-slate-100 p-8 flex flex-col gap-6 bg-slate-50/40">
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => setPasteMode(true)}
                      className={`px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 transition-all border-2 ${pasteMode ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200" : "bg-white text-slate-600 border-slate-200"}`}
                    >
                      <Clipboard size={16} /> {t("digitalplanning.planning_import.paste_excel_data", "Plak Excel Data")}
                    </button>
                    <button
                      onClick={() => setPasteMode(false)}
                      className={`px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 transition-all border-2 ${!pasteMode ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200" : "bg-white text-slate-600 border-slate-200"}`}
                    >
                      <Upload size={16} /> {t("digitalplanning.planning_import.select_file", "Bestand Selecteren")}
                    </button>
                  </div>

                  {pasteMode ? (
                    <div className="flex-1 flex flex-col gap-4 min-h-0">
                      <textarea
                        ref={pasteTextAreaRef}
                        placeholder={t("digitalplanning.planning_import.paste_placeholder", "Plak hier de Excel-gegevens (tabellen) uit LN...")}
                        className="w-full flex-1 min-h-[260px] p-4 border-2 border-emerald-200 rounded-[24px] font-mono text-sm resize-none focus:outline-none focus:border-emerald-500 bg-white"
                      />
                      <button
                        onClick={handlePasteImport}
                        disabled={loading}
                        className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Clipboard size={16} />} {t("digitalplanning.planning_import.process_pasted_data", "Verwerk Geplakte Data")}
                      </button>
                    </div>
                  ) : (
                    <div onClick={() => fileInputRef.current?.click()} className="flex-1 border-4 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group text-center min-h-[320px]">
                      <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6 text-blue-600 group-hover:scale-110 transition-transform">
                        {loading ? <Loader2 className="animate-spin" size={50} /> : <Upload size={50} />}
                      </div>
                      <h3 className="text-2xl font-black text-slate-700 uppercase">{t("digitalplanning.planning_import.select_ln_export", "Selecteer LN Export")}</h3>
                      <p className="text-slate-400 mt-2 font-medium italic">{t("digitalplanning.planning_import.extended_support", "Geconsolideerde import inclusief Order Creation Date")}</p>
                      <input type="file" ref={fileInputRef} onChange={handleFile} accept=".xlsx,.xlsm" className="hidden" />
                    </div>
                  )}
                </div>
            ) : (
              <div className="h-full min-h-0 flex flex-col gap-8">
                <div className="bg-slate-900 p-4 rounded-[2.5rem] flex justify-between items-start shadow-2xl gap-4">
                   <div className="flex-1 min-w-0 text-white">
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-1 tracking-widest">{t("digitalplanning.planning_import.department_group_label", "Afdelingsgroep")}</span>
                          <select value={machineGroupFilter} onChange={(e) => setMachineGroupFilter(e.target.value)} disabled={isFittingsScoped} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 font-bold text-xs text-white outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed">
                            <option value="all" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_all", "ALLES")}</option>
                            <option value="fittings" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_fittings", "FITTINGS")}</option>
                            <option value="pipes" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_pipes", "PIPES")}</option>
                            <option value="spools" className="text-slate-800">{t("digitalplanning.planning_import.machine_group_spools", "SPOOLS")}</option>
                          </select>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-blue-400 uppercase ml-1 mb-1 tracking-widest">{t("digitalplanning.planning_import.status_label", "Status")}</span>
                          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 font-bold text-xs text-white outline-none focus:border-blue-500">
                            <option value="all" className="text-slate-800">{t("digitalplanning.planning_import.status_all", "ALLES")}</option>
                            <option value="new" className="text-slate-800">{t("digitalplanning.planning_import.status_new", "NIEUW")}</option>
                            <option value="existing" className="text-slate-800">{t("digitalplanning.planning_import.status_existing", "BESTAAND")}</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => selectMachines(availableMachines)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.select_all", "Alles selecteren")}
                          </button>
                          <button
                            onClick={() => selectMachines([])}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.clear_selection", "Leegmaken")}
                          </button>
                          <button
                            onClick={() => setVisibleSelection(true)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.all_visible", "Alles zichtbaar")}
                          </button>
                          <button
                            onClick={() => setVisibleSelection(false)}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white/20"
                          >
                            {t("digitalplanning.planning_import.all_hidden", "Alles verborgen")}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 max-h-16 overflow-y-auto pr-1">
                        {availableMachines.map((machineCode) => {
                          const selected = selectedMachines.includes(machineCode);
                          return (
                            <button
                              key={machineCode}
                              onClick={() => toggleMachineSelection(machineCode)}
                              className={`px-2.5 py-1 rounded-lg font-black uppercase text-[10px] tracking-widest border transition-all ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white/5 text-slate-200 border-white/20 hover:bg-white/15"}`}
                            >
                              {machineCode}
                            </button>
                          );
                        })}
                      </div>
                   </div>
                   <div className="text-right text-white shrink-0">
                       <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">{t("digitalplanning.planning_import.found_orders", "Gevonden Orders")}</p>
                       <p className="text-3xl font-black tracking-tighter">{displayData.length}</p>
                       <p className="text-[10px] mt-1 text-emerald-200 font-black uppercase tracking-widest">{t("digitalplanning.planning_import.selected_machines_count", { count: selectedMachines.length, defaultValue: "Machines in import: {{count}}" })}</p>
                       <p className="text-[10px] mt-1 text-blue-200 font-black uppercase tracking-widest">{t("digitalplanning.planning_import.in_planning", { count: displayData.filter((order) => selectedOrderIds.has(order.id)).length, defaultValue: "In Planning: {{count}}" })}</p>
                       <div className="mt-2 flex flex-wrap justify-end gap-2">
                         <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_overdue", { count: deliveryBuckets.overdue, defaultValue: "Achter: {{count}}" })}</span>
                         <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_current", { count: deliveryBuckets.current, defaultValue: "Deze week: {{count}}" })}</span>
                         <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 text-[10px] font-black uppercase tracking-widest">{t("digitalplanning.planning_import.bucket_upcoming", { count: deliveryBuckets.upcoming, defaultValue: "Komend: {{count}}" })}</span>
                       </div>
                   </div>
                </div>

                <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-sm flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-400 font-black uppercase tracking-wider border-b">
                      <tr>
                        <th className="px-4 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_order", "Order")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_machine", "Machine")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_product", "Product")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_delivery_date", "Leverdatum")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_status", "Status")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_quantity", "Aantal")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50 text-center w-[100px]">{t("digitalplanning.planning_import.table_extra_code", "ExtraCode")}</th>
                        <th className="px-2 py-3 sticky top-0 bg-slate-50">{t("digitalplanning.planning_import.table_po_text", "PO Text")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-center">{t("digitalplanning.planning_import.table_plan_hours", "Plan Uren")}</th>
                        <th className="px-3 py-3 sticky top-0 bg-slate-50 text-right pr-4">{t("digitalplanning.planning_import.table_in_planning", "In Planning")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {displayData.slice(0, 50).map((order) => {
                        const isExisting = isExistingOrder(order);
                        const changeMeta = orderChangeMeta.get(order.id);
                        const isQtyIncrease = changeMeta?.quantityChanged && Number(changeMeta.newQuantity) > Number(changeMeta.oldQuantity);
                        const isQtyDecrease = changeMeta?.quantityChanged && Number(changeMeta.newQuantity) < Number(changeMeta.oldQuantity);
                        const isSmartUnchangedExisting =
                          importMode === "smart_update" &&
                          isExisting &&
                          !changeMeta?.hasSmartChange;
                        const deliveryMeta = getDeliveryMeta(order);
                        const deliveryColor = getDeliveryColorClass(deliveryMeta.weekDiff);
                        return (
                          <tr key={order.id} className={`hover:bg-blue-50/30 transition-all ${!order.isValidForImport ? 'opacity-30 grayscale italic' : ''}`}>
                            <td className="px-4 py-1.5 font-black text-slate-900 whitespace-nowrap leading-tight">{order.orderId}</td>
                            <td className="px-3 py-1.5"><span className="bg-blue-100 text-blue-700 px-2 py-[2px] rounded-lg font-black text-[10px] uppercase leading-none">{order.machine}</span></td>
                            <td className="px-3 py-1.5 leading-tight">
                              <p className="font-bold text-slate-800 truncate max-w-[220px]">{order.itemDescription}</p>
                              <span className="text-[9px] text-slate-400 font-mono">{order.itemCode}</span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <div className="flex flex-col items-center gap-0.5 leading-tight">
                                <span className={`px-2 py-[2px] rounded-lg border text-[10px] font-black ${deliveryColor}`}>{deliveryMeta.weekLabel}</span>
                                <span className="text-[10px] font-bold text-slate-500">{deliveryMeta.dateLabel}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className="inline-block px-2 py-[2px] rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase max-w-[110px] truncate leading-none">{order.orderStatus || "-"}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.quantityChanged ? (
                                <div className="inline-flex items-center gap-1">
                                  <span className="text-[10px] font-black text-slate-400 line-through">{changeMeta.oldQuantity}</span>
                                  <span
                                    className={`text-[11px] font-black px-1.5 py-[1px] rounded border ${
                                      isQtyIncrease
                                        ? "text-emerald-700 bg-emerald-100 border-emerald-200"
                                        : isQtyDecrease
                                        ? "text-red-700 bg-red-100 border-red-200"
                                        : "text-slate-700 bg-slate-100 border-slate-200"
                                    }`}
                                  >
                                    {changeMeta.newQuantity}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-black text-slate-700">{Number(order.quantity || 0)}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center w-[100px]">
                              {order.extraCode ? (
                                <span className="inline-block max-w-[88px] truncate text-[10px] bg-amber-50 text-amber-700 px-1.5 py-[2px] rounded font-black border border-amber-100 leading-none">{order.extraCode}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 leading-tight">
                              {order.notes ? (
                                <span
                                  className={`inline-block max-w-[200px] truncate text-[10px] px-1.5 py-[2px] rounded font-black border leading-none ${
                                    importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.notesChanged
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-100"
                                  }`}
                                  title={importMode === "smart_update" && changeMeta?.isExisting && changeMeta?.notesChanged ? `${t("digitalplanning.planning_import.was", "Was")}: ${changeMeta.oldNotes || "-"}` : undefined}
                                >
                                  {order.notes}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-black">-</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                <span className="text-sm font-black text-blue-600">{Number(order.totalPlannedHours).toFixed(1)}h</span>
                            </td>
                            <td className="px-3 py-1.5 text-right pr-4">
                              <label className={`inline-flex items-center gap-2 select-none ${isSmartUnchangedExisting ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.has(order.id)}
                                  disabled={isSmartUnchangedExisting}
                                  onChange={() => {
                                    if (isSmartUnchangedExisting) return;
                                    toggleOrderSelection(order.id);
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                {isExisting ? (
                                  importMode === "smart_update" && changeMeta?.hasSmartChange
                                    ? <span className="text-emerald-600 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.sync_label", "Sync")}</span>
                                    : importMode === "smart_update"
                                    ? <span className="text-slate-400 font-black uppercase text-[10px]">-</span>
                                    : <span className="text-amber-500 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.update_label", "Update")}</span>
                                ) : (
                                  <span className="text-blue-500 font-black uppercase text-[10px]">{t("digitalplanning.planning_import.new_label", "Nieuw")}</span>
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
          {importing && (
            <div className="absolute left-10 right-10 -mt-20">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest text-slate-600 mb-2">
                  <span>{importProgressLabel || t("digitalplanning.planning_import.progress_busy", "Importeren...")}</span>
                  <span className="flex items-center gap-3">
                    {importEtaLabel ? <span className="text-slate-500">{importEtaLabel}</span> : null}
                    <span>{importProgressPct}%</span>
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${importProgressPct}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 bg-white p-1.5 rounded-3xl border border-slate-200">
             <button onClick={() => setImportMode("new_only")} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "new_only" ? "bg-blue-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>{t("digitalplanning.planning_import.only_new", "Alleen Nieuwe")}</button>
             <button onClick={() => setImportMode("smart_update")} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "smart_update" ? "bg-emerald-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>{t("digitalplanning.planning_import.smart_update", "Slimme Sync")}</button>
             <button onClick={() => setImportMode("overwrite")} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${importMode === "overwrite" ? "bg-orange-600 text-white shadow-xl" : "text-slate-400 hover:bg-slate-50"}`}>{t("digitalplanning.planning_import.overwrite_all", "Overschrijf Alles")}</button>
          </div>
          <div className="flex gap-5">
            <button onClick={onClose} disabled={importing} className="px-10 py-4 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed">{t("digitalplanning.planning_import.cancel", "Annuleren")}</button>
            <button onClick={startImport} disabled={importableCount === 0 || importing} className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-4 disabled:opacity-50 disabled:bg-slate-300">
              {importing ? <Loader2 className="animate-spin" size={24} /> : <ShieldCheck size={24} />}
              {importing
                ? t("digitalplanning.planning_import.importing_with_progress", { progress: importProgressPct, defaultValue: "Importeren... {{progress}}%" })
                : t("digitalplanning.planning_import.import_orders", { count: importableCount, defaultValue: "Importeer {{count}} Orders" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanningImportModal;
