import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS } from "../config/dbPaths";
import i18n from "../i18n";

/**
 * Haalt de ruwe planningsdata op, geschoond en gestructureerd.
 * @param {number} limitCount - Maximaal aantal records (default 50)
 * @returns {Promise<Array>} Array van order objecten
 */
export const getRawPlanningData = async (limitCount = 50) => {
  try {
    const rawPath = PATHS?.PLANNING || "planning";
    const planningPath = Array.isArray(rawPath) ? rawPath : [rawPath];
    const planningRef = collection(db, ...planningPath);

    const q = query(
      planningRef,
      where("status", "in", ["planned", "active", "pending"]),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return [];

    // Sorteer in JavaScript
    const sortedDocs = snapshot.docs.sort((a, b) => {
      const weekA = Number(a.data().week) || 999;
      const weekB = Number(b.data().week) || 999;
      return weekA - weekB;
    });

    // Map naar schoon object
    return sortedDocs.map(doc => {
      const data = doc.data();
      
      const orderId = data.orderNumber || data.orderId || data.id || doc.id || i18n.t("common.unknown", "Onbekend");
      const product = data.productCode || data.product || data.productName || data.articleCode || data.itemCode || data.description || 'N/A';
      const machine = data.machine || data.machineId || data.workstation || i18n.t("planning.unassigned", "Niet toegewezen");
      const week = data.week || data.productionWeek || '?';
      const status = data.status || i18n.t("common.unknown", "Onbekend");
      // Toegevoegd: 'plan' veld uit de logs
      const rawQty = data.quantity || data.amount || data.units || data.total || data.target || data.qty || data.planned || data.plan || 0;
      const quantity = Number(rawQty) || 0;

      return {
        Ordernummer: orderId,
        Product: product,
        Machine: machine,
        Week: week,
        Status: status,
        Aantal: quantity
      };
    });

  } catch (error) {
    console.error("Fout bij ophalen planning context:", error);
    return [];
  }
};

/**
 * Haalt de actuele planningsdata op en formatteert deze voor de AI.
 */
export const getLivePlanningContext = async () => {
  try {
    const orders = await getRawPlanningData(20);

    if (orders.length === 0) {
      return i18n.t("planning.context.no_orders", "CONTEXT: Er zijn momenteel geen actieve orders in de planning gevonden.");
    }

    const ordersSummary = orders.map(o => 
      `- ${i18n.t("planning.order", "Order")} ${o.Ordernummer}: 
         ${i18n.t("planning.product", "Product")}: ${o.Product}
         ${i18n.t("planning.machine", "Machine")}: ${o.Machine}
         ${i18n.t("planning.week", "Week")}: ${o.Week}
         ${i18n.t("planning.status", "Status")}: ${o.Status}
         ${i18n.t("planning.quantity", "Aantal")}: ${o.Aantal}`
    ).join("\n");

    return `
${i18n.t("planning.context.header", "=== HUIDIGE LIVE PLANNING DATA ===")}
${i18n.t("planning.context.intro", "Hieronder staan de actuele orders die nu in het systeem staan. Gebruik deze informatie om vragen over de planning, bezetting en orders te beantwoorden.")}

${ordersSummary}
==================================
`;

  } catch (error) {
    console.error("Fout bij ophalen planning context:", error);
    return i18n.t("planning.context.error", { message: error.message, defaultValue: `CONTEXT WAARSCHUWING: Kon de live planning niet ophalen. Foutmelding: ${error.message}` });
  }
};
