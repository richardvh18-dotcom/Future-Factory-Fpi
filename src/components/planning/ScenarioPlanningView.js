import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { Beaker, Plus, Trash2, Copy, } from "lucide-react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { addDays } from "date-fns";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * ScenarioPlanningView - What-if analysis for capacity planning
 * Simulate changes before implementing them
 */
const ScenarioPlanningView = () => {
    const { showConfirm, notify } = useNotifications();
    const [scenarios, setScenarios] = useState([]);
    const [occupancy, setOccupancy] = useState([]);
    const [planning, setPlanning] = useState([]);
    const [activeScenario, setActiveScenario] = useState(null);
    const [showCreateScenario, setShowCreateScenario] = useState(false);
    const [newScenario, setNewScenario] = useState({
        name: "",
        description: "",
        changes: []
    });
    useEffect(() => {
        // Load scenarios
        const unsubScenarios = onSnapshot(collection(db, ...PATHS.SCENARIOS), (snapshot) => {
            const scenariosData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setScenarios(scenariosData);
        });
        // Load current data
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snapshot) => {
            setOccupancy(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubPlanning = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            setPlanning(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => {
            unsubScenarios();
            unsubOccupancy();
            unsubPlanning();
        };
    }, []);
    // Calculate scenario impact
    const calculateScenarioImpact = (scenario) => {
        if (!scenario)
            return null;
        let modifiedOccupancy = [...occupancy];
        let modifiedPlanning = [...planning];
        // Apply scenario changes
        scenario.changes.forEach(change => {
            switch (change.type) {
                case "add_capacity":
                    modifiedOccupancy = modifiedOccupancy.map(o => o.machine === change.machine
                        ? { ...o, productionHours: (o.productionHours || 0) + change.hours }
                        : o);
                    break;
                case "remove_capacity":
                    modifiedOccupancy = modifiedOccupancy.map(o => o.machine === change.machine
                        ? { ...o, productionHours: Math.max(0, (o.productionHours || 0) - change.hours) }
                        : o);
                    break;
                case "delay_order":
                    modifiedPlanning = modifiedPlanning.map(o => {
                        if (o.id === change.orderId && o.plannedDate) {
                            const oldDate = new Date(o.plannedDate.seconds * 1000);
                            const newDate = addDays(oldDate, change.days);
                            return {
                                ...o,
                                plannedDate: { seconds: newDate.getTime() / 1000 }
                            };
                        }
                        return o;
                    });
                    break;
                case "rush_order":
                    modifiedPlanning = modifiedPlanning.map(o => {
                        if (o.id === change.orderId && o.plannedDate) {
                            const oldDate = new Date(o.plannedDate.seconds * 1000);
                            const newDate = addDays(oldDate, -change.days);
                            return {
                                ...o,
                                plannedDate: { seconds: newDate.getTime() / 1000 }
                            };
                        }
                        return o;
                    });
                    break;
                case "change_efficiency":
                    modifiedOccupancy = modifiedOccupancy.map(o => o.machine === change.machine
                        ? { ...o, efficiency: change.efficiency }
                        : o);
                    break;
            }
        });
        // Calculate metrics
        const totalCapacity = modifiedOccupancy.reduce((sum, o) => sum + (o.productionHours || 0), 0);
        const totalDemand = modifiedPlanning.reduce((sum, o) => sum + (o.estimatedHours || 0), 0);
        const utilization = totalCapacity > 0 ? (totalDemand / totalCapacity) * 100 : 0;
        const gap = totalCapacity - totalDemand;
        // Compare with baseline
        const baselineCapacity = occupancy.reduce((sum, o) => sum + (o.productionHours || 0), 0);
        const baselineDemand = planning.reduce((sum, o) => sum + (o.estimatedHours || 0), 0);
        const baselineGap = baselineCapacity - baselineDemand;
        const capacityChange = totalCapacity - baselineCapacity;
        const gapImprovement = gap - baselineGap;
        return {
            totalCapacity,
            totalDemand,
            utilization,
            gap,
            baselineCapacity,
            baselineDemand,
            baselineGap,
            capacityChange,
            gapImprovement,
            isImprovement: gapImprovement > 0
        };
    };
    const activeScenarioImpact = useMemo(() => calculateScenarioImpact(activeScenario), [activeScenario, occupancy, planning]);
    // Create scenario
    const createScenario = async () => {
        if (!newScenario.name) {
            notify("Geef het scenario een naam");
            return;
        }
        await addDoc(collection(db, ...PATHS.SCENARIOS), {
            ...newScenario,
            createdAt: serverTimestamp(),
            createdBy: "current_user"
        });
        await logActivity(auth.currentUser?.uid, "SCENARIO_CREATE", `Scenario aangemaakt: ${newScenario.name}`);
        setNewScenario({
            name: "",
            description: "",
            changes: []
        });
        setShowCreateScenario(false);
    };
    // Delete scenario
    const deleteScenario = async (scenarioId) => {
        const confirmed = await showConfirm({
            title: "Scenario verwijderen",
            message: "Weet je zeker dat je dit scenario wilt verwijderen?",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        await deleteDoc(doc(db, ...PATHS.SCENARIOS, scenarioId));
        await logActivity(auth.currentUser?.uid, "SCENARIO_DELETE", `Scenario verwijderd: ${scenarioId}`);
        if (activeScenario?.id === scenarioId) {
            setActiveScenario(null);
        }
    };
    // Clone scenario
    const cloneScenario = async (scenario) => {
        await addDoc(collection(db, ...PATHS.SCENARIOS), {
            name: `${scenario.name} (kopie)`,
            description: scenario.description,
            changes: scenario.changes,
            createdAt: serverTimestamp(),
            createdBy: "current_user"
        });
        await logActivity(auth.currentUser?.uid, "SCENARIO_CLONE", `Scenario gekloond: ${scenario.name}`);
    };
    // Add change to new scenario
    const addChange = (changeType) => {
        setNewScenario({
            ...newScenario,
            changes: [
                ...newScenario.changes,
                {
                    id: Date.now(),
                    type: changeType,
                    machine: "",
                    hours: 0,
                    days: 0,
                    orderId: "",
                    efficiency: 0
                }
            ]
        });
    };
    // Remove change
    const removeChange = (changeId) => {
        setNewScenario({
            ...newScenario,
            changes: newScenario.changes.filter(c => c.id !== changeId)
        });
    };
    // Update change
    const updateChange = (changeId, field, value) => {
        setNewScenario({
            ...newScenario,
            changes: newScenario.changes.map(c => c.id === changeId ? { ...c, [field]: value } : c)
        });
    };
    const getChangeTypeLabel = (type) => {
        const labels = {
            add_capacity: "Capaciteit Toevoegen",
            remove_capacity: "Capaciteit Verminderen",
            delay_order: "Order Uitstellen",
            rush_order: "Order Vervroegen",
            change_efficiency: "Efficiency Aanpassen"
        };
        return labels[type] || type;
    };
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: ["Scenario ", _jsx("span", { className: "text-purple-600", children: "Planning" })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: "What-if analyse: simuleer veranderingen voor je ze implementeert" })] }), _jsxs("button", { onClick: () => setShowCreateScenario(!showCreateScenario), className: "flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-bold transition-colors", children: [_jsx(Plus, { size: 16 }), "Nieuw Scenario"] })] }) }), _jsxs("div", { className: "grid grid-cols-3 gap-6", children: [_jsxs("div", { className: "space-y-4", children: [showCreateScenario && (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-purple-200 p-6", children: [_jsx("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: "Nieuw Scenario" }), _jsxs("div", { className: "space-y-4", children: [_jsx("input", { type: "text", placeholder: "Scenario naam...", value: newScenario.name, onChange: (e) => setNewScenario({ ...newScenario, name: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" }), _jsx("textarea", { placeholder: "Beschrijving...", value: newScenario.description, onChange: (e) => setNewScenario({ ...newScenario, description: e.target.value }), className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", rows: "3" }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-bold text-slate-700 uppercase mb-2 block", children: "Wijzigingen" }), _jsx("div", { className: "space-y-2 mb-3", children: newScenario.changes.map(change => (_jsxs("div", { className: "p-3 bg-slate-50 rounded-lg border border-slate-200", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-xs font-bold text-slate-600", children: getChangeTypeLabel(change.type) }), _jsx("button", { onClick: () => removeChange(change.id), className: "text-red-600 hover:text-red-700", children: _jsx(Trash2, { size: 12 }) })] }), (change.type === "add_capacity" || change.type === "remove_capacity") && (_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("input", { type: "text", placeholder: "Machine", value: change.machine, onChange: (e) => updateChange(change.id, "machine", e.target.value), className: "px-2 py-1 text-xs border border-slate-200 rounded" }), _jsx("input", { type: "number", placeholder: "Uren", value: change.hours, onChange: (e) => updateChange(change.id, "hours", parseInt(e.target.value)), className: "px-2 py-1 text-xs border border-slate-200 rounded" })] }))] }, change.id))) }), _jsxs("select", { onChange: (e) => {
                                                            if (e.target.value) {
                                                                addChange(e.target.value);
                                                                e.target.value = "";
                                                            }
                                                        }, className: "w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm", children: [_jsx("option", { value: "", children: "Wijziging toevoegen..." }), _jsx("option", { value: "add_capacity", children: "Capaciteit Toevoegen" }), _jsx("option", { value: "remove_capacity", children: "Capaciteit Verminderen" }), _jsx("option", { value: "delay_order", children: "Order Uitstellen" }), _jsx("option", { value: "rush_order", children: "Order Vervroegen" }), _jsx("option", { value: "change_efficiency", children: "Efficiency Aanpassen" })] })] }), _jsxs("div", { className: "flex gap-2 pt-4 border-t-2 border-slate-200", children: [_jsx("button", { onClick: createScenario, className: "px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-bold transition-colors", children: "Scenario Opslaan" }), _jsx("button", { onClick: () => setShowCreateScenario(false), className: "px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold transition-colors", children: "Annuleren" })] })] })] })), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200", children: [_jsx("div", { className: "p-4 border-b-2 border-slate-200 bg-slate-50", children: _jsxs("h3", { className: "text-sm font-bold text-slate-800", children: ["Scenarios (", scenarios.length, ")"] }) }), _jsx("div", { className: "p-4 space-y-2 max-h-[600px] overflow-y-auto", children: scenarios.length === 0 ? (_jsx("div", { className: "text-center py-12 text-slate-400 text-sm", children: "Nog geen scenarios" })) : (scenarios.map(scenario => (_jsxs("div", { onClick: () => setActiveScenario(scenario), className: `p-4 rounded-xl border-2 cursor-pointer transition-all ${activeScenario?.id === scenario.id
                                                ? "border-purple-500 bg-purple-50"
                                                : "border-slate-200 bg-white hover:border-slate-300"}`, children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-800", children: scenario.name }), _jsx("div", { className: "text-xs text-slate-500 mt-1", children: scenario.description })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        cloneScenario(scenario);
                                                                    }, className: "p-1 hover:bg-blue-100 rounded-lg transition-colors", children: _jsx(Copy, { className: "text-blue-600", size: 14 }) }), _jsx("button", { onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        deleteScenario(scenario.id);
                                                                    }, className: "p-1 hover:bg-red-100 rounded-lg transition-colors", children: _jsx(Trash2, { className: "text-red-600", size: 14 }) })] })] }), _jsxs("div", { className: "text-xs text-slate-500", children: [scenario.changes.length, " wijziging(en)"] })] }, scenario.id)))) })] })] }), _jsx("div", { className: "col-span-2", children: activeScenario && activeScenarioImpact ? (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6", children: [_jsx("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: "Impact Analyse" }), _jsxs("div", { className: "grid grid-cols-3 gap-4 mb-6", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-xs text-slate-500 uppercase mb-1", children: "Capaciteit" }), _jsxs("div", { className: "text-2xl font-black text-slate-800", children: [Math.round(activeScenarioImpact.totalCapacity), "h"] }), _jsxs("div", { className: `text-xs font-bold mt-1 ${activeScenarioImpact.capacityChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`, children: [activeScenarioImpact.capacityChange >= 0 ? '+' : '', Math.round(activeScenarioImpact.capacityChange), "h"] })] }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-xs text-slate-500 uppercase mb-1", children: "Utilization" }), _jsxs("div", { className: "text-2xl font-black text-slate-800", children: [Math.round(activeScenarioImpact.utilization), "%"] }), _jsx("div", { className: `text-xs font-bold mt-1 ${activeScenarioImpact.utilization < 90 ? 'text-emerald-600' : 'text-red-600'}`, children: activeScenarioImpact.utilization < 90 ? 'Gezond' : 'Overbelast' })] }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-xs text-slate-500 uppercase mb-1", children: "Gap" }), _jsxs("div", { className: `text-2xl font-black ${activeScenarioImpact.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`, children: [activeScenarioImpact.gap >= 0 ? '+' : '', Math.round(activeScenarioImpact.gap), "h"] }), _jsx("div", { className: `text-xs font-bold mt-1 ${activeScenarioImpact.isImprovement ? 'text-emerald-600' : 'text-red-600'}`, children: activeScenarioImpact.isImprovement ? '✓ Verbetering' : '✗ Verslechtering' })] })] }), _jsxs("div", { className: "pt-6 border-t-2 border-slate-200", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("span", { className: "text-xs font-bold text-slate-600 uppercase", children: "Baseline" }), _jsxs("span", { className: "text-sm font-bold text-slate-700", children: [Math.round(activeScenarioImpact.baselineCapacity), "h capaciteit /", Math.round(activeScenarioImpact.baselineGap), "h gap"] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-bold text-purple-600 uppercase", children: "Na Scenario" }), _jsxs("span", { className: "text-sm font-bold text-purple-700", children: [Math.round(activeScenarioImpact.totalCapacity), "h capaciteit /", Math.round(activeScenarioImpact.gap), "h gap"] })] })] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6", children: [_jsxs("h3", { className: "text-lg font-bold text-slate-800 mb-4", children: ["Wijzigingen (", activeScenario.changes.length, ")"] }), _jsx("div", { className: "space-y-3", children: activeScenario.changes.map((change, idx) => (_jsxs("div", { className: "p-4 bg-purple-50 border-2 border-purple-200 rounded-xl", children: [_jsx("div", { className: "font-bold text-sm text-slate-800 mb-2", children: getChangeTypeLabel(change.type) }), _jsxs("div", { className: "text-xs text-slate-600", children: [change.machine && `Machine: ${change.machine}`, change.hours && ` | ${change.hours}h`, change.days && ` | ${change.days} dagen`] })] }, idx))) })] })] })) : (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-12 text-center", children: [_jsx(Beaker, { className: "mx-auto mb-4 text-slate-300", size: 48 }), _jsx("div", { className: "text-slate-400", children: "Selecteer een scenario om de impact te analyseren" })] })) })] })] }));
};
export default ScenarioPlanningView;
