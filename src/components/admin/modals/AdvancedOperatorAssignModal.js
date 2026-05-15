import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useMemo } from 'react';
import { X, AlertTriangle, Clock, Users, Filter, Plus, Minus } from 'lucide-react';
import { getWeek } from 'date-fns';
/**
 * AdvancedOperatorAssignModal - Geavanceerde operator toewijzing
 * - Filter op shift/dienst
 * - Waarschuwing bij dubbele toewijzing
 * - Uren splitsen over meerdere stations
 */
const AdvancedOperatorAssignModal = ({ isOpen, onClose, onAssign, station, department, personnel, shifts, occupancy, selectedDate, currentWeek = getWeek(new Date(), { weekStartsOn: 0 }) }) => {
    const [selectedShift, setSelectedShift] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [hours, setHours] = useState(8.0);
    const [showWarning, setShowWarning] = useState(false);
    // Filter personnel op basis van shift en search
    const filteredPersonnel = useMemo(() => {
        if (!personnel || !department)
            return [];
        return personnel.filter(p => {
            // Afdeling check
            if (p.departmentId !== department.id)
                return false;
            if (p.isActive === false)
                return false;
            // Search query
            if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            // Shift filter
            if (selectedShift !== 'all') {
                // Bereken actuele shift voor persoon met rotatie
                if (p.rotationSchedule?.enabled && p.rotationSchedule.shifts?.length > 0) {
                    const startWeekNum = p.rotationSchedule.startWeek || 1;
                    const rotationShifts = p.rotationSchedule.shifts;
                    const weeksSinceStart = currentWeek - startWeekNum;
                    const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
                    const currentShiftId = rotationShifts[shiftIndex];
                    return currentShiftId === selectedShift;
                }
                // Vaste shift
                return (p.shiftId || 'DAG') === selectedShift;
            }
            return true;
        });
    }, [personnel, department, selectedShift, searchQuery, currentWeek]);
    // Check of persoon al ergens is toegewezen
    const getExistingAssignments = (person) => {
        if (!person || !occupancy)
            return [];
        return occupancy.filter(o => o.operatorNumber === person.employeeNumber &&
            o.date === selectedDate &&
            o.departmentId === department.id);
    };
    // Bereken hoeveel uren nog beschikbaar zijn
    const getAvailableHours = (person) => {
        if (!person)
            return 0;
        const existing = getExistingAssignments(person);
        const totalUsed = existing.reduce((sum, o) => sum + (parseFloat(o.hoursWorked) || 0), 0);
        // Bereken max uren op basis van shift
        let maxHours = 8.0;
        if (person.rotationSchedule?.enabled && shifts) {
            const shift = shifts.find(s => {
                if (person.rotationSchedule.shifts?.length > 0) {
                    const startWeekNum = person.rotationSchedule.startWeek || 1;
                    const rotationShifts = person.rotationSchedule.shifts;
                    const weeksSinceStart = currentWeek - startWeekNum;
                    const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
                    return rotationShifts[shiftIndex] === s.id;
                }
                return false;
            });
            if (shift) {
                const start = new Date(`2000-01-01T${shift.start}`);
                const end = new Date(`2000-01-01T${shift.end}`);
                let diff = (end - start) / (1000 * 60 * 60);
                if (diff < 0)
                    diff += 24;
                const isPloeg = shift.id !== 'DAGDIENST' && shift.id !== undefined;
                const deduction = isPloeg ? 0 : 0.75;
                maxHours = Math.max(0, diff - deduction);
            }
        }
        return Math.max(0, maxHours - totalUsed);
    };
    const handleSelectPerson = (person) => {
        setSelectedPerson(person);
        const existing = getExistingAssignments(person);
        const availableHours = getAvailableHours(person);
        setHours(Math.min(availableHours, 8.0));
        setShowWarning(existing.length > 0);
    };
    const handleConfirm = () => {
        if (!selectedPerson)
            return;
        onAssign(selectedPerson, hours);
        onClose();
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-[40px] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95", children: [_jsxs("div", { className: "p-6 border-b border-slate-200 flex items-center justify-between shrink-0", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-black text-slate-900 uppercase italic tracking-tight", children: "Operator Toewijzen" }), _jsxs("p", { className: "text-xs text-slate-500 mt-1", children: ["Station: ", _jsx("span", { className: "font-bold text-slate-900", children: station?.name })] })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-xl transition-colors", children: _jsx(X, { size: 24, className: "text-slate-400" }) })] }), _jsxs("div", { className: "p-6 border-b border-slate-200 space-y-4 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Filter, { size: 16, className: "text-slate-400" }), _jsx("span", { className: "text-xs font-bold text-slate-600 uppercase", children: "Filters" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase mb-2 block", children: "Dienst/Ploeg" }), _jsxs("select", { value: selectedShift, onChange: (e) => setSelectedShift(e.target.value), className: "w-full p-3 rounded-2xl bg-slate-50 border-2 border-slate-200 text-xs font-bold focus:border-blue-500 outline-none", children: [_jsx("option", { value: "all", children: "Alle diensten" }), shifts?.map(s => (_jsxs("option", { value: s.id, children: [s.label, " (", s.start, "-", s.end, ")"] }, s.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase mb-2 block", children: "Zoeken" }), _jsx("input", { type: "text", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Naam...", className: "w-full p-3 rounded-2xl bg-slate-50 border-2 border-slate-200 text-xs font-bold focus:border-blue-500 outline-none" })] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6 space-y-3", children: filteredPersonnel.length === 0 ? (_jsxs("div", { className: "py-12 text-center", children: [_jsx(Users, { size: 48, className: "mx-auto text-slate-300 mb-3" }), _jsx("p", { className: "text-sm font-bold text-slate-400", children: "Geen operators gevonden" })] })) : (filteredPersonnel.map(person => {
                        const existing = getExistingAssignments(person);
                        const availableHours = getAvailableHours(person);
                        const isSelected = selectedPerson?.id === person.id;
                        return (_jsx("button", { onClick: () => handleSelectPerson(person), className: `w-full p-4 rounded-[25px] border-2 transition-all text-left ${isSelected
                                ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-100'
                                : existing.length > 0
                                    ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                                    : 'bg-white border-slate-200 hover:border-blue-300'}`, children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h4", { className: "font-black text-slate-900 text-xs uppercase truncate", children: person.name }), _jsxs("div", { className: "flex items-center gap-2 mt-1", children: [_jsxs("span", { className: "text-[10px] font-bold text-slate-500", children: ["#", person.employeeNumber] }), person.rotationSchedule?.enabled && (_jsx("span", { className: "text-[9px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-700", children: "PLOEG" }))] })] }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Clock, { size: 12, className: "text-blue-500" }), _jsxs("span", { className: "text-xs font-black text-slate-900", children: [availableHours.toFixed(1), "u"] })] }), existing.length > 0 && (_jsx("span", { className: "text-[9px] font-bold text-amber-600", children: "Al ingepland" }))] })] }) }, person.id));
                    })) }), selectedPerson && (_jsxs("div", { className: "p-6 border-t border-slate-200 space-y-4 shrink-0", children: [showWarning && (_jsxs("div", { className: "p-4 bg-amber-50 border-2 border-amber-200 rounded-[25px] flex items-start gap-3", children: [_jsx(AlertTriangle, { size: 20, className: "text-amber-600 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-black text-amber-900 uppercase mb-1", children: "Al ingepland" }), _jsxs("p", { className: "text-[10px] text-amber-700", children: [selectedPerson.name, " is al toegewezen aan ", getExistingAssignments(selectedPerson).length, " station(s). Nog ", getAvailableHours(selectedPerson).toFixed(1), " uur beschikbaar."] })] })] })), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-bold text-slate-500 uppercase mb-2 block", children: "Uren op dit station" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setHours(Math.max(0.5, hours - 0.5)), className: "p-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors", children: _jsx(Minus, { size: 16, className: "text-slate-600" }) }), _jsx("input", { type: "number", value: hours, onChange: (e) => setHours(Math.max(0, Math.min(getAvailableHours(selectedPerson), parseFloat(e.target.value) || 0))), step: "0.5", min: "0", max: getAvailableHours(selectedPerson), className: "flex-1 p-3 rounded-2xl bg-slate-50 border-2 border-slate-200 text-center text-lg font-black focus:border-blue-500 outline-none" }), _jsx("button", { onClick: () => setHours(Math.min(getAvailableHours(selectedPerson), hours + 0.5)), className: "p-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors", children: _jsx(Plus, { size: 16, className: "text-slate-600" }) })] }), _jsxs("p", { className: "text-[9px] text-slate-500 mt-2 text-center", children: ["Max ", getAvailableHours(selectedPerson).toFixed(1), " uur beschikbaar"] })] }), _jsxs("button", { onClick: handleConfirm, disabled: hours <= 0, className: "w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black uppercase text-sm rounded-[25px] transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed", children: ["Bevestigen (", hours.toFixed(1), "u)"] })] }))] }) }));
};
export default AdvancedOperatorAssignModal;
