import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import React from "react";
import { useTranslation } from "react-i18next";
import { Activity, Zap, ArrowRight, ChevronDown, ChevronRight, AlertTriangle, AlertOctagon, BellRing, Lightbulb, Repeat, } from "lucide-react";
import { getMaterialInfo, isInspectionOverdue, } from "../../../utils/workstationLogic";
import { formatDateTimeSafe, toDateSafe } from "../../../utils/dateUtils";
const ActiveProductionView = ({ activeUnits, smartSuggestions, selectedStation, onProcessUnit, onClickUnit, }) => {
    const { t } = useTranslation();
    const isMazakStation = String(selectedStation || "").toUpperCase().replace(/\s/g, "") === "MAZAK";
    const groupedSeries = React.useMemo(() => {
        if (isMazakStation)
            return new Map();
        const grouped = new Map();
        (activeUnits || []).forEach((unit) => {
            const groupId = unit?.seriesGroupId;
            if (!groupId)
                return;
            if (!grouped.has(groupId))
                grouped.set(groupId, []);
            grouped.get(groupId).push(unit);
        });
        return grouped;
    }, [activeUnits, isMazakStation]);
    const [collapsedGroups, setCollapsedGroups] = React.useState({});
    React.useEffect(() => {
        setCollapsedGroups((prev) => {
            const next = { ...prev };
            groupedSeries.forEach((group, groupId) => {
                if (group.length <= 1)
                    return;
                if (!(groupId in next))
                    next[groupId] = true;
            });
            Object.keys(next).forEach((groupId) => {
                if (!groupedSeries.has(groupId) || groupedSeries.get(groupId).length <= 1) {
                    delete next[groupId];
                }
            });
            return next;
        });
    }, [groupedSeries]);
    const displayUnits = React.useMemo(() => {
        if (!Array.isArray(activeUnits) || activeUnits.length === 0)
            return [];
        const renderedHeaders = new Set();
        const rows = [];
        activeUnits.forEach((unit) => {
            const groupId = unit?.seriesGroupId;
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
            if (!isSeriesGroup || !collapsedGroups[groupId]) {
                rows.push(unit);
            }
        });
        return rows;
    }, [activeUnits, groupedSeries, collapsedGroups]);
    const formatTimeLabel = (value) => {
        const date = toDateSafe(value);
        if (!date)
            return "";
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };
    // Alleen tonen als we NIET op BM01 zitten (die heeft een andere view)
    if (selectedStation === "BM01" || selectedStation === "Station BM01")
        return null;
    return (_jsxs("div", { className: "col-span-12 lg:col-span-4 flex flex-col gap-6 pb-20 md:pb-24", children: [_jsxs("div", { className: "bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden", children: [_jsxs("div", { className: "bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between", children: [_jsxs("h3", { className: "font-black text-blue-800 text-sm uppercase tracking-tight flex items-center gap-2", children: [_jsx(Activity, { size: 16 }), " ", t("digitalplanning.active_production.active_now", "Active Now")] }), _jsx("span", { className: "bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full", children: activeUnits.length })] }), _jsx("div", { className: "p-2 pb-6 md:pb-8", children: activeUnits.length > 0 ? (_jsx("div", { className: "space-y-2", children: displayUnits.map((unit) => {
                                if (unit.isSeriesHeader) {
                                    const groupUnits = unit.seriesUnits || [];
                                    const isCollapsed = !!collapsedGroups[unit.seriesGroupId];
                                    const processableUnits = groupUnits.filter((groupUnit) => !["Finished", "REJECTED"].includes(groupUnit?.currentStep));
                                    return (_jsxs("div", { className: "p-3 bg-indigo-50 border border-indigo-200 rounded-xl shadow-sm", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-indigo-600", children: t("digitalplanning.active_production.order_row", "Order Row") }), _jsx("p", { className: "text-sm font-black text-indigo-900 mt-1", children: unit.orderId }), _jsx("p", { className: "text-[10px] text-indigo-700 font-bold mt-1", children: unit.item })] }), _jsxs("button", { onClick: () => setCollapsedGroups((prev) => ({
                                                            ...prev,
                                                            [unit.seriesGroupId]: !prev[unit.seriesGroupId],
                                                        })), className: "inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700", children: [isCollapsed ? _jsx(ChevronRight, { size: 12 }) : _jsx(ChevronDown, { size: 12 }), isCollapsed
                                                                ? t("digitalplanning.terminal.expand", "Expand")
                                                                : t("digitalplanning.terminal.collapse", "Collapse")] })] }), _jsx("div", { className: "mt-3 flex gap-2", children: _jsxs("button", { onClick: () => {
                                                        if (processableUnits.length === 0)
                                                            return;
                                                        onProcessUnit(processableUnits[0], {
                                                            bulkUnits: processableUnits,
                                                            source: "series_header",
                                                        });
                                                    }, disabled: processableUnits.length === 0, className: "flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2", children: [_jsx(ArrowRight, { size: 14 }), " ", t("digitalplanning.active_production.series_ready", "Series ready", { count: processableUnits.length }), " (", processableUnits.length, "x)"] }) })] }, unit.id));
                                }
                                const matInfo = getMaterialInfo(unit.item);
                                const isTempReject = unit.inspection?.status === "Tijdelijke afkeur";
                                const isOverdue = isTempReject &&
                                    isInspectionOverdue(unit.inspection?.timestamp);
                                return (_jsxs("div", { onClick: () => onClickUnit(unit), className: `p-3 bg-white border rounded-xl shadow-sm flex flex-col gap-2 cursor-pointer transition-all hover:shadow-md ${isTempReject
                                        ? "border-orange-200 bg-orange-50"
                                        : "border-blue-50"}`, children: [matInfo.warning && (_jsxs("div", { className: `mb-2 p-1.5 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wide animate-pulse ${matInfo.colorClasses}`, children: [matInfo.icon, " ", matInfo.warning] })), _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-black text-gray-800", children: unit.lotNumber }), unit.orderId === "NOG_TE_BEPALEN" && (_jsx("span", { className: "bg-red-100 text-red-600 px-1 py-0.5 rounded text-[8px] font-black mr-2", children: t("digitalplanning.active_production.extra", "EXTRA") })), matInfo.type !== "EST" && (_jsxs("div", { className: `mt-1 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit ${matInfo.colorClasses}`, children: [matInfo.icon, matInfo.label] })), _jsx("p", { className: "text-[10px] text-gray-500 truncate max-w-[150px] mt-0.5", children: unit.item })] }), _jsx("span", { className: "text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded", children: formatTimeLabel(unit.startTime) })] }), isTempReject && unit.inspection && (_jsxs("div", { className: "bg-white/60 p-2 rounded-lg text-[10px] border border-orange-100", children: [_jsxs("p", { className: "font-bold text-orange-700 flex items-center gap-1", children: [_jsx(AlertTriangle, { size: 10 }), " ", t("digitalplanning.active_production.temporary_reject", "Temporary Rejection")] }), unit.inspection.reasons && (_jsxs("p", { className: "text-orange-600 mt-1", children: [t("digitalplanning.active_production.reason", "Reason"), ": ", unit.inspection.reasons.join(", ")] })), unit.note && (_jsxs("p", { className: "text-gray-500 italic mt-1", children: ["\"", unit.note, "\""] })), _jsx("p", { className: "text-gray-400 mt-1 text-[9px]", children: formatDateTimeSafe(unit.inspection.timestamp, "nl-NL", undefined, "") }), isOverdue && (_jsxs("div", { className: "mt-2 flex items-center justify-between bg-red-100 p-2 rounded border border-red-200", children: [_jsxs("span", { className: "font-black text-red-700 flex items-center gap-1", children: [_jsx(AlertOctagon, { size: 14 }), " > 7 DAGEN!"] }), unit.reminderSent ? (_jsxs("span", { className: "text-[9px] text-gray-500 italic flex items-center gap-1", children: [_jsx(BellRing, { size: 10 }), " ", t("digitalplanning.active_production.reminder_sent", "Reminder sent")] })) : (_jsx("span", { className: "text-[9px] text-red-400 italic", children: t("digitalplanning.active_production.sending", "Sending...") }))] }))] })), _jsx("div", { className: "flex gap-2 mt-2 pt-2 border-t border-slate-100", children: _jsxs("button", { onClick: (e) => {
                                                    e.stopPropagation();
                                                    onProcessUnit(unit);
                                                }, className: "flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2", children: [_jsx(ArrowRight, { size: 14 }), " ", t("digitalplanning.active_production.ready_continue", "Ready / Continue")] }) })] }, unit.id || unit.lotNumber));
                            }) })) : (_jsxs("div", { className: "text-center py-8 text-blue-300", children: [_jsx(Zap, { size: 24, className: "mx-auto mb-2 opacity-50" }), _jsx("p", { className: "text-[10px] font-bold uppercase", children: t("digitalplanning.active_production.no_activity", "No activity") })] })) })] }), smartSuggestions.length > 0 && (_jsxs("div", { className: "bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-500", children: [_jsx("div", { className: "bg-purple-50/50 p-4 border-b border-purple-100", children: _jsxs("h3", { className: "font-black text-purple-800 text-sm uppercase tracking-tight flex items-center gap-2", children: [_jsx(Lightbulb, { size: 16 }), " ", t("digitalplanning.active_production.smart_suggestions", "Smart Suggestions")] }) }), _jsx("div", { className: "p-3 space-y-3", children: smartSuggestions.map((sug, idx) => (_jsx("div", { className: "bg-purple-50 rounded-xl p-3 border border-purple-100", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "p-2 bg-white rounded-lg text-purple-600 shadow-sm", children: _jsx(Repeat, { size: 16 }) }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold text-purple-900 leading-tight mb-1", children: t("digitalplanning.active_production.combine_orders", "Combine Orders?") }), _jsx("p", { className: "text-[10px] text-purple-700 mb-2", children: t("digitalplanning.active_production.combine_orders_help", "Product {{product}} appears {{count}}x in week {{weeks}}.", {
                                                    product: sug.product,
                                                    count: sug.count,
                                                    weeks: sug.weeks.join(" & "),
                                                }) }), _jsx("div", { className: "flex flex-wrap gap-1", children: sug.orders.map((o) => (_jsxs("span", { className: "px-1.5 py-0.5 bg-white rounded text-[9px] font-mono font-bold text-purple-500 border border-purple-100", children: [o.orderId, " (W", o.weekNumber, ")"] }, o.orderId))) })] })] }) }, idx))) })] }))] }));
};
export default ActiveProductionView;
