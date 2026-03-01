import { getISOWeek, getYear } from "date-fns";
import i18n from "../i18n";

/**
 * Workstation Logic Utilities
 * Workstation Logica Hulpmiddelen
 * Helper functies voor WorkstationHub
 */

// Rejection reasons voor afkeur
// Redenen voor afkeur
// Let op: Voor dynamische taalwissel zonder reload, gebruik de functie getRejectionReasons()
export const REJECTION_REASONS = [
  "rejection.notConformDrawing",
  "rejection.wrongDiameter",
  "rejection.surfaceDamage",
  "rejection.crack",
  "rejection.materialShortage",
  "rejection.wrongSpec",
  "rejection.dimensionDeviation",
  "rejection.qualityInsufficient",
  "rejection.other",
];

// Workstation configuratie
export const WORKSTATIONS = [
  { id: "BH11", name: "BH11", category: "winding" },
  { id: "BH12", name: "BH12", category: "winding" },
  { id: "BH15", name: "BH15", category: "winding" },
  { id: "BH16", name: "BH16", category: "winding" },
  { id: "BH17", name: "BH17", category: "winding" },
  { id: "BH18", name: "BH18", category: "winding" },
  { id: "BH31", name: "BH31", category: "winding" },
  { id: "BH05", name: "BH05", category: "pipes" },
  { id: "BH07", name: "BH07", category: "pipes" },
  { id: "BH08", name: "BH08", category: "pipes" },
  { id: "BH09", name: "BH09", category: "pipes" },
  { id: "Mazak", name: "Mazak", category: "post-processing" },
  { id: "Nabewerking", name: "stations.postProcessing", category: "post-processing" },
  { id: "BM01", name: "BM01", category: "inspection" },
  { id: "Station BM01", name: "stations.bm01", category: "inspection" },
];

/**
 * Get ISO week info from a date
 * Haal ISO week informatie op van een datum
 */
export const getISOWeekInfo = (date) => {
  const week = getISOWeek(date);
  const year = getYear(date);
  return { week, year };
};

/**
 * Helper om rejection reasons dynamisch op te halen (bij taalwissel)
 */
export const getRejectionReasons = () => {
  // Retourneer vertaalde redenen volgens huidige taal
  return REJECTION_REASONS.map(r => i18n.t(r));
};
// Helper om station-namen te vertalen
export const getWorkstationName = (name) => {
  // Als de naam een i18n key is, vertaal deze, anders geef de naam terug
  if (typeof name === "string" && name.startsWith("stations.")) {
    return i18n.t(name);
  }
  return name;
};

/**
 * Check if inspection is overdue (more than 7 days)
 * Controleer of inspectie te laat is (meer dan 7 dagen)
 */
export const isInspectionOverdue = (timestampString) => {
  if (!timestampString) return false;
  
  try {
    const inspectionDate = new Date(timestampString);
    const now = new Date();
    const daysSince = (now - inspectionDate) / (1000 * 60 * 60 * 24);
    
    return daysSince > 7;
  } catch {
    return false;
  }
};

/**
 * Get material info from item code
 * Haal materiaal informatie op uit item code
 */
export const getMaterialInfo = (itemCode) => {
  if (!itemCode) return { material: "Unknown", diameter: null };
  
  // Bijvoorbeeld: "PP-50-PN10" -> material: "PP", diameter: 50
  const parts = String(itemCode).split("-");
  
  return {
    material: parts[0] || "Unknown",
    diameter: parts[1] ? parseInt(parts[1]) : null,
    pressure: parts[2] || null,
  };
};

// --- PILOT FLOW LOGICA (BH18 -> BM01) ---

export const FLOW_STEPS = {
  WIKKELEN: "Wikkelen",
  WACHT_OP_LOSSEN: "Wacht op Lossen",
  LOSSEN: "Lossen",
  NABEWERKING: "Nabewerking",
  EINDINSPECTIE: "Eindinspectie",
  FINISHED: "Finished",
  REJECTED: "REJECTED"
};

export const FLOW_STATUS = {
  PLANNED: "planned",
  IN_PROGRESS: "in_progress",
  TE_LOSSEN: "Te Lossen",
  TE_NABEWERKEN: "Te Nabewerken",
  TE_KEUREN: "Te Keuren",
  COMPLETED: "completed",
  REJECTED: "rejected",
  PAUSED: "paused"
};

/**
 * Bepaalt de volgende status update op basis van de huidige actie.
 * Dit centraliseert de logica voor de pilot flow.
 * 
 * @param {string} action - De actie die wordt uitgevoerd (bijv. 'FINISH_WINDING')
 * @param {Object} [currentState] - Optioneel: de huidige state van het product (voor resume/pause)
 * @returns {Object} De nieuwe status velden (status, currentStep, currentStation, etc.)
 */
export const getNextFlowState = (action, currentState = {}) => {
  switch (action) {
    case 'START_WINDING':
      return { status: FLOW_STATUS.IN_PROGRESS, currentStep: FLOW_STEPS.WIKKELEN };
      
    case 'FINISH_WINDING':
      return { status: FLOW_STATUS.TE_LOSSEN, currentStep: FLOW_STEPS.WACHT_OP_LOSSEN };
      
    case 'START_UNLOADING':
      return { status: FLOW_STATUS.IN_PROGRESS, currentStep: FLOW_STEPS.LOSSEN };
      
    case 'FINISH_UNLOADING':
      return { status: FLOW_STATUS.TE_NABEWERKEN, currentStep: FLOW_STEPS.NABEWERKING, currentStation: "Nabewerking" };
      
    case 'FINISH_PROCESSING':
      return { status: FLOW_STATUS.TE_KEUREN, currentStep: FLOW_STEPS.EINDINSPECTIE, currentStation: "BM01" };
      
    case 'FINISH_INSPECTION':
      return { status: FLOW_STATUS.COMPLETED, currentStep: FLOW_STEPS.FINISHED, currentStation: "GEREED" };
      
    case 'PAUSE_FLOW':
      return { 
        status: FLOW_STATUS.PAUSED, 
        currentStep: "Onderbroken",
        previousStep: currentState.currentStep,
        previousStatus: currentState.status
      };

    case 'RESUME_FLOW':
      // Als er historie is, keer terug naar de oude staat
      if (currentState.previousStep) {
        return {
          status: currentState.previousStatus || FLOW_STATUS.IN_PROGRESS,
          currentStep: currentState.previousStep,
          previousStep: null, // Reset historie
          previousStatus: null
        };
      }
      // Geen historie? Bepaal logische stap op basis van station
      return getStepForStation(currentState.currentStation);

    default:
      console.warn(`Unknown flow action: ${action}`);
      return {};
  }
};

/**
 * Bepaalt de logische processtap op basis van een stationsnaam.
 * Handig als een Teamleader een item handmatig verplaatst.
 */
export const getStepForStation = (stationName) => {
  const name = String(stationName || "").toUpperCase();
  
  if (name.includes("BM01")) return { status: FLOW_STATUS.TE_KEUREN, currentStep: FLOW_STEPS.EINDINSPECTIE };
  if (name.includes("NABEWERK") || name.includes("MAZAK")) return { status: FLOW_STATUS.TE_NABEWERKEN, currentStep: FLOW_STEPS.NABEWERKING };
  if (name === "LOSSEN") return { status: FLOW_STATUS.IN_PROGRESS, currentStep: FLOW_STEPS.LOSSEN };
  if (name.startsWith("BH")) return { status: FLOW_STATUS.IN_PROGRESS, currentStep: FLOW_STEPS.WIKKELEN };
  if (name.includes("REPARATIE") || name.includes("REPAIR")) return { status: FLOW_STATUS.IN_PROGRESS, currentStep: "Reparatie" };
  
  // Fallback
  return { status: FLOW_STATUS.IN_PROGRESS, currentStep: "Onbekend" };
};
