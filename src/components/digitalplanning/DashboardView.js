import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
import { Zap, Layers, Clock, Disc } from "lucide-react";
// Configuratie van machine groepen
const FITTING_MACHINES = [
    "BM01",
    "BH11",
    "BH12",
    "BH15",
    "BH16",
    "BH17",
    "BH18",
    "BH31",
    "Mazak",
    "Nabewerking",
];
const PIPE_MACHINES = ["BH05", "BH07", "BH08", "BH09"];
// Alles wat niet in bovenstaande lijsten staat, valt onder 'Spools' of 'Overig'
const DashboardView = ({ metrics, onStationSelect }) => {
    const { t } = useTranslation();
    if (!metrics || !metrics.machineMetrics)
        return null;
    // Groepeer de machines
    const fittingGroup = metrics.machineMetrics.filter((m) => FITTING_MACHINES.includes(m.id) ||
        m.id.toUpperCase().startsWith("BM") ||
        m.id === "Station BM01");
    const pipeGroup = metrics.machineMetrics.filter((m) => PIPE_MACHINES.includes(m.id));
    // De rest beschouwen we als Spools / Specials
    const spoolGroup = metrics.machineMetrics.filter((m) => !FITTING_MACHINES.includes(m.id) &&
        !m.id.toUpperCase().startsWith("BM") &&
        m.id !== "Station BM01" &&
        !PIPE_MACHINES.includes(m.id));
    // Herbruikbare kaart renderer
    const renderMachineCard = (machine) => (_jsxs("div", { onClick: () => onStationSelect && onStationSelect(machine.id), className: "bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group", children: [_jsxs("div", { className: "flex justify-between items-start mb-2", children: [_jsxs("div", { children: [_jsx("h4", { className: "font-black text-slate-800 text-sm uppercase tracking-tight group-hover:text-blue-600 transition-colors", children: machine.id }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest", children: machine.running > 0 ? t("digitalplanning.dashboard.active") : t("digitalplanning.dashboard.standby") })] }), _jsx("div", { className: `p-1.5 rounded-xl ${machine.running > 0
                            ? "bg-green-50 text-green-600 animate-pulse"
                            : "bg-slate-50 text-slate-400"}`, children: _jsx(Zap, { size: 16, fill: machine.running > 0 ? "currentColor" : "none" }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { className: "bg-slate-50 p-2 rounded-xl border border-slate-100", children: [_jsx("span", { className: "block text-[8px] font-black text-slate-400 uppercase mb-0.5", children: t("digitalplanning.dashboard.plan") }), _jsx("span", { className: "block text-base font-black text-slate-800", children: Math.round(machine.plan) })] }), _jsxs("div", { className: "bg-blue-50 p-2 rounded-xl border border-blue-100", children: [_jsx("span", { className: "block text-[8px] font-black text-blue-400 uppercase mb-0.5", children: t("digitalplanning.dashboard.ready") }), _jsx("span", { className: "block text-base font-black text-blue-700", children: machine.fin })] })] }), _jsx("div", { className: "mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-blue-500 rounded-full transition-all duration-1000", style: {
                        width: `${machine.plan > 0
                            ? Math.min(100, (machine.fin / machine.plan) * 100)
                            : 0}%`,
                    } }) })] }, machine.id));
    return (_jsxs("div", { className: "space-y-10 animate-in fade-in duration-500 pb-12", children: [fittingGroup.length > 0 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("h3", { className: "text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2", children: [_jsx(Layers, { size: 18, className: "text-blue-500" }), t("digitalplanning.dashboard.fitting_productions")] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6", children: fittingGroup.map(renderMachineCard) })] })), pipeGroup.length > 0 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("h3", { className: "text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2", children: [_jsx(Clock, { size: 18, className: "text-cyan-500" }), t("digitalplanning.dashboard.pipe_productions")] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6", children: pipeGroup.map(renderMachineCard) })] })), spoolGroup.length > 0 && (_jsxs("div", { className: "space-y-4", children: [_jsxs("h3", { className: "text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2", children: [_jsx(Disc, { size: 18, className: "text-purple-500" }), t("digitalplanning.dashboard.spools_productions")] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6", children: spoolGroup.map(renderMachineCard) })] }))] }));
};
export default DashboardView;
