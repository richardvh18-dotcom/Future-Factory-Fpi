import { db, auth, logActivity } from "../config/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const MAX_ZPL_LENGTH = 120000;
const MAX_METADATA_LENGTH = 16000;
const MAX_PRINT_QUANTITY = 200;
const PRINTER_ID_PATTERN = /^[a-zA-Z0-9._:-]{2,80}$/;

const sanitizeFirestoreValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFirestoreValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, sanitizeFirestoreValue(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined)
    );
  }
  return value;
};

/**
 * Stuurt een ZPL printopdracht naar de Firestore wachtrij.
 * Deze wordt opgepikt door de lokale Node.js listener op de productievloer.
 * 
 * @param {string} printerId - De ID van de doelmachine/printer (bijv. "BH18-ZEBRA")
 * @param {string} zplData - De ruwe ZPL code
 * @param {object} metadata - Extra info voor logging (orderId, operator, etc.)
 */
export const queuePrintJob = async (printerId, zplData, metadata = {}) => {
  try {
    const normalizedPrinterId = String(printerId || "").trim();
    const normalizedZpl = String(zplData || "");

    if (!PRINTER_ID_PATTERN.test(normalizedPrinterId)) {
      throw new Error("Ongeldige printerId.");
    }

    if (!normalizedZpl || normalizedZpl.length > MAX_ZPL_LENGTH) {
      throw new Error("ZPL payload ontbreekt of is te groot.");
    }

    const requestedQuantity = Number(metadata?.quantity ?? metadata?.copies ?? 1);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > MAX_PRINT_QUANTITY) {
      throw new Error(`Aantal labels moet tussen 1 en ${MAX_PRINT_QUANTITY} liggen.`);
    }

    const queueRef = collection(db, "future-factory", "production", "print_queue");
    const sanitizedMetadata = sanitizeFirestoreValue({
      ...metadata,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      requesterEmail: auth.currentUser?.email || "unknown"
    });

    if (JSON.stringify(sanitizedMetadata || {}).length > MAX_METADATA_LENGTH) {
      throw new Error("Metadata is te groot.");
    }
    
    const jobData = {
      printerId: normalizedPrinterId,
      zpl: normalizedZpl,
      status: "pending", // pending -> printing -> completed
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "unknown",
      metadata: sanitizedMetadata,
      retryCount: 0
    };

    const docRef = await addDoc(queueRef, jobData);
    await logActivity(
      auth.currentUser?.uid,
      "PRINT_QUEUE_ADD",
      `Printjob in wachtrij gezet: ${docRef.id} (${printerId})`
    );
    console.log(`Print job queued with ID: ${docRef.id} for printer: ${printerId}`);
    return docRef.id;
  } catch (error) {
    console.error("Error queuing print job:", error);
    throw error;
  }
};

/**
 * Helper om de juiste printer ID te bepalen op basis van station
 */
export const getPrinterIdForStation = (stationId) => {
  // Mapping kan later uit database komen
  const mapping = {
    'BH18': 'BH18-ZEBRA-USB',
    'BM01': 'BM01-ZEBRA-USB'
  };
  return mapping[stationId] || 'DEFAULT-PRINTER';
};