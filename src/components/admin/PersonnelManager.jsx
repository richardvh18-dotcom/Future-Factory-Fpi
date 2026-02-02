import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Trash2,
  Search,
  Loader2,
  Monitor,
  Cpu,
  ShieldCheck,
  X,
  Plus,
  UserPlus,
  Layers,
  Clock,
  Settings,
  Edit3,
  ArrowRight,
  RotateCcw,
  UserCircle,
  ChevronUp,
  MinusCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  Info,
  Globe,
  ChevronDown,
  Calculator,
  UserCheck,
  BarChart3,
  CalendarDays,
  TrendingUp,
  Database,
  Copy,
  Save,
  AlertCircle,
  CheckCircle2,
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
  getWeek,
  format,
  parse,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  isToday,
  addDays,
  subDays,
} from "date-fns";
import { nl } from "date-fns/locale";
import { normalizeMachine } from "../../utils/hubHelpers";
import { PATHS, isValidPath } from "../../config/dbPaths";
import AdvancedOperatorAssignModal from "./modals/AdvancedOperatorAssignModal";

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assignment");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedDepts, setExpandedDepts] = useState({});
  const [expandedShifts, setExpandedShifts] = useState({});
  const [viewDate, setViewDate] = useState(new Date());
  const [timeMode, setTimeMode] = useState("DAY");

  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [status, setStatus] = useState(null);
  
  // Advanced Assign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalData, setAssignModalData] = useState({ station: null, department: null });

  const currentWeek = getWeek(viewDate, { weekStartsOn: 0 }); // Zondag start
  const selectedDateStr = format(viewDate, "yyyy-MM-dd");

  const [personForm, setPersonForm] = useState({
    name: "",
    employeeNumber: "",
    departmentId: "",
    role: "Operator", // "Operator" of "Teamleader"
    rotationType: "STATIC",
    shiftId: "DAG",
    isActive: true,
    rotationSchedule: {
      enabled: false,
      startWeek: 1,
      startYear: new Date().getFullYear(),
      shifts: ["DAG"], // Array van shift IDs die roteren
    },
  });

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
          // Automatisch afdelingen openklappen bij eerste load
          const initialExpanded = {};
          (data.departments || []).forEach((d) => {
            initialExpanded[d.id] = true;
          });
          setExpandedDepts(initialExpanded);
        }
        setLoading(false);
      }
    );

    return () => {
      unsubPersonnel();
      unsubOccupancy();
      unsubStructure();
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
      const currentWeekNum = getWeek(forDate, { weekStartsOn: 0 });
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
      const isPloeg = activeShift.id !== "DAGDIENST" && activeShift.id !== undefined;
      const deduction = isPloeg ? 0 : 0.75; // Pauze correctie (alleen dagdienst)
      return {
        label: activeShift.label,
        total: Math.max(0, diff - deduction),
        times: `${activeShift.start}-${activeShift.end}`,
        start: activeShift.start,
        end: activeShift.end,
        isPloeg: isPloeg,
      };
    } catch (e) {
      return { 
        label: "Dagdienst", 
        total: 8.0, 
        times: "07:15-16:00",
        start: "07:15",
        end: "16:00",
        isPloeg: false,
      };
    }
  };

  const kpiData = useMemo(() => {
    // Week van zondag t/m zaterdag (US-stijl)
    const startWeek = startOfWeek(viewDate, { weekStartsOn: 0 }); // 0 = zondag
    const endWeek = endOfWeek(viewDate, { weekStartsOn: 0 });
    const stats = { global: { hours: 0, count: 0, productionHours: 0, productionCount: 0 }, byDept: {} };

    const deptMap = new Map();
    (structure.departments || []).forEach((d) => {
      deptMap.set(d.id, d);
      stats.byDept[d.id] = {
        name: d.name,
        hours: 0,
        count: 0,
        operators: new Set(),
      };
    });

    const globalOperators = new Set();
    const productionOperators = new Set();

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

        const dept = deptMap.get(occ.departmentId);
        const deptName = (dept?.name || dept?.id || "").toLowerCase();
        const isFittingOrPipes = deptName.includes("fitting") || deptName.includes("pipes");
        const isBH = String(occ.machineId || "").toLowerCase().includes("bh");
        if (isFittingOrPipes && isBH) {
          stats.global.productionHours += netHours;
          productionOperators.add(occ.operatorNumber);
        }

        if (stats.byDept[occ.departmentId]) {
          stats.byDept[occ.departmentId].hours += netHours;
          stats.byDept[occ.departmentId].operators.add(occ.operatorNumber);
        }
      }
    });
    stats.global.count = globalOperators.size;
    stats.global.productionCount = productionOperators.size;
    Object.keys(stats.byDept).forEach((id) => {
      stats.byDept[id].count = stats.byDept[id].operators.size;
    });
    return stats;
  }, [occupancy, timeMode, selectedDateStr, viewDate, structure.departments]);

  const countriesData = useMemo(() => {
    const groups = {};
    (structure.departments || []).forEach((dept) => {
      const country = dept.country || "Nederland";
      if (!groups[country]) groups[country] = [];
      groups[country].push(dept);
    });
    return groups;
  }, [structure.departments]);

  // --- HANDLERS ---
  const handleAssign = async (machineId, operatorNumber, deptId, customHours = null) => {
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
      
  // Gebruik custom uren indien opgegeven (voor multi-station)
  const hoursToUse = customHours !== null ? customHours : shiftInfo.total;

      await setDoc(
        doc(db, ...colPath, assignmentId),
        {
          id: assignmentId,
          machineId,
          operatorNumber: person.employeeNumber,
          operatorName: person.name,
          departmentId: deptId,
          date: selectedDateStr,
          hoursWorked: hoursToUse,
          shift: shiftInfo.label,
          shiftStart: shiftInfo.start || "07:30",
          shiftEnd: shiftInfo.end || "16:15",
          isPloeg: shiftInfo.isPloeg || false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyYesterday = async () => {
    const yesterdayStr = format(subDays(viewDate, 1), "yyyy-MM-dd");
    const yesterdayData = occupancy.filter(
      (o) => o.date === yesterdayStr && o.operatorNumber
    );
    if (yesterdayData.length === 0)
      return alert("Geen bezetting van gisteren gevonden.");

    setIsCopying(true);
    try {
      const batch = writeBatch(db);
      yesterdayData.forEach((old) => {
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
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      setStatus({
        type: "success",
        msg: `${yesterdayData.length} lopers overgezet!`,
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
    setPersonForm(person);
    setEditingId(person.id);
    setIsPersonModalOpen(true);
  };

  const handleDeletePerson = async (personId, name) => {
    if (!window.confirm(`Weet je zeker dat je ${name} wilt verwijderen?`)) return;
    
    try {
      await deleteDoc(doc(db, ...PATHS.PERSONNEL, personId));
      setStatus({ type: "success", msg: `${name} verwijderd` });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      alert("Verwijdering mislukt: " + err.message);
    }
  };

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
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic">
                  <ShieldCheck size={9} /> Root Authorized
                </span>
                <span className="text-[9px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase italic">
                  Resource Control
                </span>
                <p className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">
                  Node: /{PATHS.PERSONNEL.join("/")}
                </p>
                <button
                  onClick={() => {
                    console.log('🔍 PERSONNEL DEBUG:');
                    console.log('Path:', PATHS.PERSONNEL.join('/'));
                    console.log('Count:', personnel.length);
                    console.log('Data:', personnel);
                    alert(`${personnel.length} personen in database:\n${personnel.map(p => `- ${p.name} (#${p.employeeNumber})`).join('\n')}`);
                  }}
                  className="text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase"
                >
                  Debug Data
                </button>
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
                const currentWeek = getWeek(new Date(), { weekStartsOn: 0 });
                setPersonForm({
                  name: "",
                  employeeNumber: "",
                  departmentId: structure.departments[0]?.id || "",
                  role: "Operator",
                  rotationType: "STATIC",
                  shiftId: "DAG",
                  isActive: true,
                  rotationSchedule: {
                    enabled: false,
                    startWeek: currentWeek,
                    startYear: new Date().getFullYear(),
                    shifts: ["DAG"],
                  },
                });
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
            className="px-6 py-3 bg-white border-2 border-slate-100 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
          >
            {isCopying ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Copy size={16} />
            )}{" "}
            Herhaal Gisteren
          </button>

          {status && (
            <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 text-[10px] font-black uppercase animate-in zoom-in">
              {status.msg}
            </div>
          )}

          {activeTab === "assignment" && (
            <div className="flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar py-2 justify-end">
              <div className="bg-slate-900 px-6 py-4 rounded-3xl flex items-center gap-6 border border-white/5 shadow-xl shrink-0">
                <div className="text-left">
                  <span className="text-[9px] font-black text-blue-400 uppercase block mb-1">
                    Totaal Volume
                  </span>
                  <div className="flex items-baseline gap-1.5 text-white">
                    <span className="text-2xl font-black italic">
                      {kpiData.global.hours.toFixed(1)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      u
                    </span>
                  </div>
                </div>
                <div className="w-px h-8 bg-white/10"></div>
                <div className="flex items-center gap-3 text-emerald-400">
                  <UserCheck size={20} />
                  <span className="text-xl font-black italic">
                    {kpiData.global.count}
                  </span>
                </div>
              </div>

              <div className="bg-white px-6 py-4 rounded-3xl flex items-center gap-6 border border-slate-200 shadow-sm shrink-0">
                <div className="text-left">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Echte Productie (BH Fitting/Pipes)
                  </span>
                  <div className="flex items-baseline gap-1.5 text-slate-900">
                    <span className="text-2xl font-black italic">
                      {kpiData.global.productionHours.toFixed(1)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                      u
                    </span>
                  </div>
                </div>
                <div className="w-px h-8 bg-slate-100"></div>
                <div className="flex items-center gap-3 text-blue-600">
                  <UserCheck size={20} />
                  <span className="text-xl font-black italic">
                    {kpiData.global.productionCount}
                  </span>
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
            <div className="space-y-16">
              {Object.entries(countriesData)
                .sort()
                .map(([country, depts]) => (
                  <div key={country} className="space-y-8 animate-in fade-in">
                    <div className="flex items-center gap-4 border-b-2 border-slate-200 pb-4 ml-2">
                      <Globe size={24} className="text-slate-400" />
                      <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">
                        {country}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {depts.map((dept) => {
                        const isOpen = expandedDepts[dept.id] === true;
                        const sortedStations = [...(dept.stations || [])]
                          .filter(s => s && s.name) // Filter out invalid stations
                          .sort(
                            (a, b) =>
                              (a.name || "").toLowerCase().includes("teamleader")
                                ? -1
                                : 1
                          );
                        return (
                          <div key={dept.id} className="space-y-4">
                            <button
                              onClick={() =>
                                setExpandedDepts((prev) => ({
                                  ...prev,
                                  [dept.id]: !prev[dept.id],
                                }))
                              }
                              className={`w-full flex items-center justify-between p-6 rounded-[35px] transition-all border-2 ${
                                isOpen
                                  ? "bg-white border-blue-500 shadow-xl"
                                  : "bg-white border-slate-100 hover:border-blue-200 shadow-sm"
                              }`}
                            >
                              <div className="flex items-center gap-6 flex-1 text-left">
                                <div
                                  className={`p-3 rounded-2xl transition-all ${
                                    isOpen
                                      ? "bg-blue-600 text-white scale-110"
                                      : "bg-slate-100 text-slate-400"
                                  }`}
                                >
                                  <Layers size={24} />
                                </div>
                                <div className="text-left">
                                  <h4
                                    className={`text-lg font-black uppercase italic tracking-tighter ${
                                      isOpen
                                        ? "text-slate-900"
                                        : "text-slate-600"
                                    }`}
                                  >
                                    {dept.name}
                                  </h4>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                                    {sortedStations.length} Actieve Stations
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-8 mr-10 hidden lg:flex">
                                <div className="text-right px-6 border-r border-slate-100">
                                  <span className="text-[9px] font-black text-slate-300 uppercase block mb-1">
                                    Capaciteit
                                  </span>
                                  <span
                                    className={`text-xl font-black italic ${
                                      kpiData.byDept[dept.id]?.hours > 0
                                        ? "text-blue-600"
                                        : "text-slate-200"
                                    }`}
                                  >
                                    {kpiData.byDept[dept.id]?.hours.toFixed(1)}u
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] font-black text-slate-300 uppercase block mb-1">
                                    Inzet
                                  </span>
                                  <span
                                    className={`text-xl font-black italic ${
                                      kpiData.byDept[dept.id]?.count > 0
                                        ? "text-slate-800"
                                        : "text-slate-200"
                                    }`}
                                  >
                                    {kpiData.byDept[dept.id]?.count}
                                  </span>
                                </div>
                              </div>
                              <div
                                className={`p-2.5 rounded-xl transition-transform duration-500 ${
                                  isOpen
                                    ? "rotate-0 bg-blue-100 text-blue-600"
                                    : "rotate-180 bg-slate-50 text-slate-300"
                                }`}
                              >
                                <ChevronUp size={24} />
                              </div>
                            </button>

                            {isOpen && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in zoom-in-95 p-2">
                                {sortedStations.map((station) => {
                                  const mId = station?.name || '';
                                  const isTL = mId
                                    .toLowerCase()
                                    .includes("teamleader");
                                  const occList = occupancy.filter(
                                    (o) =>
                                      normalizeMachine(o.machineId) ===
                                        normalizeMachine(mId) &&
                                      o.date === selectedDateStr &&
                                      o.departmentId === dept.id
                                  );
                                  const isBusy = occList.some(
                                    (o) => o.operatorNumber
                                  );

                                  return (
                                    <div
                                      key={station.id}
                                      className={`p-6 rounded-[40px] border-2 transition-all relative flex flex-col shadow-sm text-left ${
                                        isTL
                                          ? isBusy
                                            ? "bg-slate-900 border-amber-400 ring-8 ring-amber-400/10"
                                            : "bg-slate-900 border-slate-800 opacity-60"
                                          : isBusy
                                          ? "bg-white border-blue-500 ring-8 ring-blue-50/50"
                                          : "bg-white border-slate-100 hover:border-blue-400"
                                      }`}
                                    >
                                      <div className="flex justify-between items-start mb-6">
                                        <div className="text-left">
                                          <span
                                            className={`text-[8px] font-black uppercase tracking-widest block mb-1.5 ${
                                              isTL
                                                ? "text-amber-500 italic"
                                                : "text-slate-400 opacity-60"
                                            }`}
                                          >
                                            {isTL
                                              ? "Operational Lead"
                                              : "Workstation"}
                                          </span>
                                          <h4
                                            className={`text-xl font-black italic tracking-tighter uppercase truncate leading-none ${
                                              isTL
                                                ? "text-white"
                                                : "text-slate-900"
                                            }`}
                                          >
                                            {mId}
                                          </h4>
                                        </div>
                                        {isTL ? (
                                          <ShieldCheck
                                            size={24}
                                            className={
                                              isBusy
                                                ? "text-amber-400"
                                                : "text-slate-700"
                                            }
                                          />
                                        ) : (
                                          <Cpu
                                            size={24}
                                            className={
                                              isBusy
                                                ? "text-blue-600"
                                                : "text-slate-200"
                                            }
                                          />
                                        )}
                                      </div>

                                      <div className="space-y-3 mb-6 flex-1 text-left">
                                        {occList
                                          .filter((o) => o.operatorNumber)
                                          .map((occ) => (
                                            <div
                                              key={occ.id}
                                              className={`p-4 rounded-[22px] border transition-all flex items-center justify-between ${
                                                isTL
                                                  ? "bg-white/5 border-white/10 text-white"
                                                  : "bg-slate-50 border-slate-100"
                                              }`}
                                            >
                                              <div className="text-left overflow-hidden">
                                                <h5
                                                  className={`text-base font-black uppercase italic truncate mb-1 ${
                                                    isTL
                                                      ? "text-amber-400"
                                                      : "text-slate-950"
                                                  }`}
                                                >
                                                  {occ.operatorName}
                                                </h5>
                                                <div className="flex items-center gap-2 opacity-70">
                                                  <Clock
                                                    size={12}
                                                    className="text-blue-500"
                                                  />
                                                  <span className="text-[10px] font-black">
                                                    {occ.hoursWorked?.toFixed(
                                                      1
                                                    ) || 0}
                                                    u
                                                  </span>
                                                </div>
                                              </div>
                                              <button
                                                onClick={() =>
                                                  deleteDoc(
                                                    doc(
                                                      db,
                                                      ...PATHS.OCCUPANCY,
                                                      occ.id
                                                    )
                                                  )
                                                }
                                                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                              >
                                                <X size={18} />
                                              </button>
                                            </div>
                                          ))}
                                        {!isBusy && (
                                          <div
                                            className={`py-6 border-2 border-dashed rounded-[25px] flex flex-col items-center justify-center opacity-30 ${
                                              isTL
                                                ? "border-white/10"
                                                : "border-slate-200"
                                            }`}
                                          >
                                            <span
                                              className={`text-[8px] font-black uppercase tracking-widest ${
                                                isTL
                                                  ? "text-slate-600"
                                                  : "text-slate-400"
                                              }`}
                                            >
                                              Onbemand
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      <button
                                        onClick={() => {
                                          setAssignModalData({ 
                                            station: { id: station.id, name: mId }, 
                                            department: dept 
                                          });
                                          setAssignModalOpen(true);
                                        }}
                                        className={`w-full p-3 rounded-2xl font-black text-[10px] uppercase outline-none transition-all cursor-pointer border-2 flex items-center justify-center gap-2 ${
                                          isTL
                                            ? "bg-white/5 border-white/10 text-slate-400 hover:border-amber-400 hover:text-amber-400"
                                            : "bg-slate-50 border-slate-100 text-slate-400 hover:border-blue-400 hover:text-blue-500"
                                        }`}
                                      >
                                        <Plus size={14} />
                                        Operator Toevoegen
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* TAB 2: PERSONEELSLIJST (DATABASE) */}
          {activeTab === "personnel" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Zoekbalk */}
              <div className="bg-white p-6 rounded-[35px] border border-slate-200 shadow-sm">
                <div className="relative flex-1 w-full group">
                  <Search
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="Zoek op naam of personeelsnummer..."
                    className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Gegroepeerd per Afdeling en Ploeg */}
              <div className="space-y-4">
                {(structure.departments || []).map((dept) => {
                  const deptPersonnel = personnel.filter(p => p.departmentId === dept.id && 
                    (!searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.employeeNumber.includes(searchTerm)));
                  
                  if (deptPersonnel.length === 0) return null;

                  const isDeptOpen = expandedDepts[dept.id];
                  const shifts = getShiftsForDept(dept.id);
                  
                  // Debug: log shift IDs
                  if (isDeptOpen && deptPersonnel.length > 0) {
                    console.log(`Afdeling: ${dept.name}, Shifts:`, shifts.map(s => s.id), `Personeel:`, deptPersonnel.map(p => ({ name: p.name, shiftId: p.shiftId || "undefined" })));
                  }

                  return (
                    <div key={dept.id} className="bg-white rounded-[40px] border-2 border-slate-100 shadow-sm overflow-hidden">
                      {/* Department Header */}
                      <button
                        onClick={() => setExpandedDepts(prev => ({ ...prev, [dept.id]: !prev[dept.id] }))}
                        className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`p-3 rounded-xl transition-all ${isDeptOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Layers size={24} />
                          </div>
                          <div>
                            <h4 className="text-lg font-black uppercase italic tracking-tighter text-slate-900">
                              {dept.name}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                              {deptPersonnel.length} Medewerker{deptPersonnel.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className={`p-2.5 rounded-xl transition-transform duration-300 ${isDeptOpen ? 'rotate-0 bg-blue-100 text-blue-600' : 'rotate-180 bg-slate-50 text-slate-300'}`}>
                          <ChevronUp size={20} />
                        </div>
                      </button>

                      {/* Department Content */}
                      {isDeptOpen && (
                        <div className="border-t border-slate-50 p-6 space-y-4">
                          {shifts.map((shift) => {
                            const shiftPersonnel = deptPersonnel.filter(p => {
                              if (p.rotationSchedule?.enabled && p.rotationSchedule.shifts?.length > 0) {
                                // Bereken ACTUELE shift voor deze persoon deze week
                                const currentWeekNum = getWeek(viewDate, { weekStartsOn: 0 });
                                const startWeekNum = p.rotationSchedule.startWeek || 1;
                                const rotationShifts = p.rotationSchedule.shifts;
                                const weeksSinceStart = currentWeekNum - startWeekNum;
                                const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
                                const currentShiftId = rotationShifts[shiftIndex];
                                
                                // Alleen tonen in de shift die NU actief is
                                return currentShiftId === shift.id;
                              }
                              // Zorg voor string vergelijking en handle undefined/null
                              const pShiftId = p.shiftId || "DAG";
                              return String(pShiftId) === String(shift.id);
                            });

                            if (shiftPersonnel.length === 0) return null;

                            const shiftKey = `${dept.id}_${shift.id}`;
                            const isShiftOpen = expandedShifts[shiftKey];

                            return (
                              <div key={shift.id} className="bg-slate-50 rounded-[30px] border border-slate-100 overflow-hidden">
                                {/* Shift Header */}
                                <button
                                  onClick={() => setExpandedShifts(prev => ({ ...prev, [shiftKey]: !prev[shiftKey] }))}
                                  className="w-full p-4 flex items-center justify-between hover:bg-white transition-all text-left group"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className={`p-2 rounded-lg text-xs font-black transition-all ${
                                      isShiftOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'
                                    }`}>
                                      {shift.start}-{shift.end}
                                    </div>
                                    <div>
                                      <h5 className="font-black text-slate-900 uppercase text-sm">
                                        {shift.label}
                                      </h5>
                                      <p className="text-[9px] font-bold text-slate-400">
                                        {shiftPersonnel.length} persoon{shiftPersonnel.length !== 1 ? 'en' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className={`transition-transform duration-300 ${isShiftOpen ? 'rotate-0' : 'rotate-180'}`}>
                                    <ChevronDown size={16} className="text-slate-400" />
                                  </div>
                                </button>

                                {/* Shift Personnel List */}
                                {isShiftOpen && (
                                  <div className="border-t border-slate-100 p-4 space-y-3">
                                    {shiftPersonnel.map((p) => (
                                      <div
                                        key={p.id}
                                        className="bg-white p-4 rounded-[25px] border border-slate-100 hover:border-blue-300 transition-all flex items-center justify-between group"
                                      >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <div className={`p-2 text-white rounded-lg shadow font-black text-xs flex items-center justify-center w-10 h-10 flex-shrink-0 ${
                                            p.role === "Teamleader" ? "bg-amber-600" : "bg-blue-600"
                                          }`}>
                                            {p.role === "Teamleader" ? "TL" : "OP"}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h6 className="font-black text-slate-900 text-sm uppercase italic truncate">
                                              {p.name}
                                            </h6>
                                            <span className="text-[9px] font-bold text-blue-500 uppercase">
                                              #{p.employeeNumber}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                          <button
                                            onClick={() => openEditPerson(p)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Bewerk"
                                          >
                                            <Edit3 size={16} />
                                          </button>
                                          <button
                                            onClick={() => handleDeletePerson(p.id, p.name)}
                                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                            title="Verwijder"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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

            <form
              onSubmit={handleSavePerson}
              className="p-6 space-y-6 text-left overflow-y-auto"
            >
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
                    disabled={!!editingId}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                    value={personForm.employeeNumber}
                    onChange={(e) =>
                      setPersonForm({
                        ...personForm,
                        employeeNumber: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </div>
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

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                  Positie / Rol
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPersonForm({ ...personForm, role: "Operator" })}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${
                      personForm.role === "Operator"
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    👨‍💼 Operator
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonForm({ ...personForm, role: "Teamleader" })}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all font-bold text-xs ${
                      personForm.role === "Teamleader"
                        ? 'bg-amber-50 border-amber-500 text-amber-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    🎯 Teamleader
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    Ploegen Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setPersonForm({ 
                        ...personForm, 
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
                        rotationSchedule: { 
                          ...personForm.rotationSchedule, 
                          enabled: true,
                          startWeek: getWeek(viewDate, { weekStartsOn: 0 }),
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
                      <option value="DAG">Dagdienst</option>
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
                          return (
                            <span key={idx} className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">
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

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-5 bg-slate-900 text-white rounded-[30px] font-black uppercase text-sm tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save size={24} />
                  )}{" "}
                  Opslaan
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeletePerson(editingId, personForm.name);
                      setIsPersonModalOpen(false);
                      setEditingId(null);
                      setPersonForm({
                        name: "",
                        employeeNumber: "",
                        departmentId: "",
                        role: "Operator",
                        rotationType: "STATIC",
                        shiftId: "DAG",
                        isActive: true,
                        rotationSchedule: {
                          enabled: false,
                          startWeek: 1,
                          startYear: new Date().getFullYear(),
                          shifts: ["DAG"],
                        },
                      });
                    }}
                    className="px-6 py-5 bg-red-600/20 text-red-600 border-2 border-red-300 rounded-[30px] font-black uppercase text-sm tracking-[0.3em] hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
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

            {/* Advanced Operator Assign Modal */}
            <AdvancedOperatorAssignModal
              isOpen={assignModalOpen}
              onClose={() => {
                setAssignModalOpen(false);
                setAssignModalData({ station: null, department: null });
              }}
              onAssign={(person, hours) => {
                handleAssign(
                  assignModalData.station.name,
                  person.employeeNumber,
                  assignModalData.department.id,
                  hours
                );
              }}
              station={assignModalData.station}
              department={assignModalData.department}
              personnel={personnel}
              shifts={assignModalData.department ? getShiftsForDept(assignModalData.department.id) : []}
              occupancy={occupancy}
              selectedDate={selectedDateStr}
              currentWeek={getWeek(viewDate, { weekStartsOn: 0 })}
            />
      </div>
    </div>
  );
};

export default PersonnelManager;
