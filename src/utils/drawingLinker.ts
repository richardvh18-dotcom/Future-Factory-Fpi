// Service voor het koppelen van tekeningen aan orders
import { collection, getDocs } from "firebase/firestore";
import { db, auth, logActivity } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
import { patchPlanningOrderMetadata } from "../services/planningSecurityService";
import i18n from "../i18n";

type DrawingProductEntry = {
  id: string;
  drawing?: string;
  articleCode?: unknown;
  manufacturedId?: unknown;
  erpCode?: unknown;
  productCode?: unknown;
  [key: string]: unknown;
};

type DrawingConversionEntry = {
  targetProductId?: unknown;
  manufacturedId?: unknown;
  searchTerms?: unknown[];
};

type DrawingOrderInput = Record<string, unknown> | null | undefined;

const normalizeCode = (value: unknown): string => String(value || "").trim().toUpperCase();
const compactCode = (value: unknown): string => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

/**
 * Genereer materiaalvarianten: CST (C) ↔ EST (E) op positie 6.
 * Tekeningen maken geen onderscheid tussen materiaaltype.
 */
const materialVariants = (code: string): string[] => {
  if (!code || code.length < 8) return [];
  const c = code.toUpperCase();
  if (c[6] === "C") return [c.slice(0, 6) + "E" + c.slice(7)];
  if (c[6] === "E") return [c.slice(0, 6) + "C" + c.slice(7)];
  return [];
};

/**
 * Bouw meerdere lookup-keys voor een code (inclusief underscore-splits en materiaalvarianten)
 */
const buildLookupKeys = (value: unknown): string[] => {
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
export const findDrawingForOrder = async (order: DrawingOrderInput): Promise<string | null> => {
  const rawCode = order?.itemCode || order?.item || order?.productId || order?.manufacturedId || order?.articleCode;
  if (!rawCode) return null;

  try {
    // --- Stap 1: Bouw lookup keys voor de broncode ---
    const lookupKeys = buildLookupKeys(rawCode);

    // --- Stap 2: Probeer directe match in catalogus ---
    const productsRef = collection(db, getPathString(PATHS.PRODUCTS));
    const productsSnap = await getDocs(productsRef);

    // Indexeer alle producten op hun codes
    const productIndex = new Map<string, DrawingProductEntry>();
    productsSnap.docs.forEach((d) => {
      const p = d.data() as Record<string, unknown>;
      const entry: DrawingProductEntry = { id: d.id, ...p };
      const addKey = (k: unknown): void => {
        if (!k) return;
        buildLookupKeys(k).forEach((lk) => {
          if (lk) productIndex.set(lk, entry);
        });
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
        return result;
      }
    }

    // --- Stap 3: Zoek via Conversie Matrix ---
    const convRef = collection(db, getPathString(PATHS.CONVERSION_MATRIX));
    const convSnap = await getDocs(convRef);

    // Bouw map: sourceKey → Set<targetKeys>
    const conversionMap = new Map<string, Set<string>>();
    convSnap.docs.forEach((d) => {
      const c = d.data() as DrawingConversionEntry;
      if (!c.targetProductId) return;

      const targetKeys = buildLookupKeys(c.targetProductId);
      const indexSource = (src: unknown): void => {
        buildLookupKeys(src).forEach((sk) => {
          let targetSet = conversionMap.get(sk);
          if (!targetSet) {
            targetSet = new Set<string>();
            conversionMap.set(sk, targetSet);
          }
          targetKeys.forEach((tk) => targetSet!.add(tk));
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
          return result;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(i18n.t("drawing.search_error", "Fout bij zoeken tekening:"), error);
    return null;
  }
};

/**
 * Update de order met de gevonden tekening
 */
export const syncOrderDrawing = async (orderId: string, drawing: string): Promise<boolean | undefined> => {
  if (!orderId || !drawing) return;
  try {
    await patchPlanningOrderMetadata({
      orderDocId: orderId,
      patch: {
      drawing: drawing,
      },
      source: "drawingLinker",
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
export const runBatchDrawingSync = async (): Promise<number> => {
  const ordersRef = collection(db, getPathString(PATHS.PLANNING));
  const snap = await getDocs(ordersRef);
  
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    // Alleen actieve orders zonder tekening
    const status = String(data.status || "");
    const drawingValue = String(data.drawing || "");
    if (status !== "completed" && (!drawingValue || drawingValue === "-" || drawingValue === "")) {
      const drawing = await findDrawingForOrder({ ...data, id: d.id });
      if (drawing) {
        await syncOrderDrawing(d.id, drawing);
        count++;
      }
    }
  }
  return count;
};
