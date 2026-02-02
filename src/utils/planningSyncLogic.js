import { db } from "../config/firebase";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { lookupProductByManufacturedId } from "./conversionLogic";
import { PATHS } from "../config/dbPaths";

/**
 * Zoekt door alle actieve orders en probeert tekeningen te koppelen
 * op basis van de Conversie Matrix.
 */
export const syncMissingDrawings = async (appId, onProgress) => {
  let stats = { checked: 0, updated: 0, errors: 0 };

  try {
    const planningRef = collection(db, ...PATHS.PLANNING);
    const snapshot = await getDocs(planningRef);

    const ordersToCheck = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((order) => !order.articleCode || !order.drawingUrl);

    const total = ordersToCheck.length;
    console.log(`Start sync voor ${total} orders in digital_planning...`);

    let batch = writeBatch(db);
    let batchCount = 0;

    for (let i = 0; i < total; i++) {
      const order = ordersToCheck[i];
      const planningCode = order.productId || order.manufacturedId;

      if (planningCode) {
        const conversion = await lookupProductByManufacturedId(
          appId,
          planningCode
        );

        if (conversion && conversion.targetProductId) {
          const newCode = conversion.targetProductId;

          let pdfUrl = null;
          let productDoc = null;

          // 1. Zoek Product
          const prodRef = doc(db, ...PATHS.PRODUCTS, newCode);
          const prodSnap = await getDoc(prodRef);

          if (prodSnap.exists()) {
            productDoc = prodSnap.data();
          } else {
            const qProd = query(
              collection(db, ...PATHS.PRODUCTS),
              where("articleCode", "==", newCode)
            );
            const qSnap = await getDocs(qProd);
            if (!qSnap.empty) productDoc = qSnap.docs[0].data();
          }

          if (
            productDoc &&
            productDoc.sourcePdfs &&
            productDoc.sourcePdfs.length > 0
          ) {
            pdfUrl = productDoc.sourcePdfs[0].url;
          }

          // 2. Update Order (in digital_planning)
          const orderRef = doc(db, ...PATHS.PLANNING, order.id);

          const updateData = {
            articleCode: newCode,
            isConverted: true,
          };

          if (pdfUrl) {
            updateData.drawingUrl = pdfUrl;
            updateData.hasDrawing = true;
          }

          if (!order.description && conversion.description)
            updateData.description = conversion.description;

          batch.update(orderRef, updateData);
          batchCount++;
          stats.updated++;
        }
      }

      stats.checked++;
      if (onProgress) onProgress(Math.round((i / total) * 100));

      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Fout tijdens sync:", error);
    stats.errors++;
  }

  return stats;
};
