#!/usr/bin/env node

/*
 * Ruim duplicaten op waar dezelfde doc zowel onder BH31 als 40BH31 staat.
 *
 * Scope:
 * - future-factory/production/digital_planning/Fittings/machines/BH31/orders
 * - future-factory/production/digital_planning/Fittings/machines/40BH31/orders
 * - future-factory/production/tracked_products/Fittings/machines/BH31/items
 * - future-factory/production/tracked_products/Fittings/machines/40BH31/items
 *
 * Gedrag:
 * - Alleen BH31-docs verwijderen als exact dezelfde docId al onder 40BH31 bestaat.
 * - Standaard DRY-RUN. Gebruik --apply om echt te verwijderen.
 *
 * Usage:
 *   node scripts/cleanup-bh31-duplicates-via-cli-auth.cjs
 *   node scripts/cleanup-bh31-duplicates-via-cli-auth.cjs --apply
 *   node scripts/cleanup-bh31-duplicates-via-cli-auth.cjs --only planning
 *   node scripts/cleanup-bh31-duplicates-via-cli-auth.cjs --only tracked
 *   FIREBASE_PROJECT_ID=future-factory-377ef node scripts/cleanup-bh31-duplicates-via-cli-auth.cjs --apply
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const migrateTracked = args.includes('--migrate-tracked');

const onlyIdx = args.indexOf('--only');
const onlyScope = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '').toLowerCase() : '';

if (onlyScope && !['planning', 'tracked'].includes(onlyScope)) {
  console.error("Ongeldige waarde voor --only. Gebruik 'planning' of 'tracked'.");
  process.exit(1);
}

const includePlanning = !onlyScope || onlyScope === 'planning';
const includeTracked = !onlyScope || onlyScope === 'tracked';

const PATHS = {
  planning: {
    bh31: 'future-factory/production/digital_planning/Fittings/machines/BH31/orders',
    bh31_40: 'future-factory/production/digital_planning/Fittings/machines/40BH31/orders',
  },
  tracked: {
    bh31: 'future-factory/production/tracked_products/Fittings/machines/BH31/items',
    bh31_40: 'future-factory/production/tracked_products/Fittings/machines/40BH31/items',
  },
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
  if (!fs.existsSync(configPath)) {
    return '';
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return String(parsed?.tokens?.access_token || '').trim();
};

const readFirebaseCliToken = () => {
  const cliToken = readTokenFromFirebaseCli();
  if (cliToken) return cliToken;

  const cfgToken = readTokenFromFirebaseConfig();
  if (cfgToken) return cfgToken;

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

const deleteDoc = async (token, docPath) => {
  await apiRequest('DELETE', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token);
};

const upsertDoc = async (token, docPath, fields) => {
  await apiRequest('PATCH', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`, token, {
    fields: fields || {},
  });
};

const runScope = async (token, scopeName, scopePaths) => {
  const bh31Docs = await listDocs(token, scopePaths.bh31);
  const bh31_40Docs = await listDocs(token, scopePaths.bh31_40);

  const bh31ById = new Map();
  for (const d of bh31Docs) {
    const id = extractDocId(d.name, scopePaths.bh31);
    if (id) bh31ById.set(id, d);
  }

  const bh31_40Ids = new Set();
  for (const d of bh31_40Docs) {
    const id = extractDocId(d.name, scopePaths.bh31_40);
    if (id) bh31_40Ids.add(id);
  }

  const duplicateIds = Array.from(bh31ById.keys()).filter((id) => bh31_40Ids.has(id));
  const moveCandidateIds =
    scopeName === 'tracked' && migrateTracked
      ? Array.from(bh31ById.keys()).filter((id) => !bh31_40Ids.has(id))
      : [];

  console.log(`\n[${scopeName}] BH31 docs: ${bh31ById.size}, 40BH31 docs: ${bh31_40Ids.size}, duplicaten: ${duplicateIds.length}${scopeName === 'tracked' && migrateTracked ? `, te verplaatsen: ${moveCandidateIds.length}` : ''}`);

  let deleted = 0;
  if (duplicateIds.length > 0) {
    for (const id of duplicateIds) {
      const docPath = `${scopePaths.bh31}/${id}`;
      if (dryRun) {
        console.log(`[DRY] delete ${docPath}`);
        continue;
      }
      await deleteDoc(token, docPath);
      deleted += 1;
      console.log(`[DEL] ${docPath}`);
    }
  }

  let moved = 0;
  if (moveCandidateIds.length > 0) {
    for (const id of moveCandidateIds) {
      const sourcePath = `${scopePaths.bh31}/${id}`;
      const targetPath = `${scopePaths.bh31_40}/${id}`;
      if (dryRun) {
        console.log(`[DRY] move ${sourcePath} -> ${targetPath}`);
        continue;
      }
      const sourceDoc = bh31ById.get(id);
      await upsertDoc(token, targetPath, sourceDoc?.fields || {});
      await deleteDoc(token, sourcePath);
      moved += 1;
      console.log(`[MOV] ${sourcePath} -> ${targetPath}`);
    }
  }

  return { scopeName, duplicates: duplicateIds.length, deleted, moved };
};

const run = async () => {
  const token = readFirebaseCliToken();

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Scopes: ${includePlanning ? 'planning ' : ''}${includeTracked ? 'tracked' : ''}`.trim());
  console.log(`Migrate tracked BH31->40BH31: ${migrateTracked ? 'JA' : 'NEE'}`);

  const results = [];

  if (includePlanning) {
    results.push(await runScope(token, 'planning', PATHS.planning));
  }
  if (includeTracked) {
    results.push(await runScope(token, 'tracked', PATHS.tracked));
  }

  const totalDuplicates = results.reduce((acc, r) => acc + r.duplicates, 0);
  const totalDeleted = results.reduce((acc, r) => acc + r.deleted, 0);
  const totalMoved = results.reduce((acc, r) => acc + (r.moved || 0), 0);

  console.log('\nSamenvatting');
  console.log(`- Duplicaten gevonden: ${totalDuplicates}`);
  console.log(`- Verwijderd: ${totalDeleted}`);
  console.log(`- Verplaatst: ${totalMoved}`);
  if (dryRun && totalDuplicates > 0) {
    console.log('\nVoer uit met --apply om deze BH31 duplicaten echt te verwijderen.');
  }
  if (dryRun && totalMoved > 0) {
    console.log('Voer uit met --apply --migrate-tracked om BH31 tracked docs naar 40BH31 te verplaatsen.');
  }
};

run().catch((err) => {
  console.error('Cleanup mislukt:', err.message);
  process.exit(1);
});
