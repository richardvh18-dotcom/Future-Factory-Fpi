#!/usr/bin/env node
/**
 * audit-40bh18-orders-via-cli-auth.cjs
 *
 * Leest alle docs uit:
 *   future-factory/production/digital_planning/Fittings/machines/40BH18/orders
 *
 * en rapporteert welke orders er NIET meer thuishoren:
 *
 *   A) Verkeerde machine  — het veld `machine` (of `currentStation` / `wc`) normaliseert
 *                           naar iets anders dan 40BH18.
 *   B) Al gearchiveerd   — docId of orderId staat in archief/{year}/planning (2023-2026).
 *   C) Afgeronde status  — status = completed / archived / gereed / done / afgesloten /
 *                          finished / afkeur / rejected / archived_rejected
 *   D) Leeg / ongeldig   — geen orderId en geen orderNumber veld.
 *
 * Puur read-only, geen schrijfoperaties.
 *
 * Usage:
 *   node scripts/audit-40bh18-orders-via-cli-auth.cjs
 *   node scripts/audit-40bh18-orders-via-cli-auth.cjs --project=my-project-id
 *   node scripts/audit-40bh18-orders-via-cli-auth.cjs --json          # JSON output
 *   node scripts/audit-40bh18-orders-via-cli-auth.cjs --verbose       # ook de OK-orders
 */

'use strict';

const fs       = require('fs');
const https    = require('https');
const { execSync } = require('child_process');

// ─────────────────────────────── args ───────────────────────────────────────
const args       = process.argv.slice(2);
const JSON_OUT   = args.includes('--json');
const VERBOSE    = args.includes('--verbose');
const argValue   = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const found  = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) || fallback : fallback;
};
const PROJECT_ID = argValue('project') || process.env.FIREBASE_PROJECT_ID || 'future-factory-377ef';

// ─────────────────────────── Firestore paths ────────────────────────────────
const BASE             = 'future-factory';
const PLANNING_BH18    = `${BASE}/production/digital_planning/Fittings/machines/40BH18/orders`;
const ARCHIVE_YEARS    = [2023, 2024, 2025, 2026];
const archivePath      = (year) => `${BASE}/production/archive/${year}/planning`;

// ─────────────────────── machine normalization ──────────────────────────────
const normalizeMachine = (rawValue = '') => {
  let token = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!token) return '';
  if (token === 'BM18') token = 'BH18';
  if (token === '40BM18') token = '40BH18';
  if (/^40(BH|BM|BA)\d+$/.test(token)) return token;
  if (/^(BH|BM|BA)\d+$/.test(token))   return `40${token}`;
  const match = token.match(/(40)?(BH|BM|BA)\d+/);
  if (!match) return token || '';
  const full = match[0];
  return full.startsWith('40') ? full : `40${full}`;
};

// ─────────────────────────── status sets ────────────────────────────────────
const COMPLETED_STATUSES = new Set([
  'completed', 'archived', 'gereed', 'finished', 'done', 'afgesloten',
  'rejected', 'afkeur', 'archived_rejected',
]);
const isCompletedStatus = (s) =>
  COMPLETED_STATUSES.has(String(s || '').toLowerCase().trim());

// ─────────────────────────── token helpers ──────────────────────────────────
const readFreshToken = () => {
  try {
    return String(
      execSync('firebase auth:print-access-token', {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }) || ''
    ).trim();
  } catch { return ''; }
};

const readTokenFromConfig = () => {
  try {
    const p = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
    if (!fs.existsSync(p)) return '';
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return String(parsed?.tokens?.access_token || '').trim();
  } catch { return ''; }
};

const getToken = () => {
  const token = readFreshToken() || readTokenFromConfig();
  if (!token) throw new Error(
    'Geen geldig Firebase access_token.\nRun eerst:  firebase login  of  firebase auth:print-access-token'
  );
  return token;
};

// ─────────────────────────── REST helpers ───────────────────────────────────
const DB_PREFIX  = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const apiGet = (path, token) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'firestore.googleapis.com',
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode === 404) return resolve(null);
          const parsed = (() => { try { return JSON.parse(data); } catch { return {}; } })();
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`GET ${path} → HTTP ${res.statusCode}: ${parsed?.error?.message || data}`));
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });

