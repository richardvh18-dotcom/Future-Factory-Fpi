import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Nabewerken Component
 * Toont alle producten die op Nabewerking staan (currentStation/currentStep)
 */
const Nabewerken = ({ products = [] }) => {
  const { t } = useTranslation();

  // Filter producten voor Nabewerking
    const nabewerkingProducts = useMemo(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return products.filter((p) => {
        if (p.currentStep === "Finished" || p.currentStep === "REJECTED") return false;
        const pCleanUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
        const sCleanUpper = (p.currentStep || "").toUpperCase().replace(/\s/g, "");
        // Check createdAt (Firestore Timestamp or ISO string)
        let createdAtDate = null;
        if (p.createdAt) {
          if (typeof p.createdAt.toDate === "function") {
            createdAtDate = p.createdAt.toDate();
          } else if (typeof p.createdAt === "string" || typeof p.createdAt === "number") {
            createdAtDate = new Date(p.createdAt);
          }
        }
        let isToday = false;
        if (createdAtDate) {
          const created = new Date(createdAtDate);
          created.setHours(0, 0, 0, 0);
          isToday = created.getTime() === today.getTime();
        }
        return (
          pCleanUpper === "NABEWERKING" ||
          pCleanUpper === "NABEWERKEN" ||
          pCleanUpper === "NABW" ||
          pCleanUpper.includes("NABEWERK") ||
          sCleanUpper === "NABEWERKING" ||
          sCleanUpper === "NABEWERKEN" ||
          sCleanUpper === "NABW" ||
          sCleanUpper.includes("NABEWERK") ||
          isToday
        );
      });
    }, [products]);

  return (
    <div>
      <h2>{t("digitalplanning.nabewerking.title", "Producten op Nabewerking")}</h2>
      <ul>
        {nabewerkingProducts.length === 0 && <li>{t("digitalplanning.nabewerking.empty", "Geen producten gevonden.")}</li>}
        {nabewerkingProducts.map((p) => (
          <li key={p.id || p.lotNumber}>
            <strong>{p.item || p.id}</strong> — {t("digitalplanning.nabewerking.lot_label", "Lot")}: {p.lotNumber} — {t("digitalplanning.nabewerking.status_label", "Status")}: {p.status}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Nabewerken;
