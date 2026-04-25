import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Download, Upload, Database, FileText, ArrowRight, Plus } from "lucide-react";
import PlanningImportModal from "./modals/PlanningImportModal";

const ImportExportDashboard = ({ currentDepartment, onCreateOrder }) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState("import"); // 'import', 'export'
  const [showLegacyModal, setShowLegacyModal] = useState(false);

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="p-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">
            Import <span className="text-emerald-600">& Export</span>
          </h2>
          <p className="text-sm text-slate-500 font-bold mt-1">
            Data-uitwisseling voor de werkvloer en systemen
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveSection("import")}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeSection === "import" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Upload size={16} /> Importeren
          </button>
          <button
            onClick={() => setActiveSection("export")}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeSection === "export" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Download size={16} /> Exporteren
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto">
          {activeSection === "import" ? (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm">
                 <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2">
                   <FileSpreadsheet className="text-emerald-600" /> Excel Import (Infor LN)
                 </h3>
                 <p className="text-sm text-slate-500 mb-6">
                   Upload de actuele productieplanning vanuit Excel om de digitale werkvloer te voeden.
                 </p>

                 <div className="mb-6 flex justify-end">
                   <button
                     onClick={() => onCreateOrder?.()}
                     className="px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap hover:bg-emerald-700"
                   >
                     <Plus size={16} /> {t('teamleader.new_order', 'Nieuwe Order')}
                   </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                     <h4 className="font-bold text-emerald-900 text-sm mb-2">Hybride Transitie</h4>
                     <p className="text-xs text-emerald-700 mb-6">
                       We zitten momenteel in een hybride fase. Je kunt handmatig data inladen voor machines die al digitaal zijn.
                     </p>
                     <button 
                       onClick={() => setShowLegacyModal(true)}
                       className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                     >
                       <Upload size={18} /> Start Import Flow
                     </button>
                   </div>

                   <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center opacity-60">
                     <Database size={32} className="text-slate-400 mb-3" />
                     <h4 className="font-bold text-slate-700 text-sm mb-1">Automatische Sync</h4>
                     <p className="text-xs text-slate-500">
                       Binnenkort beschikbaar via directe API koppeling met LN.
                     </p>
                   </div>
                 </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[30px] border border-slate-200 shadow-sm">
                 <h3 className="text-lg font-black uppercase text-slate-800 flex items-center gap-3 mb-2">
                   <Database className="text-blue-600" /> Werkvloer Exports
                 </h3>
                 <p className="text-sm text-slate-500 mb-6">
                   Genereer overzichten voor controle, administratie of machines die nog op papier werken.
                 </p>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group">
                     <div className="flex justify-between items-start mb-4">
                       <FileText size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">Actuele To Do Lijst</h4>
                     <p className="text-[10px] text-slate-500 font-medium">Lijst van alle nog niet gestarte orders binnen jouw afdeling</p>
                   </button>

                   <button className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group">
                     <div className="flex justify-between items-start mb-4">
                       <FileSpreadsheet size={24} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                       <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" />
                     </div>
                     <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-1">Gereed voor LN</h4>
                     <p className="text-[10px] text-slate-500 font-medium">Export van gereedgemelde producten om terug te boeken in ERP</p>
                   </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showLegacyModal && (
        <PlanningImportModal
          isOpen={true}
          onClose={() => setShowLegacyModal(false)}
          currentDepartment={currentDepartment}
        />
      )}
    </div>
  );
};

export default ImportExportDashboard;