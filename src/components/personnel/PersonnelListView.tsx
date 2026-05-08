// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Grid } from "react-window";
import { Search, UserCircle, Edit3, Trash2, Plus, ChevronDown, ChevronUp, Layers, Filter, RotateCcw, ArrowRight, Nfc } from "lucide-react";
import { getISOWeek } from "date-fns";

const PersonnelListView = React.memo(({
  personnel = [],
  departments = [],
  onEdit,
  onDelete,
  onAdd,
  linkedTagEmployeeKeys = new Set(),
  expandedDepts: propExpandedDepts,
  onToggleDept
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [localExpandedDepts, setLocalExpandedDepts] = useState({});
  const [deptFilters, setDeptFilters] = useState({});

  const isControlled = propExpandedDepts !== undefined;
  const expandedDepts = isControlled ? propExpandedDepts : localExpandedDepts;
  const currentWeek = getISOWeek(new Date());

  // Initialize expanded states when departments change (only if not controlled)
  useEffect(() => {
    if (!isControlled && departments.length > 0) {
      const initialDepts = {};
      departments.forEach(d => initialDepts[d.id] = true);
      setLocalExpandedDepts(initialDepts);
    }
  }, [departments, isControlled]);

  const toggleDept = (deptId) => {
    if (isControlled && onToggleDept) {
      onToggleDept(deptId);
    } else {
      setLocalExpandedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }));
    }
  };

  const filteredPersonnel = personnel.filter((p) => {
    const term = searchTerm.toLowerCase();
    const name = (p.name || "").toLowerCase();
    const number = (p.employeeNumber || "").toLowerCase();
    return !term || name.includes(term) || number.includes(term);
  });

  const knownDepartmentIds = new Set(departments.map((dept) => dept.id));
  const unmatchedPersonnel = filteredPersonnel.filter(
    (person) => !knownDepartmentIds.has(person.departmentId)
  );

  const isGrouped = departments.length > 0;

  const getEffectiveShift = (p) => {
    if (p.rotationSchedule?.enabled && p.rotationSchedule.shifts?.length > 0) {
      const startWeekNum = p.rotationSchedule.startWeek || 1;
      const rotationShifts = p.rotationSchedule.shifts;
      const weeksSinceStart = currentWeek - startWeekNum;
      const shiftIndex = ((weeksSinceStart % rotationShifts.length) + rotationShifts.length) % rotationShifts.length;
      return rotationShifts[shiftIndex];
    }
    return p.shiftId;
  };

  const resolveShiftLabel = (shiftId, deptId) => {
    if (!shiftId || shiftId === "Overig") return shiftId;
    const dept = departments.find(d => d.id === deptId);
    if (!dept || !dept.shifts) return shiftId;
    const shift = dept.shifts.find(s => s.id === shiftId);
    return shift ? shift.label : shiftId;
  };

  const resolveDepartmentMeta = (deptId) => {
    const dept = departments.find((entry) => entry.id === deptId);
    if (dept) {
      return {
        label: dept.name,
        detail: dept.id,
        isUnmatched: false,
      };
    }

    return {
      label: deptId ? "Ongekoppelde afdeling" : "Geen afdeling",
      detail: deptId || "Niet ingesteld",
      isUnmatched: true,
    };
  };

  const renderCard = React.useCallback((p) => {
    const displayShiftId = getEffectiveShift(p);
    const displayLabel = resolveShiftLabel(displayShiftId, p.departmentId);
    const departmentMeta = resolveDepartmentMeta(p.departmentId);
    const rawEmployeeNumber = String(p.employeeNumber || "").trim();
    const employeeNumberDigits = rawEmployeeNumber.replace(/\D/g, "").replace(/^0+/, "");
    const employeeKey = rawEmployeeNumber.toUpperCase();
    const hasLinkedTag =
      (employeeKey && linkedTagEmployeeKeys.has(employeeKey)) ||
      (employeeNumberDigits && linkedTagEmployeeKeys.has(employeeNumberDigits));

    return (
    <div
      key={p.id}
      className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[40px] border-2 border-slate-100 hover:border-blue-400 transition-all group shadow-sm flex flex-col relative overflow-hidden text-left h-full"
      onClick={() => onEdit && onEdit(p)}
    >
      <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 pointer-events-none">
        <UserCircle size={100} />
      </div>
      
      <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6 relative z-10">
        <div className="p-2.5 sm:p-3 bg-slate-900 text-white rounded-2xl shadow-lg shrink-0">
          <UserCircle size={24} />
        </div>
        <div className="text-left overflow-hidden min-w-0">
          <h4 className="font-black text-slate-950 text-base uppercase italic truncate leading-none mb-1.5">
            {p.name || "Naamloos"}
          </h4>
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest italic block truncate">
            {p.employeeNumber || "Geen ID"}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4 flex-1">
          <div className={`px-2 py-1 rounded-lg border w-fit ${departmentMeta.isUnmatched ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-100 text-slate-500"}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider">{departmentMeta.label}</div>
            <div className="text-[8px] font-semibold tracking-wide normal-case opacity-80">{departmentMeta.detail}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="text-[9px] font-bold uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-slate-500">
              Record: {p.id}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${p.isActive === false ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
              {p.isActive === false ? "Inactief" : "Actief"}
            </div>
            {p.currentMachineId && (
              <div className="text-[9px] font-bold uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 text-blue-700">
                Machine: {p.currentMachineId}
              </div>
            )}
          </div>
          {displayShiftId && (
              <div className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg w-fit border flex items-center gap-1 ${p.rotationSchedule?.enabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {p.rotationSchedule?.enabled && <RotateCcw size={10} />}
                  {displayLabel}
              </div>
          )}
          {p.loan?.active && (
            <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-1 rounded-lg w-fit border border-indigo-100 mt-1 flex items-center gap-1">
              <ArrowRight size={10} /> Uitgeleend
            </div>
          )}
          <div className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg w-fit border mt-1 flex items-center gap-1 ${hasLinkedTag ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            <Nfc size={10} /> {hasLinkedTag ? "Tag gekoppeld" : "Geen tag gekoppeld"}
          </div>
      </div>

      <div className="pt-4 border-t border-slate-50 flex items-center justify-between opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all mt-auto relative z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit && onEdit(p);
          }}
          className="p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-xl transition-all"
          title="Bewerken"
        >
          <Edit3 size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete && onDelete(p.id);
          }}
          className="p-3 text-slate-300 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-all"
          title="Verwijderen"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )}, [onEdit, onDelete, currentWeek, departments, linkedTagEmployeeKeys]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* HEADER & SEARCH */}
      <div className="bg-white p-4 rounded-[28px] sm:rounded-[35px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={20}
          />
          <input
            type="text"
            placeholder="Zoek op naam of personeelsnummer..."
            className="w-full pl-14 pr-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {onAdd && (
          <button
            onClick={onAdd}
            className="px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 active:scale-95 shrink-0 w-full md:w-auto justify-center"
          >
            <Plus size={16} />
            <span>Toevoegen</span>
          </button>
        )}
      </div>

      {/* GRID */}
      {isGrouped ? (
        <div className="space-y-4">
          {departments.map(dept => {
            const deptPersonnel = filteredPersonnel.filter(p => p.departmentId === dept.id);
            if (searchTerm && deptPersonnel.length === 0) return null;

            const uniqueShifts = [...new Set(deptPersonnel.map(p => getEffectiveShift(p) || "Overig"))].sort((a, b) => {
              if (a === "Overig") return 1;
              if (b === "Overig") return -1;

              const shiftA = dept.shifts?.find(s => s.id === a);
              const shiftB = dept.shifts?.find(s => s.id === b);

              if (shiftA?.start && shiftB?.start) {
                return shiftA.start.localeCompare(shiftB.start);
              }
              
              return (shiftA?.label || a).localeCompare(shiftB?.label || b);
            });
            const activeFilter = deptFilters[dept.id] || "ALL";
            const threshold = dept.minPersonnel || 4;
            
            const displayedPersonnel = activeFilter === "ALL" 
              ? deptPersonnel 
              : deptPersonnel.filter(p => (getEffectiveShift(p) || "Overig") === activeFilter);

            return (
              <div key={dept.id} className="space-y-2">
                <div className="w-full flex items-center justify-between border-b-2 border-slate-200 pb-3 p-2 rounded-xl gap-2">
                    <button onClick={() => toggleDept(dept.id)} className="flex items-center gap-3 text-left flex-1 hover:bg-slate-100/50 p-2 rounded-xl transition-all">
                        <div className="p-2 bg-slate-800 text-white rounded-xl shadow-md"><Layers size={16} /></div>
                        <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase italic tracking-tight truncate">{dept.name}</h3>
                        <span className={`text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap ${deptPersonnel.length < threshold ? "text-rose-600 bg-rose-100" : "text-slate-400 bg-slate-100"}`} title={`Minimaal vereist: ${threshold}`}>Totaal: {deptPersonnel.length}</span>
                    </button>
                    <button onClick={() => toggleDept(dept.id)} className="p-2">
                      {expandedDepts[dept.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>

                {expandedDepts[dept.id] && (
                  <div className="pl-1 sm:pl-4 space-y-4">
                    {/* Filter Buttons */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        onClick={() => setDeptFilters(prev => ({ ...prev, [dept.id]: "ALL" }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all flex items-center gap-2 ${activeFilter === "ALL" ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                      >
                        <Filter size={12} /> Alles ({deptPersonnel.length})
                      </button>
                      {uniqueShifts.map(shiftId => (
                        <button
                          key={shiftId}
                          onClick={() => setDeptFilters(prev => ({ ...prev, [dept.id]: shiftId }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${activeFilter === shiftId ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          {resolveShiftLabel(shiftId, dept.id)} ({deptPersonnel.filter(p => (getEffectiveShift(p) || "Overig") === shiftId).length})
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-4">
                      {displayedPersonnel.length > 0 ? (
                        displayedPersonnel.map(p => renderCard(p))
                      ) : (
                        <div className="col-span-full text-center py-8 text-slate-400 italic text-sm">Geen personeel gevonden voor dit filter</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {unmatchedPersonnel.length > 0 && (
            <div className="space-y-2">
              <div className="w-full flex items-center justify-between border-b-2 border-amber-200 pb-3 p-2 rounded-xl gap-2 bg-amber-50/60">
                <div className="flex items-center gap-3 text-left flex-1 p-2">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-md"><Layers size={16} /></div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-black text-amber-900 uppercase italic tracking-tight truncate">Ongekoppelde afdelingen</h3>
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-1">Personeel met een oude of onbekende afdeling-ID</p>
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap text-amber-800 bg-amber-100">
                  Totaal: {unmatchedPersonnel.length}
                </span>
              </div>

              <div className="pl-1 sm:pl-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-4">
                  {unmatchedPersonnel.map(p => renderCard(p))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) :
        filteredPersonnel.length === 0 ? (
          <div className="col-span-full py-20 text-center opacity-50">
            <UserCircle size={64} className="mx-auto mb-4 text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">
              Geen medewerkers gevonden
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Grid
              columnCount={4}
              rowCount={Math.ceil(filteredPersonnel.length / 4)}
              columnWidth={320}
              rowHeight={260}
              width={1320}
              height={800}
              className="mx-auto"
            >
              {({ columnIndex, rowIndex, style }) => {
                const idx = rowIndex * 4 + columnIndex;
                if (idx >= filteredPersonnel.length) return null;
                const p = filteredPersonnel[idx];
                return <div style={style}>{renderCard(p)}</div>;
              }}
            </Grid>
          </div>
        )
      }
    </div>
  );

});

export default PersonnelListView;
