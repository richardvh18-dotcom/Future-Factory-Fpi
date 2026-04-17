/**
 * Centrale Constanten voor FPi Future Factory
 * Bevat alle "magic numbers", configuratiewaarden en specifieke strings.
 */

// --- DATABASE PADEN (Keys voor dbPaths.js) ---
export const DB_COLLECTIONS = {
  PRODUCTS: "products",
  PLANNING: "digital_planning",
  TRACKING: "tracked_products",
  USERS: "user_roles",
  SETTINGS: "settings",
  INVENTORY: "inventory",
  ACTIVITY_LOGS: "activity_logs",
  MESSAGES: "messages",
  PERSONNEL: "personnel",
  OCCUPANCY: "machine_occupancy",
  FACTORY_CONFIG: "factory_config",
  AI_DOCUMENTS: "ai_documents",
  AI_KNOWLEDGE_BASE: "ai_knowledge_base",
};

// --- PRODUCT STATUS ---
export const PRODUCT_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REJECTED: "rejected",
  HOLD: "hold",
};

// --- VERIFICATIE STATUS ---
export const VERIFICATION_STATUS = {
  CONCEPT: "concept",
  PENDING: "pending_review",
  VERIFIED: "verified",
  REJECTED: "rejected",
};

// --- GEBRUIKERSROLLEN ---
export const USER_ROLES = {
  ADMIN: "admin",
  ENGINEER: "engineer",
  TEAMLEADER: "teamleader",
  OPERATOR: "operator",
  GUEST: "guest",
};

// --- STANDAARD WAARDEN ---
export const DEFAULTS = {
  SHIFT_HOURS: 8,
  BREAK_DEDUCTION: 0.75,
  MAX_FILE_SIZE_MB: 5,
  AI_MAX_CHARS: 50000,
};

// --- KLEUREN (Tailwind classes) ---
export const SHIFT_COLORS = {
  OCHTEND: "amber",
  AVOND: "indigo",
  NACHT: "purple",
  DAG: "blue",
};

// --- PRODUCT CONFIGURATIE ---

export const ALL_PRODUCT_TYPES = [
  "Elbow",
  "T-Equal",
  "T-Unequal",
  "Y-Piece",
  "Concentric Reducer",
  "Eccentric Reducer",
  "Standard Flange",
  "Blind Flange",
  "Stub Flange",
  "Specials",
  "Coupler",
  "Adaptor",
  "W-Equal",
  "W-Unequal",
];

export const PRODUCT_LABELS = [
  "Wavistrong Standard",
  "Wavistrong Non Standard",
  "Fibermar",
  "Specials",
];

export const CONNECTION_TYPES = [
  "CB/CB",
  "TB/TB",
  "CB/TB",
  "CB/FL",
  "TB/FL",
  "CB/CB/CB",
  "CB/CB/TB",
  "TB/TB/CB",
  "TB/TB/CB",
  "TB/TB/TB",
  "BL/BL",
  "CS/CS",
  "TS/TS",
];

export const TYPES_WITH_SECOND_DIAMETER = [
  "T-Unequal",
  "W-Unequal",
  "Y-Piece",
  "Concentric Reducer",
  "Eccentric Reducer",
];

export const BELL_KEYS = [
  "B1",
  "B2",
  "Ba",
  "r1",
  "TWtb",
  "TWcb",
  "BD",
  "W",
  "B1_2",
  "B2_2",
  "BD_2",
  "W_2",
  "TWtb_2",
  "TWcb_2",
  "α",
  "Alpha",
];

export const STANDARD_DIAMETERS = [
  25, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600,
  700, 800, 900, 1000, 1100, 1200, 1400,
];

export const STANDARD_PRESSURES = [8, 12.5, 16, 20, 25, 32, 40, 50];

// Legacy exports to prevent breaking changes if still used somewhere

