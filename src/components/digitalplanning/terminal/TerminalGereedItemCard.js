import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
import { getTrackedCompletionDate } from "../../../utils/trackingHelpers";
const TerminalGereedItemCard = ({ item }) => {
    const { t } = useTranslation();
    const productName = [item.item, item.itemDescription, item.description].map((s) => String(s || "").trim()).filter(Boolean)[0] ||
        t("digitalplanning.terminal.unknown_product", "Onbekend product");
    const productCode = String(item.itemCode || "").trim();
    const madeTs = getTrackedCompletionDate(item);
    const tsLabel = madeTs
        ? madeTs.toLocaleString("nl-NL", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        })
        : null;
    const stationNow = item.currentStation || "-";
    const stepNow = item.currentStep || "-";
    return (_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [_jsx("div", { className: "text-base font-black text-slate-900 leading-snug", children: productName }), productCode && _jsx("div", { className: "text-xs font-mono text-slate-400 mt-0.5 mb-2", children: productCode }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-3", children: [item.orderId && (_jsx("span", { className: "px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-xs font-black text-blue-700 uppercase tracking-wide", children: item.orderId })), item.lotNumber && (_jsx("span", { className: "px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-black text-slate-700 uppercase tracking-wide", children: item.lotNumber }))] }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2 mt-1", children: [_jsxs("span", { children: [t("digitalplanning.terminal.now_at", "Nu op"), ": ", _jsx("span", { className: "font-bold text-slate-700", children: stationNow }), " \u00B7 ", stepNow] }), tsLabel && (_jsxs("span", { className: "text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg", children: ["\u2713 ", tsLabel] }))] })] }, item.id || item.lotNumber));
};
export default TerminalGereedItemCard;
