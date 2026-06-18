import React from "react";
import i18n from "i18next";
import {
  Package,
  FileText,
  Target,
  Layers,
  Database,
  ChevronRight,
  ShieldCheck,
  Hash,
} from "lucide-react";

/**
 * SpecsView V3.0 - Blueprints Overview
 * Toont een visueel overzicht van alle technische templates die zijn opgeslagen in de root.
 * Helpt Engineers om snel te valideren welke variabelen (zoals TW, L, B1) actief zijn per type.
 */
type BlueprintEntry = {
  fields?: string[];
  [key: string]: unknown;
};

type SpecsViewProps = {
  blueprints?: Record<string, BlueprintEntry>;
};

const SpecsView = ({ blueprints = {} }: SpecsViewProps) => {
  // Sorteer de blueprints: Boringen eerst, daarna de rest
  const sortedEntries = Object.entries(blueprints).sort(([keyA], [keyB]) => {
    if (keyA.startsWith("BORE_") && !keyB.startsWith("BORE_")) return -1;
    if (!keyA.startsWith("BORE_") && keyB.startsWith("BORE_")) return 1;
    return keyA.localeCompare(keyB);
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      {/* Introductie Banner */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <FileText size={120} />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="p-4 bg-orange-500 text-white rounded-3xl shadow-lg shadow-orange-200">
            <Package size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">
              {i18n.t("specs.technical", "Technical")} <span className="text-orange-500">{i18n.t("specs.inventory", "Inventory")}</span>
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <ShieldCheck size={12} className="text-emerald-500" /> Overzicht
              van alle geactiveerde Blueprints
            </p>
          </div>
        </div>
        <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 text-right shrink-0">
          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
            Totaal Templates
          </span>
          <span className="text-xl font-black text-slate-800 italic">
            {sortedEntries.length} Records
          </span>
        </div>
      </div>

      {/* Grid van Blueprint Kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedEntries.length > 0 ? (
          sortedEntries.map(([key, bp]) => {
            const isBore = key.startsWith("BORE_");
            return (
              <div
                key={key}
                className="bg-white rounded-[35px] border-2 border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all group overflow-hidden flex flex-col"
              >
                {/* Kaart Header */}
                <div
                  className={`p-6 flex justify-between items-start border-b ${
                    isBore
                      ? "bg-blue-50/50 border-blue-100"
                      : "bg-slate-50/50 border-slate-100"
                  }`}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2 mb-2">
                      {isBore ? (
                        <Target size={14} className="text-blue-600" />
                      ) : (
                        <Layers size={14} className="text-purple-600" />
                      )}
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] italic">
                        {isBore ? "Boring Template" : "Fitting Template"}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-lg tracking-tighter uppercase italic leading-none">
                      {key.replace("BORE_", "")}
                    </h4>
                  </div>
                </div>

                {/* Kaart Body (Variabelen) */}
                <div className="p-6 flex-1 space-y-4">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-2 ml-1">
                      Database Key
                    </p>
                    <code className="text-[10px] font-mono font-bold text-blue-600 break-all">
                      {key}
                    </code>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Hash size={10} /> Actieve Variabelen (
                      {bp.fields?.length || 0})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {bp.fields && bp.fields.length > 0 ? (
                        bp.fields.map((f) => (
                          <span
                            key={f}
                            className="px-2.5 py-1.5 bg-white text-slate-700 text-[10px] font-black rounded-lg border border-slate-200 shadow-sm group-hover:border-blue-200 transition-colors uppercase italic"
                          >
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-300 italic py-2 uppercase">
                          Geen velden gekoppeld
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Kaart Footer */}
                <div className="px-6 py-4 bg-slate-50/30 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 opacity-40">
                    <Database size={10} />
                    <span className="text-[8px] font-black uppercase tracking-tighter">
                      Sync Mode: Root
                    </span>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-slate-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-24 text-center bg-white rounded-[50px] border-2 border-dashed border-slate-200 opacity-50 flex flex-col items-center">
            <Database size={64} className="text-slate-300 mb-4" />
            <p className="font-black uppercase tracking-[0.3em] text-xs text-slate-400">
              Geen technische specificaties gevonden in de root
            </p>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="p-8 bg-slate-900 rounded-[40px] border border-white/5 shadow-2xl relative overflow-hidden text-white flex items-start gap-6">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <Database size={100} />
        </div>
        <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shrink-0">
          <Database size={20} />
        </div>
        <div className="text-left space-y-2 relative z-10">
          <h4 className="text-xs font-black uppercase text-blue-400 tracking-widest italic leading-none">
            Status Rapportage
          </h4>
          <p className="text-[11px] text-slate-400 font-bold uppercase leading-relaxed tracking-wider opacity-80 max-w-3xl">
            Deze tabel synchroniseert real-time met{" "}
            <strong>/future-factory/settings/blueprint_configs/main</strong>.
            Blauwdrukken die hier verschijnen worden automatisch gebruikt door
            de <strong>{i18n.t("specs.dimensioning", "Maatvoering")}</strong> module om invoervelden te genereren.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SpecsView;
