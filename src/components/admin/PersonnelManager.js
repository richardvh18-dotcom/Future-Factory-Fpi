import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Users, Loader2, ShieldCheck, X, Plus, UserPlus, RotateCcw, ChevronLeft, ChevronRight, UserCheck, CalendarDays, TrendingUp, Database, Copy, Save, AlertCircle, Nfc, } from "lucide-react";
import { db, auth, logActivity } from "../../config/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch, } from "firebase/firestore";
import { getISOWeek, format, parse, startOfISOWeek, endOfISOWeek, isWithinInterval, isToday, addDays, subDays, } from "date-fns";
import { nl } from "date-fns/locale";
import { normalizeMachine } from "../../utils/hubHelpers.tsx";
import { PATHS, isValidPath } from "../../config/dbPaths";
import PersonnelOccupancyView from '../personnel/PersonnelOccupancyView';
import PersonnelListView from '../personnel/PersonnelListView';
import NFCTagRegistrationModal from './NFCTagRegistrationModal';
import { DEFAULTS, SHIFT_COLORS } from "../../data/constants";
import { useNotifications } from "../../contexts/NotificationContext";
/**
 * PersonnelManager V26.5 - Root Integrated Edition
 * Beheert de personeelsdatabase en de dagelijkse bezetting op de stations.
 * Locaties:
 * - /future-factory/Users/Personnel (Stamdata)
 * - /future-factory/production/machine_occupancy (Bezetting)
 */
