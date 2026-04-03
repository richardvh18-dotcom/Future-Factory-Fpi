import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, ArrowRight, AlertTriangle, Ruler, AlertOctagon, FileText } from "lucide-react";
import { doc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs, increment } from "firebase/firestore";
import { db, auth, logActivity } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { REJECTION_REASONS } from "../../../utils/workstationLogic";

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

const getLossenRoute = (itemText) => {
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

  if (isTB && diameter >= 300) return "STATION";
  if ((isCB || isELB) && diameter >= 350) return "STATION";

  return "TAB";
};

/**
 * ProductReleaseModal
 * Verschijnt wanneer een operator op "Gereedmelden" klikt.
 * Stuurt het product door naar de volgende stap (bijv. van Wikkelen -> Lossen).
 * UPDATE: Uitgebreide functionaliteit voor Lossen (metingen, afkeur opties).
 */
const ProductReleaseModal = ({ product, onClose, onComplete, autoApproveTrigger = 0, forceLossenMode = false }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const lastAutoApproveRef = useRef(0);
  
  // Form state
  const [status, setStatus] = useState("approved"); // approved, temp_reject, rejected
  const [measurements, setMeasurements] = useState({});
  const [errors, setErrors] = useState({});
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  const getReasonLabel = (reasonKey) => {
    const translated = t(reasonKey);
    if (translated && translated !== reasonKey) return translated;
    return REJECTION_REASON_FALLBACKS[reasonKey] || reasonKey;
  };

  // Determine product/connectie type for measurements
  const itemDesc = (product?.item || "").toUpperCase();
  const mofDesc = String(product?.mof || product?.mofType || "").toUpperCase();
  const combinedDesc = `${itemDesc} ${mofDesc}`.trim();
  const isFlange = combinedDesc.includes("FL") || combinedDesc.includes("FLENS") || /\bFLANGE\b/.test(combinedDesc);
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
  } else if (currentStep === "Lossen") {
    nextStepDisplay = itemDesc.includes("FL") ? "Mazak" : "Nabewerking";
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

      const productRef = doc(db, ...PATHS.TRACKING, product.id);
      const updates = {
        lastUpdated: serverTimestamp(),
        note: comment,
        measurements: normalizedMeasurements
      };

      // Handle Status Logic
      if (status === "approved") {
        // Normal flow
        let nextStep = nextStepDisplay;
        let nextStatus = `Wacht op ${nextStep}`;
        let updateStation = true;
        let targetStation = nextStep;

        if (nextStepDisplay === "Gereed") {
          nextStep = "Finished";
          nextStatus = "Finished";
          updateStation = false;
        } else if (product.isManualMove) {
          updates.isManualMove = false;
          nextStep = "Nabewerking";
          targetStation = "Nabewerking";
        } else if (nextStep === "Eindinspectie") {
          targetStation = "BM01";
        } else if (nextStep === "Lossen") {
          const lossenRoute = getLossenRoute(
            `${product.item || ""} ${product.description || ""} ${product.itemCode || ""}`
          );
          const originStation = product.currentStation || product.machine || "Lossen";
          nextStep = "Wacht op Lossen";
          nextStatus = "Wacht op Lossen";
          targetStation = lossenRoute === "STATION" ? "LOSSEN" : originStation;
        }

        updates.currentStep = nextStep;
        updates.status = nextStatus;
        updates[`timestamps.${currentStep.toLowerCase()}_end`] = serverTimestamp();
        updates[`timestamps.${nextStep.toLowerCase()}_start`] = serverTimestamp();
        
        updates.history = arrayUnion({
          action: "Stap Voltooid",
          timestamp: new Date(),
          user: activeOperator, // Gebruik de opgehaalde operator
          details: `Doorgestuurd van ${currentStep} naar ${nextStep}`,
          station: product.currentStation || product.machine || "Onbekend"
        });

        if (updateStation) {
          updates.currentStation = targetStation;
          updates.lastStation = product.currentStation || product.machine || "Onbekend";
        }

      } else if (status === "temp_reject") {
        updates.status = "Tijdelijke afkeur";
        updates.currentStep = "HOLD_AREA"; // Move to hold
        updates.inspection = {
          status: "Tijdelijke afkeur",
          reasons: [reason],
          timestamp: new Date().toISOString()
        };
        updates.history = arrayUnion({
          action: "Tijdelijke Afkeur",
          timestamp: new Date(),
          user: activeOperator, // Gebruik de opgehaalde operator
          details: `Reden: ${reason} - ${comment}`,
          station: product.currentStation || product.machine || "Onbekend"
        });

      } else if (status === "rejected") {
        updates.status = "Rejected";
        updates.currentStep = "REJECTED";
        updates.currentStation = "AFKEUR";
        updates.inspection = {
          status: "Afkeur",
          reasons: [reason],
          timestamp: new Date().toISOString()
        };
        updates.history = arrayUnion({
          action: "Definitieve Afkeur",
          timestamp: new Date(),
          user: activeOperator, // Gebruik de opgehaalde operator
          details: `Reden: ${reason} - ${comment}`,
          station: product.currentStation || product.machine || "Onbekend"
        });

        // CRITICAl: Update de moeder-order zodat deze weer in de planning komt
        if (product.orderId) {
          const orderRef = doc(db, ...PATHS.PLANNING, product.orderId);
          // We verhogen de rejectedCount. De planning logica (Plan - (Started - Rejected)) zal nu weer > 0 zijn.
          updateDoc(orderRef, {
            rejectedCount: increment(1),
            lastUpdated: serverTimestamp()
          }).catch(e => console.error("Kon order niet updaten na afkeur:", e));
        }
      }

      await updateDoc(productRef, updates);

      await logActivity(
        auth.currentUser?.uid || "system",
        status === "approved" ? "PRODUCT_RELEASE" : status === "temp_reject" ? "QUALITY_TEMP_REJECT" : "QUALITY_REJECT_FINAL",
        `Release modal: lot ${product?.lotNumber || product?.id}, station ${product?.currentStation || product?.machine || "onbekend"}, status ${status}, next ${updates.currentStep || "nvt"}`
      );

      if (onComplete) onComplete();
      onClose();
    } catch (error) {
      console.error("Fout:", error);
      alert(error.message);
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