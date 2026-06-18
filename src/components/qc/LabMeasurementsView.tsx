import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Beaker, Thermometer, CheckCircle2, XCircle, Pencil, Save, Loader2 } from "lucide-react";
import AddLabMeasurementModal from "./AddLabMeasurementModal";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { updateQcMeasurement } from "../../services/qcSecurityService";
import { collection, onSnapshot, getDoc, doc, query, where, getDocs, collectionGroup } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import ProductDossierModal from "../digitalplanning/modals/ProductDossierModal";

export type LabMeasurement = {
  id: string;
  lotNumber: string;
  resinBatch?: string;
  ri?: number;
  brix?: number;
  tg?: number;
  measuredAt: string;
  measuredBy: string;
  week?: number;
  year?: number;
  department?: string;
  kitchen?: string;
  tapPoint?: string;
  shift?: string;
  resinWeight?: number;
  hardenerWeight?: number;
  refractiveIndex?: number;
  visualCheckOk?: boolean;
  tableRef?: number;
  mixingRatio?: string;
  area?: "A" | "B" | "C";
  type?: "ri" | "brix" | "tg";
  trackedProductPath?: string | null;
};

type BrixEditDraft = {
  measuredAt: string;
  kitchen: string;
  shift: string;
  refractiveIndex: string;
  mixingRatio: string;
  area: "A" | "B" | "C";
  visualCheckOk: boolean;
  measuredBy: string;
};

const sampleMeasurements: LabMeasurement[] = [
  {
    id: "m-001",
    lotNumber: "402621412400010",
    measuredAt: "2026-05-21 07:20",
    measuredBy: "QC LAB",
    week: 21,
    year: 2026,
    department: "Fittings",
    kitchen: "Harskeuken 1",
    tapPoint: "Aftappunt 1",
    shift: "Mo",
    resinWeight: 3.275,
    hardenerWeight: 0.8,
    ri: 1.5559,
    refractiveIndex: 1.5559,
    brix: 1.5559,
    visualCheckOk: true,
    tableRef: 1,
    mixingRatio: "100:22.8",
    area: "A",
    type: "ri",
  },
  {
    id: "m-002",
    lotNumber: "LOT-240502",
    resinBatch: "RES-2026-041",
    tg: 126.8,
    measuredAt: "2026-05-22 10:05",
    measuredBy: "Testing Inspector",
    week: 21,
    year: 2026,
    type: "tg",
  },
];

type LabMeasurementsViewProps = {
  measurements?: LabMeasurement[];
  readOnly?: boolean;
  forcedTile?: "ri" | "tg";
};

const deptTileStyles: Record<string, string> = {
  Fittings: "bg-blue-50 border-blue-500 text-blue-900",
  Spoolbouw: "bg-emerald-50 border-emerald-500 text-emerald-900",
  Buizen: "bg-amber-50 border-amber-500 text-amber-900",
};

const normalizeDepartment = (department?: string): string => {
  const value = String(department || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower === "fittings") return "Fittings";
  if (lower === "spoolbouw") return "Spoolbouw";
  if (lower === "buizen") return "Buizen";

  return value;
};

const getShiftLabel = (shift: string | undefined, t: any): string => {
  if (shift === "Mo") return t("qc.shift_morning_short", "Vroeg (Mo)");
  if (shift === "Mi") return t("qc.shift_afternoon_short", "Middag (Mi)");
  if (shift === "Na") return t("qc.shift_night_short", "Nacht (Na)");
  return "-";
};

const getDatePart = (measuredAt?: string): string => {
  const raw = String(measuredAt || "").trim();
  if (!raw) return "-";
  const [datePart] = raw.split(/[ T]/);
  if (!datePart) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, m, d] = datePart.split("-");
    return `${d}-${m}-${y}`;
  }
  return datePart;
};

const getTimePart = (measuredAt?: string): string => {
  const raw = String(measuredAt || "").trim();
  if (!raw) return "-";
  const match = raw.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "-";
};

