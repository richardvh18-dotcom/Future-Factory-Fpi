import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Cpu, Layers, Clock, ChevronUp, ShieldCheck, X, ArrowRight, Copy, Trash2, Save } from "lucide-react";
import { format, getISOWeek, parse, addDays } from "date-fns";
import { db, auth, logActivity } from "../../config/firebase";
import { collection, onSnapshot, query, orderBy, doc } from "firebase/firestore";
import { normalizeMachine } from "../../utils/hubHelpers.tsx";
import { PATHS } from "../../config/dbPaths";
import LoanPersonnelModal from "../digitalplanning/modals/LoanPersonnelModal";
import { useNotifications } from '../../contexts/NotificationContext';
import { savePersonnelRecord, saveOccupancyAssignment, deleteOccupancyAssignment } from "../../services/planningSecurityService";
/**
 * Add/Edit Modal Component (Intern)
 */
const AddEditPersonModal = ({ isOpen, onClose, onSave, initialData, departments, users = [] }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("profile");
    const [formData, setFormData] = useState({
        name: "",
        employeeNumber: "",
        departmentId: "",
        linkedUserId: "",
        shiftId: "DAGDIENST",
        temporaryShiftOverride: {
            enabled: false,
            shiftId: "",
            startDate: "",
            endDate: "",
            note: "",
        },
        role: "operator",
        isActive: true,
        loan: {
            active: false,
            departmentId: "",
            shiftId: "",
            autoReturn: false,
            returnDate: "",
            followRotation: false
        }
    });
    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                temporaryShiftOverride: {
                    enabled: initialData.temporaryShiftOverride?.enabled || false,
                    shiftId: initialData.temporaryShiftOverride?.shiftId || "",
                    startDate: initialData.temporaryShiftOverride?.startDate || "",
                    endDate: initialData.temporaryShiftOverride?.endDate || "",
                    note: initialData.temporaryShiftOverride?.note || "",
                },
                loan: initialData.loan || {
                    active: false,
                    departmentId: "",
                    shiftId: "",
                    autoReturn: false,
                    returnDate: "",
                    followRotation: false
                }
            });
        }
        else {
            setFormData({
                name: "",
                employeeNumber: "",
                departmentId: departments[0]?.id || "",
                linkedUserId: "",
                shiftId: "DAGDIENST",
                temporaryShiftOverride: {
                    enabled: false,
                    shiftId: "",
                    startDate: "",
                    endDate: "",
                    note: "",
                },
                role: "operator",
                isActive: true,
                loan: {
                    active: false,
                    departmentId: "",
                    shiftId: "",
                    autoReturn: false,
                    returnDate: "",
                    followRotation: false
                }
            });
        }
        setActiveTab("profile");
    }, [initialData, isOpen, departments]);
    const loanDept = departments.find(d => d.id === formData.loan?.departmentId);
    const loanShifts = loanDept?.shifts || [];
    const currentDept = departments.find(d => d.id === formData.departmentId);
    const availableShifts = currentDept?.shifts || [{ id: "DAGDIENST", label: t("personnelOccupancy.labels.dayShift") }];
    const temporaryOverride = formData.temporaryShiftOverride || {
        enabled: false,
        shiftId: "",
        startDate: "",
        endDate: "",
        note: "",
    };
    if (!isOpen)
        return null;
    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };
    const handleAutoReturnToggle = (checked) => {
        const newLoan = { ...formData.loan, autoReturn: checked };
        if (checked) {
            newLoan.returnDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
        }
        else {
            newLoan.returnDate = "";
        }
        setFormData({ ...formData, loan: newLoan });
    };
    return (_jsx("div", { className: "fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-[30px] p-8 max-w-md w-full shadow-2xl", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h3", { className: "text-xl font-black text-slate-900 uppercase italic", children: initialData ? t("personnelOccupancy.labels.editEmployee") : t("personnelOccupancy.labels.newEmployee") }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-slate-100 rounded-full", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl", children: [_jsx("button", { type: "button", onClick: () => setActiveTab("profile"), className: `flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "profile" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`, children: t("personnelOccupancy.labels.profile") }), _jsx("button", { type: "button", onClick: () => setActiveTab("loan"), className: `flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "loan" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`, children: t("personnelOccupancy.labels.loan") })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [activeTab === "profile" && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.name") }), _jsx("input", { type: "text", required: true, className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.name, onChange: e => setFormData({ ...formData, name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.employeeNumber") }), _jsx("input", { type: "text", required: true, className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.employeeNumber, onChange: e => setFormData({ ...formData, employeeNumber: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.linkUserAccount") }), _jsxs("select", { className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.linkedUserId || "", onChange: e => setFormData({ ...formData, linkedUserId: e.target.value }), children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.noLink") }), users.map(u => (_jsxs("option", { value: u.id, children: [u.name, " (", u.email, ")"] }, u.id)))] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("common.department") }), _jsxs("select", { className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.departmentId, onChange: e => setFormData({ ...formData, departmentId: e.target.value }), children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.select") }), departments.map(d => _jsx("option", { value: d.id, children: d.name }, d.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.shift") }), _jsx("select", { className: "w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500", value: formData.shiftId, onChange: e => setFormData({ ...formData, shiftId: e.target.value }), children: availableShifts.map(s => (_jsx("option", { value: s.id, children: s.label }, s.id))) })] })] }), _jsxs("div", { className: "p-4 rounded-2xl border-2 border-blue-100 bg-blue-50/50 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[10px] font-black text-blue-800 uppercase tracking-widest", children: t("personnelOccupancy.labels.temporaryShiftOverride") }), _jsx("input", { type: "checkbox", className: "w-4 h-4 rounded text-blue-600", checked: temporaryOverride.enabled, onChange: (e) => {
                                                        const checked = e.target.checked;
                                                        setFormData({
                                                            ...formData,
                                                            temporaryShiftOverride: {
                                                                ...temporaryOverride,
                                                                enabled: checked,
                                                                startDate: checked ? (temporaryOverride.startDate || format(new Date(), "yyyy-MM-dd")) : "",
                                                                endDate: checked ? (temporaryOverride.endDate || temporaryOverride.startDate || format(new Date(), "yyyy-MM-dd")) : "",
                                                            }
                                                        });
                                                    } })] }), temporaryOverride.enabled && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.from") }), _jsx("input", { type: "date", className: "w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500", value: temporaryOverride.startDate, onChange: (e) => setFormData({
                                                                        ...formData,
                                                                        temporaryShiftOverride: {
                                                                            ...temporaryOverride,
                                                                            startDate: e.target.value,
                                                                            endDate: temporaryOverride.endDate || e.target.value,
                                                                        }
                                                                    }) })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.to") }), _jsx("input", { type: "date", className: "w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500", value: temporaryOverride.endDate, onChange: (e) => setFormData({
                                                                        ...formData,
                                                                        temporaryShiftOverride: {
                                                                            ...temporaryOverride,
                                                                            endDate: e.target.value,
                                                                        }
                                                                    }) })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.temporaryShift") }), _jsxs("select", { className: "w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500", value: temporaryOverride.shiftId, onChange: (e) => setFormData({
                                                                ...formData,
                                                                temporaryShiftOverride: {
                                                                    ...temporaryOverride,
                                                                    shiftId: e.target.value,
                                                                }
                                                            }), children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.select") }), availableShifts.map((s) => (_jsx("option", { value: s.id, children: s.label }, s.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.noteOptional") }), _jsx("input", { type: "text", className: "w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500", value: temporaryOverride.note || "", onChange: (e) => setFormData({
                                                                ...formData,
                                                                temporaryShiftOverride: {
                                                                    ...temporaryOverride,
                                                                    note: e.target.value,
                                                                }
                                                            }), placeholder: t("personnelOccupancy.placeholders.temporaryShiftExample") })] })] }))] })] })), activeTab === "loan" && (_jsxs("div", { className: "space-y-4 animate-in slide-in-from-right-4", children: [_jsxs("div", { className: "flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100", children: [_jsx("span", { className: "text-xs font-black text-indigo-800 uppercase", children: t("personnelOccupancy.labels.activeLoan") }), _jsx("input", { type: "checkbox", className: "w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500", checked: formData.loan?.active || false, onChange: e => setFormData({ ...formData, loan: { ...formData.loan, active: e.target.checked } }) })] }), formData.loan?.active && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.targetDepartment") }), _jsxs("select", { className: "w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500", value: formData.loan.departmentId, onChange: e => setFormData({ ...formData, loan: { ...formData.loan, departmentId: e.target.value } }), children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.chooseDepartment") }), departments.filter(d => d.id !== formData.departmentId).map(d => (_jsx("option", { value: d.id, children: d.name }, d.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.targetShift") }), _jsxs("select", { className: "w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500", value: formData.loan.shiftId, onChange: e => setFormData({ ...formData, loan: { ...formData.loan, shiftId: e.target.value } }), children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.chooseShift") }), loanShifts.map(s => (_jsx("option", { value: s.id, children: s.label }, s.id)))] })] }), _jsxs("div", { className: "space-y-2 pt-2", children: [_jsxs("label", { className: "flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "w-4 h-4 rounded text-indigo-600", checked: formData.loan.followRotation, onChange: e => setFormData({ ...formData, loan: { ...formData.loan, followRotation: e.target.checked } }) }), _jsx("span", { className: "text-xs font-bold text-slate-700", children: t("personnelOccupancy.labels.followTargetRotation") })] }), _jsxs("label", { className: "flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "w-4 h-4 rounded text-indigo-600", checked: formData.loan.autoReturn, onChange: e => handleAutoReturnToggle(e.target.checked) }), _jsx("span", { className: "text-xs font-bold text-slate-700", children: t("personnelOccupancy.labels.autoReturnAfter5Days") })] }), formData.loan.autoReturn && formData.loan.returnDate && (_jsx("div", { className: "text-[10px] font-bold text-indigo-600 px-2", children: t("personnelOccupancy.labels.returnDate", { date: formData.loan.returnDate }) }))] })] }))] })), _jsxs("button", { type: "submit", className: "w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4", children: [_jsx(Save, { size: 18 }), " ", t("common.save")] })] })] }) }));
};
/**
 * PersonnelOccupancyView - V40 (Uitleensysteem + Lijstbeheer)
 */
