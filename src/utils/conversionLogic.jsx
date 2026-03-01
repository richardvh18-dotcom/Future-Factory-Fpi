import { db } from "../config/firebase";
import {
  doc,
  getDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  setDoc,
} from "firebase/firestore";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

/**
 * Conversie Logica V5.0 - Volledig Herstel Functionaliteit
 * Beheert de koppeling tussen ERP (Infor-LN) codes en technische tekeningen.
 * Pad: /future-factory/settings/conversions/mapping/records
 */

// --- INTERNE HELPERS ---

/**
 * Bereidt data voor op opslag met gestandaardiseerde velden en zoektermen.
 */
const prepareDataForSave = (data) => {
  const cleanDn = parseInt(data.dn) || 0;
  const cleanPn = parseFloat(data.pn) || 0;

  return {
    manufacturedId: String(data.manufacturedId || "").trim(),
    targetProductId: String(data.targetProductId || "").trim(),
    type: String(data.type || "-"),
    serie: String(data.serie || "-"),
    dn: cleanDn,
    pn: cleanPn,
    description: String(data.description || ""),
    sheet: String(data.sheet || "-"),
    drilling: String(data.drilling || "-"),
    rev: String(data.rev || "-"),
    ends: String(data.ends || "-"),
    // Zoektermen voor makkelijk filteren in de database
    searchTerms: [
      String(data.type || "").toUpperCase(),
      `DN${cleanDn}`,
      `PN${cleanPn}`,
      String(data.manufacturedId || "").toUpperCase(),
      String(data.targetProductId || "").toUpperCase(),
    ],
    updatedAt: new Date().toISOString(),
  };
};

// --- CORE LOGICA VOOR DASHBOARD & TOOLS ---

/**
 * Zoekt een product op basis van de oude (manufacturedId) of nieuwe code (targetProductId).
 */
export const lookupProductByManufacturedId = async (unusedAppId, inputCode) => {
  if (!inputCode) return null;
  const cleanCode = inputCode.trim();

  try {
    const recordsRef = collection(db, ...PATHS.CONVERSION_MATRIX);

    // 1. Directe hit op Document ID (Manufactured ID)
    const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, cleanCode);
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      return { ...snapshot.data(), matchType: "old_code", id: snapshot.id };
    }

    // 2. Zoek in de collectie op Target Product ID
    const q = query(recordsRef, where("targetProductId", "==", cleanCode));
    const querySnap = await getDocs(q);

    if (!querySnap.empty) {
      return {
        ...querySnap.docs[0].data(),
        matchType: "new_code",
        id: querySnap.docs[0].id,
      };
    }

    return null;
  } catch (error) {
    console.error(i18n.t("conversion.lookup_error", "Fout bij lookup conversie:"), error);
    return null;
  }
};

/**
 * Wordt gebruikt in ProductForm om automatisch een match te vinden op basis van specs.
 */
export const findConversionCandidate = async (unusedAppId, specs) => {
  try {
    const recordsRef = collection(db, ...PATHS.CONVERSION_MATRIX);
    // We zoeken op type, DN en PN
    const q = query(
      recordsRef,
      where("type", "==", specs.type),
      where("dn", "==", parseInt(specs.dn)),
      where("pn", "==", parseFloat(specs.pn))
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Filter lokaal op label/serie voor de beste match
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const bestMatch = results.find(
      (r) => r.serie === specs.serie || r.description?.includes(specs.label)
    );

    return bestMatch || results[0];
  } catch (err) {
    console.error(i18n.t("conversion.candidate_error", "Fout bij vinden conversie kandidaat:"), err);
    return null;
  }
};

// --- DATABASE BEHEER (CRUD) ---

export const fetchConversions = async (
  unusedAppId,
  lastDoc = null,
  pageSize = 50,
  searchTerm = ""
) => {
  const conversionsRef = collection(db, ...PATHS.CONVERSION_MATRIX);
  let q = query(conversionsRef, orderBy("manufacturedId"), limit(pageSize));

  if (lastDoc) {
    q = query(
      conversionsRef,
      orderBy("manufacturedId"),
      startAfter(lastDoc),
      limit(pageSize)
    );
  }

  const snapshot = await getDocs(q);
  const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Als er een zoekterm is, filteren we lokaal (voor snelheid in beheer)
  let filteredData = data;
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    filteredData = data.filter(
      (item) =>
        item.manufacturedId.toLowerCase().includes(s) ||
        item.targetProductId.toLowerCase().includes(s) ||
        item.description?.toLowerCase().includes(s)
    );
  }

  return {
    data: filteredData,
    lastDoc: snapshot.docs[snapshot.docs.length - 1],
  };
};

export const createConversion = async (unusedAppId, data) => {
  const docId = String(data.manufacturedId).trim();
  const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, docId);
  await setDoc(docRef, prepareDataForSave(data));
};

export const updateConversion = async (unusedAppId, id, data) => {
  const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, id);
  await updateDoc(docRef, prepareDataForSave(data));
};

export const deleteConversion = async (unusedAppId, id) => {
  const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, id);
  await deleteDoc(docRef);
};

// --- BATCH UPLOAD & PARSING ---

/**
 * Importeert alle items en overschrijft bestaande records met dezelfde Manufactured ID.
 */
export const uploadConversionBatch = async (items, unusedAppId, onProgress) => {
  const batchSize = 400;
  const total = items.length;
  let processed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const oldCode = item["Old Item Code"] || item["Item Code"];
      if (oldCode) {
        const cleanOldCode = String(oldCode).trim();
        const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, cleanOldCode);

        batch.set(
          docRef,
          prepareDataForSave({
            manufacturedId: cleanOldCode,
            targetProductId: item["New Item Code"],
            type: item["Type"],
            serie: item["Serie"],
            dn: item["DN [mm]"] || item["DN"],
            pn: item["PN [bar]"] || item["PN"],
            description: item["Type Description"],
            sheet: item["Sheet"],
            drilling: item["Drilling"],
            rev: item["Rev"],
            ends: item["Ends"],
          }),
          { merge: true }
        );
      }
    });

    await batch.commit();
    processed += chunk.length;
    if (onProgress) onProgress(Math.round((processed / total) * 100));
  }
};

/**
 * Voegt alleen items toe die nog niet in de database staan.
 */
export const uploadNewItemsOnly = async (items, unusedAppId, onProgress) => {
  let added = 0;
  let skipped = 0;
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const oldCode = String(
      item["Old Item Code"] || item["Item Code"] || ""
    ).trim();

    if (oldCode) {
      const docRef = doc(db, ...PATHS.CONVERSION_MATRIX, oldCode);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        await setDoc(
          docRef,
          prepareDataForSave({
            manufacturedId: oldCode,
            targetProductId: item["New Item Code"],
            type: item["Type"],
            serie: item["Serie"],
            dn: item["DN [mm]"] || item["DN"],
            pn: item["PN [bar]"] || item["PN"],
            description: item["Type Description"],
          })
        );
        added++;
      } else {
        skipped++;
      }
    }
    if (onProgress) onProgress(Math.round(((i + 1) / total) * 100));
  }
  return { added, skipped };
};

/**
 * Verwerkt een Excel bestand naar JSON.
 */
export const parseExcel = async (file) => {
  const XLSX = await import("xlsx");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};

/**
 * Verwerkt een CSV string naar JSON.
 */
export const parseCSV = (text) => {
  const lines = text.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i];
      });
      return obj;
    });
};
