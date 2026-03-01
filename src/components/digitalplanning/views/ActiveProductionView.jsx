import React from "react";
import {
  Activity,
  Zap,
  ArrowRight,
  AlertTriangle,
  AlertOctagon,
  BellRing,
  Lightbulb,
  Repeat,
} from "lucide-react";
import {
  getMaterialInfo,
  isInspectionOverdue,
} from "../../../utils/workstationLogic";

const ActiveProductionView = ({
  activeUnits,
  smartSuggestions,
  selectedStation,
  onProcessUnit,
  onClickUnit,
}) => {
  // Alleen tonen als we NIET op BM01 zitten (die heeft een andere view)
  if (selectedStation === "BM01" || selectedStation === "Station BM01")
    return null;

  return (
    <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between">
          <h3 className="font-black text-blue-800 text-sm uppercase tracking-tight flex items-center gap-2">
            <Activity size={16} /> Nu Actief
          </h3>
          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {activeUnits.length}
          </span>
        </div>
        <div className="p-2">
          {activeUnits.length > 0 ? (
            <div className="space-y-2">
              {activeUnits.map((unit) => {
                const matInfo = getMaterialInfo(unit.item);
                const isTempReject =
                  unit.inspection?.status === "Tijdelijke afkeur";
                const isOverdue =
                  isTempReject &&
                  isInspectionOverdue(unit.inspection?.timestamp);

                return (
                  <div
                    key={unit.lotNumber}
                    onClick={() => onClickUnit(unit)}
                    className={`p-3 bg-white border rounded-xl shadow-sm flex flex-col gap-2 cursor-pointer transition-all hover:shadow-md ${
                      isTempReject
                        ? "border-orange-200 bg-orange-50"
                        : "border-blue-50"
                    }`}
                  >
                    {matInfo.warning && (
                      <div
                        className={`mb-2 p-1.5 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wide animate-pulse ${matInfo.colorClasses}`}
                      >
                        {matInfo.icon} {matInfo.warning}
                      </div>
                    )}

                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-black text-gray-800">
                          {unit.lotNumber}
                        </p>
                        {unit.orderId === "NOG_TE_BEPALEN" && (
                          <span className="bg-red-100 text-red-600 px-1 py-0.5 rounded text-[8px] font-black mr-2">
                            EXTRA
                          </span>
                        )}
                        {matInfo.type !== "EST" && (
                          <div
                            className={`mt-1 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit ${matInfo.colorClasses}`}
                          >
                            {matInfo.icon}
                            {matInfo.label}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-500 truncate max-w-[150px] mt-0.5">
                          {unit.item}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                        {unit.startTime
                          ? new Date(unit.startTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    {isTempReject && unit.inspection && (
                      <div className="bg-white/60 p-2 rounded-lg text-[10px] border border-orange-100">
                        <p className="font-bold text-orange-700 flex items-center gap-1">
                          <AlertTriangle size={10} /> Tijdelijke Afkeur
                        </p>
                        {unit.inspection.reasons && (
                          <p className="text-orange-600 mt-1">
                            Reden: {unit.inspection.reasons.join(", ")}
                          </p>
                        )}
                        {unit.note && (
                          <p className="text-gray-500 italic mt-1">
                            "{unit.note}"
                          </p>
                        )}
                        <p className="text-gray-400 mt-1 text-[9px]">
                          {unit.inspection.timestamp
                            ? new Date(
                                unit.inspection.timestamp
                              ).toLocaleString()
                            : ""}
                        </p>

                        {isOverdue && (
                          <div className="mt-2 flex items-center justify-between bg-red-100 p-2 rounded border border-red-200">
                            <span className="font-black text-red-700 flex items-center gap-1">
                              <AlertOctagon size={14} /> &gt; 7 DAGEN!
                            </span>
                            {unit.reminderSent ? (
                              <span className="text-[9px] text-gray-500 italic flex items-center gap-1">
                                <BellRing size={10} /> Reminder verstuurd
                              </span>
                            ) : (
                              <span className="text-[9px] text-red-400 italic">
                                Wordt verstuurd...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onProcessUnit(unit);
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-[10px] uppercase flex items-center justify-center gap-2"
                      >
                        <ArrowRight size={14} /> Klaar / Verder
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-blue-300">
              <Zap size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-[10px] font-bold uppercase">Geen activiteit</p>
            </div>
          )}
        </div>
      </div>

      {/* Smart Suggestions */}
      {smartSuggestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-500">
          <div className="bg-purple-50/50 p-4 border-b border-purple-100">
            <h3 className="font-black text-purple-800 text-sm uppercase tracking-tight flex items-center gap-2">
              <Lightbulb size={16} /> Slimme Suggesties
            </h3>
          </div>
          <div className="p-3 space-y-3">
            {smartSuggestions.map((sug, idx) => (
              <div
                key={idx}
                className="bg-purple-50 rounded-xl p-3 border border-purple-100"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white rounded-lg text-purple-600 shadow-sm">
                    <Repeat size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-purple-900 leading-tight mb-1">
                      Combineer Orders?
                    </p>
                    <p className="text-[10px] text-purple-700 mb-2">
                      Product <strong>{sug.product}</strong> komt{" "}
                      <strong>{sug.count}x</strong> voor in week{" "}
                      {sug.weeks.join(" & ")}.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {sug.orders.map((o) => (
                        <span
                          key={o.orderId}
                          className="px-1.5 py-0.5 bg-white rounded text-[9px] font-mono font-bold text-purple-500 border border-purple-100"
                        >
                          {o.orderId} (W{o.weekNumber})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveProductionView;
