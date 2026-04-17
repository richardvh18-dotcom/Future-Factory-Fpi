#!/usr/bin/env node

/*
 * Verplaatst root planning-docs naar scoped machinepad:
 *   /future-factory/production/digital_planning/Fittings/machines/40BH18/orders/{orderId}
 *
 * Root bron:
 *   /future-factory/production/digital_planning/{orderId}
 *
 * Usage:
 *   node scripts/migrate-planning-root-to-40BH18-scoped-via-cli-auth.cjs
 *   node scripts/migrate-planning-root-to-40BH18-scoped-via-cli-auth.cjs --apply
 *   node scripts/migrate-planning-root-to-40BH18-scoped-via-cli-auth.cjs --apply --delete-legacy
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const PLANNING_BASE = 'future-factory/production/digital_planning';
const TARGET_DEPARTMENT = 'Fittings';
const TARGET_MACHINE = '40BH18';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const deleteLegacy = args.includes('--delete-legacy');

const touchFirebaseSession = () => {
  try {
    execSync('firebase projects:list --json > /tmp/fb-projects-migration.json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Best effort om token te refreshen.
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

const withScopedFields = (fields, docId) => ({
  ...(fields || {}),
  id: { stringValue: docId },
  departmentId: { stringValue: TARGET_DEPARTMENT },
  department: { stringValue: TARGET_DEPARTMENT },
  machineId: { stringValue: TARGET_MACHINE },
  machine: { stringValue: TARGET_MACHINE },
  _scopeType: { stringValue: 'planning_order' },
});

const run = async () => {
  const token = getToken();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Delete legacy root docs: ${deleteLegacy ? 'JA' : 'NEE'}`);

  const docs = await listDocs(token, PLANNING_BASE, 500);

  let migrated = 0;
  let skippedNonRoot = 0;

  for (const doc of docs) {
    const docId = extractDocId(doc.name, PLANNING_BASE);
    if (!docId) {
      skippedNonRoot += 1;
      continue;
    }

    const targetPath = `${PLANNING_BASE}/${TARGET_DEPARTMENT}/machines/${TARGET_MACHINE}/orders/${docId}`;
    const payload = withScopedFields(doc.fields || {}, docId);

    if (dryRun) {
      console.log(`[DRY][ROOT->SCOPED] ${PLANNING_BASE}/${docId} -> ${targetPath}`);
      migrated += 1;
      continue;
    }

    await patchDoc(token, targetPath, payload);
    if (deleteLegacy) {
      await deleteDoc(token, `${PLANNING_BASE}/${docId}`);
    }

    console.log(`[MIG][ROOT->SCOPED] ${PLANNING_BASE}/${docId} -> ${targetPath}`);
    migrated += 1;
  }

  console.log('\nSamenvatting');
  console.log(`- Gemigreerde root planning docs: ${migrated}`);
  console.log(`- Overgeslagen (geen root doc): ${skippedNonRoot}`);
};

run().catch((err) => {
  console.error('Migratie mislukt:', err.message);
  process.exit(1);
});
