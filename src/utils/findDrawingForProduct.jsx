import { db } from "../config/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { PATHS } from "../config/dbPaths";
import { lookupProductByManufacturedId } from "./conversionLogic";

/**
 * Zoekt de juiste tekening bij een productcode (oud of nieuw) via de conversiematrix en products-collectie.
 * @param {string} manufacturedCode
 * @returns {Promise<Object|null>} product-data met tekening-url of null
 */
export async function findDrawingForProduct(manufacturedCode) {
  // 1. Probeer direct te zoeken op articleCode (meest actuele code)
  let articleCode = manufacturedCode;
  let product;

  const productsRef = collection(db, ...PATHS.PRODUCTS);
  let q = query(productsRef, where("articleCode", "==", articleCode));
  let snap = await getDocs(q);

  if (!snap.empty) {
    product = snap.docs[0].data();
    if (product.drawingUrl || product.imageUrl) {
      return {
        ...product,
        drawingUrl: product.drawingUrl || product.imageUrl,
      };
    }
    // Geen tekening-url gevonden, maar product bestaat wel
    return null;
  }

  // 2. Geen directe match: zoek in conversiematrix naar een nieuwe code
  const conversion = await lookupProductByManufacturedId(null, manufacturedCode);
  if (conversion && conversion.targetProductId) {
    articleCode = conversion.targetProductId;
    q = query(productsRef, where("articleCode", "==", articleCode));
    snap = await getDocs(q);
    if (!snap.empty) {
      product = snap.docs[0].data();
      if (product.drawingUrl || product.imageUrl) {
        return {
          ...product,
          drawingUrl: product.drawingUrl || product.imageUrl,
        };
      }
      return null;
    }
  }
  // Geen product gevonden
  return null;
}
