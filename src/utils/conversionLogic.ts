import { db, auth, logActivity } from "../config/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";
import {
  upsertConversionRecord,
  deleteConversionRecord,
  upsertConversionBatch,
} from "../services/planningSecurityService";

type ConversionPayload = Record<string, unknown>;

type ConversionItem = {
  id: string;
  manufacturedId: string;
  targetProductId: string;
  description?: string;
  [key: string]: unknown;
};

type ConversionSpecs = {
  type?: string;
  dn?: string | number;
  pn?: string | number;
  serie?: string;
  label?: string;
};

type ProgressCallback = (value: number) => void;

/**
 * Conversie Logica V5.0 - Volledig Herstel Functionaliteit
 * Beheert de koppeling tussen ERP (Infor-LN) codes en technische tekeningen.
 * Pad: /future-factory/settings/conversions/mapping/records
 */

// --- INTERNE HELPERS ---

/**
 * Bereidt data voor op opslag met gestandaardiseerde velden en zoektermen.
 */
const prepareDataForSave = (data: ConversionPayload) => {
  const cleanDn = parseInt(String(data.dn || "0"), 10) || 0;
  const cleanPn = parseFloat(String(data.pn || "0")) || 0;

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

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase();
const compactCode = (value: unknown) => normalizeCode(value).replace(/[^A-Z0-9]/g, "");
const getActorId = () => auth.currentUser?.uid ?? "SYSTEM";

// --- CORE LOGICA VOOR DASHBOARD & TOOLS ---

/**
 * Zoekt een product op basis van de oude (manufacturedId) of nieuwe code (targetProductId).
 */
export const lookupProductByManufacturedId = async (unusedAppId: unknown, inputCode: unknown) => {
  if (!inputCode) return null;
  const rawCode = String(inputCode).trim();
  const normalizedCode = normalizeCode(rawCode);
  const compactNormalizedCode = compactCode(rawCode);

  if (!normalizedCode) return null;

  try {
    const recordsRef = collection(db, getPathString(PATHS.CONVERSION_MATRIX));

    const toResult = (
      snap: { data: () => Record<string, unknown>; id: string },
      matchType: string
    ) => ({
      ...snap.data(),
      matchType,
      id: snap.id,
    });

    // 0. Directe hit op mogelijke document IDs (raw / upper / compact)
    const docIdCandidates = Array.from(
      new Set([rawCode, normalizedCode, compactNormalizedCode].filter(Boolean))
    );
    for (const candidate of docIdCandidates) {
      const docRef = doc(db, `${getPathString(PATHS.CONVERSION_MATRIX)}/${candidate}`);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return toResult(snapshot, "old_code");
      }
    }

    // 1. Exacte match op Manufactured ID veld
    const qOldExact = query(recordsRef, where("manufacturedId", "==", rawCode));
    const qOldExactSnap = await getDocs(qOldExact);
    if (!qOldExactSnap.empty) {
      return toResult(qOldExactSnap.docs[0], "old_code_field");
    }

    // 2. Exacte match op genormaliseerde Manufactured ID
    if (normalizedCode !== rawCode) {
      const qOldNormalized = query(recordsRef, where("manufacturedId", "==", normalizedCode));
      const qOldNormalizedSnap = await getDocs(qOldNormalized);
      if (!qOldNormalizedSnap.empty) {
        return toResult(qOldNormalizedSnap.docs[0], "old_code_field_normalized");
      }
    }

    // 3. Exacte match op Target Product ID (raw / upper)
    const qNewRaw = query(recordsRef, where("targetProductId", "==", rawCode));
    const qNewRawSnap = await getDocs(qNewRaw);
    if (!qNewRawSnap.empty) {
      return toResult(qNewRawSnap.docs[0], "new_code");
    }

    if (normalizedCode !== rawCode) {
      const qNewNormalized = query(recordsRef, where("targetProductId", "==", normalizedCode));
      const qNewNormalizedSnap = await getDocs(qNewNormalized);
      if (!qNewNormalizedSnap.empty) {
        return toResult(qNewNormalizedSnap.docs[0], "new_code_normalized");
      }
    }

    // 4. Fallback via searchTerms (uppercase codes)
    const qSearchNormalized = query(recordsRef, where("searchTerms", "array-contains", normalizedCode));
    const qSearchNormalizedSnap = await getDocs(qSearchNormalized);
    if (!qSearchNormalizedSnap.empty) {
      return toResult(qSearchNormalizedSnap.docs[0], "search_term");
    }

    if (compactNormalizedCode && compactNormalizedCode !== normalizedCode) {
      const qSearchCompact = query(recordsRef, where("searchTerms", "array-contains", compactNormalizedCode));
      const qSearchCompactSnap = await getDocs(qSearchCompact);
      if (!qSearchCompactSnap.empty) {
        return toResult(qSearchCompactSnap.docs[0], "search_term_compact");
      }
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
export const findConversionCandidate = async (unusedAppId: unknown, specs: ConversionSpecs) => {
  try {
    const recordsRef = collection(db, getPathString(PATHS.CONVERSION_MATRIX));
    // We zoeken op type, DN en PN
    const q = query(
      recordsRef,
      where("type", "==", String(specs.type || "")),
      where("dn", "==", parseInt(String(specs.dn || "0"), 10)),
      where("pn", "==", parseFloat(String(specs.pn || "0")))
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Filter lokaal op label/serie voor de beste match
    const results: ConversionItem[] = snap.docs.map((d) => {
      const raw = d.data() as ConversionPayload;
      return {
        id: d.id,
        ...raw,
        manufacturedId: String(raw.manufacturedId || ""),
        targetProductId: String(raw.targetProductId || ""),
        description: String(raw.description || ""),
      };
    });
    const bestMatch = results.find(
      (r) => String(r.serie || "") === String(specs.serie || "") || r.description?.includes(String(specs.label || ""))
    );

    return bestMatch || results[0];
  } catch (err) {
    console.error(i18n.t("conversion.candidate_error", "Fout bij vinden conversie kandidaat:"), err);
    return null;
  }
};

// --- DATABASE BEHEER (CRUD) ---

export const fetchConversions = async (
  unusedAppId: unknown,
  lastDoc: any = null,
  pageSize = 50,
  searchTerm = ""
) => {
  const conversionsRef = collection(db, getPathString(PATHS.CONVERSION_MATRIX));
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
  const data: ConversionItem[] = snapshot.docs.map((doc) => {
    const raw = doc.data() as ConversionPayload;
    return {
      id: doc.id,
      ...raw,
      manufacturedId: String(raw.manufacturedId || ""),
      targetProductId: String(raw.targetProductId || ""),
      description: String(raw.description || ""),
    };
  });

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

export const createConversion = async (unusedAppId: unknown, data: ConversionPayload) => {
  const docId = String(data.manufacturedId).trim();
  await upsertConversionRecord({
    recordId: docId,
    recordData: prepareDataForSave(data),
  });
  await logActivity(getActorId(), "CONVERSION_CREATE", `Conversie aangemaakt: ${docId}`);
};

export const updateConversion = async (unusedAppId: unknown, id: string, data: ConversionPayload) => {
  await upsertConversionRecord({
    recordId: id,
    recordData: prepareDataForSave(data),
  });
  await logActivity(getActorId(), "CONVERSION_UPDATE", `Conversie bijgewerkt: ${id}`);
};

export const deleteConversion = async (unusedAppId: unknown, id: string) => {
  await deleteConversionRecord(id);
  await logActivity(getActorId(), "CONVERSION_DELETE", `Conversie verwijderd: ${id}`);
};

// --- BATCH UPLOAD & PARSING ---

/**
 * Importeert alle items en overschrijft bestaande records met dezelfde Manufactured ID.
 */
export const uploadConversionBatch = async (
  items: ConversionPayload[],
  unusedAppId: unknown,
  onProgress?: ProgressCallback
) => {
  const total = items.length;
  if (onProgress) onProgress(10);
  await upsertConversionBatch({ items, mode: "merge" });
  if (onProgress) onProgress(100);

  await logActivity(
    getActorId(),
    "CONVERSION_BATCH_UPLOAD",
    `Conversie batch-upload voltooid: ${total} records verwerkt`
  );
};

/**
 * Voegt alleen items toe die nog niet in de database staan.
 */
export const uploadNewItemsOnly = async (
  items: ConversionPayload[],
  unusedAppId: unknown,
  onProgress?: ProgressCallback
) => {
  if (onProgress) onProgress(10);
  const result = await upsertConversionBatch({ items, mode: "new_only" }) as Record<string, unknown> | null;
  if (onProgress) onProgress(100);

  const added = Number(result?.added || 0);
  const skipped = Number(result?.skipped || 0);

  await logActivity(
    getActorId(),
    "CONVERSION_NEWITEMS_UPLOAD",
    `Nieuwe conversie-items upload: toegevoegd ${added}, overgeslagen ${skipped}`
  );
  return { added, skipped };
};

/**
 * Verwerkt een Excel bestand naar JSON.
 */
export const parseExcel = async (file: Blob): Promise<unknown[]> => {
  const XLSX = await import("xlsx");

  return new Promise<unknown[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const target = e.target;
        if (!target) {
          reject(new Error("Bestandslezer gaf geen data terug"));
          return;
        }

        const data = target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve([]);
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet) as unknown[];
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
export const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split("\n");
  const headers = (lines[0] || "").split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || "";
      });
      return obj;
    });
};
