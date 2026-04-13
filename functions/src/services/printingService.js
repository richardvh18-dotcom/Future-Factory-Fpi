const { db, admin } = require('../config/firebase');

const MAX_ZPL_LENGTH = 120000;
const MAX_METADATA_LENGTH = 16000;
const MAX_PRINT_QUANTITY = 200;
const PRINTER_ID_PATTERN = /^[a-zA-Z0-9._:-]{2,80}$/;

/**
 * Sanitize Firestore values (remove undefined, recursive)
 */
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
 * Queue a print job to the Firestore print queue (server-side)
 * 
 * @param {string} printerId - Printer ID (e.g., "BH18-ZEBRA")
 * @param {string} zplData - Raw ZPL code
 * @param {object} metadata - Extra info for logging
 * @param {object} context - Firebase function context with auth
 * @returns {Promise<string>} - Document ID of queued print job
 */
async function queuePrintJobService(printerId, zplData, metadata = {}, context) {
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

  const sanitizedMetadata = sanitizeFirestoreValue({
    ...metadata,
    requesterEmail: context.auth?.token?.email || "unknown",
    requesterName: context.auth?.token?.name || "unknown"
  });

  if (JSON.stringify(sanitizedMetadata || {}).length > MAX_METADATA_LENGTH) {
    throw new Error("Metadata is te groot.");
  }

  const jobData = {
    printerId: normalizedPrinterId,
    zpl: normalizedZpl,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth?.uid || "unknown",
    metadata: sanitizedMetadata,
    retryCount: 0
  };

  const queueRef = db.collection("future-factory").doc("production").collection("print_queue");
  const docRef = await queueRef.add(jobData);

  console.log(`[Printing] Print job queued: ${docRef.id} (printer: ${printerId})`);
  return docRef.id;
}

module.exports = {
  queuePrintJobService
};
