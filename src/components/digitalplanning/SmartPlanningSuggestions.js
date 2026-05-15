import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { aiService } from "../../services/aiService";
export const SmartPlanningSuggestions = ({ orders, onOrderClick }) => {
    const [loading, setLoading] = useState(false);
    const [explanation, setExplanation] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const handleGenerateSuggestions = async () => {
        if (!orders || orders.length === 0)
            return;
        setLoading(true);
        try {
            // 1. Schaalbare wiskunde: laat de Cloud Function de top orders berekenen
            const functions = getFunctions();
            const calculateSuggestions = httpsCallable(functions, "calculateSmartSuggestions", { region: "europe-west1" });
            const result = await calculateSuggestions({ orders });
            const topOrders = result.data.topOrders || [];
            setSuggestions(topOrders);
            // 2. AI Analyse: Leg aan de Teamleider uit WAAROM
            const prompt = `
Je bent de productieplanner AI van FPi Future Factory.
Ik geef je de top ${topOrders.length} orders die prioriteit moeten krijgen op basis van ons algoritme.
Orders: ${JSON.stringify(topOrders.map((o) => ({
                OrderNummer: o.orderId,
                Score: o.score,
                Deadline: o.deliveryDate || o.plannedDate || "Onbekend",
            })))}

Geef een korte, professionele en menselijke verklaring (maximaal 2 of 3 zinnen) aan de teamleider waarom deze orders bovenaan staan. Focus op de deadlines (vrachtwagens). Gebruik geen markdown of opsommingstekens.
`;
            const aiResponse = await aiService.chat([{ role: "user", content: prompt }]);
            setExplanation(aiResponse);
        }
        catch (error) {
            console.error("Fout bij het genereren van AI suggesties:", error);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "bg-gradient-to-br from-indigo-50 to-purple-50 p-3 sm:p-4 rounded-2xl border border-indigo-100 shadow-sm mb-4 shrink-0", children: [_jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-base font-black text-indigo-950 flex items-center gap-2", children: [_jsx(BrainCircuit, { className: "w-4 h-4 text-indigo-500" }), "AI Planningsassistent"] }), _jsx("p", { className: "text-[10px] text-indigo-700/70 mt-0.5 font-medium", children: "Klantlevering t.o.v. voorraad" })] }), _jsx("button", { onClick: handleGenerateSuggestions, disabled: loading || orders.length === 0, className: "bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:shadow-none", children: loading ? _jsx(Loader2, { className: "w-3 h-3 animate-spin" }) : _jsxs(_Fragment, { children: [_jsx(Sparkles, { className: "w-3 h-3" }), " Genereer Voorstel"] }) })] }), explanation && (_jsxs("div", { className: "bg-white/80 p-3 rounded-xl border border-white shadow-sm mb-3 text-xs text-indigo-900 italic leading-relaxed", children: ["\"", explanation, "\""] })), suggestions.length > 0 && (_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-3", children: suggestions.map((order, index) => (_jsxs("div", { onClick: () => onOrderClick && onOrderClick(order), className: "bg-white p-2 rounded-xl border border-indigo-50 flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "bg-indigo-100 text-indigo-700 font-black w-6 h-6 rounded-lg flex items-center justify-center text-[10px]", children: index + 1 }), _jsxs("div", { children: [_jsx("p", { className: "font-bold text-slate-800 text-xs group-hover:text-indigo-700 transition-colors", children: order.orderId }), _jsxs("p", { className: "text-[9px] text-slate-400 font-mono", children: ["Score: ", order.score] })] })] }), _jsx(ArrowRight, { className: "w-3 h-3 text-slate-300 group-hover:text-indigo-500 transition-colors" })] }, order.id))) }))] }));
};
