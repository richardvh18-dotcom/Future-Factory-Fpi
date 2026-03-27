import * as XLSX from "xlsx";
import { subWeeks, isValid, parseISO, parse } from "date-fns";

const normalizeMachine = (val) => {
  if (!val) return "-";
  let str = String(val).toUpperCase().trim();

  // Auto-correct for known typo in import files
  if (str === "BM18") str = "BH18";

  return str.startsWith("40") ? str.substring(2) : str;
};

const processDates = (rawDate) => {
  if (!rawDate) return { delivery: null, planned: null };

  const rawStr = String(rawDate || "").trim();
  const isSlashDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawStr);
  const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate);

  let dateObj = null;

  // Voorkom US-interpretatie (MM/dd): slash-datums altijd eerst als dd/MM parsen.
  if (isSlashDate) {
    const parsedNl = parse(rawStr, "dd/MM/yyyy", new Date());
    if (isValid(parsedNl)) dateObj = parsedNl;
    if (!isValid(dateObj)) {
      const parsedNlShort = parse(rawStr, "d/M/yyyy", new Date());
      if (isValid(parsedNlShort)) dateObj = parsedNlShort;
    }
  }

  if (!isValid(dateObj)) {
    const parsedIso = parseISO(rawStr);
    if (isValid(parsedIso)) dateObj = parsedIso;
  }

  if (!isValid(dateObj) && isValid(parsedDate)) {
    dateObj = parsedDate;
  }

  if (!isValid(dateObj)) return { delivery: null, planned: null };

  const plannedDate = subWeeks(dateObj, 2);

  return {
    delivery: dateObj,
    planned: plannedDate,
  };
};

const normalizeHeader = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const firstIndex = (headers, candidates) => {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const name of candidates) {
    const idx = normalizedHeaders.findIndex((h) => h === normalizeHeader(name));
    if (idx !== -1) return idx;
  }
  return -1;
};

const getSheetPriority = (sheetName) => {
  const s = String(sheetName || "").toLowerCase();
  if (s.includes("format fabriek")) return 100;
  if (s.includes("format mazak")) return 90;
  if (s.includes("format 40bm01")) return 80;
  if (s.includes("fabrieksplanning")) return 70;
  if (s.includes("mazakplanning")) return 60;
  if (s === "40bm01") return 50;
  return 10;
};

