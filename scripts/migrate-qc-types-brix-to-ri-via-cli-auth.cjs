#!/usr/bin/env node

/*
 * Migreert bestaande QC documenten van types/brix naar types/ri.
 *
 * Bronnen:
 *   /future-factory/production/qc_measurements/live/types/brix/items/{id}
 *   /future-factory/production/qc_records/live/types/brix/items/{id}
 *
 * Doelen:
 *   /future-factory/production/qc_measurements/live/types/ri/items/{id}
 *   /future-factory/production/qc_records/live/types/ri/items/{id}
 *
 * Standaardgedrag:
 * - dry-run (geen writes/deletes) tenzij --apply
 * - migreert zowel measurements als records (aanpasbaar via --scope)
 *
 * Usage:
 *   node scripts/migrate-qc-types-brix-to-ri-via-cli-auth.cjs
 *   node scripts/migrate-qc-types-brix-to-ri-via-cli-auth.cjs --apply
 *   node scripts/migrate-qc-types-brix-to-ri-via-cli-auth.cjs --apply --scope=measurements
 *
 * Opties:
 *   --apply              : voert writes/deletes echt uit
 *   --keep-source        : laat bronrecords op types/brix staan
 *   --scope=SCOPE        : all | measurements | records (default: all)
 *   --limit=NUMBER       : max docs per broncollectie (default 500)
 *   --project=PROJECT_ID : override project id
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const keepSource = args.includes('--keep-source');

const argValue = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length) || fallback;
};

const PROJECT_ID =
  argValue('project') ||
  process.env.FIREBASE_PROJECT_ID ||
  'future-factory-377ef';

const SCOPE = String(argValue('scope', 'all') || 'all').trim().toLowerCase();
const LIMIT = Math.min(Math.max(Number(argValue('limit', '500')) || 500, 1), 2000);

const SOURCES = {
  measurements: 'future-factory/production/qc_measurements/live/types/brix/items',
  records: 'future-factory/production/qc_records/live/types/brix/items',
};

const TARGETS = {
  measurements: 'future-factory/production/qc_measurements/live/types/ri/items',
  records: 'future-factory/production/qc_records/live/types/ri/items',
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
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return String(parsed?.tokens?.access_token || '').trim();
  } catch {
    return '';
  }
};

const readRefreshTokenFromFirebaseConfig = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return String(parsed?.tokens?.refresh_token || '').trim();
  } catch {
    return '';
  }
};

const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) return '';

  const payload = new URLSearchParams({
    client_id: process.env.FIREBASE_CLIENT_ID || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: process.env.FIREBASE_CLIENT_SECRET || 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            const token = String(parsed?.access_token || '').trim();
            resolve(token);
          } catch {
            resolve('');
          }
        });
      }
    );

    req.on('error', () => resolve(''));
    req.write(payload);
    req.end();
  });
};

const getToken = async () => {
  const refreshed = await refreshAccessToken(readRefreshTokenFromFirebaseConfig());
  const token = refreshed || readTokenFromFirebaseCli() || readTokenFromFirebaseConfig();
  if (!token) {
    throw new Error('Geen bruikbaar Firebase access token gevonden. Run eerst: firebase login');
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
              new Error(
                `${method} ${path} failed (${res.statusCode}): ${parsed?.error?.message || data}`
              )
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

const listDocs = async (token, collectionPath, limit = 500) => {
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=${limit}`;
  try {
    return await apiRequest('GET', path, token);
  } catch (err) {
    if (String(err.message || '').includes('(404)')) {
      return { documents: [] };
    }
    throw err;
  }
};

const patchDoc = async (token, docPath, fields) => {
  await apiRequest(
    'PATCH',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
    token,
    { fields: fields || {} }
  );
};

const deleteDoc = async (token, docPath) => {
  await apiRequest(
    'DELETE',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
    token
  );
};

const extractDocId = (fullName, collectionPath) => {
  const needle = `/documents/${collectionPath}/`;
  const idx = String(fullName || '').indexOf(needle);
  if (idx === -1) return '';
  const tail = fullName.slice(idx + needle.length);
  if (!tail || tail.includes('/')) return '';
  return tail;
};

const toStringField = (value) => ({ stringValue: String(value || '') });

const normalizeFieldsToRi = (fields) => {
  const next = { ...(fields || {}) };

  next.measurementType = toStringField('ri');
  next.recordType = toStringField('ri');

  if (next.type && typeof next.type === 'object' && 'stringValue' in next.type) {
    next.type = toStringField('ri');
  }

  if (!next.ri && next.brix) {
    next.ri = next.brix;
  }

  return next;
};

const shouldRunScope = (scopeName) => SCOPE === 'all' || SCOPE === scopeName;

const migrateScope = async (token, scopeName) => {
  const sourceCollection = SOURCES[scopeName];
  const targetCollection = TARGETS[scopeName];

  const list = await listDocs(token, sourceCollection, LIMIT);
  const docs = Array.isArray(list?.documents) ? list.documents : [];

  const candidates = docs
    .map((doc) => {
      const id = extractDocId(doc?.name || '', sourceCollection);
      return {
        id,
        sourceDocPath: `${sourceCollection}/${id}`,
        targetDocPath: `${targetCollection}/${id}`,
        fields: doc?.fields || {},
      };
    })
    .filter((doc) => doc.id);

  console.log(`Scope: ${scopeName}`);
  console.log(`- Broncollectie: ${sourceCollection}`);
  console.log(`- Gelezen docs: ${docs.length}`);
  console.log(`- Kandidaten: ${candidates.length}`);

  if (!candidates.length) {
    return { scanned: docs.length, migrated: 0, failed: 0 };
  }

  if (dryRun) {
    for (const item of candidates) {
      console.log(`  [DRY] ${item.id} -> ${item.targetDocPath}`);
    }
    return { scanned: docs.length, migrated: 0, failed: 0 };
  }

  let migrated = 0;
  let failed = 0;

  for (const item of candidates) {
    try {
      const normalizedFields = normalizeFieldsToRi(item.fields);
      await patchDoc(token, item.targetDocPath, normalizedFields);
      if (!keepSource) {
        await deleteDoc(token, item.sourceDocPath);
      }
      migrated += 1;
      console.log(`  [OK] ${item.id}`);
    } catch (error) {
      failed += 1;
      console.error(`  [FAIL] ${item.id}: ${error.message || error}`);
    }
  }

  return { scanned: docs.length, migrated, failed };
};

const main = async () => {
  if (!['all', 'measurements', 'records'].includes(SCOPE)) {
    throw new Error(`Ongeldige --scope waarde: ${SCOPE}. Gebruik all | measurements | records.`);
  }

  const token = await getToken();

  console.log('=== QC typed path migratie brix -> ri ===');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Scope: ${SCOPE}`);
  console.log(`Limit per scope: ${LIMIT}`);

  const totals = {
    scanned: 0,
    migrated: 0,
    failed: 0,
  };

  for (const scopeName of ['measurements', 'records']) {
    if (!shouldRunScope(scopeName)) continue;
    const result = await migrateScope(token, scopeName);
    totals.scanned += result.scanned;
    totals.migrated += result.migrated;
    totals.failed += result.failed;
  }

  console.log('=== Resultaat ===');
  console.log(`Scanned: ${totals.scanned}`);
  console.log(`Gemigreerd: ${totals.migrated}`);
  console.log(`Mislukt: ${totals.failed}`);
  console.log(`Bron behouden: ${keepSource ? 'ja' : 'nee'}`);
};

main().catch((error) => {
  console.error('Migratie afgebroken:', error.message || error);
  process.exit(1);
});
