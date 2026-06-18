#!/usr/bin/env node

/*
 * Migratie voor planning lifecycle events naar scoped machine structuur.
 *
 * Bronpaden:
 * 1) Legacy subcollectie per order:
 *    /future-factory/production/digital_planning/{orderId}/events/{eventId}
 * 2) Flat tussencollectie:
 *    /future-factory/production/planning_events/{eventId}
 *
 * Doelpad:
 *    /future-factory/production/events/{department}/machines/{machine}/items/{eventId}
 *
 * Usage:
 *   node scripts/migrate-planning-events-scoped-via-cli-auth.cjs
 *   node scripts/migrate-planning-events-scoped-via-cli-auth.cjs --apply
 *   node scripts/migrate-planning-events-scoped-via-cli-auth.cjs --apply --delete-legacy
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const PLANNING_BASE = 'future-factory/production/digital_planning';
const FLAT_EVENTS_BASE = 'future-factory/production/planning_events';
const TARGET_EVENTS_BASE = 'future-factory/production/events';
const DEFAULT_DEPARTMENT = 'Fittings';
const DEFAULT_MACHINE = 'UNASSIGNED';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const deleteLegacy = args.includes('--delete-legacy');

const sanitizeSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return normalized || fallback;
};

const normalizeMachineToken = (rawValue = '') => {
  let token = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!token) return '';

  if (token === 'BM18') token = 'BH18';
  if (token === '40BM18') token = '40BH18';

  if (/^40(BH|BM|BA)\d+$/.test(token)) return token;
  if (/^(BH|BM|BA)\d+$/.test(token)) return `40${token}`;

  const match = token.match(/(40)?(BH|BM|BA)\d+/);
  if (!match) return '';
  const noPrefix = match[0].replace(/^40/, '');
  if (/^(BH|BM|BA)\d+$/.test(noPrefix)) return `40${noPrefix}`;

  return token;
};

const safeEventDocId = (orderId, eventId, sourceTag) => {
  const raw = `${String(orderId || 'UNKNOWN')}_${String(sourceTag || 'EVT')}_${String(eventId || 'AUTO')}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 240);
};

const readTokenFromFirebaseCli = () => {
  try {
    const raw = execSync('firebase login:list --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const parsed = JSON.parse(raw);
    const accounts = Array.isArray(parsed?.result) ? parsed.result : [];
    for (const account of accounts) {
      const token = String(account?.tokens?.access_token || '').trim();
      if (token) return token;
    }
    return '';
  } catch {
    return '';
  }
};

const readFreshTokenFromFirebaseCli = () => {
  try {
    return String(execSync('firebase auth:print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '').trim();
  } catch {
    return '';
  }
};

const readTokenFromFirebaseConfig = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return String(parsed?.tokens?.access_token || '').trim();
};

const getToken = () => {
  const token = readFreshTokenFromFirebaseCli() || readTokenFromFirebaseCli() || readTokenFromFirebaseConfig();
  if (!token) throw new Error('Geen bruikbaar Firebase access_token gevonden. Run eerst: firebase login');
  return token;
};

const apiRequest = (method, path, token, body = null) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'firestore.googleapis.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            return reject(new Error(`${method} ${path} failed (${res.statusCode}): ${parsed?.error?.message || data}`));
          }
          resolve(parsed);
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const listDocs = async (token, collectionPath, pageSize = 300) => {
  const out = [];
  let pageToken = '';

  try {
    do {
      const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=${pageSize}${qp}`;
      const response = await apiRequest('GET', path, token);
      out.push(...(Array.isArray(response.documents) ? response.documents : []));
      pageToken = response.nextPageToken || '';
    } while (pageToken);
  } catch (err) {
    if (String(err.message || '').includes('(404)')) return [];
    throw err;
  }

  return out;
};

const listCollectionGroupDocs = async (token, collectionId, pageSize = 300) => {
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: true }],
      limit: pageSize,
    },
  };

  const response = await apiRequest('POST', path, token, body);
  if (!Array.isArray(response)) return [];
  return response
    .map((entry) => entry?.document)
    .filter((doc) => doc && typeof doc.name === 'string');
};

const getDoc = async (token, docPath) => {
  try {
    return await apiRequest('GET', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token);
  } catch (err) {
    if (String(err.message || '').includes('(404)')) return null;
    throw err;
  }
};

const patchDoc = async (token, docPath, fields) => {
  await apiRequest('PATCH', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token, { fields: fields || {} });
};

const deleteDoc = async (token, docPath) => {
  await apiRequest('DELETE', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token);
};

const extractDocId = (fullName, collectionPath) => {
  const needle = `/documents/${collectionPath}/`;
  const idx = String(fullName || '').indexOf(needle);
  if (idx === -1) return '';
  const tail = fullName.slice(idx + needle.length);
  if (!tail || tail.includes('/')) return '';
  return tail;
};

const getStringField = (fields, key) => {
  const v = fields?.[key];
  return typeof v?.stringValue === 'string' ? v.stringValue : '';
};

const getMapField = (fields, key) => {
  const v = fields?.[key];
  if (!v || !v.mapValue || typeof v.mapValue !== 'object') return {};
  return v.mapValue.fields || {};
};

const inferDepartment = (eventFields = {}, orderFields = {}) => {
  const payload = getMapField(eventFields, 'payload');
  const value =
    getStringField(eventFields, 'departmentId') ||
    getStringField(eventFields, 'department') ||
    getStringField(payload, 'departmentId') ||
    getStringField(payload, 'department') ||
    getStringField(orderFields, 'departmentId') ||
    getStringField(orderFields, 'department') ||
    DEFAULT_DEPARTMENT;

  return sanitizeSegment(value, DEFAULT_DEPARTMENT);
};

const inferMachine = (eventFields = {}, orderFields = {}) => {
  const payload = getMapField(eventFields, 'payload');
  const candidates = [
    getStringField(eventFields, 'machineId'),
    getStringField(eventFields, 'machine'),
    getStringField(payload, 'machineId'),
    getStringField(payload, 'machine'),
    getStringField(payload, 'station'),
    getStringField(payload, 'workCenter'),
    getStringField(orderFields, 'machineId'),
    getStringField(orderFields, 'machine'),
    getStringField(orderFields, 'workCenter'),
    getStringField(orderFields, 'wc'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeMachineToken(candidate);
    if (normalized) return sanitizeSegment(normalized, DEFAULT_MACHINE);
  }

  return DEFAULT_MACHINE;
};

const withScopedMeta = (fields, eventId, orderId, dep, machine) => ({
  ...(fields || {}),
  id: { stringValue: eventId },
  orderId: { stringValue: orderId },
  departmentId: { stringValue: dep },
  machineId: { stringValue: machine },
  _scopeType: { stringValue: 'planning_event' },
});

const getPathAfterDocuments = (fullName = '') => {
  const marker = '/documents/';
  const idx = String(fullName || '').indexOf(marker);
  if (idx === -1) return '';
  return fullName.slice(idx + marker.length);
};

const parseLegacyEventLocation = (docPath = '') => {
  const parts = String(docPath || '').split('/').filter(Boolean);
  const eventsIdx = parts.lastIndexOf('events');
  if (eventsIdx === -1 || eventsIdx + 1 >= parts.length) return null;

  const eventId = parts[eventsIdx + 1] || '';
  const orderId = eventsIdx > 0 ? parts[eventsIdx - 1] : '';
  if (!eventId || !orderId) return null;

  let department = '';
  let machine = '';

  const machinesIdx = parts.indexOf('machines');
  if (machinesIdx > 0 && machinesIdx + 1 < parts.length) {
    department = parts[machinesIdx - 1] || '';
    machine = parts[machinesIdx + 1] || '';
  }

  return { eventId, orderId, department, machine };
};

const migratePlanningCollectionGroupEvents = async (token) => {
  const allEvents = await listCollectionGroupDocs(token, 'events', 2000);

  let moved = 0;
  let skipped = 0;

  const orderDocCache = new Map();

  for (const doc of allEvents) {
    const fullPath = getPathAfterDocuments(doc.name || '');
    if (!fullPath.startsWith(`${PLANNING_BASE}/`)) continue;
    if (!fullPath.includes('/events/')) continue;

    const parsed = parseLegacyEventLocation(fullPath);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const { eventId, orderId, department, machine } = parsed;
    const fields = doc.fields || {};

    if (!orderDocCache.has(orderId)) {
      const orderDoc = await getDoc(token, `${PLANNING_BASE}/${orderId}`);
      orderDocCache.set(orderId, orderDoc?.fields || {});
    }

    const orderFields = orderDocCache.get(orderId) || {};
    const dep = sanitizeSegment(department || inferDepartment(fields, orderFields), DEFAULT_DEPARTMENT);
    const mc = sanitizeSegment(normalizeMachineToken(machine || inferMachine(fields, orderFields)), DEFAULT_MACHINE);
    const targetEventId = safeEventDocId(orderId, eventId, 'CG');
    const targetPath = `${TARGET_EVENTS_BASE}/${dep}/machines/${mc}/items/${targetEventId}`;
    const payload = withScopedMeta(fields, targetEventId, orderId, dep, mc);

    if (dryRun) {
      console.log(`[DRY][CG] ${fullPath} -> ${targetPath}`);
      moved += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, fullPath);
    }
    moved += 1;
    console.log(`[MIG][CG] ${fullPath} -> ${targetPath}`);
  }

  return { moved, skipped };
};

const migrateLegacySubcollections = async (token) => {
  const planningDocs = await listDocs(token, PLANNING_BASE, 300);

  let moved = 0;
  let skipped = 0;

  for (const planningDoc of planningDocs) {
    const orderId = extractDocId(planningDoc.name, PLANNING_BASE);
    if (!orderId) continue;

    const eventDocs = await listDocs(token, `${PLANNING_BASE}/${orderId}/events`, 200);
    if (!eventDocs.length) continue;

    const orderFields = planningDoc.fields || {};

    for (const eventDoc of eventDocs) {
      const legacyEventId = extractDocId(eventDoc.name, `${PLANNING_BASE}/${orderId}/events`);
      if (!legacyEventId) {
        skipped += 1;
        continue;
      }

      const fields = eventDoc.fields || {};
      const dep = inferDepartment(fields, orderFields);
      const machine = inferMachine(fields, orderFields);
      const targetEventId = safeEventDocId(orderId, legacyEventId, 'LEGACY');
      const targetPath = `${TARGET_EVENTS_BASE}/${dep}/machines/${machine}/items/${targetEventId}`;
      const payload = withScopedMeta(fields, targetEventId, orderId, dep, machine);

      if (dryRun) {
        console.log(`[DRY][LEGACY_SUB] ${PLANNING_BASE}/${orderId}/events/${legacyEventId} -> ${targetPath}`);
        moved += 1;
        continue;
      }

      await patchDoc(token, targetPath, payload);
      if (deleteLegacy) {
        await deleteDoc(token, `${PLANNING_BASE}/${orderId}/events/${legacyEventId}`);
      }
      moved += 1;
      console.log(`[MIG][LEGACY_SUB] ${PLANNING_BASE}/${orderId}/events/${legacyEventId} -> ${targetPath}`);
    }
  }

  return { moved, skipped };
};

const migrateFlatEvents = async (token) => {
  const flatDocs = await listDocs(token, FLAT_EVENTS_BASE, 300);

  let moved = 0;
  let skipped = 0;

  const orderDocCache = new Map();

  for (const doc of flatDocs) {
    const flatEventId = extractDocId(doc.name, FLAT_EVENTS_BASE);
    if (!flatEventId) {
      skipped += 1;
      continue;
    }

    const fields = doc.fields || {};
    const orderId = getStringField(fields, 'orderId') || 'UNKNOWN_ORDER';

    if (!orderDocCache.has(orderId)) {
      const orderDoc = await getDoc(token, `${PLANNING_BASE}/${orderId}`);
      orderDocCache.set(orderId, orderDoc?.fields || {});
    }

    const orderFields = orderDocCache.get(orderId) || {};
    const dep = inferDepartment(fields, orderFields);
    const machine = inferMachine(fields, orderFields);
    const targetEventId = safeEventDocId(orderId, flatEventId, 'FLAT');
    const targetPath = `${TARGET_EVENTS_BASE}/${dep}/machines/${machine}/items/${targetEventId}`;
    const payload = withScopedMeta(fields, targetEventId, orderId, dep, machine);

    if (dryRun) {
      console.log(`[DRY][FLAT] ${FLAT_EVENTS_BASE}/${flatEventId} -> ${targetPath}`);
      moved += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, `${FLAT_EVENTS_BASE}/${flatEventId}`);
    }
    moved += 1;
    console.log(`[MIG][FLAT] ${FLAT_EVENTS_BASE}/${flatEventId} -> ${targetPath}`);
  }

  return { moved, skipped };
};

const run = async () => {
  const token = getToken();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Delete legacy docs: ${deleteLegacy ? 'JA' : 'NEE'}`);

  const legacy = await migrateLegacySubcollections(token);
  const flat = await migrateFlatEvents(token);
  const collectionGroup = await migratePlanningCollectionGroupEvents(token);

  console.log('\nSamenvatting');
  console.log(`- Legacy subcollection events gemigreerd: ${legacy.moved}`);
  console.log(`- Flat planning_events gemigreerd: ${flat.moved}`);
  console.log(`- Collection-group events gemigreerd: ${collectionGroup.moved}`);
  console.log(`- Overgeslagen records: ${legacy.skipped + flat.skipped + collectionGroup.skipped}`);
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
