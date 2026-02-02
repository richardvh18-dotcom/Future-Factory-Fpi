import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  CheckCircle2,
  AlertOctagon,
  Timer,
  Loader2,
  Save,
  ArrowRightCircle,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  query,
  where,
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { DEFAULT_SPECS_BY_TYPE } from "../../../data/constants";
import { useAdminAuth } from "../../../hooks/useAdminAuth";

/**
 * ProductReleaseModal - Beheert de kwaliteitscontrole en de automatische routing.
 * GEFIXST: De nextMachine namen worden nu geforceerd naar HOOFDLETTERS voor database consistentie.
 */
const ProductReleaseModal = ({ product, isOpen, onClose, appId }) => {
  const { user } = useAdminAuth();
  const [status, setStatus] = useState("Approved");
  const [measurements, setMeasurements] = useState({});
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [occupancy, setOccupancy] = useState([]);

  // Laad occupancy data voor personnel tracking
  useEffect(() => {
    if (!isOpen) return;
    
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => {
        setOccupancy(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );
    
    return () => unsubOccupancy();
  }, [isOpen]);

  const isPostProcessing = ["NABEWERKING", "MAZAK", "BM01"].includes(
    (product?.currentStation || "").toUpperCase()
  );
  const specFields = isPostProcessing
    ? []
    : DEFAULT_SPECS_BY_TYPE[product?.type] || ["TW", "L", "Weight"];

  // --- LOGICA VOOR VOLGENDE STATION (GEFORCEERD OP HOOFDLETTERS) ---
  const routing = useMemo(() => {
    if (!product) return { nextMachine: "", label: "" };

    const currentStation = (product.currentStation || product.originMachine || "").toUpperCase();
    const desc = (product.item || "").toUpperCase();
    let next = "";
    let flowLabel = "";
    let nextStep = "";

    if (["BH18", "BH31", "BH16"].includes(currentStation)) {
      next = "NABEWERKING";
      nextStep = "Nabewerking";
      flowLabel = "Naar Nabewerking";
    } else if (["BH12", "BH17", "BH11", "BH15"].includes(currentStation)) {
      if (desc.startsWith("FL")) {
        next = "MAZAK";
        nextStep = "Mazak";
        flowLabel = "Naar Mazak (FL Item)";
      } else {
        next = "NABEWERKING";
        nextStep = "Nabewerking";
        flowLabel = "Naar Nabewerking";
      }
    } else if (currentStation === "MAZAK" || currentStation === "NABEWERKING") {
      next = "BM01";
      nextStep = "Eindinspectie";
      flowLabel = "Naar Eindinspectie (BM01)";
    } else if (currentStation === "BM01") {
      next = "GEREED";
      nextStep = "Finished";
      flowLabel = "Product Voltooid";
    }

    return { nextMachine: next, label: flowLabel, nextStep: nextStep };
  }, [product]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const productRef = doc(
        db,
        ...PATHS.TRACKING,
        product.id
      );

      let finalNextStation = routing.nextMachine;
      let finalStatus = "in_progress";
      let finalStep = routing.nextStep;
      let actionLabel = "Gereedgemeld";
      const timestampKey = `${routing.nextStep?.toLowerCase()}_start`;

      if (status === "Approved") {
        finalStatus = routing.nextStep === "Finished" ? "completed" : "in_progress";
        actionLabel = routing.label;
      } else if (status === "Rejected") {
        finalStatus = "rejected";
        finalStep = "REJECTED";
        finalNextStation = "AFKEUR";
        actionLabel = "Definitief Afgekeurd";
      } else {
        finalStatus = "temp_reject";
        finalStep = "HOLD_AREA";
        actionLabel = "In Reparatie / Herstel";
      }

      const historyEntry = {
        action: actionLabel,
        station: product.currentStation || product.originMachine,
        timestamp: new Date().toISOString(),
        user: user?.email || "Operator",
        notes: notes,
      };

      const updates = {
        status: finalStatus,
        currentStation: finalNextStation,
        currentStep: finalStep,
        releaseStatus: status,
        measurements: measurements,
        inspectorNotes: notes,
        releasedAt: serverTimestamp(),
        lastStation: product.currentStation || product.originMachine,
        history: arrayUnion(historyEntry),
        updatedAt: serverTimestamp(),
      };

      // Add personnel tracking for next station if approved
      if (status === "Approved" && finalNextStation && finalNextStation !== "GEREED") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const stationOperators = occupancy
          .filter(occ => {
            if (occ.station !== finalNextStation) return false;
            if (!occ.date) return false;
            const occDate = occ.date.toDate ? occ.date.toDate() : new Date(occ.date);
            occDate.setHours(0, 0, 0, 0);
            return occDate.getTime() === today.getTime();
          })
          .map(occ => occ.operatorNumber)
          .filter(Boolean);
        
        if (stationOperators.length > 0) {
          updates[`personnelTracking.${finalNextStation}`] = stationOperators;
        }
      }

      // Add timestamp for next step if approved
      if (status === "Approved" && timestampKey) {
        updates[`timestamps.${timestampKey}`] = serverTimestamp();
      }

      await updateDoc(productRef, updates);

      // Bij definitieve afkeur: update order teller
      if (status === "Rejected" && product.orderId && product.orderId !== "NOG_TE_BEPALEN") {
        try {
          // Zoek de order in planning
          const orderQuery = query(
            collection(db, ...PATHS.PLANNING),
            where("orderId", "==", product.orderId)
          );
          const orderSnap = await getDocs(orderQuery);
          
          if (!orderSnap.empty) {
            const orderDoc = orderSnap.docs[0];
            const orderData = orderDoc.data();
            const originStation = product.originMachine || product.currentStation;
            const stationField = `started_${originStation.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const currentStarted = orderData[stationField] || 0;
            
            // Verlaag de started counter met 1 (product telt niet meer mee)
            if (currentStarted > 0) {
              await updateDoc(doc(db, ...PATHS.PLANNING, orderDoc.id), {
                [stationField]: currentStarted - 1,
              });
            }
          }
        } catch (err) {
          console.error("Fout bij updaten order teller:", err);
        }
      }

      onClose();
    } catch (err) {
      console.error("Opslagfout:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-white/10">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
              <CheckCircle2 size={24} />
            </div>
            <div className="text-left">
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight leading-none">
                Bewerking Afronden
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                Lot: {product.lotNumber} | Station: {product.machine}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10 text-left">
          <section className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
              1. Kwaliteitscontrole
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setStatus("Approved")}
                className={`p-6 rounded-[30px] border-2 flex flex-col items-center gap-3 transition-all ${
                  status === "Approved"
                    ? "bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-100"
                    : "bg-white border-slate-100 text-slate-400 hover:border-emerald-200"
                }`}
              >
                <CheckCircle2
                  size={32}
                  className={
                    status === "Approved"
                      ? "text-emerald-500"
                      : "text-slate-200"
                  }
                />
                <span className="font-black uppercase tracking-widest text-[10px]">
                  Goedgekeurd
                </span>
              </button>
              <button
                onClick={() => setStatus("Temp_Rejected")}
                className={`p-6 rounded-[30px] border-2 flex flex-col items-center gap-3 transition-all ${
                  status === "Temp_Rejected"
                    ? "bg-amber-50 border-amber-500 shadow-lg shadow-amber-100"
                    : "bg-white border-slate-100 text-slate-400 hover:border-amber-200"
                }`}
              >
                <Timer
                  size={32}
                  className={
                    status === "Temp_Rejected"
                      ? "text-amber-500"
                      : "text-slate-200"
                  }
                />
                <span className="font-black uppercase tracking-widest text-[10px]">
                  Herstellen
                </span>
              </button>
              <button
                onClick={() => setStatus("Rejected")}
                className={`p-6 rounded-[30px] border-2 flex flex-col items-center gap-3 transition-all ${
                  status === "Rejected"
                    ? "bg-red-50 border-red-500 shadow-lg shadow-red-100"
                    : "bg-white border-slate-100 text-slate-400 hover:border-red-200"
                }`}
              >
                <AlertOctagon
                  size={32}
                  className={
                    status === "Rejected" ? "text-red-600" : "text-slate-200"
                  }
                />
                <span className="font-black uppercase tracking-widest text-[10px]">
                  Afkeur
                </span>
              </button>
            </div>
          </section>

          {!isPostProcessing && specFields.length > 0 && (
            <section className="space-y-4 animate-in fade-in">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                2. Controlemetingen (mm)
              </h3>
              <div className="bg-slate-50 p-8 rounded-[35px] border border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-6">
                {specFields.map((field) => (
                  <div key={field} className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1">
                      {field}
                    </label>
                    <input
                      type="text"
                      placeholder="Invoer..."
                      className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-sm font-black text-slate-700 outline-none focus:border-blue-500 transition-all text-center"
                      value={measurements[field] || ""}
                      onChange={(e) =>
                        setMeasurements({
                          ...measurements,
                          [field]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
              3. Opmerkingen
            </h3>
            <div className="relative">
              <MessageSquare
                className="absolute left-4 top-4 text-slate-300"
                size={20}
              />
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-4 pl-12 min-h-[100px] outline-none focus:border-blue-500 transition-all font-medium text-sm text-slate-600"
                placeholder="Eventuele bijzonderheden..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              ></textarea>
            </div>
          </section>
        </div>

        <div className="p-8 bg-slate-900 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 text-blue-400 text-left">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <GitBranch size={20} />
            </div>
            <div>
              <span className="text-[8px] font-black text-slate-500 uppercase block leading-none mb-1">
                Volgende Bestemming
              </span>
              <span className="text-xs font-black uppercase tracking-widest text-white">
                {status === "Approved"
                  ? routing.nextMachine === "FINISHED"
                    ? "Systeem Voltooid"
                    : routing.nextMachine
                  : "Nader te bepalen"}
              </span>
            </div>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button
              onClick={onClose}
              className="flex-1 md:flex-none px-8 py-4 text-white/50 hover:text-white font-black uppercase text-xs tracking-widest transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 md:flex-none px-12 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Save size={20} />
              )}{" "}
              Verwerken
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;