/** Pagineer door een collection; geeft array van Firestore doc-objecten. */
const listAllDocs = async (token, collectionPath) => {
  const docs = [];
  let pageToken = '';
  do {
    const qp  = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const path = `${DB_PREFIX}/${collectionPath}?pageSize=300${qp}`;
    const resp = await apiGet(path, token);
    if (!resp) break;
    if (Array.isArray(resp.documents)) docs.push(...resp.documents);
    pageToken = resp.nextPageToken || '';
  } while (pageToken);
  return docs;
};

// ─────────────────────────── value helpers ──────────────────────────────────
const strVal = (f) => {
  if (!f) return '';
  if (f.stringValue  !== undefined) return String(f.stringValue  || '');
  if (f.integerValue !== undefined) return String(f.integerValue || '');
  if (f.doubleValue  !== undefined) return String(f.doubleValue  || '');
  return '';
};

const tsVal = (f) => {
  if (!f) return '';
  if (f.timestampValue) return String(f.timestampValue);
  if (f.stringValue)    return String(f.stringValue);
  return '';
};

const extractDocId = (fullName, collectionPath) => {
  const needle = `/documents/${collectionPath}/`;
  const idx = String(fullName || '').indexOf(needle);
  if (idx === -1) return '';
  const rest = fullName.slice(idx + needle.length);
  if (rest.includes('/')) return '';   // sub-collection, skip
  return rest;
};

const orderIdFromDoc = (doc) => {
  const f = doc.fields || {};
  return strVal(f.orderId) || strVal(f.orderNumber) || '';
};

const orderIdFromDocId = (docId) => {
  const m = String(docId || '').match(/^(N\d+)/i);
  return m ? m[1].toUpperCase() : '';
};

