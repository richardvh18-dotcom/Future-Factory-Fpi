// @ts-nocheck
const { db, admin } = require('../config/firebase');
const { DB_PATHS } = require('../config/dbPaths');

/**
 * Drawing Sync Service - Backend Implementation
 * Matches items in planning with product catalog based on codes.
 */

const normalizeCode = (value) => String(value || "").trim().toUpperCase();
const compactCode = (value) => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

const isLikelyCodeValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (raw.length < 5) return false;
  return !/\s/.test(raw);
};

const materialVariants = (code) => {
  if (!code || code.length < 5) return [];
  const c = code.toUpperCase();
  const variants = new Set();
  
  [4, 6].forEach(idx => {
    if (c.length > idx) {
      if (c[idx] === "C") {
        variants.add(c.slice(0, idx) + "E" + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + " " + c.slice(idx + 1));
      } else if (c[idx] === "E") {
        variants.add(c.slice(0, idx) + "C" + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + c.slice(idx + 1));
        variants.add(c.slice(0, idx) + " " + c.slice(idx + 1));
      }
    }
  });
  return Array.from(variants);
};

const buildLookupKeys = (value) => {
  const raw = String(value || "").trim();
  const normalized = normalizeCode(raw);
  const compact = compactCode(raw);
  const keys = new Set([normalized, compact].filter(Boolean));

  if (normalized.includes("_")) {
    const tokens = normalized.split("_").filter(Boolean);
    tokens.forEach((token) => {
      keys.add(token);
      const ct = compactCode(token);
      if (ct) keys.add(ct);
    });
  }

  for (const k of [...keys]) {
    materialVariants(k).forEach(v => keys.add(v));
  }
  return Array.from(keys);
};

async function executeDrawingSync() {
  console.log("Starting scheduled drawing sync...");
  
  // 1. Get Planning Path
  const planningBase = DB_PATHS.PRODUCTION_PLANNING;
  const planningRef = db.collection(planningBase);
  const planningSnap = await planningRef.get();
  
  // Scoped orders
  const scopedSnap = await db.collectionGroup('orders').get();
  const scopedDocs = scopedSnap.docs.filter(d => d.ref.path.startsWith(planningBase));
  
  const allPlanningDocs = [...planningSnap.docs, ...scopedDocs];
  console.log(`Found ${allPlanningDocs.length} planning documents.`);

  const uniqueItems = new Set();
  const planningDocsByCode = new Map();

  allPlanningDocs.forEach(doc => {
    const data = doc.data();
    const idParts = doc.id.split('_');
    const idCode = idParts.length > 1 ? idParts[idParts.length - 1] : null;

    const candidates = [
      data.itemCode, data.item, data.productId, data.manufacturedId,
      data.articleCode, data.productCode, (idCode && idCode.length > 5 ? idCode : null)
    ];

    candidates.forEach(val => {
      if (val && isLikelyCodeValue(val)) {
        const code = String(val).trim();
        uniqueItems.add(code);
        if (!planningDocsByCode.has(code)) planningDocsByCode.set(code, []);
        planningDocsByCode.get(code).push(doc);
      }
    });
  });

  // 2. Get Products
  const productsRef = db.collection(DB_PATHS.PRODUCTION_PRODUCTS);
  const productsSnap = await productsRef.get();
  const productsByCode = new Map();

  productsSnap.docs.forEach(doc => {
    const p = doc.data();
    const productData = { id: doc.id, ...p };
    const addToIndex = (val) => {
      if (!val) return;
      buildLookupKeys(val).forEach(k => productsByCode.set(k, productData));
    };
    addToIndex(p.name);
    addToIndex(p.articleCode);
    addToIndex(doc.id);
    addToIndex(p.manufacturedId);
  });

  let matchCount = 0;
  
  for (const itemCode of uniqueItems) {
    const lookupKeys = buildLookupKeys(itemCode);
    let match = null;
    for (const key of lookupKeys) {
      if (productsByCode.has(key)) {
        match = productsByCode.get(key);
        break;
      }
    }

    if (match) {
      const docsToUpdate = planningDocsByCode.get(itemCode);
      const batch = db.batch();
      let hasUpdate = false;
      
      docsToUpdate.forEach(d => {
        if (d.data().drawing !== match.id) {
          batch.update(d.ref, { drawing: match.id, lastSyncMatch: admin.firestore.FieldValue.serverTimestamp() });
          hasUpdate = true;
          matchCount++;
        }
      });
      
      if (hasUpdate) {
        await batch.commit();
        // Log successful match
        await db.collection(`${DB_BASE}/settings/drawing_sync_logs`).add({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          code: itemCode,
          productName: match.name || match.id,
          productId: match.id,
          type: 'MATCH_FOUND',
          method: 'AUTOMATIC'
        });
      }
    }
  }

  console.log(`Sync completed. Matched ${matchCount} items.`);
  return { matchCount };
}

module.exports = { executeDrawingSync };