const PersonnelManager = ({ initialViewDate, initialTab }) => {
    const { t } = useTranslation();
    const { showConfirm, notify } = useNotifications();
    const [personnel, setPersonnel] = useState([]);
    const [occupancy, setOccupancy] = useState([]);
    const [structure, setStructure] = useState({ departments: [] });
    const [users, setUsers] = useState([]);
    const [nfcMappings, setNfcMappings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("assignment");
    const [viewDate, setViewDate] = useState(new Date());
    const [timeMode, setTimeMode] = useState("DAY");
    const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
    const [showNFCModal, setShowNFCModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [status, setStatus] = useState(null);
    const [modalTab, setModalTab] = useState("profile");
    const [listExpandedSections, setListExpandedSections] = useState({});
    const initialStateAppliedRef = useRef(false);
    const selectedDateStr = format(viewDate, "yyyy-MM-dd");
    useEffect(() => {
        if (initialStateAppliedRef.current)
            return;
        if (initialTab && ["assignment", "loan", "personnel"].includes(initialTab)) {
            setActiveTab(initialTab);
        }
        if (initialViewDate) {
            const parsed = parse(String(initialViewDate), "yyyy-MM-dd", new Date());
            if (!Number.isNaN(parsed.getTime())) {
                setViewDate(parsed);
            }
        }
        initialStateAppliedRef.current = true;
    }, [initialViewDate, initialTab]);
    const [personForm, setPersonForm] = useState({
        name: "",
        employeeNumber: "",
        departmentId: "",
        linkedUserId: "",
        rotationType: "STATIC",
        shiftId: "DAG",
        isActive: true,
        rotationSchedule: {
            enabled: false,
            startWeek: 1,
            startYear: new Date().getFullYear(),
            shifts: ["DAG"], // Array van shift IDs die roteren
        },
        loan: {
            active: false,
            departmentId: "",
            shiftId: "",
            autoReturn: false,
            returnDate: "",
            followRotation: false
        }
    });
    const isDuplicateNumber = useMemo(() => {
        if (!personForm.employeeNumber)
            return false;
        return personnel.some(p => p.employeeNumber === personForm.employeeNumber && p.id !== editingId);
    }, [personForm.employeeNumber, personnel, editingId]);
    const duplicatePerson = useMemo(() => {
        if (!personForm.employeeNumber)
            return null;
        return personnel.find((person) => person.employeeNumber === personForm.employeeNumber && person.id !== editingId) || null;
    }, [personForm.employeeNumber, personnel, editingId]);
    const linkedTagEmployeeKeys = useMemo(() => {
        const normalize = (value) => String(value || "").trim().toUpperCase();
        const digits = (value) => String(value || "").replace(/\D/g, "").replace(/^0+/, "");
        const keys = new Set();
        nfcMappings.forEach((mapping) => {
            const normalized = normalize(mapping.employeeNumber);
            const numeric = digits(mapping.employeeNumber);
            if (normalized)
                keys.add(normalized);
            if (numeric)
                keys.add(numeric);
        });
        return keys;
    }, [nfcMappings]);
    const currentPersonNfcMappings = useMemo(() => {
        if (!editingId)
            return [];
        const normalized = String(personForm.employeeNumber || "").trim().toUpperCase();
        const numeric = String(personForm.employeeNumber || "").replace(/\D/g, "").replace(/^0+/, "");
        return nfcMappings.filter((mapping) => {
            const mapEmployee = String(mapping.employeeNumber || "").trim().toUpperCase();
            const mapNumeric = String(mapping.employeeNumber || "").replace(/\D/g, "").replace(/^0+/, "");
            if (normalized && mapEmployee === normalized)
                return true;
            return Boolean(numeric && mapNumeric && numeric === mapNumeric);
        });
    }, [editingId, personForm.employeeNumber, nfcMappings]);
    // 1. DATA SYNC MET DE ROOT
    useEffect(() => {
        if (!isValidPath("PERSONNEL") || !isValidPath("OCCUPANCY"))
            return;
        const unsubPersonnel = onSnapshot(query(collection(db, ...PATHS.PERSONNEL), orderBy("name")), (snap) => setPersonnel(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
        const unsubOccupancy = onSnapshot(collection(db, ...PATHS.OCCUPANCY), (snap) => setOccupancy(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
        const unsubStructure = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setStructure(data);
                // Initialize expanded sections for list view
                const initialExpanded = {};
                (data.departments || []).forEach(d => { initialExpanded[d.id] = true; });
                setListExpandedSections(prev => Object.keys(prev).length === 0 ? initialExpanded : prev);
            }
            setLoading(false);
        });
        const unsubUsers = onSnapshot(collection(db, ...PATHS.USERS), (snap) => setUsers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
        const unsubNfcMappings = onSnapshot(collection(db, ...PATHS.NFC_TAG_MAPPINGS), (snap) => setNfcMappings(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
        return () => {
            unsubPersonnel();
            unsubOccupancy();
            unsubStructure();
            unsubUsers();
            unsubNfcMappings();
        };
    }, []);
    // --- HELPERS ---
    const getShiftsForDept = (deptId) => {
        const dept = (structure.departments || []).find((d) => d.id === deptId);
        return dept && dept.shifts && dept.shifts.length > 0
            ? dept.shifts
            : [{ id: "DAG", label: t('personnel.dayShift', "Dagdienst"), start: "07:15", end: "16:00" }];
    };
    const getDepartmentLabel = (deptId) => {
        if (!deptId)
            return "Geen afdeling";
        const dept = (structure.departments || []).find((entry) => entry.id === deptId);
        return dept ? `${dept.name} (${dept.id})` : `Ongekoppelde afdeling (${deptId})`;
    };
    const getShiftHours = (person, deptId, forDate = viewDate) => {
        const shifts = getShiftsForDept(deptId);
        let activeShift;
        // Check of rotatie actief is
        if (person.rotationSchedule?.enabled && person.rotationSchedule.shifts?.length > 0) {
            const currentWeekNum = getISOWeek(forDate);
            const startWeekNum = person.rotationSchedule.startWeek || 1;
            const rotationShifts = person.rotationSchedule.shifts;
            // Bereken welke shift nu actief is (cyclisch roteren)
            const weeksSinceStart = currentWeekNum - startWeekNum;
            const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
            const currentShiftId = rotationShifts[shiftIndex];
            activeShift = shifts.find((s) => s.id === currentShiftId) || shifts[0];
        }
        else {
            // Normale vaste shift
            activeShift = shifts.find((s) => s.id === person.shiftId) || shifts[0];
        }
        try {
            const start = parse(activeShift.start, "HH:mm", new Date());
            const end = parse(activeShift.end, "HH:mm", new Date());
            let diff = (end - start) / (1000 * 60 * 60);
            if (diff < 0)
                diff += 24;
            const deduction = DEFAULTS.BREAK_DEDUCTION; // Pauze correctie
            return {
                label: activeShift.label,
                total: Math.max(0, diff - deduction),
                times: `${activeShift.start}-${activeShift.end}`,
            };
        }
        catch {
            return { label: t('personnel.dayShift', "Dagdienst"), total: DEFAULTS.SHIFT_HOURS, times: "07:15-16:00" };
        }
    };
    const kpiData = useMemo(() => {
        const startWeek = startOfISOWeek(viewDate);
        const endWeek = endOfISOWeek(viewDate);
        const stats = { global: { hours: 0, count: 0 }, byDept: {}, production: 0, support: 0, efficiency: 0 };
        (structure.departments || []).forEach((d) => {
            stats.byDept[d.id] = {
                name: d.name,
                hours: 0,
                count: 0,
                operators: new Set(),
            };
        });
        const globalOperators = new Set();
        occupancy.forEach((occ) => {
            let match = timeMode === "DAY"
                ? occ.date === selectedDateStr
                : isWithinInterval(parse(occ.date, "yyyy-MM-dd", new Date()), {
                    start: startWeek,
                    end: endWeek,
                });
            if (match) {
                const netHours = parseFloat(occ.hoursWorked || 0);
                stats.global.hours += netHours;
                globalOperators.add(occ.operatorNumber);
                if (stats.byDept[occ.departmentId]) {
                    stats.byDept[occ.departmentId].hours += netHours;
                    stats.byDept[occ.departmentId].operators.add(occ.operatorNumber);
                }
                // Productie vs Ondersteuning logica
                const machineId = (occ.machineId || "").toUpperCase().replace(/\s/g, "");
                const isBH = machineId.includes("BH");
                const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                if (isBH || isBA) {
                    stats.production += netHours;
                }
                else {
                    stats.support += netHours;
                }
            }
        });
        stats.global.count = globalOperators.size;
        Object.keys(stats.byDept).forEach((id) => {
            stats.byDept[id].count = stats.byDept[id].operators.size;
        });
        if (stats.global.hours > 0) {
            stats.efficiency = (stats.production / stats.global.hours) * 100;
        }
        return stats;
    }, [occupancy, timeMode, selectedDateStr, viewDate, structure.departments]);
    // --- HANDLERS ---
    const handleAssign = async (machineId, operatorNumber, deptId) => {
        try {
            const colPath = PATHS.OCCUPANCY;
            if (!operatorNumber || operatorNumber === "") {
                const toDelete = occupancy.filter((o) => normalizeMachine(o.machineId) === normalizeMachine(machineId) &&
                    o.date === selectedDateStr &&
                    o.departmentId === deptId);
                for (const docToDel of toDelete)
                    await deleteDoc(doc(db, ...colPath, docToDel.id));
                if (toDelete.length > 0) {
                    await logActivity(auth.currentUser?.uid, "OCCUPANCY_CLEAR", `Bezetting gewist op ${machineId} (${deptId}) voor ${selectedDateStr}: ${toDelete.length} record(s)`);
                }
                return;
            }
            const person = personnel.find((p) => p.employeeNumber === operatorNumber);
            if (!person)
                return;
            const assignmentId = `${selectedDateStr}_${deptId}_${machineId}_${person.employeeNumber}`.replace(/[^a-zA-Z0-9]/g, "_");
            const shiftInfo = getShiftHours(person, deptId, parse(selectedDateStr, "yyyy-MM-dd", new Date()));
            await setDoc(doc(db, ...colPath, assignmentId), {
                id: assignmentId,
                machineId,
                operatorNumber: person.employeeNumber,
                operatorName: person.name,
                departmentId: deptId,
                date: selectedDateStr,
                hoursWorked: shiftInfo.total,
                shift: shiftInfo.label,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            await logActivity(auth.currentUser?.uid, "OCCUPANCY_ASSIGN", `Operator ${person.employeeNumber} toegewezen aan ${machineId} (${deptId}) op ${selectedDateStr}`);
        }
        catch (err) {
            console.error(err);
        }
    };
    const handleRemoveAssignment = async (assignmentId) => {
        await deleteDoc(doc(db, ...PATHS.OCCUPANCY, assignmentId));
        await logActivity(auth.currentUser?.uid, "OCCUPANCY_DELETE", `Bezettingsrecord verwijderd: ${assignmentId}`);
    };
    const handleCopyYesterday = async (targetDeptId = null) => {
        // Als het maandag is (1), kopieer van vrijdag (3 dagen terug), anders gisteren (1 dag)
        const isMonday = viewDate.getDay() === 1;
        const daysBack = isMonday ? 3 : 1;
        const sourceDateStr = format(subDays(viewDate, daysBack), "yyyy-MM-dd");
        let sourceData = occupancy.filter((o) => o.date === sourceDateStr && o.operatorNumber);
        if (targetDeptId && typeof targetDeptId === 'string') {
            sourceData = sourceData.filter(o => o.departmentId === targetDeptId);
        }
        if (sourceData.length === 0)
            return notify(t('personnel.noOccupancyFound', { day: isMonday ? t('common.friday') : t('common.yesterday') }) + (typeof targetDeptId === 'string' ? t('personnel.forThisDept') : "."));
        setIsCopying(true);
        try {
            const batch = writeBatch(db);
            sourceData.forEach((old) => {
                // Zoek persoon op om rotatie te checken en shift te herberekenen voor VANDAAG
                const person = personnel.find(p => p.employeeNumber === old.operatorNumber);
                let newShiftLabel = old.shift;
                let newHours = old.hoursWorked;
                if (person) {
                    // Herbereken shift voor de DOEL datum (viewDate) op basis van rotatie schema
                    const shiftInfo = getShiftHours(person, old.departmentId, viewDate);
                    newShiftLabel = shiftInfo.label;
                    newHours = shiftInfo.total;
                }
                const newId = `${selectedDateStr}_${old.departmentId}_${old.machineId}_${old.operatorNumber}`.replace(/[^a-zA-Z0-9]/g, "_");
                batch.set(doc(db, ...PATHS.OCCUPANCY, newId), {
                    ...old,
                    id: newId,
                    date: selectedDateStr,
                    shift: newShiftLabel, // Gebruik herberekende shift (juiste rotatie)
                    hoursWorked: newHours,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            });
            await batch.commit();
            await logActivity(auth.currentUser?.uid, "OCCUPANCY_COPY", `Bezetting gekopieerd van ${sourceDateStr} naar ${selectedDateStr}: ${sourceData.length} record(s)`);
            setStatus({
                type: "success",
                msg: t('personnel.copiedCount', { count: sourceData.length, day: isMonday ? t('common.friday') : t('common.yesterday') }),
            });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (err) {
            notify(err.message);
        }
        finally {
            setIsCopying(false);
        }
    };
    const handleSavePerson = async (e) => {
        e.preventDefault();
        if (duplicatePerson) {
            notify(`Personeelsnummer ${personForm.employeeNumber} is al in gebruik door ${duplicatePerson.name || "onbekend"} (${duplicatePerson.id}).`);
            return;
        }
        setSaving(true);
        try {
            const docId = editingId || `P_${personForm.employeeNumber}`;
            await setDoc(doc(db, ...PATHS.PERSONNEL, docId), {
                ...personForm,
                lastUpdated: serverTimestamp(),
                updatedBy: auth.currentUser?.email || "Admin",
            }, { merge: true });
            await logActivity(auth.currentUser?.uid, editingId ? "PERSONNEL_UPDATE" : "PERSONNEL_CREATE", `${editingId ? "Personeel bijgewerkt" : "Personeel aangemaakt"}: ${personForm.name} (${personForm.employeeNumber})`);
            setIsPersonModalOpen(false);
            setEditingId(null);
            setStatus({ type: "success", msg: t('personnel.saved', "Medewerker opgeslagen") });
            setTimeout(() => setStatus(null), 3000);
        }
        catch (err) {
            notify(t('common.error', { message: err.message }));
        }
        finally {
            setSaving(false);
        }
    };
    const openEditPerson = (person) => {
        setPersonForm({
            ...person,
            loan: person.loan || {
                active: false,
                departmentId: "",
                shiftId: "",
                autoReturn: false,
                returnDate: "",
                followRotation: false
            },
            linkedUserId: person.linkedUserId || ""
        });
        setEditingId(person.id);
        setModalTab("profile");
        setIsPersonModalOpen(true);
    };
    const handleAutoReturnToggle = (checked) => {
        const newLoan = { ...personForm.loan, autoReturn: checked };
        if (checked) {
            newLoan.returnDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
        }
        else {
            newLoan.returnDate = "";
        }
        setPersonForm({ ...personForm, loan: newLoan });
        setIsPersonModalOpen(true);
    };
    const handleRemovePersonNfcTag = async (mappingId, tagId) => {
        const confirmed = await showConfirm({
            title: "NFC-tag verwijderen",
            message: `Koppeling ${tagId || mappingId} verwijderen?`,
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            tone: "danger",
        });
        if (!confirmed)
            return;
        try {
            await deleteDoc(doc(db, ...PATHS.NFC_TAG_MAPPINGS, mappingId));
            await logActivity(auth.currentUser?.uid, "NFC_TAG_UNLINK", `NFC tag ontkoppeld van ${personForm.name || personForm.employeeNumber}: ${tagId || mappingId}`);
            setStatus({ type: "success", msg: "NFC-tag verwijderd" });
            setTimeout(() => setStatus(null), 2500);
        }
        catch (err) {
            notify(t("common.error", { message: err.message }));
        }
    };
    const loanDept = structure.departments?.find(d => d.id === personForm.loan?.departmentId);
    const loanShifts = loanDept?.shifts || [];
    if (loading)
        return (_jsxs("div", { className: "h-full flex items-center justify-center bg-slate-50 gap-4", children: [_jsx(Loader2, { className: "animate-spin text-blue-600", size: 48 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: t('personnel.syncingIdentities', "Identiteiten synchroniseren...") })] }));
    return (_jsxs("div", { className: "h-full flex flex-col bg-slate-50 overflow-hidden text-left animate-in fade-in", children: [_jsxs("div", { className: "p-4 bg-white border-b border-slate-200 flex flex-col gap-4 shrink-0 z-20 shadow-sm", children: [_jsxs("div", { className: "flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-slate-900 text-white rounded-[18px] shadow-xl", children: _jsx(Users, { size: 22 }) }), _jsxs("div", { className: "text-left text-left", children: [_jsxs("h2", { className: "text-xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [t('personnel.title', "Personeel & Bezetting"), " ", _jsx("span", { className: "text-blue-600 text-sm", children: "/ Resource Control" })] }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic", children: [_jsx(ShieldCheck, { size: 9 }), " ", t('personnel.rootAuthorized', "Root Authorized")] }), _jsxs("p", { className: "text-[8px] font-mono text-slate-400 uppercase tracking-widest", children: ["Node: /", PATHS.PERSONNEL.join("/")] })] })] })] }), _jsx("div", { className: "w-full lg:w-auto overflow-x-auto no-scrollbar pb-1", children: _jsxs("div", { className: "flex items-center gap-2 sm:gap-3 min-w-max", children: [_jsxs("div", { className: "flex bg-slate-100 p-1 rounded-xl shrink-0", children: [_jsxs("button", { onClick: () => setTimeMode("DAY"), className: `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${timeMode === "DAY"
                                                        ? "bg-white text-blue-600 shadow-sm"
                                                        : "text-slate-400"}`, children: [_jsx(CalendarDays, { size: 12 }), " ", t('common.day', "Dag")] }), _jsxs("button", { onClick: () => setTimeMode("WEEK"), className: `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${timeMode === "WEEK"
                                                        ? "bg-white text-emerald-600 shadow-sm"
                                                        : "text-slate-400"}`, children: [_jsx(TrendingUp, { size: 12 }), " ", t('common.week', "Week")] })] }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-xl shrink-0", children: [_jsx("button", { onClick: () => setActiveTab("assignment"), className: `px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "assignment"
                                                        ? "bg-white text-slate-900 shadow-sm"
                                                        : "text-slate-400"}`, children: t('personnel.occupancy', "Bezetting") }), _jsx("button", { onClick: () => setActiveTab("loan"), className: `px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "loan"
                                                        ? "bg-white text-indigo-900 shadow-sm"
                                                        : "text-slate-400"}`, children: t('personnel.lending', "Uitlenen") }), _jsx("button", { onClick: () => setActiveTab("personnel"), className: `px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "personnel"
                                                        ? "bg-white text-slate-900 shadow-sm"
                                                        : "text-slate-400"}`, children: t('personnel.staff', "Personeel") })] }), _jsxs("button", { onClick: () => {
                                                setEditingId(null);
                                                const currentWeek = getISOWeek(new Date());
                                                setPersonForm({
                                                    name: "",
                                                    employeeNumber: "",
                                                    departmentId: structure.departments[0]?.id || "",
                                                    linkedUserId: "",
                                                    rotationType: "STATIC",
                                                    shiftId: "DAG",
                                                    isActive: true,
                                                    rotationSchedule: {
                                                        enabled: false,
                                                        startWeek: currentWeek,
                                                        startYear: new Date().getFullYear(),
                                                        shifts: ["DAG"],
                                                    },
                                                    loan: {
                                                        active: false,
                                                        departmentId: "",
                                                        shiftId: "",
                                                        autoReturn: false,
                                                        returnDate: "",
                                                        followRotation: false
                                                    }
                                                });
                                                setModalTab("profile");
                                                setIsPersonModalOpen(true);
                                            }, className: "bg-blue-600 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 shrink-0", children: [_jsx(Plus, { size: 16 }), " ", t('common.new', "Nieuw")] }), _jsxs("button", { onClick: () => setShowNFCModal(true), className: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-95 flex items-center gap-2 shrink-0", title: "Druppels koppelen aan personeelsleden", children: [_jsx(Nfc, { size: 16 }), " NFC-tags"] })] }) })] }), _jsxs("div", { className: "flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 border-t border-slate-50 pt-3", children: [_jsxs("div", { className: "w-full md:w-auto flex items-center justify-between md:justify-start gap-3 bg-slate-900 text-white p-1.5 rounded-[20px] shadow-2xl", children: [_jsx("button", { onClick: () => setViewDate((prev) => subDays(prev, 1)), className: "p-2.5 hover:bg-white/10 rounded-xl transition-all", children: _jsx(ChevronLeft, { size: 20 }) }), _jsxs("div", { className: "flex flex-col items-center px-2 sm:px-6 min-w-0 md:min-w-[200px]", children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1", children: isToday(viewDate)
                                                    ? t('common.today', "Vandaag")
                                                    : format(viewDate, "eeee", { locale: nl }) }), _jsx("span", { className: "text-sm sm:text-base font-black uppercase italic tracking-tight text-center", children: format(viewDate, "dd MMMM yyyy", { locale: nl }) })] }), _jsx("button", { onClick: () => setViewDate((prev) => addDays(prev, 1)), className: "p-2.5 hover:bg-white/10 rounded-xl transition-all", children: _jsx(ChevronRight, { size: 20 }) })] }), _jsxs("div", { className: "w-full md:w-auto flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm", children: [_jsx(CalendarDays, { size: 14, className: "text-slate-500" }), _jsx("input", { type: "date", value: selectedDateStr, onChange: (e) => {
                                            const parsed = parse(e.target.value, "yyyy-MM-dd", new Date());
                                            if (!Number.isNaN(parsed.getTime())) {
                                                setViewDate(parsed);
                                            }
                                        }, className: "bg-transparent text-xs font-black text-slate-700 outline-none w-full" }), _jsx("button", { onClick: () => setViewDate(new Date()), className: "px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black uppercase text-slate-600", children: "Vandaag" })] }), _jsxs("button", { onClick: handleCopyYesterday, disabled: isCopying, className: `w-full md:w-auto px-6 py-3 border-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-sm ${viewDate.getDay() === 1
                                    ? "bg-orange-50 border-orange-200 text-orange-600 hover:border-orange-400 hover:text-orange-700"
                                    : "bg-white border-slate-100 text-slate-400 hover:border-blue-500 hover:text-blue-600"}`, children: [isCopying ? (_jsx(Loader2, { className: "animate-spin", size: 16 })) : (_jsx(Copy, { size: 16 })), " ", viewDate.getDay() === 1 ? t('personnel.copyFriday', "Herhaal Vrijdag") : t('personnel.copyYesterday', "Herhaal Gisteren")] }), status && (_jsx("div", { className: "w-full md:w-auto bg-emerald-50 text-emerald-600 px-4 md:px-6 py-3 rounded-2xl border border-emerald-100 text-[10px] font-black uppercase animate-in zoom-in text-center", children: status.msg })), activeTab === "assignment" && (_jsx("div", { className: "w-full md:flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar py-2 md:justify-end", children: _jsxs("div", { className: "bg-slate-900 px-6 py-4 rounded-3xl flex items-center gap-6 border border-white/5 shadow-xl shrink-0", children: [_jsxs("div", { className: "text-left", children: [_jsx("span", { className: "text-[9px] font-black text-blue-400 uppercase block mb-1", children: t('personnel.totalVolume', "Totaal Volume") }), _jsxs("div", { className: "flex items-baseline gap-1.5 text-white", children: [_jsx("span", { className: "text-2xl font-black italic", children: kpiData.global.hours.toFixed(1) }), _jsx("span", { className: "text-[9px] font-bold text-slate-500 uppercase", children: "u" })] }), _jsx("span", { className: "text-[8px] text-slate-400 font-bold uppercase", children: timeMode === 'DAY' ? t('common.perDay', 'per dag') : t('common.perWeek', 'per week') })] }), _jsx("div", { className: "w-px h-8 bg-white/10" }), _jsxs("div", { className: "flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]", children: [_jsx("span", { className: "text-[7px] font-black text-slate-400 uppercase tracking-widest", children: t('personnel.manHours', "Man-uren") }), _jsx("span", { className: "text-xs font-black text-white", children: kpiData.global.hours.toFixed(1) }), _jsx("span", { className: "text-[7px] text-slate-400 font-bold uppercase", children: timeMode === 'DAY' ? t('common.perDay', 'per dag') : t('common.perWeek', 'per week') })] }), _jsxs("div", { className: "flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]", children: [_jsx("span", { className: "text-[7px] font-black text-emerald-500 uppercase tracking-widest", children: t('personnel.bhStations', "BH Stations") }), _jsx("span", { className: "text-xs font-black text-emerald-300", children: kpiData.production.toFixed(1) })] }), _jsxs("div", { className: "flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]", children: [_jsx("span", { className: "text-[7px] font-black text-blue-500 uppercase tracking-widest", children: t('common.other', "Overig") }), _jsx("span", { className: "text-xs font-black text-blue-300", children: kpiData.support.toFixed(1) })] }), _jsxs("div", { className: "flex flex-col items-center px-3 min-w-[60px]", children: [_jsx("span", { className: "text-[7px] font-black text-purple-500 uppercase tracking-widest", children: t('personnel.efficiency', "Efficiency") }), _jsxs("span", { className: "text-xs font-black text-purple-300", children: [kpiData.efficiency.toFixed(0), "%"] })] }), _jsx("div", { className: "w-px h-8 bg-white/10" }), _jsxs("div", { className: "flex items-center gap-3 text-emerald-400", children: [_jsx(UserCheck, { size: 20 }), _jsx("span", { className: "text-xl font-black italic", children: kpiData.global.count })] })] }) }))] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 custom-scrollbar bg-slate-50/50", children: _jsxs("div", { className: `${activeTab === "assignment" ? "w-full" : "max-w-7xl mx-auto"} pb-40`, children: [activeTab === "assignment" && (_jsx(PersonnelOccupancyView, { structure: structure, occupancy: occupancy, personnel: personnel, kpiData: kpiData, users: users, selectedDateStr: selectedDateStr, onAssign: handleAssign, onRemoveAssignment: handleRemoveAssignment })), activeTab === "personnel" && (_jsx(PersonnelListView, { personnel: personnel, departments: structure.departments || [], linkedTagEmployeeKeys: linkedTagEmployeeKeys, expandedDepts: listExpandedSections, onToggleDept: (id) => setListExpandedSections(prev => ({ ...prev, [id]: !prev[id] })), onEdit: openEditPerson, onDelete: async (id) => {
                                const confirmed = await showConfirm({
                                    title: t('personnel.deleteTitle', 'Medewerker verwijderen'),
                                    message: t('common.deleteConfirm', "Verwijderen?"),
                                    confirmText: t('common.delete', 'Verwijderen'),
                                    cancelText: t('common.cancel', 'Annuleren'),
                                    tone: 'danger',
                                });
                                if (!confirmed)
                                    return;
                                await deleteDoc(doc(db, ...PATHS.PERSONNEL, id));
                                await logActivity(auth.currentUser?.uid, "PERSONNEL_DELETE", `Personeelsrecord verwijderd: ${id}`);
                            } }))] }) }), isPersonModalOpen && (_jsx("div", { className: "fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in overflow-y-auto", children: _jsxs("div", { className: "bg-white w-full max-w-xl rounded-[28px] sm:rounded-[45px] shadow-2xl flex flex-col border border-white/10 animate-in zoom-in-95 my-8 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]", children: [_jsxs("div", { className: "p-4 sm:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-blue-600 text-white rounded-2xl shadow-lg", children: _jsx(UserPlus, { size: 24 }) }), _jsxs("div", { className: "text-left", children: [_jsxs("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none", children: [editingId ? t('common.edit', "Edit") : t('common.new', "New"), " ", _jsx("span", { className: "text-blue-600", children: t('personnel.resource', "Resource") })] }), _jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5", children: t('personnel.masterDb', "Master Personnel Database") })] })] }), _jsx("button", { onClick: () => setIsPersonModalOpen(false), className: "p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all", children: _jsx(X, { size: 28 }) })] }), _jsxs("div", { className: "flex gap-2 px-4 sm:px-6 pt-2", children: [_jsx("button", { type: "button", onClick: () => setModalTab("profile"), className: `flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "profile" ? "bg-slate-100 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`, children: t('personnel.profile', "Profiel") }), _jsx("button", { type: "button", onClick: () => setModalTab("loan"), className: `flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "loan" ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50"}`, children: t('personnel.lending', "Uitlenen") })] }), _jsxs("form", { onSubmit: handleSavePerson, className: "p-4 sm:p-6 space-y-5 sm:space-y-6 text-left overflow-y-auto", children: [modalTab === "profile" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.employeeName', "Naam Medewerker") }), _jsx("input", { required: true, className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm", value: personForm.name, onChange: (e) => setPersonForm({
                                                                ...personForm,
                                                                name: e.target.value.toUpperCase(),
                                                            }) })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.employeeNumber', "Personeelsnummer") }), _jsx("input", { required: true, className: `w-full p-4 bg-slate-50 border-2 rounded-2xl font-black text-slate-800 outline-none transition-all text-sm ${isDuplicateNumber
                                                                ? "border-rose-300 focus:border-rose-500 bg-rose-50/10"
                                                                : "border-slate-100 focus:border-blue-500"}`, value: personForm.employeeNumber, onChange: (e) => setPersonForm({
                                                                ...personForm,
                                                                employeeNumber: e.target.value.replace(/\D/g, ""),
                                                            }) }), duplicatePerson && (_jsxs("div", { className: "ml-2 mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700", children: [_jsxs("p", { className: "text-[10px] font-bold flex items-center gap-1", children: [_jsx(AlertCircle, { size: 12 }), " ", t('personnel.numberInUse', "Dit nummer is al in gebruik!")] }), _jsxs("p", { className: "text-[10px] font-semibold mt-1", children: ["Bestaand record: ", duplicatePerson.name || "Onbekend", " (", duplicatePerson.id, ")"] }), _jsxs("p", { className: "text-[10px] font-medium opacity-80 mt-1", children: ["Afdeling: ", getDepartmentLabel(duplicatePerson.departmentId)] })] }))] })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.linkUser', "Koppel User Account") }), _jsxs("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer", value: personForm.linkedUserId || "", onChange: (e) => setPersonForm({ ...personForm, linkedUserId: e.target.value }), children: [_jsx("option", { value: "", children: t('personnel.noLink', "Geen koppeling...") }), users.map((u) => (_jsxs("option", { value: u.id, children: [u.name, " (", u.email, ")"] }, u.id)))] })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.defaultDept', "Standaard Afdeling") }), _jsxs("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer", value: personForm.departmentId, onChange: (e) => setPersonForm({
                                                        ...personForm,
                                                        departmentId: e.target.value,
                                                    }), children: [_jsx("option", { value: "", children: t('personnel.chooseDept', "Kies afdeling...") }), structure.departments.map((d) => (_jsx("option", { value: d.id, children: d.name }, d.id)))] })] }), editingId && (_jsxs("div", { className: "space-y-3 p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/60", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Nfc, { size: 16, className: "text-emerald-700" }), _jsx("span", { className: "text-[11px] font-black text-emerald-800 uppercase tracking-widest", children: "NFC-tags" })] }), _jsx("button", { type: "button", onClick: () => {
                                                                setIsPersonModalOpen(false);
                                                                setShowNFCModal(true);
                                                            }, className: "px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all", children: "Tag wijzigen" })] }), currentPersonNfcMappings.length === 0 ? (_jsx("p", { className: "text-xs font-bold text-emerald-700/80", children: "Geen gekoppelde NFC-tag gevonden." })) : (_jsx("div", { className: "space-y-2", children: currentPersonNfcMappings.map((mapping) => (_jsxs("div", { className: "flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-emerald-200", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest", children: "Tag" }), _jsx("p", { className: "text-xs font-mono font-bold text-slate-800 truncate", children: mapping.tagId || mapping.id })] }), _jsx("button", { type: "button", onClick: () => handleRemovePersonNfcTag(mapping.id, mapping.tagId), className: "px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] font-black uppercase tracking-widest transition-all", children: "Verwijderen" })] }, mapping.id))) }))] })), _jsxs("div", { className: "pt-6 border-t border-slate-50 space-y-6", children: [_jsxs("div", { className: "space-y-3", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.shiftType', "Ploegen Type") }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3", children: [_jsxs("button", { type: "button", onClick: () => setPersonForm({
                                                                        ...personForm,
                                                                        rotationType: "STATIC",
                                                                        rotationSchedule: { ...personForm.rotationSchedule, enabled: false }
                                                                    }), className: `flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${!personForm.rotationSchedule?.enabled
                                                                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`, children: ["\uD83D\uDD12 ", t('personnel.staticShift', "Vaste Ploeg")] }), _jsxs("button", { type: "button", onClick: () => setPersonForm({
                                                                        ...personForm,
                                                                        rotationType: "ROTATION",
                                                                        rotationSchedule: {
                                                                            ...personForm.rotationSchedule,
                                                                            enabled: true,
                                                                            startWeek: getISOWeek(viewDate),
                                                                            shifts: personForm.departmentId ?
                                                                                getShiftsForDept(personForm.departmentId)
                                                                                    .filter(s => s.id !== 'DAG') // Exclude DAG from rotation
                                                                                    .slice(0, 2)
                                                                                    .map(s => s.id) :
                                                                                []
                                                                        }
                                                                    }), className: `flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${personForm.rotationSchedule?.enabled
                                                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`, children: ["\uD83D\uDD04 ", t('personnel.rotationShift', "Rotatie Ploegen")] })] })] }), !personForm.rotationSchedule?.enabled && (_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block italic", children: t('personnel.staticShift', "Vaste Ploeg") }), _jsx("select", { className: "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer", value: personForm.shiftId, onChange: (e) => setPersonForm({ ...personForm, shiftId: e.target.value }), children: personForm.departmentId &&
                                                                getShiftsForDept(personForm.departmentId).map((s) => (_jsx("option", { value: s.id, children: s.label }, s.id))) })] })), personForm.rotationSchedule?.enabled && (_jsxs("div", { className: "space-y-4 bg-emerald-50/50 p-5 rounded-2xl border-2 border-emerald-100", children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsxs("label", { className: "text-[10px] font-black text-emerald-700 uppercase ml-2 block flex items-center gap-2", children: [_jsx(RotateCcw, { size: 12 }), " ", t('personnel.startWeekWith', "Start Deze Week Met")] }), _jsx("select", { className: "w-full p-3 bg-white border-2 border-emerald-200 rounded-xl font-bold outline-none focus:border-emerald-500 text-sm cursor-pointer", value: personForm.rotationSchedule.shifts[0] || '', onChange: (e) => {
                                                                        const selectedShiftId = e.target.value;
                                                                        const allShifts = personForm.departmentId ?
                                                                            getShiftsForDept(personForm.departmentId).filter(s => s.id !== 'DAG') : // Exclude DAG
                                                                            [];
                                                                        // Vind index van geselecteerde shift
                                                                        const selectedIndex = allShifts.findIndex(s => s.id === selectedShiftId);
                                                                        // Maak rotatie array (2 of 3 ploegen, max beschikbare shifts excl. DAG)
                                                                        const rotationShifts = [];
                                                                        const maxShifts = Math.min(allShifts.length, 3);
                                                                        for (let i = 0; i < maxShifts; i++) {
                                                                            const shiftIndex = (selectedIndex + i) % allShifts.length;
                                                                            rotationShifts.push(allShifts[shiftIndex].id);
                                                                        }
                                                                        setPersonForm({
                                                                            ...personForm,
                                                                            rotationSchedule: {
                                                                                ...personForm.rotationSchedule,
                                                                                shifts: rotationShifts
                                                                            }
                                                                        });
                                                                    }, children: personForm.departmentId &&
                                                                        getShiftsForDept(personForm.departmentId)
                                                                            .filter(s => s.id !== 'DAG') // Exclude DAG from rotation options
                                                                            .map((s) => (_jsx("option", { value: s.id, children: s.label }, s.id))) })] }), _jsxs("div", { className: "bg-white p-4 rounded-xl border border-emerald-200", children: [_jsx("p", { className: "text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-2", children: t('personnel.rotationSchedule', "Rotatie Schema:") }), _jsx("div", { className: "flex gap-2 flex-wrap", children: personForm.rotationSchedule.shifts.map((shiftId, idx) => {
                                                                        const shift = getShiftsForDept(personForm.departmentId).find(s => s.id === shiftId);
                                                                        const label = (shift?.label || shiftId || "").toUpperCase();
                                                                        let color = SHIFT_COLORS.DAG;
                                                                        if (label.includes("OCHTEND") || label.includes("MORNING"))
                                                                            color = SHIFT_COLORS.OCHTEND;
                                                                        else if (label.includes("AVOND") || label.includes("EVENING"))
                                                                            color = SHIFT_COLORS.AVOND;
                                                                        else if (label.includes("NACHT") || label.includes("NIGHT"))
                                                                            color = SHIFT_COLORS.NACHT;
                                                                        return (_jsxs("span", { className: `px-3 py-1.5 bg-${color}-100 text-${color}-800 border border-${color}-200 rounded-lg text-xs font-bold`, children: [t('common.week', "Week"), " ", idx + 1, ": ", shift?.label || shiftId] }, idx));
                                                                    }) }), _jsx("p", { className: "text-[8px] text-emerald-600 mt-2 italic", children: t('personnel.rotationInfo', { week: personForm.rotationSchedule.startWeek, count: personForm.rotationSchedule.shifts.length }) })] })] })), _jsx("div", { className: "flex flex-col justify-center gap-2", children: _jsxs("label", { className: "flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: personForm.isActive, onChange: (e) => setPersonForm({
                                                                    ...personForm,
                                                                    isActive: e.target.checked,
                                                                }), className: "w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" }), _jsx("span", { className: "text-[10px] font-black uppercase text-slate-700", children: t('personnel.accountActive', "Account Actief") })] }) })] })] })), modalTab === "loan" && (_jsxs("div", { className: "space-y-6 animate-in slide-in-from-right-4", children: [_jsxs("div", { className: "flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100", children: [_jsx("span", { className: "text-xs font-black text-indigo-800 uppercase", children: t('personnel.activeLending', "Actief Uitlenen") }), _jsx("input", { type: "checkbox", className: "w-6 h-6 rounded text-indigo-600 focus:ring-indigo-500", checked: personForm.loan?.active || false, onChange: e => setPersonForm({ ...personForm, loan: { ...personForm.loan, active: e.target.checked } }) })] }), personForm.loan?.active && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.targetDept', "Doel Afdeling") }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm", value: personForm.loan.departmentId, onChange: e => setPersonForm({ ...personForm, loan: { ...personForm.loan, departmentId: e.target.value } }), children: [_jsx("option", { value: "", children: t('personnel.chooseDept', "Kies afdeling...") }), structure.departments.filter(d => d.id !== personForm.departmentId).map(d => (_jsx("option", { value: d.id, children: d.name }, d.id)))] })] }), _jsxs("div", { className: "space-y-1.5 text-left", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-2 block", children: t('personnel.targetShift', "Doel Ploeg") }), _jsxs("select", { className: "w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm", value: personForm.loan.shiftId, onChange: e => setPersonForm({ ...personForm, loan: { ...personForm.loan, shiftId: e.target.value } }), children: [_jsx("option", { value: "", children: t('personnel.chooseShift', "Kies ploeg...") }), loanShifts.map(s => (_jsx("option", { value: s.id, children: s.label }, s.id)))] })] }), _jsxs("div", { className: "space-y-3 pt-2", children: [_jsxs("label", { className: "flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "w-5 h-5 rounded text-indigo-600", checked: personForm.loan.followRotation, onChange: e => setPersonForm({ ...personForm, loan: { ...personForm.loan, followRotation: e.target.checked } }) }), _jsx("span", { className: "text-xs font-bold text-slate-700", children: t('personnel.followTargetRotation', "Volg ploegenrooster doelafdeling") })] }), _jsxs("label", { className: "flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer", children: [_jsx("input", { type: "checkbox", className: "w-5 h-5 rounded text-indigo-600", checked: personForm.loan.autoReturn, onChange: e => handleAutoReturnToggle(e.target.checked) }), _jsx("span", { className: "text-xs font-bold text-slate-700", children: t('personnel.autoReturn5Days', "Automatisch terug na 5 dagen") })] }), personForm.loan.autoReturn && personForm.loan.returnDate && (_jsxs("div", { className: "text-[10px] font-bold text-indigo-600 px-4", children: [t('personnel.returnDate', "Retour datum:"), " ", personForm.loan.returnDate] }))] })] }))] })), _jsxs("button", { type: "submit", disabled: saving, className: "w-full py-5 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 shrink-0", children: [saving ? (_jsx(Loader2, { className: "animate-spin" })) : (_jsx(Save, { size: 24 })), " ", t('common.saveData', "Gegevens Vastleggen")] })] })] }) })), _jsx(NFCTagRegistrationModal, { isOpen: showNFCModal, onClose: () => setShowNFCModal(false), personnel: personnel, preselectedEmployeeNumber: personForm.employeeNumber || "" }), _jsxs("div", { className: "p-4 bg-slate-950 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[9px] sm:text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] px-4 sm:px-10 shrink-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3 sm:gap-6", children: [_jsxs("span", { className: "flex items-center gap-2 text-emerald-500/50", children: [_jsx(ShieldCheck, { size: 14 }), " ", t('personnel.forensicNode', "Forensic Audit Node")] }), _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Database, { size: 14 }), " ", t('personnel.centralVault', "Central Resource Vault")] })] }), _jsx("span", { className: "opacity-30 italic", children: t('common.version', "Future Factory MES v6.11") })] })] }));
};
export default PersonnelManager;
