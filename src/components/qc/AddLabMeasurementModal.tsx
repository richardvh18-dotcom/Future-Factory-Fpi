import React, { useState, useMemo, useEffect } from "react";
import { X, Save, Loader2, Beaker, Thermometer, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveQcMeasurement } from "../../services/qcSecurityService";
import { auth, db } from "../../config/firebase";
import { doc, onSnapshot, collection, query, where, getDocs, collectionGroup, updateDoc } from "firebase/firestore";
import { PATHS, getPathString } from "../../config/dbPaths";
import { useNotifications } from "../../contexts/NotificationContext";

type AddLabMeasurementModalProps = {
  onClose: () => void;
  defaultType?: "ri" | "tg";
};

const normalizeDepartmentName = (department?: string): string => {
  const value = String(department || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower === "fittings") return "Fittings";
  if (lower === "spoolbouw") return "Spoolbouw";
  if (lower === "buizen") return "Buizen";

  return value;
};

// Exacte QAQC-W11 Tabellen (Empirisch uit fabriek in plaats van theoretische formule)
const QAQC_W11_TABLES: Record<number, { nMix: number; ratio: number; area: "A" | "B" | "C" }[]> = {
  1: [
    { nMix: 1.5564, ratio: 21.4, area: "C" }, { nMix: 1.5560, ratio: 21.6, area: "C" },
    { nMix: 1.5558, ratio: 21.8, area: "B" }, { nMix: 1.5556, ratio: 22.1, area: "B" },
    { nMix: 1.5554, ratio: 22.8, area: "A" }, { nMix: 1.5552, ratio: 23.1, area: "A" },
    { nMix: 1.5550, ratio: 23.4, area: "A" }, { nMix: 1.5548, ratio: 23.7, area: "A" },
    { nMix: 1.5546, ratio: 24.0, area: "A" }, { nMix: 1.5544, ratio: 24.4, area: "A" },
    { nMix: 1.5541, ratio: 24.8, area: "A" }, { nMix: 1.5538, ratio: 25.2, area: "A" },
    { nMix: 1.5536, ratio: 25.6, area: "B" }, { nMix: 1.5534, ratio: 26.0, area: "B" },
    { nMix: 1.5532, ratio: 26.3, area: "B" }, { nMix: 1.5530, ratio: 26.7, area: "C" },
    { nMix: 1.5528, ratio: 27.0, area: "C" }
  ],
  3: [
    { nMix: 1.5562, ratio: 21.4, area: "C" }, { nMix: 1.5558, ratio: 21.6, area: "C" },
    { nMix: 1.5556, ratio: 21.8, area: "B" }, { nMix: 1.5554, ratio: 22.1, area: "B" },
    { nMix: 1.5552, ratio: 22.8, area: "A" }, { nMix: 1.5550, ratio: 23.1, area: "A" },
    { nMix: 1.5548, ratio: 23.4, area: "A" }, { nMix: 1.5546, ratio: 23.7, area: "A" },
    { nMix: 1.5544, ratio: 24.0, area: "A" }, { nMix: 1.5542, ratio: 24.4, area: "A" },
    { nMix: 1.5540, ratio: 24.8, area: "A" }, { nMix: 1.5536, ratio: 25.2, area: "A" },
    { nMix: 1.5534, ratio: 25.6, area: "B" }, { nMix: 1.5532, ratio: 26.0, area: "B" },
    { nMix: 1.5530, ratio: 26.3, area: "B" }, { nMix: 1.5528, ratio: 26.7, area: "C" },
    { nMix: 1.5526, ratio: 27.0, area: "C" }
  ],
  4: [
    { nMix: 1.5566, ratio: 21.4, area: "C" }, { nMix: 1.5562, ratio: 21.6, area: "C" },
    { nMix: 1.5560, ratio: 21.8, area: "B" }, { nMix: 1.5558, ratio: 22.1, area: "B" },
    { nMix: 1.5556, ratio: 22.8, area: "A" }, { nMix: 1.5554, ratio: 23.1, area: "A" },
    { nMix: 1.5552, ratio: 23.4, area: "A" }, { nMix: 1.5550, ratio: 23.7, area: "A" },
    { nMix: 1.5548, ratio: 24.0, area: "A" }, { nMix: 1.5546, ratio: 24.4, area: "A" },
    { nMix: 1.5543, ratio: 24.8, area: "A" }, { nMix: 1.5540, ratio: 25.2, area: "A" },
    { nMix: 1.5538, ratio: 25.6, area: "B" }, { nMix: 1.5536, ratio: 26.0, area: "B" },
    { nMix: 1.5534, ratio: 26.3, area: "B" }, { nMix: 1.5532, ratio: 26.7, area: "C" },
    { nMix: 1.5530, ratio: 27.0, area: "C" }
  ],
  5: [
    { nMix: 1.5557, ratio: 21.4, area: "C" }, { nMix: 1.5555, ratio: 21.6, area: "C" },
    { nMix: 1.5553, ratio: 21.8, area: "B" }, { nMix: 1.5551, ratio: 22.1, area: "B" },
    { nMix: 1.5549, ratio: 22.8, area: "A" }, { nMix: 1.5547, ratio: 23.1, area: "A" },
    { nMix: 1.5545, ratio: 23.4, area: "A" }, { nMix: 1.5543, ratio: 23.7, area: "A" },
    { nMix: 1.5541, ratio: 24.0, area: "A" }, { nMix: 1.5539, ratio: 24.4, area: "A" },
    { nMix: 1.5537, ratio: 24.8, area: "A" }, { nMix: 1.5534, ratio: 25.2, area: "A" },
    { nMix: 1.5532, ratio: 25.6, area: "B" }, { nMix: 1.5530, ratio: 26.0, area: "B" },
    { nMix: 1.5528, ratio: 26.3, area: "B" }, { nMix: 1.5526, ratio: 26.7, area: "C" },
    { nMix: 1.5524, ratio: 27.0, area: "C" }
  ]
};

