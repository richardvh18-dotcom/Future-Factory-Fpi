import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import React, { useState, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Package, Database, Users, Settings, Grid, Factory, ArrowRight, ShieldAlert, ArrowLeft, Loader2, ArrowRightLeft, UserCheck, Layout, DatabaseZap, Settings2, History, BoxSelect, BrainCircuit, BookOpen, ShieldCheck, TrendingUp, Kanban, GitBranch, Bell, Zap, Clock, Smartphone, Beaker, ChevronDown, Printer, BarChart3, FileText, QrCode, Mail, } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
// --- LAZY LOAD IMPORTS ---
const RoadmapViewer = React.lazy(() => import("./RoadmapViewer"));
const ProjectStructureExpertView = React.lazy(() => import("./ProjectStructureExpertView"));
const AdminEmailManager = React.lazy(() => import("./AdminEmailManager"));
const AdminProductManager = React.lazy(() => import("./AdminProductManager"));
const FactoryStructureManager = React.lazy(() => import("./FactoryStructureManager"));
const ConversionManager = React.lazy(() => import("./ConversionManager"));
const PersonnelManager = React.lazy(() => import("./PersonnelManager"));
const AdminMatrixManager = React.lazy(() => import("./matrixmanager/AdminMatrixManager"));
const AdminBadgeGenerator = React.lazy(() => import("./AdminBadgeGenerator"));
const AdminUsersView = React.lazy(() => import("./AdminUsersView"));
const AdminPrinterManager = React.lazy(() => import("./AdminPrinterManager"));
const AdminMessagesManagement = React.lazy(() => import("./AdminMessagesManagement"));
const AdminDatabaseView = React.lazy(() => import("./AdminDatabaseView"));
const AdminLogView = React.lazy(() => import("./AdminLogView"));
const AdminSettingsView = React.lazy(() => import("./AdminSettingsView"));
const ProductionTimeStandardsManager = React.lazy(() => import("./ProductionTimeStandardsManager"));
const CapacityPlanningView = React.lazy(() => import("../planning/CapacityPlanningView"));
const AiCenterView = React.lazy(() => import("../ai/AiCenterView"));
const AdminLabelManager = React.lazy(() => import("./AdminLabelManager"));
const AdminToolingMoldsView = React.lazy(() => import("./AdminToolingMoldsView"));
const PilotMigrationTool = React.lazy(() => import("./PilotMigrationTool"));
// NIEUW: Referentie Tabel toevoegen
const AdminReferenceTable = React.lazy(() => import("./AdminReferenceTable"));
// NIEUW: Monday.com/vPlan-style Planning Views
const KanbanBoardView = React.lazy(() => import("../planning/KanbanBoardView"));
// Fase 2: Advanced Planning Features
const OrderDependenciesView = React.lazy(() => import("../planning/OrderDependenciesView"));
const NotificationRulesView = React.lazy(() => import("../planning/NotificationRulesView"));
const AutomationRulesView = React.lazy(() => import("../planning/AutomationRulesView"));
// Fase 3: Advanced Analytics & Future Planning
const ShopFloorMobileApp = React.lazy(() => import("../planning/ShopFloorMobileApp"));
const ScenarioPlanningView = React.lazy(() => import("../planning/ScenarioPlanningView"));
// Reports & Analytics
const AdminReportsView = React.lazy(() => import("./AdminReportsView"));
const QsheVirtualLotsView = React.lazy(() => import("./QsheVirtualLotsView"));
// LN Stamdata import
const ReferenceOpsImportModal = React.lazy(() => import("../digitalplanning/modals/ReferenceOpsImportModal"));
const AdminRefOpsImportScreen = ({ onNavigate }) => (_jsx(ReferenceOpsImportModal, { isOpen: true, onClose: () => onNavigate?.(null), onSuccess: () => onNavigate?.(null) }));
const MTPresentationLauncher = () => (_jsx("div", { className: "p-6 md:p-10 max-w-5xl mx-auto space-y-6", children: _jsxs("div", { className: "bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4", children: [_jsx("h3", { className: "text-2xl font-black text-slate-900 uppercase italic tracking-tight", children: "MT Presentatie (Tijdelijk)" }), _jsx("p", { className: "text-slate-600 text-sm leading-relaxed", children: "Open de presentatie in een nieuw tabblad. In de presentatie staat een vaste knop om direct terug de app in te gaan." }), _jsxs("div", { className: "flex flex-wrap gap-3 pt-2", children: [_jsxs("a", { href: "/presentation", target: "_blank", rel: "noreferrer", className: "inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white px-5 py-3 font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors", children: ["Open Presentatie", _jsx(ArrowRight, { size: 14 })] }), _jsxs("a", { href: "/portal", className: "inline-flex items-center gap-2 rounded-2xl bg-slate-100 text-slate-800 px-5 py-3 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors", children: ["Naar App Portaal", _jsx(ArrowRight, { size: 14 })] })] })] }) }));
/**
 * AdminDashboard V5.7 - Reference Hub Integration
 * Beheert alle MES-beheermodules inclusief de technische encyclopedie.
 */
