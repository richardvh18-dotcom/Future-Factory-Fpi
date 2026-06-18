const BASE = "future-factory";
const ALLOWED_OVERRIDE_ROOTS = new Set([BASE, "artifacts"]);
export const DB_PATH_OVERRIDE_KEYS = {
  PLANNING: "FPI_DB_PATH_PLANNING_OVERRIDE",
  TEMP_PLANNING: "FPI_DB_PATH_TEMP_PLANNING_OVERRIDE",
} as const;
const TEST_ARTIFACTS_DEFAULT_PROJECT_ID = "future-factory-377ef";
const PRODUCTION_PLANNING_PATH = [BASE, "production", "digital_planning"];
const PRODUCTION_PLANNING_PATH_LEGACY = [BASE, "production", "data", "digital_planning", "orders"];
const PRODUCTION_TRACKING_PATH = [BASE, "production", "tracked_products"];
const PRODUCTION_EFFICIENCY_HOURS_PATH = [BASE, "production", "efficiency_hours"];

const getRuntimePathOverride = (storageKey: string): string => {
  if (typeof window === "undefined") return "";

  try {
    return String(window.localStorage.getItem(storageKey) || "").trim();
  } catch {
    return "";
  }
};

const parsePathFromEnv = (rawValue: unknown): string[] | null => {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const segments = value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0 || !ALLOWED_OVERRIDE_ROOTS.has(segments[0])) {
    console.warn(
      `Ongeldig planning pad in env '${value}'. Verwacht pad dat start met '${BASE}/...' of 'artifacts/...'.`
    );
    return null;
  }

  return segments;
};

const resolvePathOverride = (storageKey: string, envValue: unknown): string[] | null => {
  const runtimeValue = getRuntimePathOverride(storageKey);
  if (runtimeValue) {
    const parsedRuntimePath = parsePathFromEnv(runtimeValue);
    if (parsedRuntimePath) return parsedRuntimePath;
  }

  return parsePathFromEnv(envValue);
};

const PLANNING_PATH_OVERRIDE = resolvePathOverride(
  DB_PATH_OVERRIDE_KEYS.PLANNING,
  import.meta.env.VITE_DB_PATH_PLANNING
);
const TEMP_PLANNING_PATH_OVERRIDE = resolvePathOverride(
  DB_PATH_OVERRIDE_KEYS.TEMP_PLANNING,
  import.meta.env.VITE_DB_PATH_TEMP_PLANNING
);

const IS_TEST_PATH_MODE =
  PLANNING_PATH_OVERRIDE?.[0] === "artifacts" ||
  TEMP_PLANNING_PATH_OVERRIDE?.[0] === "artifacts";

const getArtifactsDataRoot = (): string[] => {
  const projectId = String(
    import.meta.env.VITE_FIREBASE_PROJECT_ID || TEST_ARTIFACTS_DEFAULT_PROJECT_ID
  ).trim();
  return ["artifacts", projectId || TEST_ARTIFACTS_DEFAULT_PROJECT_ID, "public", "data"];
};

const withPathMode = (path: string[]): string[] => {
  if (!IS_TEST_PATH_MODE) return path;
  if (path.length >= 2 && path[0] === BASE && path[1] === "production") {
    return [...getArtifactsDataRoot(), ...path.slice(2)];
  }
  return path;
};

export const ACTIVE_SITE = BASE;

