import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  Users,
  Cpu,
  X
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { 
  format, 
  startOfWeek, 
  addWeeks,
  eachWeekOfInterval,
  getISOWeek,
  isSameWeek
} from "date-fns";
import { nl } from "date-fns/locale";

/**
 * WorkloadHeatmapView - Visual capacity/workload overview
 * Shows machine/operator workload with color-coded intensity
 */
const WorkloadHeatmapView = () => {
  const [occupancy, setOccupancy] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("machine"); // machine | operator
  const [weekRange, setWeekRange] = useState(8); // number of weeks to show
  const [selectedCell, setSelectedCell] = useState(null);

  const viewStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  useEffect(() => {
    // Load occupancy data
    const unsubOccupancy = onSnapshot(
      collection(db, ...PATHS.OCCUPANCY),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOccupancy(data);
      }
    );

    // Load planning data
    const unsubPlanning = onSnapshot(
      collection(db, ...PATHS.PLANNING),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPlanning(data);
        
        // Extract unique machines
        const uniqueMachines = [...new Set(data.map(o => o.machine).filter(Boolean))];
        setMachines(uniqueMachines.sort());
        setLoading(false);
      }
    );

    return () => {
      unsubOccupancy();
      unsubPlanning();
    };
  }, []);

  // Calculate weeks to display
  const weeks = useMemo(() => {
    return eachWeekOfInterval({
      start: viewStart,
      end: addWeeks(viewStart, weekRange - 1)
    }, { weekStartsOn: 1 });
  }, [viewStart, weekRange]);

  // Station icon/kleur mapping
  const stationStyles = {
    'Teamleade hub': {
      color: 'bg-yellow-400 text-black border-black',
      icon: <Users size={20} className="text-black" />
    },
    'BM': {
      color: 'bg-blue-500 text-white border-blue-700',
      icon: <Cpu size={20} className="text-white" />
    },
    'BA': {
      color: 'bg-blue-500 text-white border-blue-700',
      icon: <Cpu size={20} className="text-white" />
    },
    'BH': {
      color: 'bg-blue-500 text-white border-blue-700',
      icon: <Cpu size={20} className="text-white" />
    },
    'Mazak': {
      color: 'bg-red-500 text-white border-red-700',
      icon: <TrendingUp size={20} className="text-white" />
    },
    'Nabewerken': {
      color: 'bg-green-500 text-white border-green-700',
      icon: <CheckCircle size={20} className="text-white" />
    },
    'Lossen': {
      color: 'bg-yellow-300 text-black border-yellow-600',
      icon: <AlertTriangle size={20} className="text-black" />
    },
    'Algemeen': {
      color: 'bg-orange-400 text-white border-orange-700',
      icon: <Calendar size={20} className="text-white" />
    }
  };

  // Calculate workload for a machine in a week
  const getMachineWorkload = (machine, weekStart) => {
    // Get capacity (occupancy)
    const capacity = occupancy
      .filter(o => {
        const occMachine = o.machine || o.machineName || o.machineId;
        if (occMachine !== machine) return false;
        
        if (o.date) {
          return isSameWeek(new Date(o.date), weekStart, { weekStartsOn: 1 });
        }
        // Fallback legacy
        const weekNum = getISOWeek(weekStart);
        const year = weekStart.getFullYear();
        return o.week === weekNum && o.year === year;
      })
      .reduce((sum, o) => sum + (parseFloat(o.hoursWorked || o.hours || o.productionHours || 0)), 0);

    // Get demand (planning)
    const demand = planning
      .filter(p => {
        if (p.machine !== machine || !p.plannedDate) return false;
        const planDate = new Date(p.plannedDate.seconds * 1000);
        return isSameWeek(planDate, weekStart, { weekStartsOn: 1 });
      })
      .reduce((sum, p) => sum + (p.estimatedHours || p.plan / 10 || 0), 0);

    return { capacity, demand, utilization: capacity > 0 ? (demand / capacity) * 100 : 0 };
  };

  const handleCellClick = (machine, week) => {
    // Filter occupancy details
    const cellOccupancy = occupancy.filter(o => {
      const occMachine = o.machine || o.machineName || o.machineId;
      if (occMachine !== machine) return false;
      if (o.date) return isSameWeek(new Date(o.date), week, { weekStartsOn: 1 });
      return false;
    });

    // Filter planning details
    const cellPlanning = planning.filter(p => {
      if (p.machine !== machine || !p.plannedDate) return false;
      const planDate = new Date(p.plannedDate.seconds * 1000);
      return isSameWeek(planDate, week, { weekStartsOn: 1 });
    });

    setSelectedCell({
      machine,
      week,
      occupancy: cellOccupancy,
      planning: cellPlanning
    });
  };

  // Get color based on utilization %
  const getHeatmapColor = (utilization) => {
    if (utilization === 0) return "bg-slate-100 text-slate-400";
    if (utilization < 50) return "bg-emerald-200 text-emerald-800";
    if (utilization < 75) return "bg-green-300 text-green-900";
    if (utilization < 90) return "bg-yellow-300 text-yellow-900";
    if (utilization < 110) return "bg-orange-400 text-orange-900";
    return "bg-red-500 text-white";
  };

  // Get status icon
  const getStatusIcon = (utilization) => {
    if (utilization < 75) return <CheckCircle size={16} className="opacity-70" />;
    if (utilization < 110) return <TrendingUp size={16} className="opacity-70" />;
    return <AlertTriangle size={16} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Workload <span className="text-purple-600">Heatmap</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Visueel overzicht van machine/operator belasting
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("machine")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "machine"
                    ? "bg-purple-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Machines
              </button>
              <button
                onClick={() => setViewMode("operator")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "operator"
                    ? "bg-purple-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Operators
              </button>
            </div>

            {/* Week Range */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekRange(4)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  weekRange === 4
                    ? "bg-purple-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                4 Weken
              </button>
              <button
                onClick={() => setWeekRange(8)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  weekRange === 8
                    ? "bg-purple-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                8 Weken
              </button>
              <button
                onClick={() => setWeekRange(12)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  weekRange === 12
                    ? "bg-purple-500 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                12 Weken
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden">
        {/* Week Headers */}
        <div className="flex border-b-2 border-slate-200 bg-slate-50">
          <div className="w-48 flex-shrink-0 p-4 border-r-2 border-slate-200 font-bold text-sm text-slate-700">
            {viewMode === "machine" ? "Machine" : "Operator"}
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex">
              {weeks.map((week, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 border-r border-slate-200 p-2 text-center"
                  style={{ minWidth: "100px" }}
                >
                  <div className="text-xs text-slate-500">
                    {format(week, "'Week' w", { locale: nl })}
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {format(week, 'dd MMM', { locale: nl })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {machines.map((machine, idx) => (
            <div
              key={machine}
              className={`flex border-b border-slate-200 ${
                idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
              }`}
            >
              {/* Machine/Operator Name */}
              <div className="w-48 flex-shrink-0 p-4 border-r-2 border-slate-200">
                <div className="font-bold text-sm text-slate-800">{machine}</div>
              </div>

              {/* Week Cells */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex">
                  {weeks.map((week, weekIdx) => {
                    const workload = getMachineWorkload(machine, week);
                    // Station specifieke kleur/icon
                    const stationStyle = stationStyles[machine] || {};
                    const color = stationStyle.color || getHeatmapColor(workload.utilization);
                    const icon = stationStyle.icon || getStatusIcon(workload.utilization);

                    return (
                      <div
                        key={weekIdx}
                        onClick={() => handleCellClick(machine, week)}
                        className={`flex-shrink-0 border-r border-slate-200 p-3 group relative transition-all hover:scale-105 cursor-pointer ${color}`}
                        style={{ minWidth: "100px", minHeight: "80px" }}
                      >
                        <div className="flex flex-col items-center justify-center h-full">
                          {icon}
                          <div className="text-lg font-black mt-1">
                            {Math.round(workload.utilization)}%
                          </div>
                          <div className="text-xs opacity-70">
                            {Math.round(workload.demand)}h / {Math.round(workload.capacity)}h
                          </div>
                        </div>

                        {/* Tooltip */}
                        <div className="hidden group-hover:block absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl z-10 whitespace-nowrap text-xs pointer-events-none">
                          <div className="font-bold mb-2">{machine} - Week {getISOWeek(week)}</div>
                          <div>Capaciteit: {Math.round(workload.capacity)} uur</div>
                          <div>Vraag: {Math.round(workload.demand)} uur</div>
                          <div className="mt-1 pt-1 border-t border-slate-700">
                            Bezetting: {Math.round(workload.utilization)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-200">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Bezettingsgraad:</h3>
        <div className="flex items-center gap-4">
          {[
            { range: "0%", label: "Geen data", color: "bg-slate-100 text-slate-400" },
            { range: "< 50%", label: "Lage bezetting", color: "bg-emerald-200 text-emerald-800" },
            { range: "50-75%", label: "Gezonde bezetting", color: "bg-green-300 text-green-900" },
            { range: "75-90%", label: "Hoge bezetting", color: "bg-yellow-300 text-yellow-900" },
            { range: "90-110%", label: "Bijna vol", color: "bg-orange-400 text-orange-900" },
            { range: "> 110%", label: "Overbelast", color: "bg-red-500 text-white" }
          ].map(item => (
            <div key={item.range} className="flex items-center gap-2">
              <div className={`w-12 h-6 ${item.color} rounded text-xs font-bold flex items-center justify-center`}>
                {item.range}
              </div>
              <span className="text-xs text-slate-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        {[
          { 
            label: "Totaal Machines", 
            value: machines.length, 
            icon: <TrendingUp />, 
            color: "bg-blue-500" 
          },
          { 
            label: "Gemiddelde Bezetting", 
            value: `${Math.round(
              machines.reduce((sum, m) => {
                const avg = weeks.reduce((wSum, w) => {
                  const wl = getMachineWorkload(m, w);
                  return wSum + wl.utilization;
                }, 0) / weeks.length;
                return sum + avg;
              }, 0) / (machines.length || 1)
            )}%`,
            icon: <TrendingUp />,
            color: "bg-purple-500"
          },
          {
            label: "Overbelaste Machines",
            value: machines.filter(m => {
              const avgUtil = weeks.reduce((sum, w) => {
                const wl = getMachineWorkload(m, w);
                return sum + wl.utilization;
              }, 0) / weeks.length;
              return avgUtil > 110;
            }).length,
            icon: <AlertTriangle />,
            color: "bg-red-500"
          },
          {
            label: "Gezonde Bezetting",
            value: machines.filter(m => {
              const avgUtil = weeks.reduce((sum, w) => {
                const wl = getMachineWorkload(m, w);
                return sum + wl.utilization;
              }, 0) / weeks.length;
              return avgUtil >= 50 && avgUtil <= 90;
            }).length,
            icon: <CheckCircle />,
            color: "bg-emerald-500"
          }
        ].map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-4 border-2 border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600">{stat.label}</span>
              <div className={`${stat.color} text-white p-1.5 rounded-lg`}>
                {stat.icon}
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                  {selectedCell.machine}
                </h3>
                <p className="text-sm font-bold text-slate-500">
                  Week {getISOWeek(selectedCell.week)} • {format(selectedCell.week, 'dd MMM yyyy', { locale: nl })}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCell(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Capacity Column */}
                <div>
                  <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Users size={18} /> Capaciteit ({selectedCell.occupancy.reduce((sum, o) => sum + (parseFloat(o.hoursWorked || o.hours || 0)), 0)}u)
                  </h4>
                  <div className="space-y-3">
                    {selectedCell.occupancy.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Geen personeel ingepland.</p>
                    ) : (
                      selectedCell.occupancy.map((occ, idx) => (
                        <div key={idx} className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex justify-between items-center">
                          <div>
                            <div className="font-bold text-slate-700 text-sm">{occ.operatorName}</div>
                            <div className="text-[10px] text-emerald-600 font-bold uppercase">{occ.shift || "Dagdienst"}</div>
                          </div>
                          <div className="font-black text-emerald-700">{occ.hoursWorked || occ.hours || 8}u</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Demand Column */}
                <div>
                  <h4 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp size={18} /> Vraag ({Math.round(selectedCell.planning.reduce((sum, p) => sum + (p.estimatedHours || 0), 0))}u)
                  </h4>
                  <div className="space-y-3">
                    {selectedCell.planning.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Geen orders gepland.</p>
                    ) : (
                      selectedCell.planning.map((order, idx) => (
                        <div key={idx} className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-bold text-slate-700 text-sm">{order.orderId || order.item}</div>
                            <div className="font-black text-blue-700">{Math.round(order.estimatedHours || 0)}u</div>
                          </div>
                          <div className="text-xs text-slate-500 truncate">{order.itemCode}</div>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{order.status}</span>
                            <span className="text-[10px] font-bold text-blue-600">{order.plan} stuks</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkloadHeatmapView;
