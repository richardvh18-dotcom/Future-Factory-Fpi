import React, { useState, useEffect, useMemo } from "react";
import { 
  Loader2, Cpu, Users, Layers, Info, Clock, MinusCircle, 
  ChevronUp, ShieldCheck, X, ChevronDown, Activity, Calculator, TrendingUp, RotateCw,
  UserCheck, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight, PlusCircle, Copy, Trash2,
  LayoutList, Grid, Save
} from "lucide-react";
import { format, getWeek, getISOWeek, parse, addDays } from "date-fns";
import { db } from "../../config/firebase";
import { 
  collection, onSnapshot, doc, setDoc, 
  deleteDoc, query, orderBy, serverTimestamp, updateDoc 
} from "firebase/firestore";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { PATHS } from "../../config/dbPaths";
import LoanPersonnelModal from "../digitalplanning/modals/LoanPersonnelModal";

/**
 * Add/Edit Modal Component (Intern)
 */
const AddEditPersonModal = ({ isOpen, onClose, onSave, initialData, departments, users = [] }) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [formData, setFormData] = useState({
    name: "",
    employeeNumber: "",
    departmentId: "",
    linkedUserId: "",
    shiftId: "DAGDIENST",
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
  const availableShifts = currentDept?.shifts || [{ id: "DAGDIENST", label: "Dagdienst" }];

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleAutoReturnToggle = (checked) => {
    const newLoan = { ...formData.loan, autoReturn: checked };
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
            {initialData ? "Medewerker Bewerken" : "Nieuwe Medewerker"}
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
            Profiel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("loan")}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === "loan" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
          >
            Uitlenen
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "profile" && (
            <>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Naam</label>
                <input 
                  type="text" 
                  required
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Personeelsnummer</label>
                <input 
                  type="text" 
                  required
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.employeeNumber}
                  onChange={e => setFormData({...formData, employeeNumber: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Koppel User Account</label>
                <select 
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.linkedUserId || ""}
                  onChange={e => setFormData({...formData, linkedUserId: e.target.value})}
                >
                  <option value="">Geen koppeling...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Afdeling</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500"
                    value={formData.departmentId}
                    onChange={e => setFormData({...formData, departmentId: e.target.value})}
                  >
                    <option value="">Selecteer...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Ploeg</label>
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
            </>
          )}

          {activeTab === "loan" && (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <span className="text-xs font-black text-indigo-800 uppercase">Actief Uitlenen</span>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                  checked={formData.loan?.active || false}
                  onChange={e => setFormData({...formData, loan: { ...formData.loan, active: e.target.checked }})}
                />
              </div>

              {formData.loan?.active && (
                <>
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Doel Afdeling</label>
                    <select 
                      className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500"
                      value={formData.loan.departmentId}
                      onChange={e => setFormData({...formData, loan: { ...formData.loan, departmentId: e.target.value }})}
                    >
                      <option value="">Kies afdeling...</option>
                      {departments.filter(d => d.id !== formData.departmentId).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Doel Ploeg</label>
                    <select 
                      className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-500"
                      value={formData.loan.shiftId}
                      onChange={e => setFormData({...formData, loan: { ...formData.loan, shiftId: e.target.value }})}
                    >
                      <option value="">Kies ploeg...</option>
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
                        onChange={e => setFormData({...formData, loan: { ...formData.loan, followRotation: e.target.checked }})}
                      />
                      <span className="text-xs font-bold text-slate-700">Volg ploegenrooster doelafdeling</span>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-indigo-600"
                        checked={formData.loan.autoReturn}
                        onChange={e => handleAutoReturnToggle(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-slate-700">Automatisch terug na 5 dagen</span>
                    </label>
                    
                    {formData.loan.autoReturn && formData.loan.returnDate && (
                      <div className="text-[10px] font-bold text-indigo-600 px-2">
                        Retour datum: {formData.loan.returnDate}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4">
            <Save size={18} /> Opslaan
          </button>
        </form>
      </div>
    </div>
  );
};

/**
 * PersonnelOccupancyView - V40 (Uitleensysteem + Lijstbeheer)
 */
const PersonnelOccupancyView = ({ 
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
  const { user } = useAdminAuth();
  const [localPersonnel, setLocalPersonnel] = useState([]);
  const [localOccupancy, setLocalOccupancy] = useState([]);
  const [localStructure, setLocalStructure] = useState({ departments: [] });
  const [loading, setLoading] = useState(true);
  
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

  // Use props if available, otherwise local state (fallback)
  const structure = propStructure || localStructure;
  const occupancy = propOccupancy || localOccupancy;
  const personnel = propPersonnel || localPersonnel;
  const dateToUse = selectedDateStr || format(new Date(), "yyyy-MM-dd");

  const currentWeek = getISOWeek(new Date());

  // 1. DATA SYNC
  useEffect(() => {
    // Only sync if props are not provided
    if (propStructure && propOccupancy && propPersonnel) {
        setLoading(false);
        return;
    }

    const unsubPersonnel = onSnapshot(
      query(collection(db, ...PATHS.PERSONNEL), orderBy("name")),
      (snap) => {
        setLocalPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => console.error("Personnel sync error:", error)
    );
    
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => {
        setLocalOccupancy(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => console.error("Occupancy sync error:", error)
    );
    
    const unsubStructure = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
            setLocalStructure(docSnap.data());
            const initialExpanded = {};
            (docSnap.data().departments || []).forEach(d => { initialExpanded[d.id] = true; });
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

  // 2. HELPERS
  const getShiftDetails = (person, deptId) => {
    const dept = (structure.departments || []).find(d => d.id === deptId);
    const fallbackShift = { label: "DAGDIENST", start: "07:30", end: "16:15" };
    let activeShift = null;
    let isPloeg = false;

    if (!dept || !dept.shifts || dept.shifts.length === 0) {
        activeShift = fallbackShift;
    } else if (person.rotationSchedule?.enabled && person.rotationSchedule.shifts?.length > 0) {
        isPloeg = true;
        const startWeekNum = person.rotationSchedule.startWeek || 1;
        const rotationShifts = person.rotationSchedule.shifts;
        const weeksSinceStart = currentWeek - startWeekNum;
        const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
        const currentShiftId = rotationShifts[shiftIndex];
        activeShift = dept.shifts.find(s => s.id === currentShiftId) || dept.shifts[0];
    } else {
        activeShift = dept.shifts.find(s => s.id === person.shiftId) || fallbackShift;
        if (person.shiftId !== "DAGDIENST" && person.shiftId) isPloeg = true;
    }

    try {
        const start = parse(activeShift.start, 'HH:mm', new Date());
        const end = parse(activeShift.end, 'HH:mm', new Date());
        let diff = (end - start) / (1000 * 60 * 60);
        if (diff < 0) diff += 24; 
        const deduction = isPloeg ? 0 : 0.75;
        return { ...activeShift, hours: Math.max(0, diff - deduction), isPloeg };
    } catch (e) {
        return { ...fallbackShift, hours: 8.0, isPloeg: false };
    }
  };

  // 5. DISPLAY SECTIONS
  const displaySections = useMemo(() => {
    const allDepts = structure.departments || [];
    
    let filtered = allDepts;
    if (scope && typeof scope === 'string' && scope !== 'all') {
        const cleanScope = scope.toLowerCase();
        filtered = allDepts.filter(d => d.id.toLowerCase() === cleanScope || d.slug === cleanScope || d.name.toLowerCase().includes(cleanScope));
    }

    return filtered.map(d => ({
        ...d,
        stations: [...(d.stations || [])].sort((a,b) => a.name.toLowerCase().includes("teamleader") ? -1 : 1)
    }));
  }, [structure.departments, scope]);

  // 6. CRUD HANDLERS
  const handleSavePerson = async (data) => {
    try {
      if (editingPerson) {
        await updateDoc(doc(db, ...PATHS.PERSONNEL, editingPerson.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, ...PATHS.PERSONNEL), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setAddEditModalOpen(false);
      setEditingPerson(null);
    } catch (err) {
      console.error("Fout bij opslaan medewerker:", err);
      alert("Er ging iets mis bij het opslaan.");
    }
  };

  const handleDeletePerson = async (id) => {
    if (window.confirm("Weet je zeker dat je deze medewerker wilt verwijderen?")) {
      try {
        await deleteDoc(doc(db, ...PATHS.PERSONNEL, id));
      } catch (err) {
        console.error("Fout bij verwijderen:", err);
      }
    }
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={48} /></div>;
  
  const getShiftColor = (shiftLabel) => {
    const label = (shiftLabel || "").toUpperCase();
    if (label.includes("OCHTEND") || label.includes("MORNING")) return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", ring: "ring-amber-100" };
    if (label.includes("AVOND") || label.includes("EVENING")) return { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-100" };
    if (label.includes("NACHT") || label.includes("NIGHT")) return { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-100" };
    if (label.includes("DAG") || label === "DAGDIENST") return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-100" };
    return { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-100 text-slate-700", ring: "ring-slate-100" };
  };

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-500 w-full pb-4 px-1 h-full overflow-y-auto custom-scrollbar">
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
                        title="Kopieer bezetting van gisteren voor deze afdeling"
                      >
                        {isCopying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                        <span className="hidden sm:inline">Kopieer Gisteren</span>
                      </button>
                    )}

                    {editable && onClearToday && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onClearToday(dept.id); }}
                        disabled={isClearing}
                        className="mr-2 p-2 bg-white border border-rose-200 text-rose-500 hover:text-rose-700 hover:border-rose-300 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm"
                        title="Wis bezetting van vandaag voor deze afdeling"
                      >
                        {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span className="hidden sm:inline">Reset</span>
                      </button>
                    )}

                    <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="p-2">
                      <ChevronUp className={`transition-transform duration-300 ${expandedSections[dept.id] !== false ? '' : 'rotate-180'}`} size={20} />
                    </button>
                </div>

                {expandedSections[dept.id] !== false && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 animate-in zoom-in-95 duration-200 text-left">
                        {dept.stations.map(station => {
                            const mId = station.name;
                            const isTL = mId.toLowerCase().includes("teamleader");
                            const stationOccupancy = occupancy.filter(b => normalizeMachine(b.machineId) === normalizeMachine(mId) && b.date === dateToUse && b.departmentId === dept.id);
                            const isBusy = stationOccupancy.length > 0;
                            const byShift = {};
                            stationOccupancy.forEach(occ => {
                              const shiftKey = occ.shift || "DAGDIENST";
                              if (!byShift[shiftKey]) byShift[shiftKey] = [];
                              byShift[shiftKey].push(occ);
                            });
                            
                            return (
                                <div
                                  key={station.id}
                                  className={`p-2 rounded-xl border-2 transition-all duration-500 relative flex flex-col shadow-sm h-80 ${isTL ? (isBusy ? 'bg-slate-900 border-amber-400 ring-4 ring-amber-400/10 shadow-xl' : 'bg-slate-900 border-slate-800 opacity-80 shadow-inner') : (isBusy ? 'bg-white border-blue-500 ring-4 ring-blue-50/50' : 'bg-white border-slate-100 hover:border-blue-200')}`}
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
                                    <div className="flex justify-between items-start mb-2 text-left shrink-0">
                                        <div className="text-left"><span className={`text-[8px] font-black uppercase tracking-widest block mb-0.5 ${isTL ? 'text-amber-500 italic' : 'text-slate-400 opacity-60'}`}>{isTL ? 'Regie' : 'Station ID'}</span><h4 className={`text-sm font-black tracking-tighter italic uppercase truncate leading-none ${isTL ? 'text-white' : 'text-slate-900'}`}>{mId}</h4></div>
                                        {isTL ? <ShieldCheck size={16} className={isBusy ? 'text-amber-400' : 'text-slate-600'} /> : <Cpu size={16} className={isBusy ? 'text-blue-600' : 'text-slate-200'} />}
                                    </div>
                                    <div className="space-y-1 mb-2 flex-1 text-left text-left overflow-y-auto pr-1 custom-scrollbar">
                                        {Object.entries(byShift).map(([shiftKey, operators]) => {
                                          const shiftColors = getShiftColor(shiftKey);
                                          return (
                                            <div key={shiftKey} className="space-y-1">
                                              <div className="flex items-center gap-2 mb-1">
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
                                                  className={`p-1.5 rounded-lg border flex flex-col gap-0.5 animate-in slide-in-from-right-1 cursor-pointer hover:scale-[1.02] transition-all ${isTL ? 'bg-white/5 border-white/10 text-white' : `${shiftColors.bg} ${shiftColors.border}`} ${occ.isLoan ? 'ring-2 ring-green-400' : `ring-1 ${shiftColors.ring}`}`}>
                                                    <div className="flex items-center justify-between text-left">
                                                        <div className="text-left overflow-hidden text-left flex-1">
                                                            <h5 className={`text-[10px] font-black uppercase italic truncate mb-0.5 text-left ${isTL ? 'text-amber-400' : shiftColors.text}`}>{occ.operatorName || "Naamloos"}</h5>
                                                            <div className="flex items-center gap-1 opacity-70 text-left flex-wrap">
                                                                <span className={`text-[6px] font-black px-1 py-0 rounded ${occ.isPloeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{occ.shift || (occ.isPloeg ? 'PLOEG' : 'DAG')}</span>
                                                                <span className={`text-[6px] font-bold uppercase ${isTL ? 'text-slate-400' : 'text-slate-600'}`}>#{occ.operatorNumber || "?"}</span>
                                                                {occ.isLoan && <span className="text-[6px] font-black px-1 py-0 rounded bg-green-100 text-green-700">UITGELEEND</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                          {editable && !occ.isLoan && (
                                                            <button onClick={(e) => { e.stopPropagation(); setSelectedPersonForLoan(occ); setSelectedDepartmentForLoan(dept); setLoanModalOpen(true); }} className="p-0.5 text-blue-400 hover:text-blue-600 transition-colors" title="Uitlenen aan andere afdeling"><ArrowRight size={10} /></button>
                                                          )}
                                                          <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, ...PATHS.OCCUPANCY, occ.id)); }} className="p-0.5 text-slate-400 hover:text-rose-500 transition-colors"><X size={10} /></button>
                                                        </div>
                                                    </div>
                                                    <div className={`pt-1 border-t flex items-center justify-between ${isTL ? 'border-white/5' : 'border-slate-300/60'}`}>
                                                      <div className="flex items-center gap-1"><Clock size={8} className={shiftColors.text} /><span className={`text-[6px] font-black uppercase tracking-tighter ${isTL ? 'text-slate-500' : 'text-slate-500'}`}>Inzet:</span></div>
                                                      <span className={`text-[8px] font-black ${isTL ? 'text-white' : shiftColors.text}`}>{occ.hoursWorked?.toFixed(1) || 0}u</span>
                                                    </div>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        })}
                                        {!isBusy && <div className={`py-4 border border-dashed rounded-2xl flex flex-col items-center justify-center opacity-40 ${isTL ? 'border-white/10' : 'border-slate-200'}`}><span className={`text-[7px] font-black uppercase tracking-widest text-center ${isTL ? 'text-slate-600' : 'text-slate-400'}`}>Vrij</span></div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
          ))}

      {/* MODALS */}
      <LoanPersonnelModal
        isOpen={loanModalOpen}
        onClose={() => { setLoanModalOpen(false); setSelectedPersonForLoan(null); setSelectedDepartmentForLoan(null); }}
        person={selectedPersonForLoan}
        currentDepartment={selectedDepartmentForLoan}
      />

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
              <h3 className="text-xl font-black text-slate-900 uppercase italic">Personeel toevoegen</h3>
              <button onClick={() => setAssignModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Station</label>
                <select value={selectedStation?.id || ""} onChange={(e) => setSelectedStation(selectedDept.stations?.find(s => s.id === e.target.value) || null)} className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600" disabled>
                  <option value="">Selecteer een station...</option>
                  {(selectedDept.stations || []).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Filter op ploeg</label>
                <select 
                  value={assignShift} 
                  onChange={(e) => { setAssignShift(e.target.value); setSelectedPersonId(""); }} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="">Alle ploegen...</option>
                  {(selectedDept.shifts || []).map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Personeelslid</label>
                <select 
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)} 
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  disabled={!assignShift && personnel.length > 100} // Optional optimization
                >
                  <option value="">Selecteer personeelslid...</option>
                  {personnel
                    .filter(p => {
                      if (!assignShift) return true;
                      
                      let pShiftId = p.shiftId;
                      
                      // Check rotatie voor de geselecteerde datum
                      if (p.rotationSchedule?.enabled && p.rotationSchedule.shifts?.length > 0) {
                         const targetDate = parse(dateToUse, "yyyy-MM-dd", new Date());
                         const targetWeek = getISOWeek(targetDate);
                         
                         const startWeekNum = p.rotationSchedule.startWeek || 1;
                         const rotationShifts = p.rotationSchedule.shifts;
                         const weeksSinceStart = targetWeek - startWeekNum;
                         const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
                         pShiftId = rotationShifts[shiftIndex];
                      }
                      
                      return pShiftId === assignShift;
                    })
                    .sort((a,b) => a.name.localeCompare(b.name))
                    .map(p => {
                        let displayLabel = p.shiftId;
                        // Als we filteren op een shift, toon dan die shift naam, anders de default
                        if (assignShift) {
                            const shiftObj = (selectedDept.shifts || []).find(s => s.id === assignShift);
                            if (shiftObj) displayLabel = shiftObj.label;
                        }
                        return (<option key={p.id} value={p.id}>{p.name} ({displayLabel || "?"})</option>);
                    })}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Inzetduur</label>
                <input
                  type="number"
                  step="0.5"
                  value={assignHours}
                  onChange={(e) => setAssignHours(e.target.value)}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  placeholder="bv. 8.0"
                />
              </div>
              <div className="pt-4 border-t border-slate-200 flex gap-3">
                <button onClick={() => setAssignModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-all">Klaar</button>
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
                        const confirmMsg = `${person.name} is al ingepland op: ${stations}.\n\nWil je deze persoon ook op ${selectedStation.name || selectedStation.id} inplannen voor ${assignHours} uur?`;
                        if (!window.confirm(confirmMsg)) return;
                      }

                      // Probeer shift te bepalen op basis van persoon
                      let shiftIdToUse = assignShift;

                      // Als er geen handmatige shift is gekozen, bepaal automatisch
                      if (!shiftIdToUse) {
                        if (person.rotationSchedule?.enabled && person.rotationSchedule.shifts?.length > 0) {
                           // Rotatie logica: bereken shift voor de GESELECTEERDE datum
                           const targetDate = parse(dateToUse, "yyyy-MM-dd", new Date());
                           const targetWeek = getISOWeek(targetDate);
                           
                           const startWeekNum = person.rotationSchedule.startWeek || 1;
                           const rotationShifts = person.rotationSchedule.shifts;
                           const weeksSinceStart = targetWeek - startWeekNum;
                           const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
                           shiftIdToUse = rotationShifts[shiftIndex];
                        } else {
                           // Vaste shift
                           shiftIdToUse = person.shiftId;
                        }
                      }

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
                        await setDoc(doc(db, ...PATHS.OCCUPANCY, occId), {
                        departmentId: selectedDept.id,
                        machineId: selectedStation.name || selectedStation.id,
                        operatorNumber: person.employeeNumber || person.id,
                        operatorName: person.name,
                        date: dateToUse,
                        hoursWorked: parseFloat(assignHours) || 0,
                        isPloeg: isPloeg,
                        shift: shift ? shift.label : "DAGDIENST",
                        isLoan: false,
                      }, { merge: true });
                        
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
                  Toevoegen
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
              <h3 className="text-lg font-black text-slate-900 uppercase italic">Uren Aanpassen</h3>
              <button onClick={() => setEditAssignmentModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Operator</p>
              <p className="font-bold text-slate-800 text-sm">{selectedAssignment.operatorName}</p>
              <p className="text-[10px] text-slate-500 mt-1">#{selectedAssignment.operatorNumber}</p>
            </div>

            <div className="mb-8">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Gewerkte Uren</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-500 transition-all text-slate-900"
                  value={selectedAssignment.hoursWorked}
                  onChange={(e) => setSelectedAssignment({...selectedAssignment, hoursWorked: e.target.value})}
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">uur</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {!selectedAssignment.isLoan && (
                <button 
                  onClick={() => {
                    const person = personnel.find(p => p.employeeNumber === selectedAssignment.operatorNumber || p.id === selectedAssignment.operatorNumber);
                    const dept = structure.departments.find(d => d.id === selectedAssignment.departmentId);
                    
                    if (person) {
                      setSelectedPersonForLoan(person);
                      setSelectedDepartmentForLoan(dept);
                      setLoanModalOpen(true);
                      setEditAssignmentModalOpen(false);
                    } else {
                      alert("Persoonsgegevens niet gevonden.");
                    }
                  }}
                  className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-100 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={18} /> Uitlenen
                </button>
              )}

              <button 
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, ...PATHS.OCCUPANCY, selectedAssignment.id), {
                      hoursWorked: parseFloat(selectedAssignment.hoursWorked) || 0
                    });
                    setEditAssignmentModalOpen(false);
                  } catch (err) {
                    console.error("Update failed", err);
                    alert("Kon uren niet opslaan");
                  }
                }} 
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} /> Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelOccupancyView;
