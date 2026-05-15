import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, ArrowRight, AlertTriangle, Ruler, AlertOctagon, FileText } from "lucide-react";
import { collection, collectionGroup, query, where, getDocs } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { REJECTION_REASONS, resolvePostLossenStation } from "../../../utils/workstationLogic";
import { useNotifications } from '../../../contexts/NotificationContext';
import { useProgressOperations } from '../../../contexts/ProgressOperationContext.tsx';
import { rejectTrackedProductFinal, tempRejectTrackedProduct, advanceTrackedProduct } from "../../../services/planningSecurityService";
const PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS = true;
const REJECTION_REASON_FALLBACKS = {
    "rejection.surfaceDamage": "Oppervlakteschade",
    "rejection.dimensionDeviation": "Maatafwijking (TW/TF/W)",
    "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
    "rejection.incorrectLabel": "Onjuist label",
    "rejection.linerDamaged": "Liner beschadigd",
    "rejection.other": "Overig",
};
const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17"]);
const LOSSEN_1218_STATION_NAME = "LOSSEN 12/18";
const LOSSEN_1218_ORIGIN_STATIONS = new Set(["BH12", "BH15", "BH17", "BH18"]);
const MOLD_CHANGE_THRESHOLD_DAYS = 21;
const normalizeStationToken = (value = "") => String(value || "").toUpperCase().replace(/\s+/g, "").trim();
const isLossen1218Station = (value = "") => {
    const token = normalizeStationToken(value);
    return token === "LOSSEN12/18" || token === "LOSSEN1218";
};
const isClosedTrackingState = (entry = {}) => {
    const statusUpper = String(entry?.status || "").toUpperCase();
    const stepUpper = String(entry?.currentStep || "").toUpperCase();
    return (statusUpper.includes("REJECT") ||
        statusUpper.includes("ARCHIVE") ||
        statusUpper.includes("SHIPP") ||
        statusUpper === "FINISHED" ||
        stepUpper.includes("REJECT") ||
        stepUpper.includes("FINISH"));
};
const isStillInLossen1218Flow = (entry = {}) => {
    if (isClosedTrackingState(entry))
        return false;
    const currentStation = normalizeStationToken(entry?.currentStation || "");
    const originStation = normalizeStationToken(entry?.originMachine || entry?.machine || "");
    const stepUpper = String(entry?.currentStep || "").toUpperCase();
    const statusUpper = String(entry?.status || "").toUpperCase();
    if (isLossen1218Station(currentStation))
        return true;
    if (LOSSEN_1218_ORIGIN_STATIONS.has(currentStation))
        return true;
    if (LOSSEN_1218_ORIGIN_STATIONS.has(originStation) && (stepUpper.includes("WIKKEL") || stepUpper.includes("LOSSEN") || statusUpper.includes("LOSSEN"))) {
        return true;
    }
    return false;
};
const isClosedPlanningStatus = (status = "") => {
    const normalized = String(status || "").trim().toLowerCase();
    return ["completed", "cancelled", "rejected", "shipped", "finished", "deleted", "archived"].includes(normalized);
};
const toDateMillis = (value) => {
    if (!value)
        return null;
    if (typeof value?.toDate === "function") {
        const d = value.toDate();
        const ms = d instanceof Date ? d.getTime() : Number.NaN;
        return Number.isFinite(ms) ? ms : null;
    }
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
};
const getOrderDateMillis = (data = {}) => {
    const candidates = [
        data?.deliveryDate,
        data?.plannedDeliveryDate,
        data?.plannedDate,
        data?.orderCreationDate,
    ];
    for (const value of candidates) {
        const millis = toDateMillis(value);
        if (millis !== null)
            return millis;
    }
    return null;
};
const getLossenRoute = (itemText, originStation = "") => {
    const originNorm = String(originStation || "").toUpperCase().replace(/\s/g, "");
    if (LOSSEN_1218_SOURCE_STATIONS.has(originNorm)) {
        return { mode: "STATION", station: LOSSEN_1218_STATION_NAME };
    }
    const text = String(itemText || "").toUpperCase();
    const isTB = text.includes("TB");
    const isCB = text.includes("CB");
    const isELB = text.includes("ELB");
    const isAB = /\bAB\b/.test(text) || text.includes("ABAB");
    const isSB = /\bSB\b/.test(text);
    const isElbow = isELB || isCB;
    // Alle AB en SB elbows altijd naar centraal LOSSEN.
    if (isElbow && (isAB || isSB))
        return { mode: "STATION", station: "LOSSEN" };
    const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
    const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
    const diameter = candidates.length > 0 ? candidates[0] : 0;
    if (isTB && diameter >= 300)
        return { mode: "STATION", station: "LOSSEN" };
    if ((isCB || isELB) && diameter >= 350)
        return { mode: "STATION", station: "LOSSEN" };
    return { mode: "TAB", station: originNorm || "" };
};
/**
 * ProductReleaseModal
 * Verschijnt wanneer een operator op "Gereedmelden" klikt.
 * Stuurt het product door naar de volgende stap (bijv. van Wikkelen -> Lossen).
 * UPDATE: Uitgebreide functionaliteit voor Lossen (metingen, afkeur opties).
 */
const ProductReleaseModal = ({ product, bulkProducts = [], onClose, onComplete, autoApproveTrigger = 0, forceLossenMode = false }) => {
    const maybeShowLossen1218MoldNotice = async (processedTargets = []) => {
        if (!Array.isArray(processedTargets) || processedTargets.length === 0)
            return;
        const relevantTargets = processedTargets.filter((entry) => {
            const currentStation = entry?.currentStation || entry?.machine || "";
            const originStation = entry?.originMachine || entry?.machine || "";
            return isLossen1218Station(currentStation) || LOSSEN_1218_ORIGIN_STATIONS.has(normalizeStationToken(originStation));
        });
        if (relevantTargets.length === 0)
            return;
        const orderMap = new Map();
        relevantTargets.forEach((entry) => {
            const orderId = String(entry?.orderId || "").trim();
            const itemCode = String(entry?.itemCode || "").trim();
            if (!orderId || !itemCode || orderId.toUpperCase() === "NOG_TE_BEPALEN")
                return;
            if (!orderMap.has(orderId)) {
                orderMap.set(orderId, {
                    orderId,
                    itemCode,
                    machine: String(entry?.originMachine || entry?.machine || "").trim(),
                });
            }
        });
        if (orderMap.size === 0)
            return;
        const thresholdMs = MOLD_CHANGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
        const notices = [];
        for (const meta of orderMap.values()) {
            const { orderId, itemCode, machine } = meta;
            const trackedSnap = await getDocs(query(collection(db, ...PATHS.TRACKING), where("orderId", "==", orderId)));
            const hasRemainingInLossenFlow = trackedSnap.docs.some((docSnap) => {
                const data = docSnap.data() || {};
                return isStillInLossen1218Flow(data);
            });
            if (hasRemainingInLossenFlow) {
                continue;
            }
            const planningMatches = new Map();
            const [rootPlanningSnap, scopedPlanningSnap] = await Promise.all([
                getDocs(query(collection(db, ...PATHS.PLANNING), where("itemCode", "==", itemCode))),
                getDocs(query(collectionGroup(db, "orders"), where("itemCode", "==", itemCode))),
            ]);
            rootPlanningSnap.docs.forEach((docSnap) => {
                planningMatches.set(docSnap.ref.path, docSnap);
            });
            scopedPlanningSnap.docs.forEach((docSnap) => {
                if (String(docSnap.ref.path || "").startsWith("future-factory/production/digital_planning/")) {
                    planningMatches.set(docSnap.ref.path, docSnap);
                }
            });
            let currentOrderDate = null;
            const candidates = Array.from(planningMatches.values())
                .map((docSnap) => ({ docSnap, data: docSnap.data() || {} }))
                .filter(({ data }) => {
                const candidateOrderId = String(data?.orderId || "").trim();
                if (!candidateOrderId)
                    return false;
                if (candidateOrderId === orderId) {
                    currentOrderDate = getOrderDateMillis(data);
                    return false;
                }
                if (isClosedPlanningStatus(data?.status))
                    return false;
                if (String(data?.itemCode || "").trim() !== itemCode)
                    return false;
                const candidateMachine = normalizeStationToken(data?.machine || machine || "");
                if (machine && candidateMachine && candidateMachine !== normalizeStationToken(machine))
                    return false;
                return true;
            });
            const baselineDate = currentOrderDate ?? Date.now();
            let minDeltaMs = Number.POSITIVE_INFINITY;
            candidates.forEach(({ data }) => {
                const millis = getOrderDateMillis(data);
                if (!Number.isFinite(millis))
                    return;
                const delta = millis - baselineDate;
                if (delta > 0 && delta < minDeltaMs)
                    minDeltaMs = delta;
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
        if (notices.length === 0)
            return;
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
    const { addOperation, updateOperation, removeOperation } = useProgressOperations();
    const lastAutoApproveRef = useRef(0);
    // Form state
    const [status, setStatus] = useState("approved"); // approved, temp_reject, rejected
    const [measurements, setMeasurements] = useState({});
    const [errors, setErrors] = useState({});
    const [selectedReasons, setSelectedReasons] = useState([]);
    const [comment, setComment] = useState("");
    const [selectedBulkLotIds, setSelectedBulkLotIds] = useState([]);
    const isBulkMode = Array.isArray(bulkProducts) && bulkProducts.length > 1;
    useEffect(() => {
        if (isBulkMode) {
            setSelectedBulkLotIds(bulkProducts.map((p) => String(p.id || p.lotNumber || "")).filter(Boolean));
            return;
        }
        setSelectedBulkLotIds([]);
    }, [isBulkMode, bulkProducts]);
    const selectedTargets = isBulkMode
        ? bulkProducts.filter((p) => selectedBulkLotIds.includes(String(p.id || p.lotNumber || "")))
        : [product].filter(Boolean);
    const getReasonLabel = (reasonKey) => {
        const translated = t(reasonKey);
        if (translated && translated !== reasonKey)
            return translated;
        return REJECTION_REASON_FALLBACKS[reasonKey] || reasonKey;
    };
    const toggleReason = (reasonKey) => {
        setSelectedReasons((prev) => prev.includes(reasonKey)
            ? prev.filter((r) => r !== reasonKey)
            : [...prev, reasonKey]);
    };
    // Determine product/connectie type for measurements
    const itemDesc = (product?.item || product?.itemDescription || "").toUpperCase();
    const mofDesc = String(product?.mof || product?.mofType || "").toUpperCase();
    const combinedDesc = `${itemDesc} ${mofDesc}`.trim();
    const compactItemDesc = itemDesc.trim().replace(/\s+/g, " ");
    const startsWithFl = compactItemDesc.startsWith("FL");
    const isFlange = startsWithFl || combinedDesc.includes("FLENS") || /\bFLANGE\b/.test(combinedDesc);
    const isElbow = /\bELB(OW)?\b/.test(combinedDesc);
    const isCoupler = !isFlange &&
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
    // Bepaal huidige en volgende stap dynamisch
    const currentStep = product?.currentStep || "Wikkelen";
    const currentStepUpper = String(product?.currentStep || "").toUpperCase();
    const currentStationUpper = String(product?.currentStation || "").toUpperCase();
    const statusUpper = String(product?.status || "").toUpperCase();
    // Only show extended form if we are processing in Lossen context.
    const isLossenStep = forceLossenMode ||
        currentStepUpper === "LOSSEN" ||
        currentStepUpper.includes("LOSSEN") ||
        currentStationUpper === "LOSSEN" ||
        currentStationUpper.includes("LOSSEN") ||
        statusUpper.includes("LOSSEN");
    let nextStepDisplay = "Lossen";
    if (product?.isManualMove) {
        nextStepDisplay = "Nabewerking";
    }
    else if (isLossenStep) {
        nextStepDisplay = resolvePostLossenStation(`${product?.item || ""} ${product?.itemDescription || ""} ${product?.description || ""}`, product?.originMachine || product?.machine);
    }
    else if (currentStep === "Nabewerking" || currentStep === "Mazak") {
        nextStepDisplay = "Eindinspectie";
    }
    else if (currentStep === "Eindinspectie" || currentStep === "Inspectie" || product?.currentStation === "BM01") {
        nextStepDisplay = "Gereed";
    }
    const validateForm = () => {
        const newErrors = {};
        if (isLossenStep && status === 'approved') {
            const rawPrimaryValue = measurements[primaryMeasurementKey] ||
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
    const handleMeasurementChange = (field, value) => {
        setMeasurements(prev => ({ ...prev, [field]: value }));
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
        const mayProceedInPilot = PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS &&
            isLossenStep &&
            status === "approved";
        if (selectedTargets.length === 0) {
            notify("Selecteer minimaal 1 lotnummer.");
            return;
        }
        if (!isFormValid && !mayProceedInPilot)
            return;
        // Add all targets to pending operations
        const operationIds = selectedTargets.map((t, idx) => `op_${Date.now()}_${idx}`);
        selectedTargets.forEach((target, idx) => {
            addOperation(operationIds[idx], target?.lotNumber || target?.id || "Onbekend");
        });
        // Execute operations in background
        (async () => {
            try {
                const firstTarget = selectedTargets.find((target) => target?.id || target?.lotNumber);
                if (!firstTarget)
                    throw new Error("Geen geldig product gevonden om te verwerken.");
                // 1. Haal actieve operator op voor dit station
                let activeOperator = "Operator";
                try {
                    const today = new Date().toISOString().split('T')[0];
                    const stationId = firstTarget.currentStation || firstTarget.machine || product?.currentStation || product?.machine;
                    if (stationId) {
                        let q = query(collection(db, ...PATHS.OCCUPANCY), where("machineId", "==", stationId), where("date", "==", today));
                        let snap = await getDocs(q);
                        if (snap.empty) {
                            q = query(collection(db, ...PATHS.OCCUPANCY), where("machineId", "==", stationId.toUpperCase()), where("date", "==", today));
                            snap = await getDocs(q);
                        }
                        if (!snap.empty) {
                            const opData = snap.docs[0].data();
                            activeOperator = opData.operatorNumber || opData.operatorName || "Operator";
                        }
                    }
                }
                catch (err) {
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
                                const routedStep = resolvePostLossenStation(`${target?.item || ""} ${target?.itemDescription || ""} ${target?.description || ""} ${target?.itemCode || ""}`, target?.originMachine || target?.machine || product?.originMachine || product?.machine);
                                nextStep = routedStep;
                                nextStatus = `Wacht op ${routedStep}`;
                                targetStation = routedStep;
                            }
                            if (nextStepDisplay === "Gereed") {
                                nextStep = "Finished";
                                nextStatus = "Finished";
                                updateStation = false;
                            }
                            else if (target?.isManualMove) {
                                nextStep = "Nabewerking";
                                targetStation = "Nabewerking";
                            }
                            else if (nextStep === "Eindinspectie") {
                                targetStation = "BM01";
                            }
                            else if (nextStep === "Lossen") {
                                const lossenRoute = getLossenRoute(`${target.item || ""} ${target.description || ""} ${target.itemCode || ""}`, target.currentStation || target.originMachine || target.machine || "");
                                const originStation = target.currentStation || target.machine || "Lossen";
                                nextStep = "Wacht op Lossen";
                                nextStatus = "Wacht op Lossen";
                                targetStation = lossenRoute.mode === "STATION" ? (lossenRoute.station || "LOSSEN") : originStation;
                            }
                            else if (nextStep === "Mazak") {
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
                        }
                        else if (status === "temp_reject") {
                            await tempRejectTrackedProduct({
                                productId: targetId,
                                reasons: selectedReasons,
                                note: comment,
                                station: target.currentStation || target.machine || "Onbekend",
                                actorLabel: activeOperator,
                                previousStep: targetCurrentStep,
                                previousStatus: target?.status || currentStep,
                                source: "ProductReleaseModal",
                            });
                        }
                        else if (status === "rejected") {
                            await rejectTrackedProductFinal({
                                productId: targetId,
                                reasons: selectedReasons,
                                note: comment,
                                source: "ProductReleaseModal",
                                actorLabel: activeOperator,
                            });
                        }
                        // Mark as completed
                        updateOperation(opId, "Klaar ✓");
                    }
                    catch (err) {
                        // Mark as error
                        updateOperation(opId, `Fout: ${err.message}`);
                        console.error(`Error processing ${targetId}:`, err);
                    }
                }
                // Log activity after all complete
                await logActivity(auth.currentUser?.uid || "system", status === "approved" ? "PRODUCT_RELEASE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL", `Release modal: ${selectedTargets.length} lot(s), station ${product?.currentStation || product?.machine || "onbekend"}, status ${status}`);
                if (status === "approved" && isLossenStep) {
                    await maybeShowLossen1218MoldNotice(selectedTargets);
                }
                // Clear pending after 2 seconds
                setTimeout(() => {
                    operationIds.forEach(id => removeOperation(id));
                }, 2000);
            }
            catch (error) {
                console.error("Fout:", error);
                notify(error.message);
                // Clear pending on error
                operationIds.forEach(id => removeOperation(id));
            }
        })();
        // Close modal immediately (operations continue in background)
        onClose();
    };
    const handleRelease = async (e) => {
        e?.stopPropagation?.(); // Voorkom dat clicks erdoorheen vallen
        await executeRelease();
    };
    useEffect(() => {
        if (!autoApproveTrigger)
            return;
        if (autoApproveTrigger === lastAutoApproveRef.current)
            return;
        // Veiligheid: in Lossen nooit auto-approve via QR, daar zijn metingen verplicht.
        if (isLossenStep)
            return;
        lastAutoApproveRef.current = autoApproveTrigger;
        executeRelease();
    }, [autoApproveTrigger, isLossenStep]);
    return (_jsx("div", { className: "fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-lg md:max-w-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]", children: [_jsxs("div", { className: `${status === 'approved' ? 'bg-emerald-600' : status === 'temp_reject' ? 'bg-orange-500' : 'bg-rose-600'} p-4 md:p-6 text-white flex justify-between items-start shrink-0 transition-colors duration-300`, children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl md:text-2xl font-black uppercase italic", children: status === 'approved' ? 'Vrijgeven' : status === 'temp_reject' ? 'Tijdelijke Afkeur' : 'Definitieve Afkeur' }), _jsxs("p", { className: "text-white/80 text-xs md:text-sm font-bold mt-1", children: [product?.lotNumber, " \u2022 ", product?.item] })] }), _jsx("button", { onClick: onClose, className: "text-white/80 hover:text-white", children: _jsx(X, { size: 24 }) })] }), _jsxs("div", { className: "p-4 md:p-6 overflow-y-auto custom-scrollbar", children: [isLossenStep && (_jsxs("div", { className: "grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6", children: [_jsxs("button", { onClick: () => setStatus("approved"), className: `p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "approved" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-100 text-slate-400 hover:border-emerald-200"}`, children: [_jsx(CheckCircle, { size: 20, className: "md:w-6 md:h-6" }), " Goed"] }), _jsxs("button", { onClick: () => setStatus("temp_reject"), className: `p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "temp_reject" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-100 text-slate-400 hover:border-orange-200"}`, children: [_jsx(AlertTriangle, { size: 20, className: "md:w-6 md:h-6" }), " Tijdelijke afkeur"] }), _jsxs("button", { onClick: () => setStatus("rejected"), className: `p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "rejected" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-100 text-slate-400 hover:border-rose-200"}`, children: [_jsx(AlertOctagon, { size: 20, className: "md:w-6 md:h-6" }), " Definitieve afkeur"] })] })), isBulkMode && (_jsxs("div", { className: "mb-4 md:mb-6 bg-blue-50 p-3 md:p-4 rounded-2xl border border-blue-100", children: [_jsxs("h4", { className: "text-xs font-black text-blue-700 uppercase tracking-widest mb-3", children: ["Serie Selectie (", selectedBulkLotIds.length, "/", bulkProducts.length, ")"] }), _jsx("div", { className: "max-h-40 overflow-y-auto space-y-2 pr-1", children: bulkProducts.map((bulkItem) => {
                                        const key = String(bulkItem.id || bulkItem.lotNumber || "");
                                        const checked = selectedBulkLotIds.includes(key);
                                        return (_jsxs("label", { className: "flex items-center gap-2 text-xs font-bold text-slate-700", children: [_jsx("input", { type: "checkbox", checked: checked, onChange: () => {
                                                        setSelectedBulkLotIds((prev) => prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]);
                                                    }, className: "h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" }), _jsx("span", { children: bulkItem.lotNumber || bulkItem.id })] }, key));
                                    }) })] })), isLossenStep && (_jsxs("div", { className: "mb-4 md:mb-6 bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100", children: [_jsxs("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3 flex items-center gap-2", children: [_jsx(Ruler, { size: 14 }), " Meetwaarden"] }), _jsx("div", { className: "grid grid-cols-2 gap-4", children: isFlange ? (_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-500 uppercase mb-1", children: "TF (mm)" }), _jsx("input", { type: "number", value: measurements.TF || "", onChange: (e) => handleMeasurementChange('TF', e.target.value), className: `w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TF ? 'border-red-500 bg-red-50' : 'border-slate-200'}`, placeholder: "Waarde..." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsxs("label", { className: "block text-[10px] font-bold text-slate-500 uppercase mb-1", children: [primaryMeasurementLabel, " (mm)"] }), _jsx("input", { type: "number", value: measurements[primaryMeasurementKey] || (primaryMeasurementKey === 'TWco' ? measurements.TWc || "" : ""), onChange: (e) => handleMeasurementChange(primaryMeasurementKey, e.target.value), className: `w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors[primaryMeasurementKey] ? 'border-red-500 bg-red-50' : 'border-slate-200'}`, placeholder: "Waarde..." })] }), showSecondaryMeasurement && isCB && (_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-500 uppercase mb-1", children: "TWcb (mm)" }), _jsx("input", { type: "number", value: measurements.TWcb || "", onChange: (e) => handleMeasurementChange('TWcb', e.target.value), className: `w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TWcb ? 'border-red-500 bg-red-50' : 'border-slate-200'}`, placeholder: "Waarde..." })] })), showSecondaryMeasurement && isTB && (_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-bold text-slate-500 uppercase mb-1", children: "TWtb (mm)" }), _jsx("input", { type: "number", value: measurements.TWtb || "", onChange: (e) => handleMeasurementChange('TWtb', e.target.value), className: `w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TWtb ? 'border-red-500 bg-red-50' : 'border-slate-200'}`, placeholder: "Waarde..." })] }))] })) })] })), status !== "approved" && (_jsxs("div", { className: "mb-4 md:mb-6", children: [_jsx("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3", children: "Reden van afkeur" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: REJECTION_REASONS.map((r) => (_jsx("button", { onClick: () => toggleReason(r), className: `p-3 rounded-xl text-xs font-bold border text-left ${selectedReasons.includes(r) ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`, children: getReasonLabel(r) }, r))) })] })), _jsxs("div", { className: "mb-4 md:mb-6", children: [_jsxs("h4", { className: "text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3 flex items-center gap-2", children: [_jsx(FileText, { size: 14 }), " Opmerking"] }), _jsx("textarea", { value: comment, onChange: (e) => setComment(e.target.value), className: "w-full p-3 md:p-4 rounded-xl border border-slate-200 font-medium text-sm text-slate-700 focus:border-blue-500 outline-none min-h-[80px] md:min-h-[100px]", placeholder: "Voeg eventueel een opmerking toe..." })] }), status === "approved" && (_jsxs("div", { className: "flex items-center justify-center gap-4 mb-4 md:mb-6 opacity-60", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-[10px] font-bold text-slate-400 uppercase", children: "Huidig" }), _jsx("div", { className: "font-black text-slate-800", children: currentStep })] }), _jsx(ArrowRight, { className: "text-slate-300", size: 20 }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-[10px] font-bold text-emerald-600 uppercase", children: "Volgend" }), _jsx("div", { className: "font-black text-emerald-600", children: nextStepDisplay })] })] })), _jsx("button", { onClick: handleRelease, disabled: (status !== "approved" && selectedReasons.length === 0), className: `w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${status === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                                status === 'temp_reject' ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                    'bg-rose-600 hover:bg-rose-700 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`, children: "Bevestigen & Opslaan" })] })] }) }));
};
export default ProductReleaseModal;
