import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Loader2,
  ShieldCheck,
  X,
  Plus,
  UserPlus,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  CalendarDays,
  TrendingUp,
  Database,
  Copy,
  Save,
  AlertCircle,
} from "lucide-react";
import { db, auth } from "../../config/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import {
  getISOWeek,
  format,
  parse,
  startOfISOWeek,
  endOfISOWeek,
  isWithinInterval,
  isToday,
  addDays,
  subDays,
} from "date-fns";
import { nl } from "date-fns/locale";
import { normalizeMachine } from "../../utils/hubHelpers";
import { PATHS, isValidPath } from "../../config/dbPaths";
import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView.jsx";
import PersonnelListView from "../personnel/PersonnelListView.jsx";
import { DEFAULTS, SHIFT_COLORS } from "../../data/constants";

/**
 * PersonnelManager V26.5 - Root Integrated Edition
 * Beheert de personeelsdatabase en de dagelijkse bezetting op de stations.
 * Locaties:
 * - /future-factory/Users/Personnel (Stamdata)
 * - /future-factory/production/machine_occupancy (Bezetting)
 */
const PersonnelManager = () => {
  const [personnel, setPersonnel] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [structure, setStructure] = useState({ departments: [] });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assignment");
  const [viewDate, setViewDate] = useState(new Date());
  const [timeMode, setTimeMode] = useState("DAY");

  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [status, setStatus] = useState(null);
  const [modalTab, setModalTab] = useState("profile");
  const [listExpandedSections, setListExpandedSections] = useState({});

  const currentWeek = getISOWeek(viewDate);
  const selectedDateStr = format(viewDate, "yyyy-MM-dd");

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
    if (!personForm.employeeNumber) return false;
    return personnel.some(p => p.employeeNumber === personForm.employeeNumber && p.id !== editingId);
  }, [personForm.employeeNumber, personnel, editingId]);

  // 1. DATA SYNC MET DE ROOT
  useEffect(() => {
    if (!isValidPath("PERSONNEL") || !isValidPath("OCCUPANCY")) return;

    const unsubPersonnel = onSnapshot(
      query(collection(db, ...PATHS.PERSONNEL), orderBy("name")),
      (snap) =>
        setPersonnel(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );

    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) =>
        setOccupancy(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );

    const unsubStructure = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStructure(data);
          // Initialize expanded sections for list view
          const initialExpanded = {};
          (data.departments || []).forEach(d => { initialExpanded[d.id] = true; });
          setListExpandedSections(prev => Object.keys(prev).length === 0 ? initialExpanded : prev);
        }
        setLoading(false);
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, ...PATHS.USERS),
      (snap) =>
        setUsers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    );

    return () => {
      unsubPersonnel();
      unsubOccupancy();
      unsubStructure();
      unsubUsers();
    };
  }, []);

  // --- HELPERS ---
  const getShiftsForDept = (deptId) => {
    const dept = (structure.departments || []).find((d) => d.id === deptId);
    return dept && dept.shifts && dept.shifts.length > 0
      ? dept.shifts
      : [{ id: "DAG", label: "Dagdienst", start: "07:15", end: "16:00" }];
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
    } else {
      // Normale vaste shift
      activeShift = shifts.find((s) => s.id === person.shiftId) || shifts[0];
    }

    try {
      const start = parse(activeShift.start, "HH:mm", new Date());
      const end = parse(activeShift.end, "HH:mm", new Date());
      let diff = (end - start) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      const deduction = DEFAULTS.BREAK_DEDUCTION; // Pauze correctie
      return {
        label: activeShift.label,
        total: Math.max(0, diff - deduction),
        times: `${activeShift.start}-${activeShift.end}`,
      };
    } catch (e) {
      return { label: "Dagdienst", total: DEFAULTS.SHIFT_HOURS, times: "07:15-16:00" };
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
      let match =
        timeMode === "DAY"
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
        } else {
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
        const toDelete = occupancy.filter(
          (o) =>
            normalizeMachine(o.machineId) === normalizeMachine(machineId) &&
            o.date === selectedDateStr &&
            o.departmentId === deptId
        );
        for (const docToDel of toDelete)
          await deleteDoc(doc(db, ...colPath, docToDel.id));
        return;
      }
      const person = personnel.find((p) => p.employeeNumber === operatorNumber);
      if (!person) return;

      const assignmentId =
        `${selectedDateStr}_${deptId}_${machineId}_${person.employeeNumber}`.replace(
          /[^a-zA-Z0-9]/g,
          "_"
        );
      const shiftInfo = getShiftHours(person, deptId, parse(selectedDateStr, "yyyy-MM-dd", new Date()));

      await setDoc(
        doc(db, ...colPath, assignmentId),
        {
          id: assignmentId,
          machineId,
          operatorNumber: person.employeeNumber,
          operatorName: person.name,
          departmentId: deptId,
          date: selectedDateStr,
          hoursWorked: shiftInfo.total,
          shift: shiftInfo.label,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    await deleteDoc(doc(db, ...PATHS.OCCUPANCY, assignmentId));
  };

  const handleCopyYesterday = async (targetDeptId = null) => {
    // Als het maandag is (1), kopieer van vrijdag (3 dagen terug), anders gisteren (1 dag)
    const isMonday = viewDate.getDay() === 1;
    const daysBack = isMonday ? 3 : 1;
    const sourceDateStr = format(subDays(viewDate, daysBack), "yyyy-MM-dd");
    
    let sourceData = occupancy.filter(
      (o) => o.date === sourceDateStr && o.operatorNumber
    );

    if (targetDeptId && typeof targetDeptId === 'string') {
      sourceData = sourceData.filter(o => o.departmentId === targetDeptId);
    }

    if (sourceData.length === 0)
      return alert(`Geen bezetting van ${isMonday ? 'vrijdag' : 'gisteren'} gevonden` + (typeof targetDeptId === 'string' ? " voor deze afdeling." : "."));

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

        const newId =
          `${selectedDateStr}_${old.departmentId}_${old.machineId}_${old.operatorNumber}`.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          );
        batch.set(
          doc(db, ...PATHS.OCCUPANCY, newId),
          {
            ...old,
            id: newId,
            date: selectedDateStr,
            shift: newShiftLabel, // Gebruik herberekende shift (juiste rotatie)
            hoursWorked: newHours,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      setStatus({
        type: "success",
        msg: `${sourceData.length} lopers overgezet van ${isMonday ? 'vrijdag' : 'gisteren'}!`,
      });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsCopying(false);
    }
  };

  const handleSavePerson = async (e) => {
    e.preventDefault();

    if (isDuplicateNumber) {
      alert(`Het personeelsnummer ${personForm.employeeNumber} is al in gebruik.`);
      return;
    }

    setSaving(true);
    try {
      const docId = editingId || `P_${personForm.employeeNumber}`;
      await setDoc(
        doc(db, ...PATHS.PERSONNEL, docId),
        {
          ...personForm,
          lastUpdated: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "Admin",
        },
        { merge: true }
      );

      setIsPersonModalOpen(false);
      setEditingId(null);
      setStatus({ type: "success", msg: "Medewerker opgeslagen" });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      alert("Fout: " + err.message);
    } finally {
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
    } else {
      newLoan.returnDate = "";
    }
    setPersonForm({ ...personForm, loan: newLoan });
    setIsPersonModalOpen(true);
  };

  const loanDept = structure.departments?.find(d => d.id === personForm.loan?.departmentId);
  const loanShifts = loanDept?.shifts || [];

  if (loading)
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Identiteiten synchroniseren...
        </p>
      </div>
    );

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden text-left animate-in fade-in">
      {/* HEADER & NAV */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-col gap-4 shrink-0 z-20 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-[18px] shadow-xl">
              <Users size={22} />
            </div>
            <div className="text-left text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                Personeel & Bezetting <span className="text-blue-600 text-sm">/ Resource Control</span>
              </h2>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic">
                  <ShieldCheck size={9} /> Root Authorized
                </span>
                <p className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">
                  Node: /{PATHS.PERSONNEL.join("/")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setTimeMode("DAY")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  timeMode === "DAY"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                <CalendarDays size={12} /> Dag
              </button>
              <button
                onClick={() => setTimeMode("WEEK")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  timeMode === "WEEK"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                <TrendingUp size={12} /> Week
              </button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("assignment")}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "assignment"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                Bezetting
              </button>
              <button
                onClick={() => setActiveTab("loan")}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "loan"
                    ? "bg-white text-indigo-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                Uitlenen
              </button>
              <button
                onClick={() => setActiveTab("personnel")}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "personnel"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                Personeel
              </button>
            </div>
            <button
              onClick={() => {
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
              }}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
            >
              <Plus size={16} /> Nieuw
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 border-t border-slate-50 pt-3">
          <div className="flex items-center gap-3 bg-slate-900 text-white p-1.5 rounded-[20px] shadow-2xl">
            <button
              onClick={() => setViewDate((prev) => subDays(prev, 1))}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col items-center px-6 min-w-[200px]">
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">
                {isToday(viewDate)
                  ? "Vandaag"
                  : format(viewDate, "eeee", { locale: nl })}
              </span>
              <span className="text-base font-black uppercase italic tracking-tight">
                {format(viewDate, "dd MMMM yyyy", { locale: nl })}
              </span>
            </div>
            <button
              onClick={() => setViewDate((prev) => addDays(prev, 1))}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <button
            onClick={handleCopyYesterday}
            disabled={isCopying}
            className={`px-6 py-3 border-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-sm ${
              viewDate.getDay() === 1
                ? "bg-orange-50 border-orange-200 text-orange-600 hover:border-orange-400 hover:text-orange-700"
                : "bg-white border-slate-100 text-slate-400 hover:border-blue-500 hover:text-blue-600"
            }`}
          >
            {isCopying ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Copy size={16} />
            )}{" "}
            {viewDate.getDay() === 1 ? "Herhaal Vrijdag" : "Herhaal Gisteren"}
          </button>

          {status && (
            <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 text-[10px] font-black uppercase animate-in zoom-in">
              {status.msg}
            </div>
          )}

          {activeTab === "assignment" && (
            <div className="flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar py-2 justify-end">
              <div className="bg-slate-900 px-6 py-4 rounded-3xl flex items-center gap-6 border border-white/5 shadow-xl shrink-0">
                {/* Totaal Volume */}
                <div className="text-left">
                  <span className="text-[9px] font-black text-blue-400 uppercase block mb-1">Totaal Volume</span>
                  <div className="flex items-baseline gap-1.5 text-white">
                    <span className="text-2xl font-black italic">{kpiData.global.hours.toFixed(1)}</span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase">u</span>
                  </div>
                  <span className="text-[8px] text-slate-400 font-bold uppercase">{timeMode === 'DAY' ? 'per dag' : 'per week'}</span>
                </div>
                <div className="w-px h-8 bg-white/10"></div>
                {/* Man-uren */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Man-uren</span>
                  <span className="text-xs font-black text-white">{kpiData.global.hours.toFixed(1)}</span>
                  <span className="text-[7px] text-slate-400 font-bold uppercase">{timeMode === 'DAY' ? 'per dag' : 'per week'}</span>
                </div>
                {/* BH Stations */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">BH Stations</span>
                  <span className="text-xs font-black text-emerald-300">{kpiData.production.toFixed(1)}</span>
                </div>
                {/* Overig */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest">Overig</span>
                  <span className="text-xs font-black text-blue-300">{kpiData.support.toFixed(1)}</span>
                </div>
                {/* Efficiency */}
                <div className="flex flex-col items-center px-3 min-w-[60px]">
                  <span className="text-[7px] font-black text-purple-500 uppercase tracking-widest">Efficiency</span>
                  <span className="text-xs font-black text-purple-300">{kpiData.efficiency.toFixed(0)}%</span>
                </div>
                <div className="w-px h-8 bg-white/10"></div>
                <div className="flex items-center gap-3 text-emerald-400">
                  <UserCheck size={20} />
                  <span className="text-xl font-black italic">{kpiData.global.count}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50">
        <div className="max-w-7xl mx-auto pb-40">
          {/* TAB 1: BEZETTING PER STATION */}
          {activeTab === "assignment" && (
            <PersonnelOccupancyView
              structure={structure}
              occupancy={occupancy}
              personnel={personnel}
              kpiData={kpiData}
              users={users}
              selectedDateStr={selectedDateStr}
              onAssign={handleAssign}
              onRemoveAssignment={handleRemoveAssignment}
            />
          )}

          {/* TAB 2: PERSONEELSLIJST (DATABASE) */}
          {activeTab === "personnel" && (
            <PersonnelListView
              personnel={personnel}
              departments={structure.departments || []}
              expandedDepts={listExpandedSections}
              onToggleDept={(id) => setListExpandedSections(prev => ({...prev, [id]: !prev[id]}))}
              onEdit={openEditPerson}
              onDelete={async (id) => {
                if (window.confirm("Verwijderen?")) {
                  await deleteDoc(doc(db, ...PATHS.PERSONNEL, id));
                }
              }}
            />
          )}
        </div>
      </div>

      {/* MODAL: PERSOON TOEVOEGEN/BEWERKEN */}
      {isPersonModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[45px] shadow-2xl flex flex-col border border-white/10 animate-in zoom-in-95 my-8 max-h-[calc(100vh-4rem)]">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
                  <UserPlus size={24} />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                    {editingId ? "Edit" : "New"}{" "}
                    <span className="text-blue-600">Resource</span>
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                    Master Personnel Database
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPersonModalOpen(false)}
                className="p-3 hover:bg-slate-200 text-slate-300 rounded-2xl transition-all"
              >
                <X size={28} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 px-6 pt-2">
              <button
                type="button"
                onClick={() => setModalTab("profile")}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "profile" ? "bg-slate-100 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`}
              >
                Profiel
              </button>
              <button
                type="button"
                onClick={() => setModalTab("loan")}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "loan" ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50"}`}
              >
                Uitlenen
              </button>
            </div>

            <form
              onSubmit={handleSavePerson}
              className="p-6 space-y-6 text-left overflow-y-auto"
            >
              {modalTab === "profile" && (
                <>
                <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    Naam Medewerker
                  </label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm"
                    value={personForm.name}
                    onChange={(e) =>
                      setPersonForm({
                        ...personForm,
                        name: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    Personeelsnummer
                  </label>
                  <input
                    required
                    className={`w-full p-4 bg-slate-50 border-2 rounded-2xl font-black text-slate-800 outline-none transition-all text-sm ${
                      isDuplicateNumber 
                        ? "border-rose-300 focus:border-rose-500 bg-rose-50/10" 
                        : "border-slate-100 focus:border-blue-500"
                    }`}
                    value={personForm.employeeNumber}
                    onChange={(e) =>
                      setPersonForm({
                        ...personForm,
                        employeeNumber: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                  {isDuplicateNumber && (
                    <p className="text-[10px] font-bold text-rose-500 ml-2 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Dit nummer is al in gebruik!
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                  Koppel User Account
                </label>
                <select
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer"
                  value={personForm.linkedUserId || ""}
                  onChange={(e) => setPersonForm({ ...personForm, linkedUserId: e.target.value })}
                >
                  <option value="">Geen koppeling...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                  Standaard Afdeling
                </label>
                <select
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer"
                  value={personForm.departmentId}
                  onChange={(e) =>
                    setPersonForm({
                      ...personForm,
                      departmentId: e.target.value,
                    })
                  }
                >
                  <option value="">Kies afdeling...</option>
                  {structure.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-6 border-t border-slate-50 space-y-6">
                {/* Rotatie Type Keuze */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    Ploegen Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setPersonForm({ 
                        ...personForm, 
                        rotationType: "STATIC",
                        rotationSchedule: { ...personForm.rotationSchedule, enabled: false }
                      })}
                      className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${
                        !personForm.rotationSchedule?.enabled
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      🔒 Vaste Ploeg
                    </button>
                    <button
                      type="button"
                      onClick={() => setPersonForm({ 
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
                      })}
                      className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${
                        personForm.rotationSchedule?.enabled
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      🔄 Rotatie Ploegen
                    </button>
                  </div>
                </div>

                {/* Vaste Ploeg Keuze */}
                {!personForm.rotationSchedule?.enabled && (
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block italic">
                      Vaste Ploeg
                    </label>
                    <select
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer"
                      value={personForm.shiftId}
                      onChange={(e) =>
                        setPersonForm({ ...personForm, shiftId: e.target.value })
                      }
                    >
                      {personForm.departmentId &&
                        getShiftsForDept(personForm.departmentId).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Rotatie Configuratie */}
                {personForm.rotationSchedule?.enabled && (
                  <div className="space-y-4 bg-emerald-50/50 p-5 rounded-2xl border-2 border-emerald-100">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-black text-emerald-700 uppercase ml-2 block flex items-center gap-2">
                        <RotateCcw size={12} /> Start Deze Week Met
                      </label>
                      <select
                        className="w-full p-3 bg-white border-2 border-emerald-200 rounded-xl font-bold outline-none focus:border-emerald-500 text-sm cursor-pointer"
                        value={personForm.rotationSchedule.shifts[0] || ''}
                        onChange={(e) => {
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
                        }}
                      >
                        {personForm.departmentId &&
                          getShiftsForDept(personForm.departmentId)
                            .filter(s => s.id !== 'DAG') // Exclude DAG from rotation options
                            .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-emerald-200">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-2">Rotatie Schema:</p>
                      <div className="flex gap-2 flex-wrap">
                        {personForm.rotationSchedule.shifts.map((shiftId, idx) => {
                          const shift = getShiftsForDept(personForm.departmentId).find(s => s.id === shiftId);
                          const label = (shift?.label || shiftId || "").toUpperCase();
                          let color = SHIFT_COLORS.DAG;
                          if (label.includes("OCHTEND") || label.includes("MORNING")) color = SHIFT_COLORS.OCHTEND;
                          else if (label.includes("AVOND") || label.includes("EVENING")) color = SHIFT_COLORS.AVOND;
                          else if (label.includes("NACHT") || label.includes("NIGHT")) color = SHIFT_COLORS.NACHT;

                          return (
                            <span key={idx} className={`px-3 py-1.5 bg-${color}-100 text-${color}-800 border border-${color}-200 rounded-lg text-xs font-bold`}>
                              Week {idx + 1}: {shift?.label || shiftId}
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-[8px] text-emerald-600 mt-2 italic">
                        Start: Week {personForm.rotationSchedule.startWeek} • Herhaalt elke {personForm.rotationSchedule.shifts.length} weken
                      </p>
                    </div>
                  </div>
                )}

                {/* Active Checkbox */}
                <div className="flex flex-col justify-center gap-2">
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={personForm.isActive}
                      onChange={(e) =>
                        setPersonForm({
                          ...personForm,
                          isActive: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[10px] font-black uppercase text-slate-700">
                      Account Actief
                    </span>
                  </label>
                </div>
              </div>
              </>
            )}

            {modalTab === "loan" && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <span className="text-xs font-black text-indigo-800 uppercase">Actief Uitlenen</span>
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 rounded text-indigo-600 focus:ring-indigo-500"
                      checked={personForm.loan?.active || false}
                      onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, active: e.target.checked }})}
                    />
                  </div>

                  {personForm.loan?.active && (
                    <>
                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">Doel Afdeling</label>
                        <select 
                          className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm"
                          value={personForm.loan.departmentId}
                          onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, departmentId: e.target.value }})}
                        >
                          <option value="">Kies afdeling...</option>
                          {structure.departments.filter(d => d.id !== personForm.departmentId).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">Doel Ploeg</label>
                        <select 
                          className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm"
                          value={personForm.loan.shiftId}
                          onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, shiftId: e.target.value }})}
                        >
                          <option value="">Kies ploeg...</option>
                          {loanShifts.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-3 pt-2">
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded text-indigo-600"
                            checked={personForm.loan.followRotation}
                            onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, followRotation: e.target.checked }})}
                          />
                          <span className="text-xs font-bold text-slate-700">Volg ploegenrooster doelafdeling</span>
                        </label>

                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded text-indigo-600"
                            checked={personForm.loan.autoReturn}
                            onChange={e => handleAutoReturnToggle(e.target.checked)}
                          />
                          <span className="text-xs font-bold text-slate-700">Automatisch terug na 5 dagen</span>
                        </label>
                        
                        {personForm.loan.autoReturn && personForm.loan.returnDate && (
                          <div className="text-[10px] font-bold text-indigo-600 px-4">
                            Retour datum: {personForm.loan.returnDate}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-5 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 shrink-0"
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={24} />
                )}{" "}
                Gegevens Vastleggen
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER INFO */}
      <div className="p-4 bg-slate-950 border-t border-white/5 flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-10 shrink-0">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-emerald-500/50">
            <ShieldCheck size={14} /> Forensic Audit Node
          </span>
          <span className="flex items-center gap-2">
            <Database size={14} /> Central Resource Vault
          </span>
        </div>
        <span className="opacity-30 italic">Future Factory MES v6.11</span>
      </div>
    </div>
  );
};

export default PersonnelManager;
