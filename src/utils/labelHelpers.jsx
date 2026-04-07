/**
 * src/utils/labelHelpers.js
 * Helpers voor het verwerken van label templates en placeholders.
 */

import { format } from "date-fns";
import QRCode from "qrcode";
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
  // Zoek naar patroon: EST, CST, EMT, EDF, EWT gevolgd door cijfers
  const match = text.match(/\b(EST|CST|EMT|EDF|EWT)\s*(\d+(?:\.\d+)?)\b/i);

  if (match) {
    let type = match[1].toUpperCase();
    const bar = match[2];

    // Correctie: Als het EDF is (of iets anders dan de standaard 3), map naar EST?
    if (!["EST", "CST", "EMT", "EWT"].includes(type)) {
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

  // Als alleen klasse-token aanwezig is (bijv. "EST ABAB"), toon alleen type zonder waarde.
  const bareTypeMatch = text.match(/\b(EST|CST|EMT|EWT|EDF)\b/i);
  if (bareTypeMatch) {
    let type = bareTypeMatch[1].toUpperCase();
    if (![
      "EST",
      "CST",
      "EMT",
      "EWT",
    ].includes(type)) {
      type = "EST";
    }
    return type;
  }

  return ""; // Leeg laten als echt niets gevonden is
};

// Zoekt connecties (CB-CB, FL-TB, TBTB, etc)
const parseConnections = (text) => {
  // Zoekt patronen zoals CB-CB, TB-TB, of aan elkaar TBTB, FLTB
  const match = text.match(
    /\b(TB|CB|FL|AM|AB|CS|CF|FB)-?(TB|CB|FL|AM|AB|CS|CF|FB)(-?(TB|CB|FL|AM|AB|CS|CF|FB))?\b/i
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
  const teePairMatch = upper.match(/(\d+)\s*[xX/]\s*(\d+)/);
  const hasTee = upper.includes("TEE");
  const isUnequalBySize = teePairMatch && teePairMatch[1] !== teePairMatch[2];
  let type = upper.includes("ELB") || upper.includes("BOCHT")
    ? "ELBOW"
    : upper.includes("ADAPTOR") || upper.includes("ADAPTER")
      ? "ADAPTOR"
    : upper.includes("UNEQUAL") || upper.includes("VERLOOP TEE") || (hasTee && isUnequalBySize)
      ? "UNEQUAL-TEE"
      : upper.includes("TEE")
        ? "EQUAL-TEE"
        : upper.includes("COUPLER") || upper.includes("MOF")
          ? "COUPLER"
          : upper.includes("BLIND")
            ? "BLIND FLANGE"
                : upper.includes("FLANGE") || upper.includes("FLENS") || upper.match(/\bFL/)
              ? "FLANGE"
              : upper.includes("CONC") || upper.includes("REDCON") || upper.includes("RED CON")
                ? "CONCENTRIC REDUCER"
                : upper.includes("ECC") || upper.includes("REDECC") || upper.includes("RED ECC")
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
const parseDimensions = (text, productType, data = {}) => {
  // 1. Check voor Reducer patroon (400x300) of (400/300)
  const reducerMatch = text?.match(/(\d+)\s*[xX/]\s*(\d+)/);
  const upperText = String(text || "").toUpperCase();
  const needsDualId =
    productType.includes("REDUCER") ||
    productType.includes("TEE") ||
    upperText.includes("REDCON") ||
    upperText.includes("RED CON") ||
    upperText.includes("REDECC") ||
    upperText.includes("RED ECC");

  if (reducerMatch && needsDualId) {
    const d1 = reducerMatch[1];
    const d2 = reducerMatch[2];
    if (parseInt(d1) >= 25 && parseInt(d2) >= 25) {
      const inch1 = Math.round((parseFloat(d1) / 25.4) * 2) / 2;
      const inch2 = Math.round((parseFloat(d2) / 25.4) * 2) / 2;
      return `ID: ${d1}x${d2}mm (${inch1}"x${inch2}")`;
    }
  }

  // 2. Check voor standaard ID
  const idMatch = text?.match(/(\d+)(?=[RmM/])/i) || text?.match(/\b(\d+)\b/);
  let val = null;

  if (idMatch) val = parseInt(idMatch[1]);
  
  // Fallback naar gestructureerde data als regex faalt of per ongeluk een hoek (45,90) oppikt
  if ((!val || val <= 25 || val === 45 || val === 90) && (data.dn || data.diameter)) {
     val = parseInt(data.dn || data.diameter);
  }

  if (val > 25 && val !== 45 && val !== 90) {
    return `ID: ${val}mm ${toInches(val)}`;
  }

  if (text) {
      const fallbackMatch = text.match(/(\d{2,4})/g);
      if (fallbackMatch) {
        const maxVal = Math.max(...fallbackMatch.map((n) => parseInt(n)));
        if (maxVal > 25) {
          return `ID: ${maxVal}mm ${toInches(maxVal)}`;
        }
      }
  }

  return data.dn || data.diameter ? `ID: ${parseInt(data.dn || data.diameter)}mm ${toInches(data.dn || data.diameter)}` : "ID: ???";
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
  let productType = parseProductType(desc);

  // FIX: EWT Detectie - Als EWT in de tekst staat, en het is geen bekende vorm, zet type op EWT
  if (desc.toUpperCase().includes("EWT")) {
    // Behoud vorm (Elbow, Tee, etc) indien gevonden, anders wordt het EWT
    if (!productType.match(/(ELBOW|TEE|REDUCER|FLANGE|COUPLER)/)) {
      productType = "EWT";
    }
  }

  // 2. Bepaal Drukklasse (EST/CST/EMT + psi)
  let pressureLine = parsePressure(desc);
  // Fallback: als regex faalt, gebruik specs; anders leeg laten (geen ??).
  if (!pressureLine) {
    if (data.specs?.pressure) {
      const bar = data.specs.pressure;
      const psi = barToPsi(bar);
      pressureLine = `EST ${bar} (${psi}psi)`;
    } else {
      pressureLine = "";
    }
  }

  // Bepaal Pressure Line EMT (zoekt specifiek naar waarden zoals "EMT 30/10" of "EMT30/10")
  let pressureLineEmt = "";
  const emtMatch = desc.match(/EMT\s*(\d+\/\d+)/i) || (data.productId || "").match(/EMT\s*(\d+\/\d+)/i) || (data.itemCode || "").match(/EMT\s*(\d+\/\d+)/i);
  if (emtMatch) {
      pressureLineEmt = `EMT ${emtMatch[1]}`;
  }

  // 3. Bepaal Connecties
  let connectionLine = parseConnections(desc);
  if (!connectionLine && data.specs?.connection) {
    connectionLine = data.specs.connection;
  }

  // 4. Bepaal Afmetingen
  let idLine = parseDimensions(desc, productType, data);
  const diameterVal = parseInt(data.diameter || data.dn || 0, 10);

  // 5. Radius logic
  let radiusText = "";
  if (
    desc.toUpperCase().includes("R1.0") ||
    desc.toUpperCase().includes("R=1.0")
  ) {
    radiusText = "R1.0D";
  }

  // --- FLANGE SPECIFIC FIELDS ---
  let flangeIdLine = "";
  let flangePressureLine = "";
  let flangeConnectionLine = "";
  let flangeDrillingLine = "";

  if (productType === "FLANGE" || desc.toUpperCase().match(/\bFL/)) {
    // 1. Flange ID Line
    const fIdMatch = desc.match(/\bFL(?:ENS|ANGE)?\s*(\d+)\b/i) || desc.match(/\b(\d+)\b/);
    const fId = fIdMatch ? parseInt(fIdMatch[1], 10) : diameterVal;
    if (fId > 0) {
      flangeIdLine = `Flange ID: ${fId}mm ${toInches(fId)}`;
    }

    // 2. Flange Pressure Line
    const fPressMatch = desc.match(/\b(EST|CST|EMT|EWT|EDF)\s*(\d+(?:\.\d+)?)\b/i);
    if (fPressMatch) {
      let t = fPressMatch[1].toUpperCase();
      if (t === "EDF") t = "EST";
      const b = fPressMatch[2];
      flangePressureLine = `${t} ${b} (${barToPsi(b)} PSI)`;
    } else {
      const fPnMatch = desc.match(/\b(?:PN|BAR)\s*(\d+)\b/i);
      if (fPnMatch) {
        const b = fPnMatch[1];
        flangePressureLine = `EST ${b} (${barToPsi(b)} PSI)`;
      } else if (data.specs?.pressure) {
        const b = data.specs.pressure;
        flangePressureLine = `EST ${b} (${barToPsi(b)} PSI)`;
      }
    }

    // 3. Flange Connection Line
    const fConnMatch = desc.match(/\bFL-?(CB|TB|FB)\b/i);
    if (fConnMatch) {
      flangeConnectionLine = `FL-${fConnMatch[1].toUpperCase()}`;
    } else if (desc.match(/\b(CB|TB)\b/i)) {
      flangeConnectionLine = `FL-${desc.match(/\b(CB|TB)\b/i)[1].toUpperCase()}`;
    }

    // 4. Flange Drilling Line
    const asMatch = desc.match(/\b(?:ASA|AS|ANSI|ASME)\s*(\d+)\b/i) || desc.match(/\b(\d+)\s*(?:LBS|#)\b/i);
    if (asMatch) {
      flangeDrillingLine = `DRILLING ASA${asMatch[1]} LIMITED TORQUE`;
    } else {
      const dinMatch = desc.match(/\bDIN\s*(\d+)?\b/i);
      if (dinMatch) {
        flangeDrillingLine = `DRILLING DIN${dinMatch[1] ? `${dinMatch[1]}` : ""} LIMITED TORQUE`;
      } else {
        const jisMatch = desc.match(/\bJIS\s*(\d+K?)\b/i);
        if (jisMatch) {
          flangeDrillingLine = `DRILLING JIS ${jisMatch[1].toUpperCase()} LIMITED TORQUE`;
        } else {
          const pnMatch = desc.match(/\b(?:PN|BAR)\s*(\d+(?:\.\d+)?)\b/i);
          if (pnMatch) {
            flangeDrillingLine = `DRILLING PN${pnMatch[1]} LIMITED TORQUE`;
          } else if (data.specs?.pressure || data.pn) {
            flangeDrillingLine = `DRILLING PN${data.specs?.pressure || data.pn} LIMITED TORQUE`;
          } else {
            flangeDrillingLine = `DRILLING LIMITED TORQUE`;
          }
        }
      }
    }
  }

  // --- PRO FEATURES: Conditionele Logica ---
  
  // 1. Zware Last Waarschuwing (> 300mm)
  const isHeavyLoad = diameterVal > 300;

  // 2. Export Logica (Engels)
  const isExport = data.country && data.country !== "Nederland";
  if (isExport) {
      if (productType === "ELBOW") productType = "ELBOW (EXPORT)";
  }

  // 3. A2G3 Specifieke Logica (Joint Code op basis van ID)
  // ID < 100 -> EST50
  // 100 <= ID < 150 -> EST40
  // ID >= 150 -> EST32
  let jointCode = data.jointCode || "";
  // Zoek A2G3 in alle relevante velden voor betere detectie
  const fullContext = [
      data.itemCode, 
      data.productId, 
      desc, 
      data.orderId, 
      data.extraCode,
      data.articleCode
  ].join(" ").toUpperCase();

  if (fullContext.includes("A2G3")) {
      // Gebruik de berekende idLine om het getal te vinden
      const idVal = idLine.match(/(\d+)/)?.[1]; 
      const id = parseInt(idVal || data.innerDiameter || data.diameter || 0, 10);
      
      let suffix = "";
      if (id > 0) {
        if (id < 100) suffix = "50";
        else if (id >= 100 && id < 150) suffix = "40";
        else if (id >= 150) suffix = "32";
      }
      
      jointCode = `Joint code : EST${suffix}`;
  }

  const diameterInch = toInches(diameterVal);

  return {
    ...data,
    itemCode: data.itemCode || data.productId || "",
    drawing: data.drawing || data.drawingNumber || "N/A",

    idLine: idLine,
    productType: productType,
    pressureLine: pressureLine,
    pressureLineEmt: pressureLineEmt,
    connectionLine: connectionLine,
    radiusText: radiusText,

    flangeIdLine,
    flangePressureLine,
    flangeConnectionLine,
    flangeDrillingLine,
    extraCode: data.extraCode || data.code || "",

    lotNumber: lotNumber,
    jointCode: jointCode, // Toegevoegd voor A2G3 logica
    date: format(new Date(), "dd-MM-yyyy"),
    
    // Pro velden
    diameterInch,
    diameterWithInches: diameterVal > 0 ? `${diameterVal}mm ${diameterInch}` : "",
    isHeavyLoad,
    isExport,
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

  // Auto-upgrade van hardcoded teksten in oude labels naar de dynamische idLine (met inches)
  if (content === "ID: {diameter}mm" || content === "ID: {dn}mm" || content === "ID:{diameter}mm") {
      content = "{idLine}";
  }

  const matches = content.match(/{([^}]+)}/g);

  if (matches) {
    // Deduplicate matches om dubbele verwerking te voorkomen
    const uniqueMatches = [...new Set(matches)];

    uniqueMatches.forEach((match) => {
      const key = match.slice(1, -1);
      const value = key === "date"
        ? format(new Date(), "dd-MM-yyyy")
        : (() => {
          const rawValue = getNestedValue(data, key);
          return rawValue !== undefined && rawValue !== null
            ? String(rawValue)
            : "";
        })();

      // Vervang ALLE voorkomens van de placeholder (niet alleen de eerste)
      content = content.split(match).join(value);
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

/**
 * Filtert labels op basis van product eigenschappen en tags.
 * Gebruik dit in de UI om alleen relevante labels te tonen.
 * @param {Array} labels - Lijst met beschikbare label templates
 * @param {Object} product - Het product waarvoor geprint wordt
 * @returns {Array} Gefilterde labels
 */
export const filterLabelsByProduct = (labels, product, options = {}) => {
  if (!product || !labels) return labels || [];

  if (options.strictTempOrderLabels) {
    return filterTempOrderLabelsByProduct(labels, product);
  }

  const excludeTempOrderLabels = options.excludeTempOrderLabels === true;
  const sourceLabels = excludeTempOrderLabels
    ? labels.filter((label) => {
        const tags = (label.tags || []).map((t) => String(t).toUpperCase().trim());
        const name = String(label.name || "").toUpperCase();
        return (
          !tags.includes("TIJDELIJK") &&
          !tags.includes("TEMP") &&
          !name.includes("TIJDELIJK") &&
          !name.includes("TEMP") &&
          !name.includes("ORDER LABEL") &&
          !name.includes("NOOD")
        );
      })
    : labels;
  
  // 1. Normaliseer product data naar tags (Set voor unieke waarden)
  const productTags = new Set();
  const desc = [
    product.itemCode,
    product.productId,
    product.description,
    product.item,
    product.itemDescription,
    product.article,
    product.articleDescription,
    product.extraCode,
  ]
    .map((value) => String(value || "").toUpperCase().trim())
    .filter(Boolean)
    .join(" ");
  const type = String(product.productType || product.type || "").toUpperCase();
  
  // Basis tags uit type
  if (type) productTags.add(type);

  // Verbeterde Type Detectie: Zoek naar specifieke producttypen in de omschrijving
  const knownTypes = ["ELBOW", "TEE", "REDUCER", "FLANGE", "COUPLER", "BLIND FLANGE", "CONCENTRIC REDUCER", "ECCENTRIC REDUCER", "UNEQUAL-TEE", "EQUAL-TEE"];
  knownTypes.forEach(knownType => {
    if (desc.includes(knownType)) {
      productTags.add(knownType.split('-')[0]); // Add "TEE" for "EQUAL-TEE"
    }
  });

    // Detecteer Flens varianten voor label filtering
    if (type === "FLANGE" || desc.match(/\bFL/) || desc.includes("FLENS") || desc.includes("FLANGE")) {
      productTags.add("FLANGE");
      productTags.add("FLENZEN");
      productTags.add("FLENS");
    }

    // Detecteer "Code" labels (als er een extra code is ingevuld of "CODE" in de omschrijving staat)
    if ((product.extraCode && product.extraCode !== "-" && product.extraCode !== "") || desc.includes("CODE")) {
      productTags.add("CODE");
    }

  // Detecteer specifieke productlijnen uit omschrijving/data
  if (desc.includes("WAVISTRONG") || type.includes("WAVISTRONG")) productTags.add("WAVISTRONG");
  if (desc.includes("FIBERMAR") || type.includes("FIBERMAR")) productTags.add("FIBERMAR");
  if (desc.includes("EST")) productTags.add("EST");
  if (desc.includes("CST")) productTags.add("CST");
  if (desc.includes("EMT")) productTags.add("EMT");
  if (desc.includes("EWT")) productTags.add("EWT");
  
  // 2. Filter logica
  return sourceLabels.filter(label => {
      const labelTags = (label.tags || []).map(t => String(t).toUpperCase()).filter(Boolean);
      
      // REGEL 1: Als een label GEEN tags heeft -> Altijd tonen (Generiek label)
      if (labelTags.length === 0) return true; 
      
      // REGEL 2: Als een label WEL tags heeft -> Toon alleen als product minstens 1 matching tag heeft
      return labelTags.some(tag => productTags.has(tag));
  });
};

/**
 * Strikte filtering voor Legacy / Nood-etiketten (Order Labels).
 * Regels:
 * - Label moet tag TIJDELIJK of TEMP hebben.
 * - Item met A-code (A1S1/A2G3/A2E5/...) => alleen labels met exact die code-tag.
 * - Item met EMT => alleen labels met EMT.
 * - Item met CST/EST/EWT => alleen labels met diezelfde tag(s).
 * - Geen specifieke item-tag => alle tijdelijke labels.
 */
export const filterTempOrderLabelsByProduct = (labels, product) => {
  if (!product || !labels) return labels || [];

  const itemText = `${product.itemCode || product.productId || ""} ${product.description || product.item || ""} ${product.extraCode || product.code || ""} ${product.productType || product.type || ""}`.toUpperCase();
  const normalizedItemText = itemText.replace(/[^A-Z0-9]+/g, " ").trim();

  const hasItemTag = (tag) => {
    const upperTag = String(tag || "").toUpperCase();
    return new RegExp(`\\b${upperTag}(?:\\d+)?\\b`).test(normalizedItemText);
  };

  const itemCstEstEwt = ["CST", "EST", "EWT"].filter(hasItemTag);
  const itemHasEmt = hasItemTag("EMT");
  const itemCodeTags = Array.from(new Set((normalizedItemText.match(/\bA\d[A-Z]\d\b/g) || [])));
  const itemHasAdapter = hasItemTag("ADAPTOR") || hasItemTag("ADAPTER");

  const normalizedTags = (label) => (label.tags || []).map(tag => String(tag).toUpperCase().trim());
  const hasAdapterTag = (tags) => tags.includes("ADAPTOR") || tags.includes("ADAPTER");

  const tempLabels = labels.filter(label => {
    const tags = normalizedTags(label);
    return tags.includes("TIJDELIJK") || tags.includes("TEMP");
  });

  const hasAnyAdapterLabel = tempLabels.some(label => hasAdapterTag(normalizedTags(label)));

  return tempLabels.filter(label => {
    const tags = normalizedTags(label);

    // Adapter items: als er adapter-labels bestaan, toon alleen die labels
    if (itemHasAdapter && hasAnyAdapterLabel) {
      return hasAdapterTag(tags);
    }

    // Hoogste prioriteit: A-code
    if (itemCodeTags.length > 0) {
      return itemCodeTags.some(codeTag => tags.includes(codeTag));
    }

    // Daarna EMT
    if (itemHasEmt) {
      return tags.includes("EMT");
    }

    // Daarna CST/EST/EWT
    if (itemCstEstEwt.length > 0) {
      return itemCstEstEwt.some(tag => tags.includes(tag));
    }

    // Geen specifieke tag gevonden in item
    return true;
  });
};

const qrDataUrlCache = new Map();

export const getQRCodeDataUrl = async (data, size = 150) => {
  const value = String(data || "leeg");
  const width = Math.max(64, Number(size) || 150);
  const cacheKey = `${width}::${value}`;
  const cached = qrDataUrlCache.get(cacheKey);
  if (cached) return cached;

  const dataUrl = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 1,
    width,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  qrDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
};

// Backward-compatible alias; returns a Promise<string> just like getQRCodeDataUrl.
export const getQRCodeUrl = (data, size = 150) => getQRCodeDataUrl(data, size);

export const getBarcodeUrl = (data) =>
  `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    data || "leeg"
  )}&scale=3&height=10&incltext&guardwhitespace`;
