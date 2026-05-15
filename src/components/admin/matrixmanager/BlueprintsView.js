import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useNotifications } from '../../../contexts/NotificationContext';
import { useState, useMemo, useRef } from "react";
import { Layers, Plus, Trash2, Save, X, ChevronDown, ChevronRight, Search, FileText, Type, AlertCircle, Sparkles, Target, Copy, Zap, } from "lucide-react";
/**
 * BlueprintsView V2.3: Beheert templates voor Fittings én Boringen.
 * Alle wijzigingen worden via props gesynchroniseerd met de AdminMatrixManager
 * die ze vervolgens opslaat in de root: /future-factory/settings/blueprints/main
 */
const BlueprintsView = ({ blueprints, setBlueprints, libraryData, setHasUnsavedChanges, }) => {
    const { notify } = useNotifications();
    const [selectedBlueprintKey, setSelectedBlueprintKey] = useState(null);
    const [expandedGroups, setExpandedGroups] = useState({ BORINGEN: true });
    const [searchTerm, setSearchTerm] = useState("");
    const [isNewAnim, setIsNewAnim] = useState(false);
    const [designMode, setDesignMode] = useState("fitting"); // 'fitting' | 'bore'
    const [copySourceKey, setCopySourceKey] = useState(""); // Voor de kopieer-functie
    const editorRef = useRef(null);
    const [newBlueprint, setNewBlueprint] = useState({
        productType: "",
        connectionType: "",
        extraCode: "",
        boreType: "",
        fields: [],
    });
    const [newField, setNewField] = useState("");
    // --- DATA KOPPELING ---
    const availableTypes = useMemo(() => libraryData?.product_names || [], [libraryData]);
    const availableConnections = useMemo(() => libraryData?.connections || [], [libraryData]);
    const availableExtraCodes = useMemo(() => libraryData?.extraCodes || libraryData?.codes || [], [libraryData]);
    const availableBorings = useMemo(() => libraryData?.borings || [], [libraryData]);
    // Lijst van alle bestaande sleutels voor de kopieer-dropdown
    const allExistingKeys = useMemo(() => Object.keys(blueprints || {}).sort(), [blueprints]);
    const groupedBlueprints = useMemo(() => {
        const groups = {};
        const keys = Object.keys(blueprints || {}).sort();
        keys.forEach((key) => {
            if (searchTerm && !key.toLowerCase().includes(searchTerm.toLowerCase()))
                return;
            const type = key.startsWith("BORE_") ? "BORINGEN" : key.split("_")[0] || "OVERIG";
            if (!groups[type])
                groups[type] = [];
            groups[type].push(key);
        });
        return groups;
    }, [blueprints, searchTerm]);
    const toggleGroup = (group) => setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
    const handleSelect = (key) => {
        setSelectedBlueprintKey(key);
        if (key.startsWith("BORE_")) {
            setDesignMode("bore");
            setNewBlueprint({
                boreType: key.replace("BORE_", ""),
                productType: "",
                connectionType: "",
                extraCode: "",
                fields: blueprints[key].fields || [],
                angle: "",
            });
        }
        else {
            setDesignMode("fitting");
            const parts = key.split("_");
            setNewBlueprint({
                productType: parts[0],
                connectionType: parts[1],
                extraCode: parts.slice(2).join("_") || "",
                boreType: "",
                fields: blueprints[key].fields || [],
            });
        }
        editorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    const resetForm = () => {
        setSelectedBlueprintKey(null);
        setNewBlueprint({
            productType: "",
            connectionType: "",
            extraCode: "",
            boreType: "",
            fields: [],
        });
        setNewField("");
        setCopySourceKey("");
        setIsNewAnim(true);
        setTimeout(() => setIsNewAnim(false), 1000);
        editorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    // --- KOPIEER LOGICA ---
    const handleCopyFields = () => {
        if (!copySourceKey || !blueprints[copySourceKey])
            return;
        const sourceFields = blueprints[copySourceKey].fields || [];
        if (sourceFields.length === 0) {
            notify("Deze bron bevat geen velden.");
            return;
        }
        // Voeg velden toe, voorkom duplicaten
        setNewBlueprint((prev) => {
            const mergedFields = [...new Set([...prev.fields, ...sourceFields])];
            return { ...prev, fields: mergedFields };
        });
        setCopySourceKey(""); // Reset selectie
    };
    const handleAddField = () => {
        const field = newField.trim().toUpperCase();
        if (field && !newBlueprint.fields.includes(field)) {
            setNewBlueprint({
                ...newBlueprint,
                fields: [...newBlueprint.fields, field],
            });
            setNewField("");
        }
    };
    const handleRemoveField = (fieldToRemove) => {
        setNewBlueprint({
            ...newBlueprint,
            fields: newBlueprint.fields.filter((f) => f !== fieldToRemove),
        });
    };
    const handleSaveToLocalState = () => {
        const key = designMode === "bore"
            ? (() => {
                if (!newBlueprint.boreType)
                    return notify("Selecteer een Boring Type.");
                return `BORE_${newBlueprint.boreType}`;
            })()
            : (() => {
                if (!newBlueprint.productType || !newBlueprint.connectionType) {
                    return notify("Selecteer Product Type en Mof.");
                }
                return `${newBlueprint.productType}_${newBlueprint.connectionType}${newBlueprint.extraCode && newBlueprint.extraCode !== "-"
                    ? "_" + newBlueprint.extraCode
                    : ""}`;
            })();
        if (!key)
            return;
        setBlueprints({ ...blueprints, [key]: { fields: newBlueprint.fields } });
        if (setHasUnsavedChanges)
            setHasUnsavedChanges(true);
        setSelectedBlueprintKey(key);
    };
    const handleDelete = (key) => {
        if (window.confirm(`Blauwdruk '${key}' verwijderen?`)) {
            const updated = { ...blueprints };
            delete updated[key];
            setBlueprints(updated);
            if (setHasUnsavedChanges)
                setHasUnsavedChanges(true);
            if (selectedBlueprintKey === key)
                resetForm();
        }
    };
    return (_jsxs("div", { className: "flex gap-6 h-[calc(100vh-220px)] animate-in fade-in duration-500 text-left", children: [_jsxs("div", { className: "w-1/3 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden", children: [_jsxs("div", { className: "p-8 border-b border-slate-100 bg-slate-50/50 space-y-4 shrink-0 text-left", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { className: "text-left text-left", children: [_jsxs("h3", { className: "font-black text-slate-800 text-sm uppercase tracking-widest flex items-center gap-2", children: [_jsx(Layers, { size: 18, className: "text-purple-600" }), "Templates"] }), _jsx("p", { className: "text-[9px] font-bold text-slate-400 uppercase mt-1 italic", children: "Matrix Configuratie" })] }), _jsx("button", { onClick: resetForm, className: `p-3 rounded-2xl transition-all shadow-lg flex items-center justify-center ${selectedBlueprintKey === null
                                            ? "bg-emerald-500 text-white shadow-emerald-200 scale-110"
                                            : "bg-purple-600 text-white shadow-purple-200 hover:scale-105"}`, children: _jsx(Plus, { size: 20, strokeWidth: 3 }) })] }), _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300", size: 16 }), _jsx("input", { className: "w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-purple-400 transition-all shadow-inner", placeholder: "Zoek template...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-white", children: Object.entries(groupedBlueprints).map(([group, items]) => (_jsxs("div", { className: `border rounded-[30px] overflow-hidden ${group === "BORINGEN"
                                ? "border-blue-100 bg-blue-50/20"
                                : "border-slate-100 bg-slate-50/30"}`, children: [_jsxs("button", { onClick: () => toggleGroup(group), className: "w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors", children: [_jsxs("span", { className: "font-black text-slate-700 text-[10px] uppercase tracking-widest flex items-center gap-2", children: [group === "BORINGEN" ? (_jsx(Target, { size: 14, className: "text-blue-500" })) : (_jsx(FileText, { size: 14, className: "text-slate-400" })), group] }), expandedGroups[group] ? (_jsx(ChevronDown, { size: 14, className: "text-slate-400" })) : (_jsx(ChevronRight, { size: 14, className: "text-slate-400" }))] }), (expandedGroups[group] || searchTerm) && (_jsx("div", { className: "bg-white p-2 space-y-1", children: items.map((key) => (_jsxs("div", { onClick: () => handleSelect(key), className: `p-3 pl-4 rounded-xl cursor-pointer text-[10px] font-bold transition-all flex justify-between items-center group ${selectedBlueprintKey === key
                                            ? key.startsWith("BORE_")
                                                ? "bg-blue-600 text-white shadow-md"
                                                : "bg-purple-600 text-white shadow-md"
                                            : "hover:bg-slate-50 text-slate-500"}`, children: [_jsx("span", { className: "truncate font-mono", children: key.replace("BORE_", "") }), _jsx(Trash2, { size: 14, className: `opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400`, onClick: (e) => {
                                                    e.stopPropagation();
                                                    handleDelete(key);
                                                } })] }, key))) }))] }, group))) })] }), _jsxs("div", { ref: editorRef, className: "flex-1 bg-white rounded-[50px] border border-slate-200 shadow-sm p-12 overflow-y-auto custom-scrollbar relative text-left", children: [isNewAnim && (_jsxs("div", { className: "absolute top-10 left-1/2 -translate-x-1/2 animate-bounce bg-emerald-500 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase flex items-center gap-2 z-10 shadow-xl shadow-emerald-200", children: [_jsx(Sparkles, { size: 14 }), " Designer Gereed"] })), _jsxs("div", { className: "max-w-3xl mx-auto text-left", children: [_jsxs("div", { className: "flex justify-between items-start mb-10 pb-10 border-b border-slate-100", children: [_jsxs("div", { className: "text-left text-left", children: [_jsx("div", { className: "flex items-center gap-4 mb-4", children: _jsxs("div", { className: "flex bg-slate-100 p-1.5 rounded-2xl", children: [_jsx("button", { onClick: () => !selectedBlueprintKey && setDesignMode("fitting"), disabled: !!selectedBlueprintKey, className: `px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${designMode === "fitting"
                                                                ? "bg-white text-purple-600 shadow-sm"
                                                                : "text-slate-400"}`, children: "Fitting" }), _jsx("button", { onClick: () => !selectedBlueprintKey && setDesignMode("bore"), disabled: !!selectedBlueprintKey, className: `px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${designMode === "bore"
                                                                ? "bg-white text-blue-600 shadow-sm"
                                                                : "text-slate-400"}`, children: "Boring" })] }) }), _jsx("h3", { className: "text-3xl font-black text-slate-900 tracking-tighter italic uppercase", children: selectedBlueprintKey
                                                    ? selectedBlueprintKey.replace("BORE_", "")
                                                    : `${designMode === "bore" ? "Boring" : "Fitting"} Designer` })] }), selectedBlueprintKey && (_jsx("button", { onClick: resetForm, className: "p-4 bg-slate-50 text-slate-400 rounded-3xl hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100 shadow-sm active:scale-95", children: _jsx(Plus, { size: 28 }) }))] }), designMode === "fitting" ? (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 animate-in slide-in-from-left duration-300", children: [_jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: "1. Product Type" }), _jsxs("select", { className: `w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${selectedBlueprintKey
                                                    ? "bg-slate-50 border-slate-100 text-slate-400"
                                                    : "bg-white border-slate-200 focus:border-purple-500"}`, value: newBlueprint.productType, onChange: (e) => setNewBlueprint({
                                                    ...newBlueprint,
                                                    productType: e.target.value,
                                                }), disabled: !!selectedBlueprintKey, children: [_jsx("option", { value: "", children: "- Kies Type -" }), availableTypes.map((p) => (_jsx("option", { value: p, children: p }, p)))] })] }), _jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: "2. Connectie / Mof" }), _jsxs("select", { className: `w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${selectedBlueprintKey
                                                    ? "bg-slate-50 border-slate-100 text-slate-400"
                                                    : "bg-white border-slate-200 focus:border-purple-500"}`, value: newBlueprint.connectionType, onChange: (e) => setNewBlueprint({
                                                    ...newBlueprint,
                                                    connectionType: e.target.value,
                                                }), disabled: !!selectedBlueprintKey, children: [_jsx("option", { value: "", children: "- Kies Mof -" }), availableConnections.map((c) => (_jsx("option", { value: c, children: c }, c)))] })] }), _jsxs("div", { className: "space-y-2 text-left", children: [_jsx("label", { className: "block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1", children: "3. Extra Code (Optioneel)" }), _jsxs("select", { className: `w-full border-2 rounded-[25px] px-6 py-5 text-sm font-bold outline-none transition-all shadow-sm ${selectedBlueprintKey
                                                    ? "bg-slate-50 border-slate-100 text-slate-400"
                                                    : "bg-white border-slate-200 focus:border-purple-500"}`, value: newBlueprint.extraCode, onChange: (e) => setNewBlueprint({
                                                    ...newBlueprint,
                                                    extraCode: e.target.value,
                                                }), disabled: !!selectedBlueprintKey, children: [_jsx("option", { value: "-", children: "- Standaard (Geen code) -" }), availableExtraCodes.map((code) => (_jsx("option", { value: code, children: code }, code)))] })] })] })) : (
                            /* Formulier: Boring */
                            _jsxs("div", { className: "mb-12 animate-in slide-in-from-right duration-300 space-y-2 text-left", children: [_jsxs("label", { className: "block text-[10px] font-black text-blue-600 uppercase mb-2 ml-1 flex items-center gap-2 italic tracking-widest", children: [_jsx(Target, { size: 14 }), " Selecteer Boring Type"] }), _jsxs("select", { className: `w-full border-2 rounded-[25px] px-7 py-6 text-base font-black outline-none transition-all shadow-md ${selectedBlueprintKey
                                            ? "bg-blue-50 border-blue-100 text-blue-700"
                                            : "bg-white border-blue-200 focus:border-blue-500"}`, value: newBlueprint.boreType, onChange: (e) => setNewBlueprint({ ...newBlueprint, boreType: e.target.value }), disabled: !!selectedBlueprintKey, children: [_jsx("option", { value: "", children: "- Kies een boringstype -" }), availableBorings.map((b) => (_jsx("option", { value: b, children: b }, b)))] })] })), _jsxs("div", { className: "mb-12 bg-emerald-50/50 border-2 border-dashed border-emerald-100 rounded-[35px] p-8 animate-in fade-in duration-700 text-left", children: [_jsxs("div", { className: "flex items-center gap-3 mb-6", children: [_jsx("div", { className: "p-2.5 bg-emerald-500 rounded-2xl text-white shadow-lg", children: _jsx(Copy, { size: 18 }) }), _jsx("h4", { className: "text-[11px] font-black text-emerald-700 uppercase tracking-widest italic", children: "Snelstart: Kopieer Velden van bestaande template" })] }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("select", { className: "flex-1 bg-white border-2 border-emerald-100 rounded-2xl px-6 py-5 text-xs font-bold outline-none focus:border-emerald-400 shadow-sm", value: copySourceKey, onChange: (e) => setCopySourceKey(e.target.value), children: [_jsx("option", { value: "", children: "- Kies een bron template -" }), allExistingKeys.map((key) => (_jsx("option", { value: key, children: key.startsWith("BORE_")
                                                            ? "Boring: " + key.replace("BORE_", "")
                                                            : "Fitting: " + key }, key)))] }), _jsxs("button", { onClick: handleCopyFields, disabled: !copySourceKey, className: "bg-emerald-600 text-white px-10 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-700 disabled:opacity-30 transition-all shadow-xl active:scale-95", children: [_jsx(Zap, { size: 16, fill: "currentColor" }), " Kopieer"] })] })] }), _jsxs("div", { className: `rounded-[40px] p-10 border mb-12 shadow-inner transition-colors text-left ${designMode === "bore"
                                    ? "bg-blue-50/30 border-blue-100"
                                    : "bg-slate-50 border-slate-100"}`, children: [_jsx("div", { className: "flex justify-between items-center mb-8", children: _jsxs("h4", { className: `text-[11px] font-black uppercase tracking-widest flex items-center gap-2 italic ${designMode === "bore" ? "text-blue-500" : "text-slate-500"}`, children: [_jsx(Type, { size: 16 }), " Actieve Variabelen (", newBlueprint.fields.length, ")"] }) }), _jsxs("div", { className: "flex gap-4 mb-10", children: [_jsx("input", { className: "flex-1 bg-white border-2 border-slate-200 rounded-[20px] px-6 py-5 text-sm font-bold focus:border-blue-500 outline-none transition-all placeholder:text-slate-300 shadow-sm", placeholder: designMode === "bore"
                                                    ? "Bijv. k, d, n, b..."
                                                    : "Bijv. TW, L, r1...", value: newField, onChange: (e) => setNewField(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleAddField() }), _jsx("button", { onClick: handleAddField, disabled: !newField, className: `px-10 rounded-2xl font-black transition-all disabled:opacity-20 shadow-xl text-white ${designMode === "bore"
                                                    ? "bg-blue-600 hover:bg-blue-700"
                                                    : "bg-slate-900 hover:bg-purple-600"}`, children: _jsx(Plus, { size: 28 }) })] }), _jsx("div", { className: "flex flex-wrap gap-3 min-h-[160px] content-start", children: newBlueprint.fields.length === 0 ? (_jsx("div", { className: "w-full py-20 text-center text-slate-300 border-2 border-dashed border-slate-200 rounded-[30px] bg-white/50", children: _jsx("p", { className: "text-[11px] font-black uppercase tracking-widest italic opacity-60", children: "Geen technische variabelen gekoppeld" }) })) : (newBlueprint.fields.map((field) => (_jsxs("span", { className: "bg-white border-2 border-slate-100 px-6 py-4 rounded-2xl text-[12px] font-black text-slate-700 flex items-center gap-5 shadow-sm hover:border-blue-200 transition-all animate-in zoom-in group", children: [field, _jsx("button", { onClick: () => handleRemoveField(field), className: "text-slate-200 group-hover:text-red-500 p-1 transition-colors", children: _jsx(X, { size: 16 }) })] }, field)))) })] }), _jsxs("div", { className: "flex flex-col items-center pt-10 border-t border-slate-100", children: [_jsxs("button", { onClick: handleSaveToLocalState, disabled: (designMode === "fitting" &&
                                            (!newBlueprint.productType ||
                                                !newBlueprint.connectionType)) ||
                                            (designMode === "bore" && !newBlueprint.boreType), className: `w-full max-w-sm py-7 rounded-[35px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-30 active:scale-95 text-white ${designMode === "bore"
                                            ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                                            : "bg-slate-900 hover:bg-purple-600 shadow-purple-200"}`, children: [_jsx(Save, { size: 24 }), " Bevestig", " ", designMode === "bore" ? "Boring" : "Blauwdruk"] }), _jsxs("div", { className: "mt-10 p-8 bg-slate-50 rounded-[35px] border border-slate-100 flex items-start gap-5 max-w-xl text-left", children: [_jsx(AlertCircle, { size: 24, className: "text-slate-400 shrink-0 mt-0.5" }), _jsxs("p", { className: "text-[11px] font-bold text-slate-500 uppercase leading-relaxed tracking-wider opacity-80", children: ["Zodra je een template bevestigt, verschijnen de variabelen direct in de ", _jsx("strong", { children: "Maatvoering" }), " tab voor alle ID's binnen die configuratie."] })] })] })] })] })] }));
};
export default BlueprintsView;