const AdminDashboard = () => {
    const { t } = useTranslation();
    const { role, user } = useAdminAuth();
    const location = useLocation();
    const [activeScreen, setActiveScreen] = useState(null);
    // Reset naar dashboard overzicht als er op de sidebar knop wordt geklikt (geen state)
    useEffect(() => {
        if (location.state?.openScreen) {
            setActiveScreen(location.state.openScreen);
            return;
        }
        if (!location.state) {
            setActiveScreen(null);
        }
    }, [location]);
    const [expandedCategories, setExpandedCategories] = useState([]); // All categories collapsed by default
    // Toggle category expansion
    const toggleCategory = (categoryId) => {
        setExpandedCategories(prev => prev.includes(categoryId)
            ? prev.filter(c => c !== categoryId)
            : [...prev, categoryId]);
    };
    // Grouped menu structure
    const menuCategories = [
        {
            id: "planning",
            title: "Planning & Productie",
            icon: _jsx(TrendingUp, { size: 20, className: "text-purple-600" }),
            color: "bg-purple-50 border-purple-200",
            items: [
                {
                    id: "capacity",
                    title: "Capaciteits Planning",
                    desc: "Vergelijk beschikbare productie-uren met geplande vraag.",
                    icon: _jsx(TrendingUp, { size: 24, className: "text-purple-600" }),
                    color: "bg-purple-50 border-purple-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: CapacityPlanningView,
                    requiredModule: "digital_planning",
                },
                {
                    id: "production_standards",
                    title: "Productie Tijden",
                    desc: "Beheer standaard tijden en normen.",
                    icon: _jsx(Clock, { size: 24, className: "text-pink-600" }),
                    color: "bg-pink-50 border-pink-100",
                    roles: ["admin", "engineer"],
                    component: ProductionTimeStandardsManager,
                    requiredModule: "digital_planning",
                },
                {
                    id: "kanban",
                    title: "Kanban Board",
                    desc: "Visuele orderworkflow met drag-and-drop.",
                    icon: _jsx(Kanban, { size: 24, className: "text-blue-600" }),
                    color: "bg-blue-50 border-blue-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: KanbanBoardView,
                    requiredModule: "digital_planning",
                },
                {
                    id: "dependencies",
                    title: "Order Dependencies",
                    desc: "Critical path analyse tussen orders.",
                    icon: _jsx(GitBranch, { size: 24, className: "text-purple-600" }),
                    color: "bg-purple-50 border-purple-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: OrderDependenciesView,
                    requiredModule: "digital_planning",
                },
                {
                    id: "scenarios",
                    title: "Scenario Planning",
                    desc: "What-if analyse simulator.",
                    icon: _jsx(Beaker, { size: 24, className: "text-purple-600" }),
                    color: "bg-purple-50 border-purple-100",
                    roles: ["admin", "engineer"],
                    component: ScenarioPlanningView,
                    requiredModule: "digital_planning",
                },
            ]
        },
        {
            id: "reports",
            title: "Rapportage & Analytics",
            icon: _jsx(BarChart3, { size: 20, className: "text-cyan-600" }),
            color: "bg-cyan-50 border-cyan-200",
            items: [
                {
                    id: "reports",
                    title: "Rapportage Centre",
                    desc: "Uitgebreide rapporten voor productie, kwaliteit, efficiency en personeel.",
                    icon: _jsx(FileText, { size: 24, className: "text-cyan-600" }),
                    color: "bg-cyan-50 border-cyan-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: AdminReportsView,
                },
            ]
        },
        {
            id: "qshe",
            title: "QSHE",
            icon: _jsx(ShieldCheck, { size: 20, className: "text-orange-600" }),
            color: "bg-orange-50 border-orange-200",
            items: [
                {
                    id: "qshe_virtual_lots",
                    title: "Virtuele Lotuitgifte",
                    desc: "Geef een virtueel lotnummer uit op machine + order zonder fysiek product.",
                    icon: _jsx(ShieldCheck, { size: 24, className: "text-orange-600" }),
                    color: "bg-orange-50 border-orange-100",
                    roles: ["admin", "qc", "teamleader"],
                    component: QsheVirtualLotsView,
                },
            ]
        },
        {
            id: "automation",
            title: "Automation & Notificaties",
            icon: _jsx(Zap, { size: 20, className: "text-yellow-600" }),
            color: "bg-yellow-50 border-yellow-200",
            items: [
                {
                    id: "notifications",
                    title: "Notification Rules",
                    desc: "Geautomatiseerde notificaties voor events.",
                    icon: _jsx(Bell, { size: 24, className: "text-blue-600" }),
                    color: "bg-blue-50 border-blue-100",
                    roles: ["admin", "engineer"],
                    component: NotificationRulesView,
                },
                {
                    id: "automation",
                    title: "Automation Rules",
                    desc: "When X happens, then Y engine.",
                    icon: _jsx(Zap, { size: 24, className: "text-yellow-600" }),
                    color: "bg-yellow-50 border-yellow-100",
                    roles: ["admin", "engineer"],
                    component: AutomationRulesView,
                },
                {
                    id: "email_manager",
                    title: "E-mail Beheer",
                    desc: "Templates en logboek voor e-mails.",
                    icon: _jsx(Mail, { size: 24, className: "text-red-500" }),
                    color: "bg-red-50 border-red-100",
                    roles: ["admin"],
                    component: AdminEmailManager,
                },
                {
                    id: "manual_sync_drawings",
                    title: "Handmatige Sync Tekeningen",
                    desc: "Start direct een sync tussen conversiematrix en tekeningen.",
                    icon: _jsx(DatabaseZap, { size: 24, className: "text-green-600" }),
                    color: "bg-green-50 border-green-100",
                    roles: ["admin"],
                    component: React.lazy(() => import("./ManualSyncDrawings")),
                },
            ]
        },
        {
            id: "products",
            title: "Product & Data Management",
            icon: _jsx(Package, { size: 20, className: "text-blue-600" }),
            color: "bg-blue-50 border-blue-200",
            items: [
                {
                    id: "products",
                    title: "Product Manager",
                    desc: "Technische catalogus en verificatie.",
                    icon: _jsx(Package, { size: 24, className: "text-blue-600" }),
                    color: "bg-blue-50 border-blue-100",
                    roles: ["admin", "engineer"],
                    component: AdminProductManager,
                },
                {
                    id: "matrix",
                    title: "Matrix Manager",
                    desc: "Technische logica en toleranties.",
                    icon: _jsx(Grid, { size: 24, className: "text-purple-600" }),
                    color: "bg-purple-50 border-purple-100",
                    roles: ["admin", "engineer"],
                    component: AdminMatrixManager,
                },
                {
                    id: "reference_table",
                    title: "Technische Encyclopedie",
                    desc: "Stamdata opzoeken (Boringen, Mof-maten).",
                    icon: _jsx(BookOpen, { size: 24, className: "text-amber-600" }),
                    color: "bg-amber-50 border-amber-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: AdminReferenceTable,
                },
                {
                    id: "conversions",
                    title: "Conversie Matrix",
                    desc: "Infor-LN codes naar tekeningen.",
                    icon: _jsx(ArrowRightLeft, { size: 24, className: "text-teal-600" }),
                    color: "bg-teal-50 border-teal-100",
                    roles: ["admin", "engineer"],
                    component: ConversionManager,
                },
                {
                    id: "label_manager",
                    title: "Label Manager",
                    desc: "Ontwerp labels en beheer logica.",
                    icon: _jsx(BoxSelect, { size: 24, className: "text-orange-600" }),
                    color: "bg-orange-50 border-orange-100",
                    roles: ["admin", "engineer"],
                    component: AdminLabelManager,
                },
                {
                    id: "tooling_molds",
                    title: "Mallen & Gereedschappen",
                    desc: "Centraal beheer voor alle mallen, met flens-tab voor cavity regels.",
                    icon: _jsx(Settings2, { size: 24, className: "text-sky-600" }),
                    color: "bg-sky-50 border-sky-100",
                    roles: ["admin", "engineer"],
                    component: AdminToolingMoldsView,
                },
                {
                    id: "ref_ops_import",
                    title: "LN Stamdata Import",
                    desc: "Importeer Reference Operations (refOp-codes) vanuit LN naar de database voor database-gestuurde uren-classificaties.",
                    icon: _jsx(Database, { size: 24, className: "text-violet-600" }),
                    color: "bg-violet-50 border-violet-100",
                    roles: ["admin", "engineer"],
                    component: AdminRefOpsImportScreen,
                },
            ]
        },
        {
            id: "factory",
            title: "Fabriek & Personeel",
            icon: _jsx(Factory, { size: 20, className: "text-emerald-600" }),
            color: "bg-emerald-50 border-emerald-200",
            items: [
                {
                    id: "factory",
                    title: "Fabrieksstructuur",
                    desc: "Afdelingen, machines en terminals.",
                    icon: _jsx(Layout, { size: 24, className: "text-emerald-600" }),
                    color: "bg-emerald-50 border-emerald-100",
                    roles: ["admin"],
                    component: FactoryStructureManager,
                },
                {
                    id: "personnel",
                    title: "Personeel & Bezetting",
                    desc: "Operators en machine-bezetting.",
                    icon: _jsx(UserCheck, { size: 24, className: "text-indigo-600" }),
                    color: "bg-indigo-50 border-indigo-100",
                    roles: ["admin", "teamleader", "engineer"],
                    component: PersonnelManager,
                },
                {
                    id: "shopfloor",
                    title: "Mobile Inspector",
                    desc: "Tablet app voor teamleiders en QC op de werkvloer.",
                    icon: _jsx(Smartphone, { size: 24, className: "text-indigo-600" }),
                    color: "bg-indigo-50 border-indigo-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: ShopFloorMobileApp,
                    requiredModule: "quality_control",
                },
            ]
        },
        {
            id: "system",
            title: "Systeem & Configuratie",
            icon: _jsx(Settings, { size: 20, className: "text-slate-600" }),
            color: "bg-slate-50 border-slate-200",
            items: [
                {
                    id: "users",
                    title: "Gebruikers & Rollen",
                    desc: "Accounts en toegangsrechten.",
                    icon: _jsx(Users, { size: 24, className: "text-slate-600" }),
                    color: "bg-slate-50 border-slate-100",
                    roles: ["admin"],
                    component: AdminUsersView,
                },
                {
                    id: "badge_generator",
                    title: "Login Badges",
                    desc: "Genereer QR-code inlogpasjes voor snelle toegang.",
                    icon: _jsx(QrCode, { size: 24, className: "text-indigo-600" }),
                    color: "bg-indigo-50 border-indigo-100",
                    roles: ["admin"],
                    component: AdminBadgeGenerator,
                },
                {
                    id: "settings",
                    title: "Systeem Instellingen",
                    desc: "Globale applicatie-configuratie.",
                    icon: _jsx(Settings2, { size: 24, className: "text-blue-600" }),
                    color: "bg-blue-50 border-blue-100",
                    roles: ["admin"],
                    component: AdminSettingsView,
                },
                {
                    id: "printers",
                    title: "Printer Beheer",
                    desc: "Netwerk- en labelprinters configureren.",
                    icon: _jsx(Printer, { size: 24, className: "text-orange-600" }),
                    color: "bg-orange-50 border-orange-100",
                    roles: ["admin"],
                    component: AdminPrinterManager,
                },
                {
                    id: "messages_management",
                    title: "Berichten Beheer",
                    desc: "Groepen en notificatie voorkeuren.",
                    icon: _jsx(Settings, { size: 24, className: "text-rose-600" }),
                    color: "bg-rose-50 border-rose-100",
                    roles: ["admin"],
                    component: AdminMessagesManagement,
                },
                {
                    id: "logs",
                    title: "Activiteiten Logboek",
                    desc: "Systeem-audit trail monitoring.",
                    icon: _jsx(History, { size: 24, className: "text-slate-600" }),
                    color: "bg-slate-50 border-slate-100",
                    roles: ["admin"],
                    component: AdminLogView,
                },
                {
                    id: "database",
                    title: "Database Explorer",
                    desc: "Directe data-integriteit inspectie.",
                    icon: _jsx(Database, { size: 24, className: "text-red-600" }),
                    color: "bg-red-50 border-red-100",
                    roles: ["admin"],
                    component: AdminDatabaseView,
                },
            ]
        },
        {
            id: "special",
            title: "Speciale Tools",
            icon: _jsx(BrainCircuit, { size: 20, className: "text-fuchsia-600" }),
            color: "bg-fuchsia-50 border-fuchsia-200",
            items: [
                {
                    id: "roadmap",
                    title: "Master Roadmap",
                    desc: "Ontwikkelings-roadmap en ideeën.",
                    icon: _jsx(TrendingUp, { size: 24, className: "text-emerald-600" }),
                    color: "bg-emerald-50 border-emerald-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: RoadmapViewer,
                },
                {
                    id: "project_structure",
                    title: "Projectstructuur & Uitleg (Expert)",
                    desc: "Zeer gedetailleerd overzicht, AI-koppeling.",
                    icon: _jsx(BookOpen, { size: 24, className: "text-indigo-600" }),
                    color: "bg-indigo-50 border-indigo-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: ProjectStructureExpertView,
                },
                {
                    id: "ai_training",
                    title: "AI Training & QA",
                    desc: "AI antwoorden en kennisbank.",
                    icon: _jsx(BrainCircuit, { size: 24, className: "text-fuchsia-600" }),
                    color: "bg-fuchsia-50 border-fuchsia-100",
                    roles: ["admin", "engineer"],
                    component: AiCenterView,
                    requiredModule: "ai_assistant",
                },
                {
                    id: "pilot_migration",
                    title: "Pilot Migratie Tool",
                    desc: "Verplaats pilot-data naar productie en schoon op.",
                    icon: _jsx(DatabaseZap, { size: 24, className: "text-rose-600" }),
                    color: "bg-rose-50 border-rose-100",
                    roles: ["admin"],
                    component: PilotMigrationTool,
                },
                {
                    id: "mt_presentation",
                    title: "MT Presentatie",
                    desc: "Tijdelijke presentatiepagina met directe terugkoppeling naar de app.",
                    icon: _jsx(BookOpen, { size: 24, className: "text-blue-600" }),
                    color: "bg-blue-50 border-blue-100",
                    roles: ["admin", "engineer", "teamleader"],
                    component: MTPresentationLauncher,
                },
            ]
        }
    ];
    // Flatten for routing compatibility
    const allMenuItems = menuCategories.flatMap(cat => cat.items);
    // Filter categories based on current user role
    const currentRole = (role || "").toLowerCase();
    const filteredCategories = menuCategories.map(category => ({
        ...category,
        items: category.items.filter(item => {
            const hasRole = item.roles.some(r => r.toLowerCase() === currentRole);
            // Admins hebben altijd volledige toegang
            if (currentRole === 'admin')
                return hasRole;
            if (item.requiredModule) {
                // Nieuw systeem: check permissions object (moduleId → [featureIds])
                const perms = user?.permissions || {};
                const modulePerms = perms[item.requiredModule] || [];
                const hasViaPermissions = modulePerms.length > 0;
                // Fallback: oud modules-array systeem
                const hasViaModules = (user?.modules || []).includes(item.requiredModule);
                return hasRole && (hasViaPermissions || hasViaModules);
            }
            return hasRole;
        })
    })).filter(category => category.items.length > 0); // Only show categories with accessible items
    // --- RENDERING: SUB-MODULE ---
    if (activeScreen) {
        const activeItem = allMenuItems.find((i) => i.id === activeScreen);
        const ActiveComponent = activeItem?.component;
        const componentProps = activeItem?.id === "personnel"
            ? {
                initialViewDate: location.state?.personnelDate,
                initialTab: location.state?.personnelTab,
            }
            : {};
        return (_jsxs("div", { className: "flex flex-col h-full bg-slate-50 w-full animate-in fade-in overflow-hidden text-left", children: [_jsxs("div", { className: "bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-4 text-left", children: [_jsx("button", { onClick: () => setActiveScreen(null), className: "p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 transition-all active:scale-90", children: _jsx(ArrowLeft, { size: 20 }) }), _jsxs("h2", { className: "text-xl font-black text-slate-800 uppercase italic tracking-tight flex items-center gap-3", children: [activeItem?.icon, " ", activeItem?.title] })] }), _jsxs("div", { className: "bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hidden sm:flex items-center gap-2", children: [_jsx(ShieldCheck, { size: 12, className: "text-emerald-400" }), " Root Synchronized"] })] }), _jsx("div", { className: "flex-1 overflow-auto bg-slate-50 relative", children: _jsx(Suspense, { fallback: _jsxs("div", { className: "flex h-full flex-col items-center justify-center text-slate-400 gap-4", children: [_jsx(Loader2, { className: "animate-spin", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest italic text-center", children: "Syncing Hub..." })] }), children: ActiveComponent ? _jsx(ActiveComponent, { user: user, canEdit: true, onNavigate: setActiveScreen, ...componentProps }) : _jsx("div", { className: "flex h-full items-center justify-center text-slate-400", children: _jsx("p", { children: "Component laden..." }) }) }) })] }));
    }
    // --- RENDERING: DASHBOARD OVERZICHT ---
    return (_jsx("div", { className: "h-full overflow-y-auto p-6 md:p-10 bg-slate-50 text-left custom-scrollbar", children: _jsxs("div", { className: "max-w-7xl mx-auto space-y-10 pb-32", children: [_jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-10", children: [_jsxs("div", { className: "text-left", children: [_jsxs("h1", { className: "text-4xl md:text-5xl font-black text-slate-900 tracking-tight uppercase italic leading-none", children: [t('adminDashboard.title', 'Admin'), " ", _jsx("span", { className: "text-blue-600", children: t('adminDashboard.hub', 'Hub') })] }), _jsx("p", { className: "text-slate-400 font-bold text-sm uppercase tracking-widest mt-2 italic text-left leading-none", children: t('adminDashboard.subtitle', 'Control Center & Technical Reference') })] }), _jsxs("div", { className: "bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl border border-white/10", children: [_jsx(ShieldAlert, { size: 14, className: "text-blue-400" }), t('adminDashboard.active_session', 'Active Session'), ": ", role?.toUpperCase() || t('adminDashboard.no_role', 'NO ROLE')] })] }), _jsx("div", { className: "space-y-8", children: filteredCategories.map((category) => {
                        const isExpanded = expandedCategories.includes(category.id);
                        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("button", { onClick: () => toggleCategory(category.id), className: `w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all duration-300 ${category.color} hover:shadow-lg active:scale-[0.98]`, children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "p-3 bg-white rounded-2xl shadow-md", children: category.icon }), _jsxs("div", { className: "text-left", children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 uppercase tracking-tight italic", children: category.title }), _jsxs("p", { className: "text-xs text-slate-500 font-medium mt-1", children: [category.items.length, " ", t('adminDashboard.module', 'module'), category.items.length !== 1 ? t('adminDashboard.modules', 's') : ''] })] })] }), _jsx("div", { className: `p-2 rounded-xl bg-white/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`, children: _jsx(ChevronDown, { size: 20, className: "text-slate-600" }) })] }), isExpanded && (_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pl-4 animate-in fade-in slide-in-from-top-2 duration-300", children: category.items.map((item) => (_jsxs("button", { onClick: () => setActiveScreen(item.id), className: `group flex flex-col p-8 rounded-[40px] border-2 text-left transition-all duration-300 transform hover:-translate-y-1 bg-white ${item.color} border-transparent shadow-sm hover:shadow-2xl hover:border-white active:scale-95`, children: [_jsx("div", { className: "p-5 bg-white rounded-3xl shadow-lg mb-8 w-fit group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300", children: item.icon }), _jsx("h3", { className: "text-xl font-black text-slate-800 uppercase tracking-tight italic", children: item.title }), _jsx("p", { className: "text-xs text-slate-500 font-medium mt-3 leading-relaxed opacity-80 text-left", children: item.desc }), _jsxs("div", { className: "mt-8 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-300 group-hover:text-blue-600 transition-colors", children: [t('open'), " ", _jsx(ArrowRight, { size: 14 })] })] }, item.id))) }))] }, category.id));
                    }) }), _jsxs("div", { className: "pt-20 opacity-20 flex items-center justify-center gap-4 grayscale", children: [_jsx(Factory, { size: 16 }), _jsx("span", { className: "text-[9px] font-black uppercase tracking-[0.5em]", children: "Future Factory MES Core v6.11" })] })] }) }));
};
export default AdminDashboard;
