import { db } from "../config/firebase";
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { lookupProductByManufacturedId } from "./conversionLogic";
import { PATHS, getPathString } from "../config/dbPaths";
import { patchPlanningOrderMetadata } from "../services/planningSecurityService";
import i18n from "../i18n";

type SyncStats = {
  checked: number;
  updated: number;
  errors: number;
};

type SyncProgressCallback = (progress: number) => void;

type ConversionLookupResult = {
  targetProductId?: string;
  description?: string;
};

type ProductPdfEntry = string | { url?: string | null } | null;

type ProductDocLike = {
  sourcePdfs?: ProductPdfEntry[];
};

/**
 * Zoekt door alle actieve orders en probeert tekeningen te koppelen
 * op basis van de Conversie Matrix.
 */
export const syncMissingDrawings = async (
  appId: unknown,
  onProgress?: SyncProgressCallback
): Promise<SyncStats> => {
  let stats: SyncStats = { checked: 0, updated: 0, errors: 0 };

  try {
    const planningRef = collection(db, getPathString(PATHS.PLANNING));
    const snapshot = await getDocs(planningRef);

    const ordersToCheck = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, any>))
      .filter((order) => !order.articleCode || !order.drawingUrl);

    const total = ordersToCheck.length;
    console.log(`Start sync voor ${total} orders in digital_planning...`);

    for (let i = 0; i < total; i++) {
      const order = ordersToCheck[i];
      const planningCode = [
        order.productId,
        order.manufacturedId,
        order.itemCode,
        order.item,
        order.articleCode,
      ]
        .map((v) => String(v || "").trim())
        .find(Boolean);

      if (planningCode) {
        const conversion = (await lookupProductByManufacturedId(
          appId,
          planningCode
        )) as ConversionLookupResult | null;

        const resolvedCode = conversion?.targetProductId
          ? String(conversion.targetProductId).trim()
          : String(planningCode).trim();

        if (resolvedCode) {
          const newCode = resolvedCode;

          let pdfUrl: string | null = null;
          let productDoc: ProductDocLike | null = null;

          // 1. Zoek Product
          const prodRef = doc(db, `${getPathString(PATHS.PRODUCTS)}/${newCode}`);
          const prodSnap = await getDoc(prodRef);

          if (prodSnap.exists()) {
            productDoc = prodSnap.data() as ProductDocLike;
          } else {
            const qProd = query(
              collection(db, getPathString(PATHS.PRODUCTS)),
              where("articleCode", "==", newCode)
            );
            const qSnap = await getDocs(qProd);
            if (!qSnap.empty) productDoc = qSnap.docs[0].data() as ProductDocLike;
          }

          if (
            productDoc &&
            productDoc.sourcePdfs &&
            productDoc.sourcePdfs.length > 0
          ) {
            const firstPdf = productDoc.sourcePdfs[0];
            pdfUrl = typeof firstPdf === "string" ? firstPdf : firstPdf?.url || null;
          }

          // 2. Update Order (in digital_planning)
          const updateData: Record<string, any> = {};

          if (conversion?.targetProductId) {
            updateData.articleCode = newCode;
            updateData.isConverted = true;
          }

          if (pdfUrl) {
            updateData.drawingUrl = pdfUrl;
            updateData.hasDrawing = true;
          }

          if (!order.description && conversion?.description)
            updateData.description = conversion.description;

          if (Object.keys(updateData).length > 0) {
            const orderDocId = order.__docPath || order.id;
            await patchPlanningOrderMetadata({
              orderDocId,
              patch: updateData,
              source: "planningSyncLogic",
            });
            stats.updated++;
          }
        }
      }

      stats.checked++;
      if (onProgress) onProgress(Math.round((i / total) * 100));

    }
  } catch (error) {
    console.error(i18n.t("planning.sync_error", "Fout tijdens sync:"), error);
    stats.errors++;
  }

  return stats;
};
