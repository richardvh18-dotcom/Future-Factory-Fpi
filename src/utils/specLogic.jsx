import i18n from "../i18n";

/**
 * Geeft een lijst van technische specificatie-sleutels terug voor een bepaald producttype.
 * Bijv. voor "Elbow" krijg je ['TW', 'L', 'Angle', ...]
 * Haalt de structuur uit specConfig (meestal generalConfig.specsByType)
 */
export const getSpecKeysForType = (type, specConfig) => {
  if (!type) return [];
  if (specConfig && typeof specConfig === 'object') {
    const specs = specConfig[type];
    if (specs && Array.isArray(specs)) {
      return specs;
    }
  }
  // Fallback voor onbekende types
  return [
    i18n.t("spec.L", "L"),
    i18n.t("spec.Weight", "Weight"),
    i18n.t("spec.Note", "Note")
  ];
};

/**
 * Haalt de standaard tolerantie op voor een specifiek veld
 * (Nu: altijd leeg, tenzij je een config object meegeeft)
 */
export const getToleranceForField = (fieldKey, toleranceConfig) => {
  if (toleranceConfig && typeof toleranceConfig === 'object') {
    return toleranceConfig[fieldKey] || "";
  }
  return "";
};

/**
 * (Optioneel) Helper om specs object te vullen met default lege waarden
 */
export const getStandardSpecsForProduct = (type) => {
  const keys = getSpecKeysForType(type);
  const specs = {};
  keys.forEach((key) => {
    specs[key] = "";
  });
  return specs;
};
