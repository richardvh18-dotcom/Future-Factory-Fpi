import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useTranslation } from "react-i18next";
import { AlertOctagon } from "lucide-react";
/**
 * RejectionAnalysisTile
 * Toont een visuele analyse van de afkeurredenen op het dashboard.
 */
const RejectionAnalysisTile = React.memo(({ products = [] }) => {
    const { t } = useTranslation();
    // 1. Filter alle afgekeurde producten (Veilige check op array)
    const rejected = Array.isArray(products)
        ? products.filter((p) => p.currentStep === "REJECTED" || p.status === "rejected" || p.status === "Afkeur" || p.status === "REJECTED")
        : [];
    // 2. Groepeer op reden
    const reasons = rejected.reduce((acc, curr) => {
        const reason = curr.rejectionReason || t('rejection.unknown');
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
    }, {});
    // 3. Sorteer en pak top 3
    const sortedReasons = Object.entries(reasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
    const totalRejected = rejected.length;
    return (_jsxs("div", { className: "bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm col-span-1 md:col-span-2 hover:border-rose-300 transition-colors text-left", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsxs("h4", { className: "text-sm font-black uppercase text-slate-800 flex items-center gap-2", children: [_jsx(AlertOctagon, { size: 18, className: "text-rose-500" }), " ", t('rejection.title')] }), _jsxs("span", { className: "text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100", children: [totalRejected, " ", t('rejection.total')] })] }), _jsx("div", { className: "space-y-4", children: sortedReasons.length > 0 ? (sortedReasons.map(([reason, count]) => {
                    const percentage = totalRejected > 0 ? Math.round((count / totalRejected) * 100) : 0;
                    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between text-[10px] font-black uppercase mb-1.5", children: [_jsx("span", { className: "text-slate-600", children: reason }), _jsxs("span", { className: "text-slate-400", children: [count, " ", t('rejection.pcs'), " (", percentage, "%)"] })] }), _jsx("div", { className: "h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner", children: _jsx("div", { className: "h-full bg-rose-500 rounded-full shadow-sm transition-all duration-1000", style: { width: `${percentage}%` } }) })] }, reason));
                })) : (_jsxs("div", { className: "flex flex-col items-center justify-center py-6 text-slate-300", children: [_jsx(AlertOctagon, { size: 32, className: "mb-2 opacity-50" }), _jsx("p", { className: "text-[10px] font-bold uppercase tracking-widest", children: t('rejection.no_data') })] })) })] }));
});
export default RejectionAnalysisTile;
