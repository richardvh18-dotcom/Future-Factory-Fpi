import i18n from "../i18n";

type SpecConfig = Record<string, string[]>;
type ToleranceConfig = Record<string, string>;

/**
 * Geeft een lijst van technische specificatie-sleutels terug voor een bepaald producttype.
 * Bijv. voor "Elbow" krijg je ['TW', 'L', 'Angle', ...]
 * Haalt de structuur uit specConfig (meestal generalConfig.specsByType)
 */
export const getSpecKeysForType = (type: string, specConfig?: SpecConfig): string[] => {
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
export const getToleranceForField = (fieldKey: string, toleranceConfig?: ToleranceConfig): string => {
  if (toleranceConfig && typeof toleranceConfig === 'object') {
    return toleranceConfig[fieldKey] || "";
  }
  return "";
};

/**
 * (Optioneel) Helper om specs object te vullen met default lege waarden
 */
export const getStandardSpecsForProduct = (type: string): Record<string, string> => {
  const keys = getSpecKeysForType(type);
  const specs: Record<string, string> = {};
  keys.forEach((key) => {
    specs[key] = "";
  });
  return specs;
};
