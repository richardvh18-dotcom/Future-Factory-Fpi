#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const os = require('os');

const PROJECT_ID = 'future-factory-377ef';
const ORDER_ID   = 'N20024978';

const getToken = () => {
  // Try gcloud first
  try {
    const t = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
    if (t) return t;
  } catch (_) {}
  // Fallback: read from firebase-tools configstore
  try {
    const fs = require('fs');
    const p = require('os').homedir() + '/.config/configstore/firebase-tools.json';
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const t = d?.tokens?.access_token || '';
    if (t) return t;
  } catch (_) {}
  throw new Error('Geen geldig access token gevonden. Voer firebase login of gcloud auth login uit.');
};
const token = getToken();

const apiGet = (path) => new Promise((res, rej) => {
  const req = https.request({
    hostname: 'firestore.googleapis.com', path, method: 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res({}); } }); });
  req.on('error', rej); req.end();
});

const runQuery = (collectionId, field, value, allDescendants) => new Promise((res, rej) => {
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId, allDescendants: !!allDescendants }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
      limit: 100
    }
  });
  const path = '/v1/projects/' + PROJECT_ID + '/databases/(default)/documents:runQuery';
  const req = https.request({
    hostname: 'firestore.googleapis.com', path, method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res([]); } }); });
  req.on('error', rej); req.write(body); req.end();
});

const strVal = (f) => {
  if (!f) return '';
  if (f.stringValue  !== undefined) return String(f.stringValue);
  if (f.integerValue !== undefined) return String(f.integerValue);
  if (f.doubleValue  !== undefined) return String(f.doubleValue);
  if (f.booleanValue !== undefined) return String(f.booleanValue);
  return '';
};

const shortPath = (name) => String(name || '').split('/documents/')[1] || name;

