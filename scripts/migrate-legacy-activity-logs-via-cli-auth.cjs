#!/usr/bin/env node

/*
 * Eenmalige migratie van legacy activity logs naar audit logs via Firebase CLI auth token.
 *
 * Bron:
 *   /future-factory/logs/activity_logs/{logId}
 * Doel:
 *   /future-factory/audit/logs/legacy_{logId}
 *
 * Standaardgedrag:
 * - dry-run (geen writes/deletes) tenzij --apply
 * - bij --apply worden bronlogs standaard verwijderd
 *
 * Usage:
 *   node scripts/migrate-legacy-activity-logs-via-cli-auth.cjs
 *   node scripts/migrate-legacy-activity-logs-via-cli-auth.cjs --apply
 *   node scripts/migrate-legacy-activity-logs-via-cli-auth.cjs --apply --keep-source
 *
 * Opties:
 *   --apply              : voert writes/deletes echt uit
 *   --keep-source        : laat bronlogs staan (alleen kopie)
 *   --page-size=NUMBER   : aantal docs per batch (default 300, max 500)
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
const PAGE_SIZE = Math.min(Math.max(Number(argValue('page-size', '300')) || 300, 1), 500);

const SOURCE_COLLECTION_PATH = 'future-factory/logs/activity_logs';
const TARGET_COLLECTION_PATH = 'future-factory/audit/logs';

const clampText = (value, max = 4000) => {
  const text = String(value || '');
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const readFreshTokenFromFirebaseCli = () => {
  try {
    return String(
      execSync('firebase auth:print-access-token', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) || ''
    ).trim();
  } catch {
    return '';
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
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return '';
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return String(parsed?.tokens?.access_token || '').trim();
  } catch {
    return '';
  }
};

const getToken = () => {
  const token =
    readFreshTokenFromFirebaseCli() ||
    readTokenFromFirebaseCli() ||
    readTokenFromFirebaseConfig();

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

const listDocsPage = async (token, collectionPath, pageSize = 300, pageToken = '') => {
  const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=${pageSize}${qp}`;
  try {
    return await apiRequest('GET', path, token);
  } catch (err) {
    if (String(err.message || '').includes('(404)')) {
      return { documents: [], nextPageToken: '' };
    }
    throw err;
  }
};

const getDoc = async (token, docPath) => {
  try {
    return await apiRequest(
      'GET',
      `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
      token
    );
  } catch (err) {
    if (String(err.message || '').includes('(404)')) return null;
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

const getFieldString = (fields, key, fallback = '') => {
  const v = fields?.[key];
  if (!v || typeof v !== 'object') return fallback;
  if (typeof v.stringValue === 'string') return v.stringValue;
  if (typeof v.integerValue === 'string' || typeof v.integerValue === 'number') return String(v.integerValue);
  if (typeof v.doubleValue === 'number') return String(v.doubleValue);
  if (typeof v.booleanValue === 'boolean') return String(v.booleanValue);
  if (typeof v.timestampValue === 'string') return v.timestampValue;
  return fallback;
};

const firestoreValueToJs = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.booleanValue !== undefined) return Boolean(value.booleanValue);
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue !== undefined) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((entry) => firestoreValueToJs(entry));
  }
  if (value.mapValue !== undefined) {
    const entries = value.mapValue?.fields || {};
    const out = {};
    for (const [k, v] of Object.entries(entries)) {
      out[k] = firestoreValueToJs(v);
    }
    return out;
  }
  return null;
};

const normalizeDateForPartition = (timestampValue) => {
  const now = new Date();
  let d = now;

  if (timestampValue && typeof timestampValue === 'string') {
    const parsed = new Date(timestampValue);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, yearMonth };
};

const readLegacyDetailsMessage = (fields) => {
  const detailsVal = fields?.details;
  if (!detailsVal) return '';

  if (typeof detailsVal.stringValue === 'string') return clampText(detailsVal.stringValue, 4000);

  if (detailsVal.mapValue?.fields?.message?.stringValue) {
    return clampText(detailsVal.mapValue.fields.message.stringValue, 4000);
  }

  return clampText(JSON.stringify(firestoreValueToJs(detailsVal) || {}), 4000);
};

const buildMappedAuditFields = (sourceDocId, legacyFields) => {
  const nowIso = new Date().toISOString();
  const timestampValue =
    typeof legacyFields?.timestamp?.timestampValue === 'string'
      ? legacyFields.timestamp.timestampValue
      : null;

  const { year, month, yearMonth } = normalizeDateForPartition(timestampValue);
  const detailsMessage = readLegacyDetailsMessage(legacyFields);

  const changesValue = legacyFields?.changes && typeof legacyFields.changes === 'object'
    ? legacyFields.changes
    : { nullValue: null };

  return {
    timestamp: timestampValue
      ? { timestampValue }
      : { timestampValue: nowIso },
    userId: { stringValue: getFieldString(legacyFields, 'userId', 'legacy') || 'legacy' },
    userEmail: (() => {
      const value = getFieldString(legacyFields, 'userEmail', '');
      return value ? { stringValue: value } : { nullValue: null };
    })(),
    action: {
      stringValue: getFieldString(legacyFields, 'action', 'LEGACY_ACTIVITY_LOG') || 'LEGACY_ACTIVITY_LOG',
    },
    category: { stringValue: 'SYSTEM' },
    severity: {
      stringValue:
        String(getFieldString(legacyFields, 'status', '')).toUpperCase() === 'FAILED'
          ? 'WARNING'
          : 'INFO',
    },
    year: { integerValue: String(year) },
    month: { integerValue: String(month) },
    yearMonth: { stringValue: yearMonth },
    details: {
      mapValue: {
        fields: {
          legacy: { booleanValue: true },
          legacyPath: { stringValue: SOURCE_COLLECTION_PATH },
          legacyLogId: { stringValue: sourceDocId },
          message: detailsMessage ? { stringValue: detailsMessage } : { nullValue: null },
          source: (() => {
            const value = getFieldString(legacyFields, 'source', '');
            return value ? { stringValue: value } : { nullValue: null };
          })(),
          ipAddress: (() => {
            const value = getFieldString(legacyFields, 'ipAddress', '');
            return value ? { stringValue: value } : { nullValue: null };
          })(),
          status: (() => {
            const value = getFieldString(legacyFields, 'status', '');
            return value ? { stringValue: value } : { nullValue: null };
          })(),
          changes: changesValue,
        },
      },
    },
    migratedAt: { timestampValue: nowIso },
    migratedBy: { stringValue: 'cli-script' },
  };
};

const processDoc = async (token, sourceDoc, counters) => {
  const sourceDocId = extractDocId(sourceDoc?.name || '', SOURCE_COLLECTION_PATH);
  if (!sourceDocId) return;

  const targetDocId = `legacy_${sourceDocId}`;
  const targetDocPath = `${TARGET_COLLECTION_PATH}/${targetDocId}`;
  const sourceDocPath = `${SOURCE_COLLECTION_PATH}/${sourceDocId}`;

  counters.scanned += 1;

  const existingTarget = await getDoc(token, targetDocPath);
  if (!existingTarget) {
    counters.migrated += 1;
    if (!dryRun) {
      const mappedFields = buildMappedAuditFields(sourceDocId, sourceDoc.fields || {});
      await patchDoc(token, targetDocPath, mappedFields);
    }
  } else {
    counters.skipped += 1;
  }

  if (!dryRun && !keepSource) {
    await deleteDoc(token, sourceDocPath);
    counters.deleted += 1;
  }
};

const runWithDeletion = async (token, counters) => {
  while (true) {
    const page = await listDocsPage(token, SOURCE_COLLECTION_PATH, PAGE_SIZE, '');
    const docs = Array.isArray(page.documents) ? page.documents : [];
    if (docs.length === 0) break;

    for (const sourceDoc of docs) {
      await processDoc(token, sourceDoc, counters);
    }

    process.stdout.write(`\rVerwerkt: ${counters.scanned} | Gemigreerd: ${counters.migrated} | Overgeslagen: ${counters.skipped} | Verwijderd: ${counters.deleted}`);
  }
};

const runWithoutDeletion = async (token, counters) => {
  let pageToken = '';
  do {
    const page = await listDocsPage(token, SOURCE_COLLECTION_PATH, PAGE_SIZE, pageToken);
    const docs = Array.isArray(page.documents) ? page.documents : [];

    for (const sourceDoc of docs) {
      await processDoc(token, sourceDoc, counters);
    }

    pageToken = page.nextPageToken || '';
    process.stdout.write(`\rVerwerkt: ${counters.scanned} | Gemigreerd: ${counters.migrated} | Overgeslagen: ${counters.skipped} | Verwijderd: ${counters.deleted}`);
  } while (pageToken);
};

(async () => {
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';
  const token = getToken();

  const counters = {
    scanned: 0,
    migrated: 0,
    skipped: 0,
    deleted: 0,
  };

  console.log(`Start migratie legacy logs (${mode})`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Bron: ${SOURCE_COLLECTION_PATH}`);
  console.log(`Doel: ${TARGET_COLLECTION_PATH}`);
  console.log(`Batch size: ${PAGE_SIZE}`);
  console.log(`Bron verwijderen: ${dryRun ? 'nee (dry-run)' : keepSource ? 'nee' : 'ja'}`);

  if (dryRun || keepSource) {
    await runWithoutDeletion(token, counters);
  } else {
    await runWithDeletion(token, counters);
  }

  console.log('\nKlaar.');
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        dryRun,
        keepSource,
        projectId: PROJECT_ID,
        ...counters,
      },
      null,
      2
    )
  );
})().catch((err) => {
  console.error('\nMigratie mislukt:', err?.message || err);
  process.exitCode = 1;
});
