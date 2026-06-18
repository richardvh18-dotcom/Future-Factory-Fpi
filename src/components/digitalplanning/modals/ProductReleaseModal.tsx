import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, ArrowRight, AlertTriangle, Ruler, AlertOctagon, FileText } from "lucide-react";
import { collection, collectionGroup, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { getPathString, PATHS } from "../../../config/dbPaths";
import { REJECTION_REASONS, resolvePostLossenStation } from "../../../utils/workstationLogic";
import { useNotifications } from '../../../contexts/NotificationContext';
import { useProgressOperationsStore } from '../../../contexts/ProgressOperationContext';
import { rejectTrackedProductFinal, tempRejectTrackedProduct, advanceTrackedProduct } from "../../../services/planningSecurityService";
import { useFormPersistence } from "../../../hooks/useFormPersistence";

const PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS = true;

const REJECTION_REASON_FALLBACKS = {
  "rejection.surfaceDamage": "Oppervlakteschade",
  "rejection.dimensionDeviation": "Maatafwijking (TW/TF/W)",
  "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
  "rejection.incorrectLabel": "Onjuist label",
  "rejection.linerDamaged": "Liner beschadigd",
  "rejection.qcSample": "QC Steekproef",
  "rejection.other": "Overig",
};

const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12"]);
const LOSSEN_1218_STATION_NAME = "LOSSEN 12/18";
const LOSSEN_1218_ORIGIN_STATIONS = new Set(["BH12", "BH15", "BH17", "BH18"]);
const MOLD_CHANGE_THRESHOLD_DAYS = 21;

const normalizeStationToken = (value: unknown = "") => String(value || "").toUpperCase().replace(/\s+/g, "").trim();

const isLossen1218Station = (value = "") => {
  const token = normalizeStationToken(value);
  return token === "LOSSEN12/18" || token === "LOSSEN1218";
};

const isClosedTrackingState = (entry: Record<string, unknown> = {}) => {
  const statusUpper = String(entry?.status || "").toUpperCase();
  const stepUpper = String(entry?.currentStep || "").toUpperCase();
  return (
    statusUpper.includes("REJECT") ||
    statusUpper.includes("ARCHIVE") ||
    statusUpper.includes("SHIPP") ||
    statusUpper === "FINISHED" ||
    stepUpper.includes("REJECT") ||
    stepUpper.includes("FINISH")
  );
};

const isStillInLossen1218Flow = (entry: Record<string, unknown> = {}) => {
  if (isClosedTrackingState(entry)) return false;

  const currentStation = normalizeStationToken(entry?.currentStation || "");
  const originStation = normalizeStationToken(entry?.originMachine || entry?.machine || "");
  const stepUpper = String(entry?.currentStep || "").toUpperCase();
  const statusUpper = String(entry?.status || "").toUpperCase();

  if (isLossen1218Station(currentStation)) return true;
  if (LOSSEN_1218_ORIGIN_STATIONS.has(currentStation)) return true;
  if (LOSSEN_1218_ORIGIN_STATIONS.has(originStation) && (stepUpper.includes("WIKKEL") || stepUpper.includes("LOSSEN") || statusUpper.includes("LOSSEN"))) {
    return true;
  }

  return false;
};

const isClosedPlanningStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  return ["completed", "cancelled", "rejected", "shipped", "finished", "deleted", "archived"].includes(normalized);
};

const toDateMillis = (value: unknown) => {
  if (!value) return null;
  const valueObj = typeof value === "object" ? (value as { toDate?: () => Date }) : null;
  if (valueObj && typeof valueObj.toDate === "function") {
    const d = valueObj.toDate();
    const ms = d instanceof Date ? d.getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }
  const d = value instanceof Date ? value : new Date(String(value));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
};

const getOrderDateMillis = (data: Record<string, unknown> = {}) => {
  const candidates = [
    data?.deliveryDate,
    data?.plannedDeliveryDate,
    data?.plannedDate,
    data?.orderCreationDate,
  ];
  for (const value of candidates) {
    const millis = toDateMillis(value);
    if (millis !== null) return millis;
  }
  return null;
};

const getLossenRoute = (itemText: unknown, originStation = "") => {
  const originNorm = String(originStation || "").toUpperCase().replace(/\s/g, "");
  const text = String(itemText || "").toUpperCase();
  const hasFlange = text.includes("FL") || text.includes("FLANGE");

  if (originNorm === "BH31" || originNorm === "BH16") return { mode: "STATION", station: "LOSSEN" };
  if (originNorm === "BH17") return { mode: "STATION", station: "MAZAK" };
  
  if (originNorm === "BH15") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }
  
  if (originNorm === "BH11") {
    if (hasFlange) return { mode: "STATION", station: "MAZAK" };
    return { mode: "STATION", station: "LOSSEN" };
  }

  if (LOSSEN_1218_SOURCE_STATIONS.has(originNorm)) {
    return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
  }


  const isTB = text.includes("TB");
  const isCB = text.includes("CB");
  const isELB = text.includes("ELB");
  const isAB = /\bAB\b/.test(text) || text.includes("ABAB");
  const isSB = /\bSB\b/.test(text);
  const isElbow = isELB || isCB;

  // Alle AB en SB elbows altijd naar centraal LOSSEN.
  if (isElbow && (isAB || isSB)) return { mode: "STATION", station: "LOSSEN" };

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: "STATION", station: "LOSSEN" };
  if ((isCB || isELB) && diameter >= 350) return { mode: "STATION", station: "LOSSEN" };

  return { mode: "TAB", station: originNorm || "" };
};

