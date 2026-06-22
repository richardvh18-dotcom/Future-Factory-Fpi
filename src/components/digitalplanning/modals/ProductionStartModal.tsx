import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PlayCircle,
  Printer,
  RefreshCw,
  QrCode,
  Layers,
  X,
  Keyboard,
  Activity,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Database
} from "lucide-react";
import { collection, collectionGroup, getDocs, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp, runTransaction, limit } from "firebase/firestore";

import { db, auth, logActivity } from "../../../config/firebase"; 
import { PATHS, getArchiveItemsPath, getPathString } from "../../../config/dbPaths";
import {
  filterLabelsByProduct,
  processLabelData,
  evaluatePrintRules,
  type PrintRuleDef
} from "../../../utils/labelHelpers";
import { getFlangeSeriesInfo } from "../../../utils/flangeSeriesHelper";
import { lookupProductByManufacturedId } from "../../../utils/conversionLogic";
import { useNotifications } from "../../../contexts/NotificationContext";
import { useProgressOperationsStore } from "../../../contexts/ProgressOperationContext";
import { generateLotBatchZPL } from "../../../utils/zplHelper";
import { renderLabelToBitmapZpl } from "../../../utils/unifiedLabelRenderEngine";
import { getDriver } from "../../../utils/printerDrivers";
import { queuePrintJob } from "../../../services/planningSecurityService";
import { resolvePrinterForRouting } from "../../../utils/printRouting";
import LabelVisualPreview from "../../printer/LabelVisualPreview";
import { useLabelPreview } from "../../../hooks/useLabelPreview";
import InternalQrImage from "../../../utils/InternalQrImage";

/**
 * DPI-aware PIXELS_PER_MM for print preview parity
 * Must match zplHelper.js printer DPI conversions
 */
const getPixelsPerMm = (printerDpi = 203) => {
  return (printerDpi || 203) / 25.4;
};

const DEFAULT_PRINTER_DPI = 203;
const LOT_ARCHIVE_LOOKBACK_YEARS = 6;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

type LabelOption = {
  id: string;
  name?: string;
  width?: number | string;
  height?: number | string;
  tags?: string[];
};

type OperatorPrintRule = {
  id?: string;
  enabled?: boolean;
  productType?: string;
  code?: string;
  minDiameter?: number;
  maxDiameter?: number;
  angle?: number;
  labelCount?: number;
  labelSize?: "large" | "small";
};

const isPermissionDeniedError = (error: any) => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("permission-denied") || message.includes("insufficient permissions");
};

// Functie om ISO week en bijbehorend ISO jaar te berekenen
const getIsoWeekAndYear = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week: String(weekNo).padStart(2, '0'), year: String(year) };
};

// Machine naar FPI code mapping
const getMachineCode = (station: string | null | undefined) => {
  if (!station) return "999";
  const normalized = String(station).toUpperCase().trim();
  const baseStation = normalized.startsWith('40') ? normalized.substring(2) : normalized;
  
  const map: Record<string, string> = {
    'BH11': '411',
    'BH12': '412',
    'BH15': '415',
    'BH16': '416',
    'BH17': '417',
    'BH18': '418',
    'BH31': '431',
    'BH05': '405',
    'BH07': '407',
    'BH08': '408',
    'BH09': '409',
    'BA05': '405',
    'BA07': '417'
  };
  
  if (map[baseStation]) return map[baseStation];

  const digits = baseStation.replace(/\D/g, "");
  if (!digits) return "999";
  
  if (digits.length === 3) return digits;
  if (digits.length === 1) return `40${digits}`;
  return `4${digits.slice(-2).padStart(2, "0")}`;
};

const getNormalizedPrinterDpi = (printer: any, fallback = 203) => {
  const driverDpi = Number(getDriver(printer)?.nativeDpi);
  if (Number.isFinite(driverDpi) && driverDpi > 0) return driverDpi;
  const parsed = Number.parseInt(printer?.dpi, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

const normalizeStationCode = (station: unknown): string => {
  const normalized = String(station || "").trim().toUpperCase();
  return normalized.startsWith("40") ? normalized.slice(2) : normalized;
};

const isBh18Station = (station: unknown): boolean => normalizeStationCode(station) === "BH18";

const isLargeLabelOption = (label: LabelOption): boolean =>
  (Number(label.height) >= 45 && !String(label.name || "").toLowerCase().includes("smal")) ||
  String(label.name || "").toLowerCase().includes("groot") ||
  String(label.name || "").toLowerCase().includes("standard");

const isSmallLabelOption = (label: LabelOption): boolean =>
  String(label.name || "").toLowerCase().includes("smal") || Number(label.height) < 45;

const getNormalizedLabelTags = (label: LabelOption): string[] =>
  (Array.isArray(label.tags) ? label.tags : [])
    .map((tag) => String(tag || "").trim().toUpperCase())
    .filter(Boolean);

const getOrderCodeTags = (order: any): string[] => {
  const orderText = [order?.item, order?.itemCode, order?.itemDescription, order?.description, order?.extraCode]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");
  return Array.from(new Set(orderText.match(/\bA\d[A-Z]\d\b/g) || []));
};

const getOrderPrimaryCode = (order: any): string => {
  const explicitCode = String(order?.extraCode || order?.code || "").trim().toUpperCase();
  if (explicitCode) return explicitCode;

  const tags = getOrderCodeTags(order);
  return String(tags[0] || "").trim().toUpperCase();
};

const hasSpecificOrderCodeTag = (label: LabelOption): boolean =>
  getNormalizedLabelTags(label).some((tag) => /^A\d[A-Z]\d$/.test(tag));

const getOrderNominalDiameter = (order: any): number => {
  const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(" ").toUpperCase();
  const match = itemIdentifier.match(/\b(\d{2,4})\s*(?:MM|-|R|X|\b)/);
  const parsed = match ? parseInt(match[1], 10) : parseInt(String(order?.diameter || order?.dn || "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getOrderAngle = (order: any): number | null => {
  const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(" ").toUpperCase();
  const degreeMatch = itemIdentifier.match(/\b(11\.25|22\.5|30|45|60|90)\s*(?:DEG|GR|°)?\b/);
  if (!degreeMatch) return null;
  const angle = Number.parseFloat(degreeMatch[1]);
  return Number.isFinite(angle) ? angle : null;
};

const isSleevelessCouplerOrder = (order: any): boolean => {
  const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription, order?.description]
    .join(" ")
    .toUpperCase();
  const hasSleeveToken = /\bSLEEVE?LESS\b/.test(itemIdentifier);
  const hasCouplerToken = itemIdentifier.includes("COUPLER") || itemIdentifier.includes("MOF");
  return hasSleeveToken && hasCouplerToken;
};

const getOrderProductTypeKey = (order: any): string => {
  const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(" ").toUpperCase();
  if (isSleevelessCouplerOrder(order)) return "COUPLER";
  if (itemIdentifier.includes("ELB") || itemIdentifier.includes("BOCHT")) return "ELBOW";
  if (itemIdentifier.includes("FLANGE") || itemIdentifier.includes("FLENS")) return "FLANGE";
  if (itemIdentifier.includes("UNEQUAL") || itemIdentifier.includes("VERLOOP TEE")) return "UNEQUAL-TEE";
  if (itemIdentifier.includes("TEE")) return "EQUAL-TEE";
  if (itemIdentifier.includes("REDUCER") || itemIdentifier.includes("VERLOOP")) return "REDUCER";
  if (itemIdentifier.includes("COUPLER") || itemIdentifier.includes("MOF")) return "COUPLER";
  if (itemIdentifier.includes("ADAPTOR") || itemIdentifier.includes("ADAPTER")) return "ADAPTOR";
  return "OTHER";
};

const resolveOperatorPrintRule = (order: any, rules: OperatorPrintRule[] | null | undefined): OperatorPrintRule | null => {
  const list = Array.isArray(rules) ? rules : [];
  if (list.length === 0) return null;

  const diameter = getOrderNominalDiameter(order);
  const angle = getOrderAngle(order);
  const productType = getOrderProductTypeKey(order);
  const orderCode = getOrderPrimaryCode(order);

  return (
    list.find((rule) => {
      if (rule?.enabled === false) return false;

      const ruleType = String(rule?.productType || "ANY").toUpperCase();
      if (ruleType !== "ANY" && ruleType !== productType) return false;

      const ruleCode = String(rule?.code || "ANY").trim().toUpperCase();
      if (ruleCode !== "ANY") {
        if (!orderCode || orderCode !== ruleCode) return false;
      }

      if (typeof rule?.minDiameter === "number" && diameter < rule.minDiameter) return false;
      if (typeof rule?.maxDiameter === "number" && diameter > rule.maxDiameter) return false;

      if (typeof rule?.angle === "number") {
        if (angle === null) return false;
        if (Math.abs(angle - rule.angle) > 0.001) return false;
      }

      return true;
    }) || null
  );
};

const ProductionStartModal = ({
  order,
  isOpen,
  onClose,
  onStartInitiated,
  onStart,
  onOpenProductInfo,
  stationId = "",
  existingProducts = [],
}: {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onStartInitiated?: () => void;
  onStart: (...args: any[]) => void | Promise<void>;
  onOpenProductInfo?: (...args: any[]) => void;
  stationId?: string;
  existingProducts?: any[];
}) => {
  const { t } = useTranslation();
  const { showSuccess, showError , notify} = useNotifications();
  const addOperation = useProgressOperationsStore((state) => state.addOperation);
  const updateOperation = useProgressOperationsStore((state) => state.updateOperation);
  const removeOperation = useProgressOperationsStore((state) => state.removeOperation);
  const [mode, setMode] = useState("manual"); // Standaard manueel voor pilot
  const [lotNumber, setLotNumber] = useState("");
  const [stringCount, setStringCount] = useState("1");
  const [labelCount, setLabelCount] = useState("1");
  const [manualLotInput, setManualLotInput] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [manualOrderInput, setManualOrderInput] = useState("");
  const [assignedOperators, setAssignedOperators] = useState<Array<{ number: string; name: string }>>([]);
  const [operatorInput, setOperatorInput] = useState("");
  
  // Refs voor autofocus bij barcode scanning
  const orderInputRef = useRef<HTMLInputElement>(null);
  const lotInputRef = useRef<HTMLInputElement>(null);
  const manualLotAutoStartTimeoutRef = useRef<any>(null);
  const lastLotInputAtRef = useRef(0);
  const previousLotInputRef = useRef("");
  const scannerLikeLotInputRef = useRef(false);
  const lastResetKeyRef = useRef("");
  const [orderValidated, setOrderValidated] = useState(false);
  const [orderError, setOrderError] = useState("");

  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const location = useLocation();
  
  const [savedPrinters, setSavedPrinters] = useState<any[]>([]);
  const [generalSettings, setGeneralSettings] = useState<any>({ flangeSeriesRules: [] });
  const [dynamicPrintRules, setDynamicPrintRules] = useState<PrintRuleDef[]>([]);
  const [toolingMolds, setToolingMolds] = useState<any[]>([]);
  const [relatedItemCodes, setRelatedItemCodes] = useState<string[]>([]);
  const [printConfig, setPrintConfig] = useState({
    mode: "queue", 
    printerIp: "",
    printerId: ""
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const counterPermissionWarnedRef = useRef(false);

  const [isCheckingLot, setIsCheckingLot] = useState(false);
  const [lotError, setLotError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [manualMinimumSeq, setManualMinimumSeq] = useState<number | null>(null);
  const [manualPoolHint, setManualPoolHint] = useState("");
  const isManualMode = mode === "manual";
  const shouldAutoFocusInputs = useMemo(() => {
    if (typeof window === "undefined") return true;
    const hasCoarsePointer = typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    const hasTouch = typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0;
    return !(hasCoarsePointer || hasTouch);
  }, []);
  const flangeSeriesInfo = useMemo(
    () =>
      getFlangeSeriesInfo(
        order,
        generalSettings?.flangeSeriesRules,
        toolingMolds,
        stationId,
        relatedItemCodes
      ),
    [order, generalSettings?.flangeSeriesRules, toolingMolds, stationId, relatedItemCodes]
  );
  const isFlangeOrder = !!flangeSeriesInfo?.isFlange;
  const normalizedStation = String(stationId || "").toUpperCase().trim();
  const normalizedStationNoPrefix = normalizedStation.startsWith("40")
    ? normalizedStation.slice(2)
    : normalizedStation;
  const isBh11OrBh15Station = normalizedStationNoPrefix === "BH11" || normalizedStationNoPrefix === "BH15";
  const isBh12Station = normalizedStationNoPrefix === "BH12";
  const isSleevelessCoupler = isSleevelessCouplerOrder(order);
  const hasFlangeIndicator = /\b(?:FL|FLENS|FLANGE|STUB)\b/.test(
    [
      order?.item,
      order?.itemDescription,
      order?.description,
      order?.article,
      order?.itemCode,
    ]
      .map((value) => String(value || "").toUpperCase())
      .join(" ")
      ) || String(order?.itemCode || "").trim().toUpperCase().startsWith("FL") || String(order?.item || "").trim().toUpperCase().startsWith("FL");
  const shouldUseFlangeLabelFlow = !isSleevelessCoupler && (isFlangeOrder || hasFlangeIndicator);

  const sanitizePositiveIntInput = (value: any) => {
    const digitsOnly = String(value ?? "").replace(/\D/g, "");
    return digitsOnly;
  };

  const normalizePositiveIntInput = (value: any, fallback = 1) => {
    const parsed = parseInt(String(value || ""), 10);
    return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
  };

  const printerHasStation = (printer: any, station: string) => {
    if (!printer || !station) return false;
    const linked = Array.isArray(printer.linkedStations) ? printer.linkedStations : [];
    const queue = Array.isArray(printer.queueStations) ? printer.queueStations : [];
    return [...linked, ...queue].includes(station);
  };

  const resolveTargetPrinter = (printerList: any[], station: string, routeKey: string) => {
    return resolvePrinterForRouting(printerList, {
      stationId: station,
      routeKey,
      labelRoute: routeKey,
    });
  };

  const resolveTargetPrinterAsync = async () => {
    const currentResolved = resolveTargetPrinter(savedPrinters, stationId, isFlangeOrder ? "MAZAK" : `STATION:${String(stationId || "").toUpperCase()}`);
    if (currentResolved) return currentResolved;

    const currentById = printConfig.printerId
      ? savedPrinters.find((p: any) => p.id === printConfig.printerId)
      : null;
    if (currentById) return currentById;

    const prnPaths = PATHS.PRINTERS;
    const snap = await getDocs(collection(db, getPathString(prnPaths as string[])));
    const fetchedPrinters = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const fetchedResolved = resolveTargetPrinter(fetchedPrinters, stationId, isFlangeOrder ? "MAZAK" : `STATION:${String(stationId || "").toUpperCase()}`);
    if (fetchedResolved) return fetchedResolved;

    const fetchedById = printConfig.printerId
      ? fetchedPrinters.find((p: any) => p.id === printConfig.printerId)
      : null;
    return fetchedById || null;
  };

  const productForPreview = useMemo(() => ({
    ...order,
    orderNumber: isManualMode ? manualOrderInput || order.orderId : order.orderId,
    productId: order.itemCode,
    description: order.item,
    lotNumber: isManualMode ? manualLotInput : (lotNumber || "LADEN..."),
  }), [order, isManualMode, manualOrderInput, manualLotInput, lotNumber]);

  const { selectedLabel, previewData, availableLabels: allLabels, loadingLabels } = useLabelPreview(productForPreview, selectedTemplateIds[0] || selectedLabelId || undefined);
  const matchedOperatorPrintRule = useMemo(
    () => resolveOperatorPrintRule(order, generalSettings?.labelPrintRules as OperatorPrintRule[] | undefined),
    [order, generalSettings?.labelPrintRules]
  );

  useEffect(() => {
    if (isOpen) {
      let initialCount = parseInt(stringCount, 10) || 1;

      if (!shouldUseFlangeLabelFlow && typeof matchedOperatorPrintRule?.labelCount === "number" && matchedOperatorPrintRule.labelCount > 0) {
        initialCount = matchedOperatorPrintRule.labelCount;
      }

      if (isBh12Station && !shouldUseFlangeLabelFlow) {
        initialCount = 1;
      }

      if (isBh18Station(stationId) && !matchedOperatorPrintRule) {
        const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(' ').toUpperCase();
        const isElbow = itemIdentifier.includes("ELBOW") || itemIdentifier.includes("BOCHT") || itemIdentifier.includes("ELB");
        const isSpecialElbow = itemIdentifier.includes("AB/AB") || itemIdentifier.includes("SB/SB");

        const dia = getOrderNominalDiameter(order);

        // BH18-regel: alle diameters > 200 krijgen altijd 2 labels.
        if (dia > 200) {
          initialCount = 2;
        } else if (dia > 0 && dia < 125) {
          initialCount = 1;
        } else if (dia >= 125 && isElbow && !isSpecialElbow) {
          initialCount = 2;
        } else if (dia >= 125 && isElbow && isSpecialElbow) {
          initialCount = 1;
        }
      }

      setLabelCount(String(Math.max(1, initialCount)));
    }
  }, [isOpen, stringCount, stationId, order, shouldUseFlangeLabelFlow, matchedOperatorPrintRule, isBh12Station]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      doc(db, getPathString(PATHS.GENERAL_SETTINGS as string[])),
      (snap) => {
        if (snap.exists()) {
          setGeneralSettings((prev: Record<string, unknown>) => ({ ...prev, ...(snap.data() || {}) }));
        }
      },
      (err) => {
        console.error("Kon algemene instellingen niet laden:", err);
      }
    );
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const sourceCode = String(order?.itemCode || order?.item || "").trim();
    if (!sourceCode) {
      setRelatedItemCodes([]);
      return;
    }

    const loadConversionCodes = async () => {
      try {
        const conversion = await lookupProductByManufacturedId(null, sourceCode);
        const conversionAny = conversion as Record<string, unknown> | null;
        if (!active) return;
        const candidates = Array.from(
          new Set(
            [
              sourceCode,
              conversionAny?.manufacturedId,
              conversionAny?.targetProductId,
              conversionAny?.id,
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          )
        );
        setRelatedItemCodes(candidates);
      } catch (error) {
        console.error("Kon conversiecodes niet laden voor mallenmatch:", error);
        setRelatedItemCodes([sourceCode]);
      }
    };

    loadConversionCodes();
    return () => {
      active = false;
    };
  }, [isOpen, order?.itemCode, order?.item]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      collection(db, getPathString(PATHS.TOOLING_MOLDS as string[])),
      (snap) => {
        const rows = snap.docs.map((entry: any) => ({ id: entry.id, ...entry.data() }));
        setToolingMolds(rows);
      },
      (err: any) => {
        console.error("Kon gereedschap/mallen niet laden:", err);
        setToolingMolds([]);
      }
    );
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isFlangeOrder) return;
    const cavityCount = Math.max(1, Number(flangeSeriesInfo?.cavityCount || 1));
    setStringCount((prev) => (String(prev || "") === "1" ? String(cavityCount) : prev));
    if (mode === "auto") {
      setLabelCount("0");
    }
  }, [isOpen, mode, isFlangeOrder, flangeSeriesInfo?.cavityCount]);

  const availableLabels = useMemo(() => {
    if (!allLabels || allLabels.length === 0) return [];
    let filteredLabels = filterLabelsByProduct(allLabels, order, { excludeTempOrderLabels: true }) as LabelOption[];
    const orderCodeTags = getOrderCodeTags(order);

    // Zorg dat exacte A-code templates (bijv. A1Q1) zichtbaar blijven in de modal.
    if (orderCodeTags.length > 0) {
      const exactCodeLabels = allLabels.filter((label: LabelOption) => {
        const normalizedTags = getNormalizedLabelTags(label);
        return orderCodeTags.some((codeTag) => normalizedTags.includes(codeTag));
      }) as LabelOption[];

      if (exactCodeLabels.length > 0) {
        const merged = [...filteredLabels, ...exactCodeLabels];
        filteredLabels = merged.filter(
          (label, index, array) => index === array.findIndex((candidate) => String(candidate.id) === String(label.id))
        );
      }
    }
    
    // Sortering voor BH18: Grote labels eerst
    if (stationId === 'BH18') {
        filteredLabels.sort((a, b) => {
          const aLarge = Number(a.height) >= 45 || String(a.name || "").toLowerCase().includes("groot") || String(a.name || "").toLowerCase().includes("standard");
          const bLarge = Number(b.height) >= 45 || String(b.name || "").toLowerCase().includes("groot") || String(b.name || "").toLowerCase().includes("standard");
            if (aLarge && !bLarge) return -1;
            if (!aLarge && bLarge) return 1;
            return 0;
        });
    }

    return filteredLabels;
  }, [allLabels, order, stationId]);

  const selectableLabels = useMemo(() => {
    if (!Array.isArray(availableLabels) || availableLabels.length === 0) return [];

    const ruleCodeTag = String(matchedOperatorPrintRule?.code || "").trim().toUpperCase();
    const hasRuleSpecificCode = Boolean(ruleCodeTag && ruleCodeTag !== "ANY");
    if (!hasRuleSpecificCode) return availableLabels;

    const filteredByRuleCode = availableLabels.filter((label: LabelOption) => {
      const normalizedTags = getNormalizedLabelTags(label);
      return normalizedTags.includes(ruleCodeTag) || String(label.name || "").toUpperCase().includes(ruleCodeTag);
    });

    return filteredByRuleCode.length > 0 ? filteredByRuleCode : availableLabels;
  }, [availableLabels, matchedOperatorPrintRule?.code]);

  // Autofocus naar ordernummer (of lotnummer) bij openen in manuele modus
  useEffect(() => {
    if (isOpen && mode === "manual" && shouldAutoFocusInputs) {
      setTimeout(() => {
        if (orderValidated && lotInputRef.current) {
          lotInputRef.current?.focus();
        } else if (orderInputRef.current) {
          orderInputRef.current?.focus();
        }
      }, 300);
    }
  }, [isOpen, mode, orderValidated, shouldAutoFocusInputs]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onSnapshot(
      collection(db, "future-factory/settings/label_print_rules"),
      (snap) => {
        setDynamicPrintRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintRuleDef)));
      },
      (err) => console.error("Kon dynamische printregels niet laden:", err)
    );
    return () => unsub();
  }, [isOpen]);

  // 1. Label Templates & Rules Laden
  useEffect(() => {
    const setDefaultLabel = () => {
      if (!isOpen || loadingLabels || selectableLabels.length === 0) return;
      
      // Nieuwe logica: Eerst de rule engine proberen
      const productDataForRules = processLabelData(order);
      const ruleOutput = evaluatePrintRules(productDataForRules, dynamicPrintRules);

      if (ruleOutput.templateIds && ruleOutput.templateIds.length > 0) {
        setSelectedTemplateIds(ruleOutput.templateIds);
        if (ruleOutput.labelCount) {
          setLabelCount(String(ruleOutput.labelCount));
        }
        // Als er maar één template is, zet die ook als de 'hoofd' geselecteerde voor de preview
        if (ruleOutput.templateIds.length === 1) {
          setSelectedLabelId(ruleOutput.templateIds[0]);
        }
        return; // Stop hier, de regel heeft hard de specifieke templates overgenomen
      }

      try {
        if (selectableLabels.length > 0) {
          const isFlange = ruleOutput.labelSizeId === "Flange" ? true : shouldUseFlangeLabelFlow;

          if (isFlange) {
            // Zoek eerst naar labels met de tag FLANGE, FLENS of FLENZEN
            let flangeLabels = selectableLabels.filter((l: LabelOption) =>
              Array.isArray(l.tags) && l.tags.some((tag: string) => /^(FLANGE|FLENS|FLENZEN)$/i.test(tag))
            );

            const smallFlangeLabels = flangeLabels.filter((label: LabelOption) => isSmallLabelOption(label));
            if (smallFlangeLabels.length > 0) {
              flangeLabels = smallFlangeLabels;
            }

            // Als er geen specifiek FLANGE label is, gebruik dan alle labels als fallback
            if (flangeLabels.length === 0) {
              flangeLabels = selectableLabels;
            }

            const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(' ').toUpperCase();
            let flangeLabelToSelect = null;

            // Zoek naar specifieke materiaal tags in de labels (CST, EST, ETW/EWT, EMT)
            const hasMaterialTagOrName = (label: LabelOption, materialVariants: string[]) => {
              return (Array.isArray(label.tags) && label.tags.some((tag: string) => materialVariants.includes(tag.toUpperCase()))) ||
                   materialVariants.some((v: string) => String(label.name || "").toUpperCase().includes(v));
            };

            if (itemIdentifier.includes("EMT")) {
              flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["EMT", "FIBERMAR"]));
            } else if (itemIdentifier.includes("CST")) {
              flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["CST", "WAVISTRONG"]));
            } else if (itemIdentifier.includes("ETW") || itemIdentifier.includes("EWT")) {
              flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["ETW", "EWT", "WAVISTRONG"]));
            } else if (itemIdentifier.includes("EST")) {
              flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["EST", "WAVISTRONG"]));
            }

            // Fallback
            if (!flangeLabelToSelect) {
                // Als het een van de Wavistrong varianten is, pak dan eventueel een EST label als fallback
                if (itemIdentifier.includes("CST") || itemIdentifier.includes("EWT") || itemIdentifier.includes("ETW") || itemIdentifier.includes("EST")) {
                     flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["EST"])) || flangeLabels[0];
                } else if (itemIdentifier.includes("EMT")) {
                     flangeLabelToSelect = flangeLabels.find((l: LabelOption) => hasMaterialTagOrName(l, ["EMT"])) || flangeLabels[0];
                } else {
                     flangeLabelToSelect = flangeLabels[0];
                }
            }

            if (flangeLabelToSelect?.id && flangeLabelToSelect.id !== selectedLabelId) {
              setSelectedLabelId(flangeLabelToSelect.id);
            }
            return;
          }

          // Voor niet-FL: eerst regel (groot/klein), daarna operatorregel, daarna BH18 fallback.
          let preferLarge = false;
          if (ruleOutput.labelSizeId === "Large") {
             preferLarge = true;
          } else if (ruleOutput.labelSizeId === "Small") {
             preferLarge = false;
          } else if (matchedOperatorPrintRule?.labelSize) {
             preferLarge = matchedOperatorPrintRule.labelSize === "large";
          } else {
             preferLarge = stationId === 'BH18' || isBh12Station;
          }
          
          if (stationId === 'BH18' && !matchedOperatorPrintRule?.labelSize) {
             const itemIdentifier = [order?.item, order?.itemCode, order?.itemDescription].join(' ').toUpperCase();
             const match = itemIdentifier.match(/\b(\d{2,4})\s*(?:MM|-|R|X|\b)/);
             const dia = match ? parseInt(match[1], 10) : parseInt(order?.diameter || order?.dn || 0, 10);
             if (dia > 0 && dia < 125) {
                 preferLarge = false; // Kleine variant
             }
          }
          
          const orderCodeTags = getOrderCodeTags(order);
          const ruleCodeTag = String(matchedOperatorPrintRule?.code || "").trim().toUpperCase();
          const hasRuleSpecificCode = Boolean(ruleCodeTag && ruleCodeTag !== "ANY");
          const ruleCodeLabels = hasRuleSpecificCode
            ? availableLabels.filter((label: LabelOption) => {
                const normalizedTags = getNormalizedLabelTags(label);
                return normalizedTags.includes(ruleCodeTag) || String(label.name || "").toUpperCase().includes(ruleCodeTag);
              })
            : [];
          const exactCodeLabels = selectableLabels.filter((label: LabelOption) => {
            const normalizedTags = getNormalizedLabelTags(label);
            return orderCodeTags.some((codeTag) => normalizedTags.includes(codeTag));
          });
          const codeLabels = selectableLabels.filter((label: LabelOption) =>
            getNormalizedLabelTags(label).includes("CODE")
          );
          const genericCodeLabels = codeLabels.filter((label: LabelOption) => !hasSpecificOrderCodeTag(label));
          const nonSpecificLabels = selectableLabels.filter((label: LabelOption) => !hasSpecificOrderCodeTag(label));
          const candidateLabels =
            ruleCodeLabels.length > 0
              ? ruleCodeLabels
              : exactCodeLabels.length > 0
              ? exactCodeLabels
              : genericCodeLabels.length > 0
                ? genericCodeLabels
                : nonSpecificLabels.length > 0
                  ? nonSpecificLabels
                  : availableLabels;

          let defaultLabel = preferLarge
            ? candidateLabels.find((label: LabelOption) => isLargeLabelOption(label))
            : candidateLabels.find((label: LabelOption) => isSmallLabelOption(label));

          // Als SMALL expliciet gevraagd is, val niet terug op groot uit een te smalle kandidaatset.
          if (!defaultLabel && !preferLarge) {
            defaultLabel = selectableLabels.find((label: LabelOption) => isSmallLabelOption(label));
          }

          // Als LARGE expliciet gevraagd is, probeer alsnog eerst een grote uit alle labels.
          if (!defaultLabel && preferLarge) {
            defaultLabel = selectableLabels.find((label: LabelOption) => isLargeLabelOption(label));
          }

          if (!defaultLabel) {
            defaultLabel = candidateLabels[0] || selectableLabels[0];
          }

          const labelToSelect = defaultLabel?.id || selectableLabels[0]?.id;
          
          if (labelToSelect) {
            if (labelToSelect !== selectedLabelId) {
              setSelectedLabelId(labelToSelect);
            }
            setSelectedTemplateIds([labelToSelect]); // Fallback naar enkele selectie
          }
        }
      } catch (e) {
        console.error("Fout bij laden labels:", e);
      }
    };
    setDefaultLabel();
  }, [isOpen, order, selectableLabels, loadingLabels, stationId, shouldUseFlangeLabelFlow, selectedLabelId, matchedOperatorPrintRule, isBh12Station, dynamicPrintRules]);
  
  // 1b. Operators ophalen voor dit station
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!isOpen || !stationId) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const occPaths = PATHS.OCCUPANCY;
        const q = query(
          collection(db, getPathString(occPaths as string[])),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        const snapshot = await getDocs(q);
        const operators = snapshot.docs.map((doc: any) => ({
          number: doc.data().operatorNumber,
          name: doc.data().operatorName
        }));
        setAssignedOperators(operators);
        if (operators.length === 1) {
          setOperatorInput(operators[0].number);
        } else {
          setOperatorInput("");
        }
      } catch (err: any) {
        console.error("Kon operators niet ophalen", err);
      }
    };
    fetchOccupancy();
  }, [isOpen, stationId]);

  // 1c. Printers ophalen
  useEffect(() => {
    if(!isOpen) return;
    try {
        const prnPaths = PATHS.PRINTERS;
        const printersRef = collection(db, getPathString(prnPaths as string[]));
        const unsub = onSnapshot(printersRef, (snap) => {
          const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          setSavedPrinters(list);
          const targetPrinter = resolveTargetPrinter(list, stationId, isFlangeOrder ? "MAZAK" : `STATION:${String(stationId || "").toUpperCase()}`);

          if (targetPrinter) {
            // Default naar 'queue' als er een printer is geconfigureerd voor dit station.
            // De gebruiker kan dit handmatig aanpassen met de print-mode knoppen.
            setPrintConfig((prev) => ({
              ...prev,
              mode: 'queue',
              printerId: prev.printerId || targetPrinter.id
            }));
          }
        });
        return () => unsub();
    } catch(e: any) {
        console.error("Kon printers niet laden", e);
    }
  }, [stationId, isOpen]);

  // --- SLIMME LOTNUMMER GENERATOR (FPI STANDAARD) ---

  const checkLotNumberExists = async (lotToCheck: string) => {
    if (!lotToCheck) return false;
    try {
      const normalizedLot = String(lotToCheck || "").trim().toUpperCase();
      if (!normalizedLot) return false;

      // 1) Lokale context check (realtime meegegeven producten in de modal)
      const localExists = (existingProducts || []).some((p: any) => {
        const lot = String(p?.lotNumber || "").trim().toUpperCase();
        const activeLot = String(p?.activeLot || "").trim().toUpperCase();
        return lot === normalizedLot || activeLot === normalizedLot;
      });
      if (localExists) return true;

      // 2) Actieve tracking check (root pad)
      const trackingRef = collection(db, getPathString(PATHS.TRACKING as string[]));
      const trackingByLotSnap = await getDocs(query(trackingRef, where("lotNumber", "==", normalizedLot), limit(1)));
      if (!trackingByLotSnap.empty) return true;

      // 2b) Actieve tracking check (scoped items pad)
      try {
        const trackingPathPrefix = `${(PATHS.TRACKING || []).join("/")}/`;
        const scopedItemsSnap = await getDocs(
          query(collectionGroup(db, "items"), where("lotNumber", "==", normalizedLot), limit(10))
        );
        const scopedExists = scopedItemsSnap.docs.some((docSnap) => {
          const path = String(docSnap.ref?.path || "");
          return path.startsWith(trackingPathPrefix);
        });
        if (scopedExists) return true;
      } catch (scopedErr: any) {
        // Niet blokkeren op index/permissie issues; overige checks blijven actief.
        console.debug("Scoped lot-check overgeslagen:", getErrorMessage(scopedErr));
      }

      // 3) Legacy active production check (orders met activeLot)
      const actPaths = PATHS.ACTIVE_PRODUCTION;
      const activeRef = collection(db, getPathString(actPaths as string[]));
      const activeLotSnap = await getDocs(query(activeRef, where("activeLot", "==", normalizedLot), limit(1)));
      if (!activeLotSnap.empty) return true;

      // 4) Multi-year archive check (failsafe tegen hergebruik van historische lotnummers)
      const currentYear = new Date().getFullYear();
      const yearsToCheck = Array.from({ length: LOT_ARCHIVE_LOOKBACK_YEARS }, (_, idx) => currentYear - idx);

      for (const year of yearsToCheck) {
        const archiveRef = collection(db, getPathString(getArchiveItemsPath(year)));
        const archiveSnap = await getDocs(query(archiveRef, where("lotNumber", "==", normalizedLot), limit(1)));
        if (!archiveSnap.empty) return true;
      }

      return false;
    } catch (error: any) {
      console.error("Fout bij lot validatie:", error);
      return false;
    }
  };

  const getHighestSequenceForBaseLot = async (baseLotStr: string, stationId: string, weekSuffix: string) => {
    let maxSeq = 0;
    
    const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${weekSuffix}`;
    const counterRef = doc(db, getPathString(PATHS.COUNTERS), counterDocId);

    try {
        const counterSnap = await getDoc(counterRef);
        if (counterSnap.exists()) {
            return counterSnap.data().lastSequence || 0;
        }
    } catch (e: any) {
        console.error("Fout bij lezen counter:", e);
    }

    const extractSeq = (lot: string) => {
        if (!lot || !lot.startsWith(baseLotStr)) return 0;
        const seqStr = lot.substring(baseLotStr.length).replace(/[^0-9]/g, '');
        const seq = parseInt(seqStr, 10);
        return isNaN(seq) ? 0 : seq;
    };

    existingProducts?.forEach((p: any) => {
        const seq = extractSeq(p.lotNumber || p.activeLot);
        if (seq > maxSeq) maxSeq = seq;
    });

    try {
        const activePath = PATHS.ACTIVE_PRODUCTION;
        const activeRef = collection(db, getPathString(activePath as string[]));
        const activeSnap = await getDocs(activeRef);
        activeSnap.forEach((doc: any) => {
            const data = doc.data();
            const seq = extractSeq(data.lotNumber || data.activeLot);
            if (seq > maxSeq) maxSeq = seq;
        });

        const archiveRef = collection(db, getPathString(getArchiveItemsPath(new Date().getFullYear())));
        const q = query(
            archiveRef, 
            where("lotNumber", ">=", baseLotStr),
            where("lotNumber", "<=", baseLotStr + '\uf8ff')
        );
        const archiveSnap = await getDocs(q);
        archiveSnap.forEach((doc: any) => {
            const seq = extractSeq(doc.data().lotNumber);
            if (seq > maxSeq) maxSeq = seq;
        });

        // Neem ook scoped tracking-items mee, omdat lotnummers daar primair worden opgeslagen.
        try {
          const trackingPathPrefix = `${(PATHS.TRACKING || []).join("/")}/`;
          const scopedTrackingQuery = query(
            collectionGroup(db, "items"),
            where("lotNumber", ">=", baseLotStr),
            where("lotNumber", "<=", `${baseLotStr}\uf8ff`)
          );
          const scopedTrackingSnap = await getDocs(scopedTrackingQuery);
          scopedTrackingSnap.forEach((docSnap: any) => {
            const path = String(docSnap.ref?.path || "");
            if (!path.startsWith(trackingPathPrefix)) return;
            const seq = extractSeq(docSnap.data()?.lotNumber);
            if (seq > maxSeq) maxSeq = seq;
          });
        } catch (scopedErr: any) {
          console.debug("Scoped sequence lookup overgeslagen:", getErrorMessage(scopedErr));
        }

    } catch (error: any) {
        console.error("Fout bij ophalen max sequence:", error);
    }

    try {
        await setDoc(counterRef, { lastSequence: maxSeq, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e: any) {
      if (isPermissionDeniedError(e)) {
        if (!counterPermissionWarnedRef.current) {
          counterPermissionWarnedRef.current = true;
          console.warn("Counter write overgeslagen door rechten; fallback zonder counter-sync actief.");
        }
      } else {
        console.error("Kon counter niet initialiseren", e);
      }
    }

    return maxSeq;
  };

  const consumeRecycledSequence = async (baseLot: string, station: string, weekSuffix: string) => {
    const safeStationId = (station || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${weekSuffix}`;
    const counterRef = doc(db, getPathString(PATHS.COUNTERS), counterDocId);
    const counterSnap = await getDoc(counterRef);
    if (!counterSnap.exists()) return null;

    const data = counterSnap.data() || {};
    const recycled = Array.isArray(data.recycledSequences)
      ? data.recycledSequences
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b)
      : [];

    for (const seq of recycled) {
      const candidate = `${baseLot}${String(seq).padStart(4, '0')}`;
      const exists = await checkLotNumberExists(candidate);
      if (!exists) {
        const nextRecycled = recycled.filter((n: number) => n !== seq);
        await setDoc(counterRef, { recycledSequences: nextRecycled, updatedAt: serverTimestamp() }, { merge: true }).catch((e: any) => {
          if (!isPermissionDeniedError(e)) {
            throw e;
          }
          if (!counterPermissionWarnedRef.current) {
            counterPermissionWarnedRef.current = true;
            console.warn("Counter recycled-sequence update overgeslagen door rechten.");
          }
        });
        return candidate;
      }
    }

    return null;
  };

  const claimAutoLotRange = async (count: number | string = 1) => {
    const quantity = Math.max(1, parseInt(String(count || 1), 10) || 1);
    const d = new Date();
    const iso = getIsoWeekAndYear(d);

    const bedrijf = "40";
    const jaar = iso.year.slice(-2);
    const week = iso.week;
    const machine = getMachineCode(stationId);
    const land = "40";

    const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;
    const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const counterDocId = `${safeStationId}_${jaar}${week}`;
    const counterRef = doc(db, getPathString(PATHS.COUNTERS), counterDocId);

    return runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const counterData = counterSnap.exists() ? (counterSnap.data() || {}) : {};

      const lastSequence = Number.isFinite(Number(counterData.lastSequence))
        ? Number(counterData.lastSequence)
        : 0;

      const recycled = Array.isArray(counterData.recycledSequences)
        ? Array.from(new Set(counterData.recycledSequences
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isFinite(n) && n > 0)))
            .sort((a: number, b: number) => a - b)
        : [];

      const maxAttempts = 250;
      let attempts = 0;
      let recycledIndex = 0;
      let sequenceToTry = recycled.length > 0 && quantity === 1 ? recycled[0] : (lastSequence + 1);

      while (attempts < maxAttempts) {
        attempts += 1;
        const usingRecycled = quantity === 1 && recycledIndex < recycled.length && sequenceToTry === recycled[recycledIndex];
        let hasCollision = false;

        if (sequenceToTry <= 0 || sequenceToTry + quantity - 1 > 9999) {
          hasCollision = true;
        }

        if (!hasCollision) {
          for (let i = 0; i < quantity; i++) {
            const seq = sequenceToTry + i;
            const candidateLot = `${baseLot}${String(seq).padStart(4, "0")}`;
            const candidateRef = doc(db, `${getPathString(PATHS.TRACKING as string[])}/${candidateLot}`);
            const candidateSnap = await tx.get(candidateRef);
            if (candidateSnap.exists()) {
              hasCollision = true;
              break;
            }
          }
        }

        if (!hasCollision) {
          const nextRecycled = usingRecycled
            ? recycled.filter((n: number) => n !== sequenceToTry)
            : recycled;
          const newLast = Math.max(lastSequence, sequenceToTry + quantity - 1);

          tx.set(counterRef, {
            lastSequence: newLast,
            recycledSequences: nextRecycled,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          return `${baseLot}${String(sequenceToTry).padStart(4, "0")}`;
        }

        if (usingRecycled) {
          recycledIndex += 1;
          if (recycledIndex < recycled.length) {
            sequenceToTry = recycled[recycledIndex];
          } else {
            sequenceToTry = Math.max(lastSequence + 1, sequenceToTry + 1);
          }
        } else {
          sequenceToTry += 1;
        }
      }

      throw new Error("Geen uniek lotnummer beschikbaar voor deze machine/week.");
    });
  };

  const claimAutoLotRangeWithoutCounter = async (count: number | string = 1) => {
    const quantity = Math.max(1, parseInt(String(count || 1), 10) || 1);
    const d = new Date();
    const iso = getIsoWeekAndYear(d);

    const bedrijf = "40";
    const jaar = iso.year.slice(-2);
    const week = iso.week;
    const machine = getMachineCode(stationId);
    const land = "40";
    const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;
    const weekSuffix = `${jaar}${week}`;

    const highestSeq = await getHighestSequenceForBaseLot(baseLot, stationId, weekSuffix);
    let sequenceToTry = Math.max(1, highestSeq + 1);
    const maxAttempts = 250;

    for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
      let hasCollision = false;
      if (sequenceToTry <= 0 || sequenceToTry + quantity - 1 > 9999) {
        hasCollision = true;
      }

      if (!hasCollision) {
        for (let i = 0; i < quantity; i += 1) {
          const candidateLot = `${baseLot}${String(sequenceToTry + i).padStart(4, "0")}`;
          const exists = await checkLotNumberExists(candidateLot);
          if (exists) {
            hasCollision = true;
            break;
          }
        }
      }

      if (!hasCollision) {
        return `${baseLot}${String(sequenceToTry).padStart(4, "0")}`;
      }

      sequenceToTry += 1;
    }

    throw new Error("Geen uniek lotnummer beschikbaar voor deze machine/week.");
  };

  useEffect(() => {
    let isMounted = true;

    const generateRobustLotNumber = async () => {
      if (!isOpen || !order || mode !== "auto") return;
      setIsCheckingLot(true);

      try {
        const d = new Date();
        const iso = getIsoWeekAndYear(d);
        
        const bedrijf = "40";
        const jaar = iso.year.slice(-2);
        const week = iso.week;
        const machine = getMachineCode(stationId);
        const land = "40";

        const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;
        const weekSuffix = `${jaar}${week}`;

        const recycledLot = await consumeRecycledSequence(baseLot, stationId, weekSuffix);
        if (recycledLot) {
          if (isMounted) {
            setLotNumber(recycledLot);
            setLotError("");
          }
          return;
        }

        const highestSeq = await getHighestSequenceForBaseLot(baseLot, stationId, weekSuffix);
        
        let counter = highestSeq + 1;
        
        let newLotNumber = `${baseLot}${String(counter).padStart(4, '0')}`;

        while (await checkLotNumberExists(newLotNumber)) {
            counter++;
            newLotNumber = `${baseLot}${String(counter).padStart(4, '0')}`;
            if (counter > 9999) break; 
        }

        if (isMounted) {
            setLotNumber(newLotNumber);
            setLotError("");
        }
      } catch (error: any) {
        console.error("Error setting lot number", error);
        if (isMounted) setLotError("Waarschuwing: Kan uniciteit niet garanderen.");
      } finally {
        if (isMounted) setIsCheckingLot(false);
      }
    };

    generateRobustLotNumber();

    if (isOpen) {
      const resetKey = `${order?.orderId}_${mode}`;
      if (lastResetKeyRef.current !== resetKey) {
        if (mode === "manual") {
          const isSpecialFlangeStation = ["BH11", "BH12", "BH15"].includes(normalizedStationNoPrefix);
          const isFlange = shouldUseFlangeLabelFlow;
          if (isSpecialFlangeStation && isFlange) {
            setManualLotInput("");
            setManualOrderInput(order?.orderId || "");
            setOrderValidated(true);
            setLotError("");
          } else {
            setManualLotInput("");
            setManualOrderInput("");
            setOrderValidated(false);
            setLotError("");
          }
        }
        lastResetKeyRef.current = resetKey;
      }
    }

    return () => { isMounted = false; };
  }, [isOpen, order, mode, stationId, shouldUseFlangeLabelFlow, normalizedStationNoPrefix]);

  const updateCounterOnStart = async (usedLotNumber: string, count: number) => {
      if (!usedLotNumber) return;
      try {
          const normalizedLot = String(usedLotNumber || "").replace(/\D/g, "");
          const d = new Date();
          const iso = getIsoWeekAndYear(d);
          const lotWeekSuffix = normalizedLot.length >= 6 ? normalizedLot.slice(2, 6) : "";
          const weekSuffix = /^\d{4}$/.test(lotWeekSuffix)
            ? lotWeekSuffix
            : `${iso.year.slice(-2)}${iso.week}`;
          
          const safeStationId = (stationId || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const counterDocId = `${safeStationId}_${weekSuffix}`;
          const counterRef = doc(db, getPathString(PATHS.COUNTERS), counterDocId);
          
          const currentSeq = parseInt(usedLotNumber.slice(-4), 10);
          if (!Number.isFinite(currentSeq)) {
            throw new Error("Kan volgnummer uit lotnummer niet bepalen.");
          }

          const candidateMax = currentSeq + (Math.max(1, Number(count) || 1) - 1);
          const counterSnap = await getDoc(counterRef);
          const counterData = counterSnap.exists() ? (counterSnap.data() || {}) : {};
          const lastSequence = Number.isFinite(Number(counterData.lastSequence))
            ? Number(counterData.lastSequence)
            : 0;
          const newMax = Math.max(lastSequence, candidateMax);
          const recycled = Array.isArray(counterData.recycledSequences)
            ? counterData.recycledSequences.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
            : [];
          const rangeStart = currentSeq;
          const rangeEnd = candidateMax;
          const nextRecycled = recycled.filter((n: number) => n < rangeStart || n > rangeEnd);

          await setDoc(counterRef, { lastSequence: newMax, recycledSequences: nextRecycled, updatedAt: serverTimestamp() }, { merge: true });

          const twoWeeksAgo = new Date();
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
          const isoOld = getIsoWeekAndYear(twoWeeksAgo);
          const oldDocId = `${safeStationId}_${isoOld.year.slice(-2)}${isoOld.week}`;
          
          await deleteDoc(doc(db, getPathString(PATHS.COUNTERS), oldDocId)).catch(() => {});

      } catch (e: any) {
        if (isPermissionDeniedError(e)) {
          if (!counterPermissionWarnedRef.current) {
            counterPermissionWarnedRef.current = true;
            console.warn("Counter update overgeslagen door rechten; productie gaat door.");
          }
        } else {
          console.error("Kon counter niet updaten:", e);
        }
      }
  };

  useEffect(() => {
    if (!isOpen || mode === "manual") return;

    const previewEl = previewAreaRef.current || containerRef.current;
    const containerEl = containerRef.current;
    if (!previewEl || !selectedLabel) return;

    const recalc = () => {
      const pixelsPerMm = getPixelsPerMm(DEFAULT_PRINTER_DPI);
      const availableW = Math.max(120, previewEl.clientWidth - 24);
      const availableH = Math.max(120, previewEl.clientHeight - 24);
      const widthMm = Number.parseFloat(String(selectedLabel.width ?? "").replace(",", "."));
      const heightMm = Number.parseFloat(String(selectedLabel.height ?? "").replace(",", "."));
      const safeWidthMm = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 90;
      const safeHeightMm = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 55;
      const labelW = safeWidthMm * pixelsPerMm;
      const labelH = safeHeightMm * pixelsPerMm;

      if (labelW > 0 && labelH > 0) {
        // Houd preview altijd binnen het zichtbare vak (geen overflow buiten scherm)
        const fitZoom = Math.min(availableW / labelW, availableH / labelH);
        const nextZoom = Math.min(7, fitZoom);
        setPreviewZoom(Math.max(0.35, nextZoom));
      }
    };

    // Eerste meting kan te vroeg zijn direct na mode-switch, daarom extra frame.
    recalc();
    const raf1 = window.requestAnimationFrame(recalc);
    const raf2 = window.requestAnimationFrame(recalc);

    const ro = new ResizeObserver(recalc);
    ro.observe(previewEl);
    if (containerEl && containerEl !== previewEl) {
      ro.observe(containerEl);
    }

    window.addEventListener("resize", recalc);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, [selectedLabel, selectedLabelId, isOpen, mode]);

  const handleManualOrderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setManualOrderInput(value);
    setOrderError("");
    setOrderValidated(false);
    scannerLikeLotInputRef.current = false;

    if (value.trim().length >= 4) {
      const expectedOrderId = order?.orderId?.toUpperCase();
      if (expectedOrderId && value.trim() === expectedOrderId) {
        setOrderValidated(true);
        setOrderError("");
        if (shouldAutoFocusInputs) {
          setTimeout(() => {
            lotInputRef.current?.focus();
          }, 100);
        }
      } else if (value.trim().length >= expectedOrderId?.length) {
        setOrderError(t("productionStartModal.errors.orderMismatch"));
      }
    }
  };

  // Stations waar lotnummers van andere machines verwacht worden (reparatie, nabewerking, etc.).
  // Op deze stations wordt de machinecode in het lotnummer NIET gevalideerd.
  const isLotMachineValidationExempt = (station: string) => {
    if (!station) return false;
    const s = String(station).toUpperCase().replace(/\s/g, "");
    const base = s.startsWith("40") ? s.slice(2) : s;
    return (
      base === "BH31" ||
      base.includes("REPARATI") ||
      base.includes("REPAIR") ||
      base.includes("NABEWERK") ||
      base === "LOSSEN" ||
      base === "BM01" ||
      base === "MAZAK"
    );
  };

  const validateLotMachineCode = (lotValue: string) => {
    if (!stationId) return "";
    // Reparatie en downstream stations: geen machinecode-controle — ze verwerken lots van andere machines.
    if (isLotMachineValidationExempt(stationId)) return "";
    
    const digits = String(lotValue || "").replace(/\D/g, "");
    
    if (digits.length === 0) return "";
    
    if (digits.length < 15) {
      return `Lotnummer moet exact 15 cijfers bevatten (huidig: ${digits.length}).`;
    }
    
    if (!digits.startsWith("40")) {
      return "Lotnummer moet beginnen met '40'.";
    }

    const expectedCode = getMachineCode(stationId);
    const lotMachineCode = digits.slice(6, 9);
    if (lotMachineCode !== expectedCode) {
      return `Verkeerde machine: lotnummer bevat machinecode '${lotMachineCode}', verwacht '${expectedCode}' voor ${stationId}.`;
    }
    return "";
  };

  const handleManualLotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase();
    
    // Alleen cijfers toestaan en beperken tot 15 tekens
    value = value.replace(/\D/g, "").slice(0, 15);

    const now = Date.now();
    const previousValue = previousLotInputRef.current;
    const deltaLength = value.length - previousValue.length;
    const deltaTime = now - lastLotInputAtRef.current;
    const looksScannerLike = deltaLength > 1 || (deltaLength === 1 && lastLotInputAtRef.current > 0 && deltaTime < 40);

    setManualLotInput(value);
    setLotNumber(value);

    // Machine-specifieke validatie: 15-cijferig lotnummer moet machinecode voor dit station bevatten.
    const machineError = validateLotMachineCode(value);
    setLotError(machineError);

    if (!value.trim()) {
      scannerLikeLotInputRef.current = false;
    } else if (looksScannerLike) {
      scannerLikeLotInputRef.current = true;
    }

    previousLotInputRef.current = value;
    lastLotInputAtRef.current = now;
  };

  useEffect(() => {
    if (!isOpen || !isManualMode || !orderValidated) {
      setManualMinimumSeq(null);
      setManualPoolHint("");
      return;
    }

    const normalizedManualLot = String(manualLotInput || "").replace(/\D/g, "");
    if (normalizedManualLot.length !== 15) {
      setManualMinimumSeq(null);
      setManualPoolHint("");
      return;
    }

    const manualBaseLot = normalizedManualLot.slice(0, -4);
    const manualWeekSuffix = normalizedManualLot.slice(2, 6);
    const enteredSeq = parseInt(normalizedManualLot.slice(-4), 10);
    if (!manualBaseLot || !/^\d{4}$/.test(manualWeekSuffix)) {
      setManualMinimumSeq(null);
      setManualPoolHint("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const highestSeq = await getHighestSequenceForBaseLot(manualBaseLot, stationId, manualWeekSuffix);
        if (cancelled) return;

        const minimumNextSeq = Math.max(1, highestSeq + 1);
        setManualMinimumSeq(minimumNextSeq);

        if (Number.isFinite(enteredSeq) && enteredSeq < minimumNextSeq) {
          setManualPoolHint(`Lagere volgnummers zijn toegestaan als ze nog vrij zijn. Volgende vrije nummer is meestal vanaf ${String(minimumNextSeq).padStart(4, "0")}.`);
        } else {
          setManualPoolHint(`Pool loopt door. Volgende vrije nummer is meestal vanaf ${String(minimumNextSeq).padStart(4, "0")}.`);
        }
      } catch {
        if (!cancelled) {
          setManualMinimumSeq(null);
          setManualPoolHint("");
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, isManualMode, orderValidated, manualLotInput, stationId, existingProducts]);

  const canStartManual = isManualMode && orderValidated && !!manualLotInput.trim() && !orderError && !lotError && !isCheckingLot;
  const canStartAuto = !isManualMode && !!lotNumber && !isCheckingLot && !lotError;

  const handleStartProduction = async () => {
    if (isStarting) return;
    if (isManualMode && !canStartManual) return;
    if (!isManualMode && !canStartAuto) return;

    scannerLikeLotInputRef.current = false;

    if (!isManualMode && !isFlangeOrder && !selectedLabel) {
      notify(t("productionStartModal.notifications.selectLabelFirst"));
      return;
    }

    setIsStarting(true);
    const startOpId = `start_${Date.now()}`;
    addOperation(startOpId, order?.orderId || "order");
    try {
      let targetPrinter = null;
      let effectiveLotNumber = isManualMode ? manualLotInput.trim() : lotNumber;
      let printData = null;
      let lotBatchPrintData = null;
      let counterClaimed = false;
      const totalToProduce = Math.max(1, parseInt(stringCount, 10) || 1);
      const requestedLabelsToPrint = isFlangeOrder ? 0 : Math.max(1, parseInt(labelCount, 10) || 1);
      const operatorForcedLabels = !isFlangeOrder && typeof matchedOperatorPrintRule?.labelCount === "number" && matchedOperatorPrintRule.labelCount > 0
        ? matchedOperatorPrintRule.labelCount
        : null;
      const bh18ForcedLabels = operatorForcedLabels === null && isBh18Station(stationId) && getOrderNominalDiameter(order) > 200 ? 2 : null;
      const labelsToPrint = operatorForcedLabels ?? bh18ForcedLabels ?? requestedLabelsToPrint;
      const normalizedRunStationId = String(stationId || "").toUpperCase();
      const shouldPrintStringLotBatch =
        Boolean(generalSettings?.enableStringLotBatchPrint) &&
        (normalizedRunStationId === "BH11" || normalizedRunStationId === "BH12") &&
        totalToProduce > 1;
      let lotBatchLots: string[] = [];
      if (!isManualMode) {
        targetPrinter = await resolveTargetPrinterAsync();
        const previewLotCandidate = String(lotNumber || "").trim();
        // Gebruik eerst het lot dat al in auto-preview staat om verspringen te voorkomen.
        if (previewLotCandidate) {
          effectiveLotNumber = previewLotCandidate;
        } else {
          try {
            effectiveLotNumber = await claimAutoLotRange(totalToProduce);
            counterClaimed = true;
          } catch (counterErr: any) {
            if (!isPermissionDeniedError(counterErr)) {
              throw counterErr;
            }

            if (!counterPermissionWarnedRef.current) {
              counterPermissionWarnedRef.current = true;
              console.warn("Counter transactie geweigerd; fallback lot-allocatie zonder counter wordt gebruikt.");
            }

            notify("Beperkte rechten op counters gedetecteerd. Fallback lot-allocatie actief.");
            effectiveLotNumber = await claimAutoLotRangeWithoutCounter(totalToProduce);
          }
        }
        setLotNumber(effectiveLotNumber);

        // Failsafe: ook na counter-claim expliciet controleren op bestaand lot (tracking + archief).
        const autoStartSeq = parseInt(String(effectiveLotNumber || "").slice(-4), 10);
        if (!Number.isFinite(autoStartSeq)) {
          throw new Error(t("productionStartModal.errors.cannotValidateLotRange"));
        }

        for (let i = 0; i < totalToProduce; i++) {
          const candidateLot = `${String(effectiveLotNumber).slice(0, -4)}${String(autoStartSeq + i).padStart(4, "0")}`;
          const exists = await checkLotNumberExists(candidateLot);
          if (exists) {
            try {
              effectiveLotNumber = await claimAutoLotRange(totalToProduce);
              counterClaimed = true;
            } catch (counterErr: any) {
              if (!isPermissionDeniedError(counterErr)) {
                throw counterErr;
              }

              if (!counterPermissionWarnedRef.current) {
                counterPermissionWarnedRef.current = true;
                console.warn("Counter transactie geweigerd na collision; fallback lot-allocatie zonder counter wordt gebruikt.");
              }

              notify("Beperkte rechten op counters gedetecteerd. Fallback lot-allocatie actief.");
              effectiveLotNumber = await claimAutoLotRangeWithoutCounter(totalToProduce);
            }
            setLotNumber(effectiveLotNumber);
            break;
          }
        }

        if (!isFlangeOrder && selectedLabel) {
          const dpiForPrint = getNormalizedPrinterDpi(targetPrinter, 203);
          const printPreviewData = {
            ...previewData,
            lotNumber: effectiveLotNumber,
          };
          const darkness = Number.parseInt(String((targetPrinter as any)?.darkness || '15'), 10);
          printData = await renderLabelToBitmapZpl({
            template: selectedLabel as any,
            data: printPreviewData as Record<string, unknown>,
            printerDpi: dpiForPrint,
            darkness: Number.isFinite(darkness) ? darkness : 15,
            printSpeed: 3,
          });
        }
      } else {
        // Manual mode: eerst machinecode validatie, dan uniciteitscheck.
        const machineCodeError = validateLotMachineCode(effectiveLotNumber);
        if (machineCodeError) {
          setLotError(machineCodeError);
          throw new Error(machineCodeError);
        }

        // Manual mode moet uit dezelfde tellerpool komen en altijd doorlopen.
        const normalizedManualLot = String(effectiveLotNumber || "").replace(/\D/g, "");
        const manualBaseLot = String(effectiveLotNumber || "").slice(0, -4);
        const manualWeekSuffix = normalizedManualLot.length >= 6
          ? normalizedManualLot.slice(2, 6)
          : "";

        if (!manualBaseLot || !/^\d{4}$/.test(manualWeekSuffix)) {
          throw new Error(t("productionStartModal.errors.manualLotMustEndWith4Digits"));
        }

        // Lagere volgnummers mogen handmatig gebruikt worden zolang ze uniek zijn.
        // Zo kunnen tijdelijk overgeslagen nummers later alsnog worden ingezet.

        // Manual mode moet ook altijd uniciteit afdwingen voor we starten.
        const manualExists = await checkLotNumberExists(effectiveLotNumber);
        if (manualExists) {
          setLotError(t("productionStartModal.errors.lotAlreadyExists", { lot: effectiveLotNumber }));
          throw new Error(t("productionStartModal.errors.lotAlreadyExists", { lot: effectiveLotNumber }));
        }

        if (totalToProduce > 1) {
          const prefix = String(effectiveLotNumber || "").slice(0, -4);
          const startSeq = parseInt(String(effectiveLotNumber || "").slice(-4), 10);
          if (!prefix || !Number.isFinite(startSeq)) {
            throw new Error(t("productionStartModal.errors.manualLotMustEndWith4Digits"));
          }
          for (let i = 1; i < totalToProduce; i++) {
            const candidateLot = `${prefix}${String(startSeq + i).padStart(4, "0")}`;
            const exists = await checkLotNumberExists(candidateLot);
            if (exists) {
              throw new Error(t("productionStartModal.errors.lotAlreadyExistsChooseOther", { lot: candidateLot }));
            }
          }
        }
      }

      if (totalToProduce > 1) {
        const prefix = String(effectiveLotNumber || "").slice(0, -4);
        const startSeq = parseInt(String(effectiveLotNumber || "").slice(-4), 10);
        if (!prefix || !Number.isFinite(startSeq)) {
          throw new Error(t("productionStartModal.errors.cannotBuildStringLots"));
        }

        lotBatchLots = Array.from({ length: totalToProduce }, (_, idx) => (
          `${prefix}${String(startSeq + idx).padStart(4, "0")}`
        ));

        // Queue mode gebruikt printer-DPI voor consistente weergave op labelstrip.
        if (shouldPrintStringLotBatch && printConfig.mode === "queue") {
          if (!targetPrinter) {
            targetPrinter = await resolveTargetPrinterAsync();
          }
          const lotBatchDpi = getNormalizedPrinterDpi(targetPrinter, 203);
          const lotBatchDarkness = Number.parseInt(String(targetPrinter?.darkness || "15"), 10);
          lotBatchPrintData = generateLotBatchZPL({
            lots: lotBatchLots,
            orderNumber: isManualMode ? (manualOrderInput || order.orderId) : order.orderId,
            printerDpi: lotBatchDpi,
            darkness: Number.isFinite(lotBatchDarkness) ? lotBatchDarkness : 15,
          });
        }
      }

      const batchCount = Array.isArray(lotBatchLots) && lotBatchLots.length > 0 ? lotBatchLots.length : totalToProduce;

      if (!counterClaimed) {
        await updateCounterOnStart(effectiveLotNumber, batchCount);
      }
      await logActivity(auth.currentUser?.uid || "system", "ORDER_RELEASE", `Order started: ${order.orderId}, Lot: ${effectiveLotNumber}`);

      updateOperation(startOpId, "Bezig met starten...");
      await onStart(
        order,
        effectiveLotNumber,
        totalToProduce,
        isManualMode ? manualOrderInput : String(order.orderId || ""),
        operatorInput,
        selectedOperatorName,
        printData,
        !isManualMode ? selectedLabelId : null,
        {
          isFlangeSeries: isFlangeOrder,
          skipStartLabel: isFlangeOrder,
          lotNumbers: Array.isArray(lotBatchLots) && lotBatchLots.length > 0 ? lotBatchLots : undefined,
          batchCount,
        }
      );
      updateOperation(startOpId, "Klaar ✓");
      setTimeout(() => removeOperation(startOpId), 3500);

      // --- NIEUWE PRINT LOOP VOOR MEERDERE TEMPLATES ---
      if (!isFlangeOrder && printConfig.mode === "queue" && labelsToPrint > 0 && selectedTemplateIds.length > 0) {
        if (!targetPrinter) {
          showError(t("productionStartModal.errors.noPrinterConfigured", { stationId }));
          return;
        }

        for (const templateId of selectedTemplateIds) {
          const templateToPrint = allLabels.find(l => l.id === templateId);
          if (!templateToPrint) {
            console.warn(`Template met ID ${templateId} niet gevonden, wordt overgeslagen.`);
            continue;
          }

          try {
            const dpiForPrint = getNormalizedPrinterDpi(targetPrinter, 203);
            const darkness = Number.parseInt(String((targetPrinter as any)?.darkness || '15'), 10);
            const currentPrintData = await renderLabelToBitmapZpl({
              template: templateToPrint as any,
              data: { ...previewData, lotNumber: effectiveLotNumber } as Record<string, unknown>,
              printerDpi: dpiForPrint,
              darkness: Number.isFinite(darkness) ? darkness : 15,
              printSpeed: 3,
            });

            const normalizedPrintData = String(currentPrintData || "").trim();
            if (!normalizedPrintData) {
              throw new Error(`Lege printpayload opgebouwd voor template ${templateToPrint.name}.`);
            }

            console.log(`🖨️ [Print Queue] Aanmaken job voor template: ${templateToPrint.name} (ID: ${templateToPrint.id}), Aantal: ${labelsToPrint}`);

            await queuePrintJob(
                targetPrinter.id,
                normalizedPrintData,
                {
                  description: `Label ${templateToPrint.name} voor ${order.orderId} (Lot: ${effectiveLotNumber}) (x${labelsToPrint})`,
                  quantity: labelsToPrint,
                  orderId: order.orderId,
                  lotNumber: effectiveLotNumber,
                  stationId: stationId || t("common.unknown"),
                  targetPrinterName: targetPrinter.name,
                  width: parseInt(String(templateToPrint.width || 0), 10),
                  height: parseInt(String(templateToPrint.height || 0), 10),
                  variables: previewData,
                  templateId: templateToPrint.id,
                }
            );
          } catch (printError: unknown) {
            const printMessage = getErrorMessage(printError);
            notify(t("productionStartModal.errors.printFailedForTemplate", { template: templateToPrint.name, message: printMessage }));
            showError(t("productionStartModal.errors.printFailedForTemplate", { template: templateToPrint.name, message: printMessage }));
          }
        }
        showSuccess(t("productionStartModal.notifications.labelsQueued", { count: labelsToPrint * selectedTemplateIds.length, printer: targetPrinter.name }));
      }

      if (printConfig.mode === "queue" && shouldPrintStringLotBatch && lotBatchPrintData) {
        try {
          const normalizedLotBatchData = String(lotBatchPrintData || "").trim();
          if (!normalizedLotBatchData) {
            throw new Error("Lege string-lot payload opgebouwd; batch niet in queue geplaatst.");
          }

          if (targetPrinter) {
            const queueJobId = await queuePrintJob(
              targetPrinter.id,
              normalizedLotBatchData,
              {
                description: `String lotnummers voor ${order.orderId} (${lotBatchLots.length} + orderregel)` ,
                quantity: lotBatchLots.length + 1,
                orderId: order.orderId,
                lotNumber: effectiveLotNumber,
                stationId: stationId || t("common.unknown"),
                targetPrinterName: targetPrinter.name,
                isStringLotBatch: true,
                includesOrderRow: true,
                lots: lotBatchLots,
              }
            );
            console.log("[ProductionStartModal] String lot batch queue job created:", queueJobId, "printer:", targetPrinter.id, "zplLength:", normalizedLotBatchData.length);
            showSuccess(t("productionStartModal.notifications.stringLotsQueued", { count: lotBatchLots.length, printer: targetPrinter.name }));
          } else {
            showError(t("productionStartModal.errors.noPrinterConfigured", { stationId }));
          }
        } catch (printError: unknown) {
          console.error(printError);
          const printMessage = getErrorMessage(printError);
          notify(t("productionStartModal.errors.stringLotPrintFailed", { message: printMessage }));
          showError(t("productionStartModal.errors.stringLotPrintFailed", { message: printMessage }));
        }
      }
    } catch (e: any) {
      console.error(e);
      updateOperation(startOpId, "Fout");
      setTimeout(() => removeOperation(startOpId), 4000);
      showError(e.message || t("productionStartModal.errors.startFailed"));
    } finally {
      setIsStarting(false);
    }
  };

  const handleManualLotKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "Tab") && canStartManual) {
      e.preventDefault();
      await handleStartProduction();
    }
  };

  useEffect(() => {
    if (manualLotAutoStartTimeoutRef.current) {
      clearTimeout(manualLotAutoStartTimeoutRef.current);
      manualLotAutoStartTimeoutRef.current = null;
    }

    if (!isManualMode || !canStartManual || isStarting || !scannerLikeLotInputRef.current) {
      return;
    }

    const snapshotLot = manualLotInput.trim();
    if (snapshotLot.length < 6) {
      return;
    }

    manualLotAutoStartTimeoutRef.current = setTimeout(() => {
      if (
        scannerLikeLotInputRef.current &&
        manualLotInput.trim() === snapshotLot &&
        document.activeElement === lotInputRef.current
      ) {
        void handleStartProduction();
      }
    }, 120);

    return () => {
      if (manualLotAutoStartTimeoutRef.current) {
        clearTimeout(manualLotAutoStartTimeoutRef.current);
        manualLotAutoStartTimeoutRef.current = null;
      }
    };
  }, [isManualMode, canStartManual, isStarting, manualLotInput, handleStartProduction]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (manualLotAutoStartTimeoutRef.current) {
        clearTimeout(manualLotAutoStartTimeoutRef.current);
        manualLotAutoStartTimeoutRef.current = null;
      }
    };
  }, [isOpen]);

  const selectedOperatorName = assignedOperators.find(op => op.number === operatorInput)?.name;
  const showPreviewPane = mode !== "manual";
  const normalizedStationId = String(stationId || "").toUpperCase();
  const supportsStringLotBatch = normalizedStationId === "BH11" || normalizedStationId === "BH12";
  const previewStringCount = Math.max(1, parseInt(stringCount, 10) || 1);

  const stringLotPreview = useMemo(() => {
    if (!showPreviewPane || !supportsStringLotBatch || previewStringCount <= 1) {
      return { rows: [], valid: false };
    }

    const baseLot = String(lotNumber || "").trim();
    const prefix = baseLot.slice(0, -4);
    const startSeq = parseInt(baseLot.slice(-4), 10);
    if (!prefix || !Number.isFinite(startSeq)) {
      return { rows: [], valid: false };
    }

    const rows = [];
    for (let i = 0; i < previewStringCount; i++) {
      rows.push(`${prefix}${String(startSeq + i).padStart(4, "0")}`);
    }

    return { rows, valid: true };
  }, [showPreviewPane, supportsStringLotBatch, previewStringCount, lotNumber]);

  const shouldShowStringLotPreview = showPreviewPane && supportsStringLotBatch && previewStringCount > 1;
  const isCompactAutoLayout = mode === "auto" && !isFlangeOrder;

  if (!isOpen || !order || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 md:p-4 backdrop-blur-md animate-in fade-in overflow-hidden">
      <div className={`bg-white w-full max-w-6xl h-[calc(100dvh-1rem)] md:h-[85dvh] rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10 transition-all duration-300`}>
        {/* LINKS: CONFIGURATIE */}
        <div className={`${showPreviewPane ? "w-full md:w-1/3" : "w-full"} ${isCompactAutoLayout ? "p-3 md:p-3.5" : "p-4"} ${showPreviewPane ? "border-r" : ""} border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto custom-scrollbar`}>
          <div className="flex justify-between items-start mb-4">
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                {t("productionStartModal.title", "Order starten")}
              </h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                {stationId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className={`${isCompactAutoLayout ? "space-y-2.5" : "space-y-4"} flex-1 text-left`}>
            {/* Dossier info kaart */}
            <div className={`bg-white ${isCompactAutoLayout ? "p-3" : "p-4"} rounded-2xl border-2 border-slate-100 shadow-sm text-left`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                  <FileText size={14} />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {t("productionStartModal.labels.workOrder", "Werkorder")}
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">
                {order.orderId}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 mt-1.5 truncate uppercase">
                {order.item}
              </p>
              {order.drawing && (
                <div className="mt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("productionStartModal.labels.drawing", "Tekening")}</span>
                  
                  <p className="text-xs font-bold text-slate-700">{order.drawing}</p>
                </div>
              )}
              {order.notes && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("productionStartModal.labels.poTextNotes", "PO-tekst / opmerkingen")}</span>
                  <p className="text-xs font-medium text-slate-600 italic mt-1 max-h-20 overflow-y-auto pr-1 leading-snug break-words custom-scrollbar">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Operator Selection */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                {t("productionStartModal.labels.operatorNumber", "Operator (nr)")}
              </label>
              {assignedOperators.length > 1 ? (
                <div className="relative">
                  <select
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">{t("productionStartModal.placeholders.chooseOperator")}</option>
                    {assignedOperators.map((op) => (
                      <option key={op.number} value={op.number}>
                        {op.number} - {op.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ▼
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm"
                  placeholder={t("productionStartModal.placeholders.employeeNumber")}
                />
              )}
            </div>

            {/* Mode switcher */}
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setMode("auto")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "auto"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <RefreshCw size={12} /> {t("productionStartModal.labels.auto", "Auto")}
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "manual"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Keyboard size={12} /> Manueel
              </button>
            </div>

            {/* Lot invoer sectie */}
            {mode === "auto" ? (
              <div className={`${isCompactAutoLayout ? "space-y-2" : "space-y-3"} animate-in slide-in-from-top-2 text-left`}>
                <div className={`bg-slate-900 ${isCompactAutoLayout ? "p-3" : "p-4"} rounded-2xl text-center shadow-xl border border-white/5 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <QrCode size={48} />
                  </div>
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] block mb-1.5">
                    {t("productionStartModal.labels.currentLotNumber", "Huidig lotnummer")}
                  </span>
                  <div className="flex justify-center items-center gap-2">
                    <div className={`text-2xl font-mono font-black ${lotError ? 'text-red-400' : 'text-white'} italic tracking-tighter`}>
                      {lotNumber || t("productionStartModal.labels.loading")}
                    </div>
                    {isCheckingLot && <Loader2 className="animate-spin text-white/50" size={16} />}
                  </div>
                  {lotError && <p className="text-red-400 text-xs mt-2 font-bold">{lotError}</p>}
                </div>
                <div className={`${isCompactAutoLayout ? "space-y-0.5" : "space-y-1"} text-left`}>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.totalQuantity", "Totaal aantal")}
                  </label>
                  <div className={`flex items-center gap-3 bg-white ${isCompactAutoLayout ? "p-2.5" : "p-3"} rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm`}>
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      min="1"
                      value={stringCount}
                      onChange={(e) => setStringCount(sanitizePositiveIntInput(e.target.value))}
                      onBlur={() => setStringCount((prev) => normalizePositiveIntInput(prev))}
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                  {isFlangeOrder && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 ml-1">
                      {`Mal ${String(
                        flangeSeriesInfo?.matchedTooling?.name ||
                        flangeSeriesInfo?.matchedTooling?.itemCode ||
                        flangeSeriesInfo?.matchedRule?.matcher ||
                        t("productionStartModal.labels.defaultTooling")
                      )} • ${String(stringCount)} stuks`}
                    </p>
                  )}
                </div>
                {!isFlangeOrder && (
                  <div className={`${isCompactAutoLayout ? "space-y-0.5" : "space-y-1"} text-left`}>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                      {t("productionStartModal.labels.labelsToPrint", "Aantal labels printen")}
                    </label>
                    <div className={`flex items-center gap-3 bg-white ${isCompactAutoLayout ? "p-2.5" : "p-3"} rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm`}>
                      <Printer size={18} className="text-blue-500" />
                      <input
                        type="number"
                        min="1"
                        value={labelCount}
                        onChange={(e) => setLabelCount(sanitizePositiveIntInput(e.target.value))}
                        onBlur={() => setLabelCount((prev) => normalizePositiveIntInput(prev))}
                        className="w-full font-black text-slate-800 outline-none text-lg"
                      />
                    </div>
                  </div>
                )}
                {isFlangeOrder && (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold">
                    {t("productionStartModal.labels.flangePrintLater", "Voor flenzen worden bij start geen labels geprint. Labelprint gebeurt later bij Mazak.")}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.amountInString", "Aantal in string")}
                  </label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      min="1"
                      value={stringCount}
                      onChange={(e) => setStringCount(sanitizePositiveIntInput(e.target.value))}
                      onBlur={() => setStringCount((prev) => normalizePositiveIntInput(prev))}
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                  {isFlangeOrder && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 ml-1">
                      {t("productionStartModal.labels.moldMatchActive", {
                        tooling: flangeSeriesInfo?.matchedTooling?.name || flangeSeriesInfo?.matchedTooling?.itemCode || flangeSeriesInfo?.matchedRule?.matcher || t("productionStartModal.labels.defaultTooling"),
                        count: flangeSeriesInfo?.cavityCount || 1,
                      })}
                    </p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.orderNumberScanOrFill", "Ordernummer (scannen of invullen)")}
                  </label>
                  <div className="relative">
                    <input
                      ref={orderInputRef}
                      type="text"
                      value={manualOrderInput}
                      onChange={handleManualOrderChange}
                      placeholder={order?.orderId || "N2000000"}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-lg font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        orderError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : orderValidated
                          ? "border-emerald-500 focus:border-emerald-600 text-emerald-600"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      }`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {orderError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : orderValidated ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {orderError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{orderError}</p>
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    {t("productionStartModal.labels.lotNumberScanOrFill", "Lotnummer (scannen of invullen)")}
                  </label>
                  <div className="relative">
                    <input
                      ref={lotInputRef}
                      type="text"
                      value={manualLotInput}
                      onChange={handleManualLotChange}
                      onKeyDown={handleManualLotKeyDown}
                      placeholder={t("productionStartModal.placeholders.manualLot")}
                      disabled={!orderValidated}
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-xl font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        lotError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : !lotError && manualLotInput.trim().length === 15
                          ? "border-emerald-500 focus:border-emerald-600 text-slate-800"
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      } ${!orderValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingLot ? (
                        <Loader2 className="animate-spin text-blue-500" size={20} />
                      ) : lotError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : manualLotInput.trim().length === 15 ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {lotError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{lotError}</p>
                  )}
                  {!lotError && manualMinimumSeq !== null && manualPoolHint && (
                    <p className="text-[11px] font-bold text-slate-500 mt-1 pl-2">{manualPoolHint}</p>
                  )}
                </div>
              </div>
            )}

            {/* Label selectie */}
            {!isManualMode && !isFlangeOrder && <div className={`${isCompactAutoLayout ? "pt-2" : "pt-3"} border-t border-slate-200 text-left`}>
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 ml-2 flex items-center gap-2">
                {t("productionStartModal.labels.labelFormat", "Labelformaat")}
              </label>
              {loadingLabels ? (
                <div className="p-3 text-center text-xs text-slate-400 italic flex items-center justify-start gap-2">
                  <Loader2 size={14} className="animate-spin" /> {t("productionStartModal.labels.loadingLabels")}
                </div>
              ) : selectableLabels.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  <span>{t("productionStartModal.labels.noSuitableLabels")}</span>
                </div>
              ) : (
                selectedTemplateIds.length > 1 ? (
                  <div className="space-y-1">
                    {selectedTemplateIds.map(id => {
                      const template = allLabels.find(l => l.id === id);
                      return (
                        <div key={id} className="text-xs font-bold text-slate-700 bg-white p-2 rounded border border-slate-200 shadow-sm">
                          {template ? `${template.name} (${template.width}x${template.height}mm)` : id}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative group">
                  <select
                    value={selectedLabelId || ""}
                    onChange={(e) => {
                      setSelectedLabelId(e.target.value);
                      setSelectedTemplateIds([e.target.value]);
                    }}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer group-hover:border-slate-300"
                  >
                    {selectableLabels.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {String(l.name || "Label")} ({String(l.width || "?")}x{String(l.height || "?")}mm)
                      </option>
                    ))}
                  </select>
                  <Printer
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
                )
              )}
            </div>}
          </div>

          <div className={`${isCompactAutoLayout ? "mt-3 pt-3" : "mt-4 pt-4"} border-t border-slate-200 flex gap-3`}>
            <button
              onClick={onClose}
              className={`flex-1 ${isCompactAutoLayout ? "py-3.5" : "py-5"} bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all`}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleStartProduction}
              disabled={
                isStarting ||
                (isManualMode && !canStartManual) ||
                (!isManualMode && !canStartAuto)
              }
              className={`flex-[2] ${isCompactAutoLayout ? "py-3.5" : "py-5"} rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                isManualMode && canStartManual
                  ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 animate-pulse"
                  : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              }`}
            >
              {isCheckingLot || isStarting ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />} 
              {isStarting ? t("productionStartModal.labels.starting") : (selectedOperatorName ? t("productionStartModal.labels.startWithOperator", { operator: operatorInput }) : t("productionStartModal.labels.startOrder"))}
            </button>
          </div>
        </div>

        {/* RECHTS: DESIGN PREVIEW & PRINT ACTIE */}
        {showPreviewPane && <div
          ref={containerRef}
          className="flex-1 min-w-0 bg-slate-900 p-6 flex flex-col items-center justify-between relative overflow-hidden text-left"
        >
          <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 text-left">
            <Activity size={12} className="text-emerald-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
          </div>

          <div ref={previewAreaRef} className="flex-1 flex items-center justify-center w-full min-h-0 py-4">
            {mode === "manual" && (!manualLotInput || !manualOrderInput) ? (
              <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] text-xs uppercase font-black tracking-widest italic">
                {t("productionStartModal.labels.fillOrderAndLot")}
              </div>
            ) : (
              selectedLabel ? (
                <LabelVisualPreview
                  label={selectedLabel as any}
                  data={previewData}
                  zoom={previewZoom}
                  className="shadow-[0_0_100px_rgba(0,0,0,0.8)] relative transition-all duration-500 origin-center border-2 border-white/10"
                />
              ) : (
                <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                  {t("productionStartModal.labels.loadingDesign")}
                </div>
              )
            )}
          </div>

          {shouldShowStringLotPreview && (
            <div className="w-full max-w-2xl bg-black/25 border border-white/10 rounded-2xl p-4 mb-3 text-left">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">
                  {t("productionStartModal.labels.stringLotPreview", "String lot-preview (BH11/BH12)")}
                </p>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  {stringLotPreview.valid
                    ? t("productionStartModal.labels.stringLotRowsSummary", { count: stringLotPreview.rows.length })
                    : t("productionStartModal.labels.waitingForValidStartLot")}
                </p>
              </div>

              {stringLotPreview.valid ? (
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                  {stringLotPreview.rows.map((lotRow, idx) => (
                    <div key={lotRow} className="flex items-center gap-3 bg-white/95 rounded-xl px-3 py-2 border border-slate-200">
                      <span className="text-[10px] font-black text-slate-500 w-6">{idx + 1}.</span>
                      <div className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <InternalQrImage
                          value={lotRow}
                          size={96}
                          alt="Lot QR"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span className="text-xs font-black tracking-wider text-slate-900">{lotRow}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-200">
                    <span className="text-[10px] font-black text-emerald-700 w-6">{stringLotPreview.rows.length + 1}.</span>
                    <div className="w-8 h-8 rounded border border-emerald-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                      <InternalQrImage
                        value={isManualMode ? (manualOrderInput || order.orderId) : order.orderId}
                        size={96}
                        alt="Order QR"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-black tracking-wider text-emerald-900">
                      {t("productionStartModal.labels.order", "Order")} {isManualMode ? (manualOrderInput || order.orderId) : order.orderId}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] font-bold text-amber-200">
                  {t("productionStartModal.labels.noValidStartLotForPreview")}
                </p>
              )}
            </div>
          )}

          {/* --- PRINT AREA (ALLEEN PRINT KNOP) --- */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-left">
            <div className="flex justify-center items-center px-1">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Database size={12} className="text-purple-400" />
                {t("productionStartModal.labels.printViaQueue")}
              </span>
            </div>

            <p className="text-[8px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50">
              {t("productionStartModal.labels.labelAutoPrintedOnStart")}
            </p>
          </div>
        </div>}
      </div>
    </div>
  );
};

export default ProductionStartModal;
