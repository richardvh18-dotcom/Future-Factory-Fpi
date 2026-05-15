import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Plus, X } from "lucide-react";
/**
 * LibrarySection V3.0 - UI Component
 * Herbruikbare lijst-module voor de Matrix Bibliotheek.
 * Bevat defensieve checks tegen 'undefined' of 'null' data.
 */
const LibrarySection = ({ title, items = [], onAdd, onRemove, placeholder, icon, }) => {
    const [val, setVal] = useState("");
    const handleAdd = () => {
        const trimmed = val.trim();
        if (trimmed) {
            onAdd(trimmed);
            setVal("");
        }
    };
    // Garandeer dat items altijd een array is
    const safeItems = Array.isArray(items) ? items : [];
    return (_jsxs("div", { className: "bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-xl hover:border-blue-200 transition-all h-full min-h-[400px] animate-in fade-in", children: [_jsxs("div", { className: "p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [icon && _jsx("span", { className: "text-blue-500", children: icon }), _jsx("h3", { className: "font-black text-slate-800 text-xs uppercase tracking-widest italic", children: title || "Systeemlijst" })] }), _jsx("span", { className: "text-[10px] font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow-sm", children: safeItems.length })] }), _jsx("div", { className: "p-5 flex-1 overflow-y-auto custom-scrollbar bg-white", children: _jsx("div", { className: "flex flex-wrap gap-2 mb-4", children: safeItems.length > 0 ? (safeItems.map((item, index) => (_jsxs("div", { className: "bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-[11px] font-black text-slate-700 flex items-center gap-3 shadow-sm hover:bg-white hover:border-blue-300 transition-all animate-in zoom-in duration-200 group uppercase", children: [item, _jsx("button", { onClick: () => onRemove(item), className: "text-slate-300 hover:text-rose-500 transition-colors", type: "button", title: "Verwijder item", children: _jsx(X, { size: 14, strokeWidth: 3 }) })] }, `${item}-${index}`)))) : (_jsx("div", { className: "w-full py-10 text-center opacity-20 italic", children: _jsx("p", { className: "text-xs font-bold uppercase tracking-tighter", children: "Geen data beschikbaar" }) })) }) }), _jsxs("div", { className: "p-4 bg-slate-50 border-t border-slate-100 flex gap-2", children: [_jsx("input", { className: "flex-1 bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-300", placeholder: placeholder || "Nieuwe waarde...", value: val, onChange: (e) => setVal(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleAdd() }), _jsx("button", { onClick: handleAdd, disabled: !val.trim(), className: "bg-slate-900 text-white px-5 py-3 rounded-xl hover:bg-blue-600 disabled:opacity-20 transition-all flex items-center justify-center shadow-lg active:scale-90", type: "button", children: _jsx(Plus, { size: 20, strokeWidth: 3 }) })] })] }));
};
export default LibrarySection;
