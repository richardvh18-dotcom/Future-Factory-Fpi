import { db, auth, logActivity } from "../config/firebase";
import { collection, getDocs, query, orderBy, } from "firebase/firestore";
import { PATHS, getPathString } from "../config/dbPaths";
import i18n from "../i18n";
import { saveProductRecord, deleteProductRecord, verifyProductRecord, } from "../services/planningSecurityService";
/**
 * Product Helpers V8.0
 * Hersteld: deleteProduct functie toegevoegd.
 */
export const fetchProducts = async () => {
    const q = query(collection(db, getPathString(PATHS.PRODUCTS)), orderBy("lastUpdated", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
};
export const addProduct = async (productData) => {
    const currentUserId = auth.currentUser?.uid || "unknown";
    const result = await saveProductRecord({ productData });
    await logActivity(currentUserId, "PRODUCT_CREATE", `Product created: ${productData.name || "Unknown"}`);
    return result?.productId || null;
};
export const updateProduct = async (productId, productData) => {
    const currentUserId = auth.currentUser?.uid || "unknown";
    await saveProductRecord({ productId, productData });
    await logActivity(currentUserId, "PRODUCT_UPDATE", `Product updated: ${productId}`);
};
export const deleteProduct = async (productId) => {
    const currentUserId = auth.currentUser?.uid || "unknown";
    await deleteProductRecord(productId);
    await logActivity(currentUserId, "PRODUCT_DELETE", `Product deleted: ${productId}`);
};
export const verifyProduct = async (productId, currentUser, currentProductData) => {
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
    });
    if (!result?.ok) {
        return {
            success: false,
            message: result?.message || i18n.t("product.verify_failed", "Verificatie mislukt."),
        };
    }
    return { success: true };
};
