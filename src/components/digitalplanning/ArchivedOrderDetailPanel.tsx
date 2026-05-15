// @ts-nocheck
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const ArchivedOrderDetailPanel = ({
  selectedSidebarEntry,
  onClose,
  onOpenArchivedLotDossier,
  onReopenArchivedOrderWithIncrease,
}) => {
  const { t } = useTranslation();
  const [increaseBy, setIncreaseBy] = useState("2");
  const [isReopening, setIsReopening] = useState(false);

  const handleReopen = async () => {
    if (!onReopenArchivedOrderWithIncrease || isReopening) return;
    const safeIncrease = Math.floor(Number(increaseBy));
    if (!Number.isFinite(safeIncrease) || safeIncrease <= 0) return;

    try {
      setIsReopening(true);
      await onReopenArchivedOrderWithIncrease({
        entry: selectedSidebarEntry,
        increaseBy: safeIncrease,
      });
    } finally {
      setIsReopening(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-8 lg:p-10 text-left overflow-y-auto">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
            {t("teamleader.history_archive", "History / Archief")}
          </p>
          <h3 className="text-2xl font-black text-slate-900 italic tracking-tight mt-1">
            {selectedSidebarEntry.orderId || selectedSidebarEntry.id || "-"}
          </h3>
          <p className="text-sm font-bold text-slate-500 mt-1">
            {selectedSidebarEntry.item || selectedSidebarEntry.itemDescription || "-"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
        >
          {t("common.close", "Sluiten")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t("digitalplanning.status", "Status")}
          </p>
          <p className="text-sm font-bold text-slate-800 mt-1">
            {t("teamleader.completed_archive", "Voltooid (Archief)")}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t("digitalplanning.machine", "Machine")}
          </p>
          <p className="text-sm font-bold text-slate-800 mt-1">
            {selectedSidebarEntry.machine || selectedSidebarEntry.originMachine || "-"}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Archief correctie
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Ophogen met
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={increaseBy}
              onChange={(e) => setIncreaseBy(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-bold text-slate-800"
            />
            <button
              onClick={handleReopen}
              disabled={isReopening || !onReopenArchivedOrderWithIncrease}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReopening ? "Bezig..." : "Terug naar planning"}
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            Hiermee wordt de order opgehoogd en direct opnieuw actief in de planning gezet.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t("bm01.lot_number", "Lotnummer")}s
          </p>
          {Array.isArray(selectedSidebarEntry.lotNumbers) && selectedSidebarEntry.lotNumbers.length > 0 ? (
            <div className="mt-2 space-y-2">
              {selectedSidebarEntry.lotNumbers.map((lot) => (
                <div key={lot} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                  <span className="text-sm font-bold text-slate-800 break-all">{lot}</span>
                  <button
                    onClick={() => onOpenArchivedLotDossier(lot)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                  >
                    {t("digitalplanning.order_detail.view_dossier", "Bekijk uitgebreid dossier")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
              <span className="text-sm font-bold text-slate-800 break-all">
                {selectedSidebarEntry.lotNumber || selectedSidebarEntry.lotNumbersText || "-"}
              </span>
              <button
                onClick={() => onOpenArchivedLotDossier(selectedSidebarEntry.lotNumber)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
              >
                {t("digitalplanning.order_detail.view_dossier", "Bekijk uitgebreid dossier")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchivedOrderDetailPanel;
