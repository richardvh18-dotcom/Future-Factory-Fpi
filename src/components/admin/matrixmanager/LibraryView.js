import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Layers, Hash, Type, Target, Zap, Database, Info, Settings2, Activity, Tag, RotateCw, } from "lucide-react";
import LibrarySection from "./LibrarySection";
/**
 * LibraryView V4.0 - Root-Ready
 * Beheert de configuratie-arrays die worden opgeslagen in GENERAL_SETTINGS.
 * Deze component koppelt de UI (LibrarySection) aan de centrale state.
 */
import { useState } from "react";
const LibraryView = ({ libraryData, setLibraryData, setHasUnsavedChanges, blueprints = {} }) => {
    // State voor selectie van blauwdruk en targetveld
    const [targetField, setTargetField] = useState("product_names");
    // Helper om een item toe te voegen aan een specifieke lijst in de state
    const addItem = (key, val) => {
        setLibraryData((prev) => {
            const list = Array.isArray(prev[key]) ? [...prev[key]] : [];
            if (list.includes(val))
                return prev; // Voorkom dubbele
            const updated = {
                ...prev,
                [key]: [...list, val].sort((a, b) => {
                    // Slim sorteren: nummers numeriek, tekst alfabetisch
                    if (!isNaN(a) && !isNaN(b))
                        return Number(a) - Number(b);
                    return String(a).localeCompare(String(b));
                }),
            };
            return updated;
        });
        if (setHasUnsavedChanges)
            setHasUnsavedChanges(true);
    };
    // Helper om een item te verwijderen
    const removeItem = (key, val) => {
        setLibraryData((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter((i) => i !== val),
        }));
        if (setHasUnsavedChanges)
            setHasUnsavedChanges(true);
    };
    // Configuraties voor de verschillende bibliotheek-secties
    const SECTIONS = [
        {
            id: "connections",
            title: "Mof Verbindingen",
            icon: _jsx(Layers, { size: 18 }),
            placeholder: "Bijv. CB/CB...",
            key: "connections",
        },
        {
            id: "diameters",
            title: "Diameters (ID)",
            icon: _jsx(Hash, { size: 18 }),
            placeholder: "Bijv. 350...",
            key: "diameters",
        },
        {
            id: "pns",
            title: "Drukklassen (PN)",
            icon: _jsx(Activity, { size: 18 }),
            placeholder: "Bijv. 16...",
            key: "pns",
        },
        {
            id: "product_names",
            title: "Product Types",
            icon: _jsx(Type, { size: 18 }),
            placeholder: "Bijv. Elbow...",
            key: "product_names",
        },
        {
            id: "borings",
            title: "Boring Types",
            icon: _jsx(Target, { size: 18 }),
            placeholder: "Bijv. DIN 10...",
            key: "borings",
        },
        {
            id: "codes",
            title: "Extra Codes",
            icon: _jsx(Zap, { size: 18 }),
            placeholder: "Bijv. A1S1...",
            key: "codes",
        },
        {
            id: "angles",
            title: "Graden (Hoeken)",
            icon: _jsx(RotateCw, { size: 18 }),
            placeholder: "Bijv. 45, 90...",
            key: "angles",
        },
        {
            id: "labels",
            title: "Product Labels",
            icon: _jsx(Tag, { size: 18 }),
            placeholder: "Bijv. Wavistrong...",
            key: "productLabels",
        },
    ];
    return (_jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 text-left", children: [_jsxs("div", { className: "bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-200 relative overflow-hidden flex flex-col md:flex-row items-center gap-8", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-10 rotate-12", children: _jsx(Database, { size: 150 }) }), _jsx("div", { className: "p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20 shrink-0", children: _jsx(Settings2, { size: 40, className: "text-white" }) }), _jsxs("div", { className: "relative z-10", children: [_jsx("h2", { className: "text-2xl font-black uppercase italic tracking-tighter mb-2", children: "Master Bibliotheek" }), _jsx("p", { className: "text-sm font-bold text-blue-100/80 leading-relaxed max-w-2xl", children: "Beheer hier de kern-parameters van de fabriek. Deze waarden vormen de basis voor de Matrix, de Product Configurator en de Werkstation Terminals." })] })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6", children: SECTIONS.map((sec) => (_jsx(LibrarySection, { title: sec.title, icon: sec.icon, placeholder: sec.placeholder, items: libraryData[sec.key] || [], onAdd: (val) => addItem(sec.key, val), onRemove: (val) => removeItem(sec.key, val) }, sec.id))) }), _jsxs("div", { className: "mt-10 bg-white rounded-[32px] shadow-sm border border-blue-200 overflow-hidden flex flex-col hover:shadow-xl transition-all animate-in fade-in", children: [_jsxs("div", { className: "p-5 bg-blue-50 border-b border-blue-100 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-blue-500", children: _jsx(Layers, { size: 18 }) }), _jsx("h3", { className: "font-black text-blue-800 text-xs uppercase tracking-widest italic", children: "Blauwdrukken toevoegen aan Bibliotheek" })] }), _jsx("span", { className: "text-[10px] font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow-sm", children: Object.keys(blueprints).length })] }), _jsxs("div", { className: "p-5 flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-wrap gap-2 items-center mb-2", children: [_jsx("span", { className: "text-xs font-bold text-blue-900", children: "Kies veld:" }), _jsxs("select", { className: "border border-blue-200 rounded-lg px-2 py-1 text-xs font-bold", value: targetField, onChange: e => setTargetField(e.target.value), children: [_jsx("option", { value: "product_names", children: "Product Types" }), _jsx("option", { value: "borings", children: "Boring Types" }), _jsx("option", { value: "connections", children: "Mof Verbindingen" }), _jsx("option", { value: "diameters", children: "Diameters (ID)" }), _jsx("option", { value: "pns", children: "Drukklassen (PN)" }), _jsx("option", { value: "codes", children: "Extra Codes" }), _jsx("option", { value: "angles", children: "Graden (Hoeken)" }), _jsx("option", { value: "productLabels", children: "Product Labels" })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [Object.keys(blueprints).length === 0 && (_jsx("span", { className: "text-slate-400 text-xs", children: "Geen blauwdrukken gevonden." })), Object.entries(blueprints).map(([key, blueprint]) => (_jsxs("button", { onClick: () => addItem(targetField, blueprint?.naam || key), className: "px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-2 shadow-sm border bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 transition-all uppercase", title: blueprint?.omschrijving || key, children: [blueprint?.naam || key, " ", _jsx("span", { className: "ml-1 text-blue-400", children: "+" })] }, key)))] })] })] }), _jsxs("div", { className: "p-8 bg-slate-900 rounded-[40px] border border-white/5 flex items-start gap-6 shadow-2xl relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 right-0 p-6 opacity-5", children: _jsx(Info, { size: 80 }) }), _jsx("div", { className: "p-3 bg-blue-600 rounded-2xl text-white shadow-lg shrink-0", children: _jsx(Info, { size: 20 }) }), _jsxs("div", { className: "text-left space-y-2 relative z-10", children: [_jsx("h4", { className: "text-xs font-black uppercase text-blue-400 tracking-widest italic leading-none", children: "Instructies" }), _jsxs("p", { className: "text-[11px] text-slate-400 font-bold uppercase leading-relaxed tracking-wider opacity-80", children: ["Wijzigingen in de bibliotheek zijn direct merkbaar in de filters van de andere tabs. Vergeet niet bovenaan op ", _jsx("strong", { children: "\"Opslaan\"" }), " ", "te klikken om de wijzigingen definitief te maken in de root database."] })] })] })] }));
};
export default LibraryView;
