import { db, auth, logActivity } from "../config/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

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
    const queueRef = collection(db, "future-factory", "production", "print_queue");
    const sanitizedMetadata = sanitizeFirestoreValue({
      ...metadata,
      userAgent: navigator.userAgent,
      requesterEmail: auth.currentUser?.email || "unknown"
    });
    
    const jobData = {
      printerId: printerId,
      zpl: zplData,
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