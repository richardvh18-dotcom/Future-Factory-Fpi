import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { TrendingUp, AlertTriangle, CheckCircle, Calendar, Users, Cpu, X } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { format, startOfWeek, addWeeks, eachWeekOfInterval, getISOWeek, isSameWeek } from "date-fns";
import { nl } from "date-fns/locale";
/**
 * WorkloadHeatmapView - Visual capacity/workload overview
 * Shows machine/operator workload with color-coded intensity
 */
const WorkloadHeatmapView = () => {
    const [occupancy, setOccupancy] = useState([]);
    const [planning, setPlanning] = useState([]);
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState("machine"); // machine | operator
    const [weekRange, setWeekRange] = useState(8); // number of weeks to show
    const [selectedCell, setSelectedCell] = useState(null);
    const viewStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    useEffect(() => {
        // Load occupancy data
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOccupancy(data);
        });
        // Load planning data
        const unsubPlanning = onSnapshot(collection(db, ...PATHS.PLANNING), (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setPlanning(data);
            // Extract unique machines
            const uniqueMachines = [...new Set(data.map(o => o.machine).filter(Boolean))];
            setMachines(uniqueMachines.sort());
            setLoading(false);
        });
        return () => {
            unsubOccupancy();
            unsubPlanning();
        };
    }, []);
    // Calculate weeks to display
    const weeks = useMemo(() => {
        return eachWeekOfInterval({
            start: viewStart,
            end: addWeeks(viewStart, weekRange - 1)
        }, { weekStartsOn: 1 });
    }, [viewStart, weekRange]);
    // Station icon/kleur mapping
    const stationStyles = {
        'Teamleade hub': {
            color: 'bg-yellow-400 text-black border-black',
            icon: _jsx(Users, { size: 20, className: "text-black" })
        },
        'BM': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 20, className: "text-white" })
        },
        'BA': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 20, className: "text-white" })
        },
        'BH': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 20, className: "text-white" })
        },
        'Mazak': {
            color: 'bg-red-500 text-white border-red-700',
            icon: _jsx(TrendingUp, { size: 20, className: "text-white" })
        },
        'Nabewerken': {
            color: 'bg-green-500 text-white border-green-700',
            icon: _jsx(CheckCircle, { size: 20, className: "text-white" })
        },
        'Lossen': {
            color: 'bg-yellow-300 text-black border-yellow-600',
            icon: _jsx(AlertTriangle, { size: 20, className: "text-black" })
        },
        'Algemeen': {
            color: 'bg-orange-400 text-white border-orange-700',
            icon: _jsx(Calendar, { size: 20, className: "text-white" })
        }
    };
    // Calculate workload for a machine in a week
    const getMachineWorkload = (machine, weekStart) => {
        // Get capacity (occupancy)
        const capacity = occupancy
            .filter(o => {
            const occMachine = o.machine || o.machineName || o.machineId;
            if (occMachine !== machine)
                return false;
            if (o.date) {
                return isSameWeek(new Date(o.date), weekStart, { weekStartsOn: 1 });
            }
            // Fallback legacy
            const weekNum = getISOWeek(weekStart);
            const year = weekStart.getFullYear();
            return o.week === weekNum && o.year === year;
        })
            .reduce((sum, o) => {
            let baseHours = parseFloat(o.hoursWorked || o.hours || o.productionHours || 0);
            if (!baseHours || baseHours === 8)
                baseHours = 7;
            return sum + (baseHours * 0.85);
        }, 0);
        // Get demand (planning)
        const demand = planning
            .filter(p => {
            if (p.machine !== machine || !p.plannedDate)
                return false;
            const planDate = new Date(p.plannedDate.seconds * 1000);
            return isSameWeek(planDate, weekStart, { weekStartsOn: 1 });
        })
            .reduce((sum, p) => sum + (p.estimatedHours || p.plan / 10 || 0), 0);
        return { capacity, demand, utilization: capacity > 0 ? (demand / capacity) * 100 : 0 };
    };
    const handleCellClick = (machine, week) => {
        // Filter occupancy details
        const cellOccupancy = occupancy.filter(o => {
            const occMachine = o.machine || o.machineName || o.machineId;
            if (occMachine !== machine)
                return false;
            if (o.date)
                return isSameWeek(new Date(o.date), week, { weekStartsOn: 1 });
            return false;
        });
        // Filter planning details
        const cellPlanning = planning.filter(p => {
            if (p.machine !== machine || !p.plannedDate)
                return false;
            const planDate = new Date(p.plannedDate.seconds * 1000);
            return isSameWeek(planDate, week, { weekStartsOn: 1 });
        });
        setSelectedCell({
            machine,
            week,
            occupancy: cellOccupancy,
            planning: cellPlanning
        });
    };
    // Get color based on utilization %
    const getHeatmapColor = (utilization) => {
        if (utilization === 0)
            return "bg-slate-100 text-slate-400";
        if (utilization < 50)
            return "bg-emerald-200 text-emerald-800";
        if (utilization < 75)
            return "bg-green-300 text-green-900";
        if (utilization < 90)
            return "bg-yellow-300 text-yellow-900";
        if (utilization < 110)
            return "bg-orange-400 text-orange-900";
        return "bg-red-500 text-white";
    };
    // Get status icon
    const getStatusIcon = (utilization) => {
        if (utilization < 75)
            return _jsx(CheckCircle, { size: 16, className: "opacity-70" });
        if (utilization < 110)
            return _jsx(TrendingUp, { size: 16, className: "opacity-70" });
        return _jsx(AlertTriangle, { size: 16 });
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center p-12", children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" }) }));
    }
    return (_jsxs("div", { className: "p-6 bg-slate-50 min-h-screen", children: [_jsx("div", { className: "bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-3xl font-black text-slate-800", children: ["Workload ", _jsx("span", { className: "text-purple-600", children: "Heatmap" })] }), _jsx("p", { className: "text-sm text-slate-600 mt-1", children: "Visueel overzicht van machine/operator belasting" })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setViewMode("machine"), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "machine"
                                                ? "bg-purple-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: "Machines" }), _jsx("button", { onClick: () => setViewMode("operator"), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "operator"
                                                ? "bg-purple-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: "Operators" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setWeekRange(4), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${weekRange === 4
                                                ? "bg-purple-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: "4 Weken" }), _jsx("button", { onClick: () => setWeekRange(8), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${weekRange === 8
                                                ? "bg-purple-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: "8 Weken" }), _jsx("button", { onClick: () => setWeekRange(12), className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${weekRange === 12
                                                ? "bg-purple-500 text-white"
                                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`, children: "12 Weken" })] })] })] }) }), _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden", children: [_jsxs("div", { className: "flex border-b-2 border-slate-200 bg-slate-50", children: [_jsx("div", { className: "w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 font-bold text-sm text-slate-700", children: viewMode === "machine" ? "Machine" : "Operator" }), _jsx("div", { className: "flex-1 overflow-x-auto", children: _jsx("div", { className: "flex", children: weeks.map((week, idx) => (_jsxs("div", { className: "flex-shrink-0 border-r border-slate-200 p-2 text-center", style: { minWidth: "100px" }, children: [_jsx("div", { className: "text-xs text-slate-500", children: format(week, "'Week' w", { locale: nl }) }), _jsx("div", { className: "text-sm font-bold text-slate-800", children: format(week, 'dd MMM', { locale: nl }) })] }, idx))) }) })] }), _jsx("div", { className: "max-h-[600px] overflow-y-auto", children: machines.map((machine, idx) => (_jsxs("div", { className: `flex border-b border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`, children: [_jsx("div", { className: "w-48 flex-shrink-0 p-4 border-r-2 border-slate-200", children: _jsx("div", { className: "font-bold text-sm text-slate-800", children: machine }) }), _jsx("div", { className: "flex-1 overflow-x-auto", children: _jsx("div", { className: "flex", children: weeks.map((week, weekIdx) => {
                                            const workload = getMachineWorkload(machine, week);
                                            // Station specifieke kleur/icon
                                            const stationStyle = stationStyles[machine] || {};
                                            const color = stationStyle.color || getHeatmapColor(workload.utilization);
                                            const icon = stationStyle.icon || getStatusIcon(workload.utilization);
                                            return (_jsxs("div", { onClick: () => handleCellClick(machine, week), className: `flex-shrink-0 border-r border-slate-200 p-3 group relative transition-all hover:scale-105 cursor-pointer ${color}`, style: { minWidth: "100px", minHeight: "80px" }, children: [_jsxs("div", { className: "flex flex-col items-center justify-center h-full", children: [icon, _jsxs("div", { className: "text-lg font-black mt-1", children: [Math.round(workload.utilization), "%"] }), _jsxs("div", { className: "text-xs opacity-70", children: [Math.round(workload.demand), "h / ", Math.round(workload.capacity), "h"] })] }), _jsxs("div", { className: "hidden group-hover:block absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl z-10 whitespace-nowrap text-xs pointer-events-none", children: [_jsxs("div", { className: "font-bold mb-2", children: [machine, " - Week ", getISOWeek(week)] }), _jsxs("div", { children: ["Capaciteit: ", Math.round(workload.capacity), " uur"] }), _jsxs("div", { children: ["Vraag: ", Math.round(workload.demand), " uur"] }), _jsxs("div", { className: "mt-1 pt-1 border-t border-slate-700", children: ["Bezetting: ", Math.round(workload.utilization), "%"] })] })] }, weekIdx));
                                        }) }) })] }, machine))) })] }), _jsxs("div", { className: "mt-6 bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-200", children: [_jsx("h3", { className: "text-sm font-bold text-slate-700 mb-3", children: "Bezettingsgraad:" }), _jsx("div", { className: "flex items-center gap-4", children: [
                            { range: "0%", label: "Geen data", color: "bg-slate-100 text-slate-400" },
                            { range: "< 50%", label: "Lage bezetting", color: "bg-emerald-200 text-emerald-800" },
                            { range: "50-75%", label: "Gezonde bezetting", color: "bg-green-300 text-green-900" },
                            { range: "75-90%", label: "Hoge bezetting", color: "bg-yellow-300 text-yellow-900" },
                            { range: "90-110%", label: "Bijna vol", color: "bg-orange-400 text-orange-900" },
                            { range: "> 110%", label: "Overbelast", color: "bg-red-500 text-white" }
                        ].map(item => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: `w-12 h-6 ${item.color} rounded text-xs font-bold flex items-center justify-center`, children: item.range }), _jsx("span", { className: "text-xs text-slate-600", children: item.label })] }, item.range))) })] }), _jsx("div", { className: "mt-6 grid grid-cols-4 gap-4", children: [
                    {
                        label: "Totaal Machines",
                        value: machines.length,
                        icon: _jsx(TrendingUp, {}),
                        color: "bg-blue-500"
                    },
                    {
                        label: "Gemiddelde Bezetting",
                        value: `${Math.round(machines.reduce((sum, m) => {
                            const avg = weeks.reduce((wSum, w) => {
                                const wl = getMachineWorkload(m, w);
                                return wSum + wl.utilization;
                            }, 0) / weeks.length;
                            return sum + avg;
                        }, 0) / (machines.length || 1))}%`,
                        icon: _jsx(TrendingUp, {}),
                        color: "bg-purple-500"
                    },
                    {
                        label: "Overbelaste Machines",
                        value: machines.filter(m => {
                            const avgUtil = weeks.reduce((sum, w) => {
                                const wl = getMachineWorkload(m, w);
                                return sum + wl.utilization;
                            }, 0) / weeks.length;
                            return avgUtil > 110;
                        }).length,
                        icon: _jsx(AlertTriangle, {}),
                        color: "bg-red-500"
                    },
                    {
                        label: "Gezonde Bezetting",
                        value: machines.filter(m => {
                            const avgUtil = weeks.reduce((sum, w) => {
                                const wl = getMachineWorkload(m, w);
                                return sum + wl.utilization;
                            }, 0) / weeks.length;
                            return avgUtil >= 50 && avgUtil <= 90;
                        }).length,
                        icon: _jsx(CheckCircle, {}),
                        color: "bg-emerald-500"
                    }
                ].map((stat, idx) => (_jsxs("div", { className: "bg-white rounded-xl p-4 border-2 border-slate-200", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-xs font-bold text-slate-600", children: stat.label }), _jsx("div", { className: `${stat.color} text-white p-1.5 rounded-lg`, children: stat.icon })] }), _jsx("div", { className: "text-2xl font-black text-slate-800", children: stat.value })] }, idx))) }), selectedCell && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col", children: [_jsxs("div", { className: "p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic tracking-tighter", children: selectedCell.machine }), _jsxs("p", { className: "text-sm font-bold text-slate-500", children: ["Week ", getISOWeek(selectedCell.week), " \u2022 ", format(selectedCell.week, 'dd MMM yyyy', { locale: nl })] })] }), _jsx("button", { onClick: () => setSelectedCell(null), className: "p-2 hover:bg-slate-200 rounded-full transition-colors", children: _jsx(X, { size: 24, className: "text-slate-500" }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8", children: [_jsxs("div", { children: [_jsxs("h4", { className: "text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2", children: [_jsx(Users, { size: 18 }), " Capaciteit (", Math.round(selectedCell.occupancy.reduce((sum, o) => {
                                                        let baseHours = parseFloat(o.hoursWorked || o.hours || 0);
                                                        if (!baseHours || baseHours === 8)
                                                            baseHours = 7;
                                                        return sum + (baseHours * 0.85);
                                                    }, 0) * 10) / 10, "u)"] }), _jsx("div", { className: "space-y-3", children: selectedCell.occupancy.length === 0 ? (_jsx("p", { className: "text-xs text-slate-400 italic", children: "Geen personeel ingepland." })) : (selectedCell.occupancy.map((occ, idx) => (_jsxs("div", { className: "bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-slate-700 text-sm", children: occ.operatorName }), _jsx("div", { className: "text-[10px] text-emerald-600 font-bold uppercase", children: occ.shift || "Dagdienst" })] }), _jsxs("div", { className: "font-black text-emerald-700 text-right", children: [(() => {
                                                                    let base = parseFloat(occ.hoursWorked || occ.hours || 0);
                                                                    if (!base || base === 8)
                                                                        base = 7;
                                                                    return (Math.round(base * 0.85 * 10) / 10);
                                                                })(), "u", _jsxs("div", { className: "text-[9px] text-emerald-500 font-normal", children: ["(", parseFloat(occ.hoursWorked || occ.hours || 8), "u bruto)"] })] })] }, idx)))) })] }), _jsxs("div", { children: [_jsxs("h4", { className: "text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2", children: [_jsx(TrendingUp, { size: 18 }), " Vraag (", Math.round(selectedCell.planning.reduce((sum, p) => sum + (p.estimatedHours || 0), 0)), "u)"] }), _jsx("div", { className: "space-y-3", children: selectedCell.planning.length === 0 ? (_jsx("p", { className: "text-xs text-slate-400 italic", children: "Geen orders gepland." })) : (selectedCell.planning.map((order, idx) => (_jsxs("div", { className: "bg-blue-50/50 p-3 rounded-xl border border-blue-100", children: [_jsxs("div", { className: "flex justify-between items-start mb-1", children: [_jsx("div", { className: "font-bold text-slate-700 text-sm", children: order.orderId || order.item }), _jsxs("div", { className: "font-black text-blue-700", children: [Math.round(order.estimatedHours || 0), "u"] })] }), _jsx("div", { className: "text-xs text-slate-500 truncate", children: order.itemCode }), _jsxs("div", { className: "flex justify-between items-center mt-2", children: [_jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase", children: order.status }), _jsxs("span", { className: "text-[10px] font-bold text-blue-600", children: [order.plan, " stuks"] })] })] }, idx)))) })] })] }) })] }) }))] }));
};
export default WorkloadHeatmapView;
