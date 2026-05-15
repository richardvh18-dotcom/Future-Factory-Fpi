import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Grid } from "react-window";
import { Search, UserCircle, Edit3, Trash2, Plus, ChevronDown, ChevronUp, Layers, Filter, RotateCcw, ArrowRight, Nfc } from "lucide-react";
import { getISOWeek } from "date-fns";
const PersonnelListView = React.memo(({ personnel = [], departments = [], onEdit, onDelete, onAdd, linkedTagEmployeeKeys = new Set(), expandedDepts: propExpandedDepts, onToggleDept }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [localExpandedDepts, setLocalExpandedDepts] = useState({});
    const [deptFilters, setDeptFilters] = useState({});
    const isControlled = propExpandedDepts !== undefined;
    const expandedDepts = isControlled ? propExpandedDepts : localExpandedDepts;
    const currentWeek = getISOWeek(new Date());
    // Initialize expanded states when departments change (only if not controlled)
    useEffect(() => {
        if (!isControlled && departments.length > 0) {
            const initialDepts = {};
            departments.forEach(d => initialDepts[d.id] = true);
            setLocalExpandedDepts(initialDepts);
        }
    }, [departments, isControlled]);
    const toggleDept = (deptId) => {
        if (isControlled && onToggleDept) {
            onToggleDept(deptId);
        }
        else {
            setLocalExpandedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }));
        }
    };
    const filteredPersonnel = personnel.filter((p) => {
        const term = searchTerm.toLowerCase();
        const name = (p.name || "").toLowerCase();
        const number = (p.employeeNumber || "").toLowerCase();
        return !term || name.includes(term) || number.includes(term);
    });
    const knownDepartmentIds = new Set(departments.map((dept) => dept.id));
    const unmatchedPersonnel = filteredPersonnel.filter((person) => !knownDepartmentIds.has(person.departmentId));
    const isGrouped = departments.length > 0;
    const getEffectiveShift = (p) => {
        if (p.rotationSchedule?.enabled && p.rotationSchedule.shifts?.length > 0) {
            const startWeekNum = p.rotationSchedule.startWeek || 1;
            const rotationShifts = p.rotationSchedule.shifts;
            const weeksSinceStart = currentWeek - startWeekNum;
            const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
            return rotationShifts[shiftIndex];
        }
        return p.shiftId;
    };
    const resolveShiftLabel = (shiftId, deptId) => {
        if (!shiftId || shiftId === "Overig")
            return shiftId;
        const dept = departments.find(d => d.id === deptId);
        if (!dept || !dept.shifts)
            return shiftId;
        const shift = dept.shifts.find(s => s.id === shiftId);
        return shift ? shift.label : shiftId;
    };
    const resolveDepartmentMeta = (deptId) => {
        const dept = departments.find((entry) => entry.id === deptId);
        if (dept) {
            return {
                label: dept.name,
                detail: dept.id,
                isUnmatched: false,
            };
        }
        return {
            label: deptId ? "Ongekoppelde afdeling" : "Geen afdeling",
            detail: deptId || "Niet ingesteld",
            isUnmatched: true,
        };
    };
    const renderCard = React.useCallback((p) => {
        const displayShiftId = getEffectiveShift(p);
        const displayLabel = resolveShiftLabel(displayShiftId, p.departmentId);
        const departmentMeta = resolveDepartmentMeta(p.departmentId);
        const rawEmployeeNumber = String(p.employeeNumber || "").trim();
        const employeeNumberDigits = rawEmployeeNumber.replace(/\D/g, "").replace(/^0+/, "");
        const employeeKey = rawEmployeeNumber.toUpperCase();
        const hasLinkedTag = (employeeKey && linkedTagEmployeeKeys.has(employeeKey)) ||
            (employeeNumberDigits && linkedTagEmployeeKeys.has(employeeNumberDigits));
        return (_jsxs("div", { className: "bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[40px] border-2 border-slate-100 hover:border-blue-400 transition-all group shadow-sm flex flex-col relative overflow-hidden text-left h-full", onClick: () => onEdit && onEdit(p), children: [_jsx("div", { className: "absolute top-0 right-0 p-6 opacity-5 rotate-12 pointer-events-none", children: _jsx(UserCircle, { size: 100 }) }), _jsxs("div", { className: "flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6 relative z-10", children: [_jsx("div", { className: "p-2.5 sm:p-3 bg-slate-900 text-white rounded-2xl shadow-lg shrink-0", children: _jsx(UserCircle, { size: 24 }) }), _jsxs("div", { className: "text-left overflow-hidden min-w-0", children: [_jsx("h4", { className: "font-black text-slate-950 text-base uppercase italic truncate leading-none mb-1.5", children: p.name || "Naamloos" }), _jsx("span", { className: "text-[10px] font-bold text-blue-500 uppercase tracking-widest italic block truncate", children: p.employeeNumber || "Geen ID" })] })] }), _jsxs("div", { className: "space-y-2 mb-4 flex-1", children: [_jsxs("div", { className: `px-2 py-1 rounded-lg border w-fit ${departmentMeta.isUnmatched ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-100 text-slate-500"}`, children: [_jsx("div", { className: "text-[9px] font-bold uppercase tracking-wider", children: departmentMeta.label }), _jsx("div", { className: "text-[8px] font-semibold tracking-wide normal-case opacity-80", children: departmentMeta.detail })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("div", { className: "text-[9px] font-bold uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-slate-500", children: ["Record: ", p.id] }), _jsx("div", { className: `text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${p.isActive === false ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`, children: p.isActive === false ? "Inactief" : "Actief" }), p.currentMachineId && (_jsxs("div", { className: "text-[9px] font-bold uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 text-blue-700", children: ["Machine: ", p.currentMachineId] }))] }), displayShiftId && (_jsxs("div", { className: `text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg w-fit border flex items-center gap-1 ${p.rotationSchedule?.enabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`, children: [p.rotationSchedule?.enabled && _jsx(RotateCcw, { size: 10 }), displayLabel] })), p.loan?.active && (_jsxs("div", { className: "text-[9px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-1 rounded-lg w-fit border border-indigo-100 mt-1 flex items-center gap-1", children: [_jsx(ArrowRight, { size: 10 }), " Uitgeleend"] })), _jsxs("div", { className: `text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg w-fit border mt-1 flex items-center gap-1 ${hasLinkedTag ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`, children: [_jsx(Nfc, { size: 10 }), " ", hasLinkedTag ? "Tag gekoppeld" : "Geen tag gekoppeld"] })] }), _jsxs("div", { className: "pt-4 border-t border-slate-50 flex items-center justify-between opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all mt-auto relative z-10", children: [_jsx("button", { onClick: (e) => {
                                e.stopPropagation();
                                onEdit && onEdit(p);
                            }, className: "p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-xl transition-all", title: "Bewerken", children: _jsx(Edit3, { size: 18 }) }), _jsx("button", { onClick: (e) => {
                                e.stopPropagation();
                                onDelete && onDelete(p.id);
                            }, className: "p-3 text-slate-300 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-all", title: "Verwijderen", children: _jsx(Trash2, { size: 18 }) })] })] }, p.id));
    }, [onEdit, onDelete, currentWeek, departments, linkedTagEmployeeKeys]);
    return (_jsxs("div", { className: "space-y-6 animate-in fade-in", children: [_jsxs("div", { className: "bg-white p-4 rounded-[28px] sm:rounded-[35px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4", children: [_jsxs("div", { className: "relative flex-1 w-full group", children: [_jsx(Search, { className: "absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors", size: 20 }), _jsx("input", { type: "text", placeholder: "Zoek op naam of personeelsnummer...", className: "w-full pl-14 pr-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), onAdd && (_jsxs("button", { onClick: onAdd, className: "px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 active:scale-95 shrink-0 w-full md:w-auto justify-center", children: [_jsx(Plus, { size: 16 }), _jsx("span", { children: "Toevoegen" })] }))] }), isGrouped ? (_jsxs("div", { className: "space-y-4", children: [departments.map(dept => {
                        const deptPersonnel = filteredPersonnel.filter(p => p.departmentId === dept.id);
                        if (searchTerm && deptPersonnel.length === 0)
                            return null;
                        const uniqueShifts = [...new Set(deptPersonnel.map(p => getEffectiveShift(p) || "Overig"))].sort((a, b) => {
                            if (a === "Overig")
                                return 1;
                            if (b === "Overig")
                                return -1;
                            const shiftA = dept.shifts?.find(s => s.id === a);
                            const shiftB = dept.shifts?.find(s => s.id === b);
                            if (shiftA?.start && shiftB?.start) {
                                return shiftA.start.localeCompare(shiftB.start);
                            }
                            return (shiftA?.label || a).localeCompare(shiftB?.label || b);
                        });
                        const activeFilter = deptFilters[dept.id] || "ALL";
                        const threshold = dept.minPersonnel || 4;
                        const displayedPersonnel = activeFilter === "ALL"
                            ? deptPersonnel
                            : deptPersonnel.filter(p => (getEffectiveShift(p) || "Overig") === activeFilter);
                        return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 p-2 rounded-xl gap-2", children: [_jsxs("button", { onClick: () => toggleDept(dept.id), className: "flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all", children: [_jsx("div", { className: "p-2 bg-slate-800 text-white rounded-xl shadow-md", children: _jsx(Layers, { size: 16 }) }), _jsx("h3", { className: "text-base sm:text-lg font-black text-slate-800 uppercase italic tracking-tight truncate", children: dept.name }), _jsxs("span", { className: `text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap ${deptPersonnel.length < threshold ? "text-rose-600 bg-rose-100" : "text-slate-400 bg-slate-100"}`, title: `Minimaal vereist: ${threshold}`, children: ["Totaal: ", deptPersonnel.length] })] }), _jsx("button", { onClick: () => toggleDept(dept.id), className: "p-2", children: expandedDepts[dept.id] ? _jsx(ChevronUp, { size: 20 }) : _jsx(ChevronDown, { size: 20 }) })] }), expandedDepts[dept.id] && (_jsxs("div", { className: "pl-1 sm:pl-4 space-y-4", children: [_jsxs("div", { className: "flex flex-wrap gap-2 mb-2", children: [_jsxs("button", { onClick: () => setDeptFilters(prev => ({ ...prev, [dept.id]: "ALL" })), className: `px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all flex items-center gap-2 ${activeFilter === "ALL" ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`, children: [_jsx(Filter, { size: 12 }), " Alles (", deptPersonnel.length, ")"] }), uniqueShifts.map(shiftId => (_jsxs("button", { onClick: () => setDeptFilters(prev => ({ ...prev, [dept.id]: shiftId })), className: `px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${activeFilter === shiftId ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`, children: [resolveShiftLabel(shiftId, dept.id), " (", deptPersonnel.filter(p => (getEffectiveShift(p) || "Overig") === shiftId).length, ")"] }, shiftId)))] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-4", children: displayedPersonnel.length > 0 ? (displayedPersonnel.map(p => renderCard(p))) : (_jsx("div", { className: "col-span-full text-center py-8 text-slate-400 italic text-sm", children: "Geen personeel gevonden voor dit filter" })) })] }))] }, dept.id));
                    }), unmatchedPersonnel.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "w-full flex items-center justify-between border-b-2 border-amber-200 pb-3 p-2 rounded-xl gap-2 bg-amber-50/60", children: [_jsxs("div", { className: "flex items-center gap-3 text-left flex-1 p-2", children: [_jsx("div", { className: "p-2 bg-amber-500 text-white rounded-xl shadow-md", children: _jsx(Layers, { size: 16 }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "text-base sm:text-lg font-black text-amber-900 uppercase italic tracking-tight truncate", children: "Ongekoppelde afdelingen" }), _jsx("p", { className: "text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-1", children: "Personeel met een oude of onbekende afdeling-ID" })] })] }), _jsxs("span", { className: "text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap text-amber-800 bg-amber-100", children: ["Totaal: ", unmatchedPersonnel.length] })] }), _jsx("div", { className: "pl-1 sm:pl-4 space-y-4", children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-4", children: unmatchedPersonnel.map(p => renderCard(p)) }) })] }))] })) :
                filteredPersonnel.length === 0 ? (_jsxs("div", { className: "col-span-full py-20 text-center opacity-50", children: [_jsx(UserCircle, { size: 64, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "text-sm font-black uppercase tracking-widest text-slate-400", children: "Geen medewerkers gevonden" })] })) : (_jsx("div", { className: "overflow-x-auto", children: _jsx(Grid, { columnCount: 4, rowCount: Math.ceil(filteredPersonnel.length / 4), columnWidth: 320, rowHeight: 260, width: 1320, height: 800, className: "mx-auto", children: ({ columnIndex, rowIndex, style }) => {
                            const idx = rowIndex * 4 + columnIndex;
                            if (idx >= filteredPersonnel.length)
                                return null;
                            const p = filteredPersonnel[idx];
                            return _jsx("div", { style: style, children: renderCard(p) });
                        } }) }))] }));
});
export default PersonnelListView;
