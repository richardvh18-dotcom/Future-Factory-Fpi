/**
 * src/utils/labelHelpers.js
 * Helpers voor het verwerken van label templates en placeholders.
 */

import { format } from "date-fns";
import QRCode from "qrcode";
import i18n from "../i18n";

type AnyRecord = Record<string, unknown>;

type LabelRuleMapping = {
  condition?: string;
  project?: string;
  value?: string;
};

type LabelRuleVariable = {
  name: string;
  defaultValue?: string;
  triggerField?: string;
  mappings?: LabelRuleMapping[];
};

type LabelRule = {
  productCode?: string;
  variables?: LabelRuleVariable[];
};

type LabelTemplate = {
  name?: unknown;
  tags?: unknown[];
  [key: string]: unknown;
};

// --- NIEUWE DYNAMISCHE REGEL ENGINE TYPES ---
export type PrintRuleCondition = {
  field: string; // bijv. "productType", "diameterVal" of "extraCode"
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains";
  value: string | number;
};

export type PrintRuleOutput = {
  labelCount?: number;
  labelSizeId?: string; // Verwijst naar LABEL_SIZES, bijv. "Standard", "Slim", "Large"
  templateId?: string; // Verwijst naar een specifiek Label Template ID uit de Label Maker
  templateIds?: string[]; // Verwijst naar meerdere specifieke Label Template ID's
  requiredTags?: string[]; // Bijv. ["FLENS"] om een specifiek template af te dwingen
};

export type PrintRuleDef = {
  id?: string;
  name: string;
  priority: number; // Hoge prioriteit (bijv. 100) overschrijft lage prioriteit (bijv. 10)
  active: boolean;
  conditions: PrintRuleCondition[];
  output: PrintRuleOutput;
};

// Definieer de standaard formaten
export const LABEL_SIZES = {
  Standard: { width: 90, height: 55, name: i18n.t("label.size_standard", "Standaard (90x55mm)") },
  Slim: { width: 90, height: 30, name: i18n.t("label.size_slim", "Smal (90x30mm)") },
  Legacy: { width: 100, height: 50, name: i18n.t("label.size_legacy", "Legacy (100x50mm)") },
  Large: { width: 100, height: 150, name: i18n.t("label.size_large", "Groot (100x150mm)") },
  Custom: { width: 100, height: 100, name: i18n.t("label.size_custom", "Aangepast") },
};

// --- HULPFUNCTIES VOOR PARSING ---

const MM_TO_INCH_TABLE: Record<number, number> = {
  25: 1,
  40: 1.5,
  50: 2,
  65: 2.5,
  80: 3,
  100: 4,
  125: 5,
  150: 6,
  200: 8,
  250: 10,
  300: 12,
  350: 14,
  400: 16,
  450: 18,
  500: 20,
  600: 24,
  700: 28,
  750: 30,
  800: 32,
  900: 36,
};

const EST_BAR_TO_PSI_TABLE: Array<{ bar: number; psi: number; estLabel: string }> = [
  { bar: 50, psi: 725, estLabel: "50" },
  { bar: 40, psi: 575, estLabel: "40" },
  { bar: 32, psi: 450, estLabel: "32" },
  { bar: 25, psi: 350, estLabel: "25" },
  { bar: 20, psi: 275, estLabel: "20" },
  { bar: 16, psi: 225, estLabel: "16" },
  { bar: 12.5, psi: 175, estLabel: "12.5" },
  { bar: 10, psi: 145, estLabel: "10" },
  { bar: 8, psi: 115, estLabel: "08" },
];

const formatInchValue = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const toRoundedInchValue = (mm: unknown): number | null => {
  const num = parseFloat(String(mm));
  if (isNaN(num) || num <= 0) return null;

  if (Object.prototype.hasOwnProperty.call(MM_TO_INCH_TABLE, num)) {
    return MM_TO_INCH_TABLE[num as keyof typeof MM_TO_INCH_TABLE];
  }

  // Businessregel: inch = mm * 4 / 100, met 0.5 stap tot ID 80 en anders op hele inch.
  const inchRaw = (num * 4) / 100;
  if (num <= 80) return Math.round(inchRaw * 2) / 2;
  return Math.round(inchRaw);
};

