import { db } from "../config/firebase";
import { collection, query, where, getDocs, limit, orderBy, documentId, collectionGroup, getDoc, doc } from "firebase/firestore";
import { PATHS, getPathString } from "../config/dbPaths";

export type AnyRecord = Record<string, any>;

export const normalizeText = (value: unknown): string => String(value || "").toLowerCase().trim();

export const getErrMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err);
};

export const loadFactoryMachinePaths = async (): Promise<Array<{productType: string; machine: string}>> => {
  try {
    const configSnap = await getDoc(doc(db, getPathString(PATHS.FACTORY_CONFIG)));
    if (!configSnap.exists()) return [];
    const data = (configSnap.data() || {}) as Record<string, unknown>;
    const departments = Array.isArray(data.departments) ? data.departments : [];
    const pairs: Array<{productType: string; machine: string}> = [];
    for (const dept of departments as Array<Record<string, unknown>>) {
      const productType = String(dept.name || dept.slug || dept.id || "").trim();
      if (!productType) continue;
      const stations = Array.isArray(dept.stations) ? dept.stations : [];
      for (const station of stations as Array<Record<string, unknown>>) {
        const machine = String(station.name || station.id || "").trim();
        if (machine) pairs.push({ productType, machine });
      }
    }
    return pairs;
  } catch {
    return [];
  }
};

export interface OrderLabelSearchResult {
  results: AnyRecord[];
  diagnostics: string[];
}

export const executeOrderLabelSearch = async (
  orderStr: string,
  initialList: AnyRecord[] = []
): Promise<OrderLabelSearchResult> => {
  let searchStr = orderStr.trim().toUpperCase();
  if (!searchStr) {
    return { results: [], diagnostics: [] };
  }
  
  const diagnostics: string[] = [];
  const addDebug = (msg: string) => {
    diagnostics.push(msg);
  };
  
  addDebug(`🔍 [Search] Genormaliseerde zoekterm: ${searchStr}`);
  
  if (searchStr.includes('/')) {
    searchStr = searchStr.split('/').filter(Boolean).pop() || searchStr;
  }

  const searchOptions: string[] = [searchStr];
  const digitsMatch = searchStr.match(/\d+/);
  if (digitsMatch) {
    const digits = digitsMatch[0];
    if (digits.length >= 3) {
      if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
        searchOptions.push(`N${digits}`, `N20${digits}`, `N200${digits}`, `N21${digits}`, `N210${digits}`, `P${digits}`);
      }
    }
  }

  const uniqueOptions = Array.from(new Set(searchOptions)).slice(0, 15);
  addDebug(`🔍 [Search] Options: ${uniqueOptions.join(', ')}`);

  // Short-circuit fallback for BH18 legacy paths
  if (searchStr.startsWith("N") && searchStr.length >= 6) {
    addDebug("🔍 [Search] Short-circuit geactiveerd voor BH18 fallbacks");
    const targetedPaths = [
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
    ];
    const targetedResults: AnyRecord[] = [];
    for (const path of targetedPaths) {
      try {
        const prefixSnap = await getDocs(
          query(collection(db, path), orderBy(documentId()), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(300))
        );
        addDebug(`${path} => ${prefixSnap.docs.length}`);
        prefixSnap.docs.forEach((d) => {
          targetedResults.push({ id: d.id, ...d.data() });
        });
      } catch (err) {
        addDebug(`${path} => ERROR: ${getErrMsg(err)}`);
      }
    }
    if (targetedResults.length > 0) {
      addDebug(`🎯 [Search] Early targeted BH18 match: ${targetedResults.length}`);
      return { results: targetedResults, diagnostics };
    }
  }

  const colRef = collection(db, getPathString(PATHS.TEMP_PLANNING));
  const planRef = collection(db, getPathString(PATHS.PLANNING));
  const trackRef = collection(db, getPathString(PATHS.TRACKING));
  const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;

  const deepPathQueries: Array<Promise<any>> = [];
  const machinePairs = await loadFactoryMachinePaths();

  for (const { productType, machine } of machinePairs) {
    try {
      const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("orderId", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("orderNumber", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("Order", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("Productieorder", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("order", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("itemCode", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("Item", "in", uniqueOptions), limit(100))).catch(() => null));
      deepPathQueries.push(getDocs(query(collection(db, machinePath), where("Artikel", "in", uniqueOptions), limit(100))).catch(() => null));
      for (const opt of uniqueOptions) {
        deepPathQueries.push(getDocs(query(collection(db, machinePath), where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
      }
    } catch {
      // Silent
    }
  }

  const foundDocs = new Map<string, AnyRecord>();
  const addDocs = (snap: any) => {
    if (snap && snap.docs) {
      snap.docs.forEach((d: any) => foundDocs.set(d.id, { id: d.id, ...d.data() }));
    }
  };
  const addScopedPlanningDocs = (snap: any) => {
    if (snap && snap.docs) {
      snap.docs
        .filter((d: any) => String(d.ref?.path || "").startsWith(planningPrefix))
        .forEach((d: any) => foundDocs.set(d.id, { id: d.id, ...d.data() }));
    }
  };

  // 1. Direct op Document ID
  for (const opt of uniqueOptions) {
    try {
      const docSnap = await getDoc(doc(db, `${getPathString(PATHS.TEMP_PLANNING)}/${opt}`));
      if (docSnap.exists()) foundDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      
      const planDocSnap = await getDoc(doc(db, `${getPathString(PATHS.PLANNING)}/${opt}`));
      if (planDocSnap.exists()) foundDocs.set(planDocSnap.id, { id: planDocSnap.id, ...planDocSnap.data() });
      
      const trackDocSnap = await getDoc(doc(db, `${getPathString(PATHS.TRACKING)}/${opt}`));
      if (trackDocSnap.exists()) foundDocs.set(trackDocSnap.id, { id: trackDocSnap.id, ...trackDocSnap.data() });
    } catch {
      continue;
    }
  }

  // 2. Parallelle exacte zoekopdrachten
  const exactQueries = [
    getDocs(query(colRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(colRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(colRef, where("Order", "in", uniqueOptions))),
    getDocs(query(colRef, where("Productieorder", "in", uniqueOptions))),
    getDocs(query(colRef, where("order", "in", uniqueOptions))),
    getDocs(query(colRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(colRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("productCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("articleCode", "in", uniqueOptions))),
    getDocs(query(colRef, where("Item", "in", uniqueOptions))),
    getDocs(query(colRef, where("Artikel", "in", uniqueOptions))),
    getDocs(query(colRef, where("itemDescription", "in", uniqueOptions))),
    getDocs(query(planRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(planRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(planRef, where("Order", "in", uniqueOptions))),
    getDocs(query(planRef, where("Productieorder", "in", uniqueOptions))),
    getDocs(query(planRef, where("order", "in", uniqueOptions))),
    getDocs(query(planRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(planRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("productCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("articleCode", "in", uniqueOptions))),
    getDocs(query(planRef, where("Item", "in", uniqueOptions))),
    getDocs(query(planRef, where("Artikel", "in", uniqueOptions))),
    getDocs(query(planRef, where("itemDescription", "in", uniqueOptions))),
    getDocs(query(trackRef, where("orderId", "in", uniqueOptions))),
    getDocs(query(trackRef, where("orderNumber", "in", uniqueOptions))),
    getDocs(query(trackRef, where("Order", "in", uniqueOptions))),
    getDocs(query(trackRef, where("order", "in", uniqueOptions))),
    getDocs(query(trackRef, where("originalOrderId", "in", uniqueOptions))),
    getDocs(query(trackRef, where("itemCode", "in", uniqueOptions))),
    getDocs(query(trackRef, where("item", "in", uniqueOptions))),
    getDocs(query(trackRef, where("itemDescription", "in", uniqueOptions)))
  ];
  const exactSnaps = await Promise.all(exactQueries.map(p => p.catch(() => null)));
  exactSnaps.forEach(addDocs);

  const deepPathSnaps = await Promise.all(deepPathQueries);
  deepPathSnaps.forEach(addDocs);

  const scopedExactQueries = [
    getDocs(query(collectionGroup(db, "orders"), where("orderId", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("orderNumber", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("Order", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("Productieorder", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("order", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("itemCode", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("Item", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "orders"), where("Artikel", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "items"), where("orderId", "in", uniqueOptions), limit(40))),
    getDocs(query(collectionGroup(db, "items"), where("orderNumber", "in", uniqueOptions), limit(40))),
  ];
  for (const opt of uniqueOptions.slice(0, 10)) {
    scopedExactQueries.push(
      getDocs(query(collectionGroup(db, "orders"), where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(25))),
      getDocs(query(collectionGroup(db, "items"), where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(25)))
    );
  }
  const scopedExactSnaps = await Promise.all(scopedExactQueries.map(p => p.catch(() => null)));
  scopedExactSnaps.forEach(addScopedPlanningDocs);

  if (foundDocs.size === 0 && searchStr.length >= 3) {
    const broadScopedSnap = await getDocs(query(collectionGroup(db, "orders"), limit(2000))).catch(() => null);
    if (broadScopedSnap && broadScopedSnap.docs) {
      const normalizedSearch = normalizeText(searchStr);
      broadScopedSnap.docs
        .filter((d) => String(d.ref?.path || "").startsWith(planningPrefix))
        .forEach((d) => {
          const data = d.data() || {};
          const idText = normalizeText(d.id);
          const orderText = normalizeText(data.orderId || data.orderNumber || data.Order || data.Productieorder || data.order || "");
          const productText = normalizeText(data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "");
          if (idText.startsWith(normalizedSearch) || orderText.includes(normalizedSearch) || productText.includes(normalizedSearch)) {
            foundDocs.set(d.id, { id: d.id, ...data });
          }
        });
    }
  }
    
  // 3. 'Begint met' zoekopdrachten
  if (foundDocs.size < 5 && searchStr.length >= 3) {
    const startOptions = [searchStr];
    if (digitsMatch && digitsMatch[0].length >= 3) {
        if (!searchStr.startsWith('N') && !searchStr.startsWith('P')) {
            startOptions.push(`N200${digitsMatch[0]}`, `N20${digitsMatch[0]}`, `N210${digitsMatch[0]}`, `N21${digitsMatch[0]}`);
        }
    }
    
    const startsWithQueries: Array<Promise<any>> = [];
    Array.from(new Set(startOptions)).forEach(opt => {
        startsWithQueries.push(getDocs(query(colRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(colRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(planRef, where("description", ">=", opt), where("description", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("orderNumber", ">=", opt), where("orderNumber", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("item", ">=", opt), where("item", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("itemDescription", ">=", opt), where("itemDescription", "<=", opt + "\uf8ff"), limit(10))));
        startsWithQueries.push(getDocs(query(trackRef, where("productCode", ">=", opt), where("productCode", "<=", opt + "\uf8ff"), limit(10))));
    });

    const startSnaps = await Promise.all(startsWithQueries.map(p => p.catch(() => null)));
    startSnaps.forEach(addDocs);

    const scopedStartsWithQueries: Array<Promise<any>> = [];
    Array.from(new Set(startOptions)).forEach((opt) => {
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where(documentId(), ">=", opt), where(documentId(), "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("itemCode", ">=", opt), where("itemCode", "<=", opt + "\uf8ff"), limit(25))));
      scopedStartsWithQueries.push(getDocs(query(collectionGroup(db, "orders"), where("Item", ">=", opt), where("Item", "<=", opt + "\uf8ff"), limit(25))));
    });
    const scopedStartSnaps = await Promise.all(scopedStartsWithQueries.map((p) => p.catch(() => null)));
    scopedStartSnaps.forEach(addScopedPlanningDocs);
    
    const deepPathRangeQueries: Array<Promise<any>> = [];
    for (const { productType, machine } of machinePairs) {
      try {
        const machinePath = `${getPathString(PATHS.PLANNING)}/${productType}/machines/${machine}/orders`;
        Array.from(new Set(startOptions)).forEach((opt) => {
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("orderId", ">=", opt), where("orderId", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("order", ">=", opt), where("order", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Order", ">=", opt), where("Order", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Productieorder", ">=", opt), where("Productieorder", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("itemCode", ">=", opt), where("itemCode", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
            deepPathRangeQueries.push(getDocs(query(collection(db, machinePath), where("Item", ">=", opt), where("Item", "<=", opt + "\uf8ff"), limit(25))).catch(() => null));
        });
      } catch {
        // Silent
      }
    }
    const deepPathRangeSnaps = await Promise.all(deepPathRangeQueries.map(p => p.catch(() => null)));
    deepPathRangeSnaps.forEach(addDocs);
  }

  const queryText = normalizeText(searchStr);
  const clientMatches = initialList.filter((item) => {
    const orderText = normalizeText(item.orderId || item.orderNumber || item.Order || item.Productieorder || item.order || "");
    const productText = normalizeText(item.item || item.itemCode || item.Item || item.Artikel || item.description || item.Description || item.Omschrijving);
    const idText = normalizeText(item.id || "");
    return orderText.includes(queryText) || productText.includes(queryText) || idText.startsWith(queryText);
  });

  const merged = new Map<string, AnyRecord>();
  Array.from(foundDocs.values()).forEach((item) => merged.set(item.id, item));
  clientMatches.forEach((item) => merged.set(item.id, item));

  let finalResults = Array.from(merged.values());

  if (finalResults.length === 0 && searchStr.length >= 3) {
    const broadSnap = await getDocs(query(collectionGroup(db, "orders"), limit(4000))).catch(() => null);
    if (broadSnap && broadSnap.docs) {
      const fallbackMatches: AnyRecord[] = [];
      broadSnap.docs.forEach((d) => {
        const path = String(d.ref?.path || "");
        if (!path.startsWith(planningPrefix)) return;
        const data = d.data() || {};
        const idText = normalizeText(d.id);
        const orderText = normalizeText(data.orderId || data.orderNumber || data.Order || data.Productieorder || data.order || "");
        const productText = normalizeText(data.item || data.itemCode || data.Item || data.Artikel || data.description || data.Description || data.Omschrijving || "");
        if (idText.startsWith(queryText) || orderText.includes(queryText) || productText.includes(queryText)) {
          fallbackMatches.push({ id: d.id, ...data });
        }
      });
      finalResults = fallbackMatches;
    }
  }

  if (finalResults.length === 0 && queryText.startsWith("n")) {
    const targetedPaths = [
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/BH18/orders`,
      `${getPathString(PATHS.PLANNING)}/Fittings/machines/40BH18/orders`,
    ];
    const targetedQueries = targetedPaths.map((path) =>
      getDocs(query(collection(db, path), where(documentId(), ">=", searchStr), where(documentId(), "<=", searchStr + "\uf8ff"), limit(250))).catch(() => null)
    );
    const targetedSnaps = await Promise.all(targetedQueries);
    const targetedMatches: AnyRecord[] = [];
    targetedSnaps.forEach((snap) => {
      if (!snap || !snap.docs) return;
      snap.docs.forEach((d) => {
        targetedMatches.push({ id: d.id, ...d.data() });
      });
    });
    if (targetedMatches.length > 0) {
      finalResults = targetedMatches;
    }
  }

  return { results: finalResults, diagnostics };
};
