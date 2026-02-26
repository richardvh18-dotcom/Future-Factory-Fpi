import React from "react";
import { useTranslation } from "react-i18next";
import { Zap, Layers, Clock, Disc } from "lucide-react";

// Configuratie van machine groepen
const FITTING_MACHINES = [
  "BM01",
  "BH11",
  "BH12",
  "BH15",
  "BH16",
  "BH17",
  "BH18",
  "BH31",
  "Mazak",
  "Nabewerking",
];
const PIPE_MACHINES = ["BH05", "BH07", "BH08", "BH09"];
// Alles wat niet in bovenstaande lijsten staat, valt onder 'Spools' of 'Overig'


const DashboardView = ({ metrics, onStationSelect }) => {
  const { t } = useTranslation();
  if (!metrics || !metrics.machineMetrics) return null;

  // Groepeer de machines
  const fittingGroup = metrics.machineMetrics.filter(
    (m) =>
      FITTING_MACHINES.includes(m.id) ||
      m.id.toUpperCase().startsWith("BM") ||
      m.id === "Station BM01"
  );

  const pipeGroup = metrics.machineMetrics.filter((m) =>
    PIPE_MACHINES.includes(m.id)
  );

  // De rest beschouwen we als Spools / Specials
  const spoolGroup = metrics.machineMetrics.filter(
    (m) =>
      !FITTING_MACHINES.includes(m.id) &&
      !m.id.toUpperCase().startsWith("BM") &&
      m.id !== "Station BM01" &&
      !PIPE_MACHINES.includes(m.id)
  );

  // Herbruikbare kaart renderer
  const renderMachineCard = (machine) => (
    <div
      key={machine.id}
      onClick={() => onStationSelect && onStationSelect(machine.id)}
      className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight group-hover:text-blue-600 transition-colors">
            {machine.id}
          </h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {machine.running > 0 ? t("digitalplanning.dashboard.active") : t("digitalplanning.dashboard.standby")}
          </p>
        </div>
        <div
          className={`p-1.5 rounded-xl ${
            machine.running > 0
              ? "bg-green-50 text-green-600 animate-pulse"
              : "bg-slate-50 text-slate-400"
          }`}
        >
          <Zap size={16} fill={machine.running > 0 ? "currentColor" : "none"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
          <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">
            {t("digitalplanning.dashboard.plan")}
          </span>
          <span className="block text-base font-black text-slate-800">
            {Math.round(machine.plan)}
          </span>
        </div>
        <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
          <span className="block text-[8px] font-black text-blue-400 uppercase mb-0.5">
            {t("digitalplanning.dashboard.ready")}
          </span>
          <span className="block text-base font-black text-blue-700">
            {machine.fin}
          </span>
        </div>
      </div>

      <div className="mt-3 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-1000"
          style={{
            width: `${
              machine.plan > 0
                ? Math.min(100, (machine.fin / machine.plan) * 100)
                : 0
            }%`,
          }}
        ></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      {/* 1. Fitting Productions */}
      {fittingGroup.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2">
            <Layers size={18} className="text-blue-500" />
            {t("digitalplanning.dashboard.fitting_productions")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {fittingGroup.map(renderMachineCard)}
          </div>
        </div>
      )}

      {/* 2. Pipe Productions */}
      {pipeGroup.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2">
            <Clock size={18} className="text-cyan-500" />
            {t("digitalplanning.dashboard.pipe_productions")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pipeGroup.map(renderMachineCard)}
          </div>
        </div>
      )}

      {/* 3. Spools Productions (Overige) */}
      {spoolGroup.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2">
            <Disc size={18} className="text-purple-500" />
            {t("digitalplanning.dashboard.spools_productions")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {spoolGroup.map(renderMachineCard)}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
