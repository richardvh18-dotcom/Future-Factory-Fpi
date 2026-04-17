import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Activity, RotateCcw, Ruler, Info } from "lucide-react";
import {
  STANDARD_DIAMETERS,
  STANDARD_PRESSURES,
  ALL_PRODUCT_TYPES,
  CONNECTION_TYPES,
} from "../data/constants";
// Importeer de rekenlogica
import { calculateZDimension } from "../utils/calculations";

/**
 * CalculatorView.js - FPI Emerald Theme
 * Z-Maat Calculator voor Assembly Engineering.
 * Refactored: Logica verplaatst naar utils/calculations.js
 */
const CalculatorView = ({ bellDimensions, standardFittingDims }) => {
  const [state, setState] = useState({
    type: "Elbow",
    pressure: "16",
    diameter: "200",
    connection: "TB/TB",
  });
  const [result, setResult] = useState(null);

  useEffect(() => {
    // Roep de externe rekenfunctie aan
    const calcResult = calculateZDimension(
      state.diameter,
      state.pressure,
      state.type,
      state.connection,
      standardFittingDims,
      bellDimensions
    );

    setResult(calcResult);
  }, [state, bellDimensions, standardFittingDims]);

  const handleChange = (field, value) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full bg-slate-50 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* LEFT PANEL: Inputs */}
          <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl border border-white/50 flex flex-col gap-8">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
              <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600 shadow-sm">
                <Activity size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  {t('calculator.zmaat', 'Z-Maat')}
                </h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t('calculator.calculator', 'Calculator')}
                </p>
              </div>
            </div>

            <div className="space-y-6 flex-1">
              {/* Type Select */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                  {t('calculator.type_fitting', 'Type Fitting')}
                </label>
                <div className="relative group">
                  <select
                    value={state.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    className="w-full appearance-none bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-700 font-bold text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none cursor-pointer hover:border-emerald-200"
                  >
                    {ALL_PRODUCT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-emerald-500 transition-colors">
                    <Info size={18} />
                  </div>
                </div>
              </div>

              {/* Connection Select */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                  {t('calculator.connection', 'Verbinding')}
                </label>
                <div className="relative group">
                  <select
                    value={state.connection}
                    onChange={(e) => handleChange("connection", e.target.value)}
                    className="w-full appearance-none bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-700 font-bold text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none cursor-pointer hover:border-emerald-200"
                  >
                    {CONNECTION_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-emerald-500 transition-colors">
                    <RotateCcw size={18} />
                  </div>
                </div>
              </div>

              {/* Grid for PN & DN */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                    {t('calculator.pressure', 'Druk (PN)')}
                  </label>
                  <select
                    value={state.pressure}
                    onChange={(e) => handleChange("pressure", e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-slate-700 font-bold text-sm focus:border-emerald-500 outline-none cursor-pointer hover:border-emerald-200 transition-colors"
                  >
                    {STANDARD_PRESSURES.map((p) => (
                      <option key={p} value={p}>
                        PN {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">
                    {t('calculator.diameter', 'Diameter (DN)')}
                  </label>
                  <select
                    value={state.diameter}
                    onChange={(e) => handleChange("diameter", e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-slate-700 font-bold text-sm focus:border-emerald-500 outline-none cursor-pointer hover:border-emerald-200 transition-colors"
                  >
                    {STANDARD_DIAMETERS.map((d) => (
                      <option key={d} value={d}>
                        DN {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Results */}
          <div className="lg:col-span-7 bg-slate-900 rounded-[2rem] p-10 text-white shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500 via-transparent to-transparent"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2 opacity-50">
                <Ruler size={20} />
                <span className="text-xs font-black uppercase tracking-[0.2em]">
                  {t('calculator.result', 'Resultaat')}
                </span>
              </div>
              <h3 className="text-3xl font-bold text-white mb-1">
                {state.type}{" "}
                <span className="text-emerald-400">DN{state.diameter}</span>
              </h3>
              <p className="text-slate-400 text-sm font-medium">
                {t('calculator.configuration', 'Configuratie')}: {state.connection} • PN{state.pressure}
              </p>
            </div>

            {!result ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30 gap-4">
                <Info size={48} />
                <p className="text-sm font-bold uppercase tracking-widest">
                  {t('calculator.no_data', 'Geen data beschikbaar')}
                </p>
              </div>
            ) : (
              <div className="relative z-10 mt-8 space-y-8">
                <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/10">
                  <span className="block text-center text-emerald-400 text-xs font-black uppercase tracking-widest mb-2">
                    {t('calculator.calculated_zmaat', 'Berekende Z-Maat')}
                  </span>
                  <div className="flex items-baseline justify-center gap-4">
                    <span className="text-[100px] font-black tracking-tighter italic leading-none text-white">
                      {result?.zMaat}
                    </span>
                    <span className="text-2xl font-bold text-emerald-500 uppercase italic">
                      {t('calculator.mm', 'mm')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6 bg-white/5 p-8 rounded-[2rem] border border-white/10 font-mono text-sm shadow-inner">
                  <div className="flex flex-col gap-1 border-r border-white/10 pr-6 text-left">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider">
                      {t('calculator.total_length', 'Totale Lengte (L)')}
                    </span>
                    <span className="text-xl font-bold">{result?.L} {t('calculator.mm', 'mm')}</span>
                  </div>
                  <div className="flex flex-col gap-1 pl-6 text-left">
                    <span className="text-[9px] text-emerald-500 font-black uppercase tracking-wider">
                      {t('calculator.insertion_depth', 'Insteekdiepte (B1)')}
                    </span>
                    <span className="text-xl font-bold text-emerald-400">
                      {result?.B1} {t('calculator.mm', 'mm')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculatorView;