const getMappedPsi = (bar: number): number | null => {
  const mapped = EST_BAR_TO_PSI_TABLE.find((entry) => Math.abs(entry.bar - bar) < 0.0001);
  return mapped ? mapped.psi : null;
};

const getEstBarDisplay = (bar: number): string => {
  const mapped = EST_BAR_TO_PSI_TABLE.find((entry) => Math.abs(entry.bar - bar) < 0.0001);
  return mapped ? mapped.estLabel : String(bar);
};

// Converteert mm naar inches volgens tabel + business-afronding
const toInches = (mm: unknown): string => {
  const inchValue = toRoundedInchValue(mm);
  if (inchValue === null) return "";
  return `(${formatInchValue(inchValue)}")`;
};

// Converteert Bar naar PSI met EST-tabel als primaire bron
const barToPsi = (bar: unknown): number | string => {
  const num = parseFloat(String(bar));
  if (isNaN(num)) return "";
  const mappedPsi = getMappedPsi(num);
  if (mappedPsi !== null) return mappedPsi;
  return Math.round(num * 14.5);
};

// Zoekt drukklasse (EST20, CST16, EMT25, EDF11)
const parsePressure = (text: string): string => {
  // 1. Check specifiek op EMT/CMT met de xx/xx notatie (bijv. EMT 10/10)
  const emtMatch = text.match(/(EMT|CMT)\s*(\d+)\s*[-/]\s*(\d+)/i);
  if (emtMatch) {
    const material = emtMatch[1].toUpperCase();
    const x = emtMatch[2];
    const y = emtMatch[3];
    return `${material} Pu ${x} mcw PN${y} bar`;
  }

  // Zoek naar patroon: EST, CST, EMT, EDF, EWT gevolgd door cijfers
  const match = text.match(/\b(EST|CST|EMT|EDF|EWT)\s*(\d+(?:\.\d+)?)\b/i);

  if (match) {
    let type = match[1].toUpperCase();
    const bar = match[2];
    const barNum = parseFloat(bar);

    // Correctie: Als het EDF is (of iets anders dan de standaard 3), map naar EST?
    if (!["EST", "CST", "EMT", "EWT"].includes(type)) {
      type = "EST";
    }
    
    if (type === "EMT" || type === "CMT") {
        return `${type} ${bar}`;
    }

    const psi = barToPsi(bar);
    const barDisplay = type === "EST" && Number.isFinite(barNum) ? getEstBarDisplay(barNum) : bar;
    return `${type} ${barDisplay} (${psi} psi)`;
  }

  // Fallback: Zoek naar PN of BAR
  const fallbackMatch = text.match(/\b(?:PN|BAR)\s*(\d+(?:\.\d+)?)\b/i);
  if (fallbackMatch) {
    const bar = fallbackMatch[1];
    const barNum = parseFloat(bar);
    
    const isEmt = /\b(EMT|CMT)\b/i.test(text);
    if (isEmt) {
        return `EMT ${bar}`;
    }
    
    const psi = barToPsi(bar);
    const barDisplay = Number.isFinite(barNum) ? getEstBarDisplay(barNum) : bar;
    return `EST ${barDisplay} (${psi} psi)`;
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

// Zoekt connecties (CB-CB, FL-TB, TBTB, AB/CB, etc)
const parseConnections = (text: string): string => {
  // Zoekt patronen zoals CB-CB, TB-TB, AB/CB of aan elkaar TBTB, FLTB
  const match = text.match(
    /\b(TB|CB|FL|AM|AB|CS|CF|FB|LB|SB)(?:-|\/|\s)?(TB|CB|FL|AM|AB|CS|CF|FB|LB|SB)(?:(?:-|\/|\s)?(TB|CB|FL|AM|AB|CS|CF|FB|LB|SB))?\b/i
  );

  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    return parts.join("-").toUpperCase();
  }
  return "";
};

const normalizeConnectionLine = (text: string): string =>
  String(text || "")
    .toUpperCase()
    .trim()
    .replace(/\//g, "-")
    .replace(/\s+/g, "-")
    .replace(/^(TB|CB|FL|AM|AB|CS|CF|FB|LB|SB)\1$/, "$1-$1");

// Bepaalt productnaam + graden (voor elbows)
const parseProductType = (text: string): string => {
  const upper = text.toUpperCase();
  const isSleevelessCoupler = /\bSLEEVE?LESS\b/.test(upper) && (upper.includes("COUPLER") || upper.includes("MOF"));
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
        : isSleevelessCoupler || upper.includes("COUPLER") || upper.includes("MOF")
          ? "COUPLER"
          : upper.includes("BLIND")
            ? "BLIND FLANGE"
                : upper.includes("FLANGE") || upper.includes("FLENS") || /\b(?:FL|STUB)\b/.test(upper)
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
const parseDimensions = (
  text: string | null | undefined,
  productType: string,
  data: { dn?: string | number; diameter?: string | number } = {}
): string | null => {
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
      const inch1 = toRoundedInchValue(d1);
      const inch2 = toRoundedInchValue(d2);
      if (inch1 !== null && inch2 !== null) {
        return `ID: ${d1}x${d2}mm (${formatInchValue(inch1)}"x${formatInchValue(inch2)}")`;
      }
      return `ID: ${d1}x${d2}mm`;
    }
  }

  // 2. Check voor standaard ID
  const idMatch = text?.match(/(\d+)(?=[RmM/])/i) || text?.match(/\b(\d+)\b/);
  let val: number | null = null;

  if (idMatch) val = parseInt(idMatch[1]);

  // Fallback naar gestructureerde data als regex faalt of per ongeluk een hoek (45,90) oppikt
  if ((!val || val <= 25 || val === 45 || val === 90) && (data.dn || data.diameter)) {
    val = parseInt(data.dn as string) || parseInt(data.diameter as string);
  }

  if (typeof val === "number" && val > 25 && val !== 45 && val !== 90) {
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

  return null;
};

// Hulpfunctie om geneste object properties te vinden
const getNestedValue = (obj: Record<string, unknown> | null | undefined, path: string): unknown => {
  if (!path) return undefined;
  return path.split(".").reduce((acc: unknown, part: string) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
};

const resolvePlaceholderValue = (data: AnyRecord, key: string): string => {
  const directValue = getNestedValue(data, key);
  if (directValue !== undefined && directValue !== null && String(directValue) !== "") {
    return String(directValue);
  }

  // Backward-compatible aliasing for templates that use {code}.
  if (key === "code") {
    const fallback =
      getNestedValue(data, "extraCode") ??
      getNestedValue(data, "itemCode") ??
      getNestedValue(data, "productId");
    return fallback !== undefined && fallback !== null ? String(fallback) : "";
  }

  if (key === "extraCode") {
    const fallback =
      getNestedValue(data, "code") ??
      getNestedValue(data, "itemCode") ??
      getNestedValue(data, "productId");
    return fallback !== undefined && fallback !== null ? String(fallback) : "";
  }

  return "";
};

/**
 * Verwerkt ruwe orderdata naar rijke label data.
 */
export const processLabelData = (data: Record<string, unknown> | null | undefined): Record<string, unknown> => {
  if (!data) return {};

  const rawData = data as Record<string, unknown>;
  const desc = String(rawData.item || rawData.description || "").trim();
  const upperDesc = desc.toUpperCase();
  const lotNumber = String(rawData.lotNumber || "");
  const isSleevelessCoupler = /\bSLEEVE?LESS\b/.test(upperDesc) && (upperDesc.includes("COUPLER") || upperDesc.includes("MOF"));

  // 1. Bepaal Product Type
  let productType = parseProductType(desc);
  if (isSleevelessCoupler) {
    productType = "Sleevless Coupler";
  }

  // FIX: EWT Detectie - Als EWT in de tekst staat, en het is geen bekende vorm, zet type op EWT
  if (desc.toUpperCase().includes("EWT")) {
    // Behoud vorm (Elbow, Tee, etc) indien gevonden, anders wordt het EWT
    if (!productType.match(/(ELBOW|TEE|REDUCER|FLANGE|COUPLER)/)) {
      productType = "EWT";
    }
  }

  // 2. Bepaal Drukklasse (EST/CST/EMT + psi)
  let pressureLine = parsePressure(desc);
  const specs = rawData.specs as { pressure?: unknown; connection?: unknown } | undefined;
  // Fallback: als regex faalt, gebruik specs; anders leeg laten (geen ??).
  if (!pressureLine) {
    if (specs?.pressure) {
      const bar = specs.pressure;
      const psi = barToPsi(bar);
      pressureLine = `EST ${bar} (${psi}psi)`;
    } else {
      pressureLine = "";
    }
  }

  // Bepaal Pressure Line EMT (zoekt specifiek naar waarden zoals "EMT 30/10" of "EMT30/10")
  let pressureLineEmt = "";
  const emtLikeMatch =
    desc.match(/(EMT|CMT|FIBERMAR)\s*(\d+)\s*[-/]\s*(\d+)/i) ||
    String(rawData.productId || "").match(/(EMT|CMT|FIBERMAR)\s*(\d+)\s*[-/]\s*(\d+)/i) ||
    String(rawData.itemCode || "").match(/(EMT|CMT|FIBERMAR)\s*(\d+)\s*[-/]\s*(\d+)/i);
  if (emtLikeMatch) {
      let materialCode = String(emtLikeMatch[1] || "EMT").toUpperCase();
      if (materialCode === "FIBERMAR") {
        materialCode = upperDesc.includes("CONDUCTIVE") || upperDesc.includes("CMT") ? "CMT" : "EMT";
      }
      const x = emtLikeMatch[2];
      const y = emtLikeMatch[3];
      pressureLineEmt = `${materialCode} Pu ${x} mcw PN${y} bar`;
      // Altijd overschrijven voor EMT/CMT omdat dit het specifieke "xx/xx" formaat forceert
      pressureLine = pressureLineEmt;
  }

  let materialLine = "";
  if (upperDesc.includes("CMT")) {
    materialLine = "Fibermar Conductive";
  } else if (upperDesc.includes("EMT") || upperDesc.includes("FIBERMAR")) {
    materialLine = "Fibermar";
  } else if (upperDesc.includes("CST")) {
    materialLine = "Wavistrong Conductive";
  } else if (upperDesc.includes("EST") || upperDesc.includes("EWT") || upperDesc.includes("WAVISTRONG")) {
    materialLine = "Wavistrong";
  }

  // 3. Bepaal Connecties
  let connectionLine = parseConnections(desc);
  if (!connectionLine) {
    const compactConnectionMatch = upperDesc.match(/\b((?:FB|LB|TB|CB|FL|AM|AB|CS|CF|SB){2,3})\b/);
    if (compactConnectionMatch) {
      connectionLine = compactConnectionMatch[1];
    }
  }
  if (!connectionLine) {
    if (specs?.connection) {
      connectionLine = String(specs.connection);
    }
  }

  connectionLine = normalizeConnectionLine(connectionLine);
  const isSpecialElbow =
    productType.startsWith("ELBOW") && /^(AB-AB|SB-SB)$/.test(connectionLine);

  if (isSpecialElbow) {
    productType = "ELBOW 45°";
  }

  if (connectionLine === "AB-AB") {
    connectionLine = `${connectionLine} ADJUSTING`;
  }

  // 4. Bepaal Afmetingen
  let idLine = parseDimensions(desc, productType, data);
  const diaMatch = desc.toUpperCase().match(/\b(\d{2,4})\s*(?:MM|-|R|X|\b)/);
  const diameterVal = diaMatch ? parseInt(diaMatch[1], 10) : parseInt(String(rawData.diameter || rawData.dn || 0), 10);

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

  if (productType === "FLANGE" || /\b(?:FL|FLENS|FLANGE|STUB)\b/.test(desc.toUpperCase())) {
    // 1. Flange ID Line
    const fIdMatch = desc.match(/\bFL(?:ENS|ANGE)?\s*(\d+)\b/i) || desc.match(/\b(\d+)\b/);
    const fId = fIdMatch ? parseInt(fIdMatch[1], 10) : diameterVal;
    if (fId > 0) {
      flangeIdLine = `Flange ID: ${fId}mm ${toInches(fId)}`;
    }

    // 2. Flange Pressure Line
    if (pressureLineEmt) {
      flangePressureLine = pressureLineEmt;
    } else {
      const fPressMatch = desc.match(/\b(EST|CST|EMT|EWT|EDF)\s*(\d+(?:\.\d+)?)\b/i);
      if (fPressMatch) {
        let t = fPressMatch[1].toUpperCase();
        if (t === "EDF") t = "EST";
        const b = fPressMatch[2];
        const barNum = parseFloat(b);
        
        if (t === "EMT" || t === "CMT") {
            flangePressureLine = `${t} ${b}`;
        } else {
            const barDisplay = t === "EST" && Number.isFinite(barNum) ? getEstBarDisplay(barNum) : b;
            flangePressureLine = `${t} ${barDisplay} (${barToPsi(b)} PSI)`;
        }
      } else {
        const isEmtProduct = /\b(EMT|CMT)\b/i.test(desc) || /\b(EMT|CMT)\b/i.test(String(rawData.itemCode || ""));
        const defaultType = isEmtProduct ? "EMT" : "EST";
        
        const fPnMatch = desc.match(/\b(?:PN|BAR)\s*(\d+(?:\.\d+)?)\b/i);
        if (fPnMatch) {
          const b = fPnMatch[1];
          const barNum = parseFloat(b);
          if (isEmtProduct) {
              flangePressureLine = `${defaultType} ${b}`;
          } else {
              const barDisplay = Number.isFinite(barNum) ? getEstBarDisplay(barNum) : b;
              flangePressureLine = `${defaultType} ${barDisplay} (${barToPsi(b)} PSI)`;
          }
        } else if (specs?.pressure) {
          const b = specs.pressure;
          const barNum = parseFloat(String(b));
          if (isEmtProduct) {
              flangePressureLine = `${defaultType} ${b}`;
          } else {
              const barDisplay = Number.isFinite(barNum) ? getEstBarDisplay(barNum) : String(b);
              flangePressureLine = `${defaultType} ${barDisplay} (${barToPsi(b)} PSI)`;
          }
        }
      }
    }

    // 3. Flange Connection Line
    const fConnMatch = desc.match(/\bFL-?(CB|TB|FB)\b/i);
    const tbCbMatch = desc.match(/\b(CB|TB)\b/i);
    if (fConnMatch) {
      flangeConnectionLine = `FL-${fConnMatch[1].toUpperCase()}`;
    } else if (tbCbMatch) {
      flangeConnectionLine = `FL-${tbCbMatch[1].toUpperCase()}`;
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
          } else if (specs?.pressure || rawData.pn) {
            flangeDrillingLine = `DRILLING PN${specs?.pressure || rawData.pn} LIMITED TORQUE`;
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
  const isExport = rawData.country && rawData.country !== "Nederland";
  if (isExport) {
      if (productType === "ELBOW") productType = "ELBOW (EXPORT)";
  }

  // 3. A2G3 Specifieke Logica (Joint Code op basis van ID)
  // ID < 100 -> EST50
  // 100 <= ID < 150 -> EST40
  // ID >= 150 -> EST32
  let jointCode = String(rawData.jointCode || "");
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
      const idVal = idLine?.match(/(\d+)/)?.[1];
      const id = parseInt(String(idVal || rawData.innerDiameter || rawData.diameter || 0), 10);
      
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
    materialLine: materialLine,
    connectionLine: connectionLine,
    radiusText: radiusText,

    flangeIdLine,
    flangePressureLine,
    flangeConnectionLine,
    flangeDrillingLine,
    code: data.code || data.itemCode || data.productId || "",
    extraCode: data.extraCode || data.Code || "",

    lotNumber: lotNumber,
    jointCode: jointCode, // Toegevoegd voor A2G3 logica
    date: format(new Date(), "dd-MM-yyyy"),
    
    // Pro velden
    diameterVal,
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
export const applyLabelLogic = (
  data: AnyRecord,
  rules: LabelRule[] | null | undefined
): AnyRecord => {
  if (!rules || rules.length === 0) return data;
  
  const enriched = { ...data };
  const productCode = String(data.itemCode || data.productId || "").toUpperCase();

  // Zoek regels die van toepassing zijn op dit product
  const activeRule = rules.find(
    (r: LabelRule) => String(r.productCode || "").toUpperCase() === productCode
  );
  
  if (activeRule && activeRule.variables) {
    activeRule.variables.forEach((variable: LabelRuleVariable) => {
      let value = variable.defaultValue || "";
      
      if (variable.mappings) {
        // Bepaal welk veld de trigger is (default: project)
        const triggerField = variable.triggerField || "project";
        
        // Helper om waarde op te halen (ook uit specs of mappings)
        const getValue = (field: string): unknown => {
            // 1. Directe match
            if (data[field] !== undefined) return data[field];
            // 2. Mapping aliases
            if (field === 'diameter' && data.dn !== undefined) return data.dn;
            if (field === 'pressure' && data.pn !== undefined) return data.pn;
            if (field === 'extraCode') return data.extraCode || data.Code || "";
            // 3. Specs object
            const specs = data.specs as AnyRecord | undefined;
            if (specs && specs[field] !== undefined) return specs[field];
            
            // 4. Case-insensitive fallback (voor bijv. NPRs vs nprs)
            const lowerField = field.toLowerCase();
            const key = Object.keys(data).find((k) => k.toLowerCase() === lowerField);
            if (key) return data[key];
            if (specs) {
              const specKey = Object.keys(specs).find((k) => k.toLowerCase() === lowerField);
              if (specKey) return specs[specKey];
            }
            
            return "";
        };

        const dataValue = String(getValue(triggerField)).toUpperCase();

        const match = variable.mappings.find((m: LabelRuleMapping) => {
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
        
        if (match) value = String(match.value || "");
      }
      enriched[variable.name] = value;
    });
  }
  return enriched;
};

/**
 * Vervangt placeholders.
 */
export const resolveLabelContent = (
  contentOrElement: string | AnyRecord | null | undefined,
  data: AnyRecord | null | undefined
): string | AnyRecord | null | undefined => {
  if (!data) return contentOrElement;

  let content = "";
  let isElement = false;

  if (typeof contentOrElement === "string") {
    content = contentOrElement;
  } else if (contentOrElement && typeof contentOrElement === "object") {
    content = String(contentOrElement.content || "");
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
        : resolvePlaceholderValue(data, key);

      // Vervang ALLE voorkomens van de placeholder (niet alleen de eerste)
      content = content.split(match).join(value);
    });
  }

  if (isElement) {
    const element = contentOrElement as AnyRecord;
    return {
      ...element,
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
export const filterLabelsByProduct = (
  labels: LabelTemplate[] | null | undefined,
  product: AnyRecord | null | undefined,
  options: Record<string, unknown> = {}
): LabelTemplate[] => {
  if (!product || !labels) return labels || [];

  if (options.strictTempOrderLabels === true) {
    return filterTempOrderLabelsByProduct(labels, product);
  }

  const excludeTempOrderLabels = options.excludeTempOrderLabels === true;
  const sourceLabels = excludeTempOrderLabels
    ? labels.filter((label: LabelTemplate) => {
      const tags = (label.tags || []).map((t: unknown) => String(t).toUpperCase().trim());
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
  
  const MATERIAL_TAGS = ["FIBERMAR", "WAVISTRONG", "CONDUCTIVE", "EST", "CST", "EMT", "CMT", "EWT"];

  // 1. Normaliseer product data naar tags (Set voor unieke waarden)
  const productTags = new Set<string>();
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
    if (type === "FLANGE" || /\b(?:FL|FLENS|FLANGE|STUB)\b/.test(desc)) {
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
  
  if (desc.includes("EST")) { productTags.add("EST"); productTags.add("WAVISTRONG"); }
  if (desc.includes("CST")) { productTags.add("CST"); productTags.add("WAVISTRONG"); productTags.add("CONDUCTIVE"); }
  if (desc.includes("EMT")) { productTags.add("EMT"); productTags.add("FIBERMAR"); }
  if (desc.includes("CMT")) { productTags.add("CMT"); productTags.add("FIBERMAR"); productTags.add("CONDUCTIVE"); }
  if (desc.includes("EWT")) { productTags.add("EWT"); productTags.add("WAVISTRONG"); }

  if (desc.includes("CMT")) {
    productTags.add("FIBERMAR");
    productTags.add("CONDUCTIVE");
  }

  // Sleeveless/Sleevless couplers lopen in productie als fitting/coupler met Wavistrong-label.
  const isSleevelessCoupler = /\bSLEEVE?LESS\b/.test(desc) && (desc.includes("COUPLER") || desc.includes("MOF"));
  if (isSleevelessCoupler) {
    productTags.add("COUPLER");
    productTags.add("WAVISTRONG");
    productTags.add("FITTING");
    productTags.add("FITTINGS");
  }
  
  // 2. Filter logica
  return sourceLabels.filter((label: LabelTemplate) => {
      const labelTags = (label.tags || [])
        .map((t: unknown) => String(t).toUpperCase())
        .filter(Boolean);
      
      // REGEL 1: Als een label GEEN tags heeft -> Altijd tonen (Generiek label)
      if (labelTags.length === 0) return true; 
      
      // REGEL: Materiaal uitsluiting. Als het label specifieke materiaaltags heeft (FIBERMAR, WAVISTRONG etc),
      // mag het alleen gekozen worden als het product óók op dat materiaal matcht.
      const labelMaterialTags = labelTags.filter(t => MATERIAL_TAGS.includes(t));
      if (labelMaterialTags.length > 0) {
         const hasMatchingMaterial = labelMaterialTags.some(t => productTags.has(t));
         if (!hasMatchingMaterial) return false;
      }

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
export const filterTempOrderLabelsByProduct = (
  labels: LabelTemplate[] | null | undefined,
  product: AnyRecord | null | undefined
): LabelTemplate[] => {
  if (!product || !labels) return labels || [];

  const getTemplateSortTime = (label: LabelTemplate): number => {
    const stamp = label.lastUpdated || label.updatedAt || label.createdAt;
    if (!stamp) return 0;

    if (typeof stamp === "number") return stamp;
    if (typeof stamp === "string") {
      const parsed = Date.parse(stamp);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    if (typeof stamp === "object") {
      const typedStamp = stamp as {
        toMillis?: () => number;
        toDate?: () => Date;
        seconds?: number;
      };

      if (typeof typedStamp.toMillis === "function") {
        return typedStamp.toMillis();
      }

      if (typeof typedStamp.toDate === "function") {
        return typedStamp.toDate().getTime();
      }

      if (typeof typedStamp.seconds === "number") {
        return typedStamp.seconds * 1000;
      }
    }

    return 0;
  };

  const itemText = `${product.itemCode || product.productId || ""} ${product.description || product.item || ""} ${product.extraCode || product.code || ""} ${product.productType || product.type || ""}`.toUpperCase();
  const normalizedItemText = itemText.replace(/[^A-Z0-9]+/g, " ").trim();

  const hasItemTag = (tag: string): boolean => {
    const upperTag = String(tag || "").toUpperCase();
    return new RegExp(`\\b${upperTag}(?:\\d+)?\\b`).test(normalizedItemText);
  };

  const itemCstEstEwt = ["CST", "EST", "EWT"].filter(hasItemTag);
  const itemHasEmt = hasItemTag("EMT");
  const itemCodeTags = Array.from(new Set((normalizedItemText.match(/\bA\d[A-Z]\d\b/g) || [])));
  const itemHasAdapter = hasItemTag("ADAPTOR") || hasItemTag("ADAPTER");

  const normalizedTags = (label: LabelTemplate): string[] =>
    (label.tags || []).map((tag: unknown) => String(tag).toUpperCase().trim());
  const hasAdapterTag = (tags: string[]): boolean => tags.includes("ADAPTOR") || tags.includes("ADAPTER");

  const tempLabels = labels.filter((label: LabelTemplate) => {
    const tags = normalizedTags(label);
    return tags.includes("TIJDELIJK") || tags.includes("TEMP");
  }).sort((a: LabelTemplate, b: LabelTemplate) => {
    const timeDiff = getTemplateSortTime(b) - getTemplateSortTime(a);
    if (timeDiff !== 0) return timeDiff;

    const nameA = String(a.name || a.id || "").toUpperCase();
    const nameB = String(b.name || b.id || "").toUpperCase();
    return nameA.localeCompare(nameB, undefined, { numeric: true });
  });

  const hasAnyAdapterLabel = tempLabels.some((label: LabelTemplate) => hasAdapterTag(normalizedTags(label)));

  return tempLabels.filter((label: LabelTemplate) => {
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

const qrDataUrlCache = new Map<string, string>();

export const getQRCodeDataUrl = async (data: unknown, size = 150): Promise<string> => {
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
export const getQRCodeUrl = (data: unknown, size = 150): Promise<string> =>
  getQRCodeDataUrl(data, size);

/**
 * Evalueert dynamische printregels uit de database om het aantal labels, formaat en tags te bepalen.
 */
export const evaluatePrintRules = (
  productData: Record<string, any>,
  rules: PrintRuleDef[]
): PrintRuleOutput => {
  // Basis/Standaard instellingen als geen enkele regel triggert
  const finalOutput: PrintRuleOutput = {
    labelCount: 1,
    requiredTags: [],
  };

  if (!rules || !Array.isArray(rules)) return finalOutput;

  // Sorteer regels van lage naar hoge prioriteit, zodat een specifiekere regel de basis kan overschrijven
  const activeRules = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    let matchesAll = true;

    for (const condition of rule.conditions) {
      const prodVal = productData[condition.field];
      if (prodVal === undefined) {
        matchesAll = false;
        break;
      }

      const numProdVal = parseFloat(String(prodVal));
      const numCondVal = parseFloat(String(condition.value));
      const isNumeric = !isNaN(numProdVal) && !isNaN(numCondVal);

      switch (condition.operator) {
        case "==": matchesAll = isNumeric ? numProdVal === numCondVal : String(prodVal).toUpperCase() === String(condition.value).toUpperCase(); break;
        case "!=": matchesAll = isNumeric ? numProdVal !== numCondVal : String(prodVal).toUpperCase() !== String(condition.value).toUpperCase(); break;
        case ">":  matchesAll = isNumeric ? numProdVal > numCondVal : false; break;
        case ">=": matchesAll = isNumeric ? numProdVal >= numCondVal : false; break;
        case "<":  matchesAll = isNumeric ? numProdVal < numCondVal : false; break;
        case "<=": matchesAll = isNumeric ? numProdVal <= numCondVal : false; break;
        case "contains": matchesAll = String(prodVal).toUpperCase().includes(String(condition.value).toUpperCase()); break;
        default: matchesAll = false;
      }
      if (!matchesAll) break;
    }

    if (matchesAll) {
      // Pas de output toe (overschrijf bestaande waarden)
      if (rule.output.labelCount !== undefined) finalOutput.labelCount = rule.output.labelCount;
      if (rule.output.labelSizeId) finalOutput.labelSizeId = rule.output.labelSizeId;
      if (rule.output.templateId) finalOutput.templateId = rule.output.templateId;
      if (rule.output.templateIds && rule.output.templateIds.length > 0) finalOutput.templateIds = rule.output.templateIds;
      if (rule.output.requiredTags && rule.output.requiredTags.length > 0) {
        finalOutput.requiredTags = rule.output.requiredTags;
      }
    }
  }

  return finalOutput;
};

export const getBarcodeUrl = (data: unknown): string =>
  `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    String(data ?? "leeg")
  )}&scale=3&height=10&incltext&guardwhitespace`;
