import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Factory, X, Bot, Sparkles, Menu } from "lucide-react";

/**
 * Header - Donker Thema v2.3 - Responsive voor mobiel en tablet
 * Nu met AI Assistant integratie in zoekbalk
 */
const Header = ({ searchQuery, setSearchQuery, logoUrl, appName, onAIQuery, onMenuToggle }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isAIMode, setIsAIMode] = useState(false);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (isAIMode || searchQuery.startsWith('?')) {
        // AI mode - navigeer naar AI assistant met query
        const query = searchQuery.replace(/^\?/, '').trim();
        navigate('/assistant', { state: { initialQuery: query } });
        setSearchQuery('');
      }
    }
  };

  const toggleAIMode = () => {
    setIsAIMode(!isAIMode);
    if (!isAIMode && !searchQuery.startsWith('?')) {
      setSearchQuery('? ');
    } else if (isAIMode && searchQuery.startsWith('?')) {
      setSearchQuery(searchQuery.replace(/^\?\s*/, ''));
    }
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 md:px-6 shrink-0 z-50 shadow-lg">
      {/* Hamburger Menu voor mobiel/tablet */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-2 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
        aria-label="Menu"
      >
        <Menu size={24} />
      </button>

      {/* Linkerkant: Logo & Branding */}
      <div className="flex items-center gap-2 md:gap-4 md:min-w-[280px]">
        <div
          className="flex items-center gap-2 md:gap-3 cursor-pointer group"
          onClick={() => navigate("/")}
        >
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={appName || "Logo"} 
              className="h-8 w-8 md:h-10 md:w-10 object-contain"
            />
          ) : (
            <div className="p-2 md:p-2.5 bg-blue-600 text-white rounded-xl shadow-lg group-hover:bg-blue-500 transition-colors shadow-blue-900/20">
              <Factory size={18} className="md:hidden" />
              <Factory size={22} className="hidden md:block" />
            </div>
          )}
          <div className="text-left">
            <h1 className="text-base md:text-xl font-black uppercase italic tracking-tighter leading-none text-white">
              {appName || (
                <>Future <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-orange-400">Factory</span></>
              )}
            </h1>
            <p className="hidden sm:block text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1.5">
              {t('header.branding_sub')}
            </p>
          </div>
        </div>
      </div>

      {/* Midden: Centrale Zoekbalk met AI Integratie */}
      <div className="flex-1 max-w-2xl px-2 md:px-4">
        <div className="relative group">
          <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isAIMode || searchQuery.startsWith('?') ? (
              <Sparkles
                className="text-purple-400 animate-pulse"
                size={16}
              />
            ) : (
              <Search
                className="text-slate-500 group-focus-within:text-blue-400 transition-colors"
                size={16}
              />
            )}
          </div>
          <input
            type="text"
            placeholder={
              isAIMode || searchQuery.startsWith('?') 
                ? "Vraag AI..."
                : t('header.search_placeholder')
            }
            className={`w-full border rounded-2xl py-2 md:py-2.5 pl-10 md:pl-12 pr-20 md:pr-24 text-xs md:text-sm font-medium outline-none transition-all placeholder:text-slate-600 ${
              isAIMode || searchQuery.startsWith('?')
                ? 'bg-purple-900/20 border-purple-500/50 text-purple-100 focus:bg-purple-900/30 focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10'
                : 'bg-white/5 border-slate-700 text-slate-200 focus:bg-white/10 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5'
            }`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={toggleAIMode}
              className={`p-1.5 rounded-lg transition-all ${
                isAIMode || searchQuery.startsWith('?')
                  ? 'bg-purple-500 text-white'
                  : 'hover:bg-white/10 text-slate-500'
              }`}
              title="AI Assistent activeren"
            >
              <Bot size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Rechterkant: Systeem status (verborgen op kleine schermen) */}
      <div className="hidden lg:flex min-w-[280px] justify-end">
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
