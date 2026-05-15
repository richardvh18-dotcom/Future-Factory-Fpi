import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, } from "lucide-react";
import { collection, getDocs, query, where, } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../../../config/firebase";
import { PATHS } from "../../../config/dbPaths";
import { useNotifications } from "../../../contexts/NotificationContext";
import { assignPersonnelToStation, removePersonnelAssignment } from "../../../services/planningSecurityService";
/**
 * StationAssignmentModal
 * Toewijzen van personeel aan werkstations
 */
const StationAssignmentModal = ({ stationId, onClose, department }) => {
    const { showConfirm } = useNotifications();
    const [personnel, setPersonnel] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [selectedOperator, setSelectedOperator] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const location = useLocation();
    const auth = getAuth();
    const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setIsAuthenticated(!!user);
        });
        return () => unsubscribe();
    }, [auth]);
    useEffect(() => {
        let isMounted = true;
        if (!isAuthenticated)
            return;
        const loadData = async () => {
            try {
                // Load personeel
                const personelSnapshot = await getDocs(collection(db, ...PATHS.PERSONNEL));
                setPersonnel(personelSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                if (isMounted) {
                    setPersonnel(personelSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }
                // Load huidige toewijzingen voor dit station vandaag
                const today = new Date().toISOString().split('T')[0];
                const assignQuery = query(collection(db, ...PATHS.OCCUPANCY), where("machineId", "==", stationId), where("date", "==", today));
                const assignSnapshot = await getDocs(assignQuery);
                setAssignments(assignSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
                if (isMounted) {
                    setAssignments(assignSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                    setLoading(false);
                }
            }
            catch (error) {
                console.error("Error loading data:", error);
                setStatus({ type: "error", message: "Fout bij laden van gegevens" });
                setLoading(false);
                if (isMounted) {
                    console.error("Error loading data:", error);
                    setStatus({ type: "error", message: "Fout bij laden van gegevens" });
                    setLoading(false);
                }
            }
        };
        if (stationId)
            loadData();
        return () => { isMounted = false; };
    }, [stationId, isAuthenticated]);
    const handleAssign = async () => {
        if (!selectedOperator) {
            setStatus({ type: "error", message: "Selecteer een operator" });
            return;
        }
        setSaving(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const currentWeek = new Date().getISOWeek ? new Date().getISOWeek() : 1;
            const operator = personnel.find(p => p.id === selectedOperator);
            await assignPersonnelToStation({
                stationId,
                operatorId: selectedOperator,
                operatorNumber: operator?.employeeNumber || selectedOperator,
                operatorName: operator?.name || selectedOperator,
                date: today,
                departmentId: department,
                hoursWorked: 8,
                shiftType: "DAG",
                source: "StationAssignmentModal",
                actorLabel: auth.currentUser?.email,
            });
            setAssignments([
                ...assignments,
                {
                    id: `${stationId}-${selectedOperator}-${today}`,
                    operatorNumber: operator.employeeNumber || selectedOperator,
                    operatorName: operator.name,
                    machineId: stationId,
                    date: today,
                    hoursWorked: 8,
                },
            ]);
            setSelectedOperator("");
            setStatus({ type: "success", message: "Personeelslid toegewezen" });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (error) {
            console.error("Error assigning operator:", error);
            setStatus({ type: "error", message: "Fout bij toewijzing" });
        }
        finally {
            setSaving(false);
        }
    };
    const handleRemove = async (assignmentId) => {
        const confirmed = await showConfirm({
            title: "Toewijzing verwijderen",
            message: "Verwijderen?",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        try {
            await removePersonnelAssignment({
                assignmentId,
                stationId,
                source: "StationAssignmentModal",
                actorLabel: auth.currentUser?.email,
            });
            setAssignments(assignments.filter(a => a.id !== assignmentId));
            setStatus({ type: "success", message: "Toewijzing verwijderd" });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (error) {
            console.error("Error removing assignment:", error);
            setStatus({ type: "error", message: "Fout bij verwijdering" });
        }
    };
    // Beveiliging: Render niets als uitgelogd of op login pagina
    if (!isAuthenticated || !auth.currentUser || location.pathname.includes("/login") || window.location.pathname.includes("/login"))
        return null;
    if (loading) {
        return (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50", children: _jsx("div", { className: "bg-white rounded-2xl p-8 max-w-md w-full", children: _jsx(Loader2, { className: "animate-spin text-blue-600 mx-auto", size: 32 }) }) }));
    }
    const availableOperators = personnel.filter(p => !assignments.some(a => a.operatorNumber === p.employeeNumber));
    return (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl p-6 max-w-md w-full shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsxs("h3", { className: "text-lg font-black uppercase text-slate-800", children: ["Station: ", stationId] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-lg transition", children: _jsx(X, { size: 20 }) })] }), status && (_jsxs("div", { className: `flex items-center gap-2 p-3 rounded-lg mb-4 text-sm font-bold ${status.type === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"}`, children: [status.type === "success" ? (_jsx(CheckCircle2, { size: 16 })) : (_jsx(AlertCircle, { size: 16 })), status.message] })), _jsx("div", { className: "space-y-4 mb-6", children: _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-600 uppercase block mb-2", children: "Operator toevoegen" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("select", { value: selectedOperator, onChange: (e) => setSelectedOperator(e.target.value), className: "flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none", children: [_jsx("option", { value: "", children: "Selecteer..." }), availableOperators.map(op => (_jsxs("option", { value: op.id, children: [op.name, " (", op.employeeNumber, ")"] }, op.id)))] }), _jsx("button", { onClick: handleAssign, disabled: saving || !selectedOperator, className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs disabled:opacity-50 transition", children: _jsx(Plus, { size: 16 }) })] })] }) }), _jsxs("div", { children: [_jsxs("label", { className: "text-xs font-black text-slate-600 uppercase block mb-2", children: ["Huidige toewijzingen (", assignments.length, ")"] }), _jsx("div", { className: "space-y-2 max-h-64 overflow-y-auto", children: assignments.length === 0 ? (_jsx("p", { className: "text-xs text-slate-500 italic", children: "Geen toewijzingen" })) : (assignments.map(assignment => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-slate-800", children: assignment.operatorName }), _jsxs("div", { className: "text-xs text-slate-500", children: [assignment.hoursWorked, "u"] })] }), _jsx("button", { onClick: () => handleRemove(assignment.id), className: "p-2 text-red-600 hover:bg-red-50 rounded-lg transition", children: _jsx(Trash2, { size: 16 }) })] }, assignment.id)))) })] }), _jsx("button", { onClick: onClose, className: "w-full mt-6 px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-black text-xs uppercase tracking-widest transition", children: "Sluit" })] }) }));
};
export default StationAssignmentModal;
