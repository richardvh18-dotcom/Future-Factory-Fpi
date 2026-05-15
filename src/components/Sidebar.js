import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMessages } from "../hooks/useMessages";
import { updateUserLanguage } from '../services/planningSecurityService';
import { LayoutGrid, Package, Search, Calculator, Bot, Settings, LogOut, Mail, ShieldCheck, User, Factory, Filter, Globe, X, Check, Pin, PinOff, Printer, } from "lucide-react";
/**
 * Sidebar V5.0 - Responsive met mobiele drawer
 */
const Sidebar = ({ user, isAdmin, onLogout, onToggleCatalogFilters, isCatalogFiltersOpen, isMobileMenuOpen, onMobileMenuClose, }) => {
    const { t, i18n } = useTranslation();
    const { messages } = useMessages(user);
    const unreadCount = messages
        ? messages.filter((m) => !m.read && m.status !== 'read' && !m.archived).length
        : 0;
    const location = useLocation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [showLangMenu, setShowLangMenu] = useState(false);
    useEffect(() => {
        const styleId = 'global-text-selection-fix';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `* { -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default !important; }`;
            document.head.appendChild(style);
        }
        const handleContextMenu = (e) => e.stopPropagation();
        window.addEventListener('contextmenu', handleContextMenu, true);
        return () => window.removeEventListener('contextmenu', handleContextMenu, true);
    }, []);
    const handleLanguageSelect = async (lang) => {
        i18n.changeLanguage(lang);
        setShowLangMenu(false);
        if (user?.uid) {
            try {
                await updateUserLanguage(lang);
            }
            catch (error) {
                console.error("Kon taalvoorkeur niet opslaan:", error);
            }
        }
    };
    const navItems = [
        { path: "/", label: t('sidebar.nav.common.portal'), icon: LayoutGrid },
        { path: "/planning", label: t('sidebar.nav.common.planning'), icon: Factory },
        { path: "/products", label: t('sidebar.nav.common.catalog'), icon: Search },
        { path: "/messages", label: t('sidebar.nav.common.messages'), icon: Mail, badge: unreadCount },
        { path: "/inventory", label: t('sidebar.nav.common.inventory'), icon: Package, requiredModule: "inventory_management" },
        { path: "/assistant", label: t('sidebar.nav.common.ai_training'), icon: Bot, requiredModule: "ai_assistant" },
        { path: "/calculator", label: t('sidebar.nav.common.calculator'), icon: Calculator },
        { path: "/printer-queue", label: t('sidebar.nav.common.printers', 'Printers'), icon: Printer, requiredModule: "digital_planning" },
        { path: "/admin", label: t('sidebar.nav.common.admin'), icon: Settings, adminOnly: true },
    ];
    const visibleItems = navItems.filter((item) => {
        if (item.adminOnly && !isAdmin)
            return false;
        if (isAdmin)
            return true;
        if (!item.requiredModule)
            return true;
        const perms = user?.permissions || {};
        const modulePerms = perms[item.requiredModule] || [];
        if (modulePerms.length > 0)
            return true;
        if (user?.modules?.includes(item.requiredModule))
            return true;
        return false;
    });
    const expanded = isExpanded || !!isMobileMenuOpen || isPinned;
    const langOptions = [
        { code: 'nl', label: '🇳🇱 Nederlands' },
        { code: 'en', label: '🇬🇧 English' },
        { code: 'ar', label: '🇦🇪 العربية' },
        { code: 'de', label: '🇩🇪 Deutsch' },
    ];
    const langLabel = i18n.resolvedLanguage === 'nl' ? 'Nederlands'
        : i18n.resolvedLanguage === 'en' ? 'English'
            : i18n.resolvedLanguage === 'de' ? 'Deutsch'
                : 'العربية';
    return (_jsxs(_Fragment, { children: [isMobileMenuOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 z-[70] md:hidden", onClick: onMobileMenuClose })), _jsxs("aside", { className: `bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 z-[80] transition-all duration-300 ease-in-out ${isMobileMenuOpen
                    ? "fixed left-0 top-0 h-full w-64 flex shadow-2xl"
                    : "fixed -left-full md:flex md:left-0"} ${isExpanded || isPinned ? "md:w-64" : "md:w-16"}`, style: { top: "4rem", height: "calc(100vh - 4rem)", WebkitOverflowScrolling: 'touch' }, onMouseEnter: () => !isMobileMenuOpen && !isPinned && setIsExpanded(true), onMouseLeave: () => !isMobileMenuOpen && !isPinned && setIsExpanded(false), children: [isMobileMenuOpen && (_jsxs("div", { className: "md:hidden flex items-center justify-between p-4 border-b border-slate-800", children: [_jsx("h2", { className: "text-lg font-bold text-white", children: t('sidebar.menu', 'Menu') }), _jsx("button", { onClick: onMobileMenuClose, className: "p-2 hover:bg-slate-800 rounded-lg text-slate-400", children: _jsx(X, { size: 20 }) })] })), _jsx("nav", { className: "flex-1 px-2 pt-4 space-y-2 overflow-y-auto overflow-x-hidden", style: { WebkitOverflowScrolling: 'touch' }, children: visibleItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (_jsxs("div", { className: "flex flex-col gap-1", children: [_jsxs(NavLink, { to: item.path, onClick: () => isMobileMenuOpen && onMobileMenuClose?.(), className: ({ isActive: active }) => `flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 whitespace-nowrap relative ${active
                                            ? "bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20"
                                            : "hover:bg-slate-800 hover:text-white border border-transparent"} ${expanded ? "justify-start" : "justify-center"}`, children: [_jsxs("div", { className: "relative shrink-0", children: [_jsx(item.icon, { size: 20, strokeWidth: 2 }), (item.badge ?? 0) > 0 && (_jsx("span", { className: "absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-slate-900 animate-pulse", children: item.badge }))] }), _jsx("span", { className: `transition-all duration-300 ${expanded ? "opacity-100" : "opacity-0 w-0"}`, children: item.label })] }), item.path === "/products" && isActive && expanded && (_jsxs("button", { onClick: onToggleCatalogFilters, className: `mt-1 flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${isCatalogFiltersOpen
                                            ? "bg-blue-600 text-white border-blue-500 shadow-lg"
                                            : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"}`, children: [_jsx(Filter, { size: 12 }), " ", isCatalogFiltersOpen ? t('sidebar.filters_hide') : t('sidebar.filters_show')] }))] }, item.path));
                        }) }), _jsxs("div", { className: "p-2 border-t border-slate-800 relative", children: [_jsx("div", { className: "hidden md:flex justify-end px-2 mb-2", children: expanded && (_jsx("button", { onClick: () => { if (isPinned)
                                        setIsExpanded(true); setIsPinned(!isPinned); }, className: "text-slate-500 hover:text-white transition-colors p-1", title: isPinned ? "Unpin Sidebar" : "Pin Sidebar", children: isPinned ? _jsx(PinOff, { size: 14 }) : _jsx(Pin, { size: 14 }) })) }), showLangMenu && (_jsx("div", { className: `absolute bottom-full left-2 mb-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 ${!expanded ? 'left-14' : ''}`, children: langOptions.map(({ code, label }) => (_jsxs("button", { onClick: () => handleLanguageSelect(code), className: `w-full px-4 py-3 text-left text-xs font-bold flex items-center justify-between hover:bg-slate-700 ${i18n.resolvedLanguage === code ? 'text-blue-400' : 'text-slate-400'}`, children: [_jsx("span", { className: "flex items-center gap-2", children: label }), i18n.resolvedLanguage === code && _jsx(Check, { size: 14 })] }, code))) })), _jsxs("button", { onClick: () => setShowLangMenu(!showLangMenu), className: `w-full mb-2 flex items-center rounded-xl hover:bg-slate-800 hover:text-white transition-colors text-slate-400 border border-transparent hover:border-slate-700 ${expanded ? "px-4 py-3 justify-start gap-3" : "p-3 justify-center"}`, title: t('profile.prefs.language'), children: [_jsx(Globe, { size: 18 }), _jsx("span", { className: `font-medium transition-all duration-300 whitespace-nowrap overflow-hidden ${expanded ? "opacity-100" : "opacity-0 w-0"}`, children: langLabel })] }), _jsxs(NavLink, { to: "/profile", onClick: () => isMobileMenuOpen && onMobileMenuClose?.(), className: `w-full mb-2 rounded-xl text-xs font-bold border flex items-center transition-all duration-300 overflow-hidden ${expanded ? "px-3 py-2 gap-2" : "p-3 justify-center"} ${isAdmin ? "bg-blue-900/30 text-blue-400 border-blue-500/30" : "bg-slate-800 text-slate-400 border-slate-700"}`, children: [isAdmin ? _jsx(ShieldCheck, { size: 18 }) : _jsx(User, { size: 18 }), _jsx("span", { className: `truncate uppercase font-black tracking-widest ${expanded ? "opacity-100" : "opacity-0 w-0"}`, children: user?.name || user?.displayName?.split(" ")[0] || t('sidebar.nav.common.profile') })] }), _jsxs("button", { onClick: async () => {
                                    await onLogout();
                                    window.location.href = "/login";
                                    if (isMobileMenuOpen)
                                        onMobileMenuClose?.();
                                }, className: `w-full flex items-center rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors text-slate-400 ${expanded ? "px-4 py-3 justify-start gap-3" : "p-3 justify-center"}`, children: [_jsx(LogOut, { size: 18 }), _jsx("span", { className: `font-medium ${expanded ? "opacity-100" : "opacity-0 w-0"}`, children: t('sidebar.nav.common.logout') })] })] })] })] }));
};
export default Sidebar;
