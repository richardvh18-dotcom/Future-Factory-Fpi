#!/usr/bin/env node
'use strict';

/**
 * Diagnose script voor N20024782
 *
 * Hoofdvraag: Waarom verdwijnt deze order uit de BH18-planning terwijl hij
 * status "in_progress" heeft en nog maar 5 van 10 stuks geproduceerd zijn?
 *
 * Vermoeden: 2 lots van een andere order zijn doorgeschoven naar N20024782
 * waardoor madeCountMap >= stationPlan en de order verborgen wordt.
 *
 * Dit script laat zien:
 *   1. Alle tracked items met orderId = N20024782  (incl. scoped BH18 items)
 *   2. Alle tracked items die één van de 8 issuedLotNumbers bevatten
 *   3. Alle tracked items op BH18 die NIET orderId = N20024782 hebben maar
 *      wél één van de lot-nummers uit issuedLotNumbers gebruiken
 *   4. Het planningsdocument zelf
 *   5. Archief-items met orderId = N20024782
 */

const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID  = 'future-factory-377ef';
const ORDER_ID    = 'N20024782';

// Alle issuedLotNumbers uit het planningsdocument
const ISSUED_LOTS = new Set([
  '402619418400013',
  '402619418400019',
  '402619418400025',
  '402619418400049',
  '402619418400070',
  '402619418400074',
  '402619418400078',
  '402619418400086',
]);

// ── Auth ─────────────────────────────────────────────────────────────────────
const getToken = () => {
  // 1. gcloud application-default
  try {
    const t = execSync('gcloud auth application-default print-access-token 2>/dev/null', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
    if (t && t.length > 10) return t;
  } catch (_) {}
  // 2. Firebase refresh token via OAuth2
  try {
    const p = require('os').homedir() + '/.config/configstore/firebase-tools.json';
    const d = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    const refresh = d?.tokens?.refresh_token;
    if (refresh) {
      const { execSync: exec2 } = require('child_process');
      const out = exec2(
        `curl -s -X POST 'https://oauth2.googleapis.com/token'` +
        ` -d 'grant_type=refresh_token'` +
        ` -d 'refresh_token=${encodeURIComponent(refresh)}'` +
        ` -d 'client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'` +
        ` -d 'client_secret=j9iVZfS8kkCEFUPaAeJV0sAi'`,
        { encoding: 'utf8' }
      );
      const json = JSON.parse(out);
      if (json.access_token) return json.access_token;
    }
  } catch (_) {}
  throw new Error('Geen geldig access token. Voer "gcloud auth application-default login" of "firebase login" uit.');
};
const token = getToken();

// ── Helpers ───────────────────────────────────────────────────────────────────
const apiGet = (path) => new Promise((res, rej) => {
  const req = https.request({
    hostname: 'firestore.googleapis.com', path, method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  }, (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res({}); } });
  });
  req.on('error', rej);
  req.end();
});

const runQuery = (collectionId, field, value, allDescendants) => new Promise((res, rej) => {
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId, allDescendants: !!allDescendants }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
      limit: 200
    }
  });
  const path = '/v1/projects/' + PROJECT_ID + '/databases/(default)/documents:runQuery';
  const req = https.request({
    hostname: 'firestore.googleapis.com', path, method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res([]); } });
  });
  req.on('error', rej);
  req.write(body);
  req.end();
});

const strVal = (f) => {
  if (!f) return '';
  if (f.stringValue  !== undefined) return String(f.stringValue);
  if (f.integerValue !== undefined) return String(f.integerValue);
  if (f.doubleValue  !== undefined) return String(f.doubleValue);
  if (f.booleanValue !== undefined) return String(f.booleanValue);
  if (f.arrayValue   !== undefined) return JSON.stringify(f.arrayValue);
  return '';
};

const shortPath = (name) => String(name || '').split('/documents/')[1] || name;

