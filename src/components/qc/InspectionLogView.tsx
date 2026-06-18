import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CheckCircle2, XCircle } from "lucide-react";
import AddInspectionModal from "./AddInspectionModal";

export type QcInspection = {
  id: string;
  lotNumber: string;
  checkType: string;
  result: "OK" | "NOK";
  note?: string;
  createdAt: string;
  actorLabel: string;
};

const sampleInspections: QcInspection[] = [
  {
    id: "i-001",
    lotNumber: "LOT-240501",
    checkType: "Wanddikte",
    result: "OK",
    createdAt: "2026-05-22 08:30",
    actorLabel: "Inspector 1",
  },
  {
    id: "i-002",
    lotNumber: "LOT-240502",
    checkType: "Visueel",
    result: "NOK",
    note: "Krasjes op buitenzijde",
    createdAt: "2026-05-22 09:15",
    actorLabel: "Inspector 2",
  },
];

type InspectionLogViewProps = {
  inspections?: QcInspection[];
};

const InspectionLogView = ({ inspections = sampleInspections }: InspectionLogViewProps) => {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {t("qc.inspection_log_title", "QC Inspectielog")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t("qc.inspection_log_subtitle", "Overzicht van uitgevoerde visuele en fysieke controles op de vloer.")}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
        >
          <Plus size={16} />
          {t("qc.add_inspection", "Nieuwe Inspectie")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">{t("qc.lot", "Lot")}</th>
              <th className="px-4 py-3 text-left">{t("qc.check_type", "Type Controle")}</th>
              <th className="px-4 py-3 text-left">{t("qc.result", "Resultaat")}</th>
              <th className="px-4 py-3 text-left">{t("qc.note", "Notitie")}</th>
              <th className="px-4 py-3 text-left">{t("qc.inspected_at", "Datum")}</th>
              <th className="px-4 py-3 text-left">{t("qc.inspected_by", "Door")}</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-800">{row.lotNumber}</td>
                <td className="px-4 py-3 text-slate-700">{row.checkType}</td>
                <td className="px-4 py-3">
                  {row.result === "OK" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold uppercase tracking-wider">
                      <CheckCircle2 size={14} /> OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 rounded-md text-xs font-bold uppercase tracking-wider">
                      <XCircle size={14} /> NOK
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 italic max-w-[200px] truncate">
                  {row.note || "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.createdAt}</td>
                <td className="px-4 py-3 text-slate-700">{row.actorLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && <AddInspectionModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

export default InspectionLogView;