const parseWorkbook = (arrayBuffer) => {
  // Stap 1: haal alleen sheetnamen op — geen sheetdata geladen in geheugen
  const wbMeta = XLSX.read(arrayBuffer, { type: "array", bookSheets: true });
  const sheetNames = wbMeta.SheetNames;

  let allData = [];
  let sheetsFound = 0;

  // Relevante planning tabs; ondersteunt ook format-tabs uit LN exports.
  const ALLOWED_SHEETS = [
    "Fabrieksplanning",
    "Mazakplanning",
    "40BM01",
    "Format fabriek",
    "Format mazak",
    "Format 40BM01",
  ];
  const isAllowed = (name) =>
    ALLOWED_SHEETS.some((a) => name.trim().toLowerCase() === a.toLowerCase());

  for (const sheetName of sheetNames) {
    if (!isAllowed(sheetName)) continue;

    // Stap 2: scan alleen de eerste 15 rijen per sheet om de headerrij te vinden.
    const wbScan = XLSX.read(arrayBuffer, {
      type: "array",
      sheets: sheetName,
      sheetRows: 15,
    });
    const wsScan = wbScan.Sheets[sheetName];
    if (!wsScan) continue;

    const filterMachineRaw = wsScan.E6?.v;
    const filterMachine = filterMachineRaw ? String(filterMachineRaw).trim() : "";
    const sourceSheetLabel =
      sheetName.toLowerCase().includes("format") && filterMachine
        ? `${sheetName} (${filterMachine})`
        : sheetName;

    const scanRows = XLSX.utils.sheet_to_json(wsScan, { header: 1, defval: "" });
    const headerIndex = scanRows.findIndex((row) => {
      const rowStr = row.map((c) => normalizeHeader(c));
      return rowStr.includes("machine") && rowStr.includes("order");
    });

    if (headerIndex === -1) continue; // Geen planningheader → sheet overslaan

    // Stap 3: volledige inlezing voor alleen deze relevante sheet
    sheetsFound++;
    const wbFull = XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: true,
      dense: true,
      sheets: sheetName,
    });
    const ws = wbFull.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    const headers = rawRows[headerIndex].map((h) => String(h || "").trim());
    const dataRows = rawRows.slice(headerIndex + 1);

    const idxOrder = firstIndex(headers, ["order", "order id", "ordernummer"]);
    const idxMachine = firstIndex(headers, ["machine", "station"]);
    const idxItemCode = firstIndex(headers, ["manufactured item", "item code", "item"]);
    const idxDatum = firstIndex(headers, ["datum", "date", "delivery date", "leverdatum"]);
    const idxPlan = firstIndex(headers, ["plan", "qty", "quantity", "aantal"]);
    const idxWeek = firstIndex(headers, ["week", "weeknumber", "week number"]);
    const idxItemDesc = firstIndex(headers, ["item desc", "description", "omschrijving"]);
    const idxCode = firstIndex(headers, ["code", "extra code"]);
    const idxPoText = firstIndex(headers, ["po text", "po-text", "po note", "opmerking"]);
    const idxProject = firstIndex(headers, ["project"]);
    const idxProjectDesc = firstIndex(headers, ["project desc", "project description"]);
    const idxDrawing = firstIndex(headers, ["drawing", "tekening"]);

    const sheetData = dataRows
      .filter((row) => idxOrder !== -1 && idxMachine !== -1 && row[idxOrder] && row[idxMachine])
      .map((row) => {
        const orderId = String(row[idxOrder]).trim();
        const manufacturedItem = String(row[idxItemCode] || "").trim();
        const docId = `${orderId}_${manufacturedItem}`.replace(/[^a-zA-Z0-9]/g, "_");

        const rawDateVal = idxDatum !== -1 ? row[idxDatum] : null;
        const { delivery, planned } = processDates(rawDateVal);

        const rawPlan = idxPlan !== -1 ? row[idxPlan] : null;
        let quantity =
          typeof rawPlan === "string"
            ? parseFloat(rawPlan.replace(",", "."))
            : parseFloat(rawPlan);
        if (Number.isNaN(quantity)) quantity = 1;

        const machine = normalizeMachine(row[idxMachine]);
        const PIPE_MACHINES = ["BA05", "BA07", "BA08", "BA09"];
        if (PIPE_MACHINES.includes(machine)) {
          quantity = quantity / 10;
        }

        return {
          id: docId,
          orderId,
          machine,
          deliveryDate: delivery ? delivery.toISOString() : null,
          plannedDate: planned ? planned.toISOString() : null,
          weekNumber: idxWeek !== -1 ? parseInt(row[idxWeek], 10) || null : null,
          itemCode: idxItemCode !== -1 ? String(row[idxItemCode] || "") : "",
          item: idxItemDesc !== -1 ? String(row[idxItemDesc] || "") : "",
          extraCode: idxCode !== -1 ? String(row[idxCode] || "") : "",
          plan: quantity,
          notes: idxPoText !== -1 ? String(row[idxPoText] || "") : "",
          project: idxProject !== -1 ? String(row[idxProject] || "") : "",
          projectDesc: idxProjectDesc !== -1 ? String(row[idxProjectDesc] || "") : "",
          drawing: idxDrawing !== -1 ? String(row[idxDrawing] || "") : "",
          status: "pending",
          sourceSheet: sourceSheetLabel,
        };
      });

    allData = allData.concat(sheetData);
  }

  if (sheetsFound === 0) return [];

  // Dedupe met sheet-prioriteit: bij gelijke id wint de meest relevante sheet.
  const byId = new Map();
  allData.forEach((item) => {
    const existing = byId.get(item.id);
    const currentPriority = getSheetPriority(item.sourceSheet);
    if (!existing || currentPriority > existing.priority) {
      byId.set(item.id, { priority: currentPriority, item });
    }
  });

  return Array.from(byId.values()).map((entry) => entry.item);
};

const workerScope = globalThis;

workerScope.onmessage = (event) => {
  try {
    const { arrayBuffer } = event.data || {};
    if (!arrayBuffer) {
      workerScope.postMessage({ type: "error", error: "Geen bestand ontvangen" });
      return;
    }

    console.log("[Worker] Starting parse, buffer size:", arrayBuffer.byteLength);
    
    const rows = parseWorkbook(arrayBuffer);
    
    console.log("[Worker] Parse complete, rows:", rows.length);
    
    // Split payload if too large (safety measure for big files)
    // Browser postMessage has limits on serializable data
    const chunkSize = 5000;
    if (rows.length > chunkSize) {
      console.log("[Worker] Large payload detected, chunking...");
      let sent = 0;
      while (sent < rows.length) {
        const chunk = rows.slice(sent, sent + chunkSize);
        workerScope.postMessage({ 
          type: "success", 
          payload: chunk,
          isChunk: true,
          chunkIndex: sent / chunkSize,
          totalRows: rows.length
        });
        sent += chunkSize;
      }
    } else {
      workerScope.postMessage({ type: "success", payload: rows });
    }
  } catch (error) {
    console.error("[Worker] Error:", error);
    workerScope.postMessage({
      type: "error",
      error: error?.message || "Excel parsing mislukt",
      stack: error?.stack,
    });
  }
};
