// @ts-nocheck
import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Layers } from "lucide-react";

const OverproductionPanel = ({
  overproductionGroups,
  onOpenOverproductionGroup,
  resolveOverproductionRoute,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-4 shrink-0 rounded-[32px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2">
            <AlertTriangle size={14} /> {t("teamleader.overproduction", "Overproduction")}
          </p>
          <h3 className="text-lg font-black text-slate-900 italic mt-2">
            {t("teamleader.pending_extra_products", "Open pending extra products")}
          </h3>
          <p className="text-xs font-bold text-slate-500 mt-1">
            {t("teamleader.link_extras_help", "Koppel extras aan een nieuw LN-ordernummer en stuur ze direct door naar de juiste vervolgstap.")}
          </p>
        </div>
        <div className="px-3 py-2 rounded-2xl bg-white border border-amber-200 text-amber-700 text-sm font-black min-w-[3rem] text-center">
          {overproductionGroups.length}
        </div>
      </div>

      <div className="mt-4 space-y-3 max-h-[18rem] overflow-y-auto custom-scrollbar pr-1">
        {overproductionGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 px-4 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
            {t("teamleader.no_pending_overproduction", "Geen openstaande overproductie")}
          </div>
        ) : (
          overproductionGroups.map((group) => {
            const sampleRoute = resolveOverproductionRoute({ machine: group.originMachine, item: group.item }, group, "");
            return (
              <button
                key={group.key}
                onClick={() => onOpenOverproductionGroup(group)}
                className="w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50/40 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900">{group.originalOrderId}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                        {t("teamleader.extra_count", "{{count}} extra", { count: group.count })}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-600 mt-1 truncate">{group.item || "Onbekend product"}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">
                      Bron: {group.originMachine || "-"} · Route: {sampleRoute.station || "Handmatig"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-amber-600 font-black text-xs uppercase">
                    <Layers size={14} /> {group.lotNumbers.length}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OverproductionPanel;
