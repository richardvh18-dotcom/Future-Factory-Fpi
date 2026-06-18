#!/usr/bin/env node
/*
 * Archiveert handmatig twee afgedrukte producten die niet automatisch
 * gearchiveerd zijn doordat rejectTrackedProductFinalService een directe
 * flat-lookup deed in plaats van getTrackedProductDocByIdOrLot.
 *
 * Van:
 *   future-factory/production/tracked_products/Fittings/machines/40BH18/items/<id>
 * Naar:
 *   future-factory/production/archive/2026/rejected/<id>
 *
 * Standaard DRY-RUN. Gebruik --apply om écht te schrijven/verwijderen.
 *
 * Usage:
 *   node scripts/archive-stuck-rejected-via-cli-auth.cjs
 *   node scripts/archive-stuck-rejected-via-cli-auth.cjs --apply
 */

const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

const STUCK_ITEMS = [
  'future-factory/production/tracked_products/Fittings/machines/40BH18/items/N20024687_EL4MCSS0ER02A0BCCBB0_402614418400005',
  'future-factory/production/tracked_products/Fittings/machines/40BH18/items/N20024737_EL1MESS0JR00Q0BCCBB0_402614418400014',
];

const ARCHIVE_YEAR = new Date().getFullYear();
const ARCHIVE_BASE = `future-factory/production/archive/${ARCHIVE_YEAR}/rejected`;

// ── Firestore REST helpers ────────────────────────────────────────────────────

function getToken() {
  return execSync('firebase login:ci --no-localhost 2>/dev/null || gcloud auth print-access-token 2>/dev/null || firebase auth:export --format=json 2>/dev/null | head -1; gcloud auth application-default print-access-token 2>/dev/null || true')
    .toString()
    .trim()
    .split('\n')
    .find(line => line.startsWith('ya29') || line.startsWith('eyJ'));
}

function getCliToken() {
  try {
    const raw = execSync('gcloud auth application-default print-access-token 2>/dev/null').toString().trim();
    if (raw && raw.length > 10) return raw;
  } catch (_) {}
  try {
    const raw = execSync('firebase auth:print-identity-token 2>/dev/null').toString().trim();
    if (raw && raw.length > 10) return raw;
  } catch (_) {}
  // Fallback: gebruik firebase login token
  try {
    const raw = execSync('npx firebase-tools@latest login:ci --no-localhost 2>&1 | tail -1').toString().trim();
    if (raw && raw.length > 10) return raw;
  } catch (_) {}
  throw new Error('Kan geen access token ophalen. Zorg dat je ingelogd bent: gcloud auth application-default login of firebase login');
}

function firestoreRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const docPath = encodeURIComponent(path).replace(/%2F/g, '/');
    const url = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: 'firestore.googleapis.com',
      path: url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Converteer Firestore REST fields naar plain JS object
function fromFirestoreFields(fields = {}) {
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
}

function fromFirestoreValue(val) {
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue !== undefined) return null;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue !== undefined) return (val.arrayValue.values || []).map(fromFirestoreValue);
  if (val.mapValue !== undefined) return fromFirestoreFields(val.mapValue.fields || {});
  return null;
}

// Converteer plain JS object naar Firestore REST fields
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

function toFirestoreValue(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') return { mapValue: { fields: toFirestoreFields(val) } };
  return { stringValue: String(val) };
}

