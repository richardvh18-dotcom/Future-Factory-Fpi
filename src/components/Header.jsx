import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Factory, X } from "lucide-react";

/**
 * Header - Donker Thema v2.1
 * Aangepast naar Slate-900 om overeen te komen met de Sidebar.
 * De merknaam "Future Factory" is vergroot voor een krachtigere uitstraling.
 */
const Header = ({ searchQuery, setSearchQuery, logoUrl, appName }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-50 shadow-lg">
      {/* Linkerkant: Logo & Branding (Vergroot) */}
      <div className="flex items-center gap-4 min-w-[280px]">
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => navigate("/")}
        >
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg group-hover:bg-blue-500 transition-colors shadow-blue-900/20">
            <Factory size={22} />
          </div>
          <div className="text-left hidden sm:block">
            {/* Tekst vergroot van text-sm naar text-xl */}
            <h1 className="text-xl font-black uppercase italic tracking-tighter leading-none text-white">
              Future <span className="text-blue-500">Factory</span>
            </h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1.5">
              {t('header.branding_sub')}
            </p>
          </div>
        </div>
      </div>

      {/* Midden: Centrale Zoekbalk */}
      <div className="flex-1 max-w-2xl px-4">
        <div className="relative group">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder={t('header.search_placeholder')}
            className="w-full bg-white/5 border border-slate-700 rounded-2xl py-2.5 pl-12 pr-10 text-sm font-medium text-slate-200 outline-none focus:bg-white/10 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-600"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Rechterkant: Systeem status */}
      <div className="min-w-[280px] flex justify-end">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic select-none">
            {t('header.system_status')}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
