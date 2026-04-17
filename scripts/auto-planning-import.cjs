#!/usr/bin/env node

/**
 * Auto Planning Import watcher
 *
 * Doel:
 * - Monitor een directory op nieuwe/gewijzigde Excel bestanden
 * - Importeer automatisch naar planning + efficiency collecties
 *
 * Vereist:
 * - GOOGLE_APPLICATION_CREDENTIALS voor firebase-admin
 * - GOOGLE_CLOUD_PROJECT (optioneel, default future-factory-377ef)
 *
 * Gebruik:
 * - Eenmalige scan: node scripts/auto-planning-import.cjs --dir ./imports/planning
 * - Watch mode:     node scripts/auto-planning-import.cjs --watch --dir ./imports/planning
 * - Overschrijven:  node scripts/auto-planning-import.cjs --watch --overwrite
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const admin = require("firebase-admin");

const DEFAULT_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  "future-factory-377ef";

const BASE = "future-factory";
const PLANNING_COLLECTION = `${BASE}/production/digital_planning`;
const EFFICIENCY_COLLECTION = `${BASE}/production/efficiency_hours`;

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const readArg = (name, fallback) => {
  const idx = args.findIndex((a) => a === name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
};

const WATCH_MODE = hasFlag("--watch");
const OVERWRITE = hasFlag("--overwrite");
const SMART_UPDATE = !OVERWRITE && hasFlag("--smart-update");
const WATCH_DIR = path.resolve(process.cwd(), readArg("--dir", "./imports/planning"));
const POLL_INTERVAL_MS = Number(readArg("--interval", "4000")) || 4000;
const STATE_FILE = path.resolve(process.cwd(), ".auto-planning-import-state.json");

// Velden die LN beheert en veilig bijgewerkt mogen worden op bestaande orders.
const LN_UPDATABLE_FIELDS = [
  "quantity", "toDoQty", "plan", "notes", "deliveryDate", "plannedDeliveryDate",
  "weekNumber", "orderStatus", "totalPlannedHours", "totalActualHours",
  "itemDescription", "item", "itemCode", "extraCode", "drawing",
  "project", "projectDesc", "orderCreationDate", "machine", "sourceType",
  "operations",
];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: DEFAULT_PROJECT_ID,
  });
}

const db = admin.firestore();

const clean = (val) => String(val || "").trim();

const parseNum = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  const s = String(val).replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const normalizeMachine = (val) => {
  let str = clean(val).toUpperCase();
  if (str === "BM18") str = "BH18";
  if (str === "40BM18") str = "40BH18";
  return str || "-";
};

const isStatusAllowed = (status) => {
  const s = clean(status).toLowerCase();
  if (s.includes("production completed") || s.includes("completed")) return false;
  const allowed = ["released", "planned", "active", "created", "vrijgegeven", "aangemaakt", "actief"];
  return allowed.some((keyword) => s.includes(keyword));
};

const classifyByWc = (wc) => {
  const upper = String(wc || "").toUpperCase();
  if (upper.includes("BM01") || upper.includes("BA01")) return "qc";
  if (upper.includes("NABEWERK") || upper.includes("NABEW")) return "post";
  return null;
};

const classifyReferenceOperation = (refOp, wc) => {
  const wcBucket = classifyByWc(wc);
  if (wcBucket) return wcBucket;
  const digits = Number.parseInt(String(refOp || "").replace(/\D/g, ""), 10);
  if (Number.isNaN(digits)) return "production";
  const opCode = digits % 100;
  if (opCode === 60) return "qc";
  if (opCode === 30) return "post";
  return "production";
};

const getSplitPlannedHours = (operations, fallbackTotalHours = 0) => {
  const split = { productionHours: 0, postHours: 0, qcHours: 0 };
  const entries = Object.entries(operations || {});

  if (!entries.length) {
    split.productionHours = parseNum(fallbackTotalHours);
    return split;
  }

  entries.forEach(([refOp, values]) => {
    const planned = parseNum(values?.planned);
    const bucket = classifyReferenceOperation(refOp, values?.wc);
    if (bucket === "qc") split.qcHours += planned;
    else if (bucket === "post") split.postHours += planned;
    else split.productionHours += planned;
  });

  if (split.productionHours === 0 && split.postHours === 0 && split.qcHours === 0) {
    split.productionHours = parseNum(fallbackTotalHours);
  }

  return split;
};

const buildReferenceOperationSummary = (operations = {}) => {
  const byCode = {};
  Object.entries(operations).forEach(([refOp, values]) => {
    const planned = parseNum(values?.planned);
    const actual = parseNum(values?.actual);
    const wc = normalizeMachine(values?.wc || "");
    byCode[refOp] = {
      plannedHours: planned,
      actualHours: actual,
      workCenter: wc,
      bucket: classifyReferenceOperation(refOp, wc),
    };
  });
  return byCode;
};

const findColumnIndex = (headers, names) =>
  headers.findIndex((h) => names.some((n) => h.includes(n)));

const processRawLNDump = (rawRows) => {
  const headerIdx = rawRows.findIndex((row) =>
    row.some((cell) => clean(cell).toLowerCase() === "production order")
  );

  if (headerIdx === -1) {
    throw new Error("Kolom 'Production Order' niet gevonden in Excel bestand");
  }

  const headers = rawRows[headerIdx].map((h) => clean(h).toLowerCase());
  const dataRows = rawRows.slice(headerIdx + 1);

  const idx = {
    order: findColumnIndex(headers, ["production order"]),
    delivery: findColumnIndex(headers, ["planned delivery date"]),
    machine: findColumnIndex(headers, ["work center"]),
    status: findColumnIndex(headers, ["order status"]),
    item: findColumnIndex(headers, ["item", "artikel"]),
    desc: findColumnIndex(headers, ["item description", "omschrijving"]),
    project: findColumnIndex(headers, ["project"]),
    projectDesc: findColumnIndex(headers, ["project description", "project desc"]),
    qty: findColumnIndex(headers, ["quantity ordered", "aantal"]),
    plannedHours: findColumnIndex(headers, ["production time", "labor hours"]),
    actualHours: findColumnIndex(headers, ["spent production time"]),
    refOp: findColumnIndex(headers, ["reference operation"]),
    drawing: findColumnIndex(headers, ["drawing number", "tekening"]),
    notes: findColumnIndex(headers, ["production order text", "po text", "po-text", "po note", "opmerking"]),
    special: findColumnIndex(headers, ["special instructions", "special instruction", "extra code", "extra-code"]),
    todo: findColumnIndex(headers, ["to do qty"]),
    creation: findColumnIndex(headers, ["order creation date"]),
  };

  const orderMap = new Map();

  dataRows.forEach((row) => {
    const orderId = clean(row[idx.order]);
    if (!orderId || orderId === "0") return;

    const refOp = clean(row[idx.refOp]);
    const pTime = parseNum(row[idx.plannedHours]);
    const aTime = parseNum(row[idx.actualHours]);
    const rawStatus = clean(row[idx.status]);
    const rowMachine = normalizeMachine(row[idx.machine]);
    const rowStatusAllowed = isStatusAllowed(rawStatus);

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        id: orderId,
        orderId,
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
        orderCreationDate: clean(row[idx.creation]),
        orderStatus: rawStatus,
        drawing: clean(row[idx.drawing]),
        isValidForImport: rowStatusAllowed,
        status: "waiting",
        plan: parseNum(row[idx.todo]) || parseNum(row[idx.qty]) || 0,
        totalPlannedHours: 0,
        totalActualHours: 0,
        operations: {},
        sourceType: "LN Consolidated Auto",
      });
    }

    const order = orderMap.get(orderId);

    if ((order.machine === "-" || !order.machine) && rowMachine !== "-") order.machine = rowMachine;
    if (!rowStatusAllowed) order.isValidForImport = false;
    if (!order.orderStatus && rawStatus) order.orderStatus = rawStatus;
    if (!order.orderCreationDate) order.orderCreationDate = clean(row[idx.creation]);
    if ((!order.extraCode || order.extraCode === "-") && clean(row[idx.special])) order.extraCode = clean(row[idx.special]);
    if (!order.notes) order.notes = clean(row[idx.notes]);
    if (!order.project) order.project = clean(row[idx.project]);
    if (!order.projectDesc) order.projectDesc = clean(row[idx.projectDesc]);
    if (!order.drawing) order.drawing = clean(row[idx.drawing]);

    order.totalPlannedHours += pTime;
    order.totalActualHours += aTime;

    if (refOp) {
      order.operations[refOp] = {
        planned: (order.operations[refOp]?.planned || 0) + pTime,
        actual: (order.operations[refOp]?.actual || 0) + aTime,
        wc: order.operations[refOp]?.wc || normalizeMachine(row[idx.machine] || ""),
      };
    }
  });

  return Array.from(orderMap.values()).map((order) => {
    let deliveryDate = order.plannedDeliveryDate || null;
    let weekNumber = order.weekNumber || null;

    if (deliveryDate) {
      const d = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
      if (!Number.isNaN(d.getTime())) {
        deliveryDate = d.toISOString();
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        weekNumber = week;
      } else {
        deliveryDate = null;
      }
    }

    return {
      ...order,
      deliveryDate,
      weekNumber,
    };
  });
};

const pickBestSheetName = (sheetNames = []) => {
  if (!sheetNames.length) return null;
  const preferred = sheetNames.find((n) => {
    const lower = String(n || "").toLowerCase();
    return lower.includes("data") || lower.includes("format") || lower === "40bm01";
  });
  return preferred || sheetNames[0];
};

const parseOrdersFromWorkbook = (filePath) => {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = pickBestSheetName(wb.SheetNames);
  if (!sheetName) throw new Error("Geen sheet gevonden in workbook");
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return processRawLNDump(rawRows).filter((order) => order.isValidForImport);
};

const getState = () => {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { files: {} };
  }
};

const saveState = (state) => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
};

const listCandidateFiles = () => {
  if (!fs.existsSync(WATCH_DIR)) return [];
  return fs
    .readdirSync(WATCH_DIR)
    .map((name) => path.join(WATCH_DIR, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => /\.(xlsx|xlsm|xls)$/i.test(filePath));
};

const fetchExistingIds = async () => {
  const snap = await db.collection(PLANNING_COLLECTION).get();
  return new Set(snap.docs.map((d) => d.id));
};

const importOrders = async (orders, sourceFile) => {
  if (!orders.length) {
    console.log(`[AUTO-IMPORT] Geen geldige orders in ${path.basename(sourceFile)}`);
    return { imported: 0, skipped: 0, updated: 0 };
  }

  const existingIds = (OVERWRITE || SMART_UPDATE) ? await fetchExistingIds() : new Set();

  let toImport;
  if (OVERWRITE) {
    toImport = orders;
  } else if (SMART_UPDATE) {
    toImport = orders; // alle orders: nieuwe volledig, bestaande partieel
  } else {
    toImport = orders.filter((o) => !existingIds.has(o.id));
  }

  const skipped = OVERWRITE || SMART_UPDATE ? 0 : orders.length - toImport.length;

  if (!toImport.length) {
    console.log(`[AUTO-IMPORT] Geen nieuwe orders in ${path.basename(sourceFile)} (${skipped} overgeslagen)`);
    return { imported: 0, skipped, updated: 0 };
  }

  const CHUNK = 350;
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK);
    const batch = db.batch();

    chunk.forEach((item) => {
      const normalizedItem = item.item || item.itemDescription || "";
      const normalizedItemDescription = item.itemDescription || item.item || "";

      const { productionHours, postHours, qcHours } = getSplitPlannedHours(item.operations, item.totalPlannedHours || 0);
      const operationByCode = buildReferenceOperationSummary(item.operations);

      const isExistingOrder = existingIds.has(item.id);
      const isSmartUpdate = SMART_UPDATE && isExistingOrder;

      if (isSmartUpdate) {
        // Slimme Sync: alleen LN-gestuurde velden bijwerken.
        const lnPayload = {};
        LN_UPDATABLE_FIELDS.forEach((field) => {
          if (item[field] !== undefined) lnPayload[field] = item[field];
        });
        const planningPayload = {
          ...lnPayload,
          item: normalizedItem,
          itemDescription: normalizedItemDescription,
          plannedHoursBH: productionHours,
          plannedHoursNabewerken: postHours,
          plannedHoursBM01: qcHours,
          plannedMinutesBH: productionHours * 60,
          plannedMinutesNabewerken: postHours * 60,
          plannedMinutesBM01: qcHours * 60,
          referenceOperationTimes: operationByCode,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        delete planningPayload.isValidForImport;
        batch.set(db.collection(PLANNING_COLLECTION).doc(item.id), planningPayload, { merge: true });
        updated++;
      } else {
        const planningPayload = {
          ...item,
          item: normalizedItem,
          itemDescription: normalizedItemDescription,
          plannedHoursBH: productionHours,
          plannedHoursNabewerken: postHours,
          plannedHoursBM01: qcHours,
          plannedMinutesBH: productionHours * 60,
          plannedMinutesNabewerken: postHours * 60,
          plannedMinutesBM01: qcHours * 60,
          referenceOperationTimes: operationByCode,
          planningHidden: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        delete planningPayload.isValidForImport;
        batch.set(db.collection(PLANNING_COLLECTION).doc(item.id), planningPayload, { merge: true });
        imported++;
      }

      const productionMinutes = productionHours * 60;
      const postProcessingMinutes = postHours * 60;
      const qcMinutes = qcHours * 60;
      const standardMinutes = productionMinutes + postProcessingMinutes;
      const actualMinutes = (item.totalActualHours || 0) * 60;
      const qty = item.quantity || item.toDoQty || 1;

      const efficiencyPayload = {
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
        source: isSmartUpdate ? "ln_smart_sync_auto" : "ln_import_auto",
        sourceFile: path.basename(sourceFile),
        lastSync: new Date().toISOString(),
      };

      batch.set(db.collection(EFFICIENCY_COLLECTION).doc(item.id), efficiencyPayload, { merge: true });
    });

    await batch.commit();
  }

  const modeLabel = SMART_UPDATE ? `smart-sync (${imported} nieuw, ${updated} bijgewerkt)` : `${imported + updated} geimporteerd`;
  console.log(`[AUTO-IMPORT] ${path.basename(sourceFile)} -> ${modeLabel}, ${skipped} overgeslagen`);
  return { imported, skipped, updated };
};

const fileNeedsImport = (state, filePath, mtimeMs) => {
  const rec = state.files[filePath];
  if (!rec) return true;
  return mtimeMs > Number(rec.mtimeMs || 0);
};

const scanAndImport = async () => {
  const state = getState();
  const files = listCandidateFiles();
  if (!files.length) return;

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const mtimeMs = Number(stat.mtimeMs || 0);

    if (!fileNeedsImport(state, filePath, mtimeMs)) continue;

    try {
      console.log(`[AUTO-IMPORT] Verwerken: ${path.basename(filePath)}`);
      const orders = parseOrdersFromWorkbook(filePath);
      await importOrders(orders, filePath);

      state.files[filePath] = {
        mtimeMs,
        importedAt: new Date().toISOString(),
      };
      saveState(state);
    } catch (error) {
      console.error(`[AUTO-IMPORT] Fout bij ${path.basename(filePath)}:`, error.message);
    }
  }
};

const ensureWatchDir = () => {
  if (!fs.existsSync(WATCH_DIR)) fs.mkdirSync(WATCH_DIR, { recursive: true });
};

(async () => {
  ensureWatchDir();

  console.log("[AUTO-IMPORT] Start");
  console.log(`[AUTO-IMPORT] Directory: ${WATCH_DIR}`);
  console.log(`[AUTO-IMPORT] Mode: ${WATCH_MODE ? "watch" : "single-scan"}`);
  console.log(`[AUTO-IMPORT] Modus: ${OVERWRITE ? "Overschrijf alles" : SMART_UPDATE ? "Slimme Sync (LN-velden bijwerken, app-velden behouden)" : "Alleen nieuwe orders"}`);

  await scanAndImport();

  if (!WATCH_MODE) {
    console.log("[AUTO-IMPORT] Klaar (single-scan).");
    return;
  }

  console.log(`[AUTO-IMPORT] Watch actief (elke ${POLL_INTERVAL_MS}ms)`);
  setInterval(async () => {
    await scanAndImport();
  }, POLL_INTERVAL_MS);
})().catch((err) => {
  if (String(err?.message || "").includes("Could not load the default credentials")) {
    console.error("Application Default Credentials niet gevonden.");
    console.error("Voer uit: gcloud auth application-default login");
    console.error("En zet: export GOOGLE_CLOUD_PROJECT=future-factory-377ef");
    process.exit(1);
  }

  console.error("[AUTO-IMPORT] Fatal error:", err);
  process.exit(1);
});
