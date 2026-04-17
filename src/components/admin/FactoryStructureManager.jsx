import React, { useState, useEffect } from "react";
import {
  Building2,
  Cpu,
  Plus,
  Trash2,
  Save,
  Loader2,
  Layout,
  X,
  Database,
  AlertCircle,
  CheckCircle2,
  Globe,
  ChevronDown,
  Clock,
  ArrowRight,
  ShieldCheck,
  Bug,
  Settings2,
  Activity,
  Timer,
} from "lucide-react";
import { db, auth, logActivity } from "../../config/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { PATHS, isValidPath } from "../../config/dbPaths";

/**
 * FactoryStructureManager V5.0 - Industrial Root Sync
 * Provides full CRUD for Departments, Workstations, and Shifts.
 * Target Path: /future-factory/settings/factory_configs/main
 */
const FactoryStructureManager = () => {
  const [config, setConfig] = useState({ departments: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [expandedDepts, setExpandedDepts] = useState({});
  const [showDebug, setShowDebug] = useState(false);

  // Use the verified path from dbPaths.js
  const CONFIG_PATH = PATHS.FACTORY_CONFIG;

  // 1. Real-time Sync with Root Config
  useEffect(() => {
    if (!isValidPath("FACTORY_CONFIG")) {
      console.error("Critical: FACTORY_CONFIG path is not defined.");
      return;
    }

    const docRef = doc(db, ...CONFIG_PATH);
    const unsub = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setConfig({
            ...data,
            departments: Array.isArray(data.departments)
              ? data.departments
              : [],
          });
        } else {
          setConfig({ departments: [] });
        }
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Sync Error:", err);
        // FIX: Voorkom foutmelding bij uitloggen
        if (err.code === 'permission-denied') return;
        setStatus({ type: "error", msg: `Access Denied: ${err.code}` });
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const toggleExpand = (id) => {
    setExpandedDepts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- DEPARTMENT LOGIC ---
  const addDepartment = () => {
    const id = `dept_${Date.now()}`;
    const newDept = {
      id: id,
      name: "New Production Unit",
      slug: "new-unit",
      country: "Nederland",
      stations: [],
      shifts: [{ id: "DAG", label: "Dagdienst", start: "07:15", end: "16:00" }],
      isActive: true,
    };
    setConfig((prev) => ({
      ...prev,
      departments: [...(prev.departments || []), newDept],
    }));
    setExpandedDepts((prev) => ({ ...prev, [id]: true }));
  };

  const updateDept = (id, field, value) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) =>
        d.id === id ? { ...d, [field]: value } : d
      ),
    }));
  };

  const deleteDept = (id) => {
    if (
      !window.confirm(
        "Delete this entire production department and all linked stations?"
      )
    )
      return;
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.filter((d) => d.id !== id),
    }));
  };

  // --- STATION LOGIC ---
  const addStation = (deptId) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          const newStation = {
            id: `st_${Date.now()}`,
            name: "STATION-X",
            type: "machine",
          };
          return { ...d, stations: [...(d.stations || []), newStation] };
        }
        return d;
      }),
    }));
  };

  const updateStation = (deptId, stationId, value) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          return {
            ...d,
            stations: d.stations.map((s) =>
              s.id === stationId ? { ...s, name: value.toUpperCase() } : s
            ),
          };
        }
        return d;
      }),
    }));
  };

  const removeStation = (deptId, stationId) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          return {
            ...d,
            stations: (d.stations || []).filter((s) => s.id !== stationId),
          };
        }
        return d;
      }),
    }));
  };

  // --- SHIFT LOGIC ---
  const addShift = (deptId) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          const newShift = {
            id: `sh_${Date.now()}`,
            label: "New Shift",
            start: "06:00",
            end: "14:15",
          };
          return { ...d, shifts: [...(d.shifts || []), newShift] };
        }
        return d;
      }),
    }));
  };

  const updateShift = (deptId, shiftId, field, value) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          return {
            ...d,
            shifts: d.shifts.map((s) =>
              s.id === shiftId ? { ...s, [field]: value } : s
            ),
          };
        }
        return d;
      }),
    }));
  };

  const removeShift = (deptId, shiftId) => {
    setConfig((prev) => ({
      ...prev,
      departments: prev.departments.map((d) => {
        if (d.id === deptId) {
          return { ...d, shifts: d.shifts.filter((s) => s.id !== shiftId) };
        }
        return d;
      }),
    }));
  };

  // --- FIRESTORE PERSISTENCE ---
  const saveConfig = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const docRef = doc(db, ...CONFIG_PATH);
      await setDoc(
        docRef,
        {
          ...config,
          lastUpdated: serverTimestamp(),
          version: "5.0",
        },
        { merge: true }
      );

      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", "Factory structure updated");

      setStatus({ type: "success", msg: "Factory logic published to root!" });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      console.error("Save Error:", err);
      setStatus({ type: "error", msg: `Failed: ${err.code}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-blue-600 mx-auto" size={48} />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
            Synchronizing Factory Blueprint...
          </p>
        </div>
      </div>
    );

  return (
    <div className="h-full bg-slate-50 overflow-y-auto custom-scrollbar text-left pb-40">
      <div className="max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in">
        {/* HEADER UNIT */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12">
            <Settings2 size={120} />
          </div>

          <div className="text-left relative z-10">
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              Factory <span className="text-blue-600">Structure</span>
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 uppercase italic">
                <ShieldCheck size={10} /> Root Synchronized
              </span>
              <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                Target: /{CONFIG_PATH.join("/")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 relative z-10">
            {status && (
              <div
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 animate-in slide-in-from-right-2 ${
                  status.type === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-rose-50 text-rose-600"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertCircle size={14} />
                )}
                {status.msg}
              </div>
            )}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className={`p-4 rounded-2xl transition-all ${
                showDebug
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              }`}
            >
              <Bug size={18} />
            </button>
            <button
              onClick={addDepartment}
              className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl hover:bg-slate-800 transition-all active:scale-95"
            >
              <Plus size={16} /> Add Unit
            </button>
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-3 shadow-xl active:scale-95 disabled:opacity-50 hover:bg-blue-700 transition-all"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}{" "}
              Publiceren
            </button>
          </div>
        </div>

        {/* DEBUG PANEL */}
        {showDebug && (
          <div className="bg-slate-900 rounded-[30px] p-6 text-white font-mono text-[10px] space-y-2 animate-in zoom-in-95 border-b-4 border-blue-500 shadow-2xl">
            <p className="text-blue-400 font-black mb-2">
              --- CORE PATH DEBUGGER ---
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <p>
                <span className="text-slate-500">Firestore Path:</span> /
                {CONFIG_PATH.join("/")}
              </p>
              <p>
                <span className="text-slate-500">Node Status:</span>{" "}
                {loading ? "Syncing..." : "Live"}
              </p>
            </div>
          </div>
        )}

        {/* DEPARTMENTS LIST */}
        <div className="space-y-6">
          {(config.departments || []).length === 0 ? (
            <div className="bg-white border-4 border-dashed border-slate-100 rounded-[45px] p-24 text-center opacity-60">
              <Building2 size={64} className="mx-auto text-slate-200 mb-6" />
              <h3 className="text-xl font-black uppercase italic text-slate-800">
                Empty Factory Layout
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 mb-8">
                Begin creating production units
              </p>
              <button
                onClick={addDepartment}
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg"
              >
                + Add First Department
              </button>
            </div>
          ) : (
            config.departments.map((dept) => (
              <div
                key={dept.id}
                className={`bg-white rounded-[45px] border-2 transition-all duration-300 shadow-sm overflow-hidden ${
                  expandedDepts[dept.id]
                    ? "border-blue-500 ring-8 ring-blue-500/5 shadow-2xl"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                {/* Accordion Header */}
                <div
                  className={`p-8 flex justify-between items-center cursor-pointer transition-colors ${
                    expandedDepts[dept.id]
                      ? "bg-blue-50/20"
                      : "hover:bg-slate-50/50"
                  }`}
                  onClick={() => toggleExpand(dept.id)}
                >
                  <div className="flex items-center gap-6">
                    <div
                      className={`p-5 rounded-[22px] shadow-md transition-all ${
                        expandedDepts[dept.id]
                          ? "bg-blue-600 text-white scale-110"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Building2 size={28} />
                    </div>
                    <div className="text-left">
                      <h4 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                        {dept.name}
                      </h4>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
                          <Globe size={12} /> {dept.country}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Cpu size={12} /> {(dept.stations || []).length}{" "}
                          Stations
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Clock size={12} /> {(dept.shifts || []).length}{" "}
                          Ploegen
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDept(dept.id);
                      }}
                      className="p-3 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                    <div
                      className={`p-2 rounded-lg transition-transform duration-500 ${
                        expandedDepts[dept.id]
                          ? "rotate-180 bg-blue-100 text-blue-600"
                          : "bg-slate-50 text-slate-300"
                      }`}
                    >
                      <ChevronDown size={24} />
                    </div>
                  </div>
                </div>

                {/* Accordion Content */}
                {expandedDepts[dept.id] && (
                  <div className="p-10 border-t border-slate-50 bg-white space-y-12 animate-in slide-in-from-top-4 duration-500 text-left">
                    {/* SECTION 1: BASIC INFO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 italic">
                          Production Unit Name
                        </label>
                        <input
                          type="text"
                          value={dept.name}
                          onChange={(e) =>
                            updateDept(dept.id, "name", e.target.value)
                          }
                          className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[22px] font-black uppercase text-sm outline-none focus:border-blue-500 transition-all shadow-inner"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 italic">
                          Operation Hub Location
                        </label>
                        <select
                          value={dept.country}
                          onChange={(e) =>
                            updateDept(dept.id, "country", e.target.value)
                          }
                          className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[22px] font-black uppercase text-sm outline-none focus:border-blue-500 transition-all cursor-pointer shadow-inner"
                        >
                          <option value="Nederland">
                            Nederland (FPi Hardenberg)
                          </option>
                          <option value="Dubai">Dubai (DXB Plant)</option>
                          <option value="EGT">Egypte (EGT Plant)</option>
                        </select>
                      </div>
                    </div>

                    {/* SECTION 2: WORKSTATIONS */}
                    <div className="space-y-6 pt-10 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-6">
                        <div className="text-left">
                          <h5 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.3em] flex items-center gap-2 italic leading-none">
                            <Activity size={18} /> Integrated Workstations
                          </h5>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">
                            Active terminals linked to this unit
                          </p>
                        </div>
                        <button
                          onClick={() => addStation(dept.id)}
                          className="px-5 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all active:scale-95"
                        >
                          + Add Station
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {(dept.stations || []).map((station) => (
                          <div key={station.id} className="relative group/st">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover/st:text-blue-500 transition-colors pointer-events-none">
                              <Cpu size={16} />
                            </div>
                            <input
                              type="text"
                              value={station.name}
                              onChange={(e) =>
                                updateStation(
                                  dept.id,
                                  station.id,
                                  e.target.value
                                )
                              }
                              className="w-full pl-12 pr-10 py-5 bg-slate-50 border-2 border-slate-100 rounded-[20px] font-black text-xs outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm uppercase tracking-tighter"
                            />
                            <button
                              onClick={() => removeStation(dept.id, station.id)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover/st:opacity-100"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        {dept.stations?.length === 0 && (
                          <div className="col-span-full py-10 bg-slate-50/50 rounded-[30px] border-2 border-dashed border-slate-100 text-center text-[10px] font-black uppercase text-slate-300 italic tracking-widest">
                            No stations configured
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SECTION 3: SHIFT SCHEDULES */}
                    <div className="space-y-6 pt-10 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-6">
                        <div className="text-left">
                          <h5 className="text-[11px] font-black text-orange-600 uppercase tracking-[0.3em] flex items-center gap-2 italic leading-none">
                            <Timer size={18} /> Shift Management
                          </h5>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">
                            Operational time slots for occupancy
                          </p>
                        </div>
                        <button
                          onClick={() => addShift(dept.id)}
                          className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-slate-800 transition-all active:scale-95"
                        >
                          + Add Shift
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(dept.shifts || []).map((shift) => (
                          <div
                            key={shift.id}
                            className="p-6 bg-slate-50 rounded-[35px] border-2 border-slate-100 space-y-4 relative group/sh shadow-inner hover:border-orange-200 transition-all"
                          >
                            <div className="flex justify-between items-center">
                              <input
                                type="text"
                                value={shift.label}
                                onChange={(e) =>
                                  updateShift(
                                    dept.id,
                                    shift.id,
                                    "label",
                                    e.target.value
                                  )
                                }
                                className="bg-transparent font-black uppercase text-xs text-slate-800 outline-none border-b border-transparent focus:border-orange-300 transition-all w-2/3"
                              />
                              <button
                                onClick={() => removeShift(dept.id, shift.id)}
                                className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover/sh:opacity-100 transition-all"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                              <input
                                type="time"
                                value={shift.start}
                                onChange={(e) =>
                                  updateShift(
                                    dept.id,
                                    shift.id,
                                    "start",
                                    e.target.value
                                  )
                                }
                                className="flex-1 bg-transparent text-xs font-black text-blue-600 outline-none"
                              />
                              <ArrowRight
                                size={14}
                                className="text-slate-300"
                              />
                              <input
                                type="time"
                                value={shift.end}
                                onChange={(e) =>
                                  updateShift(
                                    dept.id,
                                    shift.id,
                                    "end",
                                    e.target.value
                                  )
                                }
                                className="flex-1 bg-transparent text-xs font-black text-blue-600 outline-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* AUDIT FOOTER */}
        <div className="p-10 bg-slate-900 rounded-[50px] text-white/50 text-[10px] font-black uppercase tracking-[0.3em] flex flex-col md:flex-row items-center gap-8 relative overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
            <Database size={150} />
          </div>
          <div className="p-4 bg-blue-600 rounded-[22px] shadow-lg text-white">
            <Layout size={28} />
          </div>
          <div className="text-left flex-1 relative z-10 leading-relaxed max-w-3xl">
            Changes to the factory structure are globally enforced. Adding or
            removing stations will immediately update all
            <span className="text-blue-400 italic">
              {" "}
              Station Selection Hubs
            </span>{" "}
            and{" "}
            <span className="text-emerald-400 italic">
              Personnel Assignment
            </span>{" "}
            modules across the MES network.
          </div>
        </div>
      </div>
    </div>
  );
};

export default FactoryStructureManager;
