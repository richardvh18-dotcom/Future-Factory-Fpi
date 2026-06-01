/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  Nfc,
} from "lucide-react";
import { db, auth, logActivity } from "../../config/firebase";
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
import { PATHS, isValidPath, getPathString } from "../../config/dbPaths";
import PersonnelOccupancyView from '../personnel/PersonnelOccupancyView';
import PersonnelListView from '../personnel/PersonnelListView';
import PersonnelTeamView from '../personnel/subviews/PersonnelTeamView';
import NFCTagRegistrationModal from './NFCTagRegistrationModal';
import { DEFAULTS, SHIFT_COLORS } from "../../data/constants";
import { useNotifications } from "../../contexts/NotificationContext";

interface Department {
  id: string;
  name: string;
  shifts?: { id: string; label: string; start: string; end: string }[];
}

interface Structure {
  departments: Department[];
}

interface Person {
  id?: string;
  name: string;
  employeeNumber: string;
  departmentId: string;
  linkedUserId?: string;
  rotationType?: string;
  shiftId?: string;
  isActive?: boolean;
  rotationSchedule?: {
    enabled: boolean;
    startWeek: number;
    startYear: number;
    shifts: string[];
  };
  loan?: {
    active: boolean;
    departmentId: string;
    shiftId: string;
    autoReturn: boolean;
    returnDate: string;
    followRotation: boolean;
  };
  [key: string]: any;
}

interface OccupancyRecord {
  id: string;
  machineId: string;
  operatorNumber: string;
  operatorName?: string;
  departmentId: string;
  date: string;
  hoursWorked: number;
  shift: string;
  [key: string]: any;
}

interface User {
  id: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

interface NfcMapping {
  id: string;
  employeeNumber: string;
  tagId?: string;
  [key: string]: any;
}

interface PersonnelManagerProps {
  initialViewDate?: string | Date;
  initialTab?: string;
}

/**
 * PersonnelManager V26.5 - Root Integrated Edition
 * Beheert de personeelsdatabase en de dagelijkse bezetting op de stations.
 * Locaties:
 * - /future-factory/Users/Personnel (Stamdata)
 * - /future-factory/production/machine_occupancy (Bezetting)
 */
// Helper functions for Firestore paths
const colPath = (path: string[]) => collection(db, getPathString(path));

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "onbekende fout");
  }
  return String(err || "onbekende fout");
};