const LabMeasurementsView = ({ measurements = sampleMeasurements, readOnly = false, forcedTile }: LabMeasurementsViewProps) => {
  const { t } = useTranslation();
  const { isAdmin } = useAdminAuth();
  const { showSuccess, showError } = useNotifications();
  const canEditRows = isAdmin && !readOnly;
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTile, setActiveTile] = useState<"ri" | "tg">(forcedTile || "ri");
  const [activeDepartment, setActiveDepartment] = useState("Fittings");
  const [kitchenFilter, setKitchenFilter] = useState("Alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BrixEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  
  const [personnelMap, setPersonnelMap] = useState<Record<string, string>>({});
  const [dossierProduct, setDossierProduct] = useState<any>(null);
  const [loadingDossierLot, setLoadingDossierLot] = useState<string | null>(null);

  useEffect(() => {
    if (forcedTile) setActiveTile(forcedTile);
  }, [forcedTile]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, getPathString(PATHS.PERSONNEL as string[])), (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.employeeNumber) map[String(data.employeeNumber)] = data.name;
      });
      setPersonnelMap(map);
    });
    return () => unsub();
  }, []);

  const handleOpenDossier = async (row: LabMeasurement) => {
    setLoadingDossierLot(row.lotNumber);
    try {
      let foundDoc = null;
      if (row.trackedProductPath) {
        const docSnap = await getDoc(doc(db, row.trackedProductPath));
        if (docSnap.exists()) {
          foundDoc = { id: docSnap.id, ...docSnap.data() };
        }
      }
      if (!foundDoc) {
        const q = query(collection(db, getPathString(PATHS.TRACKING as string[])), where("lotNumber", "==", row.lotNumber));
        const snap = await getDocs(q);
        if (!snap.empty) {
          foundDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } else {
          const sq = query(collectionGroup(db, "items"), where("lotNumber", "==", row.lotNumber));
          const sSnap = await getDocs(sq);
          const valid = sSnap.docs.filter(d => d.ref.path.includes("/tracked_products/"));
          if (valid.length > 0) {
            foundDoc = { id: valid[0].id, ...valid[0].data() };
          }
        }
      }
      
      if (foundDoc) {
        setDossierProduct(foundDoc);
      } else {
        setDossierProduct({ id: row.lotNumber, lotNumber: row.lotNumber });
        showError("Volledig dossier niet gevonden, toont beperkte weergave.");
      }
    } catch (error) {
      console.error("Fout bij ophalen dossier:", error);
      showError("Kon dossier niet openen.");
    } finally {
      setLoadingDossierLot(null);
    }
  };

  const startEditing = (row: LabMeasurement) => {
    if (readOnly) return;
    const refractiveValue = row.refractiveIndex ?? row.ri ?? row.brix;
    setEditingMeasurementId(row.id);
    setEditDraft({
      measuredAt: String(row.measuredAt || ""),
      kitchen: String(row.kitchen || ""),
      shift: String(row.shift || ""),
      refractiveIndex: refractiveValue !== undefined && refractiveValue !== null ? Number(refractiveValue).toFixed(4) : "",
      mixingRatio: String(row.mixingRatio || ""),
      area: (row.area || "A") as "A" | "B" | "C",
      visualCheckOk: row.visualCheckOk !== false,
      measuredBy: String(row.measuredBy || ""),
    });
  };

  const cancelEditing = () => {
    setEditingMeasurementId(null);
    setEditDraft(null);
    setSavingEdit(false);
  };

  const saveEditedMeasurement = async (row: LabMeasurement) => {
    if (!editDraft) return;

    const parsedRefractive = Number.parseFloat(editDraft.refractiveIndex.replace(",", "."));
    if (!Number.isFinite(parsedRefractive)) {
      showError("Vul een geldige brekingsindex in (bijv. 1.5550).");
      return;
    }

    setSavingEdit(true);
    try {
      await updateQcMeasurement({
        measurementId: row.id,
        lotNumber: row.lotNumber,
        trackedProductPath: row.trackedProductPath || null,
        type: "ri",
        measuredAt: editDraft.measuredAt,
        actorLabel: editDraft.measuredBy || "QC Admin",
        source: "LabMeasurementsViewAdminEdit",
        department: normalizeDepartment(row.department),
        kitchen: editDraft.kitchen,
        shift: editDraft.shift,
        refractiveIndex: parsedRefractive,
        ri: parsedRefractive,
        brix: parsedRefractive,
        mixingRatio: editDraft.mixingRatio,
        area: editDraft.area,
        visualCheckOk: editDraft.visualCheckOk,
      });

      showSuccess("Meting succesvol bijgewerkt.");
      cancelEditing();
    } catch (error: any) {
      showError(error?.message || "Opslaan van bewerkte meting mislukt.");
      setSavingEdit(false);
    }
  };

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>(["Fittings", "Spoolbouw", "Buizen"]);
    measurements.forEach((m) => {
      const normalizedDepartment = normalizeDepartment(m.department);
      if (normalizedDepartment) {
        depts.add(normalizedDepartment);
      }
    });
    return Array.from(depts);
  }, [measurements]);

  const availableKitchens = useMemo(() => {
    const kitchens = new Set<string>();
    measurements.forEach((m) => {
      if (normalizeDepartment(m.department) === activeDepartment && m.kitchen) {
        kitchens.add(m.kitchen);
      }
    });
    return ["Alle", ...Array.from(kitchens)];
  }, [activeDepartment, measurements]);

  const filteredMeasurements = measurements.filter((m) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (activeTile === "ri") {
      const isBrix = m.type === "ri" || m.type === "brix" || !!m.ri || !!m.brix || !!m.refractiveIndex;
      if (!isBrix) return false;
      if (normalizeDepartment(m.department) !== activeDepartment) return false;
      if (kitchenFilter !== "Alle" && m.kitchen !== kitchenFilter) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        m.lotNumber,
        m.measuredBy,
        m.department,
        m.kitchen,
        m.tapPoint,
        m.shift,
        m.mixingRatio,
        m.area,
        m.measuredAt,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    }

    const isTg = m.type === "tg" || !!m.tg;
    if (!isTg) return false;
    if (!normalizedSearch) return true;

    const tgHaystack = [m.lotNumber, m.measuredBy, m.resinBatch, m.measuredAt]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return tgHaystack.includes(normalizedSearch);
  });

  const groupedMeasurements = filteredMeasurements.reduce((acc, curr) => {
    const key = curr.year && curr.week ? `Week ${curr.week} (${curr.year})` : t("common.unknown", "Onbekend");
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {} as Record<string, LabMeasurement[]>);

  const brixCountByDepartment = uniqueDepartments.reduce((acc, dept) => {
    acc[dept] = measurements.filter(
      (m) =>
        (m.type === "ri" || m.type === "brix" || !!m.ri || !!m.brix || !!m.refractiveIndex) &&
        normalizeDepartment(m.department) === dept
    ).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {t("qc.lab_measurements_title", "Brekingsindex & Lab Metingen")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t("qc.lab_measurements_subtitle", "Ploegmetingen voor brekingsindex- en kwaliteitscontroles per week.")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={`px-4 py-2 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg flex items-center gap-2 ${
            activeTile === "ri"
              ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
              : "bg-purple-600 hover:bg-purple-700 shadow-purple-200"
          }`}
        >
          <Plus size={16} />
          {activeTile === "ri"
            ? t("qc.add_brix", "Nieuwe Brekingsindex Meting")
            : t("qc.add_tg", "Nieuwe Tg Meting")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTile("ri")}
          className={`p-6 rounded-3xl border-2 flex items-center gap-4 transition-all text-left ${
            activeTile === "ri"
              ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100"
              : "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50"
          }`}
        >
          <div className={`p-4 rounded-2xl ${activeTile === "ri" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            <Beaker size={24} />
          </div>
          <div>
            <h3 className={`text-lg font-black uppercase tracking-tight ${activeTile === "ri" ? "text-blue-900" : "text-slate-700"}`}>
              {t("qc.refractive_index_measurements", "Brekingsindex Metingen")}
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{t("qc.mix_ratios_and_index", "Mengverhoudingen & Index")}</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTile("tg")}
          className={`p-6 rounded-3xl border-2 flex items-center gap-4 transition-all text-left ${
            activeTile === "tg"
              ? "bg-purple-50 border-purple-500 shadow-lg shadow-purple-100"
              : "bg-white border-slate-100 hover:border-purple-200 hover:bg-slate-50"
          }`}
        >
          <div className={`p-4 rounded-2xl ${activeTile === "tg" ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"}`}>
            <Thermometer size={24} />
          </div>
          <div>
            <h3 className={`text-lg font-black uppercase tracking-tight ${activeTile === "tg" ? "text-purple-900" : "text-slate-700"}`}>
              {t("qc.tg_measurements", "Tg Metingen")}
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">{t("qc.laboratory_analysis", "Laboratorium analyse")}</p>
          </div>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {activeTile === "ri" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {uniqueDepartments.map((department) => {
                const active = department === activeDepartment;
                const style = deptTileStyles[department] || "bg-slate-50 border-slate-300 text-slate-800";
                return (
                  <button
                    key={department}
                    onClick={() => {
                      setActiveDepartment(department);
                      setKitchenFilter("Alle");
                    }}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      active ? `${style} shadow-md` : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-widest opacity-70">{t("common.department", "Afdeling")}</p>
                    <p className="text-lg font-black tracking-tight">{department}</p>
                    <p className="text-xs font-bold mt-1 opacity-80">{brixCountByDepartment[department] || 0} meting(en)</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">{t("qc.resin_kitchen", "Harskeuken")}</label>
                <select
                  value={kitchenFilter}
                  onChange={(e) => setKitchenFilter(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                >
                  {availableKitchens.map((kitchen) => (
                    <option key={kitchen} value={kitchen}>{kitchen}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">{t("common.search", "Zoeken")}</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("placeholders.qcBrixSearch", "Zoek op lot, ploeg, aftappunt, verhouding of operator")}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">{t("common.search", "Zoeken")}</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("placeholders.qcTgSearch", "Zoek op lot, harsbatch of operator")}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:border-purple-500"
            />
          </div>
        )}
      </div>

      {Object.keys(groupedMeasurements).length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold uppercase tracking-widest text-xs">
          Geen metingen gevonden
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMeasurements).map(([weekLabel, rows]) => (
            <div key={weekLabel} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                <h3 className="font-black text-slate-700 uppercase tracking-widest text-xs">{weekLabel}</h3>
                <span className="px-2 py-0.5 bg-white text-slate-500 rounded-md text-[10px] font-bold shadow-sm">
                  {rows.length} meting(en)
                </span>
              </div>

              {activeTile === "ri" ? (
                <div className="p-4 space-y-3">
                  {rows.map((row) => (
                    <details key={row.id} className="group rounded-xl border border-slate-200 bg-slate-50 open:bg-white open:shadow-sm">
                      <summary className="list-none cursor-pointer p-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <p className="font-black text-slate-700">{t("common.week", "Week")}: <span className="text-slate-900">{row.week ? `${row.week}${row.year ? ` (${row.year})` : ""}` : weekLabel}</span></p>
                            <p className="font-black text-slate-700">{t("common.time", "Tijd")}: <span className="text-slate-900">{getTimePart(row.measuredAt)}</span></p>
                            <p className="font-black text-slate-700">{t("common.date", "Datum")}: <span className="text-slate-900">{getDatePart(row.measuredAt)}</span></p>
                            <p className="font-black text-slate-700">{t("qc.meas_tappoint", "Meetpunt")}: <span className="text-slate-900">{row.kitchen || "-"}</span></p>
                            <p className="font-black text-slate-700">{t("qc.meas_shift", "Ploeg")}: <span className="text-slate-900">{getShiftLabel(row.shift, t)}</span></p>
                        </div>
                      </summary>

                      <div className="px-4 pb-4 border-t border-slate-100">
                        {canEditRows && (
                          <div className="pt-3 flex items-center justify-end gap-2">
                            {editingMeasurementId === row.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => cancelEditing()}
                                  disabled={savingEdit}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold"
                                >
                                  Annuleren
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEditedMeasurement(row)}
                                  disabled={savingEdit}
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center gap-1 disabled:opacity-60"
                                >
                                  {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                  Opslaan
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(row)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-black flex items-center gap-1"
                              >
                                <Pencil size={14} />
                                Bewerken
                              </button>
                            )}
                          </div>
                        )}

                        <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.lot", "Lot")}:</span>
                            <button
                              onClick={() => handleOpenDossier(row)}
                              disabled={loadingDossierLot === row.lotNumber}
                              className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-left flex items-center gap-2"
                              title={t("qc.open_dossier", "Open Productdossier")}
                            >
                              {row.lotNumber || "-"}
                              {loadingDossierLot === row.lotNumber && <Loader2 size={12} className="animate-spin" />}
                            </button>
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_department", "Afdeling")}:</span>
                            <span className="font-bold text-slate-800">{row.department || "-"}</span>
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_kitchen", "Harskeuken")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <input
                                value={editDraft.kitchen}
                                onChange={(e) => setEditDraft({ ...editDraft, kitchen: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-bold text-slate-800"
                              />
                            ) : (
                              <span className="font-bold text-slate-800">{row.kitchen || "-"}</span>
                            )}
                          </div>
                          {row.tapPoint && (
                            <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                              <span className="font-black text-slate-500">{t("qc.meas_tappoint", "Aftappunt")}:</span>
                              <span className="font-bold text-slate-800">{row.tapPoint}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_shift", "Ploeg")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <select
                                value={editDraft.shift}
                                onChange={(e) => setEditDraft({ ...editDraft, shift: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-bold text-slate-800"
                              >
                                <option value="Mo">{t("qc.shift_morning_short", "Vroeg (Mo)")}</option>
                                <option value="Mi">{t("qc.shift_afternoon_short", "Middag (Mi)")}</option>
                                <option value="Na">{t("qc.shift_night_short", "Nacht (Na)")}</option>
                              </select>
                            ) : (
                              <span className="font-bold text-slate-800">{getShiftLabel(row.shift, t)}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_time", "Meettijd")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <input
                                value={editDraft.measuredAt}
                                onChange={(e) => setEditDraft({ ...editDraft, measuredAt: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-bold text-slate-800"
                              />
                            ) : (
                              <span className="font-bold text-slate-800">{row.measuredAt || "-"}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_brix", "Brekingsindex")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <input
                                value={editDraft.refractiveIndex}
                                onChange={(e) => setEditDraft({ ...editDraft, refractiveIndex: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-mono font-black text-blue-700"
                              />
                            ) : (
                              <span className="font-mono font-black text-blue-700">
                                {(row.refractiveIndex ?? row.ri ?? row.brix) ? Number(row.refractiveIndex ?? row.ri ?? row.brix).toFixed(4) : "-"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_ratio", "Mengverhouding")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <input
                                value={editDraft.mixingRatio}
                                onChange={(e) => setEditDraft({ ...editDraft, mixingRatio: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-black text-slate-800"
                              />
                            ) : (
                              <span className="font-black text-slate-800">{row.mixingRatio || "-"}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_weight_resin_ipd", "Gewicht Hars/IPD")}:</span>
                            <span className="font-bold text-slate-800">
                              {row.resinWeight !== undefined && row.hardenerWeight !== undefined
                                ? `${Number(row.resinWeight).toFixed(3)} kg / ${Number(row.hardenerWeight).toFixed(3)} kg`
                                : "-"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_area", "Acceptatieniveau")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <select
                                value={editDraft.area}
                                onChange={(e) => setEditDraft({ ...editDraft, area: e.target.value as "A" | "B" | "C" })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-black text-slate-800"
                              >
                                <option value="A">{t("qc.areaA", "Area A")}</option>
                                <option value="B">{t("qc.areaB", "Area B")}</option>
                                <option value="C">{t("qc.areaC", "Area C")}</option>
                              </select>
                            ) : (
                              <span
                                className={`font-black ${
                                  row.area === "A"
                                    ? "text-emerald-700"
                                    : row.area === "B"
                                      ? "text-amber-600"
                                      : row.area === "C"
                                        ? "text-rose-700"
                                        : "text-slate-700"
                                }`}
                              >
                                {row.area ? `Area ${row.area}` : "-"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_visual", "Visuele Check")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <select
                                value={editDraft.visualCheckOk ? "OK" : "NOK"}
                                onChange={(e) => setEditDraft({ ...editDraft, visualCheckOk: e.target.value === "OK" })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-black text-slate-800"
                              >
                                <option value="OK">{t("qc.ok", "OK")}</option>
                                <option value="NOK">{t("qc.nok", "NOK")}</option>
                              </select>
                            ) : (
                              <span className="inline-flex items-center gap-2 font-black text-slate-800">
                                {row.visualCheckOk === true ? <CheckCircle2 size={16} className="text-emerald-500" /> : null}
                                {row.visualCheckOk === false ? <XCircle size={16} className="text-rose-500" /> : null}
                                {row.visualCheckOk === true ? "OK" : row.visualCheckOk === false ? "NOK" : "-"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
                            <span className="font-black text-slate-500">{t("qc.meas_operator_short", "Operator")}:</span>
                            {editingMeasurementId === row.id && editDraft ? (
                              <input
                                value={editDraft.measuredBy}
                                onChange={(e) => setEditDraft({ ...editDraft, measuredBy: e.target.value })}
                                className="w-full p-1.5 bg-white border border-slate-300 rounded-md font-bold text-slate-800"
                              />
                            ) : (
                            <span 
                              className="font-bold text-slate-800 cursor-help border-b border-dashed border-slate-400"
                              title={personnelMap[row.measuredBy] || t("common.name_unknown", "Naam onbekend")}
                            >
                              {row.measuredBy || "-"}
                            </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-4 py-3 text-left">{t("qc.lot", "Lot")}</th>
                      <th className="px-4 py-3 text-left">{t("qc.resin_batch", "Harsbatch")}</th>
                      <th className="px-4 py-3 text-left">{t("qc.tg", "Tg")}</th>
                      <th className="px-4 py-3 text-left">{t("common.time", "Tijd")}</th>
                      <th className="px-4 py-3 text-left">{t("common.by", "Door")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-800">
                            <button
                              onClick={() => handleOpenDossier(row)}
                              disabled={loadingDossierLot === row.lotNumber}
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2"
                              title={t("qc.open_dossier", "Open Productdossier")}
                            >
                              {row.lotNumber}
                              {loadingDossierLot === row.lotNumber && <Loader2 size={12} className="animate-spin" />}
                            </button>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.resinBatch || "-"}</td>
                        <td className="px-4 py-3 font-mono font-bold text-purple-600">{row.tg ? row.tg.toFixed(1) : "-"}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium">{row.measuredAt}</td>
                        <td className="px-4 py-3 text-slate-700 text-xs">
                          <span 
                            className="cursor-help border-b border-dashed border-slate-400"
                            title={personnelMap[row.measuredBy] || t("common.name_unknown", "Naam onbekend")}
                          >
                            {row.measuredBy}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddLabMeasurementModal onClose={() => setShowAddModal(false)} defaultType={activeTile} />}

      {dossierProduct && (
        <ProductDossierModal
          isOpen={!!dossierProduct}
          product={dossierProduct}
          onClose={() => setDossierProduct(null)}
        />
      )}
    </div>
  );
};

export default LabMeasurementsView;
