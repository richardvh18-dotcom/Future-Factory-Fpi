import { db, auth, logActivity } from "../config/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { VERIFICATION_STATUS } from "../data/constants";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";
import {
  saveProductRecord,
  deleteProductRecord,
  verifyProductRecord,
} from "../services/planningSecurityService";

type ProductData = Record<string, unknown> & {
  name?: string;
  lastModifiedBy?: string;
};

type ProductUser = {
  uid?: string;
  role?: string;
  displayName?: string;
  name?: string;
};

/**
 * Product Helpers V8.0
 * Hersteld: deleteProduct functie toegevoegd.
 */

export const fetchProducts = async () => {
  const q = query(
    collection(db, getPathString(PATHS.PRODUCTS)),
    orderBy("lastUpdated", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
};

export const addProduct = async (productData: ProductData): Promise<string | null> => {
  const currentUserId = auth.currentUser?.uid || "unknown";
  const result = await saveProductRecord({ productData }) as Record<string, unknown> | null;
  await logActivity(currentUserId, "PRODUCT_CREATE", `Product created: ${productData.name || "Unknown"}`);
  return (result?.productId as string) || null;
};

export const updateProduct = async (productId: string, productData: ProductData): Promise<void> => {
  const currentUserId = auth.currentUser?.uid || "unknown";
  await saveProductRecord({ productId, productData });
  await logActivity(currentUserId, "PRODUCT_UPDATE", `Product updated: ${productId}`);
};

export const deleteProduct = async (productId: string): Promise<void> => {
  const currentUserId = auth.currentUser?.uid || "unknown";
  await deleteProductRecord(productId);
  await logActivity(currentUserId, "PRODUCT_DELETE", `Product deleted: ${productId}`);
};

export const verifyProduct = async (
  productId: string,
  currentUser: ProductUser,
  currentProductData: ProductData,
): Promise<{ success: boolean; message?: string }> => {
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";

  if (currentProductData.lastModifiedBy === currentUser?.uid && !isAdmin) {
    return {
      success: false,
      message: i18n.t("product.verify_own_change_error", "Vier-ogen principe: Je mag je eigen wijzigingen niet verifiëren."),
    };
  }
  const result = await verifyProductRecord({
    productId,
    actorName: currentUser.displayName || currentUser.name,
  }) as Record<string, unknown> | null;

  if (!result?.ok) {
    return {
      success: false,
      message: (result?.message as string) || i18n.t("product.verify_failed", "Verificatie mislukt."),
    };
  }

  return { success: true };
};
