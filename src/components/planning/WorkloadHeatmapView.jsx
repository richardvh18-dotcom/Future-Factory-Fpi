import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  Users
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { 
  format, 
  startOfWeek, 
  addWeeks,
  eachWeekOfInterval,
  getISOWeek
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

  // Calculate workload for a machine in a week
  const getMachineWorkload = (machine, weekStart) => {
    const weekNum = getISOWeek(weekStart);
    const year = weekStart.getFullYear();

    // Get capacity (occupancy)
    const capacity = occupancy
      .filter(o => 
        o.machine === machine &&
        o.week === weekNum &&
        o.year === year
      )
      .reduce((sum, o) => sum + (o.productionHours || 0), 0);

    // Get demand (planning)
    const demand = planning
      .filter(p => {
        if (p.machine !== machine || !p.plannedDate) return false;
        const planDate = new Date(p.plannedDate.seconds * 1000);
        const planWeek = getISOWeek(planDate);
        const planYear = planDate.getFullYear();
        return planWeek === weekNum && planYear === year;
      })
      .reduce((sum, p) => sum + (p.estimatedHours || p.plan / 10 || 0), 0);

    return { capacity, demand, utilization: capacity > 0 ? (demand / capacity) * 100 : 0 };
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
                    const color = getHeatmapColor(workload.utilization);
                    const icon = getStatusIcon(workload.utilization);

                    return (
                      <div
                        key={weekIdx}
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
                        <div className="hidden group-hover:block absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-slate-900 text-white p-3 rounded-lg shadow-xl z-10 whitespace-nowrap text-xs">
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
    </div>
  );
};

export default WorkloadHeatmapView;
