import React from "react";
import {
  Layers,
  Zap,
  CheckCircle2,
  AlertOctagon,
  Users,
  Cpu,
} from "lucide-react";

const TeamleaderDashboard = ({ metrics, onKpiClick, onStationSelect }) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-8 pr-2 pb-20">
      {/* KPI TEGELS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[
          {
            id: "gepland",
            label: "Totaal Plan",
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
            id: "bezetting",
            label: "Bezetting",
            val: metrics.bezettingAantal,
            icon: Users,
            color: "text-indigo-500",
          },
        ].map((item) => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-[35px] border-2 border-slate-100 shadow-sm text-left group hover:border-blue-200 transition-all cursor-pointer"
            onClick={() => onKpiClick(item.id, item.label)}
          >
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <item.icon size={14} className={item.color} />{" "}
              {item.label}
            </p>
            <p className="text-3xl font-black text-slate-800 italic">
              {item.val}
            </p>
          </div>
        ))}
      </div>

      {/* LIVE STATION MONITOR */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase italic tracking-widest ml-1">
          Live Station Monitor
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.machineGridData.map((machine) => (
            <div
              key={machine.id}
              onClick={() => onStationSelect(machine.id)}
              className="bg-white border border-slate-200 rounded-[35px] p-6 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all cursor-pointer group relative overflow-hidden text-left"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Cpu size={80} />
              </div>
              <div className="text-left mb-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Station
                </span>
                <h4 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">
                  {machine.id}
                </h4>
                {machine.operatorNames ? (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg w-fit border border-slate-100">
                    <Users size={12} className="text-blue-500" />
                    <span className="truncate max-w-[140px]">
                      {machine.operatorNames}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-300 px-2 py-1">
                    <span className="italic">Geen operator</span>
                  </div>
                )}
              </div>
              {!machine.isAlgemeen && (
                <div
                  className={`grid ${
                    machine.isDownstream ? "grid-cols-2" : "grid-cols-3"
                  } gap-2 pt-4 border-t border-slate-50`}
                >
                  {!machine.isDownstream && (
                    <div>
                      <span className="text-[8px] font-black text-slate-400 uppercase block mb-0.5">
                        Plan
                      </span>
                      <span className="text-sm font-black text-slate-700 italic">
                        {machine.planned}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[8px] font-black text-blue-400 uppercase block mb-0.5">
                      {machine.isDownstream ? "Aanbod" : "Actief"}
                    </span>
                    <span className="text-sm font-black text-blue-600 italic">
                      {machine.active}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-emerald-400 uppercase block mb-0.5">
                      {machine.isDownstream ? "Gereed" : "Klaar"}
                    </span>
                    <span className="text-sm font-black text-emerald-600 italic">
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