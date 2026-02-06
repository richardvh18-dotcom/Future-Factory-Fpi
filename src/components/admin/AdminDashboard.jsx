import React, { useState, Suspense } from "react";
import {
  Package,
  Database,
  Users,
  Settings,
  MessageSquare,
  Grid,
  Factory,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  ArrowRightLeft,
  UserCheck,
  Layout,
  DatabaseZap,
  MapPin,
  Settings2,
  Terminal,
  History,
  BoxSelect,
  BrainCircuit,
  BookOpen,
  ShieldCheck,
  SearchCode,
  TrendingUp,
  Kanban,
  GanttChart,
  Flame,
  GitBranch,
  Bell,
  Zap,
  Clock,
  Smartphone,
  Beaker,
  ChevronDown,
} from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";

// --- LAZY LOAD IMPORTS ---
const RoadmapViewer = React.lazy(() => import("./RoadmapViewer"));
const AdminProductManager = React.lazy(() => import("./AdminProductManager"));
const FactoryStructureManager = React.lazy(() =>
  import("./FactoryStructureManager")
);
const ConversionManager = React.lazy(() => import("./ConversionManager"));
const PersonnelManager = React.lazy(() => import("../../Personel/PersonnelManager"));
const AdminMatrixManager = React.lazy(() =>
  import("./matrixmanager/AdminMatrixManager")
);
const AdminUsersView = React.lazy(() => import("./AdminUsersView"));
const AdminMessagesManagement = React.lazy(() => import("./AdminMessagesManagement"));
const AdminDatabaseView = React.lazy(() => import("./AdminDatabaseView"));
const DataMigrationTool = React.lazy(() => import("./DataMigrationTool"));
const AdminLogView = React.lazy(() => import("./AdminLogView"));
const AdminSettingsView = React.lazy(() => import("./AdminSettingsView"));
const CapacityPlanningView = React.lazy(() => import("./CapacityPlanningView"));
const AdminLabelDesigner = React.lazy(() => import("./AdminLabelDesigner"));
const AiCenterView = React.lazy(() => import("./AiCenterView"));
// NIEUW: Referentie Tabel toevoegen
const AdminReferenceTable = React.lazy(() => import("./AdminReferenceTable"));
// NIEUW: Monday.com/vPlan-style Planning Views
const KanbanBoardView = React.lazy(() => import("../planning/KanbanBoardView"));
const GanttChartView = React.lazy(() => import("../planning/GanttChartView"));
const WorkloadHeatmapView = React.lazy(() => import("../planning/WorkloadHeatmapView"));
// Fase 2: Advanced Planning Features
const OrderDependenciesView = React.lazy(() => import("../planning/OrderDependenciesView"));
const NotificationRulesView = React.lazy(() => import("../planning/NotificationRulesView"));
const AutomationRulesView = React.lazy(() => import("../planning/AutomationRulesView"));
const TimeTrackingView = React.lazy(() => import("../planning/TimeTrackingView"));
// Fase 3: Advanced Analytics & Future Planning
const ShopFloorMobileApp = React.lazy(() => import("../planning/ShopFloorMobileApp"));
const ScenarioPlanningView = React.lazy(() => import("../planning/ScenarioPlanningView"));

/**
 * AdminDashboard V5.7 - Reference Hub Integration
 * Beheert alle MES-beheermodules inclusief de technische encyclopedie.
 */
