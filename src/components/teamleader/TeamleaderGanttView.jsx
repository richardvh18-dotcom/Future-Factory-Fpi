import React from "react";
import { Users, Activity, CalendarDays, AlertTriangle, CheckCircle2 } from "lucide-react";
import GanttChartView from "../planning/GanttChartView";

const TeamleaderGanttView = ({ metrics }) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-20 flex flex-col items-center">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mt-8 mb-8 w-full">
        {/* Totaal Beschikbare Uren */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="text-slate-600" size={24} />
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
              Totaal
            </span>
          </div>
          <div className="text-4xl font-black text-slate-600 mb-2">
            {metrics.bezettingAantal}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Alle uren
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Stations</span>
              <span className="font-bold">{metrics.machineGridData.length}</span>
            </div>
          </div>
        </div>

        {/* Productie-uren */}
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Activity className="text-emerald-600" size={24} />
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
              Productie
            </span>
          </div>
          <div className="text-4xl font-black text-emerald-600 mb-2">
            {metrics.finishedCount}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Afgerond
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Actief</span>
              <span className="font-bold">{metrics.activeCount}</span>
            </div>
          </div>
        </div>

        {/* Geplande Vraag */}
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <CalendarDays className="text-blue-600" size={24} />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
              Planning
            </span>
          </div>
          <div className="text-4xl font-black text-blue-600 mb-2">
            {metrics.totalPlanned}u
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Geplande uren
          </div>
        </div>

        {/* Efficiëntie */}
        <div className={`bg-white border-2 rounded-2xl p-6 ${metrics.totalPlanned > metrics.finishedCount ? 'border-rose-200' : 'border-emerald-200'}`}>
          <div className="flex items-center justify-between mb-4">
            {metrics.totalPlanned > metrics.finishedCount ? (
              <AlertTriangle className="text-rose-600" size={24} />
            ) : (
              <CheckCircle2 className="text-emerald-600" size={24} />
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-black ${metrics.totalPlanned > metrics.finishedCount ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {metrics.totalPlanned > metrics.finishedCount ? 'Tekort' : 'Overschot'}
            </span>
          </div>
          <div className={`text-4xl font-black mb-2 ${metrics.totalPlanned > metrics.finishedCount ? 'text-rose-600' : 'text-emerald-600'}`}>
            {metrics.totalPlanned > 0 ? Math.round(((metrics.finishedCount - metrics.totalPlanned) / metrics.totalPlanned) * 100) : 0}%
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            {metrics.totalPlanned > metrics.finishedCount ? 'Ondercapaciteit' : 'Overcapaciteit'}
          </div>
        </div>
      </div>
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl p-8 flex flex-col items-center">
        <h2 className="text-2xl font-black text-orange-700 mb-4 uppercase tracking-widest">Gantt-planning</h2>
        <GanttChartView />
      </div>
    </div>
  );
};

export default TeamleaderGanttView;
