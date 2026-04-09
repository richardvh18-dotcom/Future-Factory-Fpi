/**
 * dbPaths.js - V33.0 (Audit Log Path Fix)
 * Gecorrigeerd: Paden voor collecties moeten een oneven aantal segmenten hebben.
 */

const BASE = "future-factory";
const ARTIFACT_APP_ID = typeof __app_id !== "undefined" ? __app_id : "fittings-app-v1";
const USE_ARTIFACTS_PATHS = typeof __app_id !== "undefined";
const FUTURE_PLANNING_PATH = [BASE, "production", "data", "digital_planning", "orders"];
const FUTURE_PLANNING_PATH_LEGACY = [BASE, "production", "digital_planning"];
const PILOT_PLANNING_PATH_PRIMARY = [BASE, "production", "digital_planning"];
const PILOT_PLANNING_PATH_FALLBACK = [BASE, "production", "data", "digital_planning", "orders"];
const FUTURE_TRACKING_PATH = [BASE, "production", "tracked_products"];
const FUTURE_EFFICIENCY_HOURS_PATH = [BASE, "production", "efficiency_hours"];
const ARTIFACT_PLANNING_PATH = ["artifacts", ARTIFACT_APP_ID, "public", "data", "digital_planning"];
const ARTIFACT_TRACKING_PATH = ["artifacts", ARTIFACT_APP_ID, "public", "data", "tracked_products"];
const ARTIFACT_EFFICIENCY_HOURS_PATH = ["artifacts", ARTIFACT_APP_ID, "public", "data", "efficiency_hours"];

let ADMIN_DATA_SOURCE_MODE = "current";

const shouldUseArtifactsPaths = () =>
  USE_ARTIFACTS_PATHS && ADMIN_DATA_SOURCE_MODE !== "pilot-read";

let PLANNING_PATH = shouldUseArtifactsPaths()
  ? ARTIFACT_PLANNING_PATH
  : FUTURE_PLANNING_PATH;
let TRACKING_PATH = shouldUseArtifactsPaths()
  ? ARTIFACT_TRACKING_PATH
  : FUTURE_TRACKING_PATH;
let EFFICIENCY_HOURS_PATH = shouldUseArtifactsPaths()
  ? ARTIFACT_EFFICIENCY_HOURS_PATH
  : FUTURE_EFFICIENCY_HOURS_PATH;

export const ACTIVE_SITE = BASE;

export const PATHS = {
  // --- PRODUCTIE (Collecties: oneven segmenten) ---
  PRODUCTS: [BASE, "production", "products"],
  PLANNING: PLANNING_PATH,
  TRACKING: TRACKING_PATH,
  MESSAGES: [BASE, "production", "messages"],
  OCCUPANCY: [BASE, "production", "machine_occupancy"],
  TEMP_PLANNING: [BASE, "temp_labels", "orders"], // Tijdelijk pad voor legacy labels
  INVENTORY: [BASE, "production", "inventory"],
  PRODUCTION_STANDARDS: [BASE, "production", "time_standards"],
  EFFICIENCY_HOURS: EFFICIENCY_HOURS_PATH,
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

const refreshRuntimeDataPaths = () => {
  PLANNING_PATH = ADMIN_DATA_SOURCE_MODE === "pilot-read"
    ? PILOT_PLANNING_PATH_PRIMARY
    : (shouldUseArtifactsPaths() ? ARTIFACT_PLANNING_PATH : FUTURE_PLANNING_PATH);
  TRACKING_PATH = shouldUseArtifactsPaths()
    ? ARTIFACT_TRACKING_PATH
    : FUTURE_TRACKING_PATH;
  EFFICIENCY_HOURS_PATH = shouldUseArtifactsPaths()
    ? ARTIFACT_EFFICIENCY_HOURS_PATH
    : FUTURE_EFFICIENCY_HOURS_PATH;

  PATHS.PLANNING = PLANNING_PATH;
  PATHS.TRACKING = TRACKING_PATH;
  PATHS.EFFICIENCY_HOURS = EFFICIENCY_HOURS_PATH;
};

export const setAdminDataSourceMode = (mode = "current") => {
  ADMIN_DATA_SOURCE_MODE = mode === "pilot-read" ? "pilot-read" : "current";
  refreshRuntimeDataPaths();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new window.CustomEvent("admin-data-source-mode-changed", {
        detail: { mode: ADMIN_DATA_SOURCE_MODE },
      })
    );
  }
};

export const getAdminDataSourceMode = () => ADMIN_DATA_SOURCE_MODE;

export const isPilotReadDataSource = () => ADMIN_DATA_SOURCE_MODE === "pilot-read";

// Fixed read-only paths to the pilot/live production collections.
const PILOT_PLANNING_PATH = PILOT_PLANNING_PATH_PRIMARY;
const PILOT_TRACKING_PATH = [BASE, "production", "tracked_products"];
const PILOT_EFFICIENCY_HOURS_PATH = [BASE, "production", "efficiency_hours"];

export const PILOT_READ_PATHS = {
  ...PATHS,
  PLANNING: PILOT_PLANNING_PATH,
  TRACKING: PILOT_TRACKING_PATH,
  EFFICIENCY_HOURS: PILOT_EFFICIENCY_HOURS_PATH,
};

export const getReadPaths = (usePilotRead = false) =>
  usePilotRead ? PILOT_READ_PATHS : PATHS;

export const getPilotPlanningReadPathCandidates = () => [
  PILOT_PLANNING_PATH_PRIMARY,
  PILOT_PLANNING_PATH_FALLBACK,
  FUTURE_PLANNING_PATH_LEGACY,
  FUTURE_PLANNING_PATH,
];

// Initialiseer runtime-data bron op basis van persistente admin instelling.
if (typeof window !== "undefined") {
  const savedMode = window.localStorage.getItem("adminDataSourceMode");
  setAdminDataSourceMode(savedMode === "pilot-read" ? "pilot-read" : "current");
}

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
  if (shouldUseArtifactsPaths()) {
    return ["artifacts", ARTIFACT_APP_ID, "public", "data", "archive", String(year), "items"];
  }
  return [BASE, "production", "archive", String(year), "items"];
};

/**
 * getArchiveRejectedItemsPath - Genereert het pad voor gearchiveerde AFGEKEURDE productie-items
 * @param {number|string} year - Het jaar van het archief
 */
export const getArchiveRejectedItemsPath = (year) => {
  if (shouldUseArtifactsPaths()) {
    return ["artifacts", ARTIFACT_APP_ID, "public", "data", "archive", String(year), "rejected"];
  }
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
  getPlanningPath: (appId) => getArtifactsPath(appId, "digital_planning"),
  getProductsPath: (appId) => getArtifactsPath(appId, "products"),
  getConfigPath: (appId) => getArtifactsPath(appId, "config", "factory_config"),
};
