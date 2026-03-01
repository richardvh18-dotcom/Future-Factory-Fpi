import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

/**
 * Zoekt naar overeenkomsten tussen Planning items en Product Catalogus
 * en slaat deze op in de Conversion Matrix zodat ze direct vindbaar zijn.
 */
export const manualSyncDrawings = async (onProgress) => {
  try {
    console.log(i18n.t("manualsync.start", "Start manual sync..."));

    // 1. Haal alle unieke itemCodes uit de planning
    const planningRef = collection(db, ...PATHS.PLANNING);
    const planningSnap = await getDocs(planningRef);
    
    const uniqueItems = new Set();
    const planningDocsByCode = new Map();
    const codeSources = new Map();

    planningSnap.docs.forEach(doc => {
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
        if (value) {
          const codeStr = String(value).trim();
          if (codeStr) {
            uniqueItems.add(codeStr);
            if (!planningDocsByCode.has(codeStr)) planningDocsByCode.set(codeStr, []);
            
            // Houd bij uit welk veld deze code kwam
            if (!codeSources.has(codeStr)) codeSources.set(codeStr, new Set());
            codeSources.get(codeStr).add(field);

            // Voorkom dubbele docs in de lijst voor deze code
            const list = planningDocsByCode.get(codeStr);
            if (!list.some(d => d.id === doc.id)) {
                list.push(doc);
            }
          }
        }
      });
    });

    const total = uniqueItems.size;
    console.log(i18n.t("manualsync.planning_count", "Planning bevat {count} unieke items om te checken.", { count: total }));

    let current = 0;
    const results = [];
    let savedCount = 0;

    // 2. Haal alle producten op uit de catalogus
    const productsRef = collection(db, ...PATHS.PRODUCTS);
    const productsSnap = await getDocs(productsRef);
    
    // Indexeer producten op articleCode EN id voor snelle lookup
    const productsByCode = new Map();
    productsSnap.docs.forEach(doc => {
      const p = doc.data();
      const productData = { id: doc.id, ...p };
      
      // Helper om te indexeren met normalisatie (fuzzy match support)
      const addToIndex = (key) => {
          if(!key) return;
          const normalized = String(key).trim().toUpperCase();
          if(normalized) {
            productsByCode.set(normalized, productData);
            // Ook 'stripped' versie indexeren (alleen letters/cijfers) voor fuzzy match
            // Bijv: "ABC-123" wordt "ABC123"
            const stripped = normalized.replace(/[^A-Z0-9]/g, "");
            if (stripped && stripped !== normalized && !productsByCode.has(stripped)) {
                productsByCode.set(stripped, productData);
            }
          }
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

    console.log(i18n.t("manualsync.catalog_count", "Catalogus bevat {count} producten.", { count: productsSnap.size }));

    // 2b. Haal conversies op voor fallback (Old Code -> New Code)
    const conversionsRef = collection(db, ...PATHS.CONVERSION_MATRIX);
    const conversionsSnap = await getDocs(conversionsRef);
    const conversionsByOldCode = new Map();

    conversionsSnap.docs.forEach(doc => {
        const c = doc.data();
        if (c.targetProductId) {
            const target = String(c.targetProductId).trim().toUpperCase();
            // Indexeer op manufacturedId (Old Code) en Document ID
            if (c.manufacturedId) conversionsByOldCode.set(String(c.manufacturedId).trim().toUpperCase(), target);
            conversionsByOldCode.set(doc.id.trim().toUpperCase(), target);
        }
    });
    console.log(i18n.t("manualsync.conversion_count", "Conversie matrix geladen: {count} regels.", { count: conversionsByOldCode.size }));
    
    // DEBUG: Toon een sample van beschikbare codes om te vergelijken
    const availableKeys = Array.from(productsByCode.keys()).slice(0, 15);
    console.log(i18n.t("manualsync.available_codes", "Beschikbare product codes (sample):"), availableKeys);

    // 3. Itereer en match
    for (const itemCode of uniqueItems) {
      current++;

      const cleanCode = String(itemCode).trim().toUpperCase();
      let match = productsByCode.get(cleanCode);
      let usedConversion = false;

      // Fallback: Probeer stripped versie als exacte match faalt
      if (!match) {
         const stripped = cleanCode.replace(/[^A-Z0-9]/g, "");
         if (stripped !== cleanCode) {
             match = productsByCode.get(stripped);
         }
      }

      // Fallback 2: Probeer via Conversie Matrix (Old Code -> New Code -> Product)
      if (!match) {
          const targetCode = conversionsByOldCode.get(cleanCode);
          if (targetCode) {
              match = productsByCode.get(targetCode);
              if (match) usedConversion = true;
          }
      }

      // DEBUG: Log de eerste paar pogingen om te zien wat er mis gaat
      if (current <= 5) {
        console.log(`${i18n.t("manualsync.searching", "Zoeken naar item")}: '${itemCode}' (clean: '${cleanCode}') -> ${match ? i18n.t("manualsync.found", "GEVONDEN") : i18n.t("manualsync.not_found", "NIET GEVONDEN")}`);
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
                chunk.forEach(docSnap => {
                    batch.update(docSnap.ref, { drawing: match.id });
                });
                await batch.commit();
            }
            savedCount += docsToUpdate.length;
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
                    chunk.forEach(docSnap => {
                        batch.update(docSnap.ref, { drawing: null });
                    });
                    await batch.commit();
                }
                removedCount = docsWithDrawing.length;
                console.log(i18n.t("manualsync.old_link_removed", { item: itemCode, count: removedCount, defaultValue: `Oude koppeling verwijderd voor: ${itemCode} (${removedCount} items)` }));
            }
        }

        results.push({ 
            code: itemCode, 
            found: false, 
            removed: removedCount > 0,
            sourceFields: Array.from(codeSources.get(itemCode) || [])
        });
      }

      // Update progress UI
      if (onProgress) onProgress(current, total, results);
    }

    console.log(i18n.t("manualsync.sync_done", "Sync voltooid. {count} matches gevonden en opgeslagen.", { count: savedCount }));
    return results;
  } catch (error) {
    console.error(i18n.t("manualsync.error", "Manual Sync Error:"), error);
    throw error;
  }
};