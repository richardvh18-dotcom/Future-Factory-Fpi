/**
 * src/utils/labelHelpers.js
 * Helpers voor het verwerken van label templates en placeholders.
 */

import { format } from "date-fns";
import i18n from "../i18n";

// Definieer de standaard formaten
export const LABEL_SIZES = {
  Standard: { width: 90, height: 55, name: i18n.t("label.size_standard", "Standaard (90x55mm)") },
  Slim: { width: 90, height: 30, name: i18n.t("label.size_slim", "Smal (90x30mm)") },
  Legacy: { width: 100, height: 50, name: i18n.t("label.size_legacy", "Legacy (100x50mm)") },
  Large: { width: 100, height: 150, name: i18n.t("label.size_large", "Groot (100x150mm)") },
  Custom: { width: 100, height: 100, name: i18n.t("label.size_custom", "Aangepast") },
};

// --- HULPFUNCTIES VOOR PARSING ---

// Converteert mm naar inches (afgerond op halve inches)
const toInches = (mm) => {
  if (!mm) return "";
  const num = parseFloat(mm);
  if (isNaN(num)) return "";
  const inches = num / 25.4;
  // Rond af op 0.5: (x * 2 -> round -> / 2)
  const rounded = Math.round(inches * 2) / 2;
  return `(${rounded}")`;
};

// Converteert Bar naar PSI (afgerond op geheel getal)
const barToPsi = (bar) => {
  const num = parseFloat(bar);
  if (isNaN(num)) return "";
  return Math.round(num * 14.5038);
};

// Zoekt drukklasse (EST20, CST16, EMT25, EDF11)
const parsePressure = (text) => {
  // Zoek naar patroon: EST, CST, EMT, EDF gevolgd door cijfers
  const match = text.match(/\b(EST|CST|EMT|EDF)\s*(\d+)\b/i);

  if (match) {
    let type = match[1].toUpperCase();
    const bar = match[2];

    // Correctie: Als het EDF is (of iets anders dan de standaard 3), map naar EST?
    if (!["EST", "CST", "EMT"].includes(type)) {
      type = "EST";
    }

    const psi = barToPsi(bar);
    // Formaat: EST 20 (290psi)
    return `${type} ${bar} (${psi}psi)`;
  }

  // Fallback: Zoek naar PN of BAR
  const fallbackMatch = text.match(/\b(?:PN|BAR)\s*(\d+)\b/i);
  if (fallbackMatch) {
    const bar = fallbackMatch[1];
    const psi = barToPsi(bar);
    return `EST ${bar} (${psi}psi)`;
  }

  return ""; // Leeg laten als echt niets gevonden is
};

// Zoekt connecties (CB-CB, FL-TB, TBTB, etc)
const parseConnections = (text) => {
  // Zoekt patronen zoals CB-CB, TB-TB, of aan elkaar TBTB, FLTB
  const match = text.match(
    /\b(TB|CB|FL|AM)-?(TB|CB|FL|AM)(-?(TB|CB|FL|AM))?\b/i
  );

  if (match) {
    const parts = [match[1], match[2], match[4]].filter(Boolean);
    return parts.join("-").toUpperCase();
  }
  return "";
};

// Bepaalt productnaam + graden (voor elbows)
const parseProductType = (text) => {
  const upper = text.toUpperCase();
  let type = upper.includes("ELB") || upper.includes("BOCHT")
    ? "ELBOW"
    : upper.includes("UNEQUAL") || upper.includes("VERLOOP TEE")
      ? "UNEQUAL-TEE"
      : upper.includes("TEE")
        ? "EQUAL-TEE"
        : upper.includes("COUPLER") || upper.includes("MOF")
          ? "COUPLER"
          : upper.includes("BLIND")
            ? "BLIND FLANGE"
            : upper.includes("FLANGE") || upper.includes("FLENS")
              ? "FLANGE"
              : upper.includes("CONC")
                ? "CONCENTRIC REDUCER"
                : upper.includes("ECC")
                  ? "ECCENTRIC REDUCER"
                  : upper.includes("REDUCER") || upper.includes("VERLOOP")
                    ? "REDUCER"
                    : text.split(/[\s/]/)[0].toUpperCase();

  // 2. Graden toevoegen voor Elbows
  if (type === "ELBOW") {
    const degreeMatch =
      text.match(/\/(\d+)/) || text.match(/(\d+)\s*(?:DEG|GR|°)/i);

    if (degreeMatch) {
      type += ` ${degreeMatch[1]}°`;
    } else {
      const commonAngles = text.match(/\b(90|45|30|60|22\.5|11\.25)\b/);
      if (commonAngles) {
        type += ` ${commonAngles[1]}°`;
      }
    }
  }

  return type;
};

// Bepaalt ID in mm en inch
const parseDimensions = (text, productType) => {
  // 1. Check voor Reducer patroon (400x300) of (400/300)
  const reducerMatch = text.match(/(\d+)\s*[xX/]\s*(\d+)/);

  if (
    reducerMatch &&
    (productType.includes("REDUCER") || productType.includes("TEE"))
  ) {
    const d1 = reducerMatch[1];
    const d2 = reducerMatch[2];
    if (parseInt(d1) > 25 && parseInt(d2) > 25) {
      return `ID: ${d1}x${d2}mm ${toInches(d1)}x${toInches(d2)}`;
    }
  }

  // 2. Check voor standaard ID
  const idMatch = text.match(/(\d+)(?=[RmM/])/i) || text.match(/\b(\d+)\b/);

  if (idMatch) {
    const val = parseInt(idMatch[1]);
    if (val > 25 && val !== 45 && val !== 90) {
      return `ID: ${val}mm ${toInches(val)}`;
    }

    const fallbackMatch = text.match(/(\d{2,4})/g);
    if (fallbackMatch) {
      const maxVal = Math.max(...fallbackMatch.map((n) => parseInt(n)));
      if (maxVal > 25) {
        return `ID: ${maxVal}mm ${toInches(maxVal)}`;
      }
    }
  }

  return "ID: ???";
};

// Hulpfunctie om geneste object properties te vinden
const getNestedValue = (obj, path) => {
  if (!path) return undefined;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Verwerkt ruwe orderdata naar rijke label data.
 */
export const processLabelData = (data) => {
  if (!data) return {};

  const desc = String(data.item || data.description || "").trim();
  const lotNumber = String(data.lotNumber || "");

  // 1. Bepaal Product Type
  const productType = parseProductType(desc);

  // 2. Bepaal Drukklasse (EST/CST/EMT + psi)
  let pressureLine = parsePressure(desc);
  // Fallback: als regex faalt, gebruik specs OF default EST 20
  if (!pressureLine) {
    if (data.specs?.pressure) {
      const bar = data.specs.pressure;
      const psi = barToPsi(bar);
      pressureLine = `EST ${bar} (${psi}psi)`;
    } else {
      pressureLine = "EST ?? (??psi)";
    }
  }

  // 3. Bepaal Connecties
  let connectionLine = parseConnections(desc);
  if (!connectionLine && data.specs?.connection) {
    connectionLine = data.specs.connection;
  }

  // 4. Bepaal Afmetingen
  let idLine = parseDimensions(desc, productType);

  // 5. Radius logic
  let radiusText = "";
  if (
    desc.toUpperCase().includes("R1.0") ||
    desc.toUpperCase().includes("R=1.0")
  ) {
    radiusText = "R1.0D";
  }

  return {
    ...data,
    itemCode: data.itemCode || data.productId || "",
    drawing: data.drawing || data.drawingNumber || "N/A",

    idLine: idLine,
    productType: productType,
    pressureLine: pressureLine,
    connectionLine: connectionLine,
    radiusText: radiusText,

    lotNumber: lotNumber,
    date: format(new Date(), "dd-MM-yyyy"),
  };
};

/**
 * Past dynamische label logica toe op de data.
 * @param {Object} data - De basis order/product data.
 * @param {Array} rules - Array van logica regels uit Firestore.
 * @returns {Object} - Verrijkte data.
 */
export const applyLabelLogic = (data, rules) => {
  if (!rules || rules.length === 0) return data;
  
  const enriched = { ...data };
  const productCode = (data.itemCode || data.productId || "").toUpperCase();

  // Zoek regels die van toepassing zijn op dit product
  const activeRule = rules.find(r => r.productCode === productCode);
  
  if (activeRule && activeRule.variables) {
    activeRule.variables.forEach(variable => {
      let value = variable.defaultValue || "";
      
      if (variable.mappings) {
        // Bepaal welk veld de trigger is (default: project)
        const triggerField = variable.triggerField || "project";
        
        // Helper om waarde op te halen (ook uit specs of mappings)
        const getValue = (field) => {
            // 1. Directe match
            if (data[field] !== undefined) return data[field];
            // 2. Mapping aliases
            if (field === 'diameter' && data.dn !== undefined) return data.dn;
            if (field === 'pressure' && data.pn !== undefined) return data.pn;
            if (field === 'extraCode') return data.extraCode || data.code;
            // 3. Specs object
            if (data.specs && data.specs[field] !== undefined) return data.specs[field];
            
            // 4. Case-insensitive fallback (voor bijv. NPRs vs nprs)
            const lowerField = field.toLowerCase();
            const key = Object.keys(data).find(k => k.toLowerCase() === lowerField);
            if (key) return data[key];
            if (data.specs) {
                const specKey = Object.keys(data.specs).find(k => k.toLowerCase() === lowerField);
                if (specKey) return data.specs[specKey];
            }
            
            return "";
        };

        const dataValue = String(getValue(triggerField)).toUpperCase();

        const match = variable.mappings.find(m => {
            const condition = String(m.condition || m.project || "").trim();
            const val = String(dataValue).trim();
            
            // Numeric check for ranges
            const numVal = parseFloat(val);
            if (!isNaN(numVal)) {
                if (condition.startsWith(">=")) return numVal >= parseFloat(condition.substring(2));
                if (condition.startsWith("<=")) return numVal <= parseFloat(condition.substring(2));
                if (condition.startsWith(">")) return numVal > parseFloat(condition.substring(1));
                if (condition.startsWith("<")) return numVal < parseFloat(condition.substring(1));
            }
            
            if (condition.startsWith("!=")) return val.toUpperCase() !== condition.substring(2).trim().toUpperCase();
            if (condition.startsWith("==")) return val.toUpperCase() === condition.substring(2).trim().toUpperCase();

            return condition.toUpperCase() === val.toUpperCase();
        });
        
        if (match) value = match.value;
      }
      enriched[variable.name] = value;
    });
  }
  return enriched;
};

/**
 * Vervangt placeholders.
 */
export const resolveLabelContent = (contentOrElement, data) => {
  if (!data) return contentOrElement;

  let content = "";
  let isElement = false;

  if (typeof contentOrElement === "string") {
    content = contentOrElement;
  } else if (contentOrElement && typeof contentOrElement === "object") {
    content = contentOrElement.content || "";
    isElement = true;
  } else {
    return contentOrElement;
  }

  const matches = content.match(/{([^}]+)}/g);

  if (matches) {
    matches.forEach((match) => {
      const key = match.slice(1, -1);
      const value = key === "date"
        ? format(new Date(), "dd-MM-yyyy")
        : (() => {
          const rawValue = getNestedValue(data, key);
          return rawValue !== undefined && rawValue !== null
            ? String(rawValue)
            : "";
        })();

      content = content.replace(match, value);
    });
  }

  if (isElement) {
    return {
      ...contentOrElement,
      content: content,
    };
  }

  return content;
};
