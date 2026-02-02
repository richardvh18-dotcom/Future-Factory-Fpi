import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPlanningArchivePath } from "../config/dbPaths";

// Hulpfunctie om het huidige jaar op te halen
const getCurrentYear = () => new Date().getFullYear();

/**
 * Verplaatst een order van de actieve planning naar de juiste archief-collectie.
 * * Strategie:
 * 1. Is de status 'rejected' of reden 'rejected'? -> map: rejected_{JAAR}_planning
 * 2. Anders (completed/manual) -> map: archive_{JAAR}_planning
 * * @param {string} appId - De huidige applicatie ID (bv. fittings-app-v1)
 * @param {object} order - Het volledige order object
 * @param {string} reason - Reden van archiveren ('completed', 'rejected', 'manual')
 */
export const archiveOrder = async (appId, order, reason) => {
  if (!appId || !order || !order.id) {
    console.error("Kan niet archiveren: Gegevens ontbreken");
    return false;
  }

  const batch = writeBatch(db);
  const year = getCurrentYear();

  // 1. Bepaal het type archief
  let archiveType = "archive";

  // Check of de order status 'rejected' is OF dat de handmatige reden 'rejected' is
  const isRejected =
    order.status === "rejected" ||
    reason === "rejected" ||
    order.status === "REJECTED";

  if (isRejected) {
    archiveType = "rejected";
  }

  // 2. Definieer de paden
  // Bron: De huidige actieve lijst
  const sourceRef = doc(db, ...PATHS.PLANNING, order.id);

  // Doel: De berekende jaar-map
  const targetRef = doc(db, ...getPlanningArchivePath(year, archiveType), order.id);

  // 3. Bereid de data voor het archief voor
  // We voegen meta-data toe over wanneer en waarom het gearchiveerd is
  const archiveData = {
    ...order,
    archivedAt: serverTimestamp(),
    archiveReason: reason || order.status,
    archiveYear: year,
    originalStatus: order.status,
    archivedFrom: "digital_planning",
  };

  // 4. Batch Operatie: Move & Delete (Atomic Transaction)
  // Dit garandeert dat de order pas verwijderd wordt als hij succesvol is gekopieerd.
  batch.set(targetRef, archiveData); // Kopieer
  batch.delete(sourceRef); // Verwijder origineel

  // 5. Uitvoeren
  try {
    await batch.commit();
    console.log(
      `Order ${
        order.orderId || order.id
      } succesvol verplaatst naar archief (${year})`
    );
    return true;
  } catch (error) {
    console.error("Fout bij archiveren:", error);
    // Gooi de error opnieuw zodat de UI het kan tonen
    throw error;
  }
};