const printTrackedDoc = (d) => {
  const f = d.document ? d.document.fields || {} : d.fields || {};
  const name = d.document ? d.document.name : d.name;
  console.log('  PATH   :', shortPath(name));
  console.log('  orderId:', strVal(f.orderId));
  console.log('  lot    :', strVal(f.lotNumber));
  console.log('  status :', strVal(f.status));
  console.log('  station:', strVal(f.currentStation));
  console.log('  step   :', strVal(f.currentStep));
  console.log('');
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('======================================================');
  console.log(' Diagnose order: ' + ORDER_ID);
  console.log(' Vermoeden: vreemde lots verhogen madeCount tot >= 10');
  console.log('======================================================\n');

  // ── 1. Alle tracked items (collectionGroup) met orderId = N20024782 ────────
  console.log('=== 1. TRACKED items (collectionGroup) met orderId = ' + ORDER_ID + ' ===');
  const tRes = await runQuery('items', 'orderId', ORDER_ID, true);
  const tDocs = Array.isArray(tRes) ? tRes.filter(r => r.document) : [];
  console.log('  Gevonden:', tDocs.length, 'docs\n');
  if (tDocs.length === 0) {
    console.log('  geen resultaten\n');
  } else {
    tDocs.forEach(printTrackedDoc);
  }

  // ── 2. Scoped BH18/items met orderId = N20024782 ──────────────────────────
  console.log('=== 2. Scoped tracked_products/Fittings/machines/40BH18/items ===');
  const bh18All = await apiGet('/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/future-factory/production/tracked_products/Fittings/machines/40BH18/items?pageSize=500');
  const bh18Docs = bh18All.documents || [];
  const bh18ForOrder = bh18Docs.filter(d => strVal((d.fields || {}).orderId) === ORDER_ID);
  const bh18ByLot    = bh18Docs.filter(d => ISSUED_LOTS.has(strVal((d.fields || {}).lotNumber)));

  console.log('  Totaal BH18 items opgehaald:', bh18Docs.length);
  console.log('  Items met orderId = ' + ORDER_ID + ':', bh18ForOrder.length);
  console.log('  Items met één van de issuedLotNumbers:', bh18ByLot.length, '\n');

  if (bh18ForOrder.length > 0) {
    console.log('  --- Items via orderId ---');
    bh18ForOrder.forEach(printTrackedDoc);
  }

  // ── 3. KERNVRAAG: lot-nummers die NIET tot N20024782 behoren ─────────────
  console.log('=== 3. BH18 items met issuedLotNumber maar ANDER orderId (de "vreemde" lots) ===');
  const vreemde = bh18ByLot.filter(d => strVal((d.fields || {}).orderId) !== ORDER_ID);
  if (vreemde.length === 0) {
    console.log('  Geen vreemde lots gevonden op BH18.\n');
  } else {
    console.log('  !! GEVONDEN: ' + vreemde.length + ' lots met een issuedLotNumber maar ANDER orderId !!\n');
    vreemde.forEach(printTrackedDoc);
  }

  // ── 4. Lot-nummers in de BH18 items die NIET in issuedLots staan ──────────
  console.log('=== 4. BH18 items met orderId = ' + ORDER_ID + ' maar LOT niet in issuedLotNumbers ===');
  const nieuweLots = bh18ForOrder.filter(d => {
    const lot = strVal((d.fields || {}).lotNumber);
    return lot && !ISSUED_LOTS.has(lot);
  });
  if (nieuweLots.length === 0) {
    console.log('  Geen onbekende lots gevonden.\n');
  } else {
    console.log('  !! ' + nieuweLots.length + ' items met onbekend lot-nummer !!\n');
    nieuweLots.forEach(printTrackedDoc);
  }

  // ── 5. Planningsdocument ──────────────────────────────────────────────────
  console.log('=== 5. Planningsdocument 40BH18/orders ===');
  const planResp = await apiGet('/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/future-factory/production/digital_planning/Fittings/machines/40BH18/orders?pageSize=300');
  const planDocs = (planResp.documents || []).filter(d => {
    const f = d.fields || {};
    return String(d.name || '').includes(ORDER_ID) || strVal(f.orderId) === ORDER_ID;
  });
  if (planDocs.length === 0) {
    console.log('  Geen planningsdoc gevonden voor ' + ORDER_ID + '\n');
  } else {
    planDocs.forEach(d => {
      const f = d.fields || {};
      console.log('  PATH         :', shortPath(d.name));
      console.log('  status       :', strVal(f.status));
      console.log('  plan         :', strVal(f.plan));
      console.log('  quantity     :', strVal(f.quantity));
      console.log('  produced     :', strVal(f.produced));
      console.log('  started_BH18 :', strVal(f.started_BH18));
      console.log('  toDoQty      :', strVal(f.toDoQty));
      console.log('  activeLot    :', strVal(f.activeLot));
      console.log('');
    });
  }

  // ── 6. Archief items ──────────────────────────────────────────────────────
  console.log('=== 6. Archief items (2025-2026) met orderId = ' + ORDER_ID + ' ===');
  for (const year of [2026, 2025]) {
    const archPath = '/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/future-factory/production/archive/' + year + '/items?pageSize=300';
    const archResp = await apiGet(archPath);
    const archDocs = (archResp.documents || []).filter(d => {
      const f = d.fields || {};
      return strVal(f.orderId) === ORDER_ID || String(d.name || '').includes(ORDER_ID);
    });
    console.log('  Archief ' + year + ':', archDocs.length, 'matches');
    archDocs.forEach(printTrackedDoc);
  }

  // ── Samenvatting ──────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(' SAMENVATTING');
  console.log('======================================================');
  const totalTracked = tDocs.length + bh18ForOrder.length;
  console.log('  Unieke tracked items gevonden voor ' + ORDER_ID + ' : ~' + totalTracked);
  console.log('  Vreemde lots (issued lot + ander orderId)          :', vreemde.length);
  console.log('  Onbekende lots (orderId klopt, lot niet issued)    :', nieuweLots.length);
  if (vreemde.length > 0) {
    console.log('\n  CONCLUSIE: ' + vreemde.length + ' vreemd(e) lot(s) verhogen de madeCount onterecht.');
    console.log('  Fix: pas het orderId van deze items aan of verwijder ze.');
  } else if (nieuweLots.length > 0) {
    console.log('\n  CONCLUSIE: ' + nieuweLots.length + ' extra lot(s) die niet in issuedLotNumbers staan.');
    console.log('  Fix: controleer of deze lots bewust zijn doorgeboekt.');
  } else {
    console.log('\n  Geen duidelijke vreemde lots gevonden. Andere oorzaak?');
  }
  console.log('');
}

main().catch(e => { console.error('FOUT:', e.message || e); process.exit(1); });
