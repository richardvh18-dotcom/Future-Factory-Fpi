import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
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
  Clipboard,
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
  subWeeks,
  isValid,
  parseISO,
  parse,
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
  const [selectedForPlanningMap, setSelectedForPlanningMap] = useState({});
  const [weekSelectionMax, setWeekSelectionMax] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const fileInputRef = useRef(null);
  const pasteTextAreaRef = useRef(null);
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

  const normalizeMachine = (val) => {
    if (!val) return "-";
    let str = String(val).toUpperCase().trim();
    if (str === "BM18") str = "BH18";
    return str.startsWith("40") ? str.substring(2) : str;
  };

  const extractMachineHint = (...values) => {
    const machinePattern = /(?:^|[^A-Z0-9])((?:40)?[A-Z]{2}\d{2})(?=$|[^A-Z0-9])/i;

    for (const value of values.flat(Infinity)) {
      const text = String(value || "").trim().toUpperCase();
      if (!text) continue;

      const match = text.match(machinePattern);
      if (match?.[1]) {
        return match[1].toUpperCase();
      }
    }

    return "";
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

    return {
      delivery: dateObj,
      planned: subWeeks(dateObj, 2),
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

  const parseWorkbookOnMainThread = (arrayBuffer) => {
    const wbMeta = XLSX.read(arrayBuffer, { type: "array", bookSheets: true });
    const sheetNames = wbMeta.SheetNames || [];

    const ALLOWED_SHEETS = [
      "Fabrieksplanning",
      "Mazakplanning",
      "40BM01",
      "Format fabriek",
      "Format mazak",
      "Format 40BM01",
    ];
    const isAllowed = (name) =>
      ALLOWED_SHEETS.some((a) => String(name || "").trim().toLowerCase() === a.toLowerCase());

    let allData = [];
    let sheetsFound = 0;

    for (const sheetName of sheetNames) {
      if (!isAllowed(sheetName)) continue;

      const wbMetaSingle = XLSX.read(arrayBuffer, {
        type: "array",
        sheets: sheetName,
        sheetRows: 6,
      });
      const wsMetaSingle = wbMetaSingle.Sheets[sheetName];
      const filterMachineRaw = wsMetaSingle?.E6?.v;
      const filterMachine = filterMachineRaw ? String(filterMachineRaw).trim() : "";
      const sourceSheetLabel =
        sheetName.toLowerCase().includes("format") && filterMachine
          ? `${sheetName} (${filterMachine})`
          : sheetName;

      const wbScan = XLSX.read(arrayBuffer, {
        type: "array",
        sheets: sheetName,
        sheetRows: 15,
      });
      const wsScan = wbScan.Sheets[sheetName];
      if (!wsScan) continue;

      const scanRows = XLSX.utils.sheet_to_json(wsScan, { header: 1, defval: "" });
      const headerIndex = scanRows.findIndex((row) => {
        const rowStr = row.map((c) => normalizeHeader(c));
        return rowStr.includes("machine") && rowStr.includes("order");
      });
      if (headerIndex === -1) continue;

      sheetsFound++;
      const wbFull = XLSX.read(arrayBuffer, {
        type: "array",
        cellDates: true,
        dense: true,
        sheets: sheetName,
      });
      const ws = wbFull.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      const headers = (rawRows[headerIndex] || []).map((h) => String(h || "").trim());
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
          if (PIPE_MACHINES.includes(machine)) quantity = quantity / 10;

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

  const normalizeStatus = (status) => String(status || "").toLowerCase().trim();

  const isRunningStatus = (status) => {
    const s = normalizeStatus(status);
    return [
      "in_progress",
      "in production",
      "active",
      "post_processing",
      "to_unload",
      "unloading",
      "to_inspect",
      "held_qc",
      "on_hold",
      "delegated",
    ].includes(s);
  };

  const createSelectionMap = (rows) => {
    const map = {};
    rows.forEach((row) => {
      const keepVisible = row.existingPlanningHidden ? isRunningStatus(row.existingStatus) : true;
      map[row.id] = keepVisible;
    });
    return map;
  };

  const mapExistingFlags = async (rows, target) => {
    if (!rows.length) return rows;

    const targetPath = target === "temp_labels" ? PATHS.TEMP_PLANNING : PATHS.PLANNING;
    const ids = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));
    const existingById = new Map();
    const chunkSize = 30;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const existingSnap = await getDocs(
        query(collection(db, ...targetPath), where(documentId(), "in", slice))
      );
      existingSnap.docs.forEach((d) => {
        existingById.set(d.id, d.data() || {});
      });
    }

    return rows.map((item) => {
      const existingDoc = existingById.get(item.id) || null;
      return {
        ...item,
        isExisting: Boolean(existingDoc),
        existingStatus: existingDoc?.status || null,
        existingPlanningHidden: Boolean(existingDoc?.planningHidden),
      };
    });
  };

  const parseWorkbookInWorker = async (arrayBuffer) => {
    const worker = new globalThis.Worker(
      new URL("../../../workers/planningImportWorker.js", import.meta.url),
      { type: "module" }
    );

    try {
      const allRows = [];
      
      const parsedRows = await new Promise((resolve, reject) => {
        // Set a timeout of 60 seconds for worker completion
        const timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Worker timeout: parsing took too long (>60s)"));
        }, 60000);

        worker.onmessage = (event) => {
          try {
            const { type, payload, error, isChunk, totalRows } = event.data || {};
            
            if (type === "success") {
              if (isChunk) {
                // Accumulate chunks
                allRows.push(...payload);
                if (allRows.length >= totalRows) {
                  clearTimeout(timeoutId);
                  resolve(allRows);
                }
              } else {
                // Single payload
                clearTimeout(timeoutId);
                resolve(payload || []);
              }
            } else if (type === "error") {
              clearTimeout(timeoutId);
              reject(new Error(error || "Onbekende parse fout"));
            }
          } catch (err) {
            clearTimeout(timeoutId);
            reject(err);
          }
        };
        
        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          const msg = [
            err?.message,
            err?.filename ? `file: ${err.filename}` : null,
            err?.lineno ? `line: ${err.lineno}` : null,
            err?.colno ? `col: ${err.colno}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          reject(new Error(msg || "Worker load/runtime error"));
        };
        
        try {
          // Keep the original buffer intact for main-thread fallback.
          const workerBuffer = arrayBuffer.slice(0);
          worker.postMessage({ arrayBuffer: workerBuffer }, [workerBuffer]);
        } catch (postErr) {
          clearTimeout(timeoutId);
          reject(new Error("Failed to send file to worker: " + postErr.message));
        }
      });

      return parsedRows.map((row) => ({
        ...row,
        deliveryDate: row.deliveryDate ? new Date(row.deliveryDate) : null,
        plannedDate: row.plannedDate ? new Date(row.plannedDate) : null,
      }));
    } catch (err) {
      // Production fallback: sommige browsers/omgevingen laden module workers onbetrouwbaar.
      console.warn("[ImportModal] Worker failed, fallback to main-thread parser:", err);
      const parsedRows = parseWorkbookOnMainThread(arrayBuffer);
      return parsedRows.map((row) => ({
        ...row,
        deliveryDate: row.deliveryDate ? new Date(row.deliveryDate) : null,
        plannedDate: row.plannedDate ? new Date(row.plannedDate) : null,
      }));
    } finally {
      worker.terminate();
    }
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
          // Escaped quote inside quoted field
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
        // Keep multiline PO-text in one field without breaking row parsing
        cell += " ";
        continue;
      }

      cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      rows.push(row);
    }

    return rows
      .map((r) => {
        const cells = [...r];
        while (cells.length > 0 && !String(cells[cells.length - 1] || "").trim()) {
          cells.pop();
        }
        return cells;
      })
      .filter((r) => r.some((c) => String(c || "").trim() !== ""));
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
      setSelectedForPlanningMap(createSelectionMap(withExistingFlags));
      const weekNumbers = withExistingFlags
        .map((r) => Number(r.weekNumber))
        .filter((w) => Number.isFinite(w));
      const minWeek = weekNumbers.length ? Math.min(...weekNumbers) : null;
      setWeekSelectionMax(minWeek);
      setMachineFilter("All");
      setSelectedSheet("All");
    } catch (err) {
      console.error("[ImportModal] Error:", err);
      const errorMsg = err?.message || "Fout bij het verwerken van het bestand.";
      alert(`Fout bij importeren: ${errorMsg}`);
    } finally {
      setLoading(false);
      setLoadingMessage("");
      // Reset file input so user can try again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePaste = async () => {
    const pasteText = pasteTextAreaRef.current?.value || "";
    if (!pasteText.trim()) {
      alert("Plak Excel-gegevens in het tekstveld (kopieer rijen uit Excel en plak hier).");
      return;
    }

    setLoading(true);
    setLoadingMessage("Geplakte data verwerken...");

    try {
      // Parse tab-separated data, inclusief quoted multiline velden (PO Text)
      let rows = parsePastedTabularData(pasteText.trim());

      let machineHintFromFlattened = extractMachineHint(pasteText);

      // Fallback: soms komt een complete Excel-selectie als (bijna) 1 lange regel binnen.
      // In dat geval reconstrueren we rijen op basis van de bekende format-header.
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
          if (machineCell) {
            machineHintFromFlattened = machineCell;
          }

          const headerLen = 11; // datum, week, order, ... , finish
          const header = allCells.slice(headerStart, headerStart + headerLen);
          const dataCells = allCells.slice(headerStart + headerLen);
          const rebuilt = [header];

          for (let i = 0; i < dataCells.length; i += headerLen) {
            const chunk = dataCells.slice(i, i + headerLen);
            if (!chunk.length) continue;
            while (chunk.length < headerLen) chunk.push("");

            const hasAnyValue = chunk.some((v) => String(v || "").trim() !== "");
            if (hasAnyValue) rebuilt.push(chunk);
          }

          if (rebuilt.length > 1) {
            rows = rebuilt;
            console.log("[Paste] Rebuilt rows from flattened input:", rows.length);
          }
        }
      }

      console.log("[Paste] Parsed rows:", rows.length);
      console.log("[Paste] Row 0 (raw):", rows[0]?.slice(0, 12));
      console.log("[Paste] Row 1 (raw):", rows[1]?.slice(0, 12));

      if (rows.length < 2) {
        alert("Onvoldoende gegevens. Zorg dat je minstens headers + 1 rij data plakt.");
        return;
      }

      // Zoek de eerste rij die daadwerkelijk de headers bevat.
      // Fallback: sommige gefilterde format-tabs hebben geen "Machine" kolom in de header.
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
        const firstPreview = rows[0]?.slice(0, 12).join(", ") || "(geen data)";
        alert(
          "Fout: kolommen 'Machine' en 'order' niet gevonden in geplakte data.\n\n" +
            "Controleer dat je inclusief headerrij kopieert uit Excel.\n\n" +
            `Eerste rij voorbeeld: ${firstPreview}`
        );
        return;
      }

      const normalizedRows = rows.slice(headerIndex);
      const headerRow = normalizedRows[0] || [];
      const hasOrderCol = headerRow.some((h) => String(h).toLowerCase().includes("order"));
      let hasMachineCol = headerRow.some((h) => String(h).toLowerCase().includes("machine"));

      // Probeer machinecontext uit rijen boven de header te halen (bv. "40BH18" in eerste regel).
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

      if (!machineFromContext) {
        machineFromContext = extractMachineHint(rows);
      }

      let preparedRows = normalizedRows;
      if (!hasMachineCol && machineFromContext) {
        preparedRows = normalizedRows.map((row, idx) => {
          if (idx === 0) {
            return ["Machine", ...row];
          }

          const hasAnyValue = row.some((cell) => String(cell || "").trim() !== "");
          if (!hasAnyValue) {
            return ["", ...row];
          }

          return [machineFromContext, ...row];
        });
        hasMachineCol = true;
      }

      // Sommige gefilterde Excel-weergaven laten datum/week leeg op vervolgregels.
      // Vul deze waarden aan uit de vorige rij om dataverlies bij import te voorkomen.
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
            if (dateVal) {
              lastDate = dateVal;
            } else if (lastDate && String(next[idxOrder] || "").trim()) {
              next[idxDate] = lastDate;
            }
          }

          if (idxWeek !== -1) {
            const weekVal = String(next[idxWeek] || "").trim();
            if (weekVal) {
              lastWeek = weekVal;
            } else if (lastWeek && String(next[idxOrder] || "").trim()) {
              next[idxWeek] = lastWeek;
            }
          }

          return next;
        });
      }

      if (!hasOrderCol || !hasMachineCol) {
        console.error("[Paste] Missing columns. Headers:", headerRow);
        alert(
          "Fout: Kolommen 'Machine' en/of 'order' niet gevonden in headers.\n\n" +
          "Gevonden headers: " + headerRow.slice(0, 10).join(", ") + "\n\n" +
          (machineFromContext
            ? `Machine uit context gevonden: ${machineFromContext}, maar header kon niet worden hersteld.\n\n`
            : "") +
          "Zorg dat je alle kolommen kopieert uit Excel, inclusief headers."
        );
        return;
      }

      // Create a new workbook from the cleaned pasted data.
      // Gebruik expliciet een toegestane sheetnaam uit de worker-filter.
      const ws = XLSX.utils.aoa_to_sheet(preparedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "40BM01");

      // Convert to ArrayBuffer
      const arrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

      // Process through the same worker pipeline
      const parsedRows = await parseWorkbookInWorker(arrayBuffer);

      if (!parsedRows.length) {
        alert(
          "Geen geldige data gevonden in geplakte content. Zorg dat kolommen 'Machine' en 'order' aanwezig zijn."
        );
        return;
      }

      setLoadingMessage("Bestaande orders controleren...");
      const withExistingFlags = await mapExistingFlags(parsedRows, importTarget);

      setFileData(withExistingFlags);
      setSelectedForPlanningMap(createSelectionMap(withExistingFlags));
      const weekNumbers = withExistingFlags
        .map((r) => Number(r.weekNumber))
        .filter((w) => Number.isFinite(w));
      const minWeek = weekNumbers.length ? Math.min(...weekNumbers) : null;
      setWeekSelectionMax(minWeek);
      setMachineFilter("All");
      setSelectedSheet("All");
      setPasteMode(false);
      if (pasteTextAreaRef.current) pasteTextAreaRef.current.value = "";
    } catch (err) {
      console.error("[ImportModal] Paste error:", err);
      const errorMsg = err?.message || "Fout bij het verwerken van geplakte data.";
      alert(`Fout bij importeren: ${errorMsg}`);
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

  const uniqueWeeks = useMemo(() => {
    const weeks = Array.from(
      new Set(
        fileData
          .map((item) => Number(item.weekNumber))
          .filter((w) => Number.isFinite(w))
      )
    ).sort((a, b) => a - b);
    return weeks;
  }, [fileData]);

  const visibleSelectedCount = useMemo(
    () => filteredData.filter((row) => selectedForPlanningMap[row.id] !== false).length,
    [filteredData, selectedForPlanningMap]
  );

  const hiddenSelectedCount = useMemo(
    () => filteredData.filter((row) => selectedForPlanningMap[row.id] === false).length,
    [filteredData, selectedForPlanningMap]
  );

  const toggleRowSelection = (id) => {
    setSelectedForPlanningMap((prev) => ({
      ...prev,
      [id]: prev[id] === false,
    }));
  };

  const setAllSelection = (value) => {
    setSelectedForPlanningMap((prev) => {
      const next = { ...prev };
      filteredData.forEach((row) => {
        next[row.id] = value;
      });
      return next;
    });
  };

  const applyWeekSelection = () => {
    if (!Number.isFinite(Number(weekSelectionMax))) return;

    const maxWeek = Number(weekSelectionMax);
    setSelectedForPlanningMap((prev) => {
      const next = { ...prev };
      fileData.forEach((row) => {
        const rowWeek = Number(row.weekNumber);
        const withinWeekWindow = Number.isFinite(rowWeek) && rowWeek <= maxWeek;
        const keepVisible = withinWeekWindow || isRunningStatus(row.existingStatus);
        next[row.id] = keepVisible;
      });
      return next;
    });
  };

  const startImport = async () => {
    if (fileData.length === 0 || importing) return;
    setImporting(true);

    const dataToProcess =
      importTarget === "temp_labels" ? fileData : filteredData;

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
          const showInPlanning = selectedForPlanningMap[item.id] !== false;
          const dbData = Object.fromEntries(
            Object.entries(item).filter(
              ([key]) => !["isExisting", "existingStatus", "existingPlanningHidden"].includes(key)
            )
          );
          const targetPath =
            importTarget === "temp_labels" ? PATHS.TEMP_PLANNING : PATHS.PLANNING;
          const docRef = doc(db, ...targetPath, item.id);
          batch.set(
            docRef,
            {
              ...dbData,
              importTarget,
              planningHidden: importTarget === "planning" ? !showInPlanning : false,
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
            <div className="space-y-6">
              {/* Mode Toggle */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setPasteMode(false)}
                  className={`px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 transition-all border-2 ${
                    !pasteMode
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <Upload size={16} />
                  Bestand Selecteren
                </button>
                <button
                  onClick={() => setPasteMode(true)}
                  className={`px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 transition-all border-2 ${
                    pasteMode
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <Clipboard size={16} />
                  Plak Excel Data
                </button>
              </div>

              {/* File Upload Area */}
              {!pasteMode && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-slate-100 rounded-[40px] p-16 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".csv, .xlsx, .xls, .xlsm"
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
              )}

              {/* Paste Area */}
              {pasteMode && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[30px] p-6">
                    <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">
                      📋 Hoe te gebruiken:
                    </p>
                    <ol className="text-sm text-emerald-900 space-y-1 ml-4">
                      <li>1. Open Excel en selecteer alle rijen (headers + data)</li>
                      <li>2. Kopieer met Ctrl+C (Windows) of Cmd+C (Mac)</li>
                      <li>3. Plak hieronder in het tekstveld</li>
                      <li>4. Klik "Verwerk Geplakte Data"</li>
                    </ol>
                  </div>

                  <textarea
                    ref={pasteTextAreaRef}
                    placeholder="Plak hier de Excel-gegevens (tab-separated)..."
                    className="w-full h-64 p-4 border-2 border-slate-200 rounded-[20px] font-mono text-sm resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />

                  {loading ? (
                    <div className="w-full py-3 px-6 bg-slate-200 text-slate-600 rounded-[20px] font-black uppercase text-center flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {loadingMessage || "Bezig met verwerken..."}
                    </div>
                  ) : (
                    <button
                      onClick={handlePaste}
                      className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                    >
                      <Clipboard size={16} />
                      Verwerk Geplakte Data
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">
                    Zichtbaar in Planning
                  </span>
                  <span className="text-3xl font-black text-emerald-600 italic">
                    {visibleSelectedCount}
                  </span>
                </div>
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-center">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">
                    Verborgen (wel opgeslagen)
                  </span>
                  <span className="text-3xl font-black text-blue-600 italic">
                    {hiddenSelectedCount}
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

              {importTarget === "planning" && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                    Selectie voor lopende planning (2 manieren)
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-amber-900">Week t/m</span>
                    <select
                      value={weekSelectionMax ?? ""}
                      onChange={(e) => setWeekSelectionMax(Number(e.target.value))}
                      className="bg-white border border-amber-200 rounded-lg px-2 py-1 text-[11px] font-black text-amber-900"
                    >
                      {uniqueWeeks.map((week) => (
                        <option key={week} value={week}>
                          Week {week}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={applyWeekSelection}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                    >
                      Selecteer t/m week + lopende orders
                    </button>
                    <button
                      onClick={() => setAllSelection(true)}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                    >
                      Alles zichtbaar
                    </button>
                    <button
                      onClick={() => setAllSelection(false)}
                      className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                    >
                      Alles verborgen
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-900 mt-2 font-medium">
                    Niet-geselecteerde orders worden wel geimporteerd, maar als verborgen opgeslagen. Zo hoef je bij volgende imports oude orders niet opnieuw uit te sluiten.
                  </p>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-[30px] overflow-hidden shadow-sm">
                <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between items-center font-black uppercase text-[10px] text-slate-500 tracking-widest">
                  <div className="flex items-center gap-4">
                    <span>Preview & Urgentie Controle</span>
                    {uniqueSheets.length > 1 && (
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
                    {uniqueMachines.length > 1 && (
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
                        <th className="px-6 py-4">In Planning</th>
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
                          key={row.id || idx}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedForPlanningMap[row.id] !== false}
                              onChange={() => toggleRowSelection(row.id)}
                              className="h-4 w-4 accent-blue-600 cursor-pointer"
                            />
                          </td>
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
            onClick={() => {
              setFileData([]);
              setSelectedForPlanningMap({});
              setWeekSelectionMax(null);
            }}
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