const PersonnelOccupancyView = ({ scope, structure: propStructure, occupancy: propOccupancy, personnel: propPersonnel, users = [], selectedDateStr, editable = true, onCopyYesterday, isCopying = false, onClearToday, isClearing = false }) => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [localPersonnel, setLocalPersonnel] = useState([]);
    const [localOccupancy, setLocalOccupancy] = useState([]);
    const [localStructure, setLocalStructure] = useState({ departments: [] });
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(Date.now());
    // Live uren teller — elke 60 seconden hertekenen
    useEffect(() => {
        const interval = setInterval(() => setTick(Date.now()), 60_000);
        return () => clearInterval(interval);
    }, []);
    // Berekent live uren op basis van startTime, valt terug op hoursWorked
    const getDisplayHours = (occ) => {
        if (occ.startTime) {
            const startMs = occ.startTime.toMillis ? occ.startTime.toMillis() : Number(occ.startTime);
            if (startMs > 0) {
                return ((tick - startMs) / 3_600_000); // milliseconden → uren
            }
        }
        return occ.hoursWorked ?? 0;
    };
    const [expandedSections, setExpandedSections] = useState({});
    // Modals
    const [loanModalOpen, setLoanModalOpen] = useState(false);
    const [selectedPersonForLoan, setSelectedPersonForLoan] = useState(null);
    const [selectedDepartmentForLoan, setSelectedDepartmentForLoan] = useState(null);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedStation, setSelectedStation] = useState(null);
    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [selectedDept, setSelectedDept] = useState(null);
    const [assignShift, setAssignShift] = useState("");
    const [assignHours, setAssignHours] = useState("8.0");
    const [addEditModalOpen, setAddEditModalOpen] = useState(false);
    const [editingPerson, setEditingPerson] = useState(null);
    // Edit Assignment State
    const [editAssignmentModalOpen, setEditAssignmentModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [closedHoursModalOpen, setClosedHoursModalOpen] = useState(false);
    const [closedHoursDraft, setClosedHoursDraft] = useState({});
    // Use props if available, otherwise local state (fallback)
    const structure = propStructure || localStructure;
    const occupancy = propOccupancy || localOccupancy;
    const personnel = propPersonnel || localPersonnel;
    const dateToUse = selectedDateStr || format(new Date(), "yyyy-MM-dd");
    const closedAssignmentsForDate = useMemo(() => {
        return occupancy
            .filter((o) => o.date === dateToUse && (o.isActive === false || !!o.checkedOutAt))
            .sort((a, b) => {
            const aName = String(a.operatorName || a.operatorNumber || "");
            const bName = String(b.operatorName || b.operatorNumber || "");
            return aName.localeCompare(bName);
        });
    }, [occupancy, dateToUse]);
    // 1. DATA SYNC
    useEffect(() => {
        // Only sync if props are not provided
        if (propStructure && propOccupancy && propPersonnel) {
            setLoading(false);
            return;
        }
        const unsubPersonnel = onSnapshot(query(collection(db, ...PATHS.PERSONNEL), orderBy("name")), (snap) => {
            setLocalPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => console.error("Personnel sync error:", error));
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => {
            setLocalOccupancy(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => console.error("Occupancy sync error:", error));
        const unsubStructure = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (docSnap) => {
            if (docSnap.exists()) {
                setLocalStructure(docSnap.data());
                const initialExpanded = {};
                (docSnap.data().departments || []).forEach(d => { initialExpanded[d.id] = true; });
                setExpandedSections(initialExpanded);
            }
            setLoading(false);
        }, (error) => {
            console.error("Factory config sync error:", error);
            setLoading(false);
        });
        return () => {
            unsubPersonnel();
            unsubOccupancy();
            unsubStructure();
        };
    }, [propStructure, propOccupancy, propPersonnel]);
    // 2. DISPLAY SECTIONS
    const displaySections = useMemo(() => {
        const allDepts = structure.departments || [];
        let filtered = allDepts;
        if (scope && typeof scope === 'string' && scope !== 'all') {
            const cleanScope = scope.toLowerCase();
            filtered = allDepts.filter(d => d.id.toLowerCase() === cleanScope || d.slug === cleanScope || d.name.toLowerCase().includes(cleanScope));
        }
        return filtered.map(d => ({
            ...d,
            stations: [...(d.stations || [])].sort((a) => a.name.toLowerCase().includes("teamleader") ? -1 : 1)
        }));
    }, [structure.departments, scope]);
    // 3. CRUD HANDLERS
    const handleSavePerson = async (data) => {
        try {
            const rawOverride = data?.temporaryShiftOverride || {};
            const normalizedOverride = {
                enabled: !!rawOverride.enabled,
                shiftId: String(rawOverride.shiftId || ""),
                startDate: String(rawOverride.startDate || ""),
                endDate: String(rawOverride.endDate || ""),
                note: String(rawOverride.note || ""),
            };
            const withNormalizedData = {
                ...data,
                temporaryShiftOverride: normalizedOverride.enabled && normalizedOverride.shiftId && normalizedOverride.startDate
                    ? {
                        ...normalizedOverride,
                        endDate: normalizedOverride.endDate || normalizedOverride.startDate,
                    }
                    : {
                        enabled: false,
                        shiftId: "",
                        startDate: "",
                        endDate: "",
                        note: "",
                    },
            };
            if (editingPerson) {
                await savePersonnelRecord({
                    personId: editingPerson.id,
                    data: {
                        ...withNormalizedData,
                        updatedAt: "__SERVER_TIMESTAMP__",
                    },
                    source: "PersonnelOccupancyView.savePerson.update",
                    actorLabel: auth.currentUser?.email || "system",
                });
                await logActivity(auth.currentUser?.uid || "system", "PERSONNEL_UPDATE", `Personeel bijgewerkt: ${data?.name || editingPerson.id}`);
            }
            else {
                await savePersonnelRecord({
                    data: {
                        ...withNormalizedData,
                        createdAt: "__SERVER_TIMESTAMP__",
                        updatedAt: "__SERVER_TIMESTAMP__",
                    },
                    source: "PersonnelOccupancyView.savePerson.create",
                    actorLabel: auth.currentUser?.email || "system",
                });
                await logActivity(auth.currentUser?.uid || "system", "PERSONNEL_CREATE", `Personeel toegevoegd: ${data?.name || data?.employeeNumber || "onbekend"}`);
            }
            setAddEditModalOpen(false);
            setEditingPerson(null);
        }
        catch (err) {
            console.error("Fout bij opslaan medewerker:", err);
            notify(t("personnelOccupancy.notifications.saveFailed"));
        }
    };
    const handleDeleteOccupancy = async (occ) => {
        try {
            await deleteOccupancyAssignment({
                assignmentId: occ.id,
                source: "PersonnelOccupancyView.deleteOccupancy",
                actorLabel: auth.currentUser?.email || "system",
            });
            await logActivity(auth.currentUser?.uid || "system", "OCCUPANCY_DELETE", `Bezetting verwijderd: ${occ.operatorName || occ.operatorNumber} op ${occ.machineId}`);
        }
        catch (err) {
            console.error("Verwijderen bezetting mislukt:", err);
            notify(t("personnelOccupancy.notifications.deleteOccupancyFailed"));
        }
    };
    if (loading)
        return _jsx("div", { className: "p-20 text-center", children: _jsx(Loader2, { className: "animate-spin mx-auto text-blue-600", size: 48 }) });
    const getPersonShiftForDate = (person, targetDateStr) => {
        if (!person)
            return null;
        let shiftId = person.shiftId || "DAGDIENST";
        const override = person.temporaryShiftOverride;
        if (override?.enabled && override?.shiftId && override?.startDate) {
            const rangeStart = String(override.startDate);
            const rangeEnd = String(override.endDate || override.startDate);
            if (targetDateStr >= rangeStart && targetDateStr <= rangeEnd) {
                return override.shiftId;
            }
        }
        if (person.rotationSchedule?.enabled && person.rotationSchedule.shifts?.length > 0) {
            const targetDate = parse(targetDateStr, "yyyy-MM-dd", new Date());
            const targetWeek = getISOWeek(targetDate);
            const startWeekNum = person.rotationSchedule.startWeek || 1;
            const rotationShifts = person.rotationSchedule.shifts;
            const weeksSinceStart = targetWeek - startWeekNum;
            const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
            shiftId = rotationShifts[shiftIndex];
        }
        return shiftId;
    };
    const getShiftLabelFromDept = (dept, shiftId) => {
        if (!shiftId)
            return "?";
        const shiftObj = (dept?.shifts || []).find(s => s.id === shiftId);
        return shiftObj?.label || shiftId;
    };
    const getShiftColor = (shiftLabel) => {
        const label = (shiftLabel || "").toUpperCase();
        if (label.includes("OCHTEND") || label.includes("MORNING"))
            return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", ring: "ring-amber-100" };
        if (label.includes("AVOND") || label.includes("EVENING"))
            return { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-100" };
        if (label.includes("NACHT") || label.includes("NIGHT"))
            return { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-100" };
        if (label.includes("DAG") || label === "DAGDIENST")
            return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-100" };
        return { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-100 text-slate-700", ring: "ring-slate-100" };
    };
    return (_jsxs("div", { className: "space-y-4 text-left animate-in fade-in duration-500 w-full pb-4 px-1 h-full overflow-y-auto custom-scrollbar", children: [editable && (_jsx("div", { className: "flex justify-end pr-2", children: _jsxs("button", { onClick: () => {
                        const initialDraft = {};
                        closedAssignmentsForDate.forEach((entry) => {
                            initialDraft[entry.id] = entry.hoursWorked ?? 0;
                        });
                        setClosedHoursDraft(initialDraft);
                        setClosedHoursModalOpen(true);
                    }, className: "px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-700 hover:border-blue-300 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm", children: [_jsx(Clock, { size: 14 }), " ", t("personnelOccupancy.labels.correctHoursAfterward")] }) })), displaySections.map(dept => (_jsxs("section", { className: "space-y-4 text-left", children: [_jsxs("div", { className: "w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 ml-2 p-2 rounded-xl", children: [_jsxs("button", { onClick: () => setExpandedSections(prev => ({ ...prev, [dept.id]: !prev[dept.id] })), className: "flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all", children: [_jsx("div", { className: "p-2 bg-slate-800 text-white rounded-xl shadow-md", children: _jsx(Layers, { size: 16 }) }), _jsx("h3", { className: "text-lg font-black text-slate-800 uppercase italic tracking-tight", children: dept.name })] }), editable && onCopyYesterday && (_jsxs("button", { onClick: (e) => { e.stopPropagation(); onCopyYesterday(dept.id); }, disabled: isCopying, className: "mr-2 p-2 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm", title: t("personnelOccupancy.labels.copyYesterdayTitle"), children: [isCopying ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Copy, { size: 14 }), _jsx("span", { className: "hidden sm:inline", children: t("personnelOccupancy.labels.copyYesterday") })] })), editable && onClearToday && (_jsxs("button", { onClick: (e) => { e.stopPropagation(); onClearToday(dept.id); }, disabled: isClearing, className: "mr-2 p-2 bg-white border border-rose-200 text-rose-500 hover:text-rose-700 hover:border-rose-300 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm", title: t("personnelOccupancy.labels.clearTodayTitle"), children: [isClearing ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Trash2, { size: 14 }), _jsx("span", { className: "hidden sm:inline", children: t("personnelOccupancy.labels.reset") })] })), _jsx("button", { onClick: () => setExpandedSections(prev => ({ ...prev, [dept.id]: !prev[dept.id] })), className: "p-2", children: _jsx(ChevronUp, { className: `transition-transform duration-300 ${expandedSections[dept.id] !== false ? '' : 'rotate-180'}`, size: 20 }) })] }), expandedSections[dept.id] !== false && (_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 animate-in zoom-in-95 duration-200 text-left", children: dept.stations.map(station => {
                            const mId = station.name;
                            const isTL = mId.toLowerCase().includes("teamleader");
                            const stationOccupancy = occupancy.filter((b) => {
                                const sameMachine = normalizeMachine(b.machineId) === normalizeMachine(mId);
                                const sameDate = b.date === dateToUse;
                                const sameDept = b.departmentId === dept.id;
                                const isActive = b.isActive !== false && !b.checkedOutAt;
                                return sameMachine && sameDate && sameDept && isActive;
                            });
                            const isBusy = stationOccupancy.length > 0;
                            const byShift = {};
                            stationOccupancy.forEach(occ => {
                                const shiftKey = occ.shift || "DAGDIENST";
                                if (!byShift[shiftKey])
                                    byShift[shiftKey] = [];
                                byShift[shiftKey].push(occ);
                            });
                            return (_jsxs("div", { className: `p-1.5 rounded-xl border-2 transition-all duration-500 relative flex flex-col shadow-sm min-h-[16rem] max-h-[24rem] ${isTL ? (isBusy ? 'bg-slate-900 border-amber-400 ring-2 ring-amber-400/10 shadow-xl' : 'bg-slate-900 border-slate-800 opacity-80 shadow-inner') : (isBusy ? 'bg-white border-blue-500 ring-2 ring-blue-50/50' : 'bg-white border-slate-100 hover:border-blue-200')}`, style: { cursor: editable ? 'pointer' : 'default' }, onClick: () => {
                                    if (editable) {
                                        setSelectedDept(dept);
                                        setSelectedStation(station);
                                        setSelectedPersonId("");
                                        setAssignShift("");
                                        setAssignHours("8.0");
                                        setAssignModalOpen(true);
                                    }
                                }, children: [_jsxs("div", { className: "flex justify-between items-start mb-1.5 text-left shrink-0", children: [_jsxs("div", { className: "text-left", children: [_jsx("span", { className: `text-[7px] font-black uppercase tracking-widest block mb-0.5 ${isTL ? 'text-amber-500 italic' : 'text-slate-400 opacity-60'}`, children: isTL ? 'Regie' : 'Station ID' }), _jsx("h4", { className: `text-[12px] font-black tracking-tighter italic uppercase truncate leading-none ${isTL ? 'text-white' : 'text-slate-900'}`, children: mId })] }), isTL ? _jsx(ShieldCheck, { size: 16, className: isBusy ? 'text-amber-400' : 'text-slate-600' }) : _jsx(Cpu, { size: 16, className: isBusy ? 'text-blue-600' : 'text-slate-200' })] }), _jsxs("div", { className: "space-y-1 mb-1.5 flex-1 text-left text-left overflow-y-auto pr-1 custom-scrollbar", children: [Object.entries(byShift).map(([shiftKey, operators]) => {
                                                const shiftColors = getShiftColor(shiftKey);
                                                return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-1", children: [_jsx("div", { className: `h-1 flex-1 rounded ${shiftColors.badge}` }), _jsx("span", { className: `text-[8px] font-black uppercase tracking-wider ${shiftColors.text}`, children: shiftKey }), _jsx("div", { className: `h-1 flex-1 rounded ${shiftColors.badge}` })] }), operators.map(occ => (_jsxs("div", { onClick: (e) => {
                                                                if (!editable)
                                                                    return;
                                                                e.stopPropagation();
                                                                setSelectedAssignment({ ...occ });
                                                                setEditAssignmentModalOpen(true);
                                                            }, className: `p-1 rounded-lg border flex flex-col gap-0.5 animate-in slide-in-from-right-1 cursor-pointer hover:scale-[1.02] transition-all ${isTL ? 'bg-white/5 border-white/10 text-white' : `${shiftColors.bg} ${shiftColors.border}`} ${occ.isLoan ? 'ring-2 ring-green-400' : `ring-1 ${shiftColors.ring}`}`, children: [_jsxs("div", { className: "flex items-center justify-between text-left", children: [_jsxs("div", { className: "text-left overflow-hidden text-left flex-1", children: [_jsx("h5", { className: `text-[11px] sm:text-xs font-black uppercase italic truncate mb-0.5 text-left ${isTL ? 'text-amber-400' : shiftColors.text}`, children: occ.operatorName || t("personnelOccupancy.labels.nameless") }), _jsxs("div", { className: "flex items-center gap-1 opacity-70 text-left flex-wrap", children: [_jsx("span", { className: `text-[6px] font-black px-1 py-0 rounded ${occ.isPloeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`, children: occ.shift || (occ.isPloeg ? 'PLOEG' : 'DAG') }), _jsxs("span", { className: `text-[6px] font-bold uppercase ${isTL ? 'text-slate-400' : 'text-slate-600'}`, children: ["#", occ.operatorNumber || "?"] }), occ.isLoan && _jsx("span", { className: "text-[6px] font-black px-1 py-0 rounded bg-green-100 text-green-700", children: t("personnelOccupancy.labels.loaned") })] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [editable && !occ.isLoan && (_jsx("button", { onClick: (e) => { e.stopPropagation(); setSelectedPersonForLoan(occ); setSelectedDepartmentForLoan(dept); setLoanModalOpen(true); }, className: "p-0.5 text-blue-400 hover:text-blue-600 transition-colors", title: t("personnelOccupancy.labels.loanToOtherDepartment"), children: _jsx(ArrowRight, { size: 10 }) })), _jsx("button", { onClick: (e) => { e.stopPropagation(); handleDeleteOccupancy(occ); }, className: "p-0.5 text-slate-400 hover:text-rose-500 transition-colors", children: _jsx(X, { size: 10 }) })] })] }), _jsxs("div", { className: `pt-1 border-t flex items-center justify-between ${isTL ? 'border-white/5' : 'border-slate-300/60'}`, children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Clock, { size: 8, className: shiftColors.text }), _jsx("span", { className: `text-[6px] font-black uppercase tracking-tighter ${isTL ? 'text-slate-500' : 'text-slate-500'}`, children: t("personnelOccupancy.labels.allocation") })] }), _jsxs("span", { className: `text-[10px] sm:text-[11px] font-black ${isTL ? 'text-white' : shiftColors.text}`, children: [getDisplayHours(occ).toFixed(1), "u"] })] })] }, occ.id)))] }, shiftKey));
                                            }), !isBusy && _jsx("div", { className: `py-4 border border-dashed rounded-2xl flex flex-col items-center justify-center opacity-40 ${isTL ? 'border-white/10' : 'border-slate-200'}`, children: _jsx("span", { className: `text-[7px] font-black uppercase tracking-widest text-center ${isTL ? 'text-slate-600' : 'text-slate-400'}`, children: t("personnelOccupancy.labels.free") }) })] })] }, station.id));
                        }) }))] }, dept.id))), _jsx(LoanPersonnelModal, { isOpen: loanModalOpen, onClose: () => { setLoanModalOpen(false); setSelectedPersonForLoan(null); setSelectedDepartmentForLoan(null); }, person: selectedPersonForLoan, currentDepartment: selectedDepartmentForLoan }), _jsx(AddEditPersonModal, { isOpen: addEditModalOpen, onClose: () => { setAddEditModalOpen(false); setEditingPerson(null); }, onSave: handleSavePerson, initialData: editingPerson, departments: structure.departments || [], users: users }), assignModalOpen && selectedDept && (_jsx("div", { className: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h3", { className: "text-xl font-black text-slate-900 uppercase italic", children: t("personnelOccupancy.labels.addPersonnel") }), _jsx("button", { onClick: () => setAssignModalOpen(false), className: "p-2 hover:bg-slate-100 rounded-xl transition-all", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-2", children: t("common.stationMachine") }), _jsxs("select", { value: selectedStation?.id || "", onChange: (e) => setSelectedStation(selectedDept.stations?.find(s => s.id === e.target.value) || null), className: "w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600", disabled: true, children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.selectStation") }), (selectedDept.stations || []).map(s => (_jsx("option", { value: s.id, children: s.name }, s.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-2", children: t("personnelOccupancy.labels.filterByShift") }), _jsxs("select", { value: assignShift, onChange: (e) => { setAssignShift(e.target.value); setSelectedPersonId(""); }, className: "w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600", children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.allShifts") }), (selectedDept.shifts || []).map(s => (_jsx("option", { value: s.id, children: s.label }, s.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-2", children: t("personnelOccupancy.labels.personnelMember") }), _jsxs("select", { value: selectedPersonId, onChange: (e) => setSelectedPersonId(e.target.value), className: "w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600", disabled: !assignShift && personnel.length > 100, children: [_jsx("option", { value: "", children: t("personnelOccupancy.placeholders.selectPersonnelMember") }), personnel
                                                    .filter(p => {
                                                    if (!assignShift)
                                                        return true;
                                                    const pShiftId = getPersonShiftForDate(p, dateToUse);
                                                    return pShiftId === assignShift;
                                                })
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(p => {
                                                    const effectiveShiftId = getPersonShiftForDate(p, dateToUse);
                                                    const displayLabel = getShiftLabelFromDept(selectedDept, effectiveShiftId);
                                                    return (_jsxs("option", { value: p.id, children: [p.name, " (", displayLabel || t("common.unknown"), ")"] }, p.id));
                                                })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-xs font-black text-slate-400 uppercase tracking-widest block mb-2", children: t("personnelOccupancy.labels.allocationDuration") }), _jsx("input", { type: "number", step: "0.5", value: assignHours, onChange: (e) => setAssignHours(e.target.value), className: "w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600", placeholder: t("personnelOccupancy.placeholders.hoursExample") })] }), _jsxs("div", { className: "pt-4 border-t border-slate-200 flex gap-3", children: [_jsx("button", { onClick: () => setAssignModalOpen(false), className: "flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-all", children: t("personnelOccupancy.labels.done") }), _jsx("button", { onClick: async () => {
                                                const person = personnel.find(p => p.id === selectedPersonId);
                                                if (person && selectedStation) {
                                                    // Check op dubbele inplanning
                                                    const existingAssignments = occupancy.filter(o => (o.operatorNumber === person.employeeNumber || o.operatorNumber === person.id) &&
                                                        o.date === dateToUse);
                                                    if (existingAssignments.length > 0) {
                                                        const stations = existingAssignments.map(o => o.machineId).join(", ");
                                                        const confirmMsg = t("personnelOccupancy.confirm.alreadyPlanned", {
                                                            name: person.name,
                                                            stations,
                                                            station: selectedStation.name || selectedStation.id,
                                                            hours: assignHours,
                                                        });
                                                        if (!window.confirm(confirmMsg))
                                                            return;
                                                    }
                                                    // Probeer shift te bepalen op basis van persoon
                                                    let shiftIdToUse = assignShift || getPersonShiftForDate(person, dateToUse);
                                                    let shift = (selectedDept.shifts || []).find(s => s.id === shiftIdToUse);
                                                    // Slimme fallback: Als ID niet gevonden is (bijv. andere afdeling), zoek op NAAM (Label)
                                                    if (!shift && shiftIdToUse) {
                                                        const allDepts = structure.departments || [];
                                                        const personDept = allDepts.find(d => d.id === person.departmentId);
                                                        const originalShift = personDept?.shifts?.find(s => s.id === shiftIdToUse);
                                                        if (originalShift) {
                                                            shift = (selectedDept.shifts || []).find(s => s.label === originalShift.label);
                                                        }
                                                    }
                                                    // Fallback naar DAGDIENST als geen specifieke shift gevonden is
                                                    if (!shift) {
                                                        shift = (selectedDept.shifts || []).find(s => s.id === "DAGDIENST" || s.id === "DAG");
                                                    }
                                                    const isPloeg = shift && shift.id !== "DAGDIENST" && shift.id !== "DAG";
                                                    const timestamp = Date.now();
                                                    const occId = `${selectedDept.id}-${selectedStation.id}-${person.id}-${timestamp}`;
                                                    try {
                                                        await saveOccupancyAssignment({
                                                            assignmentId: occId,
                                                            data: {
                                                                departmentId: selectedDept.id,
                                                                machineId: selectedStation.name || selectedStation.id,
                                                                operatorNumber: person.employeeNumber || person.id,
                                                                operatorName: person.name,
                                                                date: dateToUse,
                                                                hoursWorked: parseFloat(assignHours) || 0,
                                                                startTime: "__SERVER_TIMESTAMP__",
                                                                isPloeg: isPloeg,
                                                                shift: shift ? shift.label : "DAGDIENST",
                                                                isLoan: false,
                                                                updatedAt: "__SERVER_TIMESTAMP__",
                                                            },
                                                            source: "PersonnelOccupancyView.addAssignment",
                                                            actorLabel: auth.currentUser?.email || "system",
                                                        });
                                                        await logActivity(auth.currentUser?.uid || "system", "OCCUPANCY_ASSIGN", `Bezetting toegevoegd: ${person.name} op ${selectedStation.name || selectedStation.id} (${dateToUse})`);
                                                        // Reset selectie voor volgende toevoeging (modal blijft open)
                                                        setSelectedPersonId("");
                                                        setAssignHours("8.0");
                                                    }
                                                    catch (err) {
                                                        console.error("Fout bij toevoegen:", err);
                                                    }
                                                }
                                            }, disabled: !selectedPersonId, className: "flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed", children: t("common.add") })] })] })] }) })), editAssignmentModalOpen && selectedAssignment && (_jsx("div", { className: "fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-[30px] p-8 max-w-sm w-full shadow-2xl border border-white/20", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h3", { className: "text-lg font-black text-slate-900 uppercase italic", children: t("personnelOccupancy.labels.adjustHours") }), _jsx("button", { onClick: () => setEditAssignmentModalOpen(false), className: "p-2 hover:bg-slate-100 rounded-full transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100", children: [_jsx("p", { className: "text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1", children: t("personnelOccupancy.labels.operator") }), _jsx("p", { className: "font-bold text-slate-800 text-sm", children: selectedAssignment.operatorName }), _jsxs("p", { className: "text-[10px] text-slate-500 mt-1", children: ["#", selectedAssignment.operatorNumber] })] }), _jsxs("div", { className: "mb-8", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1", children: t("personnelOccupancy.labels.workedHours") }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", step: "0.5", className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-500 transition-all text-slate-900", value: selectedAssignment.hoursWorked, onChange: (e) => setSelectedAssignment({ ...selectedAssignment, hoursWorked: e.target.value }), autoFocus: true }), _jsx("span", { className: "absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400", children: t("personnelOccupancy.labels.hourShort") })] })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [!selectedAssignment.isLoan && (_jsxs("button", { onClick: () => {
                                        const person = personnel.find(p => p.employeeNumber === selectedAssignment.operatorNumber || p.id === selectedAssignment.operatorNumber);
                                        const dept = structure.departments.find(d => d.id === selectedAssignment.departmentId);
                                        if (person) {
                                            setSelectedPersonForLoan(person);
                                            setSelectedDepartmentForLoan(dept);
                                            setLoanModalOpen(true);
                                            setEditAssignmentModalOpen(false);
                                        }
                                        else {
                                            notify(t("personnelOccupancy.notifications.personDetailsNotFound"));
                                        }
                                    }, className: "w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-100 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2", children: [_jsx(ArrowRight, { size: 18 }), " ", t("personnelOccupancy.labels.loan")] })), _jsxs("button", { onClick: async () => {
                                        try {
                                            await saveOccupancyAssignment({
                                                assignmentId: selectedAssignment.id,
                                                data: {
                                                    hoursWorked: parseFloat(selectedAssignment.hoursWorked) || 0,
                                                    updatedAt: "__SERVER_TIMESTAMP__",
                                                },
                                                source: "PersonnelOccupancyView.editHours",
                                                actorLabel: auth.currentUser?.email || "system",
                                            });
                                            await logActivity(auth.currentUser?.uid || "system", "OCCUPANCY_UPDATE_HOURS", `Uren aangepast: ${selectedAssignment.operatorName || selectedAssignment.operatorNumber} op ${selectedAssignment.machineId} -> ${selectedAssignment.hoursWorked}`);
                                            setEditAssignmentModalOpen(false);
                                        }
                                        catch (err) {
                                            console.error("Update failed", err);
                                            notify(t("personnelOccupancy.notifications.couldNotSaveHours"));
                                        }
                                    }, className: "w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2", children: [_jsx(Save, { size: 18 }), " ", t("common.save")] })] })] }) })), closedHoursModalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-[30px] p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-white/20", children: [_jsxs("div", { className: "flex justify-between items-center mb-5", children: [_jsx("h3", { className: "text-lg font-black text-slate-900 uppercase italic", children: t("personnelOccupancy.labels.correctHoursAfterward") }), _jsx("button", { onClick: () => setClosedHoursModalOpen(false), className: "p-2 hover:bg-slate-100 rounded-full transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsx("p", { className: "text-xs text-slate-500 font-bold mb-4", children: t("personnelOccupancy.labels.closedRegistrationsSummary", { date: dateToUse, count: closedAssignmentsForDate.length }) }), _jsxs("div", { className: "space-y-3", children: [closedAssignmentsForDate.length === 0 && (_jsx("div", { className: "p-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 font-bold", children: t("personnelOccupancy.labels.noClosedRegistrationsForDate") })), closedAssignmentsForDate.map((entry) => (_jsx("div", { className: "p-3 rounded-2xl border border-slate-200 bg-slate-50/40", children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-[1fr_180px_130px] gap-3 items-end", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-black text-slate-800 uppercase tracking-wide", children: entry.operatorName || entry.operatorNumber }), _jsxs("p", { className: "text-[11px] text-slate-500 font-bold mt-1", children: [entry.machineId || t("personnelOccupancy.labels.unknownStation"), " - ", entry.shift || t("personnelOccupancy.labels.unknownShift")] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1", children: t("personnelOccupancy.labels.workedHours") }), _jsx("input", { type: "number", step: "0.25", className: "w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500", value: closedHoursDraft[entry.id] ?? entry.hoursWorked ?? 0, onChange: (e) => {
                                                            setClosedHoursDraft((prev) => ({
                                                                ...prev,
                                                                [entry.id]: e.target.value,
                                                            }));
                                                        } })] }), _jsxs("button", { onClick: async () => {
                                                    try {
                                                        const manualHours = parseFloat(closedHoursDraft[entry.id]);
                                                        await saveOccupancyAssignment({
                                                            assignmentId: entry.id,
                                                            data: {
                                                                hoursWorked: Number.isFinite(manualHours) ? manualHours : 0,
                                                                manualHoursOverride: true,
                                                                manualHoursOverrideAt: "__SERVER_TIMESTAMP__",
                                                                updatedAt: "__SERVER_TIMESTAMP__",
                                                            },
                                                            source: "PersonnelOccupancyView.closedHoursOverride",
                                                            actorLabel: auth.currentUser?.email || "system",
                                                        });
                                                        await logActivity(auth.currentUser?.uid || "system", "OCCUPANCY_UPDATE_HOURS_MANUAL", `Achteraf uren aangepast: ${entry.operatorName || entry.operatorNumber} op ${entry.machineId} -> ${manualHours}`);
                                                    }
                                                    catch (err) {
                                                        console.error("Achteraf uren opslaan mislukt", err);
                                                        notify(t("personnelOccupancy.notifications.couldNotSaveHours"));
                                                    }
                                                }, className: "w-full py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2", children: [_jsx(Save, { size: 14 }), " ", t("common.save")] })] }) }, entry.id)))] })] }) }))] }));
};
export default PersonnelOccupancyView;
