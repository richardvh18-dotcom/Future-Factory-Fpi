import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMessages } from "../hooks/useMessages";
import {
  LayoutGrid,
  Package,
  Search,
  Calculator,
  Bot,
  Settings,
  LogOut,
  Mail,
  ShieldCheck,
  User,
  Factory,
  Filter,
  Globe,
} from "lucide-react";

/**
 * Sidebar V4.0 - Herstelde layout met dynamische badges en gebruikersnaam.
 */
const Sidebar = ({
  user,
  isAdmin,
  onLogout,
  onToggleCatalogFilters,
  isCatalogFiltersOpen,
}) => {
  const { t, i18n } = useTranslation();
  const { messages } = useMessages(user);
  const unreadCount = messages
    ? messages.filter((m) => !m.read && !m.archived).length
    : 0;
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'nl' : 'en';
    i18n.changeLanguage(newLang);
  };

  const navItems = [
    { path: "/", label: t('sidebar.nav.common.portal'), icon: LayoutGrid },
    { path: "/planning", label: t('sidebar.nav.common.planning'), icon: Factory },
    { path: "/products", label: t('sidebar.nav.common.catalog'), icon: Search },
    { path: "/inventory", label: t('sidebar.nav.common.inventory'), icon: Package },
    { path: "/assistant", label: t('sidebar.nav.common.ai_training'), icon: Bot },
    { path: "/calculator", label: t('sidebar.nav.common.calculator'), icon: Calculator },
    { path: "/messages", label: t('sidebar.nav.common.messages'), icon: Mail, badge: unreadCount },
    { path: "/admin", label: t('sidebar.nav.common.admin'), icon: Settings, adminOnly: true },
  ];

  const visibleItems = navItems.filter((item) =>
    item.adminOnly ? isAdmin : true
  );

  return (
    <aside
      className={`bg-slate-900 text-slate-300 flex flex-col fixed left-0 border-r border-slate-800 z-[60] hidden md:flex transition-all duration-300 ease-in-out ${
        isExpanded ? "w-64" : "w-16"
      }`}
      style={{ top: "4rem", height: "calc(100vh - 4rem)" }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <nav className="flex-1 px-2 pt-4 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <div key={item.path} className="flex flex-col gap-1">
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 whitespace-nowrap relative ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20"
                      : "hover:bg-slate-800 hover:text-white border border-transparent"
                  } ${isExpanded ? "justify-start" : "justify-center"}`
                }
              >
                <div className="relative shrink-0">
                  <item.icon size={20} strokeWidth={2} />
                  {item.badge > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-slate-900 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`transition-all duration-300 ${
                    isExpanded ? "opacity-100" : "opacity-0 w-0"
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>

              {/* Speciale filters voor de catalogus pagina */}
              {item.path === "/products" && isActive && isExpanded && (
                <button
                  onClick={onToggleCatalogFilters}
                  className={`mt-1 flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                    isCatalogFiltersOpen
                      ? "bg-blue-600 text-white border-blue-500 shadow-lg"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  <Filter size={12} />{" "}
                  {isCatalogFiltersOpen ? t('sidebar.filters_hide') : t('sidebar.filters_show')}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-2 border-t border-slate-800">
        <button
          onClick={toggleLanguage}
          className={`w-full mb-2 flex items-center gap-3 rounded-xl hover:bg-slate-800 hover:text-white transition-colors text-slate-400 border border-transparent hover:border-slate-700 ${
            isExpanded ? "px-4 py-3 justify-start" : "p-3 justify-center"
          }`}
          title={t('profile.prefs.language')}
        >
          <Globe size={18} />
          <span
            className={`font-medium transition-all duration-300 whitespace-nowrap overflow-hidden ${
              isExpanded ? "opacity-100" : "opacity-0 w-0"
            }`}
          >
            {i18n.language === "en" ? t('profile.prefs.lang_nl') : t('profile.prefs.lang_en')}
          </span>
        </button>

        <NavLink
          to="/profile"
          className={`w-full mb-2 rounded-lg text-xs font-bold border flex items-center transition-all duration-300 overflow-hidden ${
            isExpanded ? "px-3 py-2 gap-2" : "p-2 justify-center"
          } ${
            isAdmin
              ? "bg-blue-900/30 text-blue-400 border-blue-500/30"
              : "bg-slate-800 text-slate-400 border-slate-700"
          }`}
        >
          {isAdmin ? <ShieldCheck size={14} /> : <User size={14} />}
          <span
            className={`truncate uppercase font-black tracking-widest ${
              isExpanded ? "opacity-100" : "opacity-0 w-0"
            }`}
          >
            {user?.name || user?.displayName?.split(" ")[0] || t('sidebar.nav.common.profile')}
          </span>
        </NavLink>
        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors text-slate-400 ${
            isExpanded ? "px-4 py-3 justify-start" : "p-3 justify-center"
          }`}
        >
          <LogOut size={18} />
          <span
            className={`font-medium ${
              isExpanded ? "opacity-100" : "opacity-0 w-0"
            }`}
          >
            {t('sidebar.nav.common.logout')}
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
