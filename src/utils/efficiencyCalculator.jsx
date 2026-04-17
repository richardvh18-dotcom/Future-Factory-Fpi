import { differenceInMinutes, isValid } from "date-fns";
import i18n from "../i18n";

/**
 * ISO 22400 OEE Calculator & Efficiency Helpers
 * Implementatie van standaard KPI formules voor Manufacturing Execution Systems.
 */

// --- Basic Time Helpers ---

export const calculateDuration = (startTime, endTime = new Date()) => {
  if (!startTime) return 0;
  const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
  const end = endTime.toDate ? endTime.toDate() : new Date(endTime);
  
  if (!isValid(start) || !isValid(end)) return 0;
  return Math.max(0, differenceInMinutes(end, start));
};

export const formatMinutes = (minutes) => {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
};

// --- ISO 22400 KPI Formulas ---

/**
 * Berekent Availability (Beschikbaarheid)
 * ISO 22400 Definitie: Operating Time / Planned Busy Time
 * @param {number} operatingTimeMinutes - Tijd dat machine daadwerkelijk draaide (uptime)
 * @param {number} plannedBusyTimeMinutes - Geplande tijd (minus pauzes/onderhoud)
 * @returns {number} Percentage (0-100)
 */
export const calculateAvailability = (operatingTimeMinutes, plannedBusyTimeMinutes) => {
  if (!plannedBusyTimeMinutes || plannedBusyTimeMinutes === 0) return 0;
  return Math.min(100, (operatingTimeMinutes / plannedBusyTimeMinutes) * 100);
};

/**
 * Berekent Performance (Prestatie)
 * ISO 22400 Definitie: (Actual Output / Target Output) * 100
 * @param {number} actualOutput - Aantal daadwerkelijk geproduceerd
 * @param {number} targetOutput - Doel aantal (gebaseerd op standaard cyclustijd)
 * @returns {number} Percentage (kan > 100% zijn)
 */
export const calculatePerformance = (actualOutput, targetOutput) => {
  if (!targetOutput || targetOutput === 0) return 0;
  return (actualOutput / targetOutput) * 100;
};

/**
 * Berekent Quality (Kwaliteit)
 * ISO 22400 Definitie: Good Quantity / Total Quantity
 * @param {number} goodCount - Aantal goedgekeurde producten
 * @param {number} totalCount - Totaal aantal geproduceerd (Goed + Afkeur)
 * @returns {number} Percentage (0-100)
 */
export const calculateQuality = (goodCount, totalCount) => {
  if (!totalCount || totalCount === 0) return 0;
  return (goodCount / totalCount) * 100;
};

/**
 * Berekent OEE (Overall Equipment Effectiveness)
 * Formule: Availability * Performance * Quality
 * @param {number} availabilityPct - Percentage (0-100)
 * @param {number} performancePct - Percentage (0-100+)
 * @param {number} qualityPct - Percentage (0-100)
 * @returns {number} OEE Percentage (0-100)
 */
export const calculateOEE = (availabilityPct, performancePct, qualityPct) => {
  // OEE is een vermenigvuldiging van de factoren (als decimalen)
  const oee = (availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100);
  return Math.min(100, oee * 100);
};

// --- Operational Helpers (voor UI & Tracking) ---

/**
 * Simpele efficiency berekening op basis van tijd (voor real-time monitoring)
 * Formule: (Target Time / Actual Time) * 100
 */
export const calculateEfficiency = (actualMinutes, targetMinutes) => {
  if (!actualMinutes || actualMinutes === 0) return 0;
  return (targetMinutes / actualMinutes) * 100;
};

export const getEfficiencyColor = (efficiency) => {
  if (efficiency >= 100) return "text-emerald-600 bg-emerald-50 border-emerald-200"; // Excellent
  if (efficiency >= 85) return "text-green-600 bg-green-50 border-green-200"; // Good
  if (efficiency >= 70) return "text-yellow-600 bg-yellow-50 border-yellow-200"; // Average
  if (efficiency >= 50) return "text-orange-600 bg-orange-50 border-orange-200"; // Poor
  return "text-red-600 bg-red-50 border-red-200"; // Critical
};

export const isBehindSchedule = (startTime, targetMinutes) => {
  const elapsed = calculateDuration(startTime);
  return elapsed > targetMinutes;
};

/**
 * Geeft het aantal minuten dat een order afwijkt van de planning.
 * Positief = Achter op schema (te lang bezig)
 * Negatief = Voor op schema (sneller dan gepland)
 */
export const calculateTimeDeviation = (startTime, targetMinutes) => {
  const elapsed = calculateDuration(startTime);
  return elapsed - targetMinutes;
};

/**
 * Berekent de efficiency voor een batch producten.
 * @param {Array} products - Lijst met producten (verwacht actualMinutes/targetMinutes)
 * @returns {number} Efficiency Percentage
 */
export const calculateBatchEfficiency = (products) => {
  if (!Array.isArray(products) || products.length === 0) return 0;

  const totalActual = products.reduce((acc, p) => acc + (Number(p.actualMinutes || p.actualTime || 0)), 0);
  const totalTarget = products.reduce((acc, p) => acc + (Number(p.targetMinutes || p.targetTime || 0)), 0);

  return calculateEfficiency(totalActual, totalTarget);
};

/**
 * Geeft een tekstueel label voor de efficiency score.
 */
export const getEfficiencyLabel = (efficiency) => {
  if (efficiency >= 100) return i18n.t("efficiency.excellent", "Uitstekend");
  if (efficiency >= 85) return i18n.t("efficiency.good", "Goed");
  if (efficiency >= 70) return i18n.t("efficiency.average", "Voldoende");
  if (efficiency >= 50) return i18n.t("efficiency.poor", "Matig");
  return i18n.t("efficiency.critical", "Kritiek");
};