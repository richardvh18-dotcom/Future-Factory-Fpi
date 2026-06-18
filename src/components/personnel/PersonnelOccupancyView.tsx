import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  Loader2, Cpu, Layers, Clock,
  ChevronUp, ShieldCheck, X,
  ArrowRight, Copy, Trash2,
  Save
} from "lucide-react";
import { format, getISOWeek, parse, addDays } from "date-fns";
import { db, auth, logActivity } from "../../config/firebase";
import { 
  collection, onSnapshot, query, orderBy, doc
} from "firebase/firestore";
import { normalizeMachine } from "../../utils/hubHelpers";
import { PATHS, getPathString } from "../../config/dbPaths";
import LoanPersonnelModal from "../digitalplanning/modals/LoanPersonnelModal";
import { useNotifications } from '../../contexts/NotificationContext';
import { savePersonnelRecord, saveOccupancyAssignment, deleteOccupancyAssignment } from "../../services/planningSecurityService";
import { useFormPersistence } from "../../hooks/useFormPersistence";

export interface Department {
  id: string;
  name: string;
  slug?: string;
  shifts?: { id: string; label: string; start?: string; end?: string }[];
  stations?: { id: string; name: string }[];
}

export interface User {
  id: string;
  name?: string;
  email?: string;
}

export interface Person {
  id?: string;
  name: string;
  employeeNumber: string;
  departmentId: string;
  linkedUserId?: string;
  shiftId?: string;
  role?: string;
  isActive?: boolean;
  temporaryShiftOverride?: {
    enabled: boolean;
    shiftId: string;
    startDate: string;
    endDate: string;
    note: string;
  };
  loan?: {
    active: boolean;
    departmentId: string;
    shiftId: string;
    autoReturn: boolean;
    returnDate: string;
    followRotation: boolean;
  };
  rotationSchedule?: {
    enabled: boolean;
    startWeek?: number;
    shifts?: string[];
  };
  [key: string]: any;
}

export interface OccupancyRecord {
  id?: string;
  departmentId?: string;
  machineId?: string;
  operatorNumber?: string;
  operatorName?: string;
  date?: string;
  hoursWorked?: number;
  startTime?: any;
  isPloeg?: boolean;
  shift?: string;
  isLoan?: boolean;
  checkedOutAt?: any;
  isActive?: boolean;
  [key: string]: any;
}

interface AddEditPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Person) => void;
  initialData: Person | null;
  departments: Department[];
  users?: User[];
}

/**
 * Add/Edit Modal Component (Intern)
 */