export const PATHS: Record<string, string[]> = {
  // --- PRODUCTIE (Collecties: oneven segmenten) ---
  PRODUCTS: withPathMode([BASE, "production", "products"]),
  PLANNING: withPathMode(PLANNING_PATH_OVERRIDE || PRODUCTION_PLANNING_PATH),
  TRACKING: withPathMode(PRODUCTION_TRACKING_PATH),
  MESSAGES: withPathMode([BASE, "production", "messages"]),
  OCCUPANCY: withPathMode([BASE, "production", "machine_occupancy"]),
  TEMP_PLANNING:
    TEMP_PLANNING_PATH_OVERRIDE ||
    (IS_TEST_PATH_MODE
      ? [...getArtifactsDataRoot(), "temp_labels_orders"]
      : [BASE, "temp_labels", "orders"]), // Tijdelijk pad voor legacy labels
  INVENTORY: withPathMode([BASE, "production", "inventory"]),
  PRODUCTION_STANDARDS: withPathMode([BASE, "production", "time_standards"]),
  EFFICIENCY_HOURS: withPathMode(PRODUCTION_EFFICIENCY_HOURS_PATH),
  TIME_LOGS: withPathMode([BASE, "production", "time_logs"]),
  DOWNTIME: withPathMode([BASE, "production", "downtime_reports"]),
  DEFECTS: withPathMode([BASE, "production", "defect_reports"]),

  // --- TECHNISCHE SPECS (Sub-collecties: oneven segmenten) ---
  BORE_DIMENSIONS: withPathMode([BASE, "production", "dimensions", "bore", "records"]),
  CB_DIMENSIONS: withPathMode([BASE, "production", "dimensions", "cb", "records"]),
  TB_DIMENSIONS: withPathMode([BASE, "production", "dimensions", "tb", "records"]),
  FITTING_SPECS: withPathMode([BASE, "production", "dimensions", "fitting", "records"]),
  SOCKET_SPECS: withPathMode([BASE, "production", "dimensions", "socket", "records"]),

  // --- GEBRUIKERS (Collecties: oneven segmenten) ---
  USERS: [BASE, "Users", "Accounts"],
  PERSONNEL: [BASE, "Users", "Personnel"],
  ACCOUNT_REQUESTS: [BASE, "Users", "AccountRequests"],
  NFC_TAG_MAPPINGS: [BASE, "Users", "NFCTagMappings"], // UID of NFC-tag → personeelsnummer

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
  PRINT_QUEUE: withPathMode([BASE, "production", "print_queue"]),
  PRINT_LISTENERS: [BASE, "settings", "print_listeners"],
  COUNTERS: withPathMode([BASE, "production", "counters"]),
  ACTIVE_PRODUCTION: withPathMode([BASE, "production", "active"]),
  PRODUCTION_ARCHIVE: withPathMode([BASE, "production", "archive"]),
  QC_MEASUREMENTS: withPathMode([BASE, "production", "qc_measurements"]),
  QC_INSPECTIONS: withPathMode([BASE, "production", "qc_inspections"]),
  
  AI_CONFIG: [BASE, "settings", "ai_config", "main"],
  ROLES: [BASE, "settings", "roles"],
  SITE_CONFIG_APP: [BASE, "settings", "site_config", "app"],
  SITE_CONFIG_MAIN: [BASE, "settings", "site_config", "main"],
  FLASHCARDS: [BASE, "settings", "flashcards"],
  FLASHCARD_RESULTS: [BASE, "settings", "flashcard_results"],
  EXPORT_TASKS: [BASE, "exports", "tasks"],

  // --- LOGGING & AUDIT (Collecties: oneven segmenten) ---
  AUDIT_LOGS: [BASE, "audit", "logs"],
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

  // --- LN REFERENTIE OPERATIES (stamdata uit ERP) ---
  REFERENCE_OPERATIONS: [BASE, "settings", "reference_operations"],
  LN_QR_EXPORT_HISTORY: [BASE, "exports", "ln_qr_history"],

  // --- AUTOMATION & NOTIFICATIES ---
  AUTOMATION_RULES: [BASE, "automation", "rules"],
  AUTOMATION_EXECUTIONS: [BASE, "automation", "executions"],
  NOTIFICATION_RULES: [BASE, "notifications", "rules"],
  NOTIFICATION_LOGS: [BASE, "notifications", "logs"],
  SCENARIOS: [BASE, "planning", "scenarios"],
  
  // --- EMAIL MANAGEMENT ---
  EMAIL_TEMPLATES: [BASE, "settings", "email_templates"],
  EMAIL_LOGS: [BASE, "logs", "email_logs"],
};

/**
 * isValidPath - Controleert of een pad-sleutel geldig is
 */
export const isValidPath = (key: string): boolean => {
  return key in PATHS;
};

/**
 * getPath - Veilige helper om een pad op te vragen met foutcontrole.
 */
export const getPath = (key: string): string[] => {
  if (!PATHS[key]) {
    console.error(
      `❌ DATABASE PAD FOUT: Sleutel '${key}' niet gevonden in dbPaths.js`
    );
    return ["future-factory", "production", "error_fallback"];
  }
  return PATHS[key];
};

export const getPathString = (pathArray: string[] | undefined | null): string =>
  Array.isArray(pathArray) ? pathArray.join("/") : "";

/**
 * getArchiveItemsPath - Genereert het pad voor gearchiveerde productie-items
 * @param {number|string} year - Het jaar van het archief
 */
export const getArchiveItemsPath = (year: number | string): string[] => {
  return withPathMode([BASE, "production", "archive", String(year), "items"]);
};

/**
 * getArchiveRejectedItemsPath - Genereert het pad voor gearchiveerde AFGEKEURDE productie-items
 * @param {number|string} year - Het jaar van het archief
 */
export const getArchiveRejectedItemsPath = (year: number | string): string[] => {
  return withPathMode([BASE, "production", "archive", String(year), "rejected"]);
};

/**
 * getPlanningArchivePath - Genereert het pad voor gearchiveerde planningsorders
 * Alle orders (archive én rejected) gaan naar hetzelfde pad; reden staat in archiveReason veld.
 * @param {number|string} year - Het jaar van het archief
 */
export const getPlanningArchivePath = (year: number | string): string[] => {
  return withPathMode([BASE, "production", "archive", String(year), "planning"]);
};

/**
 * getEfficiencyArchivePath - Genereert het pad voor gearchiveerde efficiency data
 * @param {number|string} year - Het jaar van het archief
 */
export const getEfficiencyArchivePath = (year: number | string): string[] => {
  return withPathMode([BASE, "production", "archive", String(year), "efficiency"]);
};

export const getArchiveRootPath = (): string[] => withPathMode([BASE, "production", "archive"]);

export const getArtifactsPath = (appId: string, ...segments: string[]): string[] => {
  return ["artifacts", appId, "public", "data", ...segments];
};

export const ARTIFACTS_PATHS = {
  /**
   * Genereer dynamische artifact paden met appId
   * Gebruik: getArtifactsPath(appId, "digital_planning")
   */
  getPlanningPath: (appId: string): string[] => getArtifactsPath(appId, "digital_planning"),
  getProductsPath: (appId: string): string[] => getArtifactsPath(appId, "products"),
  getConfigPath: (appId: string): string[] => getArtifactsPath(appId, "config", "factory_config"),
};
