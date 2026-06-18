#!/usr/bin/env node

/*
 * Eenmalige backfill: verplaats voltooide (stale) tracked products naar het archief.
 *
 * Een tracked product geldt als "voltooid maar niet gearchiveerd" als:
 *  - status in ['completed','finished','gereed'] (case-insensitief)  EN
 *  - currentStep in ['finished','gereed'] OF currentStation === 'GEREED'  EN
 *  - géén archivedAt veld aanwezig
 *
 * Stap 1  : Scan root  future-factory/production/tracked_products
 * Stap 2  : Scan scoped items via collectionGroup 'items' onder tracked_products/*
 * Stap 3  : Kopieer elk gevonden doc naar  future-factory/production/archive/{year}/items/{docId}
 *           en verwijder het bron-doc
 * Stap 4  : Controleer bij elk uniek orderId of de planning-order ook gearchiveerd mag worden
 *           (produced >= plan  EN  geen actieve lots meer)  →  verplaats naar
 *           future-factory/production/archive/{year}/planning/{docId}
 *
 * Standaard dry-run (geen schrijfoperaties) – gebruik --apply om echt uit te voeren.
 *
 * Usage:
 *   node scripts/backfill-archive-completed-via-cli-auth.cjs
 *   node scripts/backfill-archive-completed-via-cli-auth.cjs --apply
 *   node scripts/backfill-archive-completed-via-cli-auth.cjs --apply --skip-planning-archive
 *   node scripts/backfill-archive-completed-via-cli-auth.cjs --apply --order=1234567
 *
 * Opties:
 *   --apply                    : voert writes/deletes echt uit
 *   --skip-planning-archive    : archiveer planning-orders NIET (alleen tracked products)
 *   --order=ORDER_ID           : verwerk alleen dit specifieke orderId
 *   --page-size=NUMBER         : aantal docs per pagina (default 300, max 500)
 *   --project=PROJECT_ID       : override project id
 */

'use strict';

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

// ─────────────────────────── args ───────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const SKIP_PLANNING = args.includes('--skip-planning-archive');

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
const FILTER_ORDER = argValue('order', '');

// ─────────────────────────── Firestore paths ────────────────────────────────
const BASE = 'future-factory';
const TRACKING_PATH = `${BASE}/production/tracked_products`;
const PLANNING_PATH = `${BASE}/production/digital_planning`;
const PLANNING_LEGACY_PATH = `${BASE}/production/data/digital_planning/orders`;
const ARCHIVE_ITEMS_PATH = (year) => `${BASE}/production/archive/${year}/items`;
const ARCHIVE_PLANNING_PATH = (year) => `${BASE}/production/archive/${year}/planning`;

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
  const token = readFreshToken() || readTokenFromConfig();
  if (!token) {
    throw new Error('Geen bruikbaar Firebase access token gevonden. Run eerst: firebase login');
  }
  return token;
};

// ─────────────────────────── REST helpers ───────────────────────────────────
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
          const parsed = data ? JSON.parse(data) : {};
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            return reject(
              new Error(`${method} ${path} → HTTP ${res.statusCode}: ${parsed?.error?.message || data}`)
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

const DB_PATH = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Pagineer door een collection. */
const listDocsPage = async (token, collectionPath, pageSize = 300, pageToken = '') => {
  const qp = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
  const path = `${DB_PATH}/${collectionPath}?pageSize=${pageSize}${qp}`;
  try {
    return await apiRequest('GET', path, token);
  } catch (err) {
    if (String(err.message || '').includes('(404)') || String(err.message || '').includes('HTTP 404')) {
      return { documents: [], nextPageToken: '' };
    }
    throw err;
  }
};

/** Haal één doc op via zijn pad (relatief t.o.v. /documents/). */
const getDoc = async (token, docPath) => {
  try {
    return await apiRequest('GET', `${DB_PATH}/${docPath}`, token);
  } catch (err) {
    if (String(err.message || '').includes('HTTP 404')) return null;
    throw err;
  }
};

/** Maak een nieuw doc aan (create, niet update). */
const createDoc = async (token, collectionPath, docId, fields) => {
  const path = `${DB_PATH}/${collectionPath}?documentId=${encodeURIComponent(docId)}`;
  return apiRequest('POST', path, token, { fields });
};

/** Verwijder een doc. */
const deleteDoc = async (token, docPath) => {
  await apiRequest('DELETE', `${DB_PATH}/${docPath}`, token);
};

/**
 * CollectionGroup query via runQuery (allDescendants=true).
 * Geeft een array van document-objecten terug.
 * whereClause is optioneel; als null wordt er geen filter toegepast.
 */
const runCollectionGroupQuery = async (token, collectionId, whereClause) => {
  const path = `${DB_PATH}:runQuery`;
  const structuredQuery = {
    from: [{ collectionId, allDescendants: true }],
  };
  if (whereClause) structuredQuery.where = whereClause;
  const results = await apiRequest('POST', path, token, { structuredQuery });
  // runQuery geeft een array van { document?, readTime } objecten terug.
  return (Array.isArray(results) ? results : [])
    .filter((r) => r.document)
    .map((r) => r.document);
};

// ─────────────────────────── Firestore value helpers ────────────────────────
/** Haal de raw string waarde op uit een Firestore-typed field. */
const strVal = (field) => {
  if (!field) return '';
  if (field.stringValue !== undefined) return String(field.stringValue || '');
  if (field.integerValue !== undefined) return String(field.integerValue || '');
  return '';
};

/** Converteer een Firestore typed field naar een JS waarde (voor logging). */
const jsVal = (field) => {
  if (!field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.timestampValue !== undefined) return field.timestampValue;
  if (field.nullValue !== undefined) return null;
  if (field.arrayValue !== undefined) return (field.arrayValue?.values || []).map(jsVal);
  if (field.mapValue !== undefined) {
    const sub = {};
    for (const [k, v] of Object.entries(field.mapValue?.fields || {})) {
      sub[k] = jsVal(v);
    }
    return sub;
  }
  return null;
};

/** Maak een Firestore stringValue field. */
const fStr = (val) => ({ stringValue: String(val ?? '') });

/** Maak een Firestore timestampValue field. */
const fTs = (date) => ({ timestampValue: date.toISOString() });

/** Extraheer de doc-ID uit de volledige Firestore resource name. */
const extractDocId = (fullName) => {
  const parts = String(fullName || '').split('/');
  return parts[parts.length - 1] || '';
};

/** Extraheer het relatieve pad (na /documents/) uit een Firestore resource name. */
const extractRelPath = (fullName) => {
  const marker = '/documents/';
  const idx = String(fullName || '').indexOf(marker);
  if (idx === -1) return '';
  return fullName.slice(idx + marker.length);
};

// ─────────────────────────── Status-check helpers ───────────────────────────
/** Controleer of een tracked product als "voltooid" beschouwd wordt. */
const isCompletedTrackedDoc = (fields = {}) => {
  const status = strVal(fields.status).toLowerCase().trim();
  const step = strVal(fields.currentStep).toLowerCase().trim();
  const station = strVal(fields.currentStation).toLowerCase().trim();

  const statusDone = ['completed', 'finished', 'gereed'].includes(status);
  const stepDone = ['finished', 'gereed'].includes(step);
  const stationDone = station === 'gereed';

  return statusDone || stepDone || stationDone;
};

/** Controleer of een tracked product als "actief" (niet afgesloten) beschouwd wordt. */
const isActiveTrackedDoc = (fields = {}) => {
  const status = strVal(fields.status).toLowerCase().trim();
  const step = strVal(fields.currentStep).toLowerCase().trim();
  const station = strVal(fields.currentStation).toLowerCase().trim();
  const hasArchivedAt = Boolean(fields.archivedAt);

  const isClosed =
    ['completed', 'finished', 'gereed', 'rejected', 'afkeur', 'archived_rejected'].includes(status) ||
    ['finished', 'rejected', 'gereed'].includes(step) ||
    station === 'gereid' ||
    station === 'gereed' ||
    hasArchivedAt;

  return !isClosed;
};

/** Bepaal het archief-jaar aan de hand van de meest relevante timestamp in het doc. */
const resolveArchiveYear = (fields = {}) => {
  const candidates = [
    fields.archivedAt,
    fields.completedAt,
    fields['timestamps.finished'],
    fields.updatedAt,
    fields.createdAt,
  ];
  for (const f of candidates) {
    if (f?.timestampValue) {
      const year = new Date(f.timestampValue).getFullYear();
      if (year >= 2020 && year <= 2030) return year;
    }
  }
  // Fallback: huidige jaar
  return new Date().getFullYear();
};

// ─────────────────────────── Scan helpers ───────────────────────────────────
/** Pagineer door de volledige root-tracking collection. */
const scanRootTracking = async (token) => {
  const results = [];
  let pageToken = '';
  let page = 0;

  do {
    page += 1;
    process.stdout.write(`  Root tracked_products pagina ${page}…\r`);
    const resp = await listDocsPage(token, TRACKING_PATH, PAGE_SIZE, pageToken);
    const docs = Array.isArray(resp.documents) ? resp.documents : [];

    for (const doc of docs) {
      const fields = doc.fields || {};
      // Sla docs over die geen echte tracked-product data hebben (bijv. dept-level docs)
      if (!fields.lotNumber && !fields.orderId && !fields.status) continue;
      // Sla al gearchiveerde docs over
      if (fields.archivedAt) continue;
      // Sla rejected over
      const status = strVal(fields.status).toLowerCase();
      const step = strVal(fields.currentStep).toLowerCase();
      if (['rejected', 'afkeur', 'archived_rejected'].includes(status)) continue;
      if (['rejected'].includes(step)) continue;

      if (isCompletedTrackedDoc(fields)) {
        results.push(doc);
      }
    }

    pageToken = resp.nextPageToken || '';
  } while (pageToken);

  console.log(`  Root tracking: ${results.length} voltooide records gevonden (${page} pagina's).`);
  return results;
};

/**
 * Haal voltooide docs op via collectionGroup query op 'items'.
 * Gebruikt een gefilterde query als de index beschikbaar is; anders valt het terug
 * op een ongefilter scan van alle 'items' subcollections (in-memory filter).
 */
const scanScopedItems = async (token) => {
  const results = [];
  const seenIds = new Set();

  const addIfCompleted = (doc) => {
    const name = doc.name || '';
    if (!name.includes(`/documents/${TRACKING_PATH}/`)) return;
    const fields = doc.fields || {};
    if (fields.archivedAt) return;
    const st = strVal(fields.status).toLowerCase();
    const step = strVal(fields.currentStep).toLowerCase();
    if (['rejected', 'afkeur', 'archived_rejected'].includes(st)) return;
    if (['rejected'].includes(step)) return;
    if (!isCompletedTrackedDoc(fields)) return;
    const docId = extractDocId(name);
    if (seenIds.has(docId)) return;
    seenIds.add(docId);
    results.push(doc);
  };

  // Probeer gefilterde query (vereist index – werkt als de index al bestaat).
  const filteredDocs = await runCollectionGroupQuery(token, 'items', {
    fieldFilter: {
      field: { fieldPath: 'status' },
      op: 'IN',
      value: {
        arrayValue: {
          values: ['completed', 'finished', 'gereed', 'Completed', 'Finished', 'Gereed'].map((s) => ({ stringValue: s })),
        },
      },
    },
  }).catch(() => null); // null = index ontbreekt, fallback naar volledig scan

  if (filteredDocs !== null) {
    filteredDocs.forEach(addIfCompleted);
  } else {
    // Fallback: scan ALLE items via collectionGroup zonder filter, filter in-memory.
    console.log('  Index niet beschikbaar – volledige scan van alle items…');
    const allItemDocs = await runCollectionGroupQuery(token, 'items', null).catch((err) => {
      console.warn(`  Scoped items (ongefiltered) scan mislukt: ${err.message}`);
      return [];
    });
    allItemDocs.forEach(addIfCompleted);
  }

  console.log(`  Scoped items (collectionGroup): ${results.length} voltooide records gevonden.`);
  return results;
};

// ─────────────────────────── Planning order helpers ─────────────────────────
const lookupPlanningOrder = async (token, orderId) => {
  // Zoek eerst in de nieuwe scoped path, daarna legacy
  const safeId = String(orderId || '').trim();
  if (!safeId) return null;

  // Probeer directe doc-lookup op beide paths
  for (const basePath of [PLANNING_PATH, PLANNING_LEGACY_PATH]) {
    const doc = await getDoc(token, `${basePath}/${safeId}`);
    if (doc && doc.fields) return { doc, path: `${basePath}/${safeId}` };
  }

  // Probeer query op orderId-veld in beide collections
  for (const collPath of [PLANNING_PATH, PLANNING_LEGACY_PATH]) {
    const queryPath = `${DB_PATH}:runQuery`;
    const results = await apiRequest('POST', queryPath, token, {
      structuredQuery: {
        from: [{ collectionId: collPath.split('/').pop() }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'orderId' },
            op: 'EQUAL',
            value: { stringValue: safeId },
          },
        },
        limit: 1,
      },
    }).catch(() => []);

    const docs = (Array.isArray(results) ? results : []).filter((r) => r.document);
    if (docs.length > 0) {
      const doc = docs[0].document;
      return { doc, path: extractRelPath(doc.name) };
    }
  }

  return null;
};

/** Controleer of er nog actieve (niet-afgesloten) tracked products zijn voor een order. */
const hasActiveTrackedForOrder = async (token, orderId) => {
  const safeId = String(orderId || '').trim();
  if (!safeId || safeId === 'NOG_TE_BEPALEN') return false;

  // Root query
  const queryPath = `${DB_PATH}:runQuery`;
  const makeQuery = (collectionId, allDescendants = false) => ({
    structuredQuery: {
      from: [{ collectionId, allDescendants }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'orderId' },
          op: 'EQUAL',
          value: { stringValue: safeId },
        },
      },
      limit: 200,
    },
  });

  const rootResults = await apiRequest('POST', queryPath, token, makeQuery('tracked_products')).catch(() => []);
  const rootDocs = (Array.isArray(rootResults) ? rootResults : [])
    .filter((r) => r.document)
    .map((r) => r.document);

  for (const doc of rootDocs) {
    if (isActiveTrackedDoc(doc.fields || {})) return true;
  }

  // Scoped items
  const scopedResults = await apiRequest('POST', queryPath, token, makeQuery('items', true)).catch(() => []);
  const scopedDocs = (Array.isArray(scopedResults) ? scopedResults : [])
    .filter((r) => r.document && String(r.document.name || '').includes(`/documents/${TRACKING_PATH}/`))
    .map((r) => r.document);

  for (const doc of scopedDocs) {
    if (isActiveTrackedDoc(doc.fields || {})) return true;
  }

  return false;
};

// ─────────────────────────── Backfill logica ────────────────────────────────
const run = async () => {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Backfill: archiveer voltooide tracked products');
  console.log(`  Mode   : ${DRY_RUN ? '🔍 DRY-RUN (geen wijzigingen)' : '✏️  APPLY (wijzigingen worden opgeslagen)'}`);
  if (FILTER_ORDER) console.log(`  Filter : orderId = ${FILTER_ORDER}`);
  console.log('══════════════════════════════════════════════════\n');

  const token = getToken();
  const now = new Date();

  // ── Stap 1+2: Verzamel voltooide-maar-niet-gearchiveerde docs ──────────────
  console.log('Stap 1: Root tracked_products scannen…');
  const rootDocs = await scanRootTracking(token);

  console.log('Stap 2: Scoped items scannen (collectionGroup)…');
  const scopedDocs = await scanScopedItems(token);

  // Dedupliceer op basis van docId
  const allDocsByPath = new Map();
  for (const doc of [...rootDocs, ...scopedDocs]) {
    const relPath = extractRelPath(doc.name);
    if (relPath) allDocsByPath.set(relPath, doc);
  }

  // Filter op orderId als --order meegegeven
  let candidates = Array.from(allDocsByPath.values());
  if (FILTER_ORDER) {
    candidates = candidates.filter((doc) => {
      const orderId = strVal((doc.fields || {}).orderId);
      return orderId.toLowerCase() === FILTER_ORDER.toLowerCase();
    });
  }

  console.log(`\nTotaal unieke stale records: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('Niets te doen. Klaar.');
    return;
  }

  // ── Stap 3: Archiveer tracked products ────────────────────────────────────
  console.log('Stap 3: Tracked products naar archief verplaatsen…\n');

  let movedCount = 0;
  let skippedCount = 0;
  const processedOrderIds = new Set();

  for (const doc of candidates) {
    const relPath = extractRelPath(doc.name);
    const docId = extractDocId(doc.name);
    const fields = doc.fields || {};

    const orderId = strVal(fields.orderId) || '(geen)';
    const lotNumber = strVal(fields.lotNumber) || docId;
    const status = strVal(fields.status);
    const station = strVal(fields.currentStation);
    const year = resolveArchiveYear(fields);

    const archivePath = ARCHIVE_ITEMS_PATH(year);

    console.log(`  [${movedCount + skippedCount + 1}/${candidates.length}] Lot ${lotNumber} | order ${orderId} | status=${status} | station=${station} | jaar=${year}`);
    console.log(`    bron : ${relPath}`);
    console.log(`    doel : ${archivePath}/${docId}`);

    if (DRY_RUN) {
      console.log(`    → DRY-RUN: overgeslagen\n`);
      skippedCount += 1;
    } else {
      // Controleer of het archief-doc al bestaat
      const existingArchive = await getDoc(token, `${archivePath}/${docId}`);
      if (existingArchive && existingArchive.fields) {
        console.log(`    ⚠️  Archive doc bestaat al – bron alsnog verwijderen\n`);
        await deleteDoc(token, relPath);
        movedCount += 1;
      } else {
        // Bouw de archive fields op: kopieer alle bestaande fields + voeg meta toe
        const archiveFields = {
          ...fields,
          currentStation: fStr('GEREED'),
          currentStep: fStr('Finished'),
          status: fStr('completed'),
          archivedAt: fTs(now),
          backfilledAt: fTs(now),
          backfillSource: fStr('backfill-archive-completed-script'),
        };

        try {
          await createDoc(token, archivePath, docId, archiveFields);
          await deleteDoc(token, relPath);
          console.log(`    ✅ Gearchiveerd\n`);
          movedCount += 1;
        } catch (err) {
          console.error(`    ❌ Fout: ${err.message}\n`);
          skippedCount += 1;
          continue;
        }
      }
    }

    if (orderId && orderId !== '(geen)' && orderId !== 'NOG_TE_BEPALEN') {
      processedOrderIds.add(orderId);
    }
  }

  console.log(`\nStap 3 klaar: ${movedCount} gearchiveerd, ${skippedCount} overgeslagen.\n`);

  // ── Stap 4: Planning orders archiveren ────────────────────────────────────
  if (SKIP_PLANNING) {
    console.log('Stap 4 overgeslagen (--skip-planning-archive)\n');
  } else if (processedOrderIds.size === 0) {
    console.log('Stap 4: Geen unieke orderIds gevonden – overgeslagen.\n');
  } else {
    console.log(`Stap 4: ${processedOrderIds.size} planning-orders controleren op archivering…\n`);

    let planningArchived = 0;
    let planningSkipped = 0;

    for (const orderId of processedOrderIds) {
      console.log(`  Order ${orderId}:`);

      const planResult = await lookupPlanningOrder(token, orderId);
      if (!planResult) {
        console.log(`    ℹ️  Niet gevonden in planning – overgeslagen\n`);
        planningSkipped += 1;
        continue;
      }

      const { doc: planDoc, path: planPath } = planResult;
      const planFields = planDoc.fields || {};
      const produced = Number(jsVal(planFields.produced)) || 0;
      const plan = Number(jsVal(planFields.plan) || jsVal(planFields.quantity) || jsVal(planFields.toDoQty)) || 0;
      const currentStatus = strVal(planFields.status);

      console.log(`    produced=${produced}, plan=${plan}, status=${currentStatus}`);

      // Controleer of produced >= plan
      if (plan > 0 && produced < plan) {
        console.log(`    ⏭  produced (${produced}) < plan (${plan}) – nog niet klaar\n`);
        planningSkipped += 1;
        continue;
      }

      // Controleer of er nog actieve tracked products zijn (na onze backfill)
      const stillActive = await hasActiveTrackedForOrder(token, orderId);
      if (stillActive) {
        console.log(`    ⏭  Er zijn nog actieve tracked products – niet archiveren\n`);
        planningSkipped += 1;
        continue;
      }

      const planDocId = extractDocId(planDoc.name);
      const planYear = new Date().getFullYear();
      const planArchivePath = ARCHIVE_PLANNING_PATH(planYear);

      console.log(`    doel : ${planArchivePath}/${planDocId}`);

      if (DRY_RUN) {
        console.log(`    → DRY-RUN: overgeslagen\n`);
        planningSkipped += 1;
      } else {
        try {
          // Controleer of archive al bestaat
          const existingPlanArchive = await getDoc(token, `${planArchivePath}/${planDocId}`);
          if (existingPlanArchive && existingPlanArchive.fields) {
            console.log(`    ⚠️  Planning archive doc bestaat al – bron verwijderen\n`);
            await deleteDoc(token, planPath);
          } else {
            const archivePlanFields = {
              ...planFields,
              archivedAt: fTs(now),
              archiveReason: fStr('completed'),
              archiveYear: { integerValue: String(planYear) },
              originalStatus: fStr(currentStatus),
              archivedFrom: fStr('digital_planning'),
              archivedBy: fStr('backfill-script'),
              archiveSource: fStr('backfill-archive-completed-script'),
              backfilledAt: fTs(now),
            };
            await createDoc(token, planArchivePath, planDocId, archivePlanFields);
            await deleteDoc(token, planPath);
          }

          console.log(`    ✅ Planning order gearchiveerd\n`);
          planningArchived += 1;
        } catch (err) {
          console.error(`    ❌ Fout bij archiveren planning order: ${err.message}\n`);
          planningSkipped += 1;
        }
      }
    }

    console.log(`Stap 4 klaar: ${planningArchived} planning-orders gearchiveerd, ${planningSkipped} overgeslagen.\n`);
  }

  // ── Samenvatting ──────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════');
  console.log('  SAMENVATTING');
  console.log(`  Stale tracked products gevonden : ${candidates.length}`);
  if (DRY_RUN) {
    console.log('  Wijzigingen                     : GEEN (dry-run)');
    console.log('\n  Voer opnieuw uit met --apply om de backfill door te voeren.');
  } else {
    console.log(`  Tracked products gearchiveerd   : ${movedCount}`);
    console.log(`  Overgeslagen (fouten)           : ${skippedCount}`);
  }
  console.log('══════════════════════════════════════════════════\n');
};

run().catch((err) => {
  console.error('\nFATAAL:', err.message || err);
  process.exit(1);
});