// ── Hoofd logica ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  Archive Stuck Rejected Tracked Products');
  console.log(`  Modus: ${DRY_RUN ? '🔍 DRY-RUN (geen wijzigingen)' : '✅ APPLY (live schrijven)'}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('Token ophalen...');
  let token;
  try {
    token = execSync('gcloud auth application-default print-access-token 2>/dev/null').toString().trim();
    if (!token || token.length < 10) throw new Error('empty');
    console.log('✓ Token via gcloud application-default\n');
  } catch (_) {
    try {
      token = execSync('gcloud auth print-access-token 2>/dev/null').toString().trim();
      if (!token || token.length < 10) throw new Error('empty');
      console.log('✓ Token via gcloud auth\n');
    } catch (_2) {
      console.error('❌ Geen access token. Log in via: gcloud auth application-default login');
      process.exit(1);
    }
  }

  let hasError = false;

  for (const fullPath of STUCK_ITEMS) {
    const docId = fullPath.split('/').pop();
    const archivePath = `${ARCHIVE_BASE}/${docId}`;

    console.log(`─── ${docId} ${'─'.repeat(Math.max(0, 55 - docId.length))}`);
    console.log(`  Van:  ${fullPath}`);
    console.log(`  Naar: ${archivePath}\n`);

    // 1. Lees het document
    const getRes = await firestoreRequest('GET', fullPath, null, token);
    if (getRes.status !== 200) {
      console.error(`  ❌ Niet gevonden (HTTP ${getRes.status}): ${JSON.stringify(getRes.body?.error?.message || getRes.body)}`);
      hasError = true;
      console.log();
      continue;
    }

    const originalData = fromFirestoreFields(getRes.body.fields || {});
    console.log(`  ✓ Document gevonden`);
    console.log(`    status      : ${originalData.status || '(geen)'}`);
    console.log(`    currentStep : ${originalData.currentStep || '(geen)'}`);
    console.log(`    lotNumber   : ${originalData.lotNumber || '(geen)'}`);
    console.log(`    orderId     : ${originalData.orderId || '(geen)'}`);
    console.log(`    machine     : ${originalData.machine || originalData.currentStation || '(geen)'}`);

    // 2. Controleer of al gearchiveerd
    const checkRes = await firestoreRequest('GET', archivePath, null, token);
    if (checkRes.status === 200) {
      console.log(`\n  ⚠️  Al aanwezig in archief — overgeslagen.\n`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`\n  🔍 DRY-RUN: zou archiveren en origineel verwijderen.\n`);
      continue;
    }

    // 3. Schrijf naar archief
    const now = new Date().toISOString();
    const archiveData = {
      ...originalData,
      status: 'Rejected',
      currentStep: 'REJECTED',
      currentStation: 'AFKEUR',
      archivedAt: now,
      archivedReason: 'rejected',
      archivedManually: true,
      archivedManuallyReason: 'Handmatige migratie: product zat vast door flat-lookup bug in rejectTrackedProductFinalService',
      updatedAt: now,
      history: [
        ...(Array.isArray(originalData.history) ? originalData.history : []),
        {
          action: 'Handmatig Gearchiveerd',
          timestamp: now,
          user: 'admin-migration-script',
          details: 'Migratiescript archive-stuck-rejected-via-cli-auth.cjs',
          station: originalData.currentStation || originalData.machine || 'Onbekend',
        },
      ],
    };

    const patchRes = await firestoreRequest(
      'PATCH',
      archivePath,
      { fields: toFirestoreFields(archiveData) },
      token
    );

    if (patchRes.status !== 200) {
      console.error(`  ❌ Archiveren mislukt (HTTP ${patchRes.status}): ${JSON.stringify(patchRes.body?.error?.message || patchRes.body)}`);
      hasError = true;
      console.log();
      continue;
    }
    console.log(`  ✓ Gearchiveerd naar ${archivePath}`);

    // 4. Verwijder origineel
    const deleteRes = await firestoreRequest('DELETE', fullPath, null, token);
    if (deleteRes.status !== 200 && deleteRes.status !== 204) {
      console.error(`  ❌ Verwijderen mislukt (HTTP ${deleteRes.status}): ${JSON.stringify(deleteRes.body?.error?.message || deleteRes.body)}`);
      console.error(`     Let op: archief is al aangemaakt. Verwijder origineel handmatig.`);
      hasError = true;
      console.log();
      continue;
    }
    console.log(`  ✓ Origineel verwijderd uit tracked_products\n`);
  }

  console.log('='.repeat(60));
  if (DRY_RUN) {
    console.log('  DRY-RUN klaar. Gebruik --apply om écht te migreren.');
  } else if (hasError) {
    console.log('  ⚠️  Klaar met FOUTEN. Controleer de output hierboven.');
  } else {
    console.log('  ✅ Migratie succesvol afgerond.');
  }
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('Fatale fout:', err.message);
  process.exit(1);
});
