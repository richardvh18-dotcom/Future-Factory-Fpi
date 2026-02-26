/**
 * Central Database Paths Configuration
 * Supports Multi-Site Architecture & Pilot Isolation
 */

// KIES HIER DE ACTIEVE OMGEVING
// We kijken eerst in LocalStorage, anders gebruiken we de default 'site-nl'
const STORAGE_KEY = "fpi_active_site";
export const ACTIVE_SITE = localStorage.getItem(STORAGE_KEY) || "site-nl"; 

// Definieer de root paden per site
const ROOTS = {
  "site-nl": ["future-factory"],      // Huidige productie data (Nederland)
  "site-eg": ["future-factory-eg"],   // Toekomstige fabriek Egypte (Eigen root)
  "site-dxb": ["future-factory-dxb"]  // Toekomstige fabriek Dubai (Eigen root)
};

// Bepaal de basis op basis van de actieve site
const BASE = ROOTS[ACTIVE_SITE] || ROOTS["site-nl"];

export const PATHS = {
  // --- CORE IDENTITY ---
  USERS: [...BASE, "Users", "Accounts"],
  PERSONNEL: [...BASE, "Users", "Personnel"],
  
  // --- CONFIGURATION ---
  GENERAL_SETTINGS: [...BASE, "settings", "general_configs", "main"],
  FACTORY_CONFIG: [...BASE, "settings", "factory_configs", "main"],
  AI_CONFIG: [...BASE, "settings", "ai_configs", "main"],
  
  // --- PRODUCTION DATA ---
  PRODUCTS: [...BASE, "production", "products"],
  PLANNING: [...BASE, "production", "digital_planning"],
  TRACKING: [...BASE, "production", "tracked_products"],
  OCCUPANCY: [...BASE, "production", "machine_occupancy"],
  ACTIVITY_LOGS: [...BASE, "production", "activity_logs"],
  TIME_LOGS: [...BASE, "production", "time_logs"],
  ACTIVITY_LOGS_ARCHIVE: [...BASE, "production", "activity_logs_archive"],
  MESSAGES: [...BASE, "production", "messages"],
  
  // --- TECHNICAL DATA ---
  CONVERSION_MATRIX: [...BASE, "settings", "conversions", "mapping", "records"],
  PRODUCTION_STANDARDS: [...BASE, "production", "time_standards"],
  
  // --- REFERENCE TABLES ---
  FITTING_SPECS: [...BASE, "production", "dimensions", "fitting_specs", "records"],
  BORE_DIMENSIONS: [...BASE, "production", "dimensions", "bore", "records"],
  CB_DIMENSIONS: [...BASE, "production", "dimensions", "cb_bells", "records"],
  TB_DIMENSIONS: [...BASE, "production", "dimensions", "tb_bells", "records"],
  SOCKET_SPECS: [...BASE, "production", "dimensions", "socket_specs", "records"],
};

// Helper om te checken of een pad bestaat (voor error handling)
export const isValidPath = (key) => {
  return PATHS.hasOwnProperty(key);
};