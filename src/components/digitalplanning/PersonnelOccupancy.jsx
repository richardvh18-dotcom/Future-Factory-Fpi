import React, { useState, useEffect, useMemo } from "react";
import { 
  Loader2, Cpu, Users, Layers, Info, Clock, MinusCircle, 
  ChevronUp, ShieldCheck, X, ChevronDown, Activity, Calculator, TrendingUp, RotateCw,
  UserCheck, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight, PlusCircle
} from "lucide-react";
import { format, getWeek, parse } from "date-fns";
import { db } from "../../config/firebase";
import { 
  collection, onSnapshot, doc, setDoc, 
  deleteDoc, query, orderBy, serverTimestamp 
} from "firebase/firestore";
import { normalizeMachine } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { PATHS } from "../../config/dbPaths";
import LoanPersonnelModal from "./modals/LoanPersonnelModal";

/**
 * PersonnelOccupancy - V40 (Uitleensysteem)
 * NIEUW:
 * - Mogelijkheid om personeel uit te lenen aan andere afdelingen
 * - Visuele indicatie van uitgeleend personeel
 * OPGELOST: 
 * - Leest nu personeel van /future-factory/Users/Personnel (niet artifacts)
 * - Leest bezetting van /future-factory/production/machine_occupancy
 * - Leest factory config van /future-factory/settings/factory_configs/main
 */
