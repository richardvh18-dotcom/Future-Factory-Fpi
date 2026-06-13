import { collection, collectionGroup, getDocs, writeBatch, doc, addDoc, updateDoc, serverTimestamp as firestoreTimestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";

type PlanningDoc = QueryDocumentSnapshot<DocumentData, DocumentData>;

type ProductMatch = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

type SyncResultItem = {
  code: string;
  found: boolean;
  product?: string;
  saved?: boolean;
  fullProduct?: ProductMatch;
  sourceFields: string[];
  viaConversion?: boolean;
  removed?: boolean;
  conversionTarget?: string | null;
};

type SyncProgressCallback = (current: number, total: number, results: SyncResultItem[]) => void;

const normalizeCode = (value: unknown): string => String(value || "").trim().toUpperCase();
const compactCode = (value: unknown): string => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

const isLikelyCodeValue = (value: unknown): boolean => {
  const raw = String(value || "").trim();
  if (!raw) return false;
  // Een code moet minimaal 5 tekens zijn om zinvol te zijn voor matching
  if (raw.length < 5) return false;
  
  // We accepteren nu ook puur numerieke codes of puur tekstuele codes
  // zolang ze maar geen spaties bevatten (wat meestal duidt op een beschrijving ipv code)
  return !/\s/.test(raw);
};

/**
 * Genereer materiaalvarianten: CST (C) ↔ EST (E) op positie 6.
 * Tekeningen maken geen onderscheid tussen materiaaltype.
 */
const materialVariants = (code: string): string[] => {
  if (!code || code.length < 5) return [];
  const c = code.toUpperCase();
  
  const variants = new Set<string>();
  
  // Posities waar we vaak Materiaal (C/E) indicators zien
  // Index 4 (bijv. FLST-E-S...) of Index 6 (bijv. ELMO90-C-...)
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

const buildLookupKeys = (value: unknown): string[] => {
  const raw = String(value || "").trim();
  const normalized = normalizeCode(raw);
  const compact = compactCode(raw);

  const keys = new Set([normalized, compact].filter(Boolean));

  if (normalized.includes("_")) {
    const tokens = normalized
      .split("_")
      .map((part) => part.trim())
      .filter(Boolean);

    tokens.forEach((token) => {
      keys.add(token);
      const compactToken = compactCode(token);
      if (compactToken) keys.add(compactToken);
    });

    const lastToken = tokens[tokens.length - 1];
    if (lastToken) keys.add(lastToken);
  }

  // Materiaalvarianten (CST↔EST)
  for (const k of [...keys]) {
    materialVariants(k).forEach((v) => keys.add(v));
  }

  return Array.from(keys);
};

/**
 * Zoekt naar overeenkomsten tussen Planning items en Product Catalogus
 * en slaat deze op in de Conversion Matrix zodat ze direct vindbaar zijn.
 */
export const manualSyncDrawings = async (onProgress?: SyncProgressCallback): Promise<SyncResultItem[]> => {
  try {
    console.log(i18n.t("manualsync.start", "Start manual sync..."));

    // 1. Haal alle unieke itemCodes uit de planning (zowel root als scoped)
    const planningPath = getPathString(PATHS.PLANNING);
    const planningRef = collection(db, planningPath);
    const planningSnap = await getDocs(planningRef);
    
    // NIEUW: Ook scoped orders ophalen (machines/*/orders)
    // We gebruiken collectionGroup voor "orders" en filteren op het actieve planning pad.
    // LET OP: Hiervoor is de index 'orders' in Firestore vereist.
    console.log("Fetching scoped orders via collectionGroup...");
    let scopedDocs: QueryDocumentSnapshot<DocumentData, DocumentData>[] = [];
    try {
      const scopedSnap = await getDocs(collectionGroup(db, "orders"));
      scopedDocs = scopedSnap.docs.filter(d => d.ref.path.startsWith(planningPath + "/"));
    } catch (err) {
      console.warn("Could not fetch scoped orders via collectionGroup (permission or missing index), falling back to root only:", err);
    }
    
    const allPlanningDocs = [...planningSnap.docs, ...scopedDocs];
    console.log(`Totaal ${allPlanningDocs.length} planning documenten gevonden (Root: ${planningSnap.size}, Scoped: ${scopedDocs.length})`);

    const uniqueItems = new Set<string>();
    const planningDocsByCode = new Map<string, PlanningDoc[]>();
    const codeSources = new Map<string, Set<string>>();

    allPlanningDocs.forEach((doc) => {
      const data = doc.data();
      
      // NIEUW: Parse document ID voor codes zoals N20024040_EL9ACSS0JR02A0BCCBB0
      // We nemen het gedeelte na de laatste underscore als potentiële code
      let idCode = null;
      if (doc.id.includes('_')) {
          const parts = doc.id.split('_');
          const lastPart = parts[parts.length - 1];
          if (lastPart && lastPart.length > 5) {
              idCode = lastPart;
          }
      }

      // VERBETERING: Check alle mogelijke velden ipv alleen de eerste die bestaat
      // Dit vergroot de kans dat we een match vinden als de code in een ander veld staat
      const candidates = [
        { field: 'itemCode', value: data.itemCode },
        { field: 'item', value: data.item },
        { field: 'productId', value: data.productId },
        { field: 'manufacturedId', value: data.manufacturedId },
        { field: 'articleCode', value: data.articleCode },
        { field: 'productCode', value: data.productCode },
        { field: 'docId_parsed', value: idCode }
      ];

      candidates.forEach(({ field, value }) => {
        if (value && isLikelyCodeValue(value)) {
          const codeStr = String(value).trim();
          if (codeStr) {
            uniqueItems.add(codeStr);
            if (!planningDocsByCode.has(codeStr)) planningDocsByCode.set(codeStr, []);
            
            // Houd bij uit welk veld deze code kwam
            if (!codeSources.has(codeStr)) codeSources.set(codeStr, new Set());
            const sourceSet = codeSources.get(codeStr);
            if (sourceSet) {
              sourceSet.add(field);
            }

            // Voorkom dubbele docs in de lijst voor deze code
            const list = planningDocsByCode.get(codeStr);
            if (list && !list.some((d) => d.id === doc.id)) {
                list.push(doc);
            }
          }
        }
      });
    });

    const total = uniqueItems.size;
    console.log(`Unieke codes uit planning: ${total}`);

    let current = 0;
    const results: SyncResultItem[] = [];
    let savedCount = 0;

    // 2. Haal alle producten op uit de catalogus
    const productsPath = getPathString(PATHS.PRODUCTS);
    console.log(`Product catalogus ophalen van: ${productsPath}`);
    const productsRef = collection(db, productsPath);
    const productsSnap = await getDocs(productsRef);
    
    // Indexeer producten op articleCode EN id voor snelle lookup
    const productsByCode = new Map<string, ProductMatch>();
    productsSnap.docs.forEach((doc) => {
      const p = doc.data();
      const productData: ProductMatch = { id: doc.id, ...p };
      
      // Helper om te indexeren met normalisatie (fuzzy match support)
      const addToIndex = (key: unknown) => {
          if(!key) return;
          buildLookupKeys(key).forEach((lookupKey) => {
            if (lookupKey) {
              productsByCode.set(lookupKey, productData);
            }
          });
      };

      // 1. Naam (laagste prioriteit)
      addToIndex(p.name);

      // 2. Codes (hoge prioriteit, overschrijven naam)
      addToIndex(p.articleCode);
      addToIndex(doc.id);
      addToIndex(p.manufacturedId);
      addToIndex(p.erpCode);
      addToIndex(p.productCode);
    });

    // DEBUG: Log ECHT wat we in de catalogus hebben om te vergelijken
    const catalogKeysSample = Array.from(productsByCode.keys()).slice(0, 50);
    const catalogIdsSample = productsSnap.docs.slice(0, 10).map(d => d.id);
    console.log("Catalogus Ids (eerste 10):", catalogIdsSample);
    console.log("Catalogus index sample (keys):", catalogKeysSample);

    // 2b. Haal conversies op voor fallback (Old Code -> New Code)
    const conversionsPath = getPathString(PATHS.CONVERSION_MATRIX);
    const conversionsRef = collection(db, conversionsPath);
    const conversionsSnap = await getDocs(conversionsRef);
    const conversionsByOldCode = new Map<string, Set<string>>();

    conversionsSnap.docs.forEach((doc) => {
        const c = doc.data();
        if (c.targetProductId) {
            const target = normalizeCode(c.targetProductId);
            const targetCompact = compactCode(c.targetProductId);
            const targetKeys = [target, targetCompact].filter(Boolean);

            const indexSource = (source: unknown) => {
              buildLookupKeys(source).forEach((sourceKey) => {
                if (sourceKey && targetKeys.length > 0) {
                  if (!conversionsByOldCode.has(sourceKey)) {
                    conversionsByOldCode.set(sourceKey, new Set());
                  }
                  const targetSet = conversionsByOldCode.get(sourceKey);
                  targetKeys.forEach((targetKey) => {
                    if (targetKey && targetSet) targetSet.add(targetKey);
                  });
                }
              });
            };

            // Indexeer op manufacturedId (Old Code), Document ID en zoektermen
            if (c.manufacturedId) indexSource(c.manufacturedId);
            indexSource(doc.id);
            if (Array.isArray(c.searchTerms)) {
              c.searchTerms.forEach((entry) => indexSource(entry));
            }
        }
    });
    console.log(i18n.t("manualsync.conversion_count", "Conversie matrix geladen: {count} regels.", { count: conversionsByOldCode.size }));
    
    // DEBUG: Toon een sample van beschikbare codes om te vergelijken
    const availableKeys = Array.from(productsByCode.keys()).slice(0, 15);
    console.log(i18n.t("manualsync.available_codes", "Beschikbare product codes (sample):"), availableKeys);

    // 3. Itereer en match
    for (const itemCode of uniqueItems) {
      current++;

      const cleanCode = normalizeCode(itemCode);
      const lookupKeys = buildLookupKeys(itemCode);

      const findProductByKeys = (keys: string[]): ProductMatch | null => {
        for (const key of keys) {
          const hit = productsByCode.get(key);
          if (hit) return hit;
        }
        return null;
      };

      let match = findProductByKeys(lookupKeys);
      let usedConversion = false;

      // Fallback 2: Probeer via Conversie Matrix (Old Code -> New Code -> Product)
      if (!match) {
          for (const sourceKey of lookupKeys) {
            const targetCodes = Array.from(conversionsByOldCode.get(sourceKey) || []);
            if (targetCodes.length > 0) {
              for (const targetCode of targetCodes) {
                match = findProductByKeys(buildLookupKeys(targetCode));
                if (match) {
                  usedConversion = true;
                  break;
                }
              }
              if (match) {
                break;
              }
            }
          }
      }

      // DEBUG: Log de eerste paar pogingen om te zien wat er mis gaat
      if (current <= 10) {
        console.log(`${i18n.t("manualsync.searching", "Zoeken naar item")}: '${itemCode}' (clean: '${cleanCode}') -> Keys:`, lookupKeys, `-> ${match ? i18n.t("manualsync.found", "GEVONDEN") : i18n.t("manualsync.not_found", "NIET GEVONDEN")}`);
      }

      if (match) {
        // MATCH GEVONDEN! Update planning docs direct met drawing link
        console.log(i18n.t("manualsync.match_found", { item: itemCode, name: match.name, id: match.id, defaultValue: `Match found for ${itemCode}: ${match.name} (${match.id})` }));
        const docsToUpdate = planningDocsByCode.get(itemCode);
        if (docsToUpdate && docsToUpdate.length > 0) {
            // Batch updates in chunks of 400
            const chunkSize = 400;
            for (let i = 0; i < docsToUpdate.length; i += chunkSize) {
                const batch = writeBatch(db);
                const chunk = docsToUpdate.slice(i, i + chunkSize);
                chunk.forEach((docSnap) => {
                    batch.update(docSnap.ref, { drawing: match.id });
                });
                try {
                  await batch.commit();
                } catch (batchErr) {
                  console.error(`Fout bij updaten match voor ${itemCode}:`, batchErr);
                  throw batchErr;
                }
            }
            savedCount += docsToUpdate.length;

            // Log succesful manual match
            try {
              const logPath = getPathString(PATHS.GENERAL_SETTINGS).replace('/general_configs/main', '/drawing_sync_logs');
              await addDoc(collection(db, logPath), {
                timestamp: firestoreTimestamp(),
                code: itemCode,
                productName: match.name || match.id,
                productId: match.id,
                type: 'MATCH_FOUND',
                method: 'MANUAL'
              });
            } catch (logErr) {
              console.warn("Log failed:", logErr);
            }
        }

        results.push({ 
            code: itemCode, 
            found: true, 
            product: match.name || match.id, 
            saved: true, 
            fullProduct: match,
            sourceFields: Array.from(codeSources.get(itemCode) || []),
            viaConversion: usedConversion
        });
      } else {
        // GEEN MATCH: Check of we oude koppelingen moeten verwijderen
        const docsToUpdate = planningDocsByCode.get(itemCode);
        let removedCount = 0;

        if (docsToUpdate && docsToUpdate.length > 0) {
            // Filter items die NU een tekening hebben, maar geen match meer zijn
            const docsWithDrawing = docsToUpdate.filter(d => d.data().drawing);
            
            if (docsWithDrawing.length > 0) {
                const chunkSize = 400;
                for (let i = 0; i < docsWithDrawing.length; i += chunkSize) {
                    const batch = writeBatch(db);
                    const chunk = docsWithDrawing.slice(i, i + chunkSize);
                    chunk.forEach((docSnap) => {
                        batch.update(docSnap.ref, { drawing: null });
                    });
                    try {
                      await batch.commit();
                    } catch (batchErr) {
                      console.error(`Fout bij verwijderen tekening voor ${itemCode}:`, batchErr);
                      // We gooien de error niet omhoog om de rest van de sync niet te blokkeren
                    }
                }
                removedCount = docsWithDrawing.length;
                console.log(i18n.t("manualsync.old_link_removed", { item: itemCode, count: removedCount, defaultValue: `Oude koppeling verwijderd voor: ${itemCode} (${removedCount} items)` }));
            }
        }

        results.push({ 
            code: itemCode, 
            found: false, 
            removed: removedCount > 0,
            sourceFields: Array.from(codeSources.get(itemCode) || []),
            conversionTarget: null
        });

        // Voeg conversie target toe als die er is (voor debugging in UI)
        for (const sourceKey of lookupKeys) {
          const targetCodes = Array.from(conversionsByOldCode.get(sourceKey) || []);
          if (targetCodes.length > 0) {
            results[results.length - 1].conversionTarget = targetCodes[0];
            break;
          }
        }
      }

      // Update progress UI
      if (onProgress) onProgress(current, total, results);
    }

    // Update last run date in settings
    try {
      const settingsRef = doc(db, getPathString(PATHS.GENERAL_SETTINGS));
      await updateDoc(settingsRef, {
        lastDrawingSync: firestoreTimestamp()
      });
    } catch (err) {
      console.warn("Failed to update lastDrawingSync:", err);
    }

    console.log(i18n.t("manualsync.sync_done", "Sync voltooid. {count} matches gevonden en opgeslagen.", { count: savedCount }));
    return results;
  } catch (error) {
    console.error(i18n.t("manualsync.error", "Manual Sync Error:"), error);
    throw error;
  }
};