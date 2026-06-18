#!/usr/bin/env node

/*
 * Ruimt wees-documenten op voor orders die al in het archief staan maar
 * nog steeds bestaan in de scoped 40BH18 collecties.
 *
 * Scope (verwijderen):
 *   future-factory/production/digital_planning/Fittings/machines/40BH18/orders/{docId}
 *   future-factory/production/tracked_products/Fittings/machines/40BH18/items/{docId}
 *
 * Criteria voor verwijderen:
 *   - Er bestaat al een doc in  future-factory/production/archive/{year}/planning/{docId}
 *     (voor enig jaar 2023-2026), OF
 *   - Het doc heeft status "completed" / "archived" / "gereed" EN
 *     geen actieve tracked lots meer (geen items met status != completed/archived)
 *
 * Standaard DRY-RUN. Gebruik --apply om echt te verwijderen.
 *
 * Usage:
 *   node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs
 *   node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs --apply
 *   node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs --apply --only planning
 *   node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs --apply --only tracked
 *   node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs --apply --order=N20024974
 */

'use strict';

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

// ─────────────────────────────── args ───────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

const argValue = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) || fallback : fallback;
};

const onlyIdx = args.indexOf('--only');
const onlyScope = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '').toLowerCase() : '';
if (onlyScope && !['planning', 'tracked'].includes(onlyScope)) {
  console.error("Ongeldige waarde voor --only. Gebruik 'planning' of 'tracked'.");
  process.exit(1);
}

const includePlanning = !onlyScope || onlyScope === 'planning';
const includeTracked  = !onlyScope || onlyScope === 'tracked';
const FILTER_ORDER    = argValue('order', '');
const PROJECT_ID      = argValue('project') || process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';

// ─────────────────────────── Firestore paths ────────────────────────────────
const BASE           = 'future-factory';
const PLANNING_BH18  = `${BASE}/production/digital_planning/Fittings/machines/40BH18/orders`;
const TRACKED_BH18   = `${BASE}/production/tracked_products/Fittings/machines/40BH18/items`;
// Ook root tracked_products (legacy docs zonder scoped pad)
const TRACKED_ROOT   = `${BASE}/production/tracked_products`;
// Archief jaren om te checken
const ARCHIVE_YEARS  = [2023, 2024, 2025, 2026];
const archivePlanningPath = (year) => `${BASE}/production/archive/${year}/planning`;
const archiveItemsPath    = (year) => `${BASE}/production/archive/${year}/items`;

// ─────────────────────────── token helpers ──────────────────────────────────
const readFreshToken = () => {
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

const readTokenFromConfig = () => {
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
  const token = readFreshToken() || readTokenFromConfig();
  if (!token) {
    throw new Error('Geen bruikbaar Firebase access_token gevonden. Run eerst: firebase login');
  }
  return token;
};

// ─────────────────────────── REST helpers ───────────────────────────────────
const DB_PREFIX = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          const parsed = data ? (() => { try { return JSON.parse(data); } catch { return {}; } })() : {};
          if (!ok) {
            if (res.statusCode === 404) return resolve(null);
            return reject(new Error(`${method} ${path} → HTTP ${res.statusCode}: ${parsed?.error?.message || data}`));
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

/** Pagineer door een collection, geeft array van Firestore doc-objecten terug. */
const listAllDocs = async (token, collectionPath) => {
  const docs = [];
  let pageToken = '';
  do {
    const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const path = `${DB_PREFIX}/${collectionPath}?pageSize=300${qp}`;
    const response = await apiRequest('GET', path, token);
    if (!response) break;
    if (Array.isArray(response.documents)) docs.push(...response.documents);
    pageToken = response.nextPageToken || '';
  } while (pageToken);
  return docs;
};

/** Haal één doc op; geeft null terug als 404. */
const getDoc = async (token, docPath) => apiRequest('GET', `${DB_PREFIX}/${docPath}`, token);

/** Verwijder een doc. */
const deleteDoc = async (token, docPath) => {
  await apiRequest('DELETE', `${DB_PREFIX}/${docPath}`, token);
};

// ─────────────────────────── Firestore value helpers ────────────────────────
const strVal = (field) => {
  if (!field) return '';
  if (field.stringValue !== undefined) return String(field.stringValue || '');
  if (field.integerValue !== undefined) return String(field.integerValue || '');
  if (field.doubleValue !== undefined) return String(field.doubleValue || '');
  return '';
};

const extractDocId = (fullName, collectionPath) => {
  const needle = `/documents/${collectionPath}/`;
  const idx = String(fullName || '').indexOf(needle);
  if (idx === -1) return '';
  const rest = fullName.slice(idx + needle.length);
  // Alleen direct child (geen sub-collections)
  if (rest.includes('/')) return '';
  return rest;
};

/** Haal orderId uit een tracked-product doc (veld orderId of orderNumber of uit docId). */
const getOrderIdFromTrackedDoc = (doc) => {
  const fields = doc.fields || {};
  const fromField = strVal(fields.orderId) || strVal(fields.orderNumber);
  if (fromField) return fromField;
  // Fallback: docId begint vaak met orderId (bijv. N20024974_...)
  const name = String(doc.name || '');
  const parts = name.split('/');
  const docId = parts[parts.length - 1] || '';
  const match = docId.match(/^(N\d+)/i);
  return match ? match[1] : '';
};

const COMPLETED_STATUSES = new Set([
  'completed', 'archived', 'gereed', 'finished', 'done', 'afgesloten',
]);

const isCompletedStatus = (statusStr) =>
  COMPLETED_STATUSES.has(String(statusStr || '').toLowerCase().trim());

// ─────────────────────────── main ───────────────────────────────────────────
const main = async () => {
  console.log(`\n=== cleanup-archived-orphans-40bh18 ===`);
  console.log(`Project : ${PROJECT_ID}`);
  console.log(`Mode    : ${DRY_RUN ? 'DRY-RUN (geen schrijfoperaties)' : '** APPLY — documenten worden verwijderd **'}`);
  if (onlyScope) console.log(`Scope   : ${onlyScope}`);
  if (FILTER_ORDER) console.log(`Filter  : orderId = ${FILTER_ORDER}`);
  console.log('');

  const token = getToken();

  // ── Stap 1: Laad alle archief planning-docIds (alle jaren) ────────────────
  console.log('Stap 1: Archief planning-docIds laden...');
  const archivedPlanningDocIds = new Set();  // docIds die al in archief staan
  const archivedOrderIds = new Set();         // orderIds die al in archief staan

  for (const year of ARCHIVE_YEARS) {
    const archiveDocs = await listAllDocs(token, archivePlanningPath(year));
    for (const doc of archiveDocs) {
      const docId = extractDocId(doc.name, archivePlanningPath(year));
      if (docId) {
        archivedPlanningDocIds.add(docId);
        // Extraheer orderId uit het archief-doc (veld orderId of orderNumber)
        const fields = doc.fields || {};
        const orderId = strVal(fields.orderId) || strVal(fields.orderNumber);
        if (orderId) archivedOrderIds.add(orderId);
        // Fallback: prefix van docId
        const match = docId.match(/^(N\d+)/i);
        if (match) archivedOrderIds.add(match[1]);
      }
    }
    if (archiveDocs.length > 0) {
      console.log(`  Archief ${year}/planning: ${archiveDocs.length} docs`);
    }
  }
  console.log(`  Totaal gearchiveerde planning-docIds: ${archivedPlanningDocIds.size}`);
  console.log(`  Totaal gearchiveerde orderIds: ${archivedOrderIds.size}`);

  // ── Stap 2: Verwerk scoped 40BH18 planning-docs ───────────────────────────
  let planningDeleted = 0;
  let planningSkipped = 0;

  if (includePlanning) {
    console.log('\nStap 2: Scoped planning-docs (40BH18) controleren...');
    const planningDocs = await listAllDocs(token, PLANNING_BH18);
    console.log(`  Gevonden: ${planningDocs.length} docs in ${PLANNING_BH18}`);

    for (const doc of planningDocs) {
      const docId = extractDocId(doc.name, PLANNING_BH18);
      if (!docId) continue;

      const fields = doc.fields || {};
      const orderId = strVal(fields.orderId) || strVal(fields.orderNumber) || '';
      const status  = strVal(fields.status);

      // Order-ID filter
      if (FILTER_ORDER && orderId !== FILTER_ORDER && !docId.startsWith(FILTER_ORDER)) {
        continue;
      }

      // Criterium A: docId staat al in archief
      const inArchiveByDocId = archivedPlanningDocIds.has(docId);

      // Criterium B: orderId staat al in archief
      const orderIdPrefix = orderId || (docId.match(/^(N\d+)/i) || [])[1] || '';
      const inArchiveByOrderId = orderIdPrefix ? archivedOrderIds.has(orderIdPrefix) : false;

      // Criterium C: status is compleet/gearchiveerd
      const hasCompletedStatus = isCompletedStatus(status);

      const shouldDelete = inArchiveByDocId || inArchiveByOrderId || hasCompletedStatus;

      const reason = inArchiveByDocId    ? 'docId in archief'
                   : inArchiveByOrderId  ? `orderId ${orderIdPrefix} in archief`
                   : hasCompletedStatus  ? `status="${status}"`
                   : '—';

      if (!shouldDelete) {
        planningSkipped++;
        continue;
      }

      const docPath = `${PLANNING_BH18}/${docId}`;
      if (DRY_RUN) {
        console.log(`  [DRY] delete planning  ${docId}  (${reason})`);
      } else {
        await deleteDoc(token, docPath);
        console.log(`  [DEL] ${docPath}  (${reason})`);
        planningDeleted++;
      }
      if (DRY_RUN) planningDeleted++;
    }

    console.log(`  Planning: ${planningDeleted} te verwijderen, ${planningSkipped} overgeslagen`);
  }

  // ── Stap 3: Verwerk scoped 40BH18 tracked items ───────────────────────────
  let trackedDeleted = 0;
  let trackedSkipped = 0;

  if (includeTracked) {
    console.log('\nStap 3: Scoped tracked-items (40BH18) controleren...');
    const trackedDocs = await listAllDocs(token, TRACKED_BH18);
    console.log(`  Gevonden: ${trackedDocs.length} docs in ${TRACKED_BH18}`);

    // Laad ook archief items-docIds (voor criterium A op tracked docs)
    const archivedItemDocIds = new Set();
    for (const year of ARCHIVE_YEARS) {
      const archiveItems = await listAllDocs(token, archiveItemsPath(year));
      for (const doc of archiveItems) {
        const docId = extractDocId(doc.name, archiveItemsPath(year));
        if (docId) archivedItemDocIds.add(docId);
      }
    }
    console.log(`  Gearchiveerde item-docIds: ${archivedItemDocIds.size}`);

    for (const doc of trackedDocs) {
      const docId  = extractDocId(doc.name, TRACKED_BH18);
      if (!docId) continue;

      const fields  = doc.fields || {};
      const orderId = getOrderIdFromTrackedDoc(doc);
      const status  = strVal(fields.status);

      // Order-ID filter
      if (FILTER_ORDER && orderId !== FILTER_ORDER && !docId.startsWith(FILTER_ORDER)) {
        continue;
      }

      // Criterium A: docId staat al in archief-items
      const inArchiveByDocId = archivedItemDocIds.has(docId);

      // Criterium B: het bijbehorende orderId is gearchiveerd
      const inArchiveByOrderId = orderId ? archivedOrderIds.has(orderId) : false;

      // Criterium C: status is compleet/gearchiveerd
      const hasCompletedStatus = isCompletedStatus(status);

      const shouldDelete = inArchiveByDocId || inArchiveByOrderId || hasCompletedStatus;

      const reason = inArchiveByDocId    ? 'docId in archief-items'
                   : inArchiveByOrderId  ? `orderId ${orderId} in archief`
                   : hasCompletedStatus  ? `status="${status}"`
                   : '—';

      if (!shouldDelete) {
        trackedSkipped++;
        continue;
      }

      const docPath = `${TRACKED_BH18}/${docId}`;
      if (DRY_RUN) {
        console.log(`  [DRY] delete tracked   ${docId}  (${reason})`);
      } else {
        await deleteDoc(token, docPath);
        console.log(`  [DEL] ${docPath}  (${reason})`);
        trackedDeleted++;
      }
      if (DRY_RUN) trackedDeleted++;
    }

    console.log(`  Tracked: ${trackedDeleted} te verwijderen, ${trackedSkipped} overgeslagen`);
  }

  // ── Samenvatting ──────────────────────────────────────────────────────────
  console.log('\n=== Samenvatting ===');
  if (DRY_RUN) {
    console.log(`DRY-RUN: geen wijzigingen doorgevoerd.`);
    if (includePlanning) console.log(`  Planning-docs te verwijderen : ${planningDeleted}`);
    if (includeTracked)  console.log(`  Tracked-items te verwijderen : ${trackedDeleted}`);
    console.log(`\nVoer opnieuw uit met --apply om echt te verwijderen.`);
  } else {
    if (includePlanning) console.log(`  Planning-docs verwijderd : ${planningDeleted}`);
    if (includeTracked)  console.log(`  Tracked-items verwijderd : ${trackedDeleted}`);
    console.log(`\nKlaar.`);
  }
};

main().catch((err) => {
  console.error('\nFout:', err.message || String(err));
  process.exit(1);
});
