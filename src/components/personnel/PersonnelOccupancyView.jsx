import React, { useState, useEffect, useMemo } from "react";
import { 
  Loader2, Cpu, Users, Layers, Info, Clock, MinusCircle, 
  ChevronUp, ShieldCheck, X, ChevronDown, Activity, Calculator, TrendingUp, RotateCw,
  UserCheck, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight, PlusCircle,
  LayoutList, Grid, Save
} from "lucide-react";
import { format, getWeek, parse, addDays } from "date-fns";
import { db } from "../../config/firebase";
import { 
  collection, onSnapshot, doc, setDoc, 
  deleteDoc, query, orderBy, serverTimestamp, updateDoc 
} from "firebase/firestore";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { PATHS } from "../../config/dbPaths";
import LoanPersonnelModal from "../digitalplanning/modals/LoanPersonnelModal";
import PersonnelListView from "./PersonnelListView";

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
                    <option value="DAGDIENST">Dagdienst</option>
                    <option value="OCHTEND">Ochtend</option>
                    <option value="AVOND">Avond</option>
                    <option value="NACHT">Nacht</option>
                    <option value="5-PLOEG-A">5-Ploeg A</option>
                    <option value="5-PLOEG-B">5-Ploeg B</option>
                    <option value="5-PLOEG-C">5-Ploeg C</option>
                    <option value="5-PLOEG-D">5-Ploeg D</option>
                    <option value="5-PLOEG-E">5-Ploeg E</option>
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
const PersonnelOccupancyView = ({ scope, machines = [], editable = true, users = [] }) => {
  const { user } = useAdminAuth();
  const [personnel, setPersonnel] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [structure, setStructure] = useState({ departments: [] });
  const [loading, setLoading] = useState(true);
  
  // View State
  const [viewMode, setViewMode] = useState("occupancy"); // "occupancy" | "list"
  const [expandedSections, setExpandedSections] = useState({});

  // Modals
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [selectedPersonForLoan, setSelectedPersonForLoan] = useState(null);
  const [selectedDepartmentForLoan, setSelectedDepartmentForLoan] = useState(null);
  
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);

  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const currentWeek = getWeek(new Date(), { weekStartsOn: 0 });

  // 1. DATA SYNC
  useEffect(() => {
    const unsubPersonnel = onSnapshot(
      query(collection(db, ...PATHS.PERSONNEL), orderBy("name")),
      (snap) => {
        setPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => console.error("Personnel sync error:", error)
    );
    
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => {
        setOccupancy(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => console.error("Occupancy sync error:", error)
    );
    
    const unsubStructure = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
            setStructure(docSnap.data());
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
  }, []);

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

  // 3. AUTO-CLEANUP
  useEffect(() => {
    if (personnel.length === 0 || occupancy.length === 0) return;
    const checkAndCleanup = async () => {
      const toDelete = [];
      occupancy.forEach(occ => {
        const person = personnel.find(p => p.employeeNumber === occ.operatorNumber);
        if (!person) return;
        const shiftInfo = getShiftDetails(person, occ.departmentId);
        const storedShift = occ.shift || '';
        const currentShift = shiftInfo.label || '';
        if (occ.date === todayStr && storedShift !== currentShift) {
          toDelete.push(occ.id);
        }
      });
      if (toDelete.length > 0) {
        for (const id of toDelete) {
          try { await deleteDoc(doc(db, ...PATHS.OCCUPANCY, id)); } catch (err) {}
        }
      }
    };
    const timer = setTimeout(checkAndCleanup, 2000);
    return () => clearTimeout(timer);
  }, [personnel, occupancy, todayStr]);

  // 4. KPI CALCULATIONS
  const capacityMetrics = useMemo(() => {
    let totalNetHours = 0;
    let productionHours = 0;
    const activeToday = occupancy.filter(occ => occ.date === todayStr && occ.operatorNumber);
    const countedOperators = new Set();
    const productionOperators = new Set();
    
    activeToday.forEach(occ => {
        const hours = parseFloat(occ.hoursWorked || 0);
        totalNetHours += hours;
        countedOperators.add(occ.operatorNumber);
        
        const machineId = (occ.machineId || "").toUpperCase();
        if (machineId.startsWith("BH") || machineId.startsWith("BA")) {
          productionHours += hours;
          productionOperators.add(occ.operatorNumber);
        }
    });
    
    return { 
      daily: totalNetHours, 
      activeCount: countedOperators.size,
      productionHours,
      productionCount: productionOperators.size,
      supportHours: totalNetHours - productionHours
    };
  }, [occupancy, todayStr]);

  // 5. DISPLAY SECTIONS
  const displaySections = useMemo(() => {
    const allDepts = structure.departments || [];
    const cleanScope = (scope || "").toLowerCase();
    let filtered = (scope === 'all') ? allDepts : allDepts.filter(d => d.id.toLowerCase() === cleanScope || d.slug === cleanScope || d.name.toLowerCase().includes(cleanScope));
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
    if (label.includes("DAG") || label === "DAGDIENST") return { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", badge: "bg-blue-100 text-blue-700", ring: "ring-blue-100" };
    return { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-100 text-slate-700", ring: "ring-slate-100" };
  };

  return (


    <div className="space-y-4 text-left animate-in fade-in duration-500 w-full pb-4 px-1">

      {viewMode !== "database" ? (
        <>
          {/* OCCUPANCY GRID */}
          {displaySections.map(dept => (
            <section key={dept.id} className="space-y-4 text-left">
                <div className="w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 ml-2 p-2 rounded-xl">
                    <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all">
                        <div className="p-2 bg-slate-800 text-white rounded-xl shadow-md"><Layers size={16} /></div>
                        <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">{dept.name}</h3>
                    </button>
                    <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="p-2">
                      <ChevronUp className={`transition-transform duration-300 ${expandedSections[dept.id] !== false ? '' : 'rotate-180'}`} size={20} />
                    </button>
                </div>

                {expandedSections[dept.id] !== false && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in zoom-in-95 duration-200 text-left">
                        {dept.stations.map(station => {
                            const mId = station.name;
                            const isTL = mId.toLowerCase().includes("teamleader");
                            const stationOccupancy = occupancy.filter(b => normalizeMachine(b.machineId) === normalizeMachine(mId) && b.date === todayStr && b.departmentId === dept.id);
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
                                  className={`p-5 rounded-[35px] border-2 transition-all duration-500 relative flex flex-col shadow-sm ${isTL ? (isBusy ? 'bg-slate-900 border-amber-400 ring-4 ring-amber-400/10 shadow-xl' : 'bg-slate-900 border-slate-800 opacity-80 shadow-inner') : (isBusy ? 'bg-white border-blue-500 ring-4 ring-blue-50/50' : 'bg-white border-slate-100 hover:border-blue-200')}`}
                                  style={{ cursor: editable ? 'pointer' : 'default' }}
                                  onClick={() => {
                                    if (editable) {
                                      setSelectedDept(dept);
                                      setSelectedStation(station);
                                      setAssignModalOpen(true);
                                    }
                                  }}
                                >
                                    <div className="flex justify-between items-start mb-4 text-left">
                                        <div className="text-left"><span className={`text-[8px] font-black uppercase tracking-widest block mb-0.5 ${isTL ? 'text-amber-500 italic' : 'text-slate-400 opacity-60'}`}>{isTL ? 'Regie' : 'Station ID'}</span><h4 className={`text-lg font-black tracking-tighter italic uppercase truncate leading-none ${isTL ? 'text-white' : 'text-slate-900'}`}>{mId}</h4></div>
                                        {isTL ? <ShieldCheck size={20} className={isBusy ? 'text-amber-400' : 'text-slate-600'} /> : <Cpu size={20} className={isBusy ? 'text-blue-600' : 'text-slate-200'} />}
                                    </div>
                                    <div className="space-y-2 mb-4 flex-1 text-left text-left">
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
                                                    const person = personnel.find(p => p.employeeNumber === occ.operatorNumber);
                                                    if (person) {
                                                      setEditingPerson(person);
                                                      setAddEditModalOpen(true);
                                                    }
                                                  }}
                                                  className={`p-3 rounded-2xl border-2 flex flex-col gap-2 animate-in slide-in-from-right-1 cursor-pointer hover:scale-[1.02] transition-all ${isTL ? 'bg-white/5 border-white/10 text-white' : `${shiftColors.bg} ${shiftColors.border}`} ${occ.isLoan ? 'ring-2 ring-green-400' : `ring-1 ${shiftColors.ring}`}`}>
                                                    <div className="flex items-center justify-between text-left">
                                                        <div className="text-left overflow-hidden text-left flex-1">
                                                            <h5 className={`text-sm font-black uppercase italic truncate mb-0.5 text-left ${isTL ? 'text-amber-400' : shiftColors.text}`}>{occ.operatorName}</h5>
                                                            <div className="flex items-center gap-1.5 opacity-70 text-left flex-wrap">
                                                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded ${occ.isPloeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{occ.isPloeg ? 'PLOEG' : 'DAG'}</span>
                                                                <span className={`text-[7px] font-bold uppercase ${isTL ? 'text-slate-400' : 'text-slate-600'}`}>#{occ.operatorNumber}</span>
                                                                {occ.isLoan && <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-green-100 text-green-700">UITGELEEND</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                          {editable && !occ.isLoan && (
                                                            <button onClick={(e) => { e.stopPropagation(); setSelectedPersonForLoan(occ); setSelectedDepartmentForLoan(dept); setLoanModalOpen(true); }} className="p-1 text-blue-400 hover:text-blue-600 transition-colors" title="Uitlenen aan andere afdeling"><ArrowRight size={14} /></button>
                                                          )}
                                                          <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, ...PATHS.OCCUPANCY, occ.id)); }} className="p-1 text-slate-400 hover:text-rose-500 transition-colors"><X size={14} /></button>
                                                        </div>
                                                    </div>
                                                    <div className={`pt-2 border-t flex items-center justify-between ${isTL ? 'border-white/5' : 'border-slate-300/60'}`}>
                                                      <div className="flex items-center gap-1.5"><Clock size={10} className={shiftColors.text} /><span className={`text-[8px] font-black uppercase tracking-tighter ${isTL ? 'text-slate-500' : 'text-slate-500'}`}>Inzet:</span></div>
                                                      <span className={`text-[10px] font-black ${isTL ? 'text-white' : shiftColors.text}`}>{occ.hoursWorked?.toFixed(1) || 0}u</span>
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
        </>
      ) : (
        /* LIST VIEW */
        <PersonnelListView 
          personnel={personnel} 
          onEdit={(p) => { setEditingPerson(p); setAddEditModalOpen(true); }}
          onDelete={handleDeletePerson}
          onAdd={() => { setEditingPerson(null); setAddEditModalOpen(true); }}
        />
      )}

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
                <select value={selectedStation?.id || ""} onChange={(e) => setSelectedStation(selectedDept.stations?.find(s => s.id === e.target.value) || null)} className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600">
                  <option value="">Selecteer een station...</option>
                  {(selectedDept.stations || []).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Ploeg</label>
                <select value={selectedDept.selectedShiftId || ""} onChange={e => { selectedDept.selectedShiftId = e.target.value; setSelectedDept({ ...selectedDept }); }} className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600">
                  <option value="">Selecteer ploeg...</option>
                  {(selectedDept.shifts || []).map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Personeelslid</label>
                <select onChange={(e) => {
                    const person = personnel.find(p => p.id === e.target.value);
                    if (person && selectedStation && selectedDept.selectedShiftId) {
                      const shift = (selectedDept.shifts || []).find(s => s.id === selectedDept.selectedShiftId);
                      const shiftInfo = shift || { label: "DAGDIENST", hours: 8, isPloeg: false };
                      const timestamp = Date.now();
                      const occId = `${selectedDept.id}-${selectedStation.id}-${person.id}-${timestamp}`;
                      setDoc(doc(db, ...PATHS.OCCUPANCY, occId), {
                        departmentId: selectedDept.id,
                        machineId: selectedStation.id,
                        operatorNumber: person.id,
                        operatorName: person.name,
                        date: todayStr,
                        hoursWorked: shiftInfo.hours || 0,
                        isPloeg: shiftInfo.isPloeg,
                        shift: shiftInfo.label || "DAGDIENST",
                        isLoan: false,
                      }, { merge: true });
                      setAssignModalOpen(false);
                    }
                  }} className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600">
                  <option value="">Selecteer personeelslid...</option>
                  {personnel.filter(p => {
                      if (!selectedDept.selectedShiftId) return false;
                      if (p.rotationSchedule?.enabled && Array.isArray(p.rotationSchedule.shifts)) return p.rotationSchedule.shifts.includes(selectedDept.selectedShiftId);
                      if (p.shiftId) return p.shiftId === selectedDept.selectedShiftId;
                      return false;
                    }).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="pt-4 border-t border-slate-200">
                <button onClick={() => setAssignModalOpen(false)} className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-all">Annuleren</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelOccupancyView;
