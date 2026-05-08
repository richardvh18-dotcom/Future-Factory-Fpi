import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";
import i18n from "../i18n";

const functions = getFunctions(app);
const archivePlanningOrderCallable = httpsCallable(functions, "archivePlanningOrder");

/**
 * Verplaatst een order van de actieve planning naar de juiste archief-collectie.
 * * Strategie:
 * 1. Is de status 'rejected' of reden 'rejected'? -> map: rejected_{JAAR}_planning
 * 2. Anders (completed/manual) -> map: archive_{JAAR}_planning
 * @param {import('../types').PlanningOrder} order - Het volledige order object
 * @param {'completed'|'rejected'|'manual'} reason - Reden van archiveren
 */
export const archiveOrder = async (order, reason) => {
  const orderDocId = order?.__docPath || order?.id;
  if (!order || !orderDocId) {
    console.error(i18n.t("archive.missing_data", "Kan niet archiveren: Gegevens ontbreken"));
    return false;
  }

  // 5. Uitvoeren
  try {
    const res = await archivePlanningOrderCallable({
      orderDocId,
      reason: reason || order.status || "manual",
      source: "archiveService",
    });

    const resData = res?.data as Record<string, unknown> | null;
    const archiveYear = (resData?.archiveYear as number) || new Date().getFullYear();

    console.log(
      i18n.t("archive.success", { order: order.orderId || order.id, year: archiveYear, defaultValue: `Order ${order.orderId || order.id} succesvol verplaatst naar archief (${archiveYear})` })
    );
    return true;
  } catch (error) {
    console.error(i18n.t("archive.error", "Fout bij archiveren:"), error);
    // Gooi de error opnieuw zodat de UI het kan tonen
    throw error;
  }
};
