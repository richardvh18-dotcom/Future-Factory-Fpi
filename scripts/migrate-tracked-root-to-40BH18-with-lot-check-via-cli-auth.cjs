#!/usr/bin/env node

/*
 * Migreert root tracked_products docs naar scoped pad 40BH18.
 *
 * Bron:
 *   /future-factory/production/tracked_products/{docId}
 * Doel:
 *   /future-factory/production/tracked_products/Fittings/machines/40BH18/items/{docId}
 *
 * Extra:
 * - Detecteert dubbele lotnummers tegen bestaande docs in scoped map.
 * - Bij conflict (zelfde lotnummer, andere docId): standaard SKIP (veilig).
 *
 * Usage:
 *   node scripts/migrate-tracked-root-to-40BH18-with-lot-check-via-cli-auth.cjs
 *   node scripts/migrate-tracked-root-to-40BH18-with-lot-check-via-cli-auth.cjs --apply
 *   node scripts/migrate-tracked-root-to-40BH18-with-lot-check-via-cli-auth.cjs --apply --delete-legacy
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const TRACKING_BASE = 'future-factory/production/tracked_products';
const TARGET_ITEMS_PATH = `${TRACKING_BASE}/Fittings/machines/40BH18/items`;

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const deleteLegacy = args.includes('--delete-legacy');

const touchFirebaseSession = () => {
  try {
    execSync('firebase projects:list --json > /tmp/fb-projects-tracked-migration.json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // best effort
  }
};

const readTokenFromFirebaseCli = () => {
  try {
    const raw = execSync('firebase login:list --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
  try {
    const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
    if (!fs.existsSync(configPath)) return '';
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return String(parsed?.tokens?.access_token || '').trim();
  } catch {
    return '';
  }
};

const getToken = () => {
  touchFirebaseSession();
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
  await apiRequest('PATCH', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token, {
    fields: fields || {},
  });
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
  if (typeof v?.stringValue === 'string') return v.stringValue;
  return '';
};

const normalizeLot = (lot) => String(lot || '').trim().toUpperCase();

const withScopedFields = (fields, docId) => ({
  ...(fields || {}),
  id: { stringValue: docId },
  departmentId: { stringValue: 'Fittings' },
  department: { stringValue: 'Fittings' },
  machineId: { stringValue: '40BH18' },
  machine: { stringValue: '40BH18' },
  _scopeType: { stringValue: 'tracking' },
});

const run = async () => {
  const token = getToken();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Delete legacy root docs: ${deleteLegacy ? 'JA' : 'NEE'}`);

  const [rootDocs, scopedDocs] = await Promise.all([
    listDocs(token, TRACKING_BASE, 500),
    listDocs(token, TARGET_ITEMS_PATH, 500),
  ]);

  const scopedById = new Set();
  const scopedLotToDocId = new Map();

  scopedDocs.forEach((doc) => {
    const docId = extractDocId(doc.name, TARGET_ITEMS_PATH);
    if (!docId) return;
    scopedById.add(docId);

    const lot = normalizeLot(getStringField(doc.fields || {}, 'lotNumber'));
    if (!lot) return;
    if (!scopedLotToDocId.has(lot)) {
      scopedLotToDocId.set(lot, docId);
    }
  });

  let migrated = 0;
  let updatedExistingById = 0;
  let skippedLotConflict = 0;
  let skippedNonRoot = 0;

  const lotConflicts = [];

  for (const rootDoc of rootDocs) {
    const docId = extractDocId(rootDoc.name, TRACKING_BASE);
    if (!docId) {
      skippedNonRoot += 1;
      continue;
    }

    const fields = rootDoc.fields || {};
    const lot = normalizeLot(getStringField(fields, 'lotNumber'));
    const conflictDocId = lot ? scopedLotToDocId.get(lot) : '';

    if (conflictDocId && conflictDocId !== docId) {
      skippedLotConflict += 1;
      lotConflicts.push({ rootDocId: docId, lotNumber: lot, scopedDocId: conflictDocId });
      console.log(`[SKIP][LOT-CONFLICT] root=${docId} lot=${lot} bestaat al op scoped doc=${conflictDocId}`);
      continue;
    }

    const targetPath = `${TARGET_ITEMS_PATH}/${docId}`;
    const payload = withScopedFields(fields, docId);

    if (dryRun) {
      const mode = scopedById.has(docId) ? 'UPDATE-ID' : 'MOVE';
      console.log(`[DRY][${mode}] ${TRACKING_BASE}/${docId} -> ${targetPath}`);
      if (scopedById.has(docId)) updatedExistingById += 1;
      else migrated += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, `${TRACKING_BASE}/${docId}`);
    }

    if (scopedById.has(docId)) {
      updatedExistingById += 1;
      console.log(`[UPD][ID-MATCH] ${TRACKING_BASE}/${docId} -> ${targetPath}`);
    } else {
      migrated += 1;
      console.log(`[MIG][ROOT->SCOPED] ${TRACKING_BASE}/${docId} -> ${targetPath}`);
    }
  }

  console.log('\nSamenvatting');
  console.log(`- Gemigreerd (nieuw op scoped): ${migrated}`);
  console.log(`- Geüpdatet (docId bestond al op scoped): ${updatedExistingById}`);
  console.log(`- Overgeslagen lot-conflicts: ${skippedLotConflict}`);
  console.log(`- Overgeslagen non-root: ${skippedNonRoot}`);

  if (lotConflicts.length) {
    console.log('\nLot-conflicts (eerste 50):');
    lotConflicts.slice(0, 50).forEach((c) => {
      console.log(`  - root=${c.rootDocId} lot=${c.lotNumber} scoped=${c.scopedDocId}`);
    });
  }
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
