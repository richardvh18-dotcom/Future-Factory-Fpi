// @ts-nocheck

const crypto = require('crypto');
const functions = require('firebase-functions/v1');
const XLSX = require('xlsx');
const { VertexAI } = require('@google-cloud/vertexai');
const { db, admin } = require('../config/firebase');
const { DB_BASE, DB_PATHS } = require('../config/dbPaths');

const BASE = DB_BASE;
const SYSTEM_LOGS_COLLECTION = DB_PATHS.SYSTEM_LOGS;
const INSIGHTS_COLLECTION = DB_PATHS.INSIGHTS_REPORTS;
const PRODUCTS_COLLECTION = DB_PATHS.PRODUCTION_PRODUCTS;
const TRACKED_LEGACY_COLLECTION = DB_PATHS.TRACKED_PRODUCTS;
const IMPORT_FOLDER_PREFIX = 'imports/planning/';
const IMPORT_EXTENSIONS = ['.xlsx', '.xlsm', '.xls'];

const AI_RUNTIME = { memory: '2GB', timeoutSeconds: 540 };
const VERTEX_LOCATION = process.env.VERTEX_AI_LOCATION || 'europe-west1';
const VERTEX_MODEL = process.env.INVISIBLE_WORKER_MODEL || 'gemini-2.5-flash';

const clean = (value) => String(value || '').trim();

