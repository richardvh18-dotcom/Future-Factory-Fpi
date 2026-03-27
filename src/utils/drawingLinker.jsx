// Service voor het koppelen van tekeningen aan orders
import { collection, getDocs, query, where, updateDoc, doc, limit } from "firebase/firestore";
import { db, auth, logActivity } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

const normalizeCode = (value) => String(value || "").trim().toUpperCase();
const compactCode = (value) => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

/**
 * Genereer materiaalvarianten: CST (C) ↔ EST (E) op positie 6.
 * Tekeningen maken geen onderscheid tussen materiaaltype.
 */
const materialVariants = (code) => {
  if (!code || code.length < 8) return [];
  const c = code.toUpperCase();
  if (c[6] === "C") return [c.slice(0, 6) + "E" + c.slice(7)];
  if (c[6] === "E") return [c.slice(0, 6) + "C" + c.slice(7)];
  return [];
};

/**
 * Bouw meerdere lookup-keys voor een code (inclusief underscore-splits en materiaalvarianten)
 */
const buildLookupKeys = (value) => {
  const normalized = normalizeCode(value);
  const compact = compactCode(value);
  const keys = new Set([normalized, compact].filter(Boolean));

  if (normalized.includes("_")) {
    normalized.split("_").filter(Boolean).forEach((token) => {
      keys.add(token.trim());
      const c = compactCode(token);
      if (c) keys.add(c);
    });
  }

  // Materiaalvarianten (CST↔EST)
  for (const k of [...keys]) {
    materialVariants(k).forEach((v) => keys.add(v));
  }

  return Array.from(keys);
};

/**
 * Zoekt een tekening voor een order via de flow:
 * Order(itemCode) -> Conversie Matrix(manufacturedId → targetProductId) -> Catalogus(articleCode → drawing)
 */
export const findDrawingForOrder = async (order) => {
  const rawCode = order.itemCode || order.item || order.productId || order.manufacturedId || order.articleCode;
  if (!rawCode) return null;

  try {
    // --- Stap 1: Bouw lookup keys voor de broncode ---
    const lookupKeys = buildLookupKeys(rawCode);

    // --- Stap 2: Probeer directe match in catalogus ---
    const productsRef = collection(db, ...PATHS.PRODUCTS);
    const productsSnap = await getDocs(productsRef);

    // Indexeer alle producten op hun codes
    const productIndex = new Map();
    productsSnap.docs.forEach((d) => {
      const p = d.data();
      const entry = { id: d.id, ...p };
      const addKey = (k) => {
        if (!k) return;
        buildLookupKeys(k).forEach((lk) => { if (lk) productIndex.set(lk, entry); });
      };
      addKey(p.articleCode);
      addKey(d.id);
      addKey(p.manufacturedId);
      addKey(p.erpCode);
      addKey(p.productCode);
    });

    // Directe match?
    for (const key of lookupKeys) {
      const hit = productIndex.get(key);
      if (hit) {
        const result = hit.drawing || hit.id;
        console.log(`[drawingLinker] Directe match voor '${rawCode}' → product: ${result}`);
        return result;
      }
    }

    // --- Stap 3: Zoek via Conversie Matrix ---
    const convRef = collection(db, ...PATHS.CONVERSION_MATRIX);
    const convSnap = await getDocs(convRef);

    // Bouw map: sourceKey → Set<targetKeys>
    const conversionMap = new Map();
    convSnap.docs.forEach((d) => {
      const c = d.data();
      if (!c.targetProductId) return;

      const targetKeys = buildLookupKeys(c.targetProductId);
      const indexSource = (src) => {
        buildLookupKeys(src).forEach((sk) => {
          if (!conversionMap.has(sk)) conversionMap.set(sk, new Set());
          targetKeys.forEach((tk) => conversionMap.get(sk).add(tk));
        });
      };

      if (c.manufacturedId) indexSource(c.manufacturedId);
      indexSource(d.id);
      if (Array.isArray(c.searchTerms)) c.searchTerms.forEach(indexSource);
    });

    // Zoek via conversie
    for (const sourceKey of lookupKeys) {
      const targets = conversionMap.get(sourceKey);
      if (!targets) continue;
      for (const targetKey of targets) {
        const hit = productIndex.get(targetKey);
        if (hit) {
          const result = hit.drawing || hit.id;
          console.log(`[drawingLinker] Conversie match: '${rawCode}' → '${targetKey}' → product: ${result}`);
          return result;
        }
      }
    }

    console.log(`[drawingLinker] Geen match gevonden voor '${rawCode}'`);
    return null;
  } catch (error) {
    console.error(i18n.t("drawing.search_error", "Fout bij zoeken tekening:"), error);
    return null;
  }
};

/**
 * Update de order met de gevonden tekening
 */
export const syncOrderDrawing = async (orderId, drawing) => {
  if (!orderId || !drawing) return;
  try {
    const orderRef = doc(db, ...PATHS.PLANNING, orderId);
    await updateDoc(orderRef, { 
      drawing: drawing,
      lastUpdated: new Date() 
    });
    await logActivity(
      auth.currentUser?.uid || "system",
      "DRAWING_LINK",
      `Tekening gekoppeld aan order ${orderId}: ${drawing}`
    );
    return true;
  } catch (e) {
    console.error(i18n.t("drawing.update_failed", "Update mislukt:"), e);
    return false;
  }
};

/**
 * Batch functie: Kan gebruikt worden voor de 'nachtelijke' sync.
 * Omdat dit frontend code is, moet dit aangeroepen worden door een admin
 * of verplaatst worden naar een Firebase Cloud Function (Node.js) voor echte automatisering.
 */
export const runBatchDrawingSync = async () => {
  console.log(i18n.t("drawing.batch_start", "Start batch sync..."));
  const ordersRef = collection(db, ...PATHS.PLANNING);
  const snap = await getDocs(ordersRef);
  
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    // Alleen actieve orders zonder tekening
    if (data.status !== "completed" && (!data.drawing || data.drawing === "-" || data.drawing === "")) {
      const drawing = await findDrawingForOrder({ ...data, id: d.id });
      if (drawing) {
        await syncOrderDrawing(d.id, drawing);
        count++;
      }
    }
  }
  console.log(i18n.t("drawing.batch_done", { count, defaultValue: `Batch sync klaar. ${count} orders bijgewerkt.` }));
  return count;
};
