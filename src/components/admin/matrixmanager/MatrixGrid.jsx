import React from "react";
import {
  Plus,
  LayoutGrid,
  ChevronRight,
  Settings2,
} from "lucide-react";

/**
 * MatrixGrid V3.0 - Professional Grid Editor
 * Een herbruikbare component voor het bewerken van tabel-gebaseerde data.
 * Gestyled conform de Future Factory MES Core richtlijnen.
 */
const MatrixGrid = ({
  rows = [],
  columns = [],
  values = {},
  onUpdateRowLabel,
  onUpdateColLabel,
  onValueChange,
  onAddRow,
  onAddColumn,
}) => {
  return (
    <div className="w-full bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500 text-left">
      {/* Grid Controls Header */}
      <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg">
            <LayoutGrid size={20} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-800 uppercase italic tracking-widest leading-none">
              Matrix Editor
            </h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
              Configureer rijen en kolommen
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAddRow}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 hover:border-blue-400 transition-all flex items-center gap-2 shadow-sm active:scale-95"
          >
            <Plus size={14} className="text-blue-500" /> + Rij
          </button>
          <button
            onClick={onAddColumn}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 hover:border-blue-400 transition-all flex items-center gap-2 shadow-sm active:scale-95"
          >
            <Plus size={14} className="text-blue-500" /> + Kolom
          </button>
        </div>
      </div>

      {/* Scrollbare Matrix Area */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50/30">
              <th className="p-6 border-b border-r border-slate-100 w-48 bg-slate-50/80 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase italic">
                  <Settings2 size={14} /> Definitie
                </div>
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="p-4 border-b border-slate-100 min-w-[140px] transition-colors hover:bg-blue-50/30"
                >
                  <div className="relative group">
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => onUpdateColLabel(col.id, e.target.value)}
                      placeholder="Kolom kop..."
                      className="w-full bg-transparent border-none text-center text-xs font-black text-slate-800 uppercase tracking-widest outline-none placeholder:text-slate-300"
                    />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-500 scale-x-0 group-focus-within:scale-x-100 transition-transform" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group transition-colors hover:bg-slate-50/30"
              >
                {/* Rij Label (Sticky) */}
                <td className="p-4 border-r border-slate-100 bg-white sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] group-hover:bg-slate-50 transition-colors">
                  <div className="relative flex items-center gap-2">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => onUpdateRowLabel(row.id, e.target.value)}
                      placeholder="Rij naam..."
                      className="w-full bg-transparent border-none text-sm font-black text-slate-700 italic outline-none placeholder:text-slate-300"
                    />
                    <ChevronRight
                      size={12}
                      className="text-slate-200 group-hover:text-blue-400 transition-colors"
                    />
                  </div>
                </td>

                {/* Data Cellen */}
                {columns.map((col) => {
                  const cellKey = `${row.id}_${col.id}`;
                  return (
                    <td
                      key={cellKey}
                      className="p-0 border-r border-slate-50 last:border-r-0"
                    >
                      <input
                        type="text"
                        value={values[cellKey] || ""}
                        onChange={(e) =>
                          onValueChange(row.id, col.id, e.target.value)
                        }
                        className="w-full h-full p-4 bg-transparent text-center text-xs font-bold text-slate-600 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:opacity-20"
                        placeholder="-"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State Fallback */}
      {rows.length === 0 && (
        <div className="p-20 text-center flex flex-col items-center justify-center opacity-30 italic">
          <LayoutGrid size={48} className="mb-4 text-slate-300" />
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">
            Voeg rijen toe om te beginnen
          </p>
        </div>
      )}

      {/* Footer Legend */}
      <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm animate-pulse"></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter italic">
            Live Sync Active
          </span>
        </div>
        <div className="h-3 w-px bg-slate-200"></div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
          Klik op labels of cellen om direct aanpassingen door te voeren.
        </p>
      </div>
    </div>
  );
};

export default MatrixGrid;