const PersonnelManager: React.FC<PersonnelManagerProps> = ({ initialViewDate, initialTab }) => {
  const { t } = useTranslation();
  const { showConfirm , notify} = useNotifications();
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyRecord[]>([]);
  const [structure, setStructure] = useState<Structure>({ departments: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [nfcMappings, setNfcMappings] = useState<NfcMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assignment");
  const [viewDate, setViewDate] = useState(new Date());
  const [timeMode, setTimeMode] = useState("DAY");

  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [showNFCModal, setShowNFCModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null);
  const [modalTab, setModalTab] = useState("profile");
  const [listExpandedSections, setListExpandedSections] = useState<Record<string, boolean>>({});
  const initialStateAppliedRef = useRef(false);

  const selectedDateStr = format(viewDate, "yyyy-MM-dd");

  useEffect(() => {
    if (initialStateAppliedRef.current) return;

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
    if (!personForm.employeeNumber) return false;
    return personnel.some(p => p.employeeNumber === personForm.employeeNumber && p.id !== editingId);
  }, [personForm.employeeNumber, personnel, editingId]);

  const duplicatePerson = useMemo(() => {
    if (!personForm.employeeNumber) return null;
    return personnel.find(
      (person) => person.employeeNumber === personForm.employeeNumber && person.id !== editingId
    ) || null;
  }, [personForm.employeeNumber, personnel, editingId]);

  const linkedTagEmployeeKeys = useMemo(() => {
    const normalize = (value: string | number | undefined): string => String(value || "").trim().toUpperCase();
    const digits = (value: string | number | undefined): string => String(value || "").replace(/\D/g, "").replace(/^0+/, "");
    const keys = new Set<string>();

    nfcMappings.forEach((mapping) => {
      const normalized = normalize(mapping.employeeNumber);
      const numeric = digits(mapping.employeeNumber);
      if (normalized) keys.add(normalized);
      if (numeric) keys.add(numeric);
    });

    return keys;
  }, [nfcMappings]);

  const currentPersonNfcMappings = useMemo(() => {
    if (!editingId) return [];
    const normalized = String(personForm.employeeNumber || "").trim().toUpperCase();
    const numeric = String(personForm.employeeNumber || "").replace(/\D/g, "").replace(/^0+/, "");

    return nfcMappings.filter((mapping) => {
      const mapEmployee = String(mapping.employeeNumber || "").trim().toUpperCase();
      const mapNumeric = String(mapping.employeeNumber || "").replace(/\D/g, "").replace(/^0+/, "");
      if (normalized && mapEmployee === normalized) return true;
      return Boolean(numeric && mapNumeric && numeric === mapNumeric);
    });
  }, [editingId, personForm.employeeNumber, nfcMappings]);

  const personnelWithId = useMemo(
    () => personnel.filter((p): p is Person & { id: string } => typeof p.id === "string" && p.id.length > 0),
    [personnel]
  );

  const personnelOverview = useMemo(() => {
    const departmentIds = new Set((structure.departments || []).map((dept) => dept.id));
    const activePersonnel = personnelWithId.filter((person) => person.isActive !== false);
    const loanPersonnel = personnelWithId.filter((person) => person.loan?.active);
    const unmatchedPersonnel = personnelWithId.filter((person) => !departmentIds.has(String(person.departmentId || "")));

    return {
      total: personnelWithId.length,
      active: activePersonnel.length,
      loaned: loanPersonnel.length,
      departments: (structure.departments || []).length,
      unmatched: unmatchedPersonnel.length,
    };
  }, [personnelWithId, structure.departments]);

  // 1. DATA SYNC MET DE ROOT
  useEffect(() => {
    if (!isValidPath("PERSONNEL") || !isValidPath("OCCUPANCY")) return;

    const unsubPersonnel = onSnapshot(
      query(colPath(PATHS.PERSONNEL), orderBy("name")),
      (snap) =>
        setPersonnel(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Person)))
    );

    const unsubOccupancy = onSnapshot(
      colPath(PATHS.OCCUPANCY),
      (snap) =>
        setOccupancy(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OccupancyRecord)))
    );

    const unsubStructure = onSnapshot(
      doc(db, getPathString(PATHS.FACTORY_CONFIG)),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Structure | undefined;
          if (data) {
            setStructure(data);
            // Initialize expanded sections for list view
            const initialExpanded: Record<string, boolean> = {};
            (data.departments || []).forEach((d: Department) => { initialExpanded[d.id] = true; });
            setListExpandedSections(prev => Object.keys(prev).length === 0 ? initialExpanded : prev);
          }
        }
        setLoading(false);
      }
    );

    const unsubUsers = onSnapshot(
      colPath(PATHS.USERS),
      (snap) =>
        setUsers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as User)))
    );

    const unsubNfcMappings = onSnapshot(
      colPath(PATHS.NFC_TAG_MAPPINGS),
      (snap) =>
        setNfcMappings(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as NfcMapping)))
    );

    return () => {
      unsubPersonnel();
      unsubOccupancy();
      unsubStructure();
      unsubUsers();
      unsubNfcMappings();
    };
  }, []);

  // --- HELPERS ---
  const getShiftsForDept = (deptId: string) => {
    const dept = (structure.departments || []).find((d) => d.id === deptId);
    return dept && dept.shifts && dept.shifts.length > 0
      ? dept.shifts
      : [{ id: "DAG", label: t('personnel.dayShift', "Dagdienst"), start: "07:15", end: "16:00" }];
  };

  const getDepartmentLabel = (deptId: string) => {
    if (!deptId) return "Geen afdeling";
    const dept = (structure.departments || []).find((entry) => entry.id === deptId);
    return dept ? `${dept.name} (${dept.id})` : `Ongekoppelde afdeling (${deptId})`;
  };

  const getShiftHours = (person: Person, deptId: string, forDate = viewDate) => {
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
      const start = parse(activeShift.start, "HH:mm", new Date()).getTime();
      const end = parse(activeShift.end, "HH:mm", new Date()).getTime();
      let diff = (end - start) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      const deduction = DEFAULTS.BREAK_DEDUCTION; // Pauze correctie
      return {
        label: activeShift.label,
        total: Math.max(0, diff - deduction),
        times: `${activeShift.start}-${activeShift.end}`,
      };
    } catch {
      return { label: t('personnel.dayShift', "Dagdienst"), total: DEFAULTS.SHIFT_HOURS, times: "07:15-16:00" };
    }
  };

  const kpiData = useMemo(() => {
    const startWeek = startOfISOWeek(viewDate);
    const endWeek = endOfISOWeek(viewDate);
    const stats: Record<string, any> = { global: { hours: 0, count: 0 }, byDept: {}, production: 0, support: 0, efficiency: 0 };

    (structure.departments || []).forEach((d: Department) => {
      (stats.byDept as Record<string, any>)[d.id] = {
        name: d.name,
        hours: 0,
        count: 0,
        operators: new Set<string>(),
      };
    });

    const globalOperators = new Set<string>();

    occupancy.forEach((occ: OccupancyRecord) => {
      let match =
        timeMode === "DAY"
          ? occ.date === selectedDateStr
          : isWithinInterval(parse(occ.date, "yyyy-MM-dd", new Date()), {
              start: startWeek,
              end: endWeek,
            });
      if (match) {
        const netHours = parseFloat(String(occ.hoursWorked || 0));
        stats.global.hours += netHours;
        globalOperators.add(occ.operatorNumber);
        const deptStats = (stats.byDept as Record<string, any>)[occ.departmentId];
        if (deptStats) {
          deptStats.hours += netHours;
          deptStats.operators.add(occ.operatorNumber);
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
    Object.keys(stats.byDept).forEach((id: string) => {
      const deptStats = (stats.byDept as Record<string, any>)[id];
      deptStats.count = deptStats.operators.size;
    });

    if (stats.global.hours > 0) {
        stats.efficiency = (stats.production / stats.global.hours) * 100;
    }

    return stats;
  }, [occupancy, timeMode, selectedDateStr, viewDate, structure.departments]);


  // --- HANDLERS ---
  const handleAssign = async (machineId: string, operatorNumber: string, deptId: string) => {
    try {
      if (!operatorNumber || operatorNumber === "") {
        const toDelete = occupancy.filter(
          (o) =>
            normalizeMachine(o.machineId) === normalizeMachine(machineId) &&
            o.date === selectedDateStr &&
            o.departmentId === deptId
        );
        for (const docToDel of toDelete) {
          const docId: string = docToDel.id ?? "";
          await deleteDoc(doc(db, getPathString(PATHS.OCCUPANCY) + "/" + docId));
        }
        if (toDelete.length > 0) {
          await logActivity(
            auth.currentUser?.uid || "system",
            "OCCUPANCY_CLEAR",
            `Bezetting gewist op ${machineId} (${deptId}) voor ${selectedDateStr}: ${toDelete.length} record(s)`
          );
        }
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
        doc(db, getPathString(PATHS.OCCUPANCY) + "/" + (assignmentId as string)),
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

      await logActivity(
        auth.currentUser?.uid || "system",
        "OCCUPANCY_ASSIGN",
        `Operator ${person.employeeNumber} toegewezen aan ${machineId} (${deptId}) op ${selectedDateStr}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const docId: string = assignmentId;
    await deleteDoc(doc(db, getPathString(PATHS.OCCUPANCY) + "/" + docId));
    await logActivity(
      auth.currentUser?.uid || "system",
      "OCCUPANCY_DELETE",
      `Bezettingsrecord verwijderd: ${assignmentId}`
    );
  };

  const handleCopyYesterday = async (targetDeptId: string | null = null) => {
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
      return notify(t('personnel.noOccupancyFound', { day: isMonday ? t('common.friday') : t('common.yesterday') }) + (typeof targetDeptId === 'string' ? t('personnel.forThisDept') : "."));

    setIsCopying(true);
    try {
      const batch = writeBatch(db);
      sourceData.forEach((old: OccupancyRecord) => {
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
          doc(db, getPathString(PATHS.OCCUPANCY) + "/" + (newId as string)),
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
      await logActivity(
        auth.currentUser?.uid || "system",
        "OCCUPANCY_COPY",
        `Bezetting gekopieerd van ${sourceDateStr} naar ${selectedDateStr}: ${sourceData.length} record(s)`
      );
      setStatus({
        type: "success",
        msg: t('personnel.copiedCount', { count: sourceData.length, day: isMonday ? t('common.friday') : t('common.yesterday') }),
      });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setIsCopying(false);
    }
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();

    if (duplicatePerson) {
      notify(`Personeelsnummer ${personForm.employeeNumber} is al in gebruik door ${duplicatePerson.name || "onbekend"} (${duplicatePerson.id}).`);
      return;
    }

    setSaving(true);
    try {
      const docId = editingId || `P_${personForm.employeeNumber}`;
      await setDoc(
        doc(db, getPathString(PATHS.PERSONNEL) + "/" + (docId as string)),
        {
          ...personForm,
          lastUpdated: serverTimestamp(),
          updatedBy: auth.currentUser?.email || "Admin",
        },
        { merge: true }
      );

      await logActivity(
        auth.currentUser?.uid || "system",
        editingId ? "PERSONNEL_UPDATE" : "PERSONNEL_CREATE",
        `${editingId ? "Personeel bijgewerkt" : "Personeel aangemaakt"}: ${personForm.name} (${personForm.employeeNumber})`
      );

      setIsPersonModalOpen(false);
      setEditingId(null);
      setStatus({ type: "success", msg: t('personnel.saved', "Medewerker opgeslagen") });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openEditPerson = (person: Person) => {
    setPersonForm({
      name: person.name || "",
      employeeNumber: person.employeeNumber || "",
      departmentId: person.departmentId || "",
      linkedUserId: person.linkedUserId || "",
      rotationType: person.rotationType || "STATIC",
      shiftId: person.shiftId || "DAG",
      isActive: person.isActive ?? true,
      rotationSchedule: person.rotationSchedule || {
        enabled: false,
        startWeek: 1,
        startYear: new Date().getFullYear(),
        shifts: ["DAG"],
      },
      loan: person.loan || {
        active: false,
        departmentId: "",
        shiftId: "",
        autoReturn: false,
        returnDate: "",
        followRotation: false
      },
    });
    setEditingId(person.id || null);
    setModalTab("profile");
    setIsPersonModalOpen(true);
  };

  const handleAutoReturnToggle = (checked: boolean) => {
    const newLoan = { ...personForm.loan, autoReturn: checked };
    if (checked) {
      newLoan.returnDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
    } else {
      newLoan.returnDate = "";
    }
    setPersonForm({ ...personForm, loan: newLoan });
    setIsPersonModalOpen(true);
  };

  const handleRemovePersonNfcTag = async (mappingId: string, tagId?: string) => {
    const confirmed = await showConfirm({
      title: "NFC-tag verwijderen",
      message: `Koppeling ${tagId || mappingId} verwijderen?`,
      confirmText: "Verwijderen",
      cancelText: "Annuleren",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, `${getPathString(PATHS.NFC_TAG_MAPPINGS)}/${mappingId}`));
      await logActivity(
        auth.currentUser?.uid || "system",
        "NFC_TAG_UNLINK",
        `NFC tag ontkoppeld van ${personForm.name || personForm.employeeNumber}: ${tagId || mappingId}`
      );
      setStatus({ type: "success", msg: "NFC-tag verwijderd" });
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const loanDept = structure.departments?.find(d => d.id === personForm.loan?.departmentId);
  const loanShifts = loanDept?.shifts || [];

  if (loading)
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          {t('personnel.syncingIdentities', "Identiteiten synchroniseren...")}
        </p>
      </div>
    );

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden text-left animate-in fade-in">
      {/* HEADER & NAV */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-col gap-4 shrink-0 z-20 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-[18px] shadow-xl">
              <Users size={22} />
            </div>
            <div className="text-left text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                {t('personnel.title', "Personeel & Bezetting")} <span className="text-blue-600 text-sm">/ Resource Control</span>
              </h2>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase italic">
                  <ShieldCheck size={9} /> {t('personnel.rootAuthorized', "Root Authorized")}
                </span>
                <p className="text-[8px] font-mono text-slate-400 uppercase tracking-widest">
                  Node: /{PATHS.PERSONNEL.join("/")}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto overflow-x-auto no-scrollbar pb-1">
            <div className="flex items-center gap-2 sm:gap-3 min-w-max">
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setTimeMode("DAY")}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  timeMode === "DAY"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                <CalendarDays size={12} /> {t('common.day', "Dag")}
              </button>
              <button
                onClick={() => setTimeMode("WEEK")}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  timeMode === "WEEK"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                <TrendingUp size={12} /> {t('common.week', "Week")}
              </button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setActiveTab("assignment")}
                className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "assignment"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                {t('personnel.occupancy', "Bezetting")}
              </button>
              <button
                onClick={() => setActiveTab("loan")}
                className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "loan"
                    ? "bg-white text-indigo-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                {t('personnel.lending', "Uitlenen")}
              </button>
              <button
                onClick={() => setActiveTab("personnel")}
                className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === "personnel"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400"
                }`}
              >
                {t('personnel.staff', "Personeel")}
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
              className="bg-blue-600 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 shrink-0"
            >
              <Plus size={16} /> {t('common.new', "Nieuw")}
            </button>

            {/* NFC tag registratie knop */}
            <button
              onClick={() => setShowNFCModal(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-95 flex items-center gap-2 shrink-0"
              title="Druppels koppelen aan personeelsleden"
            >
              <Nfc size={16} /> NFC-tags
            </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 border-t border-slate-50 pt-3">
          <div className="w-full md:w-auto flex items-center justify-between md:justify-start gap-3 bg-slate-900 text-white p-1.5 rounded-[20px] shadow-2xl">
            <button
              onClick={() => setViewDate((prev) => subDays(prev, 1))}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col items-center px-2 sm:px-6 min-w-0 md:min-w-[200px]">
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">
                {isToday(viewDate)
                  ? t('common.today', "Vandaag")
                  : format(viewDate, "eeee", { locale: nl })}
              </span>
              <span className="text-sm sm:text-base font-black uppercase italic tracking-tight text-center">
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

          <div className="w-full md:w-auto flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <CalendarDays size={14} className="text-slate-500" />
            <input
              type="date"
              value={selectedDateStr}
              onChange={(e) => {
                const parsed = parse(e.target.value, "yyyy-MM-dd", new Date());
                if (!Number.isNaN(parsed.getTime())) {
                  setViewDate(parsed);
                }
              }}
              className="bg-transparent text-xs font-black text-slate-700 outline-none w-full"
            />
            <button
              onClick={() => setViewDate(new Date())}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black uppercase text-slate-600"
            >
              Vandaag
            </button>
          </div>

          <button
            onClick={() => handleCopyYesterday()}
            disabled={isCopying}
            className={`w-full md:w-auto px-6 py-3 border-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-sm ${
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
            {viewDate.getDay() === 1 ? t('personnel.copyFriday', "Herhaal Vrijdag") : t('personnel.copyYesterday', "Herhaal Gisteren")}
          </button>

          {status && (
            <div className="w-full md:w-auto bg-emerald-50 text-emerald-600 px-4 md:px-6 py-3 rounded-2xl border border-emerald-100 text-[10px] font-black uppercase animate-in zoom-in text-center">
              {status.msg}
            </div>
          )}

          {activeTab === "assignment" && (
            <div className="w-full md:flex-1 flex items-center gap-4 overflow-x-auto no-scrollbar py-2 md:justify-end">
              <div className="bg-slate-900 px-6 py-4 rounded-3xl flex items-center gap-6 border border-white/5 shadow-xl shrink-0">
                {/* Totaal Volume */}
                <div className="text-left">
                  <span className="text-[9px] font-black text-blue-400 uppercase block mb-1">{t('personnel.totalVolume', "Totaal Volume")}</span>
                  <div className="flex items-baseline gap-1.5 text-white">
                    <span className="text-2xl font-black italic">{kpiData.global.hours.toFixed(1)}</span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('common.hoursUnitShort', 'u')}</span>
                  </div>
                  <span className="text-[8px] text-slate-400 font-bold uppercase">{timeMode === 'DAY' ? t('common.perDay', 'per dag') : t('common.perWeek', 'per week')}</span>
                </div>
                <div className="w-px h-8 bg-white/10"></div>
                {/* Man-uren */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{t('personnel.manHours', "Man-uren")}</span>
                  <span className="text-xs font-black text-white">{kpiData.global.hours.toFixed(1)}</span>
                  <span className="text-[7px] text-slate-400 font-bold uppercase">{timeMode === 'DAY' ? t('common.perDay', 'per dag') : t('common.perWeek', 'per week')}</span>
                </div>
                {/* BH Stations */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">{t('personnel.bhStations', "BH Stations")}</span>
                  <span className="text-xs font-black text-emerald-300">{kpiData.production.toFixed(1)}</span>
                </div>
                {/* Overig */}
                <div className="flex flex-col items-center px-3 border-r border-white/10 last:border-0 min-w-[60px]">
                  <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest">{t('common.other', "Overig")}</span>
                  <span className="text-xs font-black text-blue-300">{kpiData.support.toFixed(1)}</span>
                </div>
                {/* Efficiency */}
                <div className="flex flex-col items-center px-3 min-w-[60px]">
                  <span className="text-[7px] font-black text-purple-500 uppercase tracking-widest">{t('personnel.efficiency', "Efficiency")}</span>
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

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 custom-scrollbar bg-slate-50/50">
        <div className={`${activeTab === "assignment" ? "w-full" : "max-w-7xl mx-auto"} pb-40`}>
          {/* TAB 1: BEZETTING PER STATION */}
          {activeTab === "assignment" && (
            <PersonnelOccupancyView
              scope="all"
              structure={structure}
              occupancy={occupancy}
              personnel={personnelWithId}
              selectedDateStr={selectedDateStr}
              onCopyYesterday={handleCopyYesterday}
              onClearToday={async () => {}}
            />
          )}

          {/* TAB 2: PERSONEELSLIJST (DATABASE) */}
          {activeTab === "personnel" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm p-4">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('personnel.summaryTotal', 'Totaal')}</div>
                  <div className="text-2xl font-black text-slate-900 italic">{personnelOverview.total}</div>
                </div>
                <div className="bg-white rounded-[24px] border border-emerald-100 shadow-sm p-4">
                  <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">{t('personnel.summaryActive', 'Actief')}</div>
                  <div className="text-2xl font-black text-emerald-700 italic">{personnelOverview.active}</div>
                </div>
                <div className="bg-white rounded-[24px] border border-indigo-100 shadow-sm p-4">
                  <div className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">{t('personnel.summaryLoaned', 'Uitgeleend')}</div>
                  <div className="text-2xl font-black text-indigo-700 italic">{personnelOverview.loaned}</div>
                </div>
                <div className="bg-white rounded-[24px] border border-blue-100 shadow-sm p-4">
                  <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">{t('personnel.summaryDepartments', 'Afdelingen')}</div>
                  <div className="text-2xl font-black text-blue-700 italic">{personnelOverview.departments}</div>
                </div>
                <div className="bg-white rounded-[24px] border border-amber-100 shadow-sm p-4 col-span-2 lg:col-span-1">
                  <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">{t('personnel.summaryUnmatched', 'Ongekoppeld')}</div>
                  <div className="text-2xl font-black text-amber-700 italic">{personnelOverview.unmatched}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
                <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-md">
                      <Users size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">{t('personnel.teamLayout', 'Teamindeling')}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('personnel.teamLayoutDesc', 'Snel overzicht per afdeling')}</p>
                    </div>
                  </div>
                  <PersonnelTeamView personnel={personnelWithId} departments={structure.departments || []} />
                </div>

                <div>
                  <PersonnelListView
                    personnel={personnelWithId}
                    departments={structure.departments || []}
                    linkedTagEmployeeKeys={linkedTagEmployeeKeys}
                    expandedDepts={listExpandedSections}
                    onToggleDept={(id) => setListExpandedSections(prev => ({...prev, [id]: !prev[id]}))}
                    onEdit={(p) => openEditPerson(p as Person)}
                    onDelete={async (id: string) => {
                      const confirmed = await showConfirm({
                        title: t('personnel.deleteTitle', 'Medewerker verwijderen'),
                        message: t('common.deleteConfirm', "Verwijderen?"),
                        confirmText: t('common.delete', 'Verwijderen'),
                        cancelText: t('common.cancel', 'Annuleren'),
                        tone: 'danger',
                      });
                      if (!confirmed) return;
                      await deleteDoc(doc(db, `${getPathString(PATHS.PERSONNEL)}/${id}`));
                      await logActivity(
                        auth.currentUser?.uid || "system",
                        "PERSONNEL_DELETE",
                        `Personeelsrecord verwijderd: ${id}`
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: PERSOON TOEVOEGEN/BEWERKEN */}
      {isPersonModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[28px] sm:rounded-[45px] shadow-2xl flex flex-col border border-white/10 animate-in zoom-in-95 my-8 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
            <div className="p-4 sm:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
                  <UserPlus size={24} />
                </div>
                <div className="text-left">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
                    {editingId ? t('common.edit', "Edit") : t('common.new', "New")}{" "}
                    <span className="text-blue-600">{t('personnel.resource', "Resource")}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">
                    {t('personnel.masterDb', "Master Personnel Database")}
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
            <div className="flex gap-2 px-4 sm:px-6 pt-2">
              <button
                type="button"
                onClick={() => setModalTab("profile")}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "profile" ? "bg-slate-100 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`}
              >
                {t('personnel.profile', "Profiel")}
              </button>
              <button
                type="button"
                onClick={() => setModalTab("loan")}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${modalTab === "loan" ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50"}`}
              >
                {t('personnel.lending', "Uitlenen")}
              </button>
            </div>

            <form
              onSubmit={handleSavePerson}
              className="p-4 sm:p-6 space-y-5 sm:space-y-6 text-left overflow-y-auto"
            >
              {modalTab === "profile" && (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    {t('personnel.employeeName', "Naam Medewerker")}
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
                    {t('personnel.employeeNumber', "Personeelsnummer")}
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
                  {duplicatePerson && (
                    <div className="ml-2 mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                      <p className="text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle size={12} /> {t('personnel.numberInUse', "Dit nummer is al in gebruik!")}
                      </p>
                      <p className="text-[10px] font-semibold mt-1">
                        Bestaand record: {duplicatePerson.name || "Onbekend"} ({duplicatePerson.id})
                      </p>
                      <p className="text-[10px] font-medium opacity-80 mt-1">
                        Afdeling: {getDepartmentLabel(duplicatePerson.departmentId)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                  {t('personnel.linkUser', "Koppel User Account")}
                </label>
                <select
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm cursor-pointer"
                  value={personForm.linkedUserId || ""}
                  onChange={(e) => setPersonForm({ ...personForm, linkedUserId: e.target.value })}
                >
                  <option value="">{t('personnel.noLink', "Geen koppeling...")}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                  {t('personnel.defaultDept', "Standaard Afdeling")}
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
                  <option value="">{t('personnel.chooseDept', "Kies afdeling...")}</option>
                  {structure.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {editingId && (
                <div className="space-y-3 p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Nfc size={16} className="text-emerald-700" />
                      <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">
                        NFC-tags
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPersonModalOpen(false);
                        setShowNFCModal(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
                    >
                      Tag wijzigen
                    </button>
                  </div>

                  {currentPersonNfcMappings.length === 0 ? (
                    <p className="text-xs font-bold text-emerald-700/80">
                      Geen gekoppelde NFC-tag gevonden.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentPersonNfcMappings.map((mapping) => (
                        <div key={mapping.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-emerald-200">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('common.tag', 'Tag')}</p>
                            <p className="text-xs font-mono font-bold text-slate-800 truncate">{mapping.tagId || mapping.id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePersonNfcTag(mapping.id, mapping.tagId)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Verwijderen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-6 border-t border-slate-50 space-y-6">
                {/* Rotatie Type Keuze */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">
                    {t('personnel.shiftType', "Ploegen Type")}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
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
                      🔒 {t('personnel.staticShift', "Vaste Ploeg")}
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
                      🔄 {t('personnel.rotationShift', "Rotatie Ploegen")}
                    </button>
                  </div>
                </div>

                {/* Vaste Ploeg Keuze */}
                {!personForm.rotationSchedule?.enabled && (
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block italic">
                      {t('personnel.staticShift', "Vaste Ploeg")}
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
                        <RotateCcw size={12} /> {t('personnel.startWeekWith', "Start Deze Week Met")}
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
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-2">{t('personnel.rotationSchedule', "Rotatie Schema:")}</p>
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
                              {t('common.week', "Week")} {idx + 1}: {shift?.label || shiftId}
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-[8px] text-emerald-600 mt-2 italic">
                        {t('personnel.rotationInfo', { week: personForm.rotationSchedule.startWeek, count: personForm.rotationSchedule.shifts.length })}
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
                      {t('personnel.accountActive', "Account Actief")}
                    </span>
                  </label>
                </div>
              </div>
              </>
            )}

            {modalTab === "loan" && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <span className="text-xs font-black text-indigo-800 uppercase">{t('personnel.activeLending', "Actief Uitlenen")}</span>
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
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">{t('personnel.targetDept', "Doel Afdeling")}</label>
                        <select 
                          className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm"
                          value={personForm.loan.departmentId}
                          onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, departmentId: e.target.value }})}
                        >
                          <option value="">{t('personnel.chooseDept', "Kies afdeling...")}</option>
                          {structure.departments.filter(d => d.id !== personForm.departmentId).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">{t('personnel.targetShift', "Doel Ploeg")}</label>
                        <select 
                          className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm"
                          value={personForm.loan.shiftId}
                          onChange={e => setPersonForm({...personForm, loan: { ...personForm.loan, shiftId: e.target.value }})}
                        >
                          <option value="">{t('personnel.chooseShift', "Kies ploeg...")}</option>
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
                          <span className="text-xs font-bold text-slate-700">{t('personnel.followTargetRotation', "Volg ploegenrooster doelafdeling")}</span>
                        </label>

                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded text-indigo-600"
                            checked={personForm.loan.autoReturn}
                            onChange={e => handleAutoReturnToggle(e.target.checked)}
                          />
                          <span className="text-xs font-bold text-slate-700">{t('personnel.autoReturn5Days', "Automatisch terug na 5 dagen")}</span>
                        </label>
                        
                        {personForm.loan.autoReturn && personForm.loan.returnDate && (
                          <div className="text-[10px] font-bold text-indigo-600 px-4">
                            {t('personnel.returnDate', "Retour datum:")} {personForm.loan.returnDate}
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
                {t('common.saveData', "Gegevens Vastleggen")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* NFC Tag Registration Modal */}
      <NFCTagRegistrationModal 
        isOpen={showNFCModal} 
        onClose={() => setShowNFCModal(false)}
        personnel={personnelWithId}
        preselectedEmployeeNumber={personForm.employeeNumber || ""}
      />

      {/* FOOTER INFO */}
      <div className="p-4 bg-slate-950 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[9px] sm:text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] sm:tracking-[0.4em] px-4 sm:px-10 shrink-0">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <span className="flex items-center gap-2 text-emerald-500/50">
            <ShieldCheck size={14} /> {t('personnel.forensicNode', "Forensic Audit Node")}
          </span>
          <span className="flex items-center gap-2">
            <Database size={14} /> {t('personnel.centralVault', "Central Resource Vault")}
          </span>
        </div>
        <span className="opacity-30 italic">{t('common.version', "Future Factory MES v6.11")}</span>
      </div>
    </div>
  );
};

export default PersonnelManager;
