#!/usr/bin/env node

/*
 * Cleanup voor duplicate planning-orders in:
 * future-factory/production/digital_planning/Fittings/machines/40BH18/orders
 *
 * Doel:
 * - Vind docs met kale order-id (bijv. N20024782) waar een prefix-variant bestaat
 *   (bijv. N20024782_EL4MEMS0FR0A10BCCBB0).
 * - Merge ontbrekende velden van kale doc -> prefix-doc.
 * - Verwijder daarna de kale doc.
 *
 * Veiligheid:
 * - Alleen gevallen met exact 1 prefix-kandidaat worden automatisch verwerkt.
 * - Standaard DRY-RUN. Gebruik --apply om echt te schrijven/verwijderen.
 *
 * Usage:
 *   node scripts/cleanup-40bh18-order-prefix-duplicates-via-cli-auth.cjs
 *   node scripts/cleanup-40bh18-order-prefix-duplicates-via-cli-auth.cjs --apply
 *   node scripts/cleanup-40bh18-order-prefix-duplicates-via-cli-auth.cjs --order N20024782
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const COLLECTION_PATH = 'future-factory/production/digital_planning/Fittings/machines/40BH18/orders';
const FIREBASE_OAUTH_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_OAUTH_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const orderIdx = args.indexOf('--order');
const onlyOrderId = orderIdx >= 0 ? String(args[orderIdx + 1] || '').trim().toUpperCase() : '';

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

const readTokenFromGcloud = () => {
  try {
    const token = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return String(token || '').trim();
  } catch (_err) {
    return '';
  }
};

const readTokenFromFirebaseConfig = () => {
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) {
    return '';
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return {
    accessToken: String(parsed?.tokens?.access_token || '').trim(),
    refreshToken: String(parsed?.tokens?.refresh_token || '').trim(),
  };
};

const refreshAccessToken = (refreshToken) =>
  new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: FIREBASE_OAUTH_CLIENT_ID,
      client_secret: FIREBASE_OAUTH_CLIENT_SECRET,
      refresh_token: String(refreshToken || '').trim(),
    }).toString();

    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          const token = String(parsed?.access_token || '').trim();
          if (res.statusCode >= 200 && res.statusCode < 300 && token) {
            resolve(token);
            return;
          }
          reject(
            new Error(`refresh token exchange failed (${res.statusCode}): ${parsed?.error_description || parsed?.error || data}`)
          );
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });

const readFirebaseCliToken = async () => {
  const gcloudToken = readTokenFromGcloud();
  if (gcloudToken) return gcloudToken;

  const cfgTokens = readTokenFromFirebaseConfig();
  if (cfgTokens?.refreshToken) {
    return refreshAccessToken(cfgTokens.refreshToken);
  }

  const cliToken = readTokenFromFirebaseCli();
  if (cliToken) return cliToken;

  if (cfgTokens?.accessToken) return cfgTokens.accessToken;

  throw new Error('Geen bruikbaar Firebase access_token gevonden. Run eerst: firebase login');
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

const listDocs = async (token, collectionPath) => {
  const docs = [];
  let pageToken = '';

  do {
    const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=300${qp}`;
    const response = await apiRequest('GET', path, token);
    const pageDocs = Array.isArray(response.documents) ? response.documents : [];
    docs.push(...pageDocs);
    pageToken = response.nextPageToken || '';
  } while (pageToken);

  return docs;
};

const extractDocId = (fullName, collectionPath) => {
  const needle = `/documents/${collectionPath}/`;
  const idx = String(fullName || '').indexOf(needle);
  if (idx === -1) return '';
  const maybeId = fullName.slice(idx + needle.length);
  if (!maybeId || maybeId.includes('/')) return '';
  return maybeId;
};

const patchDoc = async (token, docPath, fields) => {
  await apiRequest('PATCH', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token, {
    fields: fields || {},
  });
};

const deleteDoc = async (token, docPath) => {
  await apiRequest('DELETE', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token);
};

const normalizeOrderId = (value) => String(value || '').trim().toUpperCase();

const isEmptyFieldValue = (value) => {
  if (!value || typeof value !== 'object') return true;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return true;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return String(value.stringValue || '').trim() === '';
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const arr = value.arrayValue?.values;
    return !Array.isArray(arr) || arr.length === 0;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    const fields = value.mapValue?.fields;
    return !fields || Object.keys(fields).length === 0;
  }
  return false;
};

const mergeFieldsPreferTarget = (targetFields, sourceFields) => {
  const merged = { ...(targetFields || {}) };
  const source = sourceFields || {};
  let injected = 0;

  for (const [key, sourceValue] of Object.entries(source)) {
    const currentValue = merged[key];
    if (currentValue === undefined || isEmptyFieldValue(currentValue)) {
      merged[key] = sourceValue;
      injected += 1;
    }
  }

  return { merged, injected };
};

const run = async () => {
  const token = await readFirebaseCliToken();
  const docs = await listDocs(token, COLLECTION_PATH);

  const byId = new Map();
  for (const doc of docs) {
    const id = extractDocId(doc.name, COLLECTION_PATH);
    if (!id) continue;
    byId.set(id, doc);
  }

  const allIds = Array.from(byId.keys());
  const bareIds = allIds.filter((id) => !id.includes('_'));

  const plans = [];
  for (const bareId of bareIds) {
    const normalizedBare = normalizeOrderId(bareId);
    if (!normalizedBare) continue;
    if (onlyOrderId && normalizedBare !== onlyOrderId) continue;

    const prefixedMatches = allIds.filter((candidateId) => {
      if (!candidateId.includes('_')) return false;
      return normalizeOrderId(candidateId.split('_')[0]) === normalizedBare;
    });

    if (prefixedMatches.length !== 1) continue;

    const targetId = prefixedMatches[0];
    const sourceDoc = byId.get(bareId);
    const targetDoc = byId.get(targetId);
    if (!sourceDoc || !targetDoc) continue;

    const sourceFields = sourceDoc.fields || {};
    const targetFields = targetDoc.fields || {};
    const { merged, injected } = mergeFieldsPreferTarget(targetFields, sourceFields);

    plans.push({
      bareId,
      targetId,
      barePath: `${COLLECTION_PATH}/${bareId}`,
      targetPath: `${COLLECTION_PATH}/${targetId}`,
      mergedFields: merged,
      injected,
    });
  }

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Collection: ${COLLECTION_PATH}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Bare docs: ${bareIds.length}`);
  console.log(`Kandidaten voor merge+delete: ${plans.length}`);

  if (plans.length === 0) {
    console.log('Geen eenduidige duplicate-paren gevonden.');
    return;
  }

  let patched = 0;
  let deleted = 0;

  for (const plan of plans) {
    console.log(`\n[PAIR] ${plan.bareId} -> ${plan.targetId} (velden aangevuld: ${plan.injected})`);

    if (dryRun) {
      console.log(`[DRY] patch ${plan.targetPath}`);
      console.log(`[DRY] delete ${plan.barePath}`);
      continue;
    }

    await patchDoc(token, plan.targetPath, plan.mergedFields);
    patched += 1;
    console.log(`[PATCH] ${plan.targetPath}`);

    await deleteDoc(token, plan.barePath);
    deleted += 1;
    console.log(`[DEL] ${plan.barePath}`);
  }

  console.log('\nSamenvatting');
  console.log(`- Paren verwerkt: ${plans.length}`);
  console.log(`- Geüpdatete prefix-docs: ${patched}`);
  console.log(`- Verwijderde kale docs: ${deleted}`);
  if (dryRun) {
    console.log('\nGebruik --apply om dit echt uit te voeren.');
  }
};

run().catch((err) => {
  console.error('Cleanup mislukt:', err.message);
  process.exit(1);
});
