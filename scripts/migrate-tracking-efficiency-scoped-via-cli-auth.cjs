#!/usr/bin/env node

/*
 * Migratie voor scoped/canonieke machinepaden:
 * - tracked_products root docs -> scoped items onder {department}/machines/{40-prefixed machine}/items/{docId}
 * - efficiency_hours root docs -> scoped items onder {department}/machines/{40-prefixed machine}/items/{orderId}
 *
 * Compatibiliteit:
 * - Legacy root docs blijven standaard bestaan (geen delete), tenzij --delete-legacy wordt meegegeven.
 *
 * Usage:
 *   node scripts/migrate-tracking-efficiency-scoped-via-cli-auth.cjs
 *   node scripts/migrate-tracking-efficiency-scoped-via-cli-auth.cjs --apply
 *   node scripts/migrate-tracking-efficiency-scoped-via-cli-auth.cjs --apply --delete-legacy
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const TRACKING_BASE = 'future-factory/production/tracked_products';
const EFFICIENCY_BASE = 'future-factory/production/efficiency_hours';
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
  return '';
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

const readTokenFromFirebaseConfig = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return String(parsed?.tokens?.access_token || '').trim();
};

const getToken = () => {
  const token = readTokenFromFirebaseCli() || readTokenFromFirebaseConfig();
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
        res.on('data', (chunk) => (data += chunk));
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
  const docs = [];
  let pageToken = '';
  do {
    const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=${pageSize}${qp}`;
    const response = await apiRequest('GET', path, token);
    docs.push(...(Array.isArray(response.documents) ? response.documents : []));
    pageToken = response.nextPageToken || '';
  } while (pageToken);
  return docs;
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

const toScopedPaths = ({ base, departmentId, machineId, docId }) => {
  const dep = sanitizeSegment(departmentId || DEFAULT_DEPARTMENT, DEFAULT_DEPARTMENT);
  const machineNorm = normalizeMachineToken(machineId);
  const machine = sanitizeSegment(machineNorm || machineId || DEFAULT_MACHINE, DEFAULT_MACHINE);
  return {
    dep,
    machine,
    targetPath: `${base}/${dep}/machines/${machine}/items/${docId}`,
  };
};

const withScopedMeta = (fields, docId, dep, machine, scopeType) => ({
  ...(fields || {}),
  id: { stringValue: docId },
  departmentId: { stringValue: dep },
  machineId: { stringValue: machine },
  _scopeType: { stringValue: scopeType },
});

const runTracking = async (token) => {
  const docs = await listDocs(token, TRACKING_BASE, 300);
  let migrated = 0;

  for (const d of docs) {
    const docId = extractDocId(d.name, TRACKING_BASE);
    if (!docId) continue;

    const fields = d.fields || {};
    const orderId = getStringField(fields, 'orderId');
    const lotNumber = getStringField(fields, 'lotNumber');
    if (!orderId && !lotNumber) continue;

    const machine =
      getStringField(fields, 'machineId') ||
      getStringField(fields, 'machine') ||
      getStringField(fields, 'currentStation') ||
      getStringField(fields, 'originMachine');
    const department = getStringField(fields, 'departmentId') || getStringField(fields, 'department') || DEFAULT_DEPARTMENT;

    const { dep, machine: mc, targetPath } = toScopedPaths({
      base: TRACKING_BASE,
      departmentId: department,
      machineId: machine,
      docId,
    });

    const payload = withScopedMeta(fields, docId, dep, mc, 'tracking');

    if (dryRun) {
      console.log(`[DRY][TRACKING] ${TRACKING_BASE}/${docId} -> ${targetPath}`);
      migrated += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, `${TRACKING_BASE}/${docId}`);
    }
    migrated += 1;
    console.log(`[MIG][TRACKING] ${TRACKING_BASE}/${docId} -> ${targetPath}`);
  }

  return migrated;
};

const runEfficiency = async (token) => {
  const docs = await listDocs(token, EFFICIENCY_BASE, 300);
  let migrated = 0;

  for (const d of docs) {
    const docId = extractDocId(d.name, EFFICIENCY_BASE);
    if (!docId) continue;

    const fields = d.fields || {};
    const orderId = getStringField(fields, 'orderId') || docId;
    const machine =
      getStringField(fields, 'machineId') ||
      getStringField(fields, 'machine') ||
      getStringField(fields, 'workCenter') ||
      getStringField(fields, 'station');
    const department = getStringField(fields, 'departmentId') || getStringField(fields, 'department') || DEFAULT_DEPARTMENT;

    const { dep, machine: mc, targetPath } = toScopedPaths({
      base: EFFICIENCY_BASE,
      departmentId: department,
      machineId: machine,
      docId: orderId,
    });

    const payload = withScopedMeta(fields, orderId, dep, mc, 'efficiency_hours');

    if (dryRun) {
      console.log(`[DRY][EFF] ${EFFICIENCY_BASE}/${docId} -> ${targetPath}`);
      migrated += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, `${EFFICIENCY_BASE}/${docId}`);
    }
    migrated += 1;
    console.log(`[MIG][EFF] ${EFFICIENCY_BASE}/${docId} -> ${targetPath}`);
  }

  return migrated;
};

const run = async () => {
  const token = getToken();
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Delete legacy root docs: ${deleteLegacy ? 'JA' : 'NEE'}`);

  const trackingMigrated = await runTracking(token);
  const efficiencyMigrated = await runEfficiency(token);

  console.log('\nSamenvatting');
  console.log(`- Tracking scoped upserts: ${trackingMigrated}`);
  console.log(`- Efficiency scoped upserts: ${efficiencyMigrated}`);
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
