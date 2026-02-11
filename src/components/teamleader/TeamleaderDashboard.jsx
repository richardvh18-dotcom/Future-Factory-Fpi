import React from "react";
import {
  Layers,
  Zap,
  CheckCircle2,
  AlertOctagon,
  Users,
  Cpu,
  Clock,
  AlertTriangle,
  Activity,
} from "lucide-react";

const TeamleaderDashboard = ({ metrics, onKpiClick, onStationSelect }) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-8 pr-2 pb-20">
      {/* PRODUCTIE KPI'S */}
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-3">
          Productie KPI's
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              id: "gepland",
              label: "Planning",
              val: metrics.totalPlanned,
              icon: Layers,
              color: "text-slate-400",
            },
            {
              id: "in_proces",
              label: "Lopend",
              val: metrics.activeCount,
              icon: Zap,
              color: "text-blue-500",
            },
            {
              id: "gereed",
              label: "Gereed",
              val: metrics.finishedCount,
              icon: CheckCircle2,
              color: "text-emerald-500",
            },
            {
              id: "afkeur",
              label: "Afkeur",
              val: metrics.rejectedCount,
              icon: AlertOctagon,
              color: "text-rose-500",
            },
            {
              id: "tijdelijk_afkeur",
              label: "Tijdelijk Afkeur",
              val: metrics.tempRejectedCount || 0,
              icon: AlertTriangle,
              color: "text-orange-500",
            },
          ].map((item) => (
            <div
              key={item.id}
              className="bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-blue-300 transition-all cursor-pointer"
              onClick={() => onKpiClick(item.id, item.label)}
            >
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                <item.icon size={14} className={item.color} />{" "}
                {item.label}
              </p>
              <p className="text-2xl font-black text-slate-800 italic">
                {item.val}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* PERSONEEL KPI'S */}
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-3">
          Personeel & Uren
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div
            className="bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-indigo-300 transition-all cursor-pointer"
            onClick={() => onKpiClick("bezetting", "Uren")}
          >
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Clock size={14} className="text-indigo-500" />{" "}
              Man-uren
            </p>
            <p className="text-2xl font-black text-slate-800 italic">
              {metrics.bezettingAantal ? metrics.bezettingAantal.toFixed(1) : "0.0"} <span className="text-xs text-slate-400 not-italic">u</span>
            </p>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase">Vandaag</p>
                <p className="text-[9px] font-bold text-indigo-600 uppercase">Week: {metrics.weeklyTotalHours?.toFixed(1) || "0.0"}u</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-emerald-300 transition-all cursor-pointer">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Cpu size={14} className="text-emerald-500" />{" "}
              BH Stations
            </p>
            <p className="text-2xl font-black text-slate-800 italic">
              {metrics.productionHours ? metrics.productionHours.toFixed(1) : "0.0"} <span className="text-xs text-slate-400 not-italic">u</span>
            </p>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase">Vandaag</p>
                <p className="text-[9px] font-bold text-emerald-600 uppercase">Week: {metrics.weeklyProductionHours?.toFixed(1) || "0.0"}u</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-blue-300 transition-all cursor-pointer">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Users size={14} className="text-blue-500" />{" "}
              Overig
            </p>
            <p className="text-2xl font-black text-slate-800 italic">
              {metrics.supportHours ? metrics.supportHours.toFixed(1) : "0.0"} <span className="text-xs text-slate-400 not-italic">u</span>
            </p>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase">Vandaag</p>
                <p className="text-[9px] font-bold text-blue-600 uppercase">Week: {metrics.weeklySupportHours?.toFixed(1) || "0.0"}u</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[25px] border border-slate-200 shadow-sm text-left group hover:border-purple-300 transition-all cursor-pointer">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Activity size={14} className="text-purple-500" />{" "}
              Efficiency
            </p>
            <p className="text-2xl font-black text-slate-800 italic">
              {metrics.efficiency ? metrics.efficiency.toFixed(0) : "0"}%
            </p>
            <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                <p className="text-[8px] font-bold text-slate-400 uppercase">Vandaag</p>
                <p className="text-[9px] font-bold text-purple-600 uppercase">Week: {metrics.weeklyEfficiency?.toFixed(0) || "0"}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* LIVE STATION MONITOR */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
          Live Station Monitor
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {metrics.machineGridData.map((machine) => (
            <div
              key={machine.id}
              onClick={() => onStationSelect(machine.id)}
              className="bg-white border border-slate-200 rounded-[25px] p-4 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group relative overflow-hidden text-left"
            >
              <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Cpu size={60} />
              </div>
              <div className="text-left mb-3">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                  Station
                </span>
                <h4 className="text-lg font-black text-slate-900 tracking-tighter uppercase italic truncate">
                  {machine.id}
                </h4>
                {machine.operatorNames ? (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg w-fit border border-slate-100">
                    <Users size={10} className="text-blue-500" />
                    <span className="truncate max-w-[120px]">
                      {machine.operatorNames}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-slate-300 px-2 py-1">
                    <span className="italic">Geen operator</span>
                  </div>
                )}
              </div>
              {!machine.isAlgemeen && (
                <div
                  className={`grid ${
                    machine.isDownstream ? "grid-cols-2" : "grid-cols-3"
                  } gap-2 pt-3 border-t border-slate-50`}
                >
                  {!machine.isDownstream && (
                    <div>
                      <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5">
                        Plan
                      </span>
                      <span className="text-xs font-black text-slate-700 italic">
                        {machine.planned}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[7px] font-black text-blue-400 uppercase block mb-0.5">
                      {machine.isDownstream ? "Aanbod" : "Actief"}
                    </span>
                    <span className="text-xs font-black text-blue-600 italic">
                      {machine.active}
                    </span>
                  </div>
                  <div>
                    <span className="text-[7px] font-black text-emerald-400 uppercase block mb-0.5">
                      {machine.isDownstream ? "Gereed" : "Klaar"}
                    </span>
                    <span className="text-xs font-black text-emerald-600 italic">
                      {machine.finished}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamleaderDashboard;