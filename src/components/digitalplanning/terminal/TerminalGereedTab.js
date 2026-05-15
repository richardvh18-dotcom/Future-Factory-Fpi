import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
import { useTerminalGereedData } from "./useTerminalGereedData";
import TerminalGereedItemCard from "./TerminalGereedItemCard";
const TerminalGereedTab = ({ allTracked = [], stationId, effectiveStationId }) => {
    const { t } = useTranslation();
    const { gereedSearch, setGereedSearch, needle, filtered } = useTerminalGereedData({
        allTracked,
        stationId,
    });
    return (_jsxs("div", { className: "flex-1 flex flex-col overflow-hidden text-left", children: [_jsx("div", { className: "shrink-0 px-3 pt-3 pb-2 md:px-6 md:pt-5 md:pb-3 bg-slate-50 border-b border-slate-100", children: _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", value: gereedSearch, onChange: (e) => setGereedSearch(e.target.value), placeholder: t("digitalplanning.terminal.search_product_order_lot", "Zoek op product, order of lotnummer..."), className: "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300" }), gereedSearch && (_jsx("button", { onClick: () => setGereedSearch(""), className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none", children: "\u00D7" }))] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-4 flex flex-col gap-3", children: [_jsxs("div", { className: "text-xs font-bold uppercase tracking-wider text-slate-400", children: [filtered.length, " ", filtered.length === 1 ? t("digitalplanning.terminal.piece", "stuk") : t("digitalplanning.terminal.pieces", "stuks"), " ", t("digitalplanning.terminal.forwarded_from", "doorgezet vanaf"), " ", effectiveStationId] }), filtered.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500", children: needle
                            ? t("digitalplanning.terminal.no_results_for_search", "Geen resultaten voor deze zoekopdracht.")
                            : t("digitalplanning.terminal.no_ready_reports_for_station", "Nog geen gereedmeldingen gevonden voor dit station.") })) : (_jsx("div", { className: "space-y-3", children: filtered.slice(0, 200).map((item) => (_jsx(TerminalGereedItemCard, { item: item }, item.id || item.lotNumber))) }))] })] }));
};
export default TerminalGereedTab;
