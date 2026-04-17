#!/usr/bin/env node

/*
 * Normaliseert print_queue naar scoped structuur met canonieke machinecodes.
 *
 * Doelen:
 * 1) Root printjobs verplaatsen naar scoped pad:
 *    /future-factory/production/print_queue/{department}/machines/{machine}/items/{jobId}
 * 2) Scoped machine-segmenten normaliseren naar 40-prefix voor BH/BM/BA (bijv. BH18 -> 40BH18)
 * 3) Metadata velden borgen: id, departmentId, machineId, _scopeType=print_queue
 *
 * Usage:
 *   node scripts/migrate-print-queue-scoped-via-cli-auth.cjs
 *   node scripts/migrate-print-queue-scoped-via-cli-auth.cjs --apply
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const BASE_PATH = 'future-factory/production/print_queue';
const DEFAULT_DEPARTMENT = 'Fittings';
const DEFAULT_MACHINE = 'UNASSIGNED';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');

const sanitizeSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return normalized || fallback;
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
  } catch (_err) {
    return '';
  }
};

const readTokenFromFirebaseConfig = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return String(parsed?.tokens?.access_token || '').trim();
};

const readFirebaseCliToken = () => {
  const token = readTokenFromFirebaseCli() || readTokenFromFirebaseConfig();
  if (!token) {
    throw new Error('Geen bruikbaar Firebase access_token gevonden. Run eerst: firebase login');
  }
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

const listDocs = async (token, collectionPath) => {
  const out = [];
  let pageToken = '';

  try {
    do {
      const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=300${qp}`;
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
  if (!v) return '';
  if (typeof v.stringValue === 'string') return v.stringValue;
  return '';
};

const getMapField = (fields, key) => {
  const v = fields?.[key];
  if (!v || !v.mapValue || typeof v.mapValue !== 'object') return {};
  return v.mapValue.fields || {};
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
  const raw = match[0].replace(/^40/, '');
  if (/^(BH|BM|BA)\d+$/.test(raw)) return `40${raw}`;
  return '';
};

const inferDepartment = (fields) => {
  const metadata = getMapField(fields, 'metadata');
  const dep =
    getStringField(fields, 'departmentId') ||
    getStringField(fields, 'department') ||
    getStringField(metadata, 'departmentId') ||
    getStringField(metadata, 'department') ||
    DEFAULT_DEPARTMENT;
  return sanitizeSegment(dep, DEFAULT_DEPARTMENT);
};

const inferMachine = (fields) => {
  const metadata = getMapField(fields, 'metadata');
  const candidates = [
    getStringField(fields, 'machineId'),
    getStringField(fields, 'stationId'),
    getStringField(fields, 'printerId'),
    getStringField(metadata, 'machineId'),
    getStringField(metadata, 'stationId'),
    getStringField(metadata, 'station'),
    getStringField(metadata, 'currentStation'),
    getStringField(metadata, 'originMachine'),
    getStringField(metadata, 'targetPrinterName'),
  ];

  for (const candidate of candidates) {
    const machine = normalizeMachineToken(candidate);
    if (machine) return sanitizeSegment(machine, DEFAULT_MACHINE);
  }

  return DEFAULT_MACHINE;
};

const isRootPrintJobDoc = (fields) => {
  if (!fields || typeof fields !== 'object') return false;
  return Boolean(fields.printerId || fields.zpl || fields.status || fields.metadata);
};

const withScopedFields = (fields, docId, dep, machine) => ({
  ...(fields || {}),
  id: { stringValue: docId },
  departmentId: { stringValue: dep },
  machineId: { stringValue: machine },
  _scopeType: { stringValue: 'print_queue' },
});

const run = async () => {
  const token = readFirebaseCliToken();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);

  const topDocs = await listDocs(token, BASE_PATH);
  const departmentIds = new Set([DEFAULT_DEPARTMENT]);

  let rootMoved = 0;
  let scopedMachineMoved = 0;
  let scopedPatched = 0;

  for (const topDoc of topDocs) {
    const docId = extractDocId(topDoc.name, BASE_PATH);
    if (!docId) continue;

    const fields = topDoc.fields || {};
    if (!isRootPrintJobDoc(fields)) {
      departmentIds.add(docId);
      continue;
    }

    const dep = inferDepartment(fields);
    const machine = inferMachine(fields);
    const targetPath = `${BASE_PATH}/${dep}/machines/${machine}/items/${docId}`;
    const targetFields = withScopedFields(fields, docId, dep, machine);

    if (dryRun) {
      console.log(`[DRY][ROOT->SCOPED] ${BASE_PATH}/${docId} -> ${targetPath}`);
      rootMoved += 1;
      continue;
    }

    await patchDoc(token, targetPath, targetFields);
    await deleteDoc(token, `${BASE_PATH}/${docId}`);
    console.log(`[MOV][ROOT->SCOPED] ${BASE_PATH}/${docId} -> ${targetPath}`);
    rootMoved += 1;
    departmentIds.add(dep);
  }

  const buildBruteMachineCandidates = () => {
    const out = [];
    const prefixes = ['BH', 'BM', 'BA'];
    for (const prefix of prefixes) {
      for (let i = 1; i <= 99; i += 1) {
        out.push(`${prefix}${String(i).padStart(2, '0')}`);
      }
    }
    return out;
  };

  const bruteCandidates = buildBruteMachineCandidates();

  for (const dep of departmentIds) {
    const machineDocs = await listDocs(token, `${BASE_PATH}/${dep}/machines`);
    const discovered = machineDocs
      .map((machineDoc) => extractDocId(machineDoc.name, `${BASE_PATH}/${dep}/machines`))
      .filter(Boolean);

    const machineCandidates = Array.from(new Set([...discovered, ...bruteCandidates]));
    for (const machineId of machineCandidates) {
      const canonicalMachine = sanitizeSegment(normalizeMachineToken(machineId) || machineId, DEFAULT_MACHINE);
      const itemCollectionPath = `${BASE_PATH}/${dep}/machines/${machineId}/items`;
      const itemDocs = await listDocs(token, itemCollectionPath);
      if (itemDocs.length === 0) continue;

      for (const itemDoc of itemDocs) {
        const itemId = extractDocId(itemDoc.name, itemCollectionPath);
        if (!itemId) continue;

        const itemFields = itemDoc.fields || {};
        const targetFields = withScopedFields(itemFields, itemId, dep, canonicalMachine);
        const sourcePath = `${itemCollectionPath}/${itemId}`;
        const targetPath = `${BASE_PATH}/${dep}/machines/${canonicalMachine}/items/${itemId}`;

        if (machineId === canonicalMachine) {
          if (dryRun) {
            console.log(`[DRY][PATCH] ${sourcePath}`);
            scopedPatched += 1;
            continue;
          }
          await patchDoc(token, sourcePath, targetFields);
          scopedPatched += 1;
          continue;
        }

        if (dryRun) {
          console.log(`[DRY][MACHINE] ${sourcePath} -> ${targetPath}`);
          scopedMachineMoved += 1;
          continue;
        }

        await patchDoc(token, targetPath, targetFields);
        await deleteDoc(token, sourcePath);
        console.log(`[MOV][MACHINE] ${sourcePath} -> ${targetPath}`);
        scopedMachineMoved += 1;
      }
    }
  }

  console.log('\nSamenvatting');
  console.log(`- Root jobs verplaatst naar scoped: ${rootMoved}`);
  console.log(`- Scoped machine pad genormaliseerd: ${scopedMachineMoved}`);
  console.log(`- Scoped docs bijgewerkt (_scopeType/id/departmentId/machineId): ${scopedPatched}`);
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