const parseNum = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).replace(/\s+/g, '').replace(',', '.');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const lower = (value) => clean(value).toLowerCase();

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDayKey = (value) => {
  const date = value instanceof Date ? value : toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;

  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${parts.join(',')}}`;
};

const safeDocId = (value) =>
  String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 500);

const getProjectId = () => {
  const explicit = clean(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT);
  if (explicit) return explicit;

  const appProject = clean(admin.app()?.options?.projectId);
  if (appProject) return appProject;

  const firebaseConfig = clean(process.env.FIREBASE_CONFIG);
  if (firebaseConfig.startsWith('{')) {
    try {
      const parsed = JSON.parse(firebaseConfig);
      const project = clean(parsed?.projectId);
      if (project) return project;
    } catch (error) {
      console.warn('[invisible_worker] FIREBASE_CONFIG parse error:', error?.message || String(error));
    }
  }

  throw new Error('PROJECT_ID_UNAVAILABLE');
};

let vertexModel = null;

const getVertexModel = () => {
  if (vertexModel) return vertexModel;

  const project = getProjectId();
  const vertexAi = new VertexAI({ project, location: VERTEX_LOCATION });

  vertexModel = vertexAi.getGenerativeModel({
    model: VERTEX_MODEL,
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 4096,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  });

  return vertexModel;
};

const extractTextFromVertexResponse = (result) => {
  const candidates = result?.response?.candidates || [];
  const parts = candidates[0]?.content?.parts || [];
  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('EMPTY_VERTEX_RESPONSE');
  }

  return text;
};

const parseJsonFromModelText = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (_ignored) {
        return null;
      }
    }
    return null;
  }
};

const callVertexJson = async ({ instruction, payload }) => {
  const model = getVertexModel();
  const prompt = [
    'Je bent een backend AI worker voor productie-automatisering.',
    'Antwoord ALLEEN met valide JSON en zonder markdown.',
    instruction,
    'INPUT:',
    JSON.stringify(payload),
  ].join('\n\n');

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const text = extractTextFromVertexResponse(result);
  const parsed = parseJsonFromModelText(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('INVALID_JSON_FROM_VERTEX');
  }
  return parsed;
};

const writeSystemLog = async ({ level = 'INFO', source = 'invisible_worker', message = '', data = null, dedupeKey = '' }) => {
  const normalized = {
    level: clean(level).toUpperCase() || 'INFO',
    source: clean(source) || 'invisible_worker',
    message: clean(message),
    data: data || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (clean(dedupeKey)) {
    const id = safeDocId(`${normalized.source}_${dedupeKey}`);
    await db.collection(SYSTEM_LOGS_COLLECTION).doc(id).set(normalized, { merge: true });
    return;
  }

  await db.collection(SYSTEM_LOGS_COLLECTION).add(normalized);
};

const isLossenContext = (doc = {}) => {
  const status = lower(doc.status);
  const step = lower(doc.currentStep);
  const station = lower(doc.currentStation);
  return status.includes('lossen') || step.includes('lossen') || station.includes('lossen');
};

const getMeasurements = (doc = {}) => {
  if (doc?.measurements && typeof doc.measurements === 'object' && !Array.isArray(doc.measurements)) {
    return doc.measurements;
  }
  if (
    doc?.inspection?.measurements &&
    typeof doc.inspection.measurements === 'object' &&
    !Array.isArray(doc.inspection.measurements)
  ) {
    return doc.inspection.measurements;
  }
  return null;
};

const mapMeasurementSnapshot = (trackedDoc) => {
  const data = trackedDoc.data() || {};
  const measurements = getMeasurements(data);
  if (!measurements) return null;
  return {
    lotNumber: clean(data.lotNumber) || trackedDoc.id,
    machine: clean(data.currentStation || data.machine || data.originMachine),
    step: clean(data.currentStep),
    status: clean(data.status),
    measurements,
  };
};

const findCatalogRecord = async (trackedData = {}) => {
  const item = clean(trackedData.item || trackedData.itemCode);
  const description = clean(trackedData.itemDescription || trackedData.description);
  const col = db.collection(PRODUCTS_COLLECTION);

  const candidates = [];

  if (item) {
    const exactDoc = await col.doc(item).get();
    if (exactDoc.exists) candidates.push({ id: exactDoc.id, ...exactDoc.data() });

    const byItem = await col.where('item', '==', item).limit(2).get();
    byItem.docs.forEach((docSnap) => candidates.push({ id: docSnap.id, ...docSnap.data() }));
  }

  if (description) {
    const byName = await col.where('name', '==', description).limit(1).get();
    byName.docs.forEach((docSnap) => candidates.push({ id: docSnap.id, ...docSnap.data() }));
  }

  return candidates[0] || null;
};

const findHistoricalMeasurementBatches = async ({ item = '', excludePath = '', limit = 15 }) => {
  const normalizedItem = clean(item);
  if (!normalizedItem) return [];

  const rows = [];

  try {
    const scopedSnap = await db.collectionGroup('items').where('item', '==', normalizedItem).limit(limit + 5).get();
    scopedSnap.docs.forEach((docSnap) => {
      if (docSnap.ref.path === excludePath) return;
      const mapped = mapMeasurementSnapshot(docSnap);
      if (mapped) rows.push(mapped);
    });
  } catch (error) {
    console.warn('[invisible_worker] collectionGroup(items) fallback:', error?.message || String(error));
  }

  if (rows.length < limit) {
    try {
      const legacySnap = await db.collection(TRACKED_LEGACY_COLLECTION).where('item', '==', normalizedItem).limit(limit).get();
      legacySnap.docs.forEach((docSnap) => {
        if (docSnap.ref.path === excludePath) return;
        const mapped = mapMeasurementSnapshot(docSnap);
        if (mapped) rows.push(mapped);
      });
    } catch (error) {
      console.warn('[invisible_worker] legacy tracked fallback:', error?.message || String(error));
    }
  }

  return rows.slice(0, limit);
};

const buildDeterministicAnomalyFallback = ({ measurements = {}, history = [] }) => {
  const numericKeys = Object.keys(measurements).filter((key) => Number.isFinite(parseNum(measurements[key])));
  if (!numericKeys.length || history.length < 3) {
    return {
      anomalyDetected: false,
      confidence: 0.3,
      reasons: ['Onvoldoende historische data voor betrouwbare fallback-analyse.'],
      suggestions: [],
    };
  }

  const reasons = [];
  let anomalies = 0;

  numericKeys.forEach((key) => {
    const samples = history
      .map((row) => parseNum(row.measurements?.[key]))
      .filter((value) => Number.isFinite(value));

    if (samples.length < 3) return;

    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + (value - avg) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    const current = parseNum(measurements[key]);

    if (std > 0 && Math.abs(current - avg) > std * 3) {
      anomalies += 1;
      reasons.push(`${key} wijkt sterk af: ${current} vs historisch gemiddeld ${avg.toFixed(2)}.`);
    }
  });

  const anomalyDetected = anomalies > 0;
  return {
    anomalyDetected,
    confidence: anomalyDetected ? 0.66 : 0.35,
    reasons: anomalyDetected ? reasons : ['Geen sterke statistische afwijking gevonden in fallback-analyse.'],
    suggestions: anomalyDetected ? ['Controleer meetgereedschap en voer een tweede meting uit.'] : [],
  };
};

const runReactiveWatchdog = async ({ before = null, after = null, refPath = '', functionSource = '' }) => {
  if (!after) return null;
  if (!isLossenContext(after)) return null;

  const measurements = getMeasurements(after);
  if (!measurements) return null;

  const measurementHash = crypto
    .createHash('sha256')
    .update(stableStringify(measurements))
    .digest('hex');

  if (clean(after?.aiWatchdog?.lastMeasurementHash) === measurementHash) {
    return null;
  }

  const catalogRecord = await findCatalogRecord(after);
  const history = await findHistoricalMeasurementBatches({
    item: clean(after.item || after.itemCode),
    excludePath: refPath,
    limit: 20,
  });

  let analysis = null;

  try {
    analysis = await callVertexJson({
      instruction: [
        'Taak: anomaly detection op Lossen meetwaarden.',
        'Vergelijk actuele metingen met catalogusdata en historische batches.',
        'Geef output als JSON met exact deze velden:',
        '{"anomalyDetected": boolean, "confidence": number, "reasons": string[], "suggestions": string[]}',
      ].join(' '),
      payload: {
        currentLot: {
          lotNumber: clean(after.lotNumber),
          item: clean(after.item || after.itemCode),
          description: clean(after.itemDescription || after.description),
          machine: clean(after.currentStation || after.machine),
          step: clean(after.currentStep),
          status: clean(after.status),
          measurements,
        },
        productCatalog: catalogRecord,
        historicalBatches: history,
      },
    });
  } catch (error) {
    console.warn('[invisible_worker] vertex watchdog fallback:', error?.message || String(error));
    analysis = buildDeterministicAnomalyFallback({ measurements, history });
  }

  const anomalyDetected = Boolean(analysis?.anomalyDetected);
  const confidence = Number.isFinite(Number(analysis?.confidence)) ? Number(analysis.confidence) : 0;
  const reasons = Array.isArray(analysis?.reasons) ? analysis.reasons.map((entry) => clean(entry)).filter(Boolean).slice(0, 8) : [];
  const suggestions = Array.isArray(analysis?.suggestions)
    ? analysis.suggestions.map((entry) => clean(entry)).filter(Boolean).slice(0, 8)
    : [];

  const ref = db.doc(refPath);
  await ref.set(
    {
      aiWatchdog: {
        lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMeasurementHash: measurementHash,
        anomalyDetected,
        confidence,
        reasons,
        suggestions,
        model: VERTEX_MODEL,
        source: functionSource,
      },
      needs_review: anomalyDetected ? true : Boolean(after.needs_review),
    },
    { merge: true }
  );

  if (anomalyDetected) {
    await writeSystemLog({
      level: 'WARNING',
      source: functionSource,
      message: `Anomalie gedetecteerd voor lot ${clean(after.lotNumber) || clean(after.id) || 'onbekend'}.`,
      dedupeKey: `${safeDocId(refPath)}_${measurementHash}`,
      data: {
        lotNumber: clean(after.lotNumber) || null,
        item: clean(after.item || after.itemCode),
        machine: clean(after.currentStation || after.machine),
        confidence,
        reasons,
      },
    });
  }

  return null;
};

const isActivePlanningStatus = (status = '') => {
  const normalized = lower(status).replace(/[\s-]+/g, '_');
  return [
    'waiting',
    'planned',
    'released',
    'in_progress',
    'in_production',
    'active',
    'post_processing',
    'to_unload',
    'unloading',
    'to_inspect',
    'held_qc',
    'on_hold',
    'delegated',
    'te_lossen',
    'wacht_op_lossen',
  ].includes(normalized);
};

const loadPlanningOrders = async () => {
  const map = new Map();

  const addOrder = (docSnap) => {
    const data = docSnap.data() || {};
    const key = clean(data.orderId) || clean(data.id) || docSnap.id;
    if (!key || map.has(key)) return;
    map.set(key, { id: key, path: docSnap.ref.path, ...data });
  };

  try {
    const rootSnap = await db.collection(`${BASE}/production/digital_planning`).limit(2500).get();
    rootSnap.docs.forEach(addOrder);
  } catch (error) {
    console.warn('[invisible_worker] load root planning failed:', error?.message || String(error));
  }

  try {
    const scopedSnap = await db.collectionGroup('orders').limit(5000).get();
    scopedSnap.docs
      .filter((docSnap) => docSnap.ref.path.includes('/digital_planning/'))
      .forEach(addOrder);
  } catch (error) {
    console.warn('[invisible_worker] load scoped planning failed:', error?.message || String(error));
  }

  return Array.from(map.values());
};

const loadCapacityAssignments = async () => {
  const map = new Map();

  const addAssignment = (docSnap) => {
    const data = docSnap.data() || {};
    const key = `${docSnap.ref.path}`;
    if (!key || map.has(key)) return;
    map.set(key, { path: docSnap.ref.path, ...data });
  };

  try {
    const rootSnap = await db.collection(`${BASE}/production/machine_occupancy`).limit(4000).get();
    rootSnap.docs.forEach(addAssignment);
  } catch (error) {
    console.warn('[invisible_worker] load root occupancy failed:', error?.message || String(error));
  }

  try {
    const scopedSnap = await db.collectionGroup('assignments').limit(6000).get();
    scopedSnap.docs
      .filter((docSnap) => docSnap.ref.path.includes('/machine_occupancy/'))
      .forEach(addAssignment);
  } catch (error) {
    console.warn('[invisible_worker] load scoped occupancy failed:', error?.message || String(error));
  }

  return Array.from(map.values());
};

const buildBottleneckMatrix = ({ orders = [], assignments = [], horizonDays = 7 }) => {
  const demandByDayMachine = new Map();
  const capacityByDayMachine = new Map();

  const now = new Date();
  const allowedKeys = new Set();
  for (let index = 0; index < horizonDays; index += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + index);
    const key = toDayKey(day);
    if (key) allowedKeys.add(key);
  }

  orders
    .filter((order) => isActivePlanningStatus(order.status))
    .forEach((order) => {
      const dayKey = toDayKey(order.plannedDate || order.deliveryDate || order.updatedAt);
      if (!dayKey || !allowedKeys.has(dayKey)) return;

      const machine = clean(order.machine || order.workCenter || order.assignedMachine || order.originMachine || 'UNASSIGNED');
      const plannedHours =
        parseNum(order.plannedHours) ||
        parseNum(order.estimatedHours) ||
        parseNum(order.productionTime) ||
        parseNum(order.totalPlannedHours) ||
        0;

      if (plannedHours <= 0) return;
      const key = `${dayKey}__${machine}`;
      demandByDayMachine.set(key, (demandByDayMachine.get(key) || 0) + plannedHours);
    });

  assignments.forEach((entry) => {
    const dayKey = clean(entry.date) || toDayKey(entry.checkedInAt || entry.createdAt || entry.updatedAt);
    if (!dayKey || !allowedKeys.has(dayKey)) return;

    const machine = clean(entry.machineId || entry.station || entry.primaryStation || 'UNASSIGNED');
    let baseCapacity =
      parseNum(entry.hoursWorkedGross) ||
      parseNum(entry.hoursWorked) ||
      parseNum(entry.hoursPerDay);
      
    if (!baseCapacity) {
      const weekly = parseNum(entry.hoursPerWeek);
      baseCapacity = weekly > 0 ? weekly / 5 : 7; // Standaard 7 netto uren (8u - 1u pauze)
    } else if (baseCapacity === 8) {
      baseCapacity = 7; // Automatische correctie van 8 naar 7 netto uren
    }
    
    // Future Factory Efficiency Factor (85%)
    const rawCapacity = baseCapacity * 0.85;

    const key = `${dayKey}__${machine}`;
    capacityByDayMachine.set(key, (capacityByDayMachine.get(key) || 0) + rawCapacity);
  });

  const allKeys = new Set([...demandByDayMachine.keys(), ...capacityByDayMachine.keys()]);
  const rows = Array.from(allKeys)
    .map((key) => {
      const [day, machine] = key.split('__');
      const demandHours = Number((demandByDayMachine.get(key) || 0).toFixed(2));
      const capacityHours = Number((capacityByDayMachine.get(key) || 0).toFixed(2));
      const deficitHours = Number((demandHours - capacityHours).toFixed(2));
      return {
        day,
        machine,
        demandHours,
        capacityHours,
        deficitHours,
        isBottleneck: deficitHours > 0,
      };
    })
    .sort((a, b) => b.deficitHours - a.deficitHours);

  return rows;
};

const buildFallbackBottleneckInsight = (matrix = []) => {
  const bottlenecks = matrix.filter((row) => row.isBottleneck).slice(0, 10);

  const summary = bottlenecks.length
    ? `${bottlenecks.length} knelpunten voorspeld in de komende 7 dagen.`
    : 'Geen bottlenecks voorspeld in de komende 7 dagen.';

  return {
    summary,
    predictions: bottlenecks.map((row) => ({
      machine: row.machine,
      day: row.day,
      demandHours: row.demandHours,
      capacityHours: row.capacityHours,
      delayHours: row.deficitHours,
      reason: `Vraag (${row.demandHours}h) is hoger dan capaciteit (${row.capacityHours}h).`,
    })),
    recommendation: bottlenecks.length
      ? 'Herschik capaciteit op top-3 bottleneck-machines of verschuif orders.'
      : 'Geen directe actie nodig.',
  };
};

const runNightlyBottleneckPlanner = async () => {
  const orders = await loadPlanningOrders();
  const assignments = await loadCapacityAssignments();
  const matrix = buildBottleneckMatrix({ orders, assignments, horizonDays: 7 });

  let insight = null;
  try {
    insight = await callVertexJson({
      instruction: [
        'Taak: bottleneck prediction voor productieplanning.',
        'Genereer compact JSON met velden:',
        '{"summary": string, "predictions": [{"machine": string, "day": string, "demandHours": number, "capacityHours": number, "delayHours": number, "reason": string}], "recommendation": string}',
        'Gebruik alleen data uit input. Voeg geen fictieve data toe.',
      ].join(' '),
      payload: {
        horizonDays: 7,
        matrix: matrix.slice(0, 200),
      },
    });
  } catch (error) {
    console.warn('[invisible_worker] nightly planner fallback:', error?.message || String(error));
    insight = buildFallbackBottleneckInsight(matrix);
  }

  const report = {
    type: 'bottleneck_prediction',
    source: 'aiNightlyBottleneckPlanner',
    model: VERTEX_MODEL,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    horizonDays: 7,
    summary: clean(insight?.summary),
    recommendation: clean(insight?.recommendation),
    predictions: Array.isArray(insight?.predictions) ? insight.predictions.slice(0, 50) : [],
    matrixSize: matrix.length,
    bottleneckCount: matrix.filter((row) => row.isBottleneck).length,
  };

  await db.collection(INSIGHTS_COLLECTION).add(report);

  await writeSystemLog({
    level: report.bottleneckCount > 0 ? 'WARNING' : 'INFO',
    source: 'aiNightlyBottleneckPlanner',
    message: report.summary || 'Nightly bottleneck analysis uitgevoerd.',
    data: {
      bottleneckCount: report.bottleneckCount,
      matrixSize: report.matrixSize,
    },
  });

  return null;
};

const isSupportedImportFile = (name = '') => {
  const lowerName = String(name || '').toLowerCase();
  return IMPORT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

const findHeaderIndex = (rows) =>
  rows.findIndex((row) =>
    row.some((cell) => lower(cell) === 'production order')
  );

const parseImportRows = (fileBuffer) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) return { columns: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const headerIndex = findHeaderIndex(rawRows);
  if (headerIndex < 0) return { columns: [], rows: [] };

  const headers = rawRows[headerIndex].map((cell) => clean(cell));
  const records = rawRows
    .slice(headerIndex + 1)
    .filter((row) => Array.isArray(row) && row.some((cell) => clean(cell)))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = row[index] ?? '';
      });
      return record;
    });

  return { columns: headers, rows: records };
};

const clusterHeuristic = (records = []) => {
  const buckets = new Map();

  records.forEach((record) => {
    const order = clean(record['Production Order'] || record['production order']);
    if (!order) return;

    const project = lower(record['Project Description'] || record['project description'] || 'unknown');
    const delivery = clean(record['Planned Delivery Date'] || record['planned delivery date'] || 'unknown');
    const key = `${project}__${delivery}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        clusterLabel: clean(project) || 'Onbekend project',
        projectHint: clean(record['Project Description'] || record['project description']),
        deliveryDate: delivery,
        orderNumbers: [],
      });
    }

    buckets.get(key).orderNumbers.push(order);
  });

  const clusters = Array.from(buckets.values())
    .filter((entry) => entry.orderNumbers.length > 1)
    .map((entry) => ({
      ...entry,
      confidence: 0.55,
      rationale: 'Heuristiek: gelijke projectomschrijving + leverdatum.',
    }));

  const grouped = new Set(clusters.flatMap((entry) => entry.orderNumbers));
  const standaloneOrders = records
    .map((record) => clean(record['Production Order'] || record['production order']))
    .filter(Boolean)
    .filter((order) => !grouped.has(order));

  return { clusters, standaloneOrders, notes: ['Fallback gebruikt zonder AI-analyse.'] };
};

const runImportConsolidator = async ({ object }) => {
  const objectName = clean(object?.name);
  const bucketName = clean(object?.bucket);

  if (!objectName || !bucketName) return null;
  if (!objectName.toLowerCase().startsWith(IMPORT_FOLDER_PREFIX)) return null;
  if (!isSupportedImportFile(objectName)) return null;

  const baseName = objectName.split('/').pop() || '';
  if (!baseName.toLowerCase().includes('tisfc')) return null;

  const fileRef = admin.storage().bucket(bucketName).file(objectName);
  const [fileBuffer] = await fileRef.download();

  const parsed = parseImportRows(fileBuffer);
  if (!parsed.rows.length) {
    await writeSystemLog({
      level: 'INFO',
      source: 'aiImportConsolidator',
      message: `Importbestand ${baseName} bevatte geen LN-rijen voor consolidatie.`,
    });
    return null;
  }

  const payloadRows = parsed.rows.slice(0, 500).map((record) => ({
    productionOrder: clean(record['Production Order'] || record['production order']),
    projectDescription: clean(record['Project Description'] || record['project description']),
    itemDescription: clean(record['Item Description'] || record['item description']),
    workCenter: clean(record['Work Center'] || record['work center']),
    plannedDeliveryDate: clean(record['Planned Delivery Date'] || record['planned delivery date']),
    orderStatus: clean(record['Order Status'] || record['order status']),
  }));

  let insight = null;
  try {
    insight = await callVertexJson({
      instruction: [
        'Taak: Operations Analysis op LN dump.',
        'Groepeer logistiek samenhangende orders, ook met verschillende ordernummers.',
        'Gebruik vooral projectomschrijving, itemomschrijving, werkcentrum en leverdatum.',
        'Geef JSON met velden:',
        '{"clusters": [{"clusterLabel": string, "projectHint": string, "orderNumbers": string[], "confidence": number, "rationale": string}], "standaloneOrders": string[], "notes": string[]}',
      ].join(' '),
      payload: {
        fileName: baseName,
        columnCount: parsed.columns.length,
        rows: payloadRows,
      },
    });
  } catch (error) {
    console.warn('[invisible_worker] import consolidator fallback:', error?.message || String(error));
    insight = clusterHeuristic(parsed.rows);
  }

  const clusters = Array.isArray(insight?.clusters) ? insight.clusters.slice(0, 200) : [];
  const standaloneOrders = Array.isArray(insight?.standaloneOrders)
    ? insight.standaloneOrders.map((entry) => clean(entry)).filter(Boolean).slice(0, 2000)
    : [];
  const notes = Array.isArray(insight?.notes) ? insight.notes.map((entry) => clean(entry)).filter(Boolean).slice(0, 20) : [];

  await db.collection(INSIGHTS_COLLECTION).add({
    type: 'import_operations_consolidation',
    source: 'aiImportConsolidator',
    model: VERTEX_MODEL,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    fileName: baseName,
    bucket: bucketName,
    objectName,
    columnCount: parsed.columns.length,
    totalRows: parsed.rows.length,
    clusters,
    standaloneOrders,
    notes,
  });

  await writeSystemLog({
    level: 'INFO',
    source: 'aiImportConsolidator',
    message: `Importconsolidatie aangemaakt voor ${baseName}: ${clusters.length} cluster(s).`,
    data: {
      fileName: baseName,
      totalRows: parsed.rows.length,
      clusters: clusters.length,
      standaloneOrders: standaloneOrders.length,
    },
  });

  return null;
};