const PersonnelOccupancy = ({ scope, machines = [], editable = true }) => {
  const { user } = useAdminAuth();
  const [personnel, setPersonnel] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [structure, setStructure] = useState({ departments: [] });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [selectedPersonForLoan, setSelectedPersonForLoan] = useState(null);
  const [selectedDepartmentForLoan, setSelectedDepartmentForLoan] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const currentWeek = getWeek(new Date(), { weekStartsOn: 0 }); // Zondag start

  // 1. DATA SYNC - Uit /future-factory root
  useEffect(() => {
    console.log("[PersonnelOccupancy] Starting data sync...");
    console.log("[PersonnelOccupancy] PATHS.PERSONNEL:", PATHS.PERSONNEL);
    console.log("[PersonnelOccupancy] PATHS.OCCUPANCY:", PATHS.OCCUPANCY);
    console.log("[PersonnelOccupancy] PATHS.FACTORY_CONFIG:", PATHS.FACTORY_CONFIG);
    
    const unsubPersonnel = onSnapshot(
      query(collection(db, ...PATHS.PERSONNEL), orderBy("name")),
      (snap) => {
        console.log("[PersonnelOccupancy] Personnel loaded:", snap.docs.length);
        setPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.error("[PersonnelOccupancy] Personnel listener error:", error);
        setPersonnel([]);
      }
    );
    
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snap) => {
        console.log("[PersonnelOccupancy] Occupancy loaded:", snap.docs.length);
        setOccupancy(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.error("[PersonnelOccupancy] Occupancy listener error:", error);
        setOccupancy([]);
      }
    );
    
    const unsubStructure = onSnapshot(
      doc(db, ...PATHS.FACTORY_CONFIG),
      (docSnap) => {
        if (docSnap.exists()) {
            console.log("[PersonnelOccupancy] Factory config loaded");
            setStructure(docSnap.data());
            const initialExpanded = {};
            (docSnap.data().departments || []).forEach(d => { initialExpanded[d.id] = true; });
            setExpandedSections(initialExpanded);
        } else {
            console.warn("[PersonnelOccupancy] Factory config document does not exist");
            setStructure({ departments: [] });
        }
        setLoading(false);
      },
      (error) => {
        console.error("[PersonnelOccupancy] Factory config listener error:", error);
        setStructure({ departments: [] });
        setLoading(false);
      }
    );
    
    return () => { 
      console.log("[PersonnelOccupancy] Cleanup: closing listeners");
      unsubPersonnel(); 
      unsubOccupancy(); 
      unsubStructure(); 
    };
  }, []);

  // 2. HELPERS - Gebruik dezelfde logica als PersonnelManager
  const getShiftDetails = (person, deptId) => {
    const dept = (structure.departments || []).find(d => d.id === deptId);
    const fallbackShift = { label: "DAGDIENST", start: "07:30", end: "16:15" };
    let activeShift = null;
    let isPloeg = false;

    if (!dept || !dept.shifts || dept.shifts.length === 0) {
        activeShift = fallbackShift;
    } else if (person.rotationSchedule?.enabled && person.rotationSchedule.shifts?.length > 0) {
        // NIEUWE METHODE: rotationSchedule met cyclische rotatie
        isPloeg = true;
        const startWeekNum = person.rotationSchedule.startWeek || 1;
        const rotationShifts = person.rotationSchedule.shifts;
        
        // Bereken welke shift nu actief is (cyclisch roteren)
        const weeksSinceStart = currentWeek - startWeekNum;
        const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
        const currentShiftId = rotationShifts[shiftIndex];
        
        activeShift = dept.shifts.find(s => s.id === currentShiftId) || dept.shifts[0];
    } else if (person.rotationType === "STATIC") {
        // OUDE METHODE: vaste shift
        activeShift = dept.shifts.find(s => s.id === person.shiftId) || fallbackShift;
        if (person.shiftId !== "DAGDIENST" && person.shiftId) isPloeg = true;
    } else if (person.rotationType === "RELATIVE") {
        // OUDE METHODE: simpele week swap
        isPloeg = true; 
        const startWeek = person.startWeek || currentWeek;
        const isSwapped = Math.abs(currentWeek - startWeek) % 2 !== 0;
        const startIndex = dept.shifts.findIndex(s => s.id === person.startShiftId);
        const currentIndex = isSwapped ? (startIndex === 0 ? 1 : 0) : (startIndex === -1 ? 0 : startIndex);
        activeShift = dept.shifts[currentIndex] || dept.shifts[0];
    } else {
        // Geen rotatie: gebruik shiftId
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

  // 3. AUTO-CLEANUP: Verwijder occupancy records die niet meer kloppen met shift rotatie
  useEffect(() => {
    if (personnel.length === 0 || occupancy.length === 0) return;
    
    const checkAndCleanup = async () => {
      const toDelete = [];
      
      occupancy.forEach(occ => {
        // Vind de persoon die bij deze occupancy hoort
        const person = personnel.find(p => p.employeeNumber === occ.operatorNumber);
        if (!person) return; // Persoon niet gevonden, skip
        
        // Bereken welke shift deze persoon NU zou moeten hebben
        const shiftInfo = getShiftDetails(person, occ.departmentId);
        
        // Check of de opgeslagen shift nog klopt met de berekende shift
        const storedShift = occ.shift || '';
        const currentShift = shiftInfo.label || '';
        
        // Als shifts niet meer matchen EN de occupancy is van vandaag
        if (occ.date === todayStr && storedShift !== currentShift) {
          console.log(`⚠️ Shift mismatch voor ${person.name}: opgeslagen="${storedShift}", actueel="${currentShift}"`);
          toDelete.push(occ.id);
        }
      });
      
      // Verwijder verkeerde records
      if (toDelete.length > 0) {
        console.log(`🧹 Cleaning up ${toDelete.length} verkeerde occupancy records...`);
        for (const id of toDelete) {
          try {
            await deleteDoc(doc(db, ...PATHS.OCCUPANCY, id));
          } catch (err) {
            console.error('Cleanup error:', err);
          }
        }
      }
    };
    
    // Run cleanup na 2 seconden (geef data tijd om te laden)
    const timer = setTimeout(checkAndCleanup, 2000);
    return () => clearTimeout(timer);
  }, [personnel, occupancy, todayStr]);

  // 4. KPI CALCULATIONS
  const capacityMetrics = useMemo(() => {
    let totalNetHours = 0;
    const activeToday = occupancy.filter(occ => occ.date === todayStr && occ.operatorNumber);
    const countedOperators = new Set();
    activeToday.forEach(occ => {
        totalNetHours += parseFloat(occ.hoursWorked || 0);
        countedOperators.add(occ.operatorNumber);
    });
    return { daily: totalNetHours, activeCount: countedOperators.size };
  }, [occupancy, todayStr]);

  // 4. DISPLAY SECTIONS
  const displaySections = useMemo(() => {
    const allDepts = structure.departments || [];
    const cleanScope = (scope || "").toLowerCase();
    let filtered = (scope === 'all') ? allDepts : allDepts.filter(d => d.id.toLowerCase() === cleanScope || d.slug === cleanScope || d.name.toLowerCase().includes(cleanScope));
    console.log('[PersonnelOccupancy displaySections] scope:', scope, 'allDepts:', allDepts.length, 'filtered:', filtered.length, 'filtered names:', filtered.map(d => d.name));
    if (filtered.length === 0 && scope !== 'all') {
      console.warn('[PersonnelOccupancy] No departments found for scope:', scope, 'all departments:', allDepts.map(d => ({ id: d.id, slug: d.slug, name: d.name })));
    }
    return filtered.map(d => ({
        ...d,
        stations: [...(d.stations || [])].sort((a,b) => a.name.toLowerCase().includes("teamleader") ? -1 : 1)
    }));
  }, [structure.departments, scope]);

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={48} /></div>;
  
  const getShiftColor = (shiftLabel) => {
    const label = (shiftLabel || "").toUpperCase();
    if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
      return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", ring: "ring-amber-100" };
    }
    if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
      return { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-100" };
    }
    if (label.includes("NACHT") || label.includes("NIGHT")) {
      return { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-100" };
    }
    if (label.includes("DAG") || label === "DAGDIENST") {
      return { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800", badge: "bg-blue-100 text-blue-700", ring: "ring-blue-100" };
    }
    return { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-800", badge: "bg-slate-100 text-slate-700", ring: "ring-slate-100" };
  };

  // Fallback als er geen factory config is
  if (!structure.departments || structure.departments.length === 0) {
    return (
      <div className="p-20 text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-6 bg-amber-50 rounded-3xl border-2 border-amber-200">
            <AlertTriangle className="text-amber-600 mx-auto" size={48} />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-black text-slate-800 uppercase">Geen Fabrieksstructuur Gevonden</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            De fabrieksstructuur (afdelingen en werkstations) is nog niet geconfigureerd.
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono bg-slate-100 p-4 rounded-xl max-w-2xl mx-auto text-left">
          <p className="font-bold mb-2">Debug Info:</p>
          <p>Path: {PATHS.FACTORY_CONFIG.join("/")}</p>
          <p>Personnel: {personnel.length} records</p>
          <p>Occupancy: {occupancy.length} records</p>
        </div>
        <button
          onClick={() => window.location.href = "/admin/database"}
          className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-blue-700 transition-all"
        >
          Ga naar Database Setup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-500 w-full pb-32 px-1">
      {/* KPI DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-[35px] border-2 border-slate-100 shadow-sm text-left">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Man-uren Vandaag</span>
              <div className="flex items-baseline gap-2 text-left">
                  <span className="text-3xl font-black text-slate-900 italic tracking-tighter">{capacityMetrics.daily.toFixed(1)}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Uur</span>
              </div>
          </div>
          <div className="bg-slate-900 p-6 rounded-[35px] shadow-xl text-white text-left">
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-1 text-left">Operators</span>
              <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black italic tracking-tighter">{capacityMetrics.activeCount}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Actief</span>
              </div>
          </div>
          <div className="bg-blue-600 p-6 rounded-[35px] shadow-lg text-white text-left">
              <span className="text-[9px] font-black text-blue-100/50 uppercase tracking-widest block mb-1 text-left">Systeem Status</span>
              <span className="text-2xl font-black italic tracking-tighter uppercase">W{currentWeek} Live</span>
          </div>
      </div>

      {displaySections.map(dept => (
        <section key={dept.id} className="space-y-4 text-left">
            <div className="w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 ml-2 p-2 rounded-xl">
                <button onClick={() => setExpandedSections(prev => ({...prev, [dept.id]: !prev[dept.id]}))} className="flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all">
                    <div className="p-2 bg-slate-800 text-white rounded-xl shadow-md"><Layers size={16} /></div>
                    <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">{dept.name}</h3>
                </button>
                {editable && (
                  <button
                    onClick={() => {
                      setSelectedDept(dept);
                      setAssignModalOpen(true);
                    }}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-all"
                    title="Personeel toevoegen"
                  >
                    <PlusCircle size={20} />
                  </button>
                )}
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
                        
                        // Groepeer operators per dienst
                        const byShift = {};
                        stationOccupancy.forEach(occ => {
                          const shiftKey = occ.shift || "DAGDIENST";
                          if (!byShift[shiftKey]) byShift[shiftKey] = [];
                          byShift[shiftKey].push(occ);
                        });
                        
                        return (
                            <div key={station.id} className={`p-5 rounded-[35px] border-2 transition-all duration-500 relative flex flex-col shadow-sm ${isTL ? (isBusy ? 'bg-slate-900 border-amber-400 ring-4 ring-amber-400/10 shadow-xl' : 'bg-slate-900 border-slate-800 opacity-80 shadow-inner') : (isBusy ? 'bg-white border-blue-500 ring-4 ring-blue-50/50' : 'bg-white border-slate-100 hover:border-blue-200')}`}>
                                <div className="flex justify-between items-start mb-4 text-left">
                                    <div className="text-left"><span className={`text-[8px] font-black uppercase tracking-widest block mb-0.5 ${isTL ? 'text-amber-500 italic' : 'text-slate-400 opacity-60'}`}>{isTL ? 'Regie' : 'Station ID'}</span><h4 className={`text-lg font-black tracking-tighter italic uppercase truncate leading-none ${isTL ? 'text-white' : 'text-slate-900'}`}>{mId}</h4></div>
                                    {isTL ? <ShieldCheck size={20} className={isBusy ? 'text-amber-400' : 'text-slate-600'} /> : <Cpu size={20} className={isBusy ? 'text-blue-600' : 'text-slate-200'} />}
                                </div>
                                <div className="space-y-2 mb-4 flex-1 text-left text-left">
                                    {Object.entries(byShift).map(([shiftKey, operators]) => {
                                      const shiftColors = getShiftColor(shiftKey);
                                      return (
                                        <div key={shiftKey} className="space-y-1">
                                          {/* Shift Label */}
                                          <div className="flex items-center gap-2 mb-1">
                                            <div className={`h-1 flex-1 rounded ${shiftColors.badge}`}></div>
                                            <span className={`text-[8px] font-black uppercase tracking-wider ${shiftColors.text}`}>
                                              {shiftKey}
                                            </span>
                                            <div className={`h-1 flex-1 rounded ${shiftColors.badge}`}></div>
                                          </div>
                                          
                                          {/* Operators in deze shift */}
                                          {operators.map(occ => (
                                            <div key={occ.id} className={`p-3 rounded-2xl border-2 flex flex-col gap-2 animate-in slide-in-from-right-1 ${isTL ? 'bg-white/5 border-white/10 text-white' : `${shiftColors.bg} ${shiftColors.border}`} ${occ.isLoan ? 'ring-2 ring-green-400' : `ring-1 ${shiftColors.ring}`}`}>
                                                <div className="flex items-center justify-between text-left">
                                                    <div className="text-left overflow-hidden text-left flex-1">
                                                        <h5 className={`text-sm font-black uppercase italic truncate mb-0.5 text-left ${isTL ? 'text-amber-400' : shiftColors.text}`}>{occ.operatorName}</h5>
                                                        <div className="flex items-center gap-1.5 opacity-70 text-left flex-wrap">
                                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded ${occ.isPloeg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{occ.isPloeg ? 'PLOEG' : 'DAG'}</span>
                                                            <span className={`text-[7px] font-bold uppercase ${isTL ? 'text-slate-400' : 'text-slate-600'}`}>#{occ.operatorNumber}</span>
                                                            {occ.isLoan && (
                                                              <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-green-100 text-green-700">UITGELEEND</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                      {editable && !occ.isLoan && (
                                                        <button 
                                                          onClick={() => {
                                                            setSelectedPersonForLoan(occ);
                                                            setSelectedDepartmentForLoan(dept);
                                                            setLoanModalOpen(true);
                                                          }}
                                                          className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
                                                          title="Uitlenen aan andere afdeling"
                                                        >
                                                          <ArrowRight size={14} />
                                                        </button>
                                                      )}
                                                      <button onClick={() => deleteDoc(doc(db, ...PATHS.OCCUPANCY, occ.id))} className="p-1 text-slate-400 hover:text-rose-500 transition-colors"><X size={14} /></button>
                                                    </div>
                                                </div>
                                                <div className={`pt-2 border-t flex items-center justify-between ${isTL ? 'border-white/5' : 'border-slate-300/60'}`}>
                                                  <div className="flex items-center gap-1.5">
                                                    <Clock size={10} className={shiftColors.text} />
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter ${isTL ? 'text-slate-500' : 'text-slate-500'}`}>Inzet:</span>
                                                  </div>
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

      {/* Uitlenen Modal */}
      <LoanPersonnelModal
        isOpen={loanModalOpen}
        onClose={() => {
          setLoanModalOpen(false);
          setSelectedPersonForLoan(null);
          setSelectedDepartmentForLoan(null);
        }}
        person={selectedPersonForLoan}
        currentDepartment={selectedDepartmentForLoan}
      />

      {/* Assign Personnel Modal */}
      {assignModalOpen && selectedDept && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase italic">Personeel toevoegen</h3>
              <button onClick={() => setAssignModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Station</label>
                <select
                  value={selectedStation?.id || ""}
                  onChange={(e) => setSelectedStation(selectedDept.stations?.find(s => s.id === e.target.value) || null)}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="">Selecteer een station...</option>
                  {(selectedDept.stations || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Personeelslid</label>
                <select
                  onChange={(e) => {
                    const person = personnel.find(p => p.id === e.target.value);
                    if (person && selectedStation) {
                      // Bereken de juiste shift details voor deze persoon
                      const shiftInfo = getShiftDetails(person, selectedDept.id);
                      
                      // Voeg toe met timestamp om meerdere shifts per persoon toe te staan
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
                  }}
                  className="w-full p-3 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="">Selecteer personeelslid...</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => setAssignModalOpen(false)}
                  className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-all"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelOccupancy;