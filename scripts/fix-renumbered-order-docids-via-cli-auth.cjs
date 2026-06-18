#!/usr/bin/env node
'use strict';

/**
 * Herstelt bestaande omgenummerde lots waarvan de doc-id prefix niet matcht met orderId.
 *
 * Voorbeeld:
 *   doc-id: N20024781_EL4..._402618...
 *   orderId veld: N20024782
 *
 * Dan hoort de doc-id te worden:
 *   N20024782_EL4..._402618...
 *
 * Usage:
 *   node scripts/fix-renumbered-order-docids-via-cli-auth.cjs --order N20024782
 *   node scripts/fix-renumbered-order-docids-via-cli-auth.cjs --order N20024782 --apply
 *   node scripts/fix-renumbered-order-docids-via-cli-auth.cjs --all
 *   node scripts/fix-renumbered-order-docids-via-cli-auth.cjs --all --apply
 */

const fs = require('fs');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = 'future-factory-377ef';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return '';
  return String(args[idx + 1] || '').trim();
};

const ORDER_ID = getArg('--order').toUpperCase();
const SWEEP_ALL = args.includes('--all');
const APPLY = args.includes('--apply');

if (!SWEEP_ALL && !ORDER_ID) {
  console.error('Gebruik: --order <ORDER_ID> of --all is verplicht.');
  process.exit(1);
}

const readFirebaseConfig = () => {
  const configPath = `${os.homedir()}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
};

const getToken = () => {
  try {
    const t = execSync('gcloud auth application-default print-access-token 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (t && t.length > 10) return t;
  } catch (_) {}

  const cfg = readFirebaseConfig();
  const refresh = cfg?.tokens?.refresh_token;
  if (refresh) {
    try {
      const out = execSync(
        `curl -s -X POST 'https://oauth2.googleapis.com/token'` +
          ` -d 'grant_type=refresh_token'` +
          ` -d 'refresh_token=${encodeURIComponent(refresh)}'` +
          ` -d 'client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'` +
          ` -d 'client_secret=j9iVZfS8kkCEFUPaAeJV0sAi'`,
        { encoding: 'utf8' }
      );
      const json = JSON.parse(out);
      if (json.access_token) return json.access_token;
    } catch (_) {}
  }

  throw new Error('Geen geldig access token. Log opnieuw in met firebase login.');
};

const token = getToken();

const apiRequest = (method, path, body = null) =>
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
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, body: parsed });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const clean = (v) => String(v || '').trim();

const strVal = (fieldValue) => {
  if (!fieldValue) return '';
  if (fieldValue.stringValue !== undefined) return String(fieldValue.stringValue);
  if (fieldValue.integerValue !== undefined) return String(fieldValue.integerValue);
  if (fieldValue.doubleValue !== undefined) return String(fieldValue.doubleValue);
  return '';
};

const extractDocId = (fullName) => {
  const parts = String(fullName || '').split('/');
  return parts.length ? parts[parts.length - 1] : '';
};

const isItemsDoc = (fullName) => /\/items\//.test(String(fullName || ''));
const isTrackedOrArchiveItemsDoc = (fullName) => {
  const safe = String(fullName || '');
  return (
    /\/production\/tracked_products\//.test(safe) ||
    /\/production\/archive\/\d{4}\/items\//.test(safe)
  );
};

const buildNewDocId = ({ currentDocId, targetOrderId, lotNumber }) => {
  const safeDocId = clean(currentDocId);
  const safeOrder = clean(targetOrderId).toUpperCase();
  const safeLot = clean(lotNumber);
  if (!safeDocId || !safeOrder) return safeDocId;

  const segments = safeDocId.split('_').filter(Boolean);
  if (segments.length <= 1) {
    return safeLot ? `${safeOrder}_${safeLot}` : `${safeOrder}_${safeDocId}`;
  }

  return `${safeOrder}_${segments.slice(1).join('_')}`;
};

const replaceLastSegment = (fullName, newLastSegment) => {
  const parts = String(fullName || '').split('/');
  if (!parts.length) return fullName;
  parts[parts.length - 1] = newLastSegment;
  return parts.join('/');
};

const fullNameToDocPath = (fullName) => {
  const idx = String(fullName || '').indexOf('/documents/');
  if (idx === -1) return '';
  return String(fullName).slice(idx + '/documents/'.length);
};

const fetchByOrderWithIndex = async (orderId) => {
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'items', allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'orderId' },
          op: 'EQUAL',
          value: { stringValue: orderId },
        },
      },
      limit: 500,
    },
  };

  const resp = await apiRequest('POST', path, body);
  if (resp.status < 200 || resp.status >= 300) {
    const errText = JSON.stringify(resp.body);
    const indexMissing = errText.includes('COLLECTION_GROUP_ASC index');
    if (indexMissing) {
      return { docs: null, indexMissing: true };
    }
    throw new Error(`runQuery mislukt (${resp.status}): ${errText.slice(0, 400)}`);
  }

  const rows = Array.isArray(resp.body) ? resp.body : [];
  return {
    docs: rows
      .map((row) => row.document)
      .filter(Boolean)
      .filter((doc) => isItemsDoc(doc.name))
      .filter((doc) => isTrackedOrArchiveItemsDoc(doc.name)),
    indexMissing: false,
  };
};

const scanAllItemsAndFilterByOrder = async (orderId) => {
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const pageSize = 500;
  const maxPages = 60;
  let cursorName = '';
  let pages = 0;
  const matches = [];

  while (pages < maxPages) {
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'items', allDescendants: true }],
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: pageSize,
        ...(cursorName
          ? {
              startAt: {
                values: [{ referenceValue: cursorName }],
                before: false,
              },
            }
          : {}),
      },
    };

    const resp = await apiRequest('POST', path, body);
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Fallback scan mislukt (${resp.status}): ${JSON.stringify(resp.body).slice(0, 400)}`);
    }

    const rows = Array.isArray(resp.body) ? resp.body : [];
    const docs = rows
      .map((row) => row.document)
      .filter(Boolean)
      .filter((doc) => isItemsDoc(doc.name))
      .filter((doc) => isTrackedOrArchiveItemsDoc(doc.name));
    if (docs.length === 0) break;

    docs.forEach((doc) => {
      const oid = strVal((doc.fields || {}).orderId).toUpperCase();
      if (oid === orderId) matches.push(doc);
    });

    cursorName = docs[docs.length - 1].name;
    pages += 1;
    if (docs.length < pageSize) break;
  }

  return matches;
};

const scanAllTrackedArchiveItems = async () => {
  const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const pageSize = 500;
  const maxPages = 120;
  let cursorName = '';
  let pages = 0;
  const allDocs = [];

  while (pages < maxPages) {
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'items', allDescendants: true }],
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: pageSize,
        ...(cursorName
          ? {
              startAt: {
                values: [{ referenceValue: cursorName }],
                before: false,
              },
            }
          : {}),
      },
    };

    const resp = await apiRequest('POST', path, body);
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`All-items scan mislukt (${resp.status}): ${JSON.stringify(resp.body).slice(0, 400)}`);
    }

    const rows = Array.isArray(resp.body) ? resp.body : [];
    const docs = rows
      .map((row) => row.document)
      .filter(Boolean)
      .filter((doc) => isItemsDoc(doc.name))
      .filter((doc) => isTrackedOrArchiveItemsDoc(doc.name));

    if (docs.length === 0) break;
    allDocs.push(...docs);

    cursorName = docs[docs.length - 1].name;
    pages += 1;
    if (docs.length < pageSize) break;
  }

  return allDocs;
};

const fetchByOrder = async (orderId) => {
  const indexed = await fetchByOrderWithIndex(orderId);
  if (!indexed.indexMissing) {
    return indexed.docs || [];
  }

  console.log('Info: vereiste collectionGroup index ontbreekt, fallback scan wordt gebruikt...');
  return scanAllItemsAndFilterByOrder(orderId);
};

const docExistsByFullName = async (fullName) => {
  const docPath = fullNameToDocPath(fullName);
  if (!docPath) return false;
  const resp = await apiRequest('GET', `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`);
  if (resp.status === 404) return false;
  return resp.status >= 200 && resp.status < 300;
};

const moveDoc = async ({ fromDoc, toFullName }) => {
  const commitPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const nextFields = {
    ...(fromDoc.fields || {}),
    id: { stringValue: extractDocId(toFullName) },
  };
  const body = {
    writes: [
      {
        update: {
          name: toFullName,
          fields: nextFields,
        },
      },
      {
        delete: fromDoc.name,
      },
    ],
  };

  const resp = await apiRequest('POST', commitPath, body);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`commit mislukt (${resp.status}): ${JSON.stringify(resp.body).slice(0, 500)}`);
  }
};

const patchDocIdField = async ({ fullName, fields }) => {
  const commitPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const body = {
    writes: [
      {
        update: {
          name: fullName,
          fields,
        },
      },
    ],
  };

  const resp = await apiRequest('POST', commitPath, body);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`id-field patch mislukt (${resp.status}): ${JSON.stringify(resp.body).slice(0, 500)}`);
  }
};

async function main() {
  console.log('====================================================');
  console.log(' Fix Renumbered Order Doc IDs');
  console.log('====================================================');
  console.log('Order:', SWEEP_ALL ? 'ALL' : ORDER_ID);
  console.log('Mode :', APPLY ? 'APPLY (writes)' : 'DRY-RUN');
  console.log('');

  const docs = SWEEP_ALL
    ? (await scanAllTrackedArchiveItems()).filter((doc) => {
        const oid = strVal((doc.fields || {}).orderId).toUpperCase();
        return !!oid;
      })
    : await fetchByOrder(ORDER_ID);

  if (docs.length === 0) {
    console.log('Geen items gevonden.');
    return;
  }

  const candidates = [];

  docs.forEach((doc) => {
    const targetOrderId = SWEEP_ALL
      ? strVal((doc.fields || {}).orderId).toUpperCase()
      : ORDER_ID;
    if (!targetOrderId) return;

    const currentDocId = extractDocId(doc.name);
    const prefix = clean(currentDocId.split('_')[0]).toUpperCase();
    if (prefix === targetOrderId) return;

    const lotNumber = strVal((doc.fields || {}).lotNumber);
    const newDocId = buildNewDocId({
      currentDocId,
      targetOrderId,
      lotNumber,
    });
    const newFullName = replaceLastSegment(doc.name, newDocId);

    candidates.push({
      fromDoc: doc,
      fromDocId: currentDocId,
      toDocId: newDocId,
      toFullName: newFullName,
      lotNumber,
    });
  });

  if (candidates.length === 0) {
    console.log('Geen docId-mismatch gevonden. Controleer nog op intern id-veld...');
  } else {
    console.log('Gevonden mismatches:', candidates.length);
    candidates.forEach((c, idx) => {
      console.log(`${idx + 1}. ${c.fromDocId} -> ${c.toDocId} | lot=${c.lotNumber || '-'}`);
    });
    console.log('');
  }

  let moved = 0;
  let skipped = 0;
  let idPatched = 0;
  let badOrderPrefix = 0;

  for (const c of candidates) {
    const exists = await docExistsByFullName(c.toFullName);
    if (exists) {
      skipped += 1;
      console.log('SKIP (target bestaat al):', c.toDocId);
      continue;
    }

    if (!APPLY) {
      moved += 1;
      continue;
    }

    await moveDoc(c);
    moved += 1;
    console.log('MOVED:', c.fromDocId, '->', c.toDocId);
  }

  // Tweede pass: docs met correcte doc-id maar stale intern fields.id herstellen.
  for (const doc of docs) {
    const currentDocId = extractDocId(doc.name);
    const targetOrderId = SWEEP_ALL
      ? strVal((doc.fields || {}).orderId).toUpperCase()
      : ORDER_ID;
    if (!targetOrderId) continue;

    const docPrefix = clean(currentDocId.split('_')[0]).toUpperCase();
    if (docPrefix !== targetOrderId) {
      badOrderPrefix += 1;
      continue;
    }

    const currentFieldId = strVal((doc.fields || {}).id);
    if (currentFieldId === currentDocId) continue;

    if (!APPLY) {
      idPatched += 1;
      continue;
    }

    const nextFields = {
      ...(doc.fields || {}),
      id: { stringValue: currentDocId },
    };
    await patchDocIdField({ fullName: doc.name, fields: nextFields });
    idPatched += 1;
    console.log('PATCHED id field:', currentFieldId || '-', '->', currentDocId);
  }

  console.log('');
  console.log('Samenvatting:');
  console.log('  Kandidaten :', candidates.length);
  console.log('  Verwerkt   :', moved);
  console.log('  Overgeslagen:', skipped);
  console.log('  id-field hersteld:', idPatched);
  console.log('  id-field overgeslagen (prefix mismatch):', badOrderPrefix);
  console.log('');

  if (!APPLY) {
    console.log('Dry-run klaar. Voeg --apply toe om echt te schrijven.');
  }
}

main().catch((err) => {
  console.error('FOUT:', err.message || err);
  process.exit(1);
});
