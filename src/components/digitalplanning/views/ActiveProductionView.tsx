import React from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertOctagon,
  BellRing,
  Lightbulb,
  Repeat,
} from "lucide-react";
import {
  getMaterialInfo,
  isInspectionOverdue,
} from "../../../utils/workstationLogic";
import { formatDateTimeSafe, toDateSafe } from "../../../utils/dateUtils";

type AnyRecord = Record<string, any>;

type ActiveProductionViewProps = {
  activeUnits?: AnyRecord[];
  smartSuggestions?: AnyRecord[];
  selectedStation?: string;
  onProcessUnit: (...args: any[]) => void;
  onClickUnit: (unit: AnyRecord) => void;
};

const ActiveProductionView = ({
  activeUnits = [],
  smartSuggestions = [],
  selectedStation,
  onProcessUnit,
  onClickUnit,
}: ActiveProductionViewProps) => {
  const { t } = useTranslation();
  const isSeriesEligibleUnit = React.useCallback((unit: AnyRecord) => {
    const statusUpper = String(unit?.status || "").toUpperCase();
    const stepUpper = String(unit?.currentStep || "").toUpperCase();
    return statusUpper !== "REJECTED" && stepUpper !== "REJECTED";
  }, []);

  const getLotSeriesPrefix = React.useCallback((lotNumber: unknown) => {
    const raw = String(lotNumber || "").trim();
    if (!raw) return "";
    const match = raw.match(/^(.*?)(\d{3,4})$/);
    if (!match) return "";
    return match[1];
  }, []);

  const resolveSeriesGroupKey = React.useCallback((unit: AnyRecord) => {
    const explicitGroupId = String(unit?.seriesGroupId || "").trim();
    if (explicitGroupId) return explicitGroupId;
    if (!isSeriesEligibleUnit(unit)) return "";

    const lotPrefix = getLotSeriesPrefix(unit?.lotNumber);
    if (!lotPrefix) return "";

    const orderKey = String(unit?.orderId || "").trim().toUpperCase() || "-";
    const itemKey = String(unit?.itemCode || unit?.item || "").trim().toUpperCase() || "-";
    return `legacy_${orderKey}_${itemKey}_${lotPrefix}`;
  }, [getLotSeriesPrefix, isSeriesEligibleUnit]);

  const isMazakStation =
    String(selectedStation || "").toUpperCase().replace(/\s/g, "") === "MAZAK";

  const groupedSeries = React.useMemo(() => {
    if (isMazakStation) return new Map<string, AnyRecord[]>();
    const grouped = new Map<string, AnyRecord[]>();
    (activeUnits || []).forEach((unit: AnyRecord) => {
      const groupId = resolveSeriesGroupKey(unit);
      if (!groupId) return;
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      const group = grouped.get(groupId);
      if (group) group.push(unit);
    });
    return grouped;
  }, [activeUnits, isMazakStation, resolveSeriesGroupKey]);

  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      groupedSeries.forEach((group, groupId) => {
        if (group.length <= 1) return;
        if (!(groupId in next)) next[groupId] = false;
      });

      Object.keys(next).forEach((groupId) => {
        if (!groupedSeries.has(groupId) || (groupedSeries.get(groupId)?.length || 0) <= 1) {
          delete next[groupId];
        }
      });

      return next;
    });
  }, [groupedSeries]);

  const displayUnits = React.useMemo(() => {
    if (!Array.isArray(activeUnits) || activeUnits.length === 0) return [];

    const renderedHeaders = new Set<string>();
    const rows: AnyRecord[] = [];

    activeUnits.forEach((unit: AnyRecord) => {
      const groupId = resolveSeriesGroupKey(unit);
      const group = groupId ? groupedSeries.get(groupId) || [] : [];
      const isSeriesGroup = groupId && group.length > 1;

      if (isSeriesGroup && !renderedHeaders.has(groupId)) {
        const first = group[0] || unit || {};
        rows.push({
          id: `series_header_${groupId}`,
          lotNumber: first.orderId || first.seriesOrderNumber || "SERIE",
          item: `Serie ${group.length} stuks`,
          orderId: first.orderId || "-",
          isSeriesHeader: true,
          seriesGroupId: groupId,
          seriesUnits: group,
          seriesCount: group.length,
        });
        renderedHeaders.add(groupId);
      }

      if (!isSeriesGroup || !collapsedGroups[String(groupId)]) {
        rows.push(unit);
      }
    });

    return rows;
  }, [activeUnits, groupedSeries, collapsedGroups, resolveSeriesGroupKey]);

  const formatTimeLabel = (value: any) => {
    const date = toDateSafe(value);
    if (!date) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Alleen tonen als we NIET op BM01 zitten (die heeft een andere view)
  if (selectedStation === "BM01" || selectedStation === "Station BM01")
    return null;

  return (
    <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 pb-20 md:pb-24">
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between">
          <h3 className="font-black text-blue-800 text-sm uppercase tracking-tight flex items-center gap-2">
            <Activity size={16} /> {t("digitalplanning.active_production.active_now", "Active Now")}
          </h3>
          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {activeUnits.length}
          </span>
        </div>
        <div className="p-2 pb-6 md:pb-8">
          {activeUnits.length > 0 ? (
            <div className="space-y-2">
              {displayUnits.map((unit: AnyRecord) => {
                if (unit.isSeriesHeader) {
                  const groupUnits = unit.seriesUnits || [];
                  const isCollapsed = !!collapsedGroups[unit.seriesGroupId];
                  const processableUnits = groupUnits.filter(
                    (groupUnit: AnyRecord) => !["Finished", "REJECTED"].includes(groupUnit?.currentStep)
                  );
                  const lotLabels = groupUnits
                    .map((groupUnit: AnyRecord) => String(groupUnit?.lotNumber || groupUnit?.id || "").trim())
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <div
                      key={unit.id}
                      className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{t("digitalplanning.active_production.order_row", "Order Row")}</p>
                          <p className="text-sm font-black text-indigo-900 mt-1">{unit.orderId}</p>
                          <p className="text-[10px] text-indigo-700 font-bold mt-1">{unit.item}</p>
                          {lotLabels && (
                            <p className="text-[10px] text-indigo-600 font-bold mt-1 uppercase tracking-wide">
                              {t("digitalplanning.active_production.series_lots", "Lots")} {lotLabels}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setCollapsedGroups((prev) => ({
                              ...prev,
                              [unit.seriesGroupId]: !prev[unit.seriesGroupId],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700"
                        >
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          {isCollapsed
                            ? t("digitalplanning.terminal.expand", "Expand")
                            : t("digitalplanning.terminal.collapse", "Collapse")}
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            if (processableUnits.length === 0) return;
                            onProcessUnit(processableUnits[0], {
                              bulkUnits: processableUnits,
                              source: "series_header",
                            });
                          }}
                          disabled={processableUnits.length === 0}
                          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2"
                        >
                          <ArrowRight size={14} /> {t("digitalplanning.active_production.series_ready", "Series ready", { count: processableUnits.length })} ({processableUnits.length}x)
                        </button>
                      </div>
                    </div>
                  );
                }

                const matInfo = getMaterialInfo(unit.item) as any;
                const isTempReject =
                  unit.inspection?.status === "Tijdelijke afkeur";
                const isOverdue =
                  isTempReject &&
                  isInspectionOverdue(unit.inspection?.timestamp);

                return (
                  <div
                    key={unit.id || unit.lotNumber}
                    onClick={() => onClickUnit(unit)}
                    className={`p-3 bg-white border rounded-xl shadow-sm flex flex-col gap-2 cursor-pointer transition-all hover:shadow-md ${
                      isTempReject
                        ? "border-orange-200 bg-orange-50"
                        : "border-blue-50"
                    }`}
                  >
                    {matInfo.warning && (
                      <div
                        className={`mb-2 p-1.5 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wide animate-pulse ${matInfo.colorClasses}`}
                      >
                        {matInfo.icon} {matInfo.warning}
                      </div>
                    )}

                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-black text-gray-800">
                          {unit.lotNumber}
                        </p>
                        {unit.orderId === "NOG_TE_BEPALEN" && (
                          <span className="bg-red-100 text-red-600 px-1 py-0.5 rounded text-[8px] font-black mr-2">
                            {t("digitalplanning.active_production.extra", "EXTRA")}
                          </span>
                        )}
                        {matInfo.type !== "EST" && (
                          <div
                            className={`mt-1 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit ${matInfo.colorClasses}`}
                          >
                            {matInfo.icon}
                            {matInfo.label}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-500 truncate max-w-[150px] mt-0.5">
                          {unit.item}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                        {formatTimeLabel(unit.startTime)}
                      </span>
                    </div>

                    {isTempReject && unit.inspection && (
                      <div className="bg-white/60 p-2 rounded-lg text-[10px] border border-orange-100">
                        <p className="font-bold text-orange-700 flex items-center gap-1">
                          <AlertTriangle size={10} /> {t("digitalplanning.active_production.temporary_reject", "Temporary Rejection")}
                        </p>
                        {unit.inspection.reasons && (
                          <p className="text-orange-600 mt-1">
                            {t("digitalplanning.active_production.reason", "Reason")}: {unit.inspection.reasons.join(", ")}
                          </p>
                        )}
                        {unit.note && (
                          <p className="text-gray-500 italic mt-1">
                            "{unit.note}"
                          </p>
                        )}
                        <p className="text-gray-400 mt-1 text-[9px]">
                          {formatDateTimeSafe(
                            unit.inspection.timestamp,
                            "nl-NL",
                            undefined,
                            ""
                          )}
                        </p>

                        {isOverdue && (
                          <div className="mt-2 flex items-center justify-between bg-red-100 p-2 rounded border border-red-200">
                            <span className="font-black text-red-700 flex items-center gap-1">
                              <AlertOctagon size={14} /> &gt; 7 DAGEN!
                            </span>
                            {unit.reminderSent ? (
                              <span className="text-[9px] text-gray-500 italic flex items-center gap-1">
                                <BellRing size={10} /> {t("digitalplanning.active_production.reminder_sent", "Reminder sent")}
                              </span>
                            ) : (
                              <span className="text-[9px] text-red-400 italic">
                                {t("digitalplanning.active_production.sending", "Sending...")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onProcessUnit(unit);
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2"
                      >
                        <ArrowRight size={14} /> {t("digitalplanning.active_production.ready_continue", "Ready / Continue")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-blue-300">
              <Zap size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-[10px] font-bold uppercase">{t("digitalplanning.active_production.no_activity", "No activity")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Smart Suggestions */}
      {smartSuggestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-500">
          <div className="bg-purple-50/50 p-4 border-b border-purple-100">
            <h3 className="font-black text-purple-800 text-sm uppercase tracking-tight flex items-center gap-2">
              <Lightbulb size={16} /> {t("digitalplanning.active_production.smart_suggestions", "Smart Suggestions")}
            </h3>
          </div>
          <div className="p-3 space-y-3">
            {smartSuggestions.map((sug: AnyRecord, idx: number) => (
              <div
                key={idx}
                className="bg-purple-50 rounded-xl p-3 border border-purple-100"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white rounded-lg text-purple-600 shadow-sm">
                    <Repeat size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-purple-900 leading-tight mb-1">
                      {t("digitalplanning.active_production.combine_orders", "Combine Orders?")}
                    </p>
                    <p className="text-[10px] text-purple-700 mb-2">
                      {t("digitalplanning.active_production.combine_orders_help", "Product {{product}} appears {{count}}x in week {{weeks}}.", {
                        product: sug.product,
                        count: sug.count,
                        weeks: sug.weeks.join(" & "),
                      })}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sug.orders.map((o: AnyRecord) => (
                        <span
                          key={o.orderId}
                          className="px-1.5 py-0.5 bg-white rounded text-[9px] font-mono font-bold text-purple-500 border border-purple-100"
                        >
                          {o.orderId} (W{o.weekNumber})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveProductionView;