async function main() {
  console.log('==============================');
  console.log(' Diagnose order: ' + ORDER_ID);
  console.log('==============================\n');

  // 1. Tracked items (collectionGroup 'items') met orderId = N20024978
  console.log('--- TRACKED (collectionGroup items, orderId=' + ORDER_ID + ') ---');
  const tRes = await runQuery('items', 'orderId', ORDER_ID, true);
  const tDocs = Array.isArray(tRes) ? tRes.filter(r => r.document) : [];
  if (tDocs.length === 0) {
    console.log('  geen resultaten');
  } else {
    tDocs.forEach(r => {
      const f = r.document.fields || {};
      console.log('  PATH   :', shortPath(r.document.name));
      console.log('  status :', strVal(f.status));
      console.log('  station:', strVal(f.currentStation));
      console.log('  step   :', strVal(f.currentStep));
      console.log('  lot    :', strVal(f.lotNumber));
      console.log('');
    });
  }

  // 2. Root tracked_products met orderId (legacy pad zonder scoping)
  console.log('--- TRACKED root tracked_products ---');
  const tRoot = await runQuery('tracked_products', 'orderId', ORDER_ID, false);
  const tRootDocs = Array.isArray(tRoot) ? tRoot.filter(r => r.document) : [];
  if (tRootDocs.length === 0) {
    console.log('  geen resultaten');
  } else {
    tRootDocs.forEach(r => {
      const f = r.document.fields || {};
      console.log('  PATH   :', shortPath(r.document.name));
      console.log('  status :', strVal(f.status));
      console.log('  station:', strVal(f.currentStation));
      console.log('  lot    :', strVal(f.lotNumber));
      console.log('');
    });
  }

  // 3. Archief items per jaar
  const archYears = [2026, 2025, 2024];
  for (const year of archYears) {
    console.log('--- ARCHIEF ' + year + '/items ---');
    const archPath = '/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/future-factory/production/archive/' + year + '/items?pageSize=300';
    const archResp = await apiGet(archPath);
    const archDocs = (archResp.documents || []).filter(d => {
      const f = d.fields || {};
      return strVal(f.orderId) === ORDER_ID || String(d.name || '').includes(ORDER_ID);
    });
    if (archDocs.length === 0) {
      console.log('  geen matches');
    } else {
      archDocs.forEach(d => {
        const f = d.fields || {};
        console.log('  PATH   :', shortPath(d.name));
        console.log('  status :', strVal(f.status));
        console.log('  station:', strVal(f.currentStation));
        console.log('  step   :', strVal(f.currentStep));
        console.log('  lot    :', strVal(f.lotNumber));
        console.log('');
      });
    }
  }

  // 4. Planning doc in 40BH18
  console.log('--- PLANNING doc 40BH18/orders ---');
  const planPath = '/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/future-factory/production/digital_planning/Fittings/machines/40BH18/orders?pageSize=200';
  const planResp = await apiGet(planPath);
  const planDocs = (planResp.documents || []).filter(d => {
    const f = d.fields || {};
    return String(d.name || '').includes(ORDER_ID) || strVal(f.orderId) === ORDER_ID;
  });
  if (planDocs.length === 0) {
    console.log('  geen planning doc gevonden voor ' + ORDER_ID);
  } else {
    planDocs.forEach(d => {
      const f = d.fields || {};
      console.log('  PATH        :', shortPath(d.name));
      console.log('  status      :', strVal(f.status));
      console.log('  plan        :', strVal(f.plan));
      console.log('  quantity    :', strVal(f.quantity));
      console.log('  started_BH18:', strVal(f.started_BH18));
      console.log('  toDoQty     :', strVal(f.toDoQty));
      console.log('  machine     :', strVal(f.machine));
      console.log('');
    });
  }

  // 5. Root planning docs (TEMP_PLANNING + PLANNING)
  for (const coll of ['TEMP_PLANNING', 'PLANNING']) {
    console.log('--- Root ' + coll + ' ---');
    const r = await apiGet('/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/future-factory/production/' + coll + '?pageSize=300');
    const matches = (r.documents || []).filter(d => {
      const f = d.fields || {};
      return String(d.name || '').includes(ORDER_ID) || strVal(f.orderId) === ORDER_ID;
    });
    if (matches.length === 0) { console.log('  geen'); }
    else matches.forEach(d => {
      const f = d.fields || {};
      console.log('  PATH        :', shortPath(d.name));
      console.log('  status      :', strVal(f.status));
      console.log('  plan        :', strVal(f.plan));
      console.log('  quantity    :', strVal(f.quantity));
      console.log('  started_BH18:', strVal(f.started_BH18));
      console.log('');
    });
  }

  // 6. Exact document path
  const exactDoc = '/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/future-factory/production/digital_planning/Fittings/machines/40BH18/orders/N20024978_EL9AESS08R03E0BCCBB0';
  console.log('--- Exact path check ---');
  const exactResp = await apiGet(exactDoc);
  if (exactResp.error) {
    console.log('  Niet gevonden (404):', exactResp.error.message);
  } else {
    const f = exactResp.fields || {};
    console.log('  GEVONDEN:');
    Object.keys(f).forEach(k => console.log('  ' + k + ' = ' + strVal(f[k])));
  }

  // 7. Alle machine-orders paden doorzoeken
  const machines = ['40BH18','40BH12','40BH15','40BH17','40BH11'];
  console.log('\n--- Alle machine orders paden ---');
  for (const m of machines) {
    const r2 = await apiGet('/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/future-factory/production/digital_planning/Fittings/machines/' + m + '/orders?pageSize=300');
    const docs = (r2.documents || []).filter(d => String(d.name).includes(ORDER_ID));
    if (docs.length > 0) {
      docs.forEach(d => {
        const f = d.fields || {};
        console.log('  GEVONDEN in', m + ':');
        console.log('    path       :', shortPath(d.name));
        console.log('    status     :', strVal(f.status));
        console.log('    plan       :', strVal(f.plan));
        console.log('    quantity   :', strVal(f.quantity));
        console.log('    started_BH18:', strVal(f.started_BH18));
        console.log('    toDoQty    :', strVal(f.toDoQty));
      });
    }
  }

  // 8. Scoped BH18 tracked items
  console.log('\n--- Scoped tracked BH18/items ---');
  const bh18items = await apiGet('/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/future-factory/production/tracked_products/Fittings/machines/40BH18/items?pageSize=300');
  const bh18matches = (bh18items.documents || []).filter(d =>
    String(d.name).includes(ORDER_ID) || strVal((d.fields || {}).orderId) === ORDER_ID
  );
  if (bh18matches.length === 0) { console.log('  geen'); }
  else bh18matches.forEach(d => {
    const f = d.fields || {};
    console.log('  PATH   :', shortPath(d.name));
    console.log('  status :', strVal(f.status), '| station:', strVal(f.currentStation), '| step:', strVal(f.currentStep), '| lot:', strVal(f.lotNumber));
    console.log('');
  });

  // 9. Archief planning per jaar
  console.log('\n--- Archief planning ---');
  for (const year of [2026, 2025, 2024]) {
    const ap = await apiGet('/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/future-factory/production/archive/' + year + '/planning?pageSize=300');
    const am = (ap.documents || []).filter(d =>
      String(d.name).includes(ORDER_ID) || strVal((d.fields || {}).orderId) === ORDER_ID
    );
    if (am.length > 0) {
      am.forEach(d => {
        const f = d.fields || {};
        console.log('  Archief', year, ':', shortPath(d.name), '| status:', strVal(f.status));
      });
    } else {
      console.log('  Archief', year + ': geen');
    }
  }
}

main().catch(e => { console.error(e.message || String(e)); process.exit(1); });
