import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Filter, RotateCcw, Info } from "lucide-react";
const ProductFilterSidebar = ({ filters, setFilters, uniqueTypes = [], uniqueDiameters = [], uniquePressures = [], uniqueConnections = [], uniqueAngles = [], uniqueRadii = [], uniqueBorings = [], uniqueLabels = [], isOpen, toggleSidebar, }) => {
    const resetFilters = () => {
        setFilters({
            type: "-",
            diameter: "-",
            pressure: "-",
            connection: "-",
            angle: "-",
            radius: "-",
            boring: "-",
            productLabel: "-",
        });
    };
    const Tooltip = ({ text }) => (_jsxs("div", { className: "group relative inline-block ml-2 align-middle", children: [_jsx("div", { className: "p-1 bg-slate-100 rounded-full cursor-help hover:bg-emerald-100 transition-colors", children: _jsx(Info, { size: 11, className: "text-slate-400 group-hover:text-emerald-600 transition-colors" }) }), _jsxs("div", { className: "absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-3 bg-slate-900 text-white text-[10px] font-bold rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] pointer-events-none shadow-2xl border border-slate-700 leading-snug", children: [_jsx("div", { className: "relative z-10", children: text }), _jsx("div", { className: "absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" })] })] }));
    const FilterSection = ({ label, value, options = [], filterKey, tooltipText, colorClass = "border-slate-200", }) => (_jsxs("div", { className: "mb-4 animate-in fade-in slide-in-from-left-1 duration-300", children: [_jsxs("div", { className: "flex items-center mb-1.5 px-1", children: [_jsx("label", { className: "text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]", children: label }), tooltipText && _jsx(Tooltip, { text: tooltipText })] }), _jsxs("div", { className: "relative", children: [_jsxs("select", { value: value, onChange: (e) => setFilters((prev) => ({ ...prev, [filterKey]: e.target.value })), className: `w-full bg-white border ${colorClass} rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all appearance-none cursor-pointer shadow-sm`, children: [_jsxs("option", { value: "-", children: ["Alle ", label] }), options.map((opt) => (_jsx("option", { value: opt, children: opt }, opt)))] }), _jsx("div", { className: "absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400", children: _jsx("svg", { width: "8", height: "5", viewBox: "0 0 10 6", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M1 1L5 5L9 1" }) }) })] })] }));
    if (!filters)
        return null;
    const isElbow = filters.type && filters.type.toLowerCase().includes("elbow");
    const is90Degrees = filters.angle === "90";
    const isFlange = filters.type &&
        (filters.type.toLowerCase().includes("flens") ||
            filters.type.toLowerCase().includes("flange"));
    return (_jsxs(_Fragment, { children: [isOpen && (_jsx("div", { className: "fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden", onClick: toggleSidebar })), _jsxs("aside", { className: `
          fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 shadow-xl
          transition-all duration-300 ease-in-out flex flex-col h-full
          
          /* MOBIEL: Fixed over alles heen, toggled met translate */
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          w-72

          /* DESKTOP (lg): Niet fixed, maar static (in de flow). Toggled met width */
          lg:translate-x-0 lg:shadow-none lg:static lg:z-auto
          ${isOpen
                    ? "lg:w-72 lg:opacity-100"
                    : "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:border-none"}
        `, children: [_jsxs("div", { className: "p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 min-w-[18rem]", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "p-2 bg-emerald-50 rounded-xl text-emerald-600 shadow-sm border border-emerald-100", children: _jsx(Filter, { size: 16 }) }), _jsx("h2", { className: "text-sm font-black uppercase tracking-tight text-slate-800 italic", children: "Filters" })] }), _jsx("button", { onClick: resetFilters, className: "p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all", title: "Herstel Filters", children: _jsx(RotateCcw, { size: 16 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-5 custom-scrollbar min-w-[18rem]", children: [_jsx(FilterSection, { label: "Product Type", filterKey: "type", value: filters.type, options: uniqueTypes, tooltipText: "Kies het type fitting of buis." }), isElbow && (_jsx(FilterSection, { label: "Hoek (Degrees)", filterKey: "angle", value: filters.angle, options: uniqueAngles, colorClass: "border-blue-200" })), isElbow && is90Degrees && (_jsx(FilterSection, { label: "Radius", filterKey: "radius", value: filters.radius, options: uniqueRadii, colorClass: "border-amber-200" })), isFlange && (_jsx(FilterSection, { label: "Boring / Drilling", filterKey: "boring", value: filters.boring, options: uniqueBorings, colorClass: "border-purple-200" })), _jsx("div", { className: "h-px bg-slate-100 my-4" }), _jsx(FilterSection, { label: "Diameter (ID)", filterKey: "diameter", value: filters.diameter, options: uniqueDiameters }), _jsx(FilterSection, { label: "Drukklasse (PN)", filterKey: "pressure", value: filters.pressure, options: uniquePressures }), _jsx(FilterSection, { label: "Verbinding", filterKey: "connection", value: filters.connection, options: uniqueConnections }), _jsx(FilterSection, { label: "Label", filterKey: "productLabel", value: filters.productLabel, options: uniqueLabels })] }), _jsx("div", { className: "p-5 border-t border-slate-100 bg-slate-50/30 min-w-[18rem]", children: _jsxs("div", { className: "bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center justify-between", children: [_jsx("p", { className: "text-[10px] font-black text-emerald-800 uppercase italic", children: "Filters Actief" }), _jsx("div", { className: "h-2 w-2 rounded-full bg-emerald-500 animate-pulse" })] }) })] })] }));
};
export default ProductFilterSidebar;