const aiReactiveWatchdogTrackedScoped = functions
  .runWith(AI_RUNTIME)
  .firestore.document(`${BASE}/production/tracked_products/{department}/machines/{machine}/items/{productId}`)
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    try {
      return await runReactiveWatchdog({
        before,
        after,
        refPath: change.after.ref.path,
        functionSource: 'aiReactiveWatchdogTrackedScoped',
      });
    } catch (error) {
      console.error('[aiReactiveWatchdogTrackedScoped] error:', error);
      await writeSystemLog({
        level: 'ERROR',
        source: 'aiReactiveWatchdogTrackedScoped',
        message: error?.message || 'Onbekende fout in Reactive Watchdog.',
        data: { productId: context.params?.productId || null },
      });
      return null;
    }
  });

const aiReactiveWatchdogTrackedLegacy = functions
  .runWith(AI_RUNTIME)
  .firestore.document(`${BASE}/production/tracked_products/{productId}`)
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    try {
      return await runReactiveWatchdog({
        before,
        after,
        refPath: change.after.ref.path,
        functionSource: 'aiReactiveWatchdogTrackedLegacy',
      });
    } catch (error) {
      console.error('[aiReactiveWatchdogTrackedLegacy] error:', error);
      await writeSystemLog({
        level: 'ERROR',
        source: 'aiReactiveWatchdogTrackedLegacy',
        message: error?.message || 'Onbekende fout in Reactive Watchdog.',
        data: { productId: context.params?.productId || null },
      });
      return null;
    }
  });