const AddLabMeasurementModal = ({ onClose, defaultType = "ri" }: AddLabMeasurementModalProps) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, getPathString(PATHS.FACTORY_CONFIG as string[])), (snap) => {
      if (snap.exists()) {
        const config = snap.data();
        setDepartments(config.departments || []);
      }
    });
    return () => unsub();
  }, []);

  const availableLabStations = useMemo(() => {
    const stations: { id: string; name: string; departmentName: string; maxResinWeight?: number; maxHardenerWeight?: number }[] = [];
    departments.forEach((dept) => {
      (dept.stations || []).forEach((st: any) => {
        if (st.isAvailableForLabMeasurements) {
          stations.push({
            id: st.id,
            name: st.name,
            departmentName: dept.name,
            maxResinWeight: st.maxResinWeight,
            maxHardenerWeight: st.maxHardenerWeight,
          });
        }
      });
    });
    return stations;
  }, [departments]);

  const [measurementDate, setMeasurementDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [measurementTime, setMeasurementTime] = useState(() => new Date().toTimeString().substring(0, 5));
  
  const [formData, setFormData] = useState({
    operatorId: "",
    lotNumber: "",
    department: "",
    kitchen: "",
    shift: "Mo",
    tableRef: 1,
    resinWeight: "",
    hardenerWeight: "",
    refractiveIndex: "",
    visualCheckOk: true,
    // For Tg
    resinBatch: "",
    tg: "",
    notes: "",
  });

  // Automatische ploeg-selectie op basis van tijd
  useEffect(() => {
    const hour = parseInt(measurementTime.split(":")[0], 10);
    if (!isNaN(hour)) {
      let newShift = "Mo";
      if (hour >= 6 && hour < 14) newShift = "Mo";
      else if (hour >= 14 && hour < 22) newShift = "Mi";
      else newShift = "Na";
      
      setFormData((prev) => prev.shift !== newShift ? { ...prev, shift: newShift } : prev);
    }
  }, [measurementTime]);

  const calculation = useMemo(() => {
    if (defaultType !== "ri") return null;
    const nMix = parseFloat(formData.refractiveIndex);
    if (isNaN(nMix)) return null;

    // Harscontrole gebruikt in deze flow altijd QAQC-W11 tabel 1 (n=1.5738).
    const tableData = QAQC_W11_TABLES[1];
    if (!tableData) return null;

    let closestMatch = tableData[0];
    let minDiff = Math.abs(tableData[0].nMix - nMix);

    for (let i = 1; i < tableData.length; i++) {
      const diff = Math.abs(tableData[i].nMix - nMix);
      if (diff < minDiff) {
        minDiff = diff;
        closestMatch = tableData[i];
      }
    }

    return {
      measuredRatio: closestMatch.ratio.toFixed(1),
      area: closestMatch.area,
      nMixMatch: closestMatch.nMix
    };
  }, [formData.refractiveIndex, defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const measuredAtString = `${measurementDate} ${measurementTime}`;
    const lotUpper = formData.lotNumber.toUpperCase();

    if (defaultType === "ri" && !calculation) {
      showError("Vul een geldige brekingsindex in om de calculatie te voltooien.");
      return;
    }

    const parsedTg = defaultType === "tg" ? (formData.tg !== "" ? parseFloat(formData.tg) : null) : null;
    if (defaultType === "tg" && parsedTg === null) {
      showError("Vul een Tg waarde in.");
      return;
    }

    setLoading(true);

    let matchedDocPath = null;
    
    try {
      // Zoek ALTIJD of het lotnummer bestaat, zodat we meetwaarden aan het dossier kunnen koppelen als de machine wél aangesloten is.
      let trackingSnap = await getDocs(query(collection(db, getPathString(PATHS.TRACKING as string[])), where("lotNumber", "==", lotUpper)));
      let foundDoc = trackingSnap.empty ? null : trackingSnap.docs[0];

      if (!foundDoc) {
        const scopedSnap = await getDocs(query(collectionGroup(db, "items"), where("lotNumber", "==", lotUpper)));
        const validScoped = scopedSnap.docs.filter(d => d.ref.path.includes("/tracked_products/"));
        if (validScoped.length > 0) {
          foundDoc = validScoped[0];
        }
      }

      if (foundDoc) {
        matchedDocPath = foundDoc.ref.path;
      } else {
        // Lotnummer NIET gevonden.
        // Validatie: BH18 lotnummers (bevatten '418') MOETEN in de database bestaan.
        if (lotUpper.includes("418")) {
          showError(`Lotnummer ${lotUpper} bevat '418' (BH18), maar is niet gevonden in de actieve productie. Zorg dat de productie eerst gestart is!`);
          setLoading(false);
          return;
        }
        // Voor andere machines accepteren we voorlopig dat het lot (nog) niet in het systeem zit.
      }
    } catch (err: any) {
      console.error("Fout bij lot validatie:", err);
      showError("Fout bij het controleren van het lotnummer in de database.");
      setLoading(false);
      return;
    }

    let payload: any = {
      type: defaultType,
      lotNumber: lotUpper,
      notes: formData.notes,
      measuredAt: measuredAtString,
      actorLabel: formData.operatorId || auth.currentUser?.email || "QC Operator",
      source: "AddLabMeasurementModal",
      trackedProductPath: matchedDocPath
    };

    if (defaultType === "ri") {
      payload = {
        ...payload,
        department: normalizeDepartmentName(formData.department),
        kitchen: formData.kitchen,
        shift: formData.shift,
        resinWeight: parseFloat(formData.resinWeight) || 0,
        hardenerWeight: parseFloat(formData.hardenerWeight) || 0,
        refractiveIndex: parseFloat(formData.refractiveIndex),
        visualCheckOk: formData.visualCheckOk,
        tableRef: 1,
        mixingRatio: `100:${calculation!.measuredRatio}`,
        area: calculation!.area,
        ri: parseFloat(formData.refractiveIndex),
        brix: parseFloat(formData.refractiveIndex), // fallback field
      };
    } else {
      payload = {
        ...payload,
        resinBatch: formData.resinBatch,
        tg: parsedTg,
      };
    }

    try {
      await saveQcMeasurement(payload);
      
      // Probeer direct de meetwaarden in het productdossier bij te schrijven als het document gevonden is
      if (matchedDocPath) {
        try {
          const updates: any = {};
          if (defaultType === "ri") {
            updates["measurements.RI"] = parseFloat(formData.refractiveIndex);
            updates["measurements.RI_Ratio"] = `100:${calculation!.measuredRatio}`;
            updates["measurements.Brix"] = parseFloat(formData.refractiveIndex);
            updates["measurements.Mengverhouding"] = `100:${calculation!.measuredRatio}`;
          } else {
            updates["measurements.Tg"] = parsedTg;
          }
          await updateDoc(doc(db, matchedDocPath), updates);
        } catch (updateErr) {
          console.warn("Directe update van productdossier overgeslagen (wordt mogelijk al door backend gedaan):", updateErr);
        }
      }

      showSuccess(t("qc.measurement_saved", "Meting succesvol opgeslagen via backend en gelogd."));
      onClose();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Fout bij opslaan van meting.");
    } finally {
      setLoading(false);
    }
  };

  const formatWeight = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (!digits) return '';
    return (parseInt(digits, 10) / 1000).toFixed(3);
  };

  const formatRefractiveIndex = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (!digits) return '';
    return (parseInt(digits, 10) / 10000).toFixed(4);
  };

  // Haal dynamische limieten op voor het huidige geselecteerde station (met fallback waarden 200 en 100)
  const activeStationLimits = useMemo(() => {
    const st = availableLabStations.find(s => s.name === formData.kitchen);
    return { maxResin: st?.maxResinWeight || 200, maxHardener: st?.maxHardenerWeight || 100 };
  }, [formData.kitchen, availableLabStations]);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${defaultType === "ri" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
              {defaultType === "ri" ? <Beaker size={24} /> : <Thermometer size={24} />}
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase text-lg italic tracking-tight">
                {defaultType === "ri" ? t("addLabMeasurementModal.newRefractiveIndexMeasurement", "Nieuwe Brekingsindex Meting") : t("addLabMeasurementModal.newTgMeasurement", "Nieuwe Tg Meting")}
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {defaultType === "ri" ? t("addLabMeasurementModal.refractiveIndexAndMixRatio", "Brekingsindex & Mengverhouding") : t("addLabMeasurementModal.labAnalysis", "Laboratorium analyse")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* 1. Personeelsnummer (Operator) */}
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.operatorEmployeeNumber", "Personeelsnummer (Operator)")}</label>
            <input type="text" required value={formData.operatorId} onChange={(e) => setFormData({ ...formData, operatorId: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcOperatorExample", "Bijv. 1234 of Naam")} />
          </div>

          {/* 2. Meetstation */}
          {defaultType === "ri" && (
            <div>
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.resinKitchenMeasurementPoint", "Harskeuken / Meetpunt")}</label>
              <select
                value={formData.kitchen}
                onChange={(e) => {
                  const st = availableLabStations.find(s => s.name === e.target.value);
                  setFormData({
                    ...formData,
                    kitchen: e.target.value,
                    department: normalizeDepartmentName(st?.departmentName),
                  });
                }}
                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500 appearance-none"
                required
              >
                <option value="">{t("addLabMeasurementModal.selectMeasurementPoint", "-- Selecteer Meetpunt --")}</option>
                {availableLabStations.map((st) => (
                  <option key={st.id} value={st.name}>{st.name} ({st.departmentName})</option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Datum, Tijd en Ploeg */}
          <div className={`grid gap-4 ${defaultType === "ri" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-2"}`}>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">{t("common.date", "Datum")}</label>
              <input 
                type="date" 
                value={measurementDate}
                onChange={(e) => setMeasurementDate(e.target.value)}
                required
                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">{t("common.time", "Tijd")}</label>
              <input 
                type="time" 
                value={measurementTime}
                onChange={(e) => setMeasurementTime(e.target.value)}
                required
                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
              />
            </div>
            {defaultType === "ri" && (
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">{t("addLabMeasurementModal.shiftAuto", "Ploeg (Auto)")}</label>
                <input 
                  type="text" 
                  disabled 
                  value={formData.shift === "Mo" ? t("addLabMeasurementModal.shiftMorning", "☀️ Vroeg (Mo)") : formData.shift === "Mi" ? t("addLabMeasurementModal.shiftAfternoon", "🌤️ Middag (Mi)") : t("addLabMeasurementModal.shiftNight", "🌙 Nacht (Na)")}
                  className="w-full p-3 bg-slate-100 border-2 border-slate-100 rounded-xl font-bold text-slate-500 cursor-not-allowed" 
                />
              </div>
            )}
          </div>

          {/* 4. Lotnummer */}
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("common.lotNumber", "Lotnummer")}</label>
            <input type="text" required value={formData.lotNumber} onChange={(e) => setFormData({ ...formData, lotNumber: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcLabLotExample", "Bijv. 4026...")} />
          </div>

          {defaultType === "ri" && (
            <>
              {/* 5. Afgewogen Hars */}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.weighedResin", "Afgewogen Hars (gr → kg)")}</label>
                <input type="text" inputMode="numeric" required value={formData.resinWeight} onChange={(e) => setFormData({ ...formData, resinWeight: formatWeight(e.target.value) })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcResinWeightExample", "3.275")} />
                {parseFloat(formData.resinWeight) > activeStationLimits.maxResin && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1 animate-in fade-in"><AlertTriangle size={12} /> {t("addLabMeasurementModal.unusuallyHighResinWeight", "Ongebruikelijk hoog harsgewicht")}&nbsp;(&gt; {activeStationLimits.maxResin} kg). {t("addLabMeasurementModal.checkInput", "Controleer de invoer.")}</p>
                )}
              </div>

              {/* 6. Afgewogen IPD */}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.weighedIpd", "Afgewogen IPD (gr → kg)")}</label>
                <input type="text" inputMode="numeric" required value={formData.hardenerWeight} onChange={(e) => setFormData({ ...formData, hardenerWeight: formatWeight(e.target.value) })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcHardenerWeightExample", "0.800")} />
                {parseFloat(formData.hardenerWeight) > activeStationLimits.maxHardener && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1 animate-in fade-in"><AlertTriangle size={12} /> {t("addLabMeasurementModal.unusuallyHighIpdWeight", "Ongebruikelijk hoog IPD-gewicht")}&nbsp;(&gt; {activeStationLimits.maxHardener} kg). {t("addLabMeasurementModal.checkInput", "Controleer de invoer.")}</p>
                )}
              </div>

              {/* 7. Gemeten Brekingsindex */}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.measuredRefractiveIndex", "Gemeten Brekingsindex")}</label>
                <input type="text" inputMode="numeric" required value={formData.refractiveIndex} onChange={(e) => setFormData({ ...formData, refractiveIndex: formatRefractiveIndex(e.target.value) })} className="w-full p-3 bg-blue-50 border-2 border-blue-200 rounded-xl font-bold outline-none focus:border-blue-500 text-blue-900" placeholder={t("placeholders.qcRefractiveIndexExample", "1.5559")} />
                {parseFloat(formData.refractiveIndex) > 1.0 && (parseFloat(formData.refractiveIndex) < 1.52 || parseFloat(formData.refractiveIndex) > 1.58) && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1 animate-in fade-in"><AlertTriangle size={12} /> {t("addLabMeasurementModal.valueFarOutsideAverage", "Waarde ligt ver buiten het gemiddelde (normaal ~1.55). Controleer op typefouten.")}</p>
                )}
              </div>
              
              {/* 8. Tabel Referentie (Vast volgens werkinstructie) */}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("addLabMeasurementModal.tableReference", "Tabel Referentie")}</label>
                <input
                  type="text"
                  value={t("addLabMeasurementModal.table1Fixed", "Tabel 1 (vast voor huidige harscontrole)")}
                  disabled
                  className="w-full p-3 bg-slate-100 border-2 border-slate-100 rounded-xl font-bold text-slate-500 cursor-not-allowed"
                />
              </div>

              {/* Visuele Check */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <input type="checkbox" checked={formData.visualCheckOk} onChange={(e) => setFormData({ ...formData, visualCheckOk: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-bold text-slate-700">{t("addLabMeasurementModal.visualCheckOk", "Visuele Check OK (Mixer & Emmers schoon/droog)")}</span>
                </label>
              </div>

              {/* Berekend Resultaat Blok */}
              <div className="mt-4 p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t("addLabMeasurementModal.calculatedRatio", "Berekende Verhouding")}</p>
                  <p className="text-xl font-black text-slate-800">100:{calculation ? calculation.measuredRatio : "- -"}</p>
                </div>
                {calculation && (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t("addLabMeasurementModal.acceptanceLevel", "Acceptatieniveau")}</p>
                      <p className={`text-xl font-black ${calculation.area === "A" ? "text-emerald-600" : calculation.area === "B" ? "text-amber-500" : "text-rose-600"}`}>
                        Area {calculation.area}
                      </p>
                    </div>
                    {calculation.area === "A" ? (
                      <CheckCircle2 size={36} className="text-emerald-500" />
                    ) : (
                      <XCircle size={36} className={calculation.area === "B" ? "text-amber-500" : "text-rose-500"} />
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {defaultType === "tg" && (
            <>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.resinBatch", "Harsbatch (Resin)")}</label>
                <input type="text" required value={formData.resinBatch} onChange={(e) => setFormData({ ...formData, resinBatch: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcResinBatchExample", "Bijv. RES-2026-041")} />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.tg", "Tg")}</label>
                <input type="number" step="0.1" required value={formData.tg} onChange={(e) => setFormData({ ...formData, tg: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcTgExample", "128.5")} />
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addLabMeasurementModal.noteOptional", "Notitie (Optioneel)")}</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium outline-none focus:border-blue-500 resize-none min-h-[60px]" placeholder={t("placeholders.qcLabTestNote", "Opmerkingen over de test...")} />
          </div>

          <div className="pt-4 flex gap-3 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-xs uppercase tracking-wider flex-1">{t("common.cancel", "Annuleren")}</button>
            <button type="submit" disabled={loading} className={`px-6 py-3 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 flex-[2] ${defaultType === "ri" ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-purple-600 hover:bg-purple-700 shadow-purple-200"}`}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {t("common.save", "Opslaan")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLabMeasurementModal;