import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { X, ArrowRight, Users, Building2, Clock } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { format, parse } from "date-fns";
import { useNotifications } from '../../../contexts/NotificationContext';
import { loanPersonnelToDepartment } from "../../../services/planningSecurityService";
/**
 * LoanPersonnelModal - Personeel uitlenen aan andere afdelingen (V2)
 * - Teamleaders kunnen tijdelijk personeel aan een andere afdeling uitlenen
 * - Uitgeleende persoon krijgt de shift-tijden van de doelafdeling
 */
const LoanPersonnelModal = ({ isOpen, onClose, person, currentDepartment }) => {
    const { notify } = useNotifications();
    const [targetDepartment, setTargetDepartment] = useState("");
    const [targetStation, setTargetStation] = useState("");
    const [targetShift, setTargetShift] = useState("");
    const [departments, setDepartments] = useState([]);
    const [saving, setSaving] = useState(false);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    // Laad factory configuratie
    useEffect(() => {
        if (!isOpen)
            return;
        const unsubscribe = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
            if (snap.exists()) {
                const config = snap.data();
                // Filter huidige afdeling uit
                const otherDepts = (config.departments || []).filter(d => d.id !== currentDepartment.id);
                setDepartments(otherDepts);
            }
        });
        return () => unsubscribe();
    }, [isOpen, currentDepartment]);
    const selectedDept = departments.find(d => d.id === targetDepartment);
    const availableStations = selectedDept ? selectedDept.stations || [] : [];
    const availableShifts = selectedDept ? selectedDept.shifts || [] : [];
    // Bereken shift uren
    const calculateShiftHours = (shiftObj) => {
        try {
            const start = parse(shiftObj.start, 'HH:mm', new Date());
            const end = parse(shiftObj.end, 'HH:mm', new Date());
            let diff = (end - start) / (1000 * 60 * 60);
            if (diff < 0)
                diff += 24;
            const deduction = shiftObj.id === "DAGDIENST" ? 0.75 : 0; // Pauze aftrek voor dagdienst
            return Math.max(0, diff - deduction);
        }
        catch {
            return 8.0;
        }
    };
    const selectedShift = availableShifts.find(s => s.id === targetShift);
    const shiftHours = selectedShift ? calculateShiftHours(selectedShift) : 0;
    const handleLoan = async () => {
        if (!targetDepartment || !targetStation || !targetShift || !person)
            return;
        setSaving(true);
        try {
            const selectedShiftData = availableShifts.find(s => s.id === targetShift);
            if (!selectedShiftData) {
                notify("Selecteer een geldige shift.");
                setSaving(false);
                return;
            }
            await loanPersonnelToDepartment({
                operatorNumber: person?.operatorNumber,
                operatorName: person?.operatorName,
                targetDepartment,
                targetStation,
                date: todayStr,
                shiftLabel: selectedShiftData.label,
                shiftStart: selectedShiftData.start,
                shiftEnd: selectedShiftData.end,
                hoursWorked: calculateShiftHours(selectedShiftData),
                isPloeg: selectedShiftData.id !== "DAGDIENST",
                loanFromDepartment: currentDepartment?.id,
                loanFromStation: person?.machineId,
                originalShift: person?.shift,
                source: "LoanPersonnelModal",
                actorLabel: auth.currentUser?.email,
            });
            onClose();
        }
        catch (error) {
            console.error("Fout bij uitlenen personeel:", error);
            notify("Er is een fout opgetreden bij het uitlenen van personeel.");
        }
        finally {
            setSaving(false);
        }
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200", children: _jsxs("div", { className: "bg-white rounded-[40px] shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300", children: [_jsx("div", { className: "bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-black uppercase italic tracking-tighter", children: "Personeel Uitlenen" }), _jsx("p", { className: "text-sm text-blue-100 mt-2 font-bold", children: "Tijdelijk toewijzen aan andere afdeling" })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white/20 rounded-xl transition-colors", children: _jsx(X, { size: 24 }) })] }) }), _jsxs("div", { className: "p-8 space-y-6", children: [_jsxs("div", { className: "bg-slate-50 p-6 rounded-3xl border-2 border-slate-200", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "p-2 bg-slate-800 rounded-xl", children: _jsx(Users, { size: 20, className: "text-white" }) }), _jsx("h3", { className: "text-lg font-black text-slate-800 uppercase italic", children: "Huidige Toewijzing" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-bold text-slate-600", children: "Naam:" }), _jsx("span", { className: "text-sm font-black text-slate-900 uppercase italic", children: person?.operatorName })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-bold text-slate-600", children: "Afdeling:" }), _jsx("span", { className: "text-sm font-black text-slate-900 uppercase italic", children: currentDepartment?.name })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-bold text-slate-600", children: "Station:" }), _jsx("span", { className: "text-sm font-black text-slate-900 uppercase italic", children: person?.machineId })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-bold text-slate-600", children: "Shift:" }), _jsxs("span", { className: "text-sm font-black text-slate-900", children: [person?.shiftStart, " - ", person?.shiftEnd] })] })] })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "p-3 bg-blue-100 rounded-full", children: _jsx(ArrowRight, { size: 24, className: "text-blue-600" }) }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "p-2 bg-blue-600 rounded-xl", children: _jsx(Building2, { size: 20, className: "text-white" }) }), _jsx("h3", { className: "text-lg font-black text-slate-800 uppercase italic", children: "Uitlenen Aan" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase tracking-widest mb-2", children: "Doel Afdeling" }), _jsxs("select", { value: targetDepartment, onChange: (e) => {
                                                setTargetDepartment(e.target.value);
                                                setTargetStation(""); // Reset station bij afdeling wijziging
                                            }, className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors", children: [_jsx("option", { value: "", children: "-- Selecteer afdeling --" }), departments.map((dept) => (_jsx("option", { value: dept.id, children: dept.name }, dept.id)))] })] }), targetDepartment && (_jsxs("div", { className: "animate-in slide-in-from-top-2 duration-300", children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase tracking-widest mb-2", children: "Doel Station" }), _jsxs("select", { value: targetStation, onChange: (e) => setTargetStation(e.target.value), className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors", children: [_jsx("option", { value: "", children: "-- Selecteer station --" }), availableStations.map((station) => (_jsx("option", { value: station.name, children: station.name }, station.id)))] })] })), targetDepartment && (_jsxs("div", { className: "animate-in slide-in-from-top-2 duration-300", children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase tracking-widest mb-2", children: "Shift Planning" }), _jsxs("select", { value: targetShift, onChange: (e) => setTargetShift(e.target.value), className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors", children: [_jsx("option", { value: "", children: "-- Selecteer shift --" }), availableShifts.map((shift) => (_jsxs("option", { value: shift.id, children: [shift.label, " (", shift.start, " - ", shift.end, ")"] }, shift.id)))] }), selectedShift && (_jsx("div", { className: "mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl", children: _jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "font-bold text-blue-900", children: "Gewerkte uren:" }), _jsxs("span", { className: "font-black text-blue-600", children: [shiftHours.toFixed(1), " uur"] })] }) }))] }))] }), _jsx("div", { className: "bg-amber-50 border-2 border-amber-200 rounded-2xl p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Clock, { size: 20, className: "text-amber-600 mt-0.5" }), _jsx("div", { className: "flex-1", children: _jsxs("p", { className: "text-sm font-bold text-amber-900", children: [_jsx("strong", { children: "Let op:" }), " De persoon krijgt de shift-tijden van de gekozen afdeling en shift. De originele planning blijft behouden voor referentie."] }) })] }) })] }), _jsxs("div", { className: "p-8 bg-slate-50 flex justify-end gap-4 border-t-2 border-slate-200", children: [_jsx("button", { onClick: onClose, className: "px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 uppercase text-sm hover:bg-slate-100 transition-all", children: "Annuleren" }), _jsx("button", { onClick: handleLoan, disabled: !targetDepartment || !targetStation || !targetShift || saving, className: "px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2", children: saving ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" }), "Bezig..."] })) : (_jsxs(_Fragment, { children: [_jsx(ArrowRight, { size: 16 }), "Uitlenen"] })) })] })] }) }));
};
export default LoanPersonnelModal;