const aiNightlyBottleneckPlanner = functions
  .runWith(AI_RUNTIME)
  .pubsub.schedule('0 4 * * *')
  .timeZone('Europe/Amsterdam')
  .onRun(async () => {
    try {
      return await runNightlyBottleneckPlanner();
    } catch (error) {
      console.error('[aiNightlyBottleneckPlanner] error:', error);
      await writeSystemLog({
        level: 'ERROR',
        source: 'aiNightlyBottleneckPlanner',
        message: error?.message || 'Nightly bottleneck planner gefaald.',
      });
      return null;
    }
  });

const aiImportConsolidator = functions
  .runWith(AI_RUNTIME)
  .storage.object()
  .onFinalize(async (object) => {
    try {
      return await runImportConsolidator({ object });
    } catch (error) {
      console.error('[aiImportConsolidator] error:', error);
      await writeSystemLog({
        level: 'ERROR',
        source: 'aiImportConsolidator',
        message: error?.message || 'Import consolidator gefaald.',
        data: {
          objectName: clean(object?.name) || null,
          bucket: clean(object?.bucket) || null,
        },
      });
      return null;
    }
  });

module.exports = {
  aiReactiveWatchdogTrackedScoped,
  aiReactiveWatchdogTrackedLegacy,
  aiNightlyBottleneckPlanner,
  aiImportConsolidator,
};
