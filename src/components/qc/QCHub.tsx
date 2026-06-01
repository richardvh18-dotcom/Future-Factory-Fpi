import React, { useState, useEffect } from "react";
import i18n from "i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../config/firebase";
import { formatDateTimeSafe } from "../../utils/dateUtils";
import { getISOWeek, getYear } from "date-fns";
import LabMeasurementsView, { LabMeasurement } from "./LabMeasurementsView";
import InspectionLogView, { QcInspection } from "./InspectionLogView";
import QcSampleView from "../admin/QcSampleView";

type QCTab = "lab" | "inspection" | "sample";
type QCDataScope = "live" | "archive";
type QCMeasurementType = "ri" | "tg";

const getArchiveMonthKey = (dateLike: Date = new Date()) =>
  `${dateLike.getFullYear()}-${String(dateLike.getMonth() + 1).padStart(2, "0")}`;

const buildArchiveMonthOptions = (count = 18) => {
  const options: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = 0; index < count; index += 1) {
    options.push(getArchiveMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
};

const getQcCollectionPath = (
  kind: "qc_measurements" | "qc_inspections",
  scope: "live" | "archive",
  monthKey?: string,
  measurementType?: "ri" | "tg"
) => {
  if (scope === "live") {
    if (kind === "qc_measurements") {
      return `future-factory/production/qc_measurements/live/types/${measurementType || "ri"}/items`;
    }

    return `future-factory/production/qc_inspections`;
  }

  if (monthKey) {
    if (kind === "qc_measurements") {
      return `future-factory/production/archive/${kind}/${monthKey}/types/${measurementType || "misc"}/items`;
    }

    return `future-factory/production/archive/${kind}/${monthKey}/items`;
  }

  return `future-factory/production/${kind}`;
};

const parseMeasuredAtDate = (value: unknown): Date | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dutchPattern = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (dutchPattern) {
    const [, dd, mm, yyyy, hh = "00", min = "00"] = dutchPattern;
    const fallback = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
};

const QCHub = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<QCTab>("lab");
  const [dataScope, setDataScope] = useState<QCDataScope>("live");
  const [archiveMonthKey, setArchiveMonthKey] = useState(getArchiveMonthKey(new Date()));
  const [archiveMeasurementType, setArchiveMeasurementType] = useState<QCMeasurementType>("ri");
  const [measurements, setMeasurements] = useState<LabMeasurement[]>([]);
  const [inspections, setInspections] = useState<QcInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const archiveMonthOptions = buildArchiveMonthOptions();

  useEffect(() => {
    setLoading(true);

    const isArchiveView = dataScope === "archive";
    const inspectionPath = getQcCollectionPath("qc_inspections", dataScope, archiveMonthKey);
    const qInspections = isArchiveView
      ? query(collection(db, inspectionPath), orderBy("createdAt", "desc"))
      : query(collection(db, inspectionPath), orderBy("createdAt", "desc"), limit(100));

    let mLoaded = false;
    let iLoaded = false;
    const checkLoading = () => { if (mLoaded && iLoaded) setLoading(false); };

    const toMeasurement = (docSnap: any) => {
      const d = docSnap.data();
      const createdAtDate = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      const measuredAtDate = parseMeasuredAtDate(d.measuredAt);
      const dateObj = measuredAtDate || createdAtDate;
      return {
        id: docSnap.id,
        lotNumber: d.lotNumber || "-",
        resinBatch: d.resinBatch || "-",
        ri: d.ri ?? d.refractiveIndex ?? d.brix ?? 0,
        brix: d.brix || 0,
        tg: d.tg || 0,
        measuredAt: d.measuredAt || formatDateTimeSafe(d.createdAt) || "-",
        measuredBy: d.actorLabel || "-",
        week: !isNaN(dateObj.getTime()) ? getISOWeek(dateObj) : 0,
        year: !isNaN(dateObj.getTime()) ? getYear(dateObj) : 0,
        type: ((): "ri" | "tg" => {
          const rawType = String(d.type || d.measurementType || "").toLowerCase();
          if (rawType === "tg") return "tg";
          if (rawType === "ri" || rawType === "brix") return "ri";
          return (d.tg !== undefined && d.tg !== null) ? "tg" : "ri";
        })(),
        department: d.department,
        kitchen: d.kitchen,
        tapPoint: d.tapPoint,
        shift: d.shift,
        resinWeight: d.resinWeight,
        hardenerWeight: d.hardenerWeight,
        refractiveIndex: d.refractiveIndex,
        visualCheckOk: d.visualCheckOk,
        tableRef: d.tableRef,
        mixingRatio: d.mixingRatio,
        area: d.area,
        trackedProductPath: d.trackedProductPath || null,
      } as LabMeasurement;
    };

    const unsubI = onSnapshot(qInspections, (snap) => {
      setInspections(snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          lotNumber: d.lotNumber || "-",
          checkType: d.checkType || "-",
          result: d.result || "OK",
          note: d.note || "",
          createdAt: formatDateTimeSafe(d.createdAt) || "-",
          actorLabel: d.actorLabel || "-",
        } as QcInspection;
      }));
      iLoaded = true; checkLoading();
    }, (err) => { console.error(err); iLoaded = true; checkLoading(); });

    if (isArchiveView) {
      const measurementType = activeTab === "lab" ? archiveMeasurementType : "ri";
      const measurementPath = getQcCollectionPath("qc_measurements", dataScope, archiveMonthKey, measurementType);
      const unsubM = onSnapshot(
        query(collection(db, measurementPath), orderBy("createdAt", "desc")),
        (snap) => {
          setMeasurements(snap.docs.map(doc => toMeasurement(doc)));
          mLoaded = true;
          checkLoading();
        },
        (err) => { console.error(err); mLoaded = true; checkLoading(); }
      );

      return () => {
        unsubM();
        unsubI();
      };
    }

    const liveRiPath = getQcCollectionPath("qc_measurements", dataScope, undefined, "ri");
    const liveTgPath = getQcCollectionPath("qc_measurements", dataScope, undefined, "tg");
    const liveMeasurements = new Map<string, LabMeasurement>();
    let riLoaded = false;
    let tgLoaded = false;
    const syncLiveMeasurements = () => {
      setMeasurements(Array.from(liveMeasurements.values()));
      if (riLoaded && tgLoaded) {
        mLoaded = true;
        checkLoading();
      }
    };

    const unsubRi = onSnapshot(
      query(collection(db, liveRiPath), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        snap.docs.forEach((docSnap) => {
          liveMeasurements.set(docSnap.id, toMeasurement(docSnap));
        });
        riLoaded = true;
        syncLiveMeasurements();
      },
      (err) => { console.error(err); riLoaded = true; syncLiveMeasurements(); }
    );

    const unsubTg = onSnapshot(
      query(collection(db, liveTgPath), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        snap.docs.forEach((docSnap) => {
          liveMeasurements.set(docSnap.id, toMeasurement(docSnap));
        });
        tgLoaded = true;
        syncLiveMeasurements();
      },
      (err) => { console.error(err); tgLoaded = true; syncLiveMeasurements(); }
    );

    return () => {
      unsubRi();
      unsubTg();
      unsubI();
    };
  }, [activeTab, archiveMeasurementType, archiveMonthKey, dataScope]);

  return (
    <div className="h-full w-full bg-slate-50 overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => navigate("/planning", { state: { initialView: "QC" } })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Terug naar QC Stations
        </button>

        <header className="rounded-3xl bg-white border border-slate-200 p-6">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-900">
            QC Hub
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Aparte kwaliteitsmodule voor controles op geproduceerde producten, los van machineplanning.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setDataScope("live")}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  dataScope === "live" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Live maand
              </button>
              <button
                onClick={() => setDataScope("archive")}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  dataScope === "archive" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Archief
              </button>
            </div>

            {dataScope === "archive" && (
              <>
                <select
                  value={archiveMonthKey}
                  onChange={(e) => setArchiveMonthKey(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                >
                  {archiveMonthOptions.map((monthKey) => (
                    <option key={monthKey} value={monthKey}>
                      {monthKey}
                    </option>
                  ))}
                </select>

                <select
                  value={archiveMeasurementType}
                  onChange={(e) => setArchiveMeasurementType(e.target.value as QCMeasurementType)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                >
                  <option value="ri">Brekingsindex (RI)</option>
                  <option value="tg">Tg</option>
                </select>
              </>
            )}

            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {dataScope === "live"
                ? "Actieve maand in root-collectie"
                : `Archiefmaand ${archiveMonthKey} / ${archiveMeasurementType.toUpperCase()}`}
            </span>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setActiveTab("lab")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                activeTab === "lab"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Brekingsindex / Lab Metingen
            </button>
            <button
              onClick={() => setActiveTab("inspection")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                activeTab === "inspection"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Inspectielog
            </button>
            <button
              onClick={() => setActiveTab("sample")}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                activeTab === "sample"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              QC Steekproeven
            </button>
          </div>
        </header>

        <section className="rounded-3xl bg-white border border-slate-200 p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-4">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-bold uppercase tracking-widest">{i18n.t('common.loadingData', 'Data inladen...')}</p>
            </div>
          ) : activeTab === "lab" ? (
            <LabMeasurementsView
              measurements={measurements}
              readOnly={dataScope === "archive"}
              forcedTile={dataScope === "archive" ? archiveMeasurementType : undefined}
            />
          ) : activeTab === "inspection" ? (
            <InspectionLogView inspections={inspections} />
          ) : (
            <QcSampleView />
          )}
        </section>
      </div>
    </div>
  );
};

export default QCHub;