const AddEditPersonModal: React.FC<AddEditPersonModalProps> = ({ isOpen, onClose, onSave, initialData, departments, users = [] }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("profile");
  const [formData, setFormData] = useFormPersistence<Person>("personnel_add_edit_modal_form", {
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
    } else {
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleAutoReturnToggle = (checked: boolean) => {
    const newLoan = { ...(formData.loan || { active: false, departmentId: "", shiftId: "", autoReturn: false, returnDate: "", followRotation: false }), autoReturn: checked };
    if (checked) {
      newLoan.returnDate = format(addDays(new Date(), 5), "yyyy-MM-dd");
    } else {
      newLoan.returnDate = "";
    }
    setFormData({ ...formData, loan: newLoan });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[30px] p-8 max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-900 uppercase italic">
            {initialData ? t("personnelOccupancy.labels.editEmployee") : t("personnelOccupancy.labels.newEmployee")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "profile" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}
          >
            {t("personnelOccupancy.labels.profile")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("loan")}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "loan" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
          >
            {t("personnelOccupancy.labels.loan")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "profile" && (
            <>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.name")}</label>
                <input 
                  type="text" 
                  required
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.employeeNumber")}</label>
                <input 
                  type="text" 
                  required
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.employeeNumber}
                  onChange={e => setFormData({...formData, employeeNumber: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.linkUserAccount")}</label>
                <select 
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.linkedUserId || ""}
                  onChange={e => setFormData({...formData, linkedUserId: e.target.value})}
                >
                  <option value="">{t("personnelOccupancy.placeholders.noLink")}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("common.department")}</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                    value={formData.departmentId}
                    onChange={e => setFormData({...formData, departmentId: e.target.value})}
                  >
                    <option value="">{t("personnelOccupancy.placeholders.select")}</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.shift")}</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                    value={formData.shiftId}
                    onChange={e => setFormData({...formData, shiftId: e.target.value})}
                  >
                    {availableShifts.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-2xl border-2 border-blue-100 bg-blue-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest">{t("personnelOccupancy.labels.temporaryShiftOverride")}</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-blue-600"
                    checked={temporaryOverride.enabled}
                    onChange={(e) => {
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
                    }}
                  />
                </div>

                {temporaryOverride.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.from")}</label>
                        <input
                          type="date"
                          className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500"
                          value={temporaryOverride.startDate}
                          onChange={(e) => setFormData({
                            ...formData,
                            temporaryShiftOverride: {
                              ...temporaryOverride,
                              startDate: e.target.value,
                              endDate: temporaryOverride.endDate || e.target.value,
                            }
                          })}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.to")}</label>
                        <input
                          type="date"
                          className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500"
                          value={temporaryOverride.endDate}
                          onChange={(e) => setFormData({
                            ...formData,
                            temporaryShiftOverride: {
                              ...temporaryOverride,
                              endDate: e.target.value,
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.temporaryShift")}</label>
                      <select
                        className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500"
                        value={temporaryOverride.shiftId}
                        onChange={(e) => setFormData({
                          ...formData,
                          temporaryShiftOverride: {
                            ...temporaryOverride,
                            shiftId: e.target.value,
                          }
                        })}
                      >
                        <option value="">{t("personnelOccupancy.placeholders.select")}</option>
                        {availableShifts.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.noteOptional")}</label>
                      <input
                        type="text"
                        className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500"
                        value={temporaryOverride.note || ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          temporaryShiftOverride: {
                            ...temporaryOverride,
                            note: e.target.value,
                          }
                        })}
                        placeholder={t("personnelOccupancy.placeholders.temporaryShiftExample")}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === "loan" && (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <span className="text-xs font-black text-indigo-800 uppercase">{t("personnelOccupancy.labels.activeLoan")}</span>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                  checked={formData.loan?.active || false}
                  onChange={e => setFormData({
                    ...formData,
                    loan: {
                      active: e.target.checked,
                      departmentId: formData.loan?.departmentId || "",
                      shiftId: formData.loan?.shiftId || "",
                      autoReturn: formData.loan?.autoReturn || false,
                      returnDate: formData.loan?.returnDate || "",
                      followRotation: formData.loan?.followRotation || false,
                    }
                  })}
                />
              </div>

              {formData.loan?.active && (
                <>
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.targetDepartment")}</label>
                    <select 
                      className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500"
                      value={formData.loan.departmentId}
                      onChange={e => setFormData({
                        ...formData,
                        loan: {
                          active: formData.loan?.active || false,
                          departmentId: e.target.value,
                          shiftId: formData.loan?.shiftId || "",
                          autoReturn: formData.loan?.autoReturn || false,
                          returnDate: formData.loan?.returnDate || "",
                          followRotation: formData.loan?.followRotation || false,
                        }
                      })}
                    >
                      <option value="">{t("personnelOccupancy.placeholders.chooseDepartment")}</option>
                      {departments.filter(d => d.id !== formData.departmentId).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.targetShift")}</label>
                    <select 
                      className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500"
                      value={formData.loan.shiftId}
                      onChange={e => setFormData({
                        ...formData,
                        loan: {
                          active: formData.loan?.active || false,
                          departmentId: formData.loan?.departmentId || "",
                          shiftId: e.target.value,
                          autoReturn: formData.loan?.autoReturn || false,
                          returnDate: formData.loan?.returnDate || "",
                          followRotation: formData.loan?.followRotation || false,
                        }
                      })}
                    >
                      <option value="">{t("personnelOccupancy.placeholders.chooseShift")}</option>
                      {loanShifts.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-indigo-600"
                        checked={formData.loan.followRotation}
                        onChange={e => setFormData({
                          ...formData,
                          loan: {
                            active: formData.loan?.active || false,
                            departmentId: formData.loan?.departmentId || "",
                            shiftId: formData.loan?.shiftId || "",
                            autoReturn: formData.loan?.autoReturn || false,
                            returnDate: formData.loan?.returnDate || "",
                            followRotation: e.target.checked,
                          }
                        })}
                      />
                      <span className="text-xs font-bold text-slate-700">{t("personnelOccupancy.labels.followTargetRotation")}</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-indigo-600"
                        checked={formData.loan.autoReturn}
                        onChange={e => handleAutoReturnToggle(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-slate-700">{t("personnelOccupancy.labels.autoReturnAfter5Days")}</span>
                    </label>
                    
                    {formData.loan.autoReturn && formData.loan.returnDate && (
                      <div className="text-[10px] font-bold text-indigo-600 px-2">
                        {t("personnelOccupancy.labels.returnDate", { date: formData.loan.returnDate })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4">
            <Save size={18} /> {t("common.save")}
          </button>
        </form>
      </div>
    </div>
  );
};

export interface PersonnelOccupancyViewProps {
  scope?: string | null;
  structure?: { departments?: Department[] };
  occupancy?: OccupancyRecord[];
  personnel?: Person[];
  users?: User[];
  selectedDateStr?: string;
  editable?: boolean;
  onCopyYesterday?: (deptId: string) => void;
  isCopying?: boolean;
  onClearToday?: (deptId: string) => void;
  isClearing?: boolean;
}

/**
 * PersonnelOccupancyView - V40 (Uitleensysteem + Lijstbeheer)
 */
const PersonnelOccupancyView: React.FC<PersonnelOccupancyViewProps> = ({ 
  scope, 
  structure: propStructure, 
  occupancy: propOccupancy, 
  personnel: propPersonnel,
  users = [], 
  selectedDateStr,
  editable = true,
  onCopyYesterday,
  isCopying = false,
  onClearToday,
  isClearing = false
}) => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [localPersonnel, setLocalPersonnel] = useState<Person[]>([]);
  const [localOccupancy, setLocalOccupancy] = useState<OccupancyRecord[]>([]);
  const [localStructure, setLocalStructure] = useState<{ departments: Department[] }>({ departments: [] });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());

  // Live uren teller — elke 60 seconden hertekenen
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Berekent live uren op basis van startTime, valt terug op hoursWorked
  const getDisplayHours = (occ: OccupancyRecord) => {
    if (occ.startTime) {
      const startMs = occ.startTime.toMillis ? occ.startTime.toMillis() : Number(occ.startTime);
      if (startMs > 0) {
        return ((tick - startMs) / 3_600_000); // milliseconden → uren
      }
    }
    return Number(occ.hoursWorked ?? 0);
  };
  
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Modals
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [selectedPersonForLoan, setSelectedPersonForLoan] = useState<OccupancyRecord | Person | null>(null);
  const [selectedDepartmentForLoan, setSelectedDepartmentForLoan] = useState<Department | null>(null);
  
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string } | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [assignShift, setAssignShift] = useState("");
  const [assignHours, setAssignHours] = useState("8.0");

  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  // Edit Assignment State
  const [editAssignmentModalOpen, setEditAssignmentModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<OccupancyRecord | null>(null);
  const [closedHoursModalOpen, setClosedHoursModalOpen] = useState(false);
  const [closedHoursDraft, setClosedHoursDraft] = useState<Record<string, number | string>>({});

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

    const unsubPersonnel = onSnapshot(
      query(collection(db, getPathString(PATHS.PERSONNEL)), orderBy("name")),
      (snap) => {
        setLocalPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() } as Person)));
      },
      (error) => console.error("Personnel sync error:", error)
    );
    
    const unsubOccupancy = onSnapshot(
      collection(db, getPathString(PATHS.OCCUPANCY)),
      (snap) => {
        setLocalOccupancy(snap.docs.map(d => ({ id: d.id, ...d.data() } as OccupancyRecord)));
      },
      (error) => console.error("Occupancy sync error:", error)
    );
    
    const unsubStructure = onSnapshot(
      doc(db, getPathString(PATHS.FACTORY_CONFIG)),
      (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as { departments: Department[] };
            setLocalStructure(data);
            const initialExpanded: Record<string, boolean> = {};
            (data.departments || []).forEach(d => { initialExpanded[d.id] = true; });
            setExpandedSections(initialExpanded);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Factory config sync error:", error);
        setLoading(false);
      }
    );
    
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
  const handleSavePerson = async (data: Person) => {
    try {
      const rawOverride = (data?.temporaryShiftOverride || {}) as Record<string, unknown>;
      const normalizedOverride = {
        enabled: !!rawOverride.enabled,
        shiftId: String(rawOverride.shiftId || ""),
        startDate: String(rawOverride.startDate || ""),
        endDate: String(rawOverride.endDate || ""),
        note: String(rawOverride.note || ""),
      };
      const withNormalizedData = {
        ...data,
        temporaryShiftOverride:
          normalizedOverride.enabled && normalizedOverride.shiftId && normalizedOverride.startDate
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
        await logActivity(
          auth.currentUser?.uid || "system",
          "PERSONNEL_UPDATE",
          `Personeel bijgewerkt: ${data?.name || editingPerson.id}`
        );
      } else {
        await savePersonnelRecord({
          data: {
          ...withNormalizedData,
          createdAt: "__SERVER_TIMESTAMP__",
          updatedAt: "__SERVER_TIMESTAMP__",
        },
          source: "PersonnelOccupancyView.savePerson.create",
          actorLabel: auth.currentUser?.email || "system",
        });
        await logActivity(
          auth.currentUser?.uid || "system",
          "PERSONNEL_CREATE",
          `Personeel toegevoegd: ${data?.name || data?.employeeNumber || "onbekend"}`
        );
      }
      setAddEditModalOpen(false);
      setEditingPerson(null);
    } catch (err) {
      console.error("Fout bij opslaan medewerker:", err);
      notify(t("personnelOccupancy.notifications.saveFailed"));
    }
  };

  const handleDeleteOccupancy = async (occ: OccupancyRecord) => {
    try {
      await deleteOccupancyAssignment({
        assignmentId: occ.id,
        source: "PersonnelOccupancyView.deleteOccupancy",
        actorLabel: auth.currentUser?.email || "system",
      });
      await logActivity(
        auth.currentUser?.uid || "system",
        "OCCUPANCY_DELETE",
        `Bezetting verwijderd: ${occ.operatorName || occ.operatorNumber} op ${occ.machineId}`
      );
    } catch (err) {
      console.error("Verwijderen bezetting mislukt:", err);
      notify(t("personnelOccupancy.notifications.deleteOccupancyFailed"));
    }
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={48} /></div>;

  const getPersonShiftForDate = (person: Person | null | undefined, targetDateStr: string) => {
    if (!person) return undefined;

    let shiftId = person.shiftId || "DAGDIENST";

    const override = person.temporaryShiftOverride;
    if (override?.enabled && override?.shiftId && override?.startDate) {
      const rangeStart = String(override.startDate);
      const rangeEnd = String(override.endDate || override.startDate);
      if (targetDateStr >= rangeStart && targetDateStr <= rangeEnd) {
        return override.shiftId;
      }
    }

    const rotationShifts = person.rotationSchedule?.shifts || [];
    if (person.rotationSchedule?.enabled && rotationShifts.length > 0) {
      const targetDate = parse(targetDateStr, "yyyy-MM-dd", new Date());
      const targetWeek = getISOWeek(targetDate);
      const startWeekNum = person.rotationSchedule.startWeek || 1;
      const weeksSinceStart = targetWeek - startWeekNum;
      const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
      shiftId = rotationShifts[shiftIndex];
    }

    return shiftId;
  };

  const getShiftLabelFromDept = (dept: Department | null | undefined, shiftId: string | undefined) => {
    if (!shiftId) return "?";
    const shiftObj = (dept?.shifts || []).find(s => s.id === shiftId);
    return shiftObj?.label || shiftId;
  };
  
  const getShiftColor = (shiftLabel: string | undefined) => {
    const label = (shiftLabel || "").toUpperCase();
    if (label.includes("OCHTEND") || label.includes("MORNING")) return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", ring: "ring-amber-100" };
    if (label.includes("AVOND") || label.includes("EVENING")) return { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-100" };
    if (label.includes("NACHT") || label.includes("NIGHT")) return { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-100" };
    if (label.includes("DAG") || label === "DAGDIENST") return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-100" };
    return { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-100 text-slate-700", ring: "ring-slate-100" };
  };

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-500 w-full pb-4 px-1 h-full overflow-y-auto custom-scrollbar">
          {editable && (
            <div className="flex justify-end pr-2">
              <button
                onClick={() => {
                  const initialDraft: Record<string, number | string> = {};
                  closedAssignmentsForDate.forEach((entry) => {
                    initialDraft[entry.id!] = entry.hoursWorked ?? 0;
                  });
                  setClosedHoursDraft(initialDraft);
                  setClosedHoursModalOpen(true);
                }}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-700 hover:border-blue-300 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm"
              >
                <Clock size={14} /> {t("personnelOccupancy.labels.correctHoursAfterward")}
              </button>
            </div>
          )}

          {/* OCCUPANCY GRID */}
          {displaySections.map(dept => (
            <section key={dept.id} className="space-y-4 text-left">
                <div className="w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 ml-2 p-2 rounded-xl">
                    <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all">
                        <div className="p-2 bg-slate-800 text-white rounded-xl shadow-md"><Layers size={16} /></div>
                        <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">{dept.name}</h3>
                    </button>
                    
                    {editable && onCopyYesterday && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onCopyYesterday(dept.id); }}
                        disabled={isCopying}
                        className="mr-2 p-2 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm"
                        title={t("personnelOccupancy.labels.copyYesterdayTitle")}
                      >
                        {isCopying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                        <span className="hidden sm:inline">{t("personnelOccupancy.labels.copyYesterday")}</span>
                      </button>
                    )}

                    {editable && onClearToday && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onClearToday(dept.id); }}
                        disabled={isClearing}
                        className="mr-2 p-2 bg-white border border-rose-200 text-rose-500 hover:text-rose-700 hover:border-rose-300 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm"
                        title={t("personnelOccupancy.labels.clearTodayTitle")}
                      >
                        {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span className="hidden sm:inline">{t("personnelOccupancy.labels.reset")}</span>
                      </button>
                    )}

                    <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="p-2">
                      <ChevronUp className={`transition-transform duration-300 ${expandedSections[dept.id] !== false ? '' : 'rotate-180'}`} size={20} />
                    </button>
                </div>

                {expandedSections[dept.id] !== false && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 animate-in zoom-in-95 duration-200 text-left">
                        {dept.stations.map(station => {
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
                            const byShift: Record<string, OccupancyRecord[]> = {};
                            stationOccupancy.forEach(occ => {
                              const shiftKey = occ.shift || "DAGDIENST";
                              if (!byShift[shiftKey]) byShift[shiftKey] = [];
                              byShift[shiftKey].push(occ);
                            });
                            
                            return (
                                <div
                                  key={station.id}
                                  className={`p-1.5 rounded-xl border-2 transition-all duration-500 relative flex flex-col shadow-sm min-h-[16rem] max-h-[24rem] ${isTL ? (isBusy ? 'bg-slate-900 border-amber-400 ring-2 ring-amber-400/10 shadow-xl' : 'bg-slate-900 border-slate-800 opacity-80 shadow-inner') : (isBusy ? 'bg-white border-blue-500 ring-2 ring-blue-50/50' : 'bg-white border-slate-100 hover:border-blue-200')}`}
                                  style={{ cursor: editable ? 'pointer' : 'default' }}
                                  onClick={() => {
                                    if (editable) {
                                      setSelectedDept(dept);
                                      setSelectedStation(station);
                                      setSelectedPersonId("");
                                      setAssignShift("");
                                      setAssignHours("8.0");
                                      setAssignModalOpen(true);
                                    }
                                  }}
                                >
                                    <div className="flex justify-between items-start mb-1.5 text-left shrink-0">
                                      <div className="text-left"><span className={`text-[7px] font-black uppercase tracking-widest block mb-0.5 ${isTL ? 'text-amber-500 italic' : 'text-slate-400 opacity-60'}`}>{isTL ? 'Regie' : 'Station ID'}</span><h4 className={`text-[12px] font-black tracking-tighter italic uppercase truncate leading-none ${isTL ? 'text-white' : 'text-slate-900'}`}>{mId}</h4></div>
                                        {isTL ? <ShieldCheck size={16} className={isBusy ? 'text-amber-400' : 'text-slate-600'} /> : <Cpu size={16} className={isBusy ? 'text-blue-600' : 'text-slate-200'} />}
                                    </div>
                                    <div className="space-y-1 mb-1.5 flex-1 text-left text-left overflow-y-auto pr-1 custom-scrollbar">
                                        {Object.entries(byShift).map(([shiftKey, operators]) => {
                                          const shiftColors = getShiftColor(shiftKey);
                                          return (
                                            <div key={shiftKey} className="space-y-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                <div className={`h-1 flex-1 rounded ${shiftColors.badge}`}></div>
                                                <span className={`text-[8px] font-black uppercase tracking-wider ${shiftColors.text}`}>{shiftKey}</span>
                                                <div className={`h-1 flex-1 rounded ${shiftColors.badge}`}></div>
                                              </div>
                                              {operators.map(occ => (
                                                <div 
                                                  key={occ.id} 
                                                  onClick={(e) => {
                                                    if (!editable) return;
                                                    e.stopPropagation();
                                                    setSelectedAssignment({ ...occ });
                                                    setEditAssignmentModalOpen(true);
                                                  }}
                                                  className={`p-1 rounded-lg border flex flex-col gap-0.5 animate-in slide-in-from-right-1 cursor-pointer hover:scale-[1.02] transition-all ${isTL ? 'bg-white/5 border-white/10 text-white' : `${shiftColors.bg} ${shiftColors.border}`} ${occ.isLoan ? 'ring-2 ring-green-400' : `ring-1 ${shiftColors.ring}`}`}>
                                                    <div className="flex items-center justify-between text-left">
                                                        <div className="text-left overflow-hidden text-left flex-1">
                                                            <h5 className={`text-[11px] sm:text-xs font-black uppercase italic truncate mb-0.5 text-left ${isTL ? 'text-amber-400' : shiftColors.text}`}>{occ.operatorName || t("personnelOccupancy.labels.nameless")}</h5>
                                                            <div className="flex items-center gap-1 opacity-70 text-left flex-wrap">
                                                                <span className={`text-[6px] font-black px-1 py-0 rounded ${occ.isPloeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{occ.shift || (occ.isPloeg ? 'PLOEG' : 'DAG')}</span>
                                                                <span className={`text-[6px] font-bold uppercase ${isTL ? 'text-slate-400' : 'text-slate-600'}`}>#{occ.operatorNumber || "?"}</span>
                                                                {occ.isLoan && <span className="text-[6px] font-black px-1 py-0 rounded bg-green-100 text-green-700">{t("personnelOccupancy.labels.loaned")}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                          {editable && !occ.isLoan && (
                                                            <button onClick={(e) => { e.stopPropagation(); setSelectedPersonForLoan(occ); setSelectedDepartmentForLoan(dept); setLoanModalOpen(true); }} className="p-0.5 text-blue-400 hover:text-blue-600 transition-colors" title={t("personnelOccupancy.labels.loanToOtherDepartment")}><ArrowRight size={10} /></button>
                                                          )}
                                                          <button onClick={(e) => { e.stopPropagation(); handleDeleteOccupancy(occ); }} className="p-0.5 text-slate-400 hover:text-rose-500 transition-colors"><X size={10} /></button>
                                                        </div>
                                                    </div>
                                                    <div className={`pt-1 border-t flex items-center justify-between ${isTL ? 'border-white/5' : 'border-slate-300/60'}`}>
                                                      <div className="flex items-center gap-1"><Clock size={8} className={shiftColors.text} /><span className={`text-[6px] font-black uppercase tracking-tighter ${isTL ? 'text-slate-500' : 'text-slate-500'}`}>{t("personnelOccupancy.labels.allocation")}</span></div>
                                                      <span className={`text-[10px] sm:text-[11px] font-black ${isTL ? 'text-white' : shiftColors.text}`}>{getDisplayHours(occ).toFixed(1)}u</span>
                                                    </div>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })}
                                        {!isBusy && <div className={`py-4 border border-dashed rounded-2xl flex flex-col items-center justify-center opacity-40 ${isTL ? 'border-white/10' : 'border-slate-200'}`}><span className={`text-[7px] font-black uppercase tracking-widest text-center ${isTL ? 'text-slate-600' : 'text-slate-400'}`}>{t("personnelOccupancy.labels.free")}</span></div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
          ))}

      {/* MODALS */}
      {selectedDepartmentForLoan && (
        <LoanPersonnelModal
          isOpen={loanModalOpen}
          onClose={() => { setLoanModalOpen(false); setSelectedPersonForLoan(null); setSelectedDepartmentForLoan(null); }}
          person={selectedPersonForLoan
            ? {
                operatorNumber: String((selectedPersonForLoan as any).operatorNumber || (selectedPersonForLoan as any).employeeNumber || ""),
                operatorName: String((selectedPersonForLoan as any).operatorName || (selectedPersonForLoan as any).name || ""),
                machineId: String((selectedPersonForLoan as any).machineId || ""),
                shift: String((selectedPersonForLoan as any).shift || (selectedPersonForLoan as any).shiftId || ""),
              }
            : undefined}
          currentDepartment={selectedDepartmentForLoan}
        />
      )}

      <AddEditPersonModal 
        isOpen={addEditModalOpen}
        onClose={() => { setAddEditModalOpen(false); setEditingPerson(null); }}
        onSave={handleSavePerson}
        initialData={editingPerson}
        departments={structure.departments || []}
        users={users}
      />

      {assignModalOpen && selectedDept && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase italic">{t("personnelOccupancy.labels.addPersonnel")}</h3>
              <button onClick={() => setAssignModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">{t("common.stationMachine")}</label>
                <select value={selectedStation?.id || ""} onChange={(e) => setSelectedStation(selectedDept.stations?.find(s => s.id === e.target.value) || null)} className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600" disabled>
                  <option value="">{t("personnelOccupancy.placeholders.selectStation")}</option>
                  {(selectedDept.stations || []).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">{t("personnelOccupancy.labels.filterByShift")}</label>
                <select 
                  value={assignShift} 
                  onChange={(e) => { setAssignShift(e.target.value); setSelectedPersonId(""); }} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="">{t("personnelOccupancy.placeholders.allShifts")}</option>
                  {(selectedDept.shifts || []).map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">{t("personnelOccupancy.labels.personnelMember")}</label>
                <select 
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  disabled={!assignShift && personnel.length > 100} // Optional optimization
                >
                  <option value="">{t("personnelOccupancy.placeholders.selectPersonnelMember")}</option>
                  {personnel
                    .filter(p => {
                      if (!assignShift) return true;
                      const pShiftId = getPersonShiftForDate(p, dateToUse);
                      return pShiftId === assignShift;
                    })
                    .sort((a,b) => a.name.localeCompare(b.name))
                    .map(p => {
                        const effectiveShiftId = getPersonShiftForDate(p, dateToUse);
                        const displayLabel = getShiftLabelFromDept(selectedDept, effectiveShiftId);
                        return (<option key={p.id} value={p.id}>{p.name} ({displayLabel || t("common.unknown")})</option>);
                    })}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">{t("personnelOccupancy.labels.allocationDuration")}</label>
                <input
                  type="number"
                  step="0.5"
                  value={assignHours}
                  onChange={(e) => setAssignHours(e.target.value)}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  placeholder={t("personnelOccupancy.placeholders.hoursExample")}
                />
              </div>
              <div className="pt-4 border-t border-slate-200 flex gap-3">
                <button onClick={() => setAssignModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-all">{t("personnelOccupancy.labels.done")}</button>
                <button 
                  onClick={async () => {
                    const person = personnel.find(p => p.id === selectedPersonId);
                    if (person && selectedStation) {
                      // Check op dubbele inplanning
                      const existingAssignments = occupancy.filter(o => 
                        (o.operatorNumber === person.employeeNumber || o.operatorNumber === person.id) && 
                        o.date === dateToUse
                      );

                      if (existingAssignments.length > 0) {
                        const stations = existingAssignments.map(o => o.machineId).join(", ");
                        const confirmMsg = t("personnelOccupancy.confirm.alreadyPlanned", {
                          name: person.name,
                          stations,
                          station: selectedStation.name || selectedStation.id,
                          hours: assignHours,
                        });
                        if (!window.confirm(confirmMsg)) return;
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
                        await logActivity(
                          auth.currentUser?.uid || "system",
                          "OCCUPANCY_ASSIGN",
                          `Bezetting toegevoegd: ${person.name} op ${selectedStation.name || selectedStation.id} (${dateToUse})`
                        );
                        
                        // Reset selectie voor volgende toevoeging (modal blijft open)
                        setSelectedPersonId("");
                        setAssignHours("8.0");
                      } catch (err) {
                        console.error("Fout bij toevoegen:", err);
                      }
                    }
                  }} 
                  disabled={!selectedPersonId}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("common.add")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ASSIGNMENT MODAL (HOURS) */}
      {editAssignmentModalOpen && selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] p-8 max-w-sm w-full shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-900 uppercase italic">{t("personnelOccupancy.labels.adjustHours")}</h3>
              <button onClick={() => setEditAssignmentModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{t("personnelOccupancy.labels.operator")}</p>
              <p className="font-bold text-slate-800 text-sm">{selectedAssignment.operatorName}</p>
              <p className="text-[10px] text-slate-500 mt-1">#{selectedAssignment.operatorNumber}</p>
            </div>

            <div className="mb-8">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">{t("personnelOccupancy.labels.workedHours")}</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-500 transition-all text-slate-900"
                  value={selectedAssignment.hoursWorked || 0}
                  onChange={(e) => setSelectedAssignment({...selectedAssignment, hoursWorked: Number(e.target.value)})}
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{t("personnelOccupancy.labels.hourShort")}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {!selectedAssignment.isLoan && (
                <button 
                  onClick={() => {
                    const person = personnel.find(p => p.employeeNumber === selectedAssignment.operatorNumber || p.id === selectedAssignment.operatorNumber) || null;
                    const dept = (structure.departments || []).find(d => d.id === selectedAssignment.departmentId) || null;
                    
                    if (person) {
                      setSelectedPersonForLoan(person);
                      setSelectedDepartmentForLoan(dept);
                      setLoanModalOpen(true);
                      setEditAssignmentModalOpen(false);
                    } else {
                      notify(t("personnelOccupancy.notifications.personDetailsNotFound"));
                    }
                  }}
                  className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-100 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={18} /> {t("personnelOccupancy.labels.loan")}
                </button>
              )}

              <button 
                onClick={async () => {
                  try {
                    await saveOccupancyAssignment({
                      assignmentId: selectedAssignment.id,
                      data: {
                        hoursWorked: Number(selectedAssignment.hoursWorked) || 0,
                        updatedAt: "__SERVER_TIMESTAMP__",
                      },
                      source: "PersonnelOccupancyView.editHours",
                      actorLabel: auth.currentUser?.email || "system",
                    });
                    await logActivity(
                      auth.currentUser?.uid || "system",
                      "OCCUPANCY_UPDATE_HOURS",
                      `Uren aangepast: ${selectedAssignment.operatorName || selectedAssignment.operatorNumber} op ${selectedAssignment.machineId} -> ${selectedAssignment.hoursWorked}`
                    );
                    setEditAssignmentModalOpen(false);
                  } catch (err) {
                    console.error("Update failed", err);
                    notify(t("personnelOccupancy.notifications.couldNotSaveHours"));
                  }
                }} 
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} /> {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {closedHoursModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[30px] p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-black text-slate-900 uppercase italic">{t("personnelOccupancy.labels.correctHoursAfterward")}</h3>
              <button
                onClick={() => setClosedHoursModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-500 font-bold mb-4">
              {t("personnelOccupancy.labels.closedRegistrationsSummary", { date: dateToUse, count: closedAssignmentsForDate.length })}
            </p>

            <div className="space-y-3">
              {closedAssignmentsForDate.length === 0 && (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 font-bold">
                  {t("personnelOccupancy.labels.noClosedRegistrationsForDate")}
                </div>
              )}

              {closedAssignmentsForDate.map((entry) => (
                <div key={entry.id} className="p-3 rounded-2xl border border-slate-200 bg-slate-50/40">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_130px] gap-3 items-end">
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        {entry.operatorName || entry.operatorNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold mt-1">
                        {entry.machineId || t("personnelOccupancy.labels.unknownStation")} - {entry.shift || t("personnelOccupancy.labels.unknownShift")}
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t("personnelOccupancy.labels.workedHours")}</label>
                      <input
                        type="number"
                        step="0.25"
                        className="w-full p-2.5 bg-white border-2 border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
                        value={closedHoursDraft[entry.id!] ?? entry.hoursWorked ?? 0}
                        onChange={(e) => {
                          setClosedHoursDraft((prev) => ({
                            ...prev,
                            [entry.id!]: e.target.value,
                          }));
                        }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          const manualHours = parseFloat(String(closedHoursDraft[entry.id!]));
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
                          await logActivity(
                            auth.currentUser?.uid || "system",
                            "OCCUPANCY_UPDATE_HOURS_MANUAL",
                            `Achteraf uren aangepast: ${entry.operatorName || entry.operatorNumber} op ${entry.machineId} -> ${manualHours}`
                          );
                        } catch (err) {
                          console.error("Achteraf uren opslaan mislukt", err);
                          notify(t("personnelOccupancy.notifications.couldNotSaveHours"));
                        }
                      }}
                      className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={14} /> {t("common.save")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelOccupancyView;