// ─────────────────────────────── main ───────────────────────────────────────
const main = async () => {
  if (!JSON_OUT) {
    console.log('\n=== AUDIT: 40BH18/orders — welke docs horen er niet meer thuis? ===');
    console.log(`Project : ${PROJECT_ID}`);
    console.log(`Pad     : ${PLANNING_BH18}\n`);
  }

  const token = getToken();

  // ── Stap 1: Verzamel alle gearchiveerde docIds / orderIds ─────────────────
  if (!JSON_OUT) process.stdout.write('Archief laden (2023-2026)');
  const archivedDocIds   = new Set();
  const archivedOrderIds = new Set();

  for (const year of ARCHIVE_YEARS) {
    const docs = await listAllDocs(token, archivePath(year));
    for (const doc of docs) {
      const docId = extractDocId(doc.name, archivePath(year));
      if (!docId) continue;
      archivedDocIds.add(docId);
      const oid = orderIdFromDoc(doc) || orderIdFromDocId(docId);
      if (oid) archivedOrderIds.add(oid.toUpperCase());
    }
    if (!JSON_OUT) process.stdout.write('.');
  }
  if (!JSON_OUT) console.log(` klaar (${archivedDocIds.size} docs, ${archivedOrderIds.size} orderIds)\n`);

  // ── Stap 2: Laad 40BH18/orders ───────────────────────────────────────────
  if (!JSON_OUT) process.stdout.write(`40BH18/orders laden...`);
  const planningDocs = await listAllDocs(token, PLANNING_BH18);
  if (!JSON_OUT) console.log(` ${planningDocs.length} docs gevonden\n`);

  // ── Stap 3: Analyseer elk doc ─────────────────────────────────────────────
  const flagged = [];   // orders die er niet thuishoren
  const ok      = [];   // orders die er wel thuishoren

  for (const doc of planningDocs) {
    const docId  = extractDocId(doc.name, PLANNING_BH18);
    if (!docId) continue;

    const f       = doc.fields || {};
    const orderId = orderIdFromDoc(doc) || orderIdFromDocId(docId);
    const status  = strVal(f.status);
    const step    = strVal(f.currentStep) || strVal(f.step);

    // machine-velden (meerdere mogelijke veldnamen)
    const machineRaw =
      strVal(f.machine) || strVal(f.wc) || strVal(f.currentStation) ||
      strVal(f.machineId) || strVal(f.workCenter) || '';
    const machineNorm = normalizeMachine(machineRaw);

    const plannedDate   = tsVal(f.plannedDate)   || tsVal(f.startDate) || '';
    const articleCode   = strVal(f.articleCode)  || strVal(f.article) || '';
    const qty           = strVal(f.quantity)      || strVal(f.qty) || '';

    // ── Criteria ─────────────────────────────────────────────────────────
    const reasons = [];

    // A — Verkeerde machine
    if (machineNorm && machineNorm !== '40BH18') {
      reasons.push(`VERKEERDE_MACHINE (machine="${machineRaw}" → ${machineNorm})`);
    }

    // B — Al in archief
    if (archivedDocIds.has(docId)) {
      reasons.push(`AL_IN_ARCHIEF (docId match)`);
    } else if (orderId && archivedOrderIds.has(orderId.toUpperCase())) {
      reasons.push(`AL_IN_ARCHIEF (orderId ${orderId})`);
    }

    // C — Afgeronde / gearchiveerde status
    if (isCompletedStatus(status)) {
      reasons.push(`AFGERONDE_STATUS (status="${status}")`);
    } else if (isCompletedStatus(step)) {
      reasons.push(`AFGERONDE_STAP (currentStep="${step}")`);
    }

    // D — Leeg / geen orderId
    if (!orderId) {
      reasons.push('GEEN_ORDER_ID');
    }

    const entry = {
      docId,
      orderId:     orderId  || '—',
      status:      status   || '—',
      step:        step     || '—',
      machine:     machineRaw  || '—',
      machineNorm: machineNorm || '—',
      plannedDate: plannedDate || '—',
      articleCode: articleCode || '—',
      qty:         qty || '—',
      reasons,
    };

    if (reasons.length > 0) {
      flagged.push(entry);
    } else {
      ok.push(entry);
    }
  }

  // ── Stap 4: Output ───────────────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify({ flagged, ok }, null, 2));
    return;
  }

  // Groepeer per reden
  const byReason = {};
  for (const e of flagged) {
    for (const r of e.reasons) {
      const key = r.split(' ')[0];
      if (!byReason[key]) byReason[key] = [];
      byReason[key].push(e);
    }
  }

  if (flagged.length === 0) {
    console.log('✅  Geen afwijkingen gevonden — alle docs lijken thuis te horen in 40BH18/orders.');
  } else {
    console.log(`⚠️   ${flagged.length} van ${planningDocs.length} docs zijn gemarkeerd:\n`);

    // Print per categorie
    const categories = [
      { key: 'VERKEERDE_MACHINE', label: 'A) Verkeerde machine' },
      { key: 'AL_IN_ARCHIEF',     label: 'B) Al gearchiveerd' },
      { key: 'AFGERONDE_STATUS',  label: 'C) Afgeronde status' },
      { key: 'AFGERONDE_STAP',    label: 'C) Afgeronde stap' },
      { key: 'GEEN_ORDER_ID',     label: 'D) Geen orderId' },
    ];

    for (const { key, label } of categories) {
      const group = byReason[key];
      if (!group || group.length === 0) continue;
      console.log(`─────────────────────────────────────────────────`);
      console.log(`${label}  (${group.length} docs)`);
      console.log(`─────────────────────────────────────────────────`);
      for (const e of group) {
        const machineInfo = key === 'VERKEERDE_MACHINE'
          ? `  machine: "${e.machine}" → ${e.machineNorm}`
          : `  machine: ${e.machine}`;
        console.log(`  ${e.docId}`);
        console.log(`    orderId: ${e.orderId}  status: ${e.status}  stap: ${e.step}`);
        console.log(`${machineInfo}  datum: ${e.plannedDate}`);
        console.log(`    artikel: ${e.articleCode}  qty: ${e.qty}`);
        if (e.reasons.length > 1) {
          console.log(`    ⚡ ook: ${e.reasons.filter(r => !r.startsWith(key)).join(', ')}`);
        }
        console.log('');
      }
    }
  }

  console.log(`─────────────────────────────────────────────────`);
  console.log(`Samenvatting:`);
  console.log(`  Totaal docs gecontroleerd : ${planningDocs.length}`);
  console.log(`  Gemarkeerd (niet thuis)   : ${flagged.length}`);
  console.log(`  OK (horen wel thuis)      : ${ok.length}`);
  console.log('');

  // Verdere actie
  if (flagged.length > 0) {
    console.log('Volgende stap:');
    console.log('  node scripts/cleanup-archived-orphans-40bh18-via-cli-auth.cjs');
    console.log('  (dry-run eerst, daarna --apply om te verwijderen)\n');
  }

  if (VERBOSE && ok.length > 0) {
    console.log(`\n── OK-orders (${ok.length}) ────────────────────────────────`);
    for (const e of ok) {
      console.log(`  ${e.docId}  status=${e.status}  machine=${e.machine}  datum=${e.plannedDate}`);
    }
  }
};

main().catch((err) => {
  console.error('\n❌ Fout:', err.message);
  process.exit(1);
});