const AdminDashboard = () => {
  const { role, user } = useAdminAuth();
  const [activeScreen, setActiveScreen] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState([]); // All categories collapsed by default

  // Toggle category expansion
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Grouped menu structure
  const menuCategories = [
    {
      id: "planning",
      title: "Planning & Productie",
      icon: <TrendingUp size={20} className="text-purple-600" />,
      color: "bg-purple-50 border-purple-200",
      items: [
        {
          id: "capacity",
          title: "Capaciteits Planning",
          desc: "Vergelijk beschikbare productie-uren met geplande vraag.",
          icon: <TrendingUp size={24} className="text-purple-600" />,
          color: "bg-purple-50 border-purple-100",
          roles: ["admin", "engineer", "teamleader"],
          component: CapacityPlanningView,
        },
        {
          id: "kanban",
          title: "Kanban Board",
          desc: "Visuele orderworkflow met drag-and-drop.",
          icon: <Kanban size={24} className="text-blue-600" />,
          color: "bg-blue-50 border-blue-100",
          roles: ["admin", "engineer", "teamleader"],
          component: KanbanBoardView,
        },
        {
          id: "gantt",
          title: "Gantt Planning",
          desc: "Timeline visualisatie per machine.",
          icon: <GanttChart size={24} className="text-emerald-600" />,
          color: "bg-emerald-50 border-emerald-100",
          roles: ["admin", "engineer", "teamleader"],
          component: GanttChartView,
        },
        {
          id: "heatmap",
          title: "Workload Heatmap",
          desc: "Visueel overzicht machine/operator belasting.",
          icon: <Flame size={24} className="text-orange-600" />,
          color: "bg-orange-50 border-orange-100",
          roles: ["admin", "engineer", "teamleader"],
          component: WorkloadHeatmapView,
        },
        {
          id: "dependencies",
          title: "Order Dependencies",
          desc: "Critical path analyse tussen orders.",
          icon: <GitBranch size={24} className="text-purple-600" />,
          color: "bg-purple-50 border-purple-100",
          roles: ["admin", "engineer", "teamleader"],
          component: OrderDependenciesView,
        },
        {
          id: "timetracking",
          title: "Time Tracking",
          desc: "Actual vs planned tijd vergelijking.",
          icon: <Clock size={24} className="text-teal-600" />,
          color: "bg-teal-50 border-teal-100",
          roles: ["admin", "engineer", "teamleader"],
          component: TimeTrackingView,
        },
        {
          id: "scenarios",
          title: "Scenario Planning",
          desc: "What-if analyse simulator.",
          icon: <Beaker size={24} className="text-purple-600" />,
          color: "bg-purple-50 border-purple-100",
          roles: ["admin", "engineer"],
          component: ScenarioPlanningView,
        },
      ]
    },
    {
      id: "automation",
      title: "Automation & Notificaties",
      icon: <Zap size={20} className="text-yellow-600" />,
      color: "bg-yellow-50 border-yellow-200",
      items: [
        {
          id: "notifications",
          title: "Notification Rules",
          desc: "Geautomatiseerde notificaties voor events.",
          icon: <Bell size={24} className="text-blue-600" />,
          color: "bg-blue-50 border-blue-100",
          roles: ["admin", "engineer"],
          component: NotificationRulesView,
        },
        {
          id: "automation",
          title: "Automation Rules",
          desc: "When X happens, then Y engine.",
          icon: <Zap size={24} className="text-yellow-600" />,
          color: "bg-yellow-50 border-yellow-100",
          roles: ["admin", "engineer"],
          component: AutomationRulesView,
        },
      ]
    },
    {
      id: "products",
      title: "Product & Data Management",
      icon: <Package size={20} className="text-blue-600" />,
      color: "bg-blue-50 border-blue-200",
      items: [
        {
          id: "products",
          title: "Product Manager",
          desc: "Technische catalogus en verificatie.",
          icon: <Package size={24} className="text-blue-600" />,
          color: "bg-blue-50 border-blue-100",
          roles: ["admin", "engineer"],
          component: AdminProductManager,
        },
        {
          id: "matrix",
          title: "Matrix Manager",
          desc: "Technische logica en toleranties.",
          icon: <Grid size={24} className="text-purple-600" />,
          color: "bg-purple-50 border-purple-100",
          roles: ["admin", "engineer"],
          component: AdminMatrixManager,
        },
        {
          id: "reference_table",
          title: "Technische Encyclopedie",
          desc: "Stamdata opzoeken (Boringen, Mof-maten).",
          icon: <BookOpen size={24} className="text-amber-600" />,
          color: "bg-amber-50 border-amber-100",
          roles: ["admin", "engineer", "teamleader"],
          component: AdminReferenceTable,
        },
        {
          id: "conversions",
          title: "Conversie Matrix",
          desc: "Infor-LN codes naar tekeningen.",
          icon: <ArrowRightLeft size={24} className="text-teal-600" />,
          color: "bg-teal-50 border-teal-100",
          roles: ["admin", "engineer"],
          component: ConversionManager,
        },
        {
          id: "labels",
          title: "Label Architect",
          desc: "Ontwerp Zebra printer labels.",
          icon: <BoxSelect size={24} className="text-orange-600" />,
          color: "bg-orange-50 border-orange-100",
          roles: ["admin", "engineer"],
          component: AdminLabelDesigner,
        },
      ]
    },
    {
      id: "factory",
      title: "Fabriek & Personeel",
      icon: <Factory size={20} className="text-emerald-600" />,
      color: "bg-emerald-50 border-emerald-200",
      items: [
        {
          id: "factory",
          title: "Fabrieksstructuur",
          desc: "Afdelingen, machines en terminals.",
          icon: <Layout size={24} className="text-emerald-600" />,
          color: "bg-emerald-50 border-emerald-100",
          roles: ["admin"],
          component: FactoryStructureManager,
        },
        {
          id: "personnel",
          title: "Personeel & Bezetting",
          desc: "Operators en machine-bezetting.",
          icon: <UserCheck size={24} className="text-indigo-600" />,
          color: "bg-indigo-50 border-indigo-100",
          roles: ["admin", "teamleader", "engineer"],
          component: PersonnelManager,
        },
        {
          id: "shopfloor",
          title: "Mobile Inspector",
          desc: "Tablet app voor teamleiders en QC op de werkvloer.",
          icon: <Smartphone size={24} className="text-indigo-600" />,
          color: "bg-indigo-50 border-indigo-100",
          roles: ["admin", "engineer", "teamleader"],
          component: ShopFloorMobileApp,
        },
      ]
    },
    {
      id: "system",
      title: "Systeem & Configuratie",
      icon: <Settings size={20} className="text-slate-600" />,
      color: "bg-slate-50 border-slate-200",
      items: [
        {
          id: "users",
          title: "Gebruikers & Rollen",
          desc: "Accounts en toegangsrechten.",
          icon: <Users size={24} className="text-slate-600" />,
          color: "bg-slate-50 border-slate-100",
          roles: ["admin"],
          component: AdminUsersView,
        },
        {
          id: "settings",
          title: "Systeem Instellingen",
          desc: "Globale applicatie-configuratie.",
          icon: <Settings2 size={24} className="text-blue-600" />,
          color: "bg-blue-50 border-blue-100",
          roles: ["admin"],
          component: AdminSettingsView,
        },
        {
          id: "messages_management",
          title: "Berichten Beheer",
          desc: "Groepen en notificatie voorkeuren.",
          icon: <Settings size={24} className="text-rose-600" />,
          color: "bg-rose-50 border-rose-100",
          roles: ["admin"],
          component: AdminMessagesManagement,
        },
        {
          id: "logs",
          title: "Activiteiten Logboek",
          desc: "Systeem-audit trail monitoring.",
          icon: <History size={24} className="text-slate-600" />,
          color: "bg-slate-50 border-slate-100",
          roles: ["admin"],
          component: AdminLogView,
        },
        {
          id: "database",
          title: "Database Explorer",
          desc: "Directe data-integriteit inspectie.",
          icon: <Database size={24} className="text-red-600" />,
          color: "bg-red-50 border-red-100",
          roles: ["admin"],
          component: AdminDatabaseView,
        },
        {
          id: "migration",
          title: "Data Migratie",
          desc: "Legacy data importeren.",
          icon: <DatabaseZap size={24} className="text-orange-600" />,
          color: "bg-orange-50 border-orange-100",
          roles: ["admin"],
          component: DataMigrationTool,
        },
      ]
    },
    {
      id: "special",
      title: "Speciale Tools",
      icon: <BrainCircuit size={20} className="text-fuchsia-600" />,
      color: "bg-fuchsia-50 border-fuchsia-200",
      items: [
        {
          id: "roadmap",
          title: "Master Roadmap",
          desc: "Ontwikkelings-roadmap en ideeën.",
          icon: <TrendingUp size={24} className="text-emerald-600" />,
          color: "bg-emerald-50 border-emerald-100",
          roles: ["admin", "engineer", "teamleader"],
          component: RoadmapViewer,
        },
        {
          id: "ai_training",
          title: "AI Training & QA",
          desc: "AI antwoorden en kennisbank.",
          icon: <BrainCircuit size={24} className="text-fuchsia-600" />,
          color: "bg-fuchsia-50 border-fuchsia-100",
          roles: ["admin", "engineer"],
          component: AiCenterView,
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
    items: category.items.filter(item => 
      item.roles.some(r => r.toLowerCase() === currentRole)
    )
  })).filter(category => category.items.length > 0); // Only show categories with accessible items

  // --- RENDERING: SUB-MODULE ---
  if (activeScreen) {
    const activeItem = allMenuItems.find((i) => i.id === activeScreen);
    const ActiveComponent = activeItem?.component;

    return (
      <div className="flex flex-col h-full bg-slate-50 w-full animate-in fade-in overflow-hidden text-left">
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-4 text-left">
            <button
              onClick={() => setActiveScreen(null)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-600 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tight flex items-center gap-3">
              {activeItem?.icon} {activeItem?.title}
            </h2>
          </div>
          <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hidden sm:flex items-center gap-2">
            <ShieldCheck size={12} className="text-emerald-400" /> Root
            Synchronized
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 relative">
          <Suspense
            fallback={
              <div className="flex h-full flex-col items-center justify-center text-slate-400 gap-4">
                <Loader2 className="animate-spin" size={40} />
                <p className="text-[10px] font-black uppercase tracking-widest italic text-center">
                  Syncing Hub...
                </p>
              </div>
            }
          >
            {ActiveComponent ? <ActiveComponent user={user} canEdit={true} /> : <div className="flex h-full items-center justify-center text-slate-400"><p>Component laden...</p></div>}
          </Suspense>
        </div>
      </div>
    );
  }

  // --- RENDERING: DASHBOARD OVERZICHT ---
  return (
    <div className="h-full overflow-y-auto p-6 md:p-10 bg-slate-50 text-left custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-10 pb-32">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-10">
          <div className="text-left">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight uppercase italic leading-none">
              Admin <span className="text-blue-600">Hub</span>
            </h1>
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-2 italic text-left leading-none">
              Control Center & Technical Reference
            </p>
          </div>
          <div className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl border border-white/10">
            <ShieldAlert size={14} className="text-blue-400" />
            Active Session: {role?.toUpperCase() || "NO ROLE"}
          </div>
        </div>

        <div className="space-y-8">
          {filteredCategories.map((category) => {
            const isExpanded = expandedCategories.includes(category.id);
            
            return (
              <div key={category.id} className="space-y-4">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all duration-300 ${category.color} hover:shadow-lg active:scale-[0.98]`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-md">
                      {category.icon}
                    </div>
                    <div className="text-left">
                      <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight italic">
                        {category.title}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium mt-1">
                        {category.items.length} module{category.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className={`p-2 rounded-xl bg-white/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={20} className="text-slate-600" />
                  </div>
                </button>

                {/* Category Items */}
                {isExpanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pl-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveScreen(item.id)}
                        className={`group flex flex-col p-8 rounded-[40px] border-2 text-left transition-all duration-300 transform hover:-translate-y-1 bg-white ${item.color} border-transparent shadow-sm hover:shadow-2xl hover:border-white active:scale-95`}
                      >
                        <div className="p-5 bg-white rounded-3xl shadow-lg mb-8 w-fit group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                          {item.icon}
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight italic">
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-3 leading-relaxed opacity-80 text-left">
                          {item.desc}
                        </p>
                        <div className="mt-8 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-300 group-hover:text-blue-600 transition-colors">
                          Openen <ArrowRight size={14} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-20 opacity-20 flex items-center justify-center gap-4 grayscale">
          <Factory size={16} />
          <span className="text-[9px] font-black uppercase tracking-[0.5em]">
            Future Factory MES Core v6.11
          </span>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
