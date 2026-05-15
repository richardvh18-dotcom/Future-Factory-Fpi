import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";
const normalizeCode = (value) => String(value || "").trim().toUpperCase();
const compactCode = (value) => normalizeCode(value).replace(/[^A-Z0-9]/g, "");
const isLikelyCodeValue = (value) => {
    const raw = String(value || "").trim();
    if (!raw)
        return false;
    if (raw.length < 6)
        return false;
    if (/\s/.test(raw))
        return false;
    const normalized = normalizeCode(raw);
    const hasLetter = /[A-Z]/.test(normalized);
    const hasDigit = /\d/.test(normalized);
    return hasLetter && hasDigit;
};
/**
 * Genereer materiaalvarianten: CST (C) ↔ EST (E) op positie 6.
 * Tekeningen maken geen onderscheid tussen materiaaltype.
 */
const materialVariants = (code) => {
    if (!code || code.length < 8)
        return [];
    const c = code.toUpperCase();
    if (c[6] === "C")
        return [c.slice(0, 6) + "E" + c.slice(7)];
    if (c[6] === "E")
        return [c.slice(0, 6) + "C" + c.slice(7)];
    return [];
};
const buildLookupKeys = (value) => {
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
            if (compactToken)
                keys.add(compactToken);
        });
        const lastToken = tokens[tokens.length - 1];
        if (lastToken)
            keys.add(lastToken);
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
export const manualSyncDrawings = async (onProgress) => {
    try {
        console.log(i18n.t("manualsync.start", "Start manual sync..."));
        // 1. Haal alle unieke itemCodes uit de planning
        const planningRef = collection(db, getPathString(PATHS.PLANNING));
        const planningSnap = await getDocs(planningRef);
        const uniqueItems = new Set();
        const planningDocsByCode = new Map();
        const codeSources = new Map();
        planningSnap.docs.forEach((doc) => {
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
                        if (!planningDocsByCode.has(codeStr))
                            planningDocsByCode.set(codeStr, []);
                        // Houd bij uit welk veld deze code kwam
                        if (!codeSources.has(codeStr))
                            codeSources.set(codeStr, new Set());
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
        console.log(i18n.t("manualsync.planning_count", "Planning bevat {count} unieke items om te checken.", { count: total }));
        let current = 0;
        const results = [];
        let savedCount = 0;
        // 2. Haal alle producten op uit de catalogus
        const productsRef = collection(db, getPathString(PATHS.PRODUCTS));
        const productsSnap = await getDocs(productsRef);
        // Indexeer producten op articleCode EN id voor snelle lookup
        const productsByCode = new Map();
        productsSnap.docs.forEach((doc) => {
            const p = doc.data();
            const productData = { id: doc.id, ...p };
            // Helper om te indexeren met normalisatie (fuzzy match support)
            const addToIndex = (key) => {
                if (!key)
                    return;
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
        console.log(i18n.t("manualsync.catalog_count", "Catalogus bevat {count} producten.", { count: productsSnap.size }));
        // 2b. Haal conversies op voor fallback (Old Code -> New Code)
        const conversionsRef = collection(db, getPathString(PATHS.CONVERSION_MATRIX));
        const conversionsSnap = await getDocs(conversionsRef);
        const conversionsByOldCode = new Map();
        conversionsSnap.docs.forEach((doc) => {
            const c = doc.data();
            if (c.targetProductId) {
                const target = normalizeCode(c.targetProductId);
                const targetCompact = compactCode(c.targetProductId);
                const targetKeys = [target, targetCompact].filter(Boolean);
                const indexSource = (source) => {
                    buildLookupKeys(source).forEach((sourceKey) => {
                        if (sourceKey && targetKeys.length > 0) {
                            if (!conversionsByOldCode.has(sourceKey)) {
                                conversionsByOldCode.set(sourceKey, new Set());
                            }
                            const targetSet = conversionsByOldCode.get(sourceKey);
                            targetKeys.forEach((targetKey) => {
                                if (targetKey && targetSet)
                                    targetSet.add(targetKey);
                            });
                        }
                    });
                };
                // Indexeer op manufacturedId (Old Code), Document ID en zoektermen
                if (c.manufacturedId)
                    indexSource(c.manufacturedId);
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
            const findProductByKeys = (keys) => {
                for (const key of keys) {
                    const hit = productsByCode.get(key);
                    if (hit)
                        return hit;
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
                        chunk.forEach((docSnap) => {
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
            }
            else {
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
            if (onProgress)
                onProgress(current, total, results);
        }
        console.log(i18n.t("manualsync.sync_done", "Sync voltooid. {count} matches gevonden en opgeslagen.", { count: savedCount }));
        return results;
    }
    catch (error) {
        console.error(i18n.t("manualsync.error", "Manual Sync Error:"), error);
        throw error;
    }
};
