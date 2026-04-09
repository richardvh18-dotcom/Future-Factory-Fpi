import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, ArrowRight, AlertTriangle, Ruler, AlertOctagon, FileText } from "lucide-react";
import { doc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs, increment, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS, getArchiveRejectedItemsPath } from "../../../config/dbPaths";
import { REJECTION_REASONS, resolvePostLossenStation } from "../../../utils/workstationLogic";
import { useNotifications } from '../../../contexts/NotificationContext';

const PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS = true;

const REJECTION_REASON_FALLBACKS = {
  "rejection.notConformDrawing": "Niet conform tekening",
  "rejection.wrongDiameter": "Verkeerde diameter",
  "rejection.surfaceDamage": "Oppervlakteschade",
  "rejection.crack": "Scheur",
  "rejection.materialShortage": "Materiaaltekort",
  "rejection.wrongSpec": "Verkeerde specificatie",
  "rejection.dimensionDeviation": "Maatafwijking",
  "rejection.qualityInsufficient": "Kwaliteit onvoldoende",
  "rejection.other": "Overig",
};

const LOSSEN_1218_SOURCE_STATIONS = new Set(["BH12", "BH15", "BH17"]);
const LOSSEN_1218_STATION_NAME = "LOSSEN 12/18";

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
  if (isElbow && (isAB || isSB)) return "STATION";

  const numberMatches = Array.from(text.matchAll(/\d{2,4}/g)).map((m) => Number(m[0]));
  const candidates = numberMatches.filter((n) => Number.isFinite(n) && n >= 25 && n <= 2000);
  const diameter = candidates.length > 0 ? candidates[0] : 0;

  if (isTB && diameter >= 300) return { mode: "STATION", station: "LOSSEN" };
  if ((isCB || isELB) && diameter >= 350) return { mode: "STATION", station: "LOSSEN" };

  return { mode: "TAB", station: originNorm || "" };
};

/**
 * ProductReleaseModal
 * Verschijnt wanneer een operator op "Gereedmelden" klikt.
 * Stuurt het product door naar de volgende stap (bijv. van Wikkelen -> Lossen).
 * UPDATE: Uitgebreide functionaliteit voor Lossen (metingen, afkeur opties).
 */
const ProductReleaseModal = ({ product, bulkProducts = [], onClose, onComplete, autoApproveTrigger = 0, forceLossenMode = false }) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [loading, setLoading] = useState(false);
  const lastAutoApproveRef = useRef(0);
  
  // Form state
  const [status, setStatus] = useState("approved"); // approved, temp_reject, rejected
  const [measurements, setMeasurements] = useState({});
  const [errors, setErrors] = useState({});
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [selectedBulkLotIds, setSelectedBulkLotIds] = useState([]);

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

  const getReasonLabel = (reasonKey) => {
    const translated = t(reasonKey);
    if (translated && translated !== reasonKey) return translated;
    return REJECTION_REASON_FALLBACKS[reasonKey] || reasonKey;
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

  // Bepaal huidige en volgende stap dynamisch
  const currentStep = product?.currentStep || "Wikkelen";
  const currentStepUpper = String(product?.currentStep || "").toUpperCase();
  const currentStationUpper = String(product?.currentStation || "").toUpperCase();
  const statusUpper = String(product?.status || "").toUpperCase();
  // Only show extended form if we are processing in Lossen context.
  const isLossenStep =
    forceLossenMode ||
    currentStepUpper === "LOSSEN" ||
    currentStepUpper.includes("LOSSEN") ||
    currentStationUpper === "LOSSEN" ||
    currentStationUpper.includes("LOSSEN") ||
    statusUpper.includes("LOSSEN");

  let nextStepDisplay = "Lossen";

  if (product?.isManualMove) {
    nextStepDisplay = "Nabewerking";
  } else if (isLossenStep) {
    nextStepDisplay = resolvePostLossenStation(
      `${product?.item || ""} ${product?.itemDescription || ""} ${product?.description || ""}`,
      product?.originMachine || product?.machine
    );
  } else if (currentStep === "Nabewerking" || currentStep === "Mazak") {
    nextStepDisplay = "Eindinspectie";
  } else if (currentStep === "Eindinspectie" || currentStep === "Inspectie" || product?.currentStation === "BM01") {
    nextStepDisplay = "Gereed";
  }

  const validateForm = () => {
    const newErrors = {};
    if (isLossenStep && status === 'approved') {
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
    const mayProceedInPilot =
      PILOT_ALLOW_INCOMPLETE_LOSSEN_MEASUREMENTS &&
      isLossenStep &&
      status === "approved";

    if (selectedTargets.length === 0) {
      notify("Selecteer minimaal 1 lotnummer.");
      return;
    }

    if (!isFormValid && !mayProceedInPilot) return;

    setLoading(true);
    
    try {
      if (!product || !product.id) throw new Error("Geen geldig product ID");

      // 1. Haal actieve operator op voor dit station (voor in de historie)
      let activeOperator = "Operator"; // Default fallback
      try {
        const today = new Date().toISOString().split('T')[0];
        // Gebruik currentStation of machine als fallback
        const stationId = product.currentStation || product.machine;
        
        if (stationId) {
            let q = query(
                collection(db, ...PATHS.OCCUPANCY),
                where("machineId", "==", stationId),
                where("date", "==", today)
            );
            let snap = await getDocs(q);
            
            // Fallback: Probeer uppercase als exact niet gevonden is
            if (snap.empty) {
                q = query(collection(db, ...PATHS.OCCUPANCY), where("machineId", "==", stationId.toUpperCase()), where("date", "==", today));
                snap = await getDocs(q);
            }

            if (!snap.empty) {
                // Pak de eerste operator (of logica voor meerdere)
                const opData = snap.docs[0].data();
                // Voorkeur voor nummer, anders naam
                activeOperator = opData.operatorNumber || opData.operatorName || "Operator";
            }
        }
      } catch (err) {
        console.warn("Kon operator niet ophalen voor historie:", err);
      }

      const normalizedMeasurements = { ...measurements };
      // Backward compatibility: sommige rapportages gebruiken nog TWc.
      if (String(normalizedMeasurements.TWco || "").trim() !== "" && String(normalizedMeasurements.TWc || "").trim() === "") {
        normalizedMeasurements.TWc = normalizedMeasurements.TWco;
      }

      for (const target of selectedTargets) {
        const targetId = target?.id || target?.lotNumber;
        if (!targetId) continue;

        const targetRef = doc(db, ...PATHS.TRACKING, targetId);
        const targetCurrentStep = target?.currentStep || currentStep;
        const updates = {
          lastUpdated: serverTimestamp(),
          note: comment,
          measurements: normalizedMeasurements,
        };

        if (status === "approved") {
          let nextStep = nextStepDisplay;
          let nextStatus = `Wacht op ${nextStep}`;
          let updateStation = true;
          let targetStation = nextStep;

          if (isLossenStep) {
            const routedStep = resolvePostLossenStation(
              `${target?.item || ""} ${target?.itemDescription || ""} ${target?.description || ""} ${target?.itemCode || ""}`,
              target?.originMachine || target?.machine || product?.originMachine || product?.machine
            );
            nextStep = routedStep;
            nextStatus = `Wacht op ${routedStep}`;
            targetStation = routedStep;
          }

          if (nextStepDisplay === "Gereed") {
            nextStep = "Finished";
            nextStatus = "Finished";
            updateStation = false;
          } else if (target?.isManualMove) {
            updates.isManualMove = false;
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
            nextStatus = "Te Nabewerken";
          }

          updates.currentStep = nextStep;
          updates.status = nextStatus;
          updates[`timestamps.${String(targetCurrentStep).toLowerCase()}_end`] = serverTimestamp();
          updates[`timestamps.${String(nextStep).toLowerCase()}_start`] = serverTimestamp();
          updates.history = arrayUnion({
            action: "Stap Voltooid",
            timestamp: new Date(),
            user: activeOperator,
            details: `Doorgestuurd van ${targetCurrentStep} naar ${nextStep}`,
            station: target.currentStation || target.machine || "Onbekend",
          });

          if (updateStation) {
            updates.currentStation = targetStation;
            updates.lastStation = target.currentStation || target.machine || "Onbekend";
          }
        } else if (status === "temp_reject") {
          updates.status = "Tijdelijke afkeur";
          updates.currentStep = "HOLD_AREA";
          updates.inspection = {
            status: "Tijdelijke afkeur",
            reasons: [reason],
            timestamp: new Date().toISOString(),
          };
          updates.history = arrayUnion({
            action: "Tijdelijke Afkeur",
            timestamp: new Date(),
            user: activeOperator,
            details: `Reden: ${reason} - ${comment}`,
            station: target.currentStation || target.machine || "Onbekend",
          });
        } else if (status === "rejected") {
          // ARCHIVERING LOGICA voor DEFINITIEF AFKEUR
          const historyEntry = {
            action: "Definitieve Afkeur",
            timestamp: new Date(),
            user: activeOperator,
            details: `Reden: ${reason} - ${comment}`,
            station: target.currentStation || target.machine || "Onbekend",
          };
          
          const rejectionData = {
            ...target,
            status: "Rejected",
            currentStep: "REJECTED",
            currentStation: "AFKEUR",
            inspection: {
              status: "Afkeur",
              reasons: [reason],
              timestamp: new Date().toISOString(),
            },
            history: [...(target.history || []), historyEntry],
            updatedAt: new Date(),
            archivedAt: new Date(),
            archivedReason: "rejected",
          };
          
          const year = new Date().getFullYear();
          const rejectedArchiveRef = doc(db, ...getArchiveRejectedItemsPath(year), target.id || target.lotNumber);
          
          // 1. Sla op in rejected archief
          await setDoc(rejectedArchiveRef, rejectionData);
          
          // 2. Verwijder uit actieve tracking
          await deleteDoc(targetRef);

          if (target.orderId) {
            const orderRef = doc(db, ...PATHS.PLANNING, target.orderId);
            updateDoc(orderRef, {
              rejectedCount: increment(1),
              lastUpdated: serverTimestamp(),
            }).catch((e) => console.error("Kon order niet updaten na afkeur:", e));
          }
          
          // Skip updateDoc, direct naar next target
          continue;
        }

        await updateDoc(targetRef, updates);
      }

      await logActivity(
        auth.currentUser?.uid || "system",
        status === "approved" ? "PRODUCT_RELEASE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL",
        `Release modal: ${selectedTargets.length} lot(s), station ${product?.currentStation || product?.machine || "onbekend"}, status ${status}`
      );

      if (onComplete) onComplete();
      onClose();
    } catch (error) {
      console.error("Fout:", error);
      notify(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (e) => {
    e?.stopPropagation?.(); // Voorkom dat clicks erdoorheen vallen
    await executeRelease();
  };

  useEffect(() => {
    if (!autoApproveTrigger) return;
    if (autoApproveTrigger === lastAutoApproveRef.current) return;
    // Veiligheid: in Lossen nooit auto-approve via QR, daar zijn metingen verplicht.
    if (isLossenStep) return;

    lastAutoApproveRef.current = autoApproveTrigger;
    executeRelease();
  }, [autoApproveTrigger, isLossenStep]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg md:max-w-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
        {/* Header */}
        <div className={`${status === 'approved' ? 'bg-emerald-600' : status === 'temp_reject' ? 'bg-orange-500' : 'bg-rose-600'} p-4 md:p-6 text-white flex justify-between items-start shrink-0 transition-colors duration-300`}>
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase italic">
              {status === 'approved' ? 'Vrijgeven' : status === 'temp_reject' ? 'Tijdelijke Afkeur' : 'Definitieve Afkeur'}
            </h2>
            <p className="text-white/80 text-xs md:text-sm font-bold mt-1">
              {product?.lotNumber} • {product?.item}
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar">
          {/* Status Selection */}
          {isLossenStep && (
            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6">
              <button
                onClick={() => setStatus("approved")}
                className={`p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "approved" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-100 text-slate-400 hover:border-emerald-200"}`}
              >
                <CheckCircle size={20} className="md:w-6 md:h-6" /> Goed
              </button>
              <button
                onClick={() => setStatus("temp_reject")}
                className={`p-2 md:p-3 rounded-xl border-2 font-black uppercase text-[10px] md:text-xs flex flex-col items-center gap-1 md:gap-2 ${status === "temp_reject" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-100 text-slate-400 hover:border-orange-200"}`}
              >
                <AlertTriangle size={20} className="md:w-6 md:h-6" /> Tijdelijke afkeur
              </button>
              <button
                onClick={() => setStatus("rejected")}
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

          {/* Measurements (Only if Lossen Step) */}
          {isLossenStep && (
            <div className="mb-4 md:mb-6 bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3 flex items-center gap-2">
                <Ruler size={14} /> Meetwaarden
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {isFlange ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TF (mm)</label>
                    <input
                      type="number"
                      value={measurements.TF || ""}
                      onChange={(e) => handleMeasurementChange('TF', e.target.value)}
                      className={`w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TF ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                      placeholder="Waarde..."
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{primaryMeasurementLabel} (mm)</label>
                      <input
                        type="number"
                        value={measurements[primaryMeasurementKey] || (primaryMeasurementKey === 'TWco' ? measurements.TWc || "" : "")}
                        onChange={(e) => handleMeasurementChange(primaryMeasurementKey, e.target.value)}
                        className={`w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors[primaryMeasurementKey] ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                        placeholder="Waarde..."
                      />
                    </div>

                    {showSecondaryMeasurement && isCB && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TWcb (mm)</label>
                        <input
                          type="number"
                          value={measurements.TWcb || ""}
                          onChange={(e) => handleMeasurementChange('TWcb', e.target.value)}
                          className={`w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TWcb ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                          placeholder="Waarde..."
                        />
                      </div>
                    )}

                    {showSecondaryMeasurement && isTB && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">TWtb (mm)</label>
                        <input
                          type="number"
                          value={measurements.TWtb || ""}
                          onChange={(e) => handleMeasurementChange('TWtb', e.target.value)}
                          className={`w-full p-3 rounded-xl border font-bold text-slate-700 focus:border-blue-500 outline-none transition-colors ${errors.TWtb ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                          placeholder="Waarde..."
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Rejection Reasons (Only if not approved) */}
          {status !== "approved" && (
            <div className="mb-4 md:mb-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3">Reden van afkeur</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(getReasonLabel(r))}
                    className={`p-3 rounded-xl text-xs font-bold border text-left ${reason === getReasonLabel(r) ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
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
              onChange={(e) => setComment(e.target.value)}
              className="w-full p-3 md:p-4 rounded-xl border border-slate-200 font-medium text-sm text-slate-700 focus:border-blue-500 outline-none min-h-[80px] md:min-h-[100px]"
              placeholder="Voeg eventueel een opmerking toe..."
            />
          </div>

          {/* Flow Info (Only if approved) */}
          {status === "approved" && (
            <div className="flex items-center justify-center gap-4 mb-4 md:mb-6 opacity-60">
              <div className="text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Huidig</div>
                <div className="font-black text-slate-800">{currentStep}</div>
              </div>
              <ArrowRight className="text-slate-300" size={20} />
              <div className="text-center">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Volgend</div>
                <div className="font-black text-emerald-600">{nextStepDisplay}</div>
              </div>
            </div>
          )}

          <button
            onClick={handleRelease}
            disabled={loading || (status !== "approved" && !reason)}
            className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
              status === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
              status === 'temp_reject' ? 'bg-orange-500 hover:bg-orange-600 text-white' :
              'bg-rose-600 hover:bg-rose-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? "Verwerken..." : "Bevestigen & Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;