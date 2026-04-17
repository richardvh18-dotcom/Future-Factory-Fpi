const BASE = "future-factory";
const PRODUCTION_PLANNING_PATH = [BASE, "production", "digital_planning"];
const PRODUCTION_PLANNING_PATH_LEGACY = [BASE, "production", "data", "digital_planning", "orders"];
const PRODUCTION_TRACKING_PATH = [BASE, "production", "tracked_products"];
const PRODUCTION_EFFICIENCY_HOURS_PATH = [BASE, "production", "efficiency_hours"];

export const ACTIVE_SITE = BASE;

export const PATHS = {
  // --- PRODUCTIE (Collecties: oneven segmenten) ---
  PRODUCTS: [BASE, "production", "products"],
  PLANNING: PRODUCTION_PLANNING_PATH,
  TRACKING: PRODUCTION_TRACKING_PATH,
  MESSAGES: [BASE, "production", "messages"],
  OCCUPANCY: [BASE, "production", "machine_occupancy"],
  TEMP_PLANNING: [BASE, "temp_labels", "orders"], // Tijdelijk pad voor legacy labels
  INVENTORY: [BASE, "production", "inventory"],
  PRODUCTION_STANDARDS: [BASE, "production", "time_standards"],
  EFFICIENCY_HOURS: PRODUCTION_EFFICIENCY_HOURS_PATH,
  TIME_LOGS: [BASE, "production", "time_logs"],
  DOWNTIME: [BASE, "production", "downtime_reports"],
  DEFECTS: [BASE, "production", "defect_reports"],

  // --- TECHNISCHE SPECS (Sub-collecties: oneven segmenten) ---
  BORE_DIMENSIONS: [BASE, "production", "dimensions", "bore", "records"],
  CB_DIMENSIONS: [BASE, "production", "dimensions", "cb", "records"],
  TB_DIMENSIONS: [BASE, "production", "dimensions", "tb", "records"],
  FITTING_SPECS: [BASE, "production", "dimensions", "fitting", "records"],
  SOCKET_SPECS: [BASE, "production", "dimensions", "socket", "records"],

  // --- GEBRUIKERS (Collecties: oneven segmenten) ---
  USERS: [BASE, "Users", "Accounts"],
  PERSONNEL: [BASE, "Users", "Personnel"],
  ACCOUNT_REQUESTS: [BASE, "Users", "AccountRequests"],

  // --- INSTELLINGEN & CONFIG (Documents: even segmenten) ---
  FACTORY_CONFIG: [BASE, "settings", "factory_configs", "main"],
  GENERAL_SETTINGS: [BASE, "settings", "general_configs", "main"],
  MATRIX_CONFIG: [BASE, "settings", "matrix_configs", "main"],
  BLUEPRINTS: [BASE, "settings", "blueprint_configs", "main"],
  LABEL_TEMPLATES: [BASE, "settings", "label_templates"],
  LABEL_LOGIC: [BASE, "settings", "label_logic"],
  PRINTERS: [BASE, "settings", "printers"],
  TOOLING_MOLDS: [BASE, "settings", "tooling_molds"],
  
  // --- PRINTER SERVICE ---
  PRINT_QUEUE: [BASE, "production", "print_queue"],
  PRINT_LISTENERS: [BASE, "settings", "print_listeners"],
  
  AI_CONFIG: [BASE, "settings", "ai_config", "main"],

  // --- LOGGING & AUDIT (Collecties: oneven segmenten) ---
  ACTIVITY_LOGS: [BASE, "logs", "activity_logs"],
  ACTIVITY_LOGS_ARCHIVE: [BASE, "logs", "activity_logs_archive"],

  // --- CONVERSIES & MEDIA (Sub-collecties: oneven segmenten) ---
  CONVERSION_MATRIX: [BASE, "settings", "conversions", "mapping", "records"],
  IMAGE_LIBRARY: [BASE, "settings", "media", "images", "records"],
  DRAWING_LIBRARY: [BASE, "settings", "media", "drawings", "records"],
  AI_KNOWLEDGE_BASE: [BASE, "settings", "ai_knowledge_base", "training", "records"],
  AI_DOCUMENTS: [BASE, "settings", "ai_documents", "knowledge", "records"],
  AI_MEMORY: [BASE, "settings", "ai_memory"],
  AI_CONVERSATIONS: [BASE, "settings", "ai_conversations"],

  // --- AUTOMATION & NOTIFICATIES ---
  AUTOMATION_RULES: [BASE, "automation", "rules"],
  AUTOMATION_EXECUTIONS: [BASE, "automation", "executions"],
  NOTIFICATION_RULES: [BASE, "notifications", "rules"],
  NOTIFICATION_LOGS: [BASE, "notifications", "logs"],
  SCENARIOS: [BASE, "planning", "scenarios"],
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
 * getArchiveItemsPath - Genereert het pad voor gearchiveerde productie-items
 * @param {number|string} year - Het jaar van het archief
 */
export const getArchiveItemsPath = (year) => {
  return [BASE, "production", "archive", String(year), "items"];
};

/**
 * getArchiveRejectedItemsPath - Genereert het pad voor gearchiveerde AFGEKEURDE productie-items
 * @param {number|string} year - Het jaar van het archief
 */
export const getArchiveRejectedItemsPath = (year) => {
  return [BASE, "production", "archive", String(year), "rejected"];
};

/**
 * getPlanningArchivePath - Genereert het pad voor gearchiveerde planningsorders
 * Alle orders (archive én rejected) gaan naar hetzelfde pad; reden staat in archiveReason veld.
 * @param {number|string} year - Het jaar van het archief
 */
export const getPlanningArchivePath = (year) => {
  return [BASE, "production", "archive", String(year), "planning"];
};

/**
 * getEfficiencyArchivePath - Genereert het pad voor gearchiveerde efficiency data
 * @param {number|string} year - Het jaar van het archief
 */
export const getEfficiencyArchivePath = (year) => {
  return [BASE, "production", "archive", String(year), "efficiency"];
};

export const getArtifactsPath = (appId, ...segments) => {
  return ["artifacts", appId, "public", "data", ...segments];
};

export const ARTIFACTS_PATHS = {
  /**
   * Genereer dynamische artifact paden met appId
   * Gebruik: getArtifactsPath(appId, "digital_planning")
   */
  getPlanningPath: (appId) => getArtifactsPath(appId, "digital_planning"),
  getProductsPath: (appId) => getArtifactsPath(appId, "products"),
  getConfigPath: (appId) => getArtifactsPath(appId, "config", "factory_config"),
};
