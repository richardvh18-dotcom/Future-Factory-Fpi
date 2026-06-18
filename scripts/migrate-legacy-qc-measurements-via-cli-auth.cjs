#!/usr/bin/env node

/*
 * Eenmalige migratie van legacy QC metingen naar de nieuwe type-gescheiden paden.
 *
 * Bron:
 *   /future-factory/production/qc_measurements/{measurementId}
 *
 * Doel:
 *   /future-factory/production/qc_measurements/live/types/{type}/items/{measurementId}
 *   /future-factory/production/qc_records/live/types/{type}/items/{measurementId}
 *
 * Standaardgedrag:
 * - dry-run (geen writes/deletes) tenzij --apply
 * - migreert standaard alleen type=brix (aanpasbaar via --type)
 *
 * Usage:
 *   node scripts/migrate-legacy-qc-measurements-via-cli-auth.cjs
 *   node scripts/migrate-legacy-qc-measurements-via-cli-auth.cjs --apply
 *   node scripts/migrate-legacy-qc-measurements-via-cli-auth.cjs --apply --type=all
 *
 * Opties:
 *   --apply              : voert writes/deletes echt uit
 *   --keep-source        : laat bronrecords staan
 *   --type=TYPE          : brix | tg | all (default: brix)
 *   --limit=NUMBER       : max docs uit legacy root lezen (default 100)
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

const TYPE_FILTER = String(argValue('type', 'brix') || 'brix').trim().toLowerCase();
const LIMIT = Math.min(Math.max(Number(argValue('limit', '100')) || 100, 1), 500);

const LEGACY_COLLECTION_PATH = 'future-factory/production/qc_measurements';

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

const listDocs = async (token, collectionPath, limit = 100) => {
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

const getString = (fields, key, fallback = '') => {
  const val = fields?.[key];
  if (!val || typeof val !== 'object') return fallback;
  if (typeof val.stringValue === 'string') return val.stringValue;
  return fallback;
};

const resolveType = (fields) => {
  const rawType = getString(fields, 'measurementType', '').trim().toLowerCase();
  if (rawType === 'brix' || rawType === 'tg') return rawType;

  const tile = getString(fields, 'tile', '').trim().toLowerCase();
  if (tile === 'tg') return 'tg';
  if (tile === 'brix' || tile === 'lab' || !tile) return 'brix';

  return 'brix';
};

const typeAllowed = (resolvedType) => {
  if (TYPE_FILTER === 'all') return true;
  return resolvedType === TYPE_FILTER;
};

const main = async () => {
  const token = await getToken();
  const list = await listDocs(token, LEGACY_COLLECTION_PATH, LIMIT);
  const docs = Array.isArray(list?.documents) ? list.documents : [];

  const candidates = docs
    .map((doc) => {
      const id = extractDocId(doc?.name || '', LEGACY_COLLECTION_PATH);
      const fields = doc?.fields || {};
      const resolvedType = resolveType(fields);
      return {
        id,
        name: doc?.name || '',
        fields,
        resolvedType,
        lotNumber: getString(fields, 'lotNumber', ''),
        measuredAt: getString(fields, 'measuredAt', ''),
      };
    })
    .filter((doc) => doc.id && typeAllowed(doc.resolvedType));

  console.log('=== Legacy QC meting migratie ===');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Bron docs gelezen: ${docs.length}`);
  console.log(`Kandidaten (${TYPE_FILTER}): ${candidates.length}`);

  if (!candidates.length) {
    console.log('Geen kandidaten gevonden.');
    return;
  }

  for (const item of candidates) {
    console.log(`- ${item.id} | type=${item.resolvedType} | lot=${item.lotNumber || '-'} | measuredAt=${item.measuredAt || '-'}`);
  }

  if (dryRun) {
    console.log('Dry-run klaar. Geen writes/deletes uitgevoerd.');
    return;
  }

  let moved = 0;
  let failed = 0;

  for (const item of candidates) {
    try {
      const targetType = item.resolvedType;
      const targetMeasurementPath = `future-factory/production/qc_measurements/live/types/${targetType}/items/${item.id}`;
      const targetRecordPath = `future-factory/production/qc_records/live/types/${targetType}/items/${item.id}`;
      const sourceDocPath = `${LEGACY_COLLECTION_PATH}/${item.id}`;

      await patchDoc(token, targetMeasurementPath, item.fields);
      await patchDoc(token, targetRecordPath, item.fields);
      if (!keepSource) {
        await deleteDoc(token, sourceDocPath);
      }

      moved += 1;
      console.log(`[OK] ${item.id} -> type=${targetType}`);
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${item.id}: ${error.message || error}`);
    }
  }

  console.log('=== Resultaat ===');
  console.log(`Gemigreerd: ${moved}`);
  console.log(`Mislukt: ${failed}`);
  console.log(`Bron behouden: ${keepSource ? 'ja' : 'nee'}`);
};

main().catch((error) => {
  console.error('Migratie afgebroken:', error.message || error);
  process.exit(1);
});
