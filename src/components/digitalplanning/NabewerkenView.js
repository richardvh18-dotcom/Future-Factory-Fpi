import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
// Eenvoudige lijstweergave voor Nabewerking-producten
const NabewerkenView = ({ producten }) => {
    const { t } = useTranslation();
    if (!producten || producten.length === 0) {
        return (_jsx("div", { className: "p-8 text-center text-gray-400 text-lg", children: t("digitalplanning.nabewerking.empty_view", "Geen producten voor Nabewerking gevonden.") }));
    }
    return (_jsx("div", { className: "p-4 overflow-auto h-full", children: _jsxs("table", { className: "min-w-full border text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-slate-100", children: [_jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_lot", "Lotnummer") }), _jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_order", "Order ID") }), _jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_item", "Item") }), _jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_status", "Status") }), _jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_step", "Stap") }), _jsx("th", { className: "px-2 py-1 border", children: t("digitalplanning.nabewerking.table_updated", "Laatste update") })] }) }), _jsx("tbody", { children: producten.map((p) => (_jsxs("tr", { className: "border-b hover:bg-slate-50", children: [_jsx("td", { className: "px-2 py-1 border", children: p.lotNumber }), _jsx("td", { className: "px-2 py-1 border", children: p.orderId }), _jsx("td", { className: "px-2 py-1 border", children: p.item || p.itemCode || p.productId }), _jsx("td", { className: "px-2 py-1 border", children: p.status }), _jsx("td", { className: "px-2 py-1 border", children: p.currentStep }), _jsx("td", { className: "px-2 py-1 border", children: p.updatedAt?.toDate ? p.updatedAt.toDate().toLocaleString() : '' })] }, p.id))) })] }) }));
};
export default NabewerkenView;
