/**
 * dbPaths.js - V33.0 (Audit Log Path Fix)
 * Gecorrigeerd: Paden voor collecties moeten een oneven aantal segmenten hebben.
 */

const BASE = "future-factory";

export const PATHS = {
  // --- PRODUCTIE (Collecties: oneven segmenten) ---
  PRODUCTS: [BASE, "production", "products"],
  PLANNING: [BASE, "production", "digital_planning"],
  TRACKING: [BASE, "production", "tracked_products"],
  MESSAGES: [BASE, "production", "messages"],
  OCCUPANCY: [BASE, "production", "machine_occupancy"],
  INVENTORY: [BASE, "production", "inventory"],

  // --- TECHNISCHE SPECS (Sub-collecties: oneven segmenten) ---
  BORE_DIMENSIONS: [BASE, "production", "dimensions", "bore", "records"],
  CB_DIMENSIONS: [BASE, "production", "dimensions", "cb", "records"],
  TB_DIMENSIONS: [BASE, "production", "dimensions", "tb", "records"],
  FITTING_SPECS: [BASE, "production", "dimensions", "fitting", "records"],
  SOCKET_SPECS: [BASE, "production", "dimensions", "socket", "records"],

  // --- GEBRUIKERS (Collecties: oneven segmenten) ---
  USERS: [BASE, "Users", "Accounts"],
  PERSONNEL: [BASE, "Users", "Personnel"],

  // --- INSTELLINGEN & CONFIG (Documents: even segmenten) ---
  FACTORY_CONFIG: [BASE, "settings", "factory_configs", "main"],
  GENERAL_SETTINGS: [BASE, "settings", "general_configs", "main"],
  MATRIX_CONFIG: [BASE, "settings", "matrix_configs", "main"],
  BLUEPRINTS: [BASE, "settings", "blueprint_configs", "main"],
  LABEL_TEMPLATES: [BASE, "settings", "label_templates"],

  // --- LOGGING & AUDIT (Collecties: oneven segmenten) ---
  ACTIVITY_LOGS: [BASE, "production", "activity_logs"],

  // --- CONVERSIES & MEDIA (Sub-collecties: oneven segmenten) ---
  CONVERSION_MATRIX: [BASE, "settings", "conversions", "mapping", "records"],
  IMAGE_LIBRARY: [BASE, "settings", "media", "images", "records"],
  DRAWING_LIBRARY: [BASE, "settings", "media", "drawings", "records"],
  AI_KNOWLEDGE_BASE: [BASE, "settings", "ai_knowledge_base", "training", "records"],
};

/**
 * isValidPath - Controleert of een pad-sleutel geldig is
 */
export const isValidPath = (key) => {
  return key in PATHS;
};

/**
 * getPath - Veilige helper om een pad op te vragen met foutcontrole.
 */
export const getPath = (key) => {
  if (!PATHS[key]) {
    console.error(
      `❌ DATABASE PAD FOUT: Sleutel '${key}' niet gevonden in dbPaths.js`
    );
    return ["future-factory", "production", "error_fallback"];
  }
  return PATHS[key];
};

export const getPathString = (pathArray) =>
  Array.isArray(pathArray) ? pathArray.join("/") : "";

/**
 * getPlanningArchivePath - Genereert het pad voor gearchiveerde planningen
 * @param {number|string} year - Het jaar van het archief
 * @param {string} type - Type archief ('archive' of 'rejected')
 */
export const getPlanningArchivePath = (year, type = "archive") => {
  return [BASE, "production", `${type}_${year}_planning`];
};

/**
 * Legacy Artifacts Paden - Voor compatibiliteit met bestaande systemen
 * Deze functies genereren dynamische paden voor het artifacts systeem
 */
export const getArtifactsPath = (appId, ...segments) => {
  return ["artifacts", appId, "public", "data", ...segments];
};

export const ARTIFACTS_PATHS = {
  /**
   * Genereer dynamische artifact paden met appId
   * Gebruik: getArtifactsPath(appId, "digital_planning")
   */
  getPlanningPath: (appId) => ["artifacts", appId, "public", "data", "digital_planning"],
  getProductsPath: (appId) => ["artifacts", appId, "public", "data", "products"],
  getConfigPath: (appId) => ["artifacts", appId, "public", "data", "config", "factory_config"],
};
