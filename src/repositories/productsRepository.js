/**
 * productsRepository.js
 *
 * Centraliseert alle Firestore-leesbewerkingen voor de productcatalogus.
 * Hooks mogen ALLEEN via dit bestand productdata ophalen.
 *
 * Schrijfbewerkingen gaan altijd via Cloud Functions —
 * zie src/services/planningSecurityService.js (saveProduct, deleteProduct, verifyProduct).
 */
import { collection, query, orderBy, where, getDocs, getDoc, doc, } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';
/**
 * Haalt alle actieve producten op, gesorteerd op meest recent bijgewerkt.
 *
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchAllProducts = async () => {
    const q = query(collection(db, getPathString(PATHS.PRODUCTS)), orderBy('lastUpdated', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
/**
 * Haalt één product op via zijn Firestore document-ID.
 *
 * @param {string} productId
 * @returns {Promise<{id: string, [key: string]: any} | null>}
 */
export const fetchProduct = async (productId) => {
    if (!productId)
        return null;
    const snap = await getDoc(doc(db, getPathString([...PATHS.PRODUCTS, String(productId)])));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
/**
 * Haalt producten op gefilterd op een veld.
 *
 * @param {string} field
 * @param {'=='|'!='|'<'|'<='|'>'|'>='} op
 * @param {*}      value
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchProductsWhere = async (field, op, value) => {
    const q = query(collection(db, getPathString(PATHS.PRODUCTS)), where(field, op, value));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
/**
 * Haalt de gebruikerslijst op (read-only voor admin views).
 *
 * @returns {Promise<Array<{id: string, [key: string]: any}>>}
 */
export const fetchUsers = async () => {
    const snap = await getDocs(collection(db, getPathString(PATHS.USERS)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
