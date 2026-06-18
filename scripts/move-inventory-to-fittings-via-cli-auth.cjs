#!/usr/bin/env node

/*
 * Verplaats inventory root docs naar scoped map met bestaande firebase CLI-login.
 *
 * Van:
 *   future-factory/production/inventory/{docId}
 * Naar:
 *   future-factory/production/inventory/Fittings/machines/{machineId}/items/{docId}
 *
 * Usage:
 *   node scripts/move-inventory-to-fittings-via-cli-auth.cjs --dry-run
 *   node scripts/move-inventory-to-fittings-via-cli-auth.cjs --apply
 *   node scripts/move-inventory-to-fittings-via-cli-auth.cjs --apply --delete-legacy
 */

const fs = require('fs');
const https = require('https');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const BASE_DOC_PATH = 'future-factory/production/inventory';
const FITTINGS_SEGMENT = 'Fittings';
const DEFAULT_MACHINE = 'UNASSIGNED';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const deleteLegacy = args.includes('--delete-legacy');

const readFirebaseCliToken = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-tools login config niet gevonden');
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = parsed?.tokens?.access_token;
  if (!token) {
    throw new Error('Geen access_token gevonden in firebase-tools config');
  }
  return token;
};

const sanitizeSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/.#?$\[\]]/g, '_')
    .replace(/\s+/g, '_');
  return normalized || fallback;
};

const getStringField = (fields, key) => {
  const v = fields?.[key];
  if (!v) return '';
  if (typeof v.stringValue === 'string') return v.stringValue;
  return '';
};

const inferMachine = (fields, docId) => {
  const candidate =
    getStringField(fields, 'machineId') ||
    getStringField(fields, 'machine') ||
    getStringField(fields, 'stationId') ||
    getStringField(fields, 'location') ||
    docId;
  const upper = String(candidate || '').toUpperCase();
  const match = upper.match(/(?:40)?(?:BH|BM|BA)\d{2}/);
  if (match) return match[0].replace(/^40/, '');
  if (upper.includes('LOSSEN')) return 'LOSSEN';
  if (upper.includes('NABEWERK')) return 'NABEWERKING';
  if (upper.includes('BM01')) return 'BM01';
  return DEFAULT_MACHINE;
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
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          const parsed = data ? JSON.parse(data) : {};
          if (!ok) {
            return reject(
              new Error(`${method} ${path} failed (${res.statusCode}): ${parsed?.error?.message || data}`)
            );
          }
          resolve(parsed);
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const listLegacyDocs = async (token) => {
  const docs = [];
  let pageToken = '';

  do {
    const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_DOC_PATH}?pageSize=200${qp}`;
    const response = await apiRequest('GET', path, token);
    const pageDocs = Array.isArray(response.documents) ? response.documents : [];
    docs.push(...pageDocs);
    pageToken = response.nextPageToken || '';
  } while (pageToken);

  return docs;
};

const buildTargetDocPath = (machineId, docId) =>
  `${BASE_DOC_PATH}/${FITTINGS_SEGMENT}/machines/${machineId}/items/${docId}`;

const run = async () => {
  const token = readFirebaseCliToken();
  const legacyDocs = await listLegacyDocs(token);

  if (!legacyDocs.length) {
    console.log('Geen legacy inventory docs gevonden.');
    return;
  }

  console.log(`Gevonden docs: ${legacyDocs.length}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Delete legacy: ${deleteLegacy ? 'JA' : 'NEE'}`);

  let moved = 0;
  let skipped = 0;

  for (const legacyDoc of legacyDocs) {
    const fullName = legacyDoc.name || '';
    const prefix = `/documents/${BASE_DOC_PATH}/`;
    const idx = fullName.indexOf(prefix);
    if (idx === -1) {
      skipped += 1;
      continue;
    }

    const docId = fullName.slice(idx + prefix.length);
    // Alleen top-level docs uit legacy pad migreren.
    if (!docId || docId.includes('/')) {
      skipped += 1;
      continue;
    }

    const fields = legacyDoc.fields || {};
    const machineId = sanitizeSegment(inferMachine(fields, docId), DEFAULT_MACHINE);
    const targetDocPath = buildTargetDocPath(machineId, docId);

    const targetFields = {
      ...fields,
      id: { stringValue: docId },
      departmentId: { stringValue: FITTINGS_SEGMENT },
      machineId: { stringValue: machineId },
      _scopeType: { stringValue: 'inventory' },
    };

    if (dryRun) {
      console.log(`[DRY] ${BASE_DOC_PATH}/${docId} -> ${targetDocPath}`);
      moved += 1;
      continue;
    }

    await apiRequest(
      'PATCH',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${targetDocPath}`,
      token,
      { fields: targetFields }
    );

    if (deleteLegacy) {
      await apiRequest(
        'DELETE',
        `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_DOC_PATH}/${docId}`,
        token
      );
    }

    moved += 1;
  }

  console.log(`Klaar. Verplaatst: ${moved}, overgeslagen: ${skipped}`);
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