type ProductReleaseModalProps = {
  isOpen?: boolean;
  product: any;
  bulkProducts?: any[];
  onClose: () => void;
  onComplete?: () => void;
  autoApproveTrigger?: number;
  forceLossenMode?: boolean;
  appId?: string;
  activeOperators?: string[];
  autoFocus?: boolean;
  defaultStatus?: string;
  defaultReasons?: string[];
};

/**
 * ProductReleaseModal
 * Verschijnt wanneer een operator op "Gereedmelden" klikt.
 * Stuurt het product door naar de volgende stap (bijv. van Wikkelen -> Lossen).
 * UPDATE: Uitgebreide functionaliteit voor Lossen (metingen, afkeur opties).
 */
const ProductReleaseModal = ({ isOpen, product, bulkProducts = [], onClose, onComplete, autoApproveTrigger = 0, forceLossenMode = false, appId, activeOperators, autoFocus, defaultStatus, defaultReasons }: ProductReleaseModalProps) => {
  const maybeShowLossen1218MoldNotice = async (processedTargets: any[] = []) => {
    if (!Array.isArray(processedTargets) || processedTargets.length === 0) return;

    const relevantTargets = processedTargets.filter((entry) => {
      const currentStation = entry?.currentStation || entry?.machine || "";
      const originStation = entry?.originMachine || entry?.machine || "";
      return isLossen1218Station(currentStation) || LOSSEN_1218_ORIGIN_STATIONS.has(normalizeStationToken(originStation));
    });

    if (relevantTargets.length === 0) return;

    const orderMap = new Map<string, any>();
    relevantTargets.forEach((entry) => {
      const orderId = String(entry?.orderId || "").trim();
      const itemCode = String(entry?.itemCode || "").trim();
      if (!orderId || !itemCode || orderId.toUpperCase() === "NOG_TE_BEPALEN") return;
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          orderId,
          itemCode,
          machine: String(entry?.originMachine || entry?.machine || "").trim(),
        });
      }
    });

    if (orderMap.size === 0) return;

    const thresholdMs = MOLD_CHANGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const notices: any[] = [];

    for (const meta of orderMap.values()) {
      const { orderId, itemCode, machine } = meta;

      const trackedSnap = await getDocs(
        query(collection(db, getPathString(PATHS.TRACKING)), where("orderId", "==", orderId))
      );
      const hasRemainingInLossenFlow = trackedSnap.docs.some((docSnap) => {
        const data = docSnap.data() || {};
        return isStillInLossen1218Flow(data);
      });

      if (hasRemainingInLossenFlow) {
        continue;
      }

      const planningMatches = new Map<string, any>();
      const [rootPlanningSnap, scopedPlanningSnap] = await Promise.all([
        getDocs(query(collection(db, getPathString(PATHS.PLANNING)), where("itemCode", "==", itemCode))),
        getDocs(query(collectionGroup(db, "orders"), where("itemCode", "==", itemCode))),
      ]);
      const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;

      rootPlanningSnap.docs.forEach((docSnap) => {
        planningMatches.set(docSnap.ref.path, docSnap);
      });
      scopedPlanningSnap.docs.forEach((docSnap) => {
        if (String(docSnap.ref.path || "").startsWith(planningPrefix)) {
          planningMatches.set(docSnap.ref.path, docSnap);
        }
      });

      let currentOrderDate = null;
      const candidates = Array.from(planningMatches.values())
        .map((docSnap) => ({ docSnap, data: docSnap.data() || {} }))
        .filter(({ data }) => {
          const candidateOrderId = String(data?.orderId || "").trim();
          if (!candidateOrderId) return false;
          if (candidateOrderId === orderId) {
            currentOrderDate = getOrderDateMillis(data);
            return false;
          }
          if (isClosedPlanningStatus(data?.status)) return false;
          if (String(data?.itemCode || "").trim() !== itemCode) return false;

          const candidateMachine = normalizeStationToken(data?.machine || machine || "");
          if (machine && candidateMachine && candidateMachine !== normalizeStationToken(machine)) return false;

          return true;
        });

      const baselineDate = currentOrderDate ?? Date.now();
      let minDeltaMs = Number.POSITIVE_INFINITY;

      candidates.forEach(({ data }) => {
        const millis = getOrderDateMillis(data);
        if (millis === null || !Number.isFinite(millis)) return;
        const delta = millis - baselineDate;
        if (delta > 0 && delta < minDeltaMs) minDeltaMs = delta;
      });

      const hasNoFutureOrders = !Number.isFinite(minDeltaMs);
      const nextOrderIsFarAway = Number.isFinite(minDeltaMs) && minDeltaMs >= thresholdMs;

      if (hasNoFutureOrders || nextOrderIsFarAway) {
        notices.push({
          orderId,
          itemCode,
          nextOrderGapDays: Number.isFinite(minDeltaMs) ? Math.round(minDeltaMs / (24 * 60 * 60 * 1000)) : null,
        });
      }
    }

    if (notices.length === 0) return;

    const summary = notices
      .map((entry) => {
        if (Number.isFinite(entry.nextOrderGapDays)) {
          return `Order ${entry.orderId} (${entry.itemCode}) - volgende order pas over ~${entry.nextOrderGapDays} dagen.`;
        }
        return `Order ${entry.orderId} (${entry.itemCode}) - geen vervolgorder gevonden.`;
      })
      .join("\n");

    const popupMessage = `Lossen 12/18: dit lijken de laatste stuks van deze order(s).\nDe mal kan mogelijk afgebroken of omgebouwd worden.\n\n${summary}`;

    notify(popupMessage);
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(popupMessage);
    }
  };
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const addOperation = useProgressOperationsStore((state) => state.addOperation);
  const updateOperation = useProgressOperationsStore((state) => state.updateOperation);
  const removeOperation = useProgressOperationsStore((state) => state.removeOperation);
  const lastAutoApproveRef = useRef(0);
  
  // Form state
  const [formState, setFormState, clearPersistedForm] = useFormPersistence<{
    status: string;
    measurements: Record<string, any>;
    selectedReasons: string[];
    comment: string;
  }>("product_release_modal_form", {
    status: defaultStatus || "approved",
    measurements: {},
    selectedReasons: defaultReasons || [],
    comment: "",
  });

  useEffect(() => {
    if (isOpen) {
      if (defaultStatus || (defaultReasons && defaultReasons.length > 0)) {
        setFormState(prev => ({
          ...prev,
          status: defaultStatus || prev.status,
          selectedReasons: (defaultReasons && defaultReasons.length > 0) ? defaultReasons : prev.selectedReasons
        }));
      }
    }
  }, [isOpen, defaultStatus, defaultReasons, setFormState]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [selectedBulkLotIds, setSelectedBulkLotIds] = useState<string[]>([]);
  const [toleranceConfig, setToleranceConfig] = useState<any>(null);
  const [nominalValues, setNominalValues] = useState<Record<string, number>>({});

  const status = formState.status;
  const measurements = formState.measurements;
  const selectedReasons = formState.selectedReasons;
  const comment = formState.comment;

  const isBulkMode = Array.isArray(bulkProducts) && bulkProducts.length > 1;

  useEffect(() => {
    if (isBulkMode) {
      setSelectedBulkLotIds(
        bulkProducts.map((p) => String(p.id || p.lotNumber || "")).filter(Boolean)
      );
      return;
    }
    setSelectedBulkLotIds([]);
  }, [isBulkMode, bulkProducts]);

  const selectedTargets = isBulkMode
    ? bulkProducts.filter((p) => selectedBulkLotIds.includes(String(p.id || p.lotNumber || "")))
    : [product].filter(Boolean);

  const getReasonLabel = (reasonKey: string) => {
    const translated = t(reasonKey);
    if (translated && translated !== reasonKey) return translated;
    return REJECTION_REASON_FALLBACKS[reasonKey as keyof typeof REJECTION_REASON_FALLBACKS] || reasonKey;
  };

  const toggleReason = (reasonKey: string) => {
    setFormState((prev) => ({
      ...prev,
      selectedReasons: prev.selectedReasons.includes(reasonKey)
        ? prev.selectedReasons.filter((r) => r !== reasonKey)
        : [...prev.selectedReasons, reasonKey],
    }));
  };

  // Determine product/connectie type for measurements
  const itemDesc = (product?.item || product?.itemDescription || "").toUpperCase();
  const mofDesc = String(product?.mof || product?.mofType || "").toUpperCase();
  const combinedDesc = `${itemDesc} ${mofDesc}`.trim();
  const compactItemDesc = itemDesc.trim().replace(/\s+/g, " ");
  const startsWithFl = compactItemDesc.startsWith("FL");
  const isFlange = startsWithFl || combinedDesc.includes("FLENS") || /\bFLANGE\b/.test(combinedDesc);
  const isElbow = /\bELB(OW)?\b/.test(combinedDesc);
  const isCoupler =
    !isFlange &&
    !isElbow &&
    (/\bCOUPLER\b/.test(combinedDesc) || /\bKOPPELING\b/.test(combinedDesc));
  const isCB = /(?:^|[^A-Z0-9])CB(?:CB)?(?=$|[^A-Z0-9])/.test(combinedDesc) || combinedDesc.includes("CBCB");
  const isTB = /(?:^|[^A-Z0-9])TB(?:TB)?(?=$|[^A-Z0-9])/.test(combinedDesc) || combinedDesc.includes("TBTB");

  const isStandardFitting = !isFlange && !isCoupler;
  const couplerMeasurementKey = isCB ? "TWco" : isTB ? "TWto" : "TWco";
  const primaryMeasurementKey = isFlange ? "TF" : isCoupler ? couplerMeasurementKey : "TW";
  const primaryMeasurementLabel = primaryMeasurementKey;
  const showSecondaryMeasurement = isStandardFitting && (isCB || isTB);
  const secondaryMeasurementKey = isCB ? "TWcb" : isTB ? "TWtb" : null;

  // Bepaal huidige en volgende stap dynamisch (Verplaatst naar boven voor veilige evaluatie)
  const currentStep = product?.currentStep || "Wikkelen";
  const currentStepUpper = String(product?.currentStep || "").toUpperCase();
  const currentStationUpper = String(product?.currentStation || "").toUpperCase();
  const statusUpper = String(product?.status || "").toUpperCase();
  const inspectionStatusUpper = String(product?.inspection?.status || "").toUpperCase();
  
  const isLossenStep =
    forceLossenMode ||
    currentStepUpper === "LOSSEN" ||
    currentStepUpper.includes("LOSSEN") ||
    currentStationUpper === "LOSSEN" ||
    currentStationUpper.includes("LOSSEN") ||
    statusUpper.includes("LOSSEN");

  const isRecoveringFromTempReject = 
    inspectionStatusUpper === "TIJDELIJKE AFKEUR" ||
    statusUpper === "TEMP_REJECT" || 
    statusUpper === "HOLD_AREA" || 
    currentStepUpper === "TEMP_REJECT" ||
    Boolean(product?.repairActive);

  const requiresMeasurements = isLossenStep || isRecoveringFromTempReject;

  // Ophalen van tolerantie data en nominale doelwaarden uit Matrix Hub
  useEffect(() => {
    if (!requiresMeasurements || !isOpen || !product) return;

    const loadTolerancesAndNominals = async () => {
      try {
        const desc = String(product?.item || product?.itemDescription || "").toUpperCase();
        const diaMatch = desc.match(/\b(?:ID|DN)?\s*(\d{2,4})\b/);
        const diameter = diaMatch ? diaMatch[1] : "";
        const pnMatch = desc.match(/\bPN\s*(\d+(?:\.\d+)?)\b/);
        const pressure = pnMatch ? pnMatch[1] : "";
        
        let connection = "";
        if (desc.includes("CB")) connection = "CB";
        else if (desc.includes("TB")) connection = "TB";
        else if (desc.includes("FL") || desc.includes("FLENS")) connection = "FL";

        let typeKey = "";
        let angle = "";
        if (desc.includes("ELB") || desc.includes("BOCHT")) {
            typeKey = "ELBOW";
            const angleMatch = desc.match(/\b(90|45|30|15|60|11\.25)\b/);
            if (angleMatch) angle = angleMatch[1];
        } else if (desc.includes("TEE") || desc.includes("T-EQUAL")) {
            typeKey = "TEE";
        } else if (desc.includes("RED") || desc.includes("REDUCER")) {
            typeKey = "REDUCER";
        } else if (desc.includes("CPL") || desc.includes("COUPLER") || desc.includes("KOPPELING")) {
            typeKey = "COUPLER";
        } else if (desc.includes("FLANGE") || desc.includes("FLENS")) {
            typeKey = "FLANGE";
        }

        const matrixRef = doc(db, getPathString(PATHS.MATRIX_CONFIG));
        const matrixSnap = await getDoc(matrixRef);
        let matchedToleranceItem = null;

        if (matrixSnap.exists()) {
            const data = matrixSnap.data();
            const items = Array.isArray(data.toleranceItems) ? data.toleranceItems : [];
            
            for (const item of items) {
                if (
                    (!typeKey || item.typeKey.toUpperCase().includes(typeKey)) &&
                    (!angle || item.angle === angle) &&
                    (!connection || item.connection === connection) &&
                    (!diameter || item.diameter === diameter) &&
                    (!pressure || item.pressure === pressure)
                ) {
                    matchedToleranceItem = item;
                    break;
                }
            }
        }

        if (matchedToleranceItem) {
            setToleranceConfig(matchedToleranceItem.tolerances);
            let fetchedNominals: Record<string, number> = {};

            // Helper om data in te laden
            const loadDocData = async (pathObj: string[], docId: string) => {
                const dRef = doc(db, getPathString(pathObj), docId);
                const dSnap = await getDoc(dRef);
                if (dSnap.exists()) {
                    Object.entries(dSnap.data()).forEach(([k, v]) => {
                        const num = parseFloat(String(v));
                        if (!isNaN(num)) fetchedNominals[k] = num;
                    });
                }
            };

            if (matchedToleranceItem.fittingId) await loadDocData(PATHS.FITTING_SPECS, matchedToleranceItem.fittingId);
            if (matchedToleranceItem.socketId) await loadDocData(PATHS.SOCKET_SPECS, matchedToleranceItem.socketId);

            setNominalValues(fetchedNominals);
        }
      } catch (err) { console.error("Fout bij ophalen toleranties", err); }
    };
    loadTolerancesAndNominals();
  }, [requiresMeasurements, isOpen, product]);

  let nextStepDisplay = "Lossen";

  if (product?.isManualMove) {
    nextStepDisplay = "Nabewerking";
  } else if (isLossenStep) {
    const itemIdentifier = `${product?.item || ""} ${product?.itemDescription || ""} ${product?.description || ""} ${product?.itemCode || ""}`.toUpperCase();
    const compactItem = itemIdentifier.trim().replace(/\s+/g, " ");
    const isFlangeItem = compactItem.startsWith("FL") || itemIdentifier.includes("FLENS") || /\bFLANGE\b/.test(itemIdentifier);
    
    if (isFlangeItem) {
      nextStepDisplay = "Mazak";
    } else {
      nextStepDisplay = resolvePostLossenStation(
        `${product?.item || ""} ${product?.itemDescription || ""} ${product?.description || ""}`,
        product?.originMachine || product?.machine
      );
    }
  } else if (currentStep === "Nabewerking" || currentStep === "Mazak") {
    nextStepDisplay = "Eindinspectie";
  } else if (currentStep === "Eindinspectie" || currentStep === "Inspectie" || product?.currentStation === "BM01") {
    nextStepDisplay = "Gereed";
  }

  const validateForm = () => {
    const newErrors: Record<string, boolean> = {};
    if (requiresMeasurements && status === 'approved') {
      const rawPrimaryValue =
        measurements[primaryMeasurementKey] ||
        (primaryMeasurementKey === "TWco" ? measurements.TWc : "");
      if (!rawPrimaryValue || String(rawPrimaryValue).trim() === "") {
        newErrors[primaryMeasurementKey] = true;
      }
      if (showSecondaryMeasurement && secondaryMeasurementKey) {
        const rawSecondaryValue = measurements[secondaryMeasurementKey];
        if (!rawSecondaryValue || String(rawSecondaryValue).trim() === "") {
          newErrors[secondaryMeasurementKey] = true;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const parseTolerance = (tolStr: string) => {
    let upper = 0; let lower = 0;
    const s = String(tolStr).replace(/\s/g, '').toLowerCase().replace('mm','');
    if (s.includes('+/-') || s.includes('±')) {
        const val = parseFloat(s.replace('+/-', '').replace('±', ''));
        if (!isNaN(val)) { upper = val; lower = -val; }
    } else if (s.includes('/')) {
        const parts = s.split('/');
        parts.forEach(p => {
            if (p.startsWith('+')) upper = parseFloat(p.replace('+', ''));
            else if (p.startsWith('-')) lower = parseFloat(p);
        });
    }
    return { upper, lower, raw: tolStr };
  };

  const getToleranceStatus = (fieldKey: string, valStr: string) => {
    if (!valStr || String(valStr).trim() === "") return "none";
    const val = parseFloat(valStr);
    if (isNaN(val)) return "none";

    const tolField = toleranceConfig?.[fieldKey];
    if (!tolField || !tolField.enabled || !tolField.tolerance) return "none";
    const nominal = nominalValues[fieldKey];
    if (nominal === undefined) return "none";

    const parsedTol = parseTolerance(tolField.tolerance);
    const min = nominal + parsedTol.lower;
    const max = nominal + parsedTol.upper;

    if (val >= min && val <= max) return "ok";
    return "error";
  };

  const renderToleranceHint = (fieldKey: string) => {
    const tolField = toleranceConfig?.[fieldKey];
    const nominal = nominalValues[fieldKey];
    if (tolField?.enabled && nominal !== undefined) {
        return (
            <span className="text-[9px] font-bold text-slate-400 ml-2">
                Doel: {nominal} mm ({tolField.tolerance})
            </span>
        );
    }
    return null;
  };

  const renderMeasurementInput = (fieldKey: string, label: string) => {
    const val = measurements[fieldKey] || (fieldKey === 'TWco' ? measurements.TWc || "" : "");
    const stat = getToleranceStatus(fieldKey, val);
    const statusClass = stat === "ok" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : stat === "error" ? "border-rose-500 bg-rose-50 text-rose-900" : errors[fieldKey] ? "border-red-500 bg-red-50 text-red-900" : "border-slate-200 text-slate-700";
    
    return (
        <div key={fieldKey}>
            <label className="flex items-center text-[10px] font-bold text-slate-500 uppercase mb-1">
                {label} (mm) {renderToleranceHint(fieldKey)}
            </label>
            <div className="relative w-full min-w-0">
              <input
                  type="number"
                  value={val}
                  onChange={(e) => handleMeasurementChange(fieldKey, e.target.value)}
                  className={`w-full pl-4 pr-10 py-3 rounded-xl border-2 font-bold focus:border-blue-500 outline-none transition-colors ${statusClass}`}
                  placeholder={t("placeholders.dpValue", "Waarde...")}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 pointer-events-none uppercase italic opacity-60">
                mm
              </span>
            </div>
        </div>
    );
  };

  const handleMeasurementChange = (field: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      measurements: { ...prev.measurements, [field]: value },
    }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const executeRelease = async () => {
    const isFormValid = validateForm();
    const mayProceedInPilot =
      PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS &&
      requiresMeasurements &&
      status === "approved";

    if (selectedTargets.length === 0) {
      notify("Selecteer minimaal 1 lotnummer.");
      return;
    }

    if (!isFormValid && !mayProceedInPilot) return;

    // Add all targets to pending operations
    const operationIds = selectedTargets.map((t, idx) => `op_${Date.now()}_${idx}`);
    selectedTargets.forEach((target, idx) => {
      addOperation(operationIds[idx], target?.lotNumber || target?.id || "Onbekend");
    });
    
    // Execute operations in background
    (async () => {
      try {
        const firstTarget = selectedTargets.find((target) => target?.id || target?.lotNumber);
        if (!firstTarget) throw new Error("Geen geldig product gevonden om te verwerken.");

        // 1. Haal actieve operator op voor dit station
        let activeOperator = "Operator"; 
        try {
          const today = new Date().toISOString().split('T')[0];
          const stationId = firstTarget.currentStation || firstTarget.machine || product?.currentStation || product?.machine;
          
          if (stationId) {
              let q = query(
                  collection(db, getPathString(PATHS.OCCUPANCY)),
                  where("machineId", "==", stationId),
                  where("date", "==", today)
              );
              let snap = await getDocs(q);
              
              if (snap.empty) {
                  q = query(
                  collection(db, getPathString(PATHS.OCCUPANCY)),
                  where("machineId", "==", stationId.toUpperCase()),
                  where("date", "==", today)
                  );
                  snap = await getDocs(q);
              }

              if (!snap.empty) {
                  const opData = snap.docs[0].data();
                  activeOperator = opData.operatorNumber || opData.operatorName || "Operator";
              }
          }
        } catch (err) {
          console.warn("Kon operator niet ophalen voor historie:", err);
        }

        const normalizedMeasurements = { ...measurements };
        if (String(normalizedMeasurements.TWco || "").trim() !== "" && String(normalizedMeasurements.TWc || "").trim() === "") {
          normalizedMeasurements.TWc = normalizedMeasurements.TWco;
        }

        // Process each target
        for (let idx = 0; idx < selectedTargets.length; idx++) {
          const target = selectedTargets[idx];
          const opId = operationIds[idx];
          // Prefereer het volledige Firestore-documentpad zodat de backend path-based lookup
          // gebruikt en geen collection group index nodig heeft.
          const targetId = target?.__docPath || target?.sourcePath || target?.id || target?.lotNumber;
          
          if (!targetId) {
            removeOperation(opId);
            continue;
          }

          const targetCurrentStep = target?.currentStep || currentStep;

          try {
            if (status === "approved") {
              let nextStep = nextStepDisplay;
              let nextStatus = `Wacht op ${nextStep}`;
              let updateStation = true;
              let targetStation = nextStep;

              if (isLossenStep) {
                const itemIdentifier = `${target?.item || ""} ${target?.itemDescription || ""} ${target?.description || ""} ${target?.itemCode || ""}`.toUpperCase();
                const compactItem = itemIdentifier.trim().replace(/\s+/g, " ");
                const isFlangeTarget = compactItem.startsWith("FL") || itemIdentifier.includes("FLENS") || /\bFLANGE\b/.test(itemIdentifier);
                
                let routedStep = "Nabewerking";
                if (isFlangeTarget) {
                  routedStep = "Mazak";
                } else {
                  routedStep = resolvePostLossenStation(
                    `${target?.item || ""} ${target?.itemDescription || ""} ${target?.description || ""} ${target?.itemCode || ""}`,
                    target?.originMachine || target?.machine || product?.originMachine || product?.machine
                  );
                }
                
                nextStep = routedStep;
                nextStatus = `Wacht op ${routedStep}`;
                targetStation = routedStep;
              }

              if (nextStepDisplay === "Gereed") {
                nextStep = "Finished";
                nextStatus = "Finished";
                updateStation = false;
              } else if (target?.isManualMove) {
                nextStep = "Nabewerking";
                targetStation = "Nabewerking";
              } else if (nextStep === "Eindinspectie") {
                targetStation = "BM01";
              } else if (nextStep === "Lossen") {
                const lossenRoute = getLossenRoute(
                  `${target.item || ""} ${target.description || ""} ${target.itemCode || ""}`,
                  target.currentStation || target.originMachine || target.machine || ""
                );
                const originStation = target.currentStation || target.machine || "Lossen";
                nextStep = "Wacht op Lossen";
                nextStatus = "Wacht op Lossen";
                targetStation = lossenRoute.mode === "STATION" ? (lossenRoute.station || "LOSSEN") : originStation;
              } else if (nextStep === "Mazak") {
                targetStation = "Mazak";
                nextStatus = "Wacht op Mazak";
              }

              await advanceTrackedProduct({
                productId: targetId,
                nextStation: updateStation ? targetStation : "",
                nextStep,
                nextStatus,
                lastStation: target.currentStation || target.machine || "Onbekend",
                note: comment,
                actorLabel: activeOperator,
                previousStep: targetCurrentStep,
                historyAction: "Stap Voltooid",
                historyDetails: `Doorgestuurd van ${targetCurrentStep} naar ${nextStep}`,
                clearManualMove: Boolean(target?.isManualMove),
                measurements: normalizedMeasurements,
                source: "ProductReleaseModal",
              });
            } else if (status === "temp_reject") {
              await tempRejectTrackedProduct({
                productId: targetId,
                reasons: selectedReasons,
                note: comment,
                station: target.currentStation || target.machine || "Onbekend",
                actorLabel: activeOperator,
                previousStep: targetCurrentStep,
                previousStatus: target?.status || currentStep,
                measurements: normalizedMeasurements,
                source: "ProductReleaseModal",
              });
            } else if (status === "rejected") {
              await rejectTrackedProductFinal({
                productId: targetId,
                reasons: selectedReasons,
                note: comment,
                source: "ProductReleaseModal",
                measurements: normalizedMeasurements,
                actorLabel: activeOperator,
              });
            }
            
            // Mark as completed
            updateOperation(opId, "Klaar ✓");
          } catch (err: any) {
            // Mark as error
            updateOperation(opId, `Fout: ${err.message}`);
            console.error(`Error processing ${targetId}:`, err);
          }
        }

        // Log activity after all complete
        const measurementsStr = Object.keys(normalizedMeasurements).length > 0 ? ` | Metingen: ${JSON.stringify(normalizedMeasurements)}` : "";
        await logActivity(
          auth.currentUser?.uid || "system",
          status === "approved" ? "PRODUCT_RELEASE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL",
          `Release modal: ${selectedTargets.length} lot(s), station ${product?.currentStation || product?.machine || "onbekend"}, status ${status}${measurementsStr}`
        );

        clearPersistedForm();
        setFormState({
          status: "approved",
          measurements: {},
          selectedReasons: [],
          comment: "",
        });

        if (status === "approved" && isLossenStep) {
          await maybeShowLossen1218MoldNotice(selectedTargets);
        }

        // Clear pending after 2 seconds
        setTimeout(() => {
          operationIds.forEach(id => removeOperation(id));
        }, 2000);
      } catch (error: any) {
        console.error("Fout:", error);
        notify(error.message);
        // Clear pending on error
        operationIds.forEach(id => removeOperation(id));
      }
    })();

    // Close modal immediately (operations continue in background)
    onClose();
  };

  const handleRelease = async (e?: React.MouseEvent) => {
    e?.stopPropagation?.(); // Voorkom dat clicks erdoorheen vallen
    await executeRelease();
  };

  useEffect(() => {
    if (!autoApproveTrigger) return;
    if (autoApproveTrigger === lastAutoApproveRef.current) return;
    // Veiligheid: Bij verplichte metingen nooit auto-approve via QR
    if (requiresMeasurements) return;

    lastAutoApproveRef.current = autoApproveTrigger;
    executeRelease();
  }, [autoApproveTrigger, requiresMeasurements]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg md:max-w-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
        {/* Header */}
        <div className={`${status === 'approved' ? 'bg-emerald-600' : status === 'temp_reject' ? 'bg-orange-500' : 'bg-rose-600'} p-4 md:p-6 text-white flex justify-between items-start shrink-0 transition-colors duration-300`}>
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase italic">
              {status === 'approved' ? 'Vrijgeven' : status === 'temp_reject' ? 'Tijdelijke Afkeur' : 'Definitieve Afkeur'}
            </h2>
            <div className="mt-2">
              <span className="inline-block px-3 py-1 bg-white/25 text-white rounded-lg text-sm sm:text-base font-black uppercase tracking-widest border border-white/40 shadow-sm mb-1.5">
                Lot: {product?.lotNumber || product?.id}
              </span>
              {(product?.item || product?.itemDescription || product?.itemCode) && (
                <p className="text-lg md:text-xl font-black text-white mt-1.5 leading-tight max-w-sm md:max-w-md">
                  {product.item || product.itemDescription || product.itemCode}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar">
          {/* Status Selection */}
          {requiresMeasurements && (
            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6">
              <button
                onClick={() => setFormState((prev) => ({ ...prev, status: "approved" }))}
                className={`p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "approved" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-100 text-slate-400 hover:border-emerald-200"}`}
              >
                <CheckCircle size={20} className="md:w-6 md:h-6" /> Goed
              </button>
              <button
                onClick={() => setFormState((prev) => ({ ...prev, status: "temp_reject" }))}
                className={`p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "temp_reject" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-100 text-slate-400 hover:border-orange-200"}`}
              >
                <AlertTriangle size={20} className="md:w-6 md:h-6" /> Tijdelijke afkeur
              </button>
              <button
                onClick={() => setFormState((prev) => ({ ...prev, status: "rejected" }))}
                className={`p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "rejected" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-100 text-slate-400 hover:border-rose-200"}`}
              >
                <AlertOctagon size={20} className="md:w-6 md:h-6" /> Definitieve afkeur
              </button>
            </div>
          )}

          {isBulkMode && (
            <div className="mb-4 md:mb-6 bg-blue-50 p-3 md:p-4 rounded-2xl border border-blue-100">
              <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3">
                Serie Selectie ({selectedBulkLotIds.length}/{bulkProducts.length})
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {bulkProducts.map((bulkItem) => {
                  const key = String(bulkItem.id || bulkItem.lotNumber || "");
                  const checked = selectedBulkLotIds.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedBulkLotIds((prev) =>
                            prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{bulkItem.lotNumber || bulkItem.id}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Measurements (Only if requires measurements) */}
          {requiresMeasurements && (
            <div className="mb-4 md:mb-6 bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3 flex items-center gap-2">
                <Ruler size={14} /> Meetwaarden {isRecoveringFromTempReject && !isLossenStep ? "(Nieuwe meting na herstel)" : ""}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {isFlange ? (
                  renderMeasurementInput('TF', 'TF')
                ) : (
                  <>
                    {renderMeasurementInput(primaryMeasurementKey, primaryMeasurementLabel)}
                    {showSecondaryMeasurement && isCB && renderMeasurementInput('TWcb', 'TWcb')}
                    {showSecondaryMeasurement && isTB && renderMeasurementInput('TWtb', 'TWtb')}
                  </>
                )}
                {toleranceConfig && Object.keys(toleranceConfig).map(field => {
                  // Render extra ingeschakelde velden die nog niet standaard op het scherm stonden
                  if (toleranceConfig[field].enabled && field !== 'TF' && field !== primaryMeasurementKey && !(isCB && field === 'TWcb') && !(isTB && field === 'TWtb')) {
                    return renderMeasurementInput(field, field);
                  }
                  return null;
                })}
              </div>
              <p className="mt-3 text-[10px] font-bold text-amber-600 flex items-center gap-1.5 bg-amber-50 p-2 rounded-lg border border-amber-100">
                <AlertTriangle size={12} /> Testfase: Afwijkende (rode) meetwaarden blokkeren de gereedmelding niet. Je kunt gewoon opslaan.
              </p>
            </div>
          )}

          {/* Rejection Reasons (Only if not approved) */}
          {status !== "approved" && (
            <div className="mb-4 md:mb-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3">{t("productRelease.reasonForRejection", "Reden van afkeur")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleReason(r)}
                    className={`p-3 rounded-xl text-xs font-bold border text-left ${selectedReasons.includes(r) ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {getReasonLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment Field */}
          <div className="mb-4 md:mb-6">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3 flex items-center gap-2">
              <FileText size={14} /> Opmerking
            </h4>
            <textarea
              value={comment}
              onChange={(e) => setFormState((prev) => ({ ...prev, comment: e.target.value }))}
              className="w-full p-3 md:p-4 rounded-xl border border-slate-200 font-medium text-sm text-slate-700 focus:border-blue-500 outline-none min-h-[80px] md:min-h-[100px]"
              placeholder={t("placeholders.dpOptionalNote", "Voeg eventueel een opmerking toe...")}
            />
          </div>

          {/* Flow Info (Only if approved) */}
          {status === "approved" && (
            <div className="flex items-center justify-center gap-4 mb-4 md:mb-6 opacity-60">
              <div className="text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">{t("common.current", "Huidig")}</div>
                <div className="font-black text-slate-800">{currentStep}</div>
              </div>
              <ArrowRight className="text-slate-300" size={20} />
              <div className="text-center">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">{t("common.next", "Volgend")}</div>
                <div className="font-black text-emerald-600">{nextStepDisplay}</div>
              </div>
            </div>
          )}

          <button
            onClick={handleRelease}
            disabled={(status !== "approved" && selectedReasons.length === 0)}
            className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
              status === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
              status === 'temp_reject' ? 'bg-orange-500 hover:bg-orange-600 text-white' :
              'bg-rose-600 hover:bg-rose-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Bevestigen & Opslaan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;