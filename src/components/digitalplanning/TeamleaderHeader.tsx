import React from "react";
import { ArrowLeft, FileSpreadsheet, BrainCircuit, Menu, X, RefreshCw } from "lucide-react";

type Translator = (key: string, defaultValue?: string) => string;

type TeamleaderHeaderProps = {
  onBack?: () => void;
  onExit?: () => void;
  fixedScope?: string;
  departmentName?: string;
  title?: string;
  departmentFilter?: string;
  setDepartmentFilter: (value: string) => void;
  activeTab?: string;
  setActiveTab: (value: string) => void;
  canManageOverproduction?: boolean;
  overproductionGroups?: unknown[];
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;
  showAiPrediction?: boolean;
  setShowAiPrediction: (show: boolean) => void;
  isSyncingDrawings?: boolean;
  handleDrawingSync: () => void;
  t: Translator;
};

/**
 * TeamleaderHeader
 *
 * Renders the sticky top navigation bar for TeamleaderHub:
 *   - Back button
 *   - Department filter (central planner / all scope only)
 *   - Title + department name
 *   - Desktop navigation tabs
 *   - Desktop action buttons (AI, drawing sync)
 *   - Mobile hamburger menu with navigation + actions
 */
export const TeamleaderHeader = ({
  onBack,
  onExit,
  fixedScope,
  departmentName,
  title,
  departmentFilter,
  setDepartmentFilter,
  activeTab,
  setActiveTab,
  canManageOverproduction,
  overproductionGroups,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  showAiPrediction,
  setShowAiPrediction,
  isSyncingDrawings,
  handleDrawingSync,
  t,
}: TeamleaderHeaderProps) => {
  const groups = overproductionGroups || [];
  const mobileMenuOpen = Boolean(isMobileMenuOpen);
  const currentTab = activeTab || "";
  const isSyncing = Boolean(isSyncingDrawings);
  const showAi = Boolean(showAiPrediction);

  return (
    <div className="bg-white border-b border-slate-200 shrink-0 z-40 shadow-sm px-4 sm:px-6 py-3">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-4 w-full lg:flex-1">
          <button
            onClick={onBack || onExit}
            className="p-2 sm:p-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl transition-all active:scale-90 shrink-0"
          >
            <ArrowLeft size={24} />
          </button>

          {fixedScope === "all" && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-100 border-none text-slate-700 text-sm rounded-xl focus:ring-blue-500 block p-2.5 font-bold outline-none cursor-pointer hover:bg-slate-200 transition-colors"
            >
              <option value="ALL">{t("teamleader.all_departments", "All Departments")}</option>
              <option value="FITTINGS">{t("teamleader.department_fittings", "Fittings")}</option>
              <option value="PIPES">{t("teamleader.department_pipes", "Pipes")}</option>
              <option value="SPOOLS">{t("teamleader.department_spools", "Spools")}</option>
            </select>
          )}

          <div className="text-left">
            <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none whitespace-nowrap">
              {title}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate">
              {departmentName} {t("teamleader.dashboard", "Dashboard")}
            </p>
          </div>
        </div>

        <div className="hidden lg:flex bg-slate-100 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar shrink-0 justify-center">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${currentTab === "dashboard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("teamleader.tab_dashboard", "Dashboard")}
          </button>
          <button
            onClick={() => setActiveTab("planning")}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${currentTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <span>{t("teamleader.tab_full_list", "Volledige Lijst")}</span>
            {canManageOverproduction && groups.length > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm animate-pulse">
                {groups.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("bezetting")}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${currentTab === "bezetting" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("teamleader.tab_personnel", "Personeel")}
          </button>
          <button
            onClick={() => setActiveTab("efficiency")}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${currentTab === "efficiency" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t("teamleader.tab_efficiency", "Efficiëntie")}
          </button>
          <button
            onClick={() => setActiveTab("import_export")}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${currentTab === "import_export" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <FileSpreadsheet size={14} />
            <span className="hidden sm:inline">Import / Export</span>
            <span className="sm:hidden">Data</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 w-full lg:flex-1 justify-end">
          {currentTab === "efficiency" && (
            <button
              onClick={() => setShowAiPrediction(!showAi)}
              className={`px-4 py-2 ${showAi ? "bg-purple-700" : "bg-purple-600"} text-white rounded-xl shadow-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap hover:bg-purple-700`}
            >
              <BrainCircuit size={16} />
              <span className="hidden sm:inline">{t("teamleader.ai_analysis", "AI Analyse")}</span>
            </button>
          )}
          <button
            onClick={handleDrawingSync}
            disabled={isSyncing}
            className="p-2 bg-white border border-slate-200 text-purple-600 rounded-xl shadow-sm hover:bg-purple-50 transition-all disabled:opacity-50"
            title={t("teamleader.sync_drawings", "Sync tekeningen")}
          >
            <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="lg:hidden relative">
          <button
            onClick={() => setIsMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-gray-100 rounded-lg text-gray-600 active:bg-gray-200"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">
                {t("teamleader.navigation", "Navigatie")}
              </div>
              <button
                onClick={() => {
                  setActiveTab("dashboard");
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${currentTab === "dashboard" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
              >
                {t("teamleader.tab_dashboard", "Dashboard")}
              </button>
              <button
                onClick={() => {
                  setActiveTab("planning");
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full flex items-center justify-between ${currentTab === "planning" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
              >
                <span>{t("teamleader.tab_full_list", "Volledige Lijst")}</span>
                {canManageOverproduction && groups.length > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                    {groups.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("bezetting");
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${currentTab === "bezetting" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
              >
                {t("teamleader.tab_personnel", "Personeel")}
              </button>
              <button
                onClick={() => {
                  setActiveTab("efficiency");
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full ${currentTab === "efficiency" ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
              >
                {t("teamleader.tab_efficiency", "Efficiëntie")}
              </button>
              <button
                onClick={() => {
                  setActiveTab("import_export");
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full flex items-center gap-2 ${currentTab === "import_export" ? "bg-emerald-50 text-emerald-600" : "text-gray-500"}`}
              >
                <FileSpreadsheet size={16} /> Import / Export
              </button>

              <div className="h-px bg-slate-100 my-1"></div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1">
                {t("teamleader.actions", "Acties")}
              </div>

              {currentTab === "efficiency" && (
                <button
                  onClick={() => {
                    setShowAiPrediction(!showAi);
                    setIsMobileMenuOpen(false);
                  }}
                  className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-purple-600 hover:bg-purple-50 flex items-center gap-2"
                >
                  <BrainCircuit size={16} /> {t("teamleader.ai_analysis", "AI Analyse")}
                </button>
              )}
              <button
                onClick={() => {
                  handleDrawingSync();
                  setIsMobileMenuOpen(false);
                }}
                disabled={isSyncing}
                className="px-4 py-3 rounded-lg text-xs font-black uppercase text-left w-full text-purple-600 hover:bg-purple-50 flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                {t("teamleader.sync_drawings", "Sync tekeningen")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
