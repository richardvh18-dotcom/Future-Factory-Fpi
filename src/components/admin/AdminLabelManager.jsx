import React, { useState } from "react";
import { useTranslation } from 'react-i18next';
import { BoxSelect, PenTool, Settings } from "lucide-react";
import AdminLabelDesigner from "./AdminLabelDesigner";
import AdminLabelLogic from "./AdminLabelLogic";

const AdminLabelManager = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("designer");

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
            <BoxSelect size={20} />
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase italic hidden sm:block">
            {t('common.label')} <span className="text-orange-600">{t('common.manager')}</span>
          </h1>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("designer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === "designer"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <PenTool size={14} /> <span className="hidden sm:inline">{t('common.designer')}</span>
          </button>
          <button
            onClick={() => setActiveTab("logic")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === "logic"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings size={14} /> <span className="hidden sm:inline">{t('common.logic')}</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "designer" && (
          <AdminLabelDesigner onBack={() => onNavigate && onNavigate(null)} />
        )}
        {activeTab === "logic" && (
          <div className="h-full overflow-hidden">
             <AdminLabelLogic />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLabelManager;