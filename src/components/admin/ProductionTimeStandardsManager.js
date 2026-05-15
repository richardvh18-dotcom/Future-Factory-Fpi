import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Upload, Download, Trash2, Plus, Save, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Edit2, Brain, TrendingUp, RefreshCw } from "lucide-react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, addDoc, getDocs, getDoc } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { formatMinutes } from "../../utils/efficiencyCalculator";
import { analyzeAndUpdateStandards } from "../../utils/autoLearningService";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * ProductionTimeStandardsManager
 * Beheer standaard productietijden per product per machine
 */
const ProductionTimeStandardsManager = () => {
    const { t } = useTranslation();
    const { showConfirm } = useNotifications();
    const [standards, setStandards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [filter, setFilter] = useState("");
    const [editMode, setEditMode] = useState(null);
    const [availableItemCodes, setAvailableItemCodes] = useState([]);
    const [availableMachines, setAvailableMachines] = useState([]);
    const [learningRecommendations, setLearningRecommendations] = useState([]);
    const [isLearning, setIsLearning] = useState(false);
    const [showRecommendations, setShowRecommendations] = useState(false);
    // New entry form
    const [newEntry, setNewEntry] = useState({
        itemCode: "",
        machine: "",
        standardMinutes: "",
        description: ""
    });
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load item codes from conversion mapping
                const conversionSnapshot = await getDocs(collection(db, ...PATHS.CONVERSION_MATRIX));
                const itemCodes = new Set();
                conversionSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.itemCode)
                        itemCodes.add(data.itemCode);
                    if (data.productCode)
                        itemCodes.add(data.productCode);
                });
                setAvailableItemCodes([...itemCodes].sort());
                // Load machines from factory config
                const factoryDoc = await getDoc(doc(db, ...PATHS.FACTORY_CONFIG));
                if (factoryDoc.exists()) {
                    const config = factoryDoc.data();
                    const machines = new Set();
                    // Extract all stations from all departments
                    Object.values(config.departments || {}).forEach(dept => {
                        (dept.stations || []).forEach(station => {
                            if (station.id)
                                machines.add(station.id);
                            if (station.name && station.name !== station.id)
                                machines.add(station.name);
                        });
                    });
                    setAvailableMachines([...machines].sort());
                }
            }
            catch (error) {
                console.error("Error loading reference data:", error);
            }
        };
        loadData();
        // Listen to standards collection
        const q = query(collection(db, ...PATHS.PRODUCTION_STANDARDS));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setStandards(data);
            setLoading(false);
        }, (err) => {
            console.error("Error loading standards:", err);
            setStatus({ type: "error", message: t('productionStandards.error_loading', "Fout bij laden van standaarden") });
            setLoading(false);
        });
        return () => unsub();
    }, []);
    const filteredStandards = standards.filter(std => {
        if (!filter)
            return true;
        const term = filter.toLowerCase();
        return (std.itemCode?.toLowerCase().includes(term) ||
            std.machine?.toLowerCase().includes(term) ||
            std.description?.toLowerCase().includes(term));
    });
    const handleAddNew = async () => {
        if (!newEntry.itemCode || !newEntry.machine || !newEntry.standardMinutes) {
            setStatus({ type: "error", message: t('productionStandards.error_required', "Item code, machine en tijd zijn verplicht") });
            return;
        }
        setSaving(true);
        try {
            await addDoc(collection(db, ...PATHS.PRODUCTION_STANDARDS), {
                itemCode: newEntry.itemCode.trim(),
                machine: newEntry.machine.trim(),
                standardMinutes: parseFloat(newEntry.standardMinutes),
                description: newEntry.description.trim(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Production standard added: ${newEntry.itemCode} (${newEntry.machine})`);
            setNewEntry({ itemCode: "", machine: "", standardMinutes: "", description: "" });
            setStatus({ type: "success", message: t('productionStandards.success_added', "Standaard toegevoegd") });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (error) {
            console.error("Error adding standard:", error);
            setStatus({ type: "error", message: t('productionStandards.error_adding', "Fout bij toevoegen") });
        }
        finally {
            setSaving(false);
        }
    };
    const handleUpdate = async (id, updates) => {
        setSaving(true);
        try {
            await setDoc(doc(db, ...PATHS.PRODUCTION_STANDARDS, id), { ...updates, updatedAt: serverTimestamp() }, { merge: true });
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Production standard updated: ${id}`);
            setEditMode(null);
            setStatus({ type: "success", message: t('productionStandards.success_updated', "Standaard bijgewerkt") });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (error) {
            console.error("Error updating standard:", error);
            setStatus({ type: "error", message: t('productionStandards.error_updating', "Fout bij bijwerken") });
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirm({
            title: t('productionStandards.deleteTitle', 'Standaard verwijderen'),
            message: t('productionStandards.confirm_delete', "Weet je zeker dat je deze standaard wilt verwijderen?"),
            confirmText: t('common.delete', 'Verwijderen'),
            cancelText: t('common.cancel', 'Annuleren'),
            tone: 'danger',
        });
        if (!confirmed)
            return;
        try {
            await deleteDoc(doc(db, ...PATHS.PRODUCTION_STANDARDS, id));
            await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Production standard deleted: ${id}`);
            setStatus({ type: "success", message: t('productionStandards.success_deleted', "Standaard verwijderd") });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (error) {
            console.error("Error deleting standard:", error);
            setStatus({ type: "error", message: t('productionStandards.error_deleting', "Fout bij verwijderen") });
        }
    };
    const handleImportCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result;
                const lines = text.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                // Expected headers: itemCode, machine, standardMinutes, description
                const itemCodeIdx = headers.indexOf('itemcode') >= 0 ? headers.indexOf('itemcode') : 0;
                const machineIdx = headers.indexOf('machine') >= 0 ? headers.indexOf('machine') : 1;
                const minutesIdx = headers.indexOf('standardminutes') >= 0 ? headers.indexOf('standardminutes') : 2;
                const descIdx = headers.indexOf('description') >= 0 ? headers.indexOf('description') : 3;
                setSaving(true);
                let imported = 0;
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line)
                        continue;
                    const values = line.split(',').map(v => v.trim());
                    const itemCode = values[itemCodeIdx];
                    const machine = values[machineIdx];
                    const minutes = parseFloat(values[minutesIdx]);
                    const description = values[descIdx] || "";
                    if (itemCode && machine && !isNaN(minutes)) {
                        await addDoc(collection(db, ...PATHS.PRODUCTION_STANDARDS), {
                            itemCode,
                            machine,
                            standardMinutes: minutes,
                            description,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        });
                        imported++;
                    }
                }
                if (imported > 0) {
                    await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Production standards imported: ${imported} records`);
                }
                setStatus({
                    type: "success",
                    message: t('productionStandards.success_imported', { count: imported, defaultValue: `${imported} standaarden geïmporteerd` })
                });
                setTimeout(() => setStatus(null), 3000);
            }
            catch (error) {
                console.error("CSV import error:", error);
                setStatus({ type: "error", message: t('productionStandards.error_importing', "Fout bij importeren CSV") });
            }
            finally {
                setSaving(false);
                e.target.value = "";
            }
        };
        reader.readAsText(file);
    };
    const handleExportCSV = () => {
        const csv = [
            "itemCode,machine,standardMinutes,description",
            ...standards.map(std => `${std.itemCode},${std.machine},${std.standardMinutes},${std.description || ""}`)
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `production_standards_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const handleAutoLearn = async (applyUpdates = false) => {
        setIsLearning(true);
        try {
            const results = await analyzeAndUpdateStandards({
                minSamples: 5,
                maxDeviation: 50,
                learningRate: 0.3,
                dryRun: !applyUpdates
            });
            setLearningRecommendations(results.recommendations);
            setShowRecommendations(true);
            if (applyUpdates) {
                await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Production standards auto-updated: ${results.updated} records`);
                setStatus({
                    type: "success",
                    message: t('productionStandards.success_auto_updated', { count: results.updated, defaultValue: `${results.updated} standaarden automatisch bijgewerkt` })
                });
            }
            else {
                setStatus({
                    type: "success",
                    message: t('productionStandards.success_recommendations', { count: results.recommendations.length, defaultValue: `${results.recommendations.length} aanbevelingen gevonden` })
                });
            }
            setTimeout(() => setStatus(null), 5000);
        }
        catch (error) {
            console.error("Auto-learning error:", error);
            setStatus({ type: "error", message: t('productionStandards.error_auto_learning', "Fout bij auto-learning analyse") });
        }
        finally {
            setIsLearning(false);
        }
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx(Loader2, { className: "animate-spin text-blue-600", size: 32 }) }));
    }
    return (_jsxs("div", { className: "space-y-6 p-6 max-w-6xl mx-auto", children: [_jsxs("div", { className: "bg-slate-900 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl border border-white/5", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-5 rotate-12", children: _jsx(Clock, { size: 150 }) }), _jsxs("div", { className: "relative z-10", children: [_jsxs("h2", { className: "text-2xl font-black uppercase italic tracking-tighter leading-none", children: [t('productionStandards.title', 'Productie Tijd Standaarden').split(' ')[0], " ", _jsx("span", { className: "text-blue-500", children: t('productionStandards.title', 'Productie Tijd Standaarden').split(' ').slice(1).join(' ') })] }), _jsx("p", { className: "text-xs text-slate-400 font-bold uppercase tracking-widest mt-2", children: t('productionStandards.subtitle', 'Verwachte productietijden per product per machine') }), _jsx("div", { className: "mt-4 flex items-center gap-2", children: _jsxs("span", { className: "text-xs font-mono text-emerald-400", children: ["\uD83D\uDCCA ", t('productionStandards.count_standards', { count: standards.length, defaultValue: `${standards.length} standaarden` })] }) })] })] }), status && (_jsxs("div", { className: `flex items-center gap-3 p-4 rounded-2xl border ${status.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'}`, children: [status.type === 'success' ? _jsx(CheckCircle2, { size: 18 }) : _jsx(AlertCircle, { size: 18 }), _jsx("span", { className: "text-sm font-bold", children: status.message })] })), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-4", children: [_jsxs("label", { className: "inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition", children: [_jsx(Upload, { size: 16 }), t('productionStandards.import_csv', 'Import CSV'), _jsx("input", { type: "file", accept: ".csv", onChange: handleImportCSV, disabled: saving, className: "hidden" })] }), _jsxs("button", { onClick: handleExportCSV, className: "inline-flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition", children: [_jsx(Download, { size: 16 }), t('productionStandards.export_csv', 'Export CSV')] }), _jsxs("button", { onClick: () => handleAutoLearn(false), disabled: isLearning, className: "inline-flex items-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition disabled:opacity-50", children: [isLearning ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Brain, { size: 16 }), t('productionStandards.analysis', 'Analyse')] }), _jsx("div", { className: "flex-1 min-w-[200px]", children: _jsx("input", { type: "text", placeholder: t('productionStandards.search_placeholder', 'Zoeken...'), value: filter, onChange: (e) => setFilter(e.target.value), className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none" }) })] }), _jsxs("div", { className: "mt-4 space-y-3", children: [_jsx("div", { className: "p-4 bg-blue-50 border border-blue-200 rounded-xl", children: _jsxs("div", { className: "flex items-start gap-2 text-xs text-blue-700", children: [_jsx(FileSpreadsheet, { size: 16, className: "mt-0.5 flex-shrink-0" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold", children: t('productionStandards.csv_format', 'CSV Format:') }), _jsx("code", { className: "text-[10px] block mt-1", children: "itemCode,machine,standardMinutes,description" }), _jsx("div", { className: "text-[10px] mt-1", children: t('productionStandards.example', 'Voorbeeld: A2E5,BH11,45,Wavistrong 160mm DN125') })] })] }) }), _jsx("div", { className: "p-4 bg-emerald-50 border border-emerald-200 rounded-xl", children: _jsxs("div", { className: "flex items-start gap-2 text-xs text-emerald-700", children: [_jsx(CheckCircle2, { size: 16, className: "mt-0.5 flex-shrink-0" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold", children: t('productionStandards.auto_fetch', 'Automatisch Ophalen:') }), _jsxs("div", { className: "text-[10px] mt-1", children: [t('productionStandards.item_codes_source', 'Item Codes worden automatisch geladen uit'), " ", _jsx("code", { className: "bg-emerald-100 px-1 rounded", children: "/conversions/mapping" }), _jsx("br", {}), t('productionStandards.machines_source', 'Machines worden geladen uit'), " ", _jsx("code", { className: "bg-emerald-100 px-1 rounded", children: "/factory_config" })] })] })] }) }), _jsx("div", { className: "p-4 bg-purple-50 border border-purple-200 rounded-xl", children: _jsxs("div", { className: "flex items-start gap-2 text-xs text-purple-700", children: [_jsx(Brain, { size: 16, className: "mt-0.5 flex-shrink-0" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold", children: t('productionStandards.self_learning_system', 'Zelflerend Systeem:') }), _jsxs("div", { className: "text-[10px] mt-1", children: [_jsx("span", { dangerouslySetInnerHTML: { __html: t('productionStandards.click_analysis', { analysis: t('productionStandards.analysis'), defaultValue: 'Klik op <strong>Analyse</strong> om het systeem historische data te laten analyseren.' }) } }), t('productionStandards.system_comparison', 'Het systeem vergelijkt standaard tijden met werkelijke gemeten tijden en stelt updates voor.')] })] })] }) })] })] }), showRecommendations && learningRecommendations.length > 0 && (_jsxs("div", { className: "bg-white border-2 border-purple-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Brain, { className: "text-purple-600", size: 20 }), _jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700", children: t('productionStandards.recommendations_title', { count: learningRecommendations.length, defaultValue: `Zelflerend Aanbevelingen (${learningRecommendations.length})` }) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: () => handleAutoLearn(true), disabled: isLearning, className: "px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition disabled:opacity-50", children: [_jsx(RefreshCw, { size: 14, className: "inline mr-1" }), t('productionStandards.apply_all', 'Alles Toepassen')] }), _jsx("button", { onClick: () => setShowRecommendations(false), className: "px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition", children: t('productionStandards.close', 'Sluiten') })] })] }), _jsx("div", { className: "space-y-3", children: learningRecommendations.map((rec, idx) => (_jsxs("div", { className: "flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "font-bold text-slate-800", children: rec.itemCode }), _jsx("div", { className: "text-xs text-slate-500", children: "\u2192" }), _jsx("div", { className: "text-sm text-slate-600", children: rec.machine })] }), _jsxs("div", { className: "text-xs text-slate-500 mt-1", children: [t('productionStandards.measurements', { count: rec.sampleCount, defaultValue: `${rec.sampleCount} metingen` }), " \u2022 ", t('productionStandards.deviation', { value: (rec.deviation > 0 ? '+' : '') + rec.deviation, defaultValue: `${rec.deviation}% afwijking` })] })] }), _jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-xs text-slate-500 uppercase tracking-widest mb-1", children: t('productionStandards.current', 'Huidig') }), _jsx("div", { className: "text-lg font-black text-slate-600", children: formatMinutes(rec.currentStandard) })] }), _jsx("div", { className: "text-slate-400", children: "\u2192" }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-xs text-purple-500 uppercase tracking-widest mb-1", children: t('productionStandards.recommended', 'Aanbevolen') }), _jsx("div", { className: "text-lg font-black text-purple-600", children: formatMinutes(rec.recommendedStandard) })] }), _jsx("div", { className: "text-right", children: _jsxs("div", { className: `px-3 py-1 rounded-full text-xs font-bold ${rec.change < 0
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-rose-100 text-rose-700'}`, children: [rec.change > 0 ? '+' : '', rec.change, "m"] }) })] })] }, idx))) }), _jsx("div", { className: "mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl", children: _jsxs("div", { className: "flex items-start gap-2 text-xs text-purple-700", children: [_jsx(TrendingUp, { size: 16, className: "mt-0.5 flex-shrink-0" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold", children: t('productionStandards.how_it_works', 'Hoe werkt het?') }), _jsxs("div", { className: "text-[10px] mt-1", children: [t('productionStandards.analysis_explanation', 'Het systeem analyseert voltooide producties en vergelijkt werkelijke tijden met standaard tijden.'), t('productionStandards.deviation_explanation', 'Bij significante afwijkingen (>5%) wordt een aanpassing voorgesteld.'), t('productionStandards.color_explanation', 'Groene cijfers = sneller dan verwacht, rode cijfers = langzamer.')] })] })] }) })] })), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsxs("div", { className: "flex items-center gap-2 mb-4", children: [_jsx(Plus, { className: "text-blue-600", size: 20 }), _jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700", children: t('productionStandards.add_new_title', 'Nieuwe Standaard Toevoegen') })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsxs("div", { children: [_jsx("input", { type: "text", list: "itemCodeList", placeholder: t('productionStandards.item_code_placeholder', 'Item Code *'), value: newEntry.itemCode, onChange: (e) => setNewEntry({ ...newEntry, itemCode: e.target.value }), className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none" }), _jsx("datalist", { id: "itemCodeList", children: availableItemCodes.map(code => (_jsx("option", { value: code }, code))) }), _jsx("div", { className: "text-[10px] text-slate-500 mt-1", children: t('productionStandards.codes_available', { count: availableItemCodes.length, defaultValue: `${availableItemCodes.length} codes beschikbaar` }) })] }), _jsxs("div", { children: [_jsx("input", { type: "text", list: "machineList", placeholder: t('productionStandards.machine_placeholder', 'Machine *'), value: newEntry.machine, onChange: (e) => setNewEntry({ ...newEntry, machine: e.target.value }), className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none" }), _jsx("datalist", { id: "machineList", children: availableMachines.map(machine => (_jsx("option", { value: machine }, machine))) }), _jsx("div", { className: "text-[10px] text-slate-500 mt-1", children: t('productionStandards.machines_available', { count: availableMachines.length, defaultValue: `${availableMachines.length} machines beschikbaar` }) })] }), _jsx("input", { type: "number", placeholder: t('productionStandards.minutes_placeholder', 'Minuten *'), value: newEntry.standardMinutes, onChange: (e) => setNewEntry({ ...newEntry, standardMinutes: e.target.value }), className: "px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none" }), _jsx("input", { type: "text", placeholder: t('productionStandards.description_placeholder', 'Beschrijving'), value: newEntry.description, onChange: (e) => setNewEntry({ ...newEntry, description: e.target.value }), className: "px-4 py-3 rounded-xl border-2 border-slate-200 text-sm focus:border-blue-500 outline-none" })] }), _jsxs("button", { onClick: handleAddNew, disabled: saving, className: "mt-4 inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-50", children: [saving ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(Plus, { size: 16 }), t('productionStandards.add_button', 'Toevoegen')] })] }), _jsxs("div", { className: "bg-white border-2 border-slate-200 rounded-2xl p-6", children: [_jsx("h3", { className: "text-sm font-black uppercase tracking-widest text-slate-700 mb-4", children: t('productionStandards.current_standards_title', { count: filteredStandards.length, defaultValue: `Huidige Standaarden (${filteredStandards.length})` }) }), filteredStandards.length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400", children: [_jsx(Clock, { size: 48, className: "mx-auto mb-4 opacity-50" }), _jsx("p", { className: "text-sm font-bold", children: t('productionStandards.no_standards_found', 'Geen standaarden gevonden') })] })) : (_jsx("div", { className: "space-y-3", children: filteredStandards.map(std => (_jsx("div", { className: "flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100", children: editMode === std.id ? (
                            // Edit mode
                            _jsxs("div", { className: "flex-1 grid grid-cols-4 gap-3", children: [_jsx("input", { type: "text", defaultValue: std.itemCode, id: `edit-item-${std.id}`, className: "px-3 py-2 rounded-lg border border-slate-200 text-sm" }), _jsx("input", { type: "text", defaultValue: std.machine, id: `edit-machine-${std.id}`, className: "px-3 py-2 rounded-lg border border-slate-200 text-sm" }), _jsx("input", { type: "number", defaultValue: std.standardMinutes, id: `edit-minutes-${std.id}`, className: "px-3 py-2 rounded-lg border border-slate-200 text-sm" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => {
                                                    const itemCode = document.getElementById(`edit-item-${std.id}`).value;
                                                    const machine = document.getElementById(`edit-machine-${std.id}`).value;
                                                    const minutes = parseFloat(document.getElementById(`edit-minutes-${std.id}`).value);
                                                    handleUpdate(std.id, { itemCode, machine, standardMinutes: minutes });
                                                }, className: "flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700", children: _jsx(Save, { size: 14 }) }), _jsx("button", { onClick: () => setEditMode(null), className: "px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300", children: t('productionStandards.cancel', 'Annuleren') })] })] })) : (
                            // View mode
                            _jsxs(_Fragment, { children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "font-bold text-slate-800", children: std.itemCode }), _jsx("div", { className: "text-xs text-slate-500", children: "\u2192" }), _jsx("div", { className: "text-sm text-slate-600", children: std.machine })] }), std.description && (_jsx("div", { className: "text-xs text-slate-500 mt-1", children: std.description }))] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-2xl font-black text-blue-600", children: formatMinutes(std.standardMinutes) }), _jsx("div", { className: "text-[10px] text-slate-500 uppercase tracking-widest", children: t('productionStandards.standard_time', 'Standaard Tijd') })] }), _jsx("button", { onClick: () => setEditMode(std.id), className: "p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition", children: _jsx(Edit2, { size: 16 }) }), _jsx("button", { onClick: () => handleDelete(std.id), className: "p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition", children: _jsx(Trash2, { size: 16 }) })] })] })) }, std.id))) }))] })] }));
};
export default ProductionTimeStandardsManager;
