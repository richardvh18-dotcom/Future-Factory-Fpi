import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { Layers, Zap, CheckCircle2, AlertOctagon, Star, Users, Cpu, Clock, AlertTriangle, Activity, } from "lucide-react";
const TeamleaderDashboard = ({ metrics, onKpiClick, onStationSelect }) => {
    const [planningKpiMode, setPlanningKpiMode] = useState("products");
    const planningProducts = Number(metrics.totalPlanned || 0);
    const planningOrders = Number(metrics.plannedOrdersCount || 0);
    const planningValue = planningKpiMode === "orders" ? planningOrders : planningProducts;
    return (_jsxs("div", { className: "h-full overflow-y-auto custom-scrollbar space-y-8 pr-2 pb-20", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-3", children: "Productie KPI's" }), _jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3", children: [
                            {
                                id: "gepland",
                                label: "Planning",
                                val: Math.round(planningValue),
                                valueSuffix: planningKpiMode === "orders" ? "Orders" : "Producten",
                                icon: Layers,
                                color: "text-blue-600",
                            },
                            {
                                id: "in_proces",
                                label: "Lopend",
                                val: metrics.activeCount,
                                icon: Zap,
                                color: "text-purple-600",
                            },
                            {
                                id: "gereed",
                                label: "Gereed",
                                val: metrics.finishedCount,
                                icon: CheckCircle2,
                                color: "text-emerald-500",
                            },
                            {
                                id: "afkeur",
                                label: "Afkeur",
                                val: metrics.rejectedCount,
                                icon: AlertOctagon,
                                color: "text-rose-500",
                            },
                            {
                                id: "tijdelijk_afkeur",
                                label: "Tijdelijk Afkeur",
                                val: metrics.tempRejectedCount || 0,
                                icon: AlertTriangle,
                                color: "text-orange-500",
                            },
                            {
                                id: "prioriteit",
                                label: "Prioriteit",
                                val: metrics.priorityCount || 0,
                                icon: Star,
                                color: "text-amber-500",
                            },
                            {
                                id: "geleverd_mismatch",
                                label: "LN vs FF",
                                val: metrics.deliveryInspectionMismatchCount || 0,
                                icon: AlertTriangle,
                                color: "text-rose-600",
                            },
                            {
                                id: "geleverd_mismatch_plus",
                                label: "LN > FF",
                                val: metrics.deliveryInspectionOverCount || 0,
                                icon: AlertTriangle,
                                color: "text-orange-600",
                            },
                            {
                                id: "geleverd_mismatch_min",
                                label: "LN < FF",
                                val: metrics.deliveryInspectionUnderCount || 0,
                                icon: AlertTriangle,
                                color: "text-amber-700",
                            },
                        ].map((item) => (_jsxs("div", { className: "bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-blue-300 transition-all cursor-pointer", onClick: () => onKpiClick(item.id, item.label), children: [_jsxs("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2", children: [_jsx(item.icon, { size: 14, className: item.color }), " ", item.label] }), _jsx("p", { className: "text-2xl font-black text-slate-800 italic", children: item.val }), item.id === "gepland" && (_jsx("div", { className: "mt-2 flex items-center justify-between", children: _jsxs("button", { type: "button", onClick: (e) => {
                                            e.stopPropagation();
                                            setPlanningKpiMode((prev) => (prev === "products" ? "orders" : "products"));
                                        }, className: "text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700", children: ["Switch: ", item.valueSuffix] }) }))] }, item.id))) })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-3", children: "Personeel & Uren" }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3", children: [_jsxs("div", { className: "bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-indigo-300 transition-all cursor-pointer", onClick: () => onKpiClick("bezetting", "Uren"), children: [_jsxs("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2", children: [_jsx(Clock, { size: 14, className: "text-indigo-500" }), " ", "Man-uren"] }), _jsxs("p", { className: "text-2xl font-black text-slate-800 italic", children: [metrics.bezettingAantal ? metrics.bezettingAantal.toFixed(1) : "0.0", " ", _jsx("span", { className: "text-xs text-slate-400 not-italic", children: "u" })] }), _jsxs("div", { className: "flex justify-between items-center mt-1 pt-1 border-t border-slate-100", children: [_jsx("p", { className: "text-[8px] font-bold text-slate-400 uppercase", children: "Vandaag" }), _jsxs("p", { className: "text-[9px] font-bold text-indigo-600 uppercase", children: ["Week: ", metrics.weeklyTotalHours?.toFixed(1) || "0.0", "u"] })] })] }), _jsxs("div", { className: "bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-emerald-300 transition-all cursor-pointer", children: [_jsxs("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2", children: [_jsx(Cpu, { size: 14, className: "text-emerald-500" }), " ", "BH Stations"] }), _jsxs("p", { className: "text-2xl font-black text-slate-800 italic", children: [metrics.productionHours ? metrics.productionHours.toFixed(1) : "0.0", " ", _jsx("span", { className: "text-xs text-slate-400 not-italic", children: "u" })] }), _jsxs("div", { className: "flex justify-between items-center mt-1 pt-1 border-t border-slate-100", children: [_jsx("p", { className: "text-[8px] font-bold text-slate-400 uppercase", children: "Vandaag" }), _jsxs("p", { className: "text-[9px] font-bold text-emerald-600 uppercase", children: ["Week: ", metrics.weeklyProductionHours?.toFixed(1) || "0.0", "u"] })] })] }), _jsxs("div", { className: "bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-blue-300 transition-all cursor-pointer", children: [_jsxs("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2", children: [_jsx(Users, { size: 14, className: "text-blue-500" }), " ", "Overig"] }), _jsxs("p", { className: "text-2xl font-black text-slate-800 italic", children: [metrics.supportHours ? metrics.supportHours.toFixed(1) : "0.0", " ", _jsx("span", { className: "text-xs text-slate-400 not-italic", children: "u" })] }), _jsxs("div", { className: "flex justify-between items-center mt-1 pt-1 border-t border-slate-100", children: [_jsx("p", { className: "text-[8px] font-bold text-slate-400 uppercase", children: "Vandaag" }), _jsxs("p", { className: "text-[9px] font-bold text-blue-600 uppercase", children: ["Week: ", metrics.weeklySupportHours?.toFixed(1) || "0.0", "u"] })] })] }), _jsxs("div", { className: "bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-purple-300 transition-all cursor-pointer", children: [_jsxs("p", { className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2", children: [_jsx(Activity, { size: 14, className: "text-purple-500" }), " ", "Efficiency"] }), _jsxs("p", { className: "text-2xl font-black text-slate-800 italic", children: [metrics.efficiency ? metrics.efficiency.toFixed(0) : "0", "%"] }), _jsxs("div", { className: "flex justify-between items-center mt-1 pt-1 border-t border-slate-100", children: [_jsx("p", { className: "text-[8px] font-bold text-slate-400 uppercase", children: "Vandaag" }), _jsxs("p", { className: "text-[9px] font-bold text-purple-600 uppercase", children: ["Week: ", metrics.weeklyEfficiency?.toFixed(0) || "0", "%"] })] })] })] })] }), _jsxs("div", { className: "space-y-4", children: [_jsx("h3", { className: "text-xs font-black text-slate-400 uppercase tracking-widest ml-1", children: "Live Station Monitor" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3", children: metrics.machineGridData.map((machine) => (_jsxs("div", { onClick: () => onStationSelect(machine.id), className: "bg-white border border-slate-200 rounded-[25px] p-4 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group relative overflow-hidden text-left", children: [_jsx("div", { className: "absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity", children: _jsx(Cpu, { size: 60 }) }), _jsxs("div", { className: "text-left mb-3", children: [_jsx("span", { className: "text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5", children: "Station" }), _jsx("h4", { className: "text-lg font-black text-slate-900 tracking-tighter uppercase italic truncate", children: machine.id }), machine.operatorNames ? (_jsxs("div", { className: "mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg w-fit border border-slate-100", children: [_jsx(Users, { size: 10, className: "text-blue-500" }), _jsx("span", { className: "truncate max-w-[120px]", children: machine.operatorNames })] })) : (_jsx("div", { className: "mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-slate-300 px-2 py-1", children: _jsx("span", { className: "italic", children: "Geen operator" }) }))] }), !machine.isAlgemeen && (_jsxs(_Fragment, { children: [_jsxs("div", { className: `grid ${machine.isDownstream ? "grid-cols-2" : "grid-cols-3"} gap-2 pt-3 border-t border-slate-50`, children: [!machine.isDownstream && (_jsxs("div", { children: [_jsx("span", { className: "text-[7px] font-black text-slate-400 uppercase block mb-0.5", children: "Plan" }), _jsx("span", { className: "text-xs font-black text-slate-700 italic", children: Math.round(machine.planned) })] })), _jsxs("div", { children: [_jsx("span", { className: `text-[7px] font-black uppercase block mb-0.5 ${machine.isDownstream ? "text-purple-400" : "text-blue-400"}`, children: machine.isDownstream ? "Aanbod" : "Actief" }), _jsx("span", { className: `text-xs font-black italic ${machine.isDownstream ? "text-purple-600" : "text-blue-600"}`, children: machine.active })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[7px] font-black text-emerald-400 uppercase block mb-0.5", children: machine.isDownstream ? "Gereed" : "Klaar" }), _jsx("span", { className: "text-xs font-black text-emerald-600 italic", children: machine.finished })] })] }), _jsxs("div", { className: "flex justify-between items-center mt-3 pt-2 border-t border-slate-50", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[7px] font-black text-slate-400 uppercase block", children: "Plan Uren" }), _jsxs("span", { className: "text-[10px] font-bold text-slate-600", children: [machine.plannedHours?.toFixed(1) || "0.0", "u"] })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "text-[7px] font-black text-indigo-400 uppercase block", children: "Gew. Uren (Week)" }), _jsxs("span", { className: "text-[10px] font-bold text-indigo-600", children: [machine.workedHoursThisWeek?.toFixed(1) || "0.0", "u"] })] })] })] }))] }, machine.id))) })] })] }));
};
export default TeamleaderDashboard;
