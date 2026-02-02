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
} from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";

// --- LAZY LOAD IMPORTS ---
const RoadmapViewer = React.lazy(() => import("./RoadmapViewer"));
const AdminProductManager = React.lazy(() => import("./AdminProductManager"));
const FactoryStructureManager = React.lazy(() =>
  import("./FactoryStructureManager")
);
const ConversionManager = React.lazy(() => import("./ConversionManager"));
const PersonnelManager = React.lazy(() => import("./PersonnelManager"));
const AdminMatrixManager = React.lazy(() =>
  import("./matrixmanager/AdminMatrixManager")
);
const AdminUsersView = React.lazy(() => import("./AdminUsersView"));
const AdminMessagesView = React.lazy(() => import("./AdminMessagesView"));
const AdminDatabaseView = React.lazy(() => import("./AdminDatabaseView"));
const DataMigrationTool = React.lazy(() => import("./DataMigrationTool"));
const AdminLogView = React.lazy(() => import("./AdminLogView"));
const AdminSettingsView = React.lazy(() => import("./AdminSettingsView"));
const AdminLabelDesigner = React.lazy(() => import("./AdminLabelDesigner"));
const AiTrainingView = React.lazy(() => import("./AiTrainingView"));
// NIEUW: Referentie Tabel toevoegen
const AdminReferenceTable = React.lazy(() => import("./AdminReferenceTable"));

/**
 * AdminDashboard V5.7 - Reference Hub Integration
 * Beheert alle MES-beheermodules inclusief de technische encyclopedie.
 */
const AdminDashboard = () => {
  const { role, user } = useAdminAuth();
  const [activeScreen, setActiveScreen] = useState(null);

  const allMenuItems = [
    {
      id: "roadmap",
      title: "Master Roadmap",
      desc: "Volg de ontwikkelings-roadmap en dien ideeën in.",
      icon: <TrendingUp size={24} className="text-emerald-600" />,
      color: "bg-emerald-50 border-emerald-100",
      roles: ["admin", "engineer", "teamleader"],
      component: RoadmapViewer,
    },
    {
      id: "products",
      title: "Product Manager",
      desc: "Beheer de technische catalogus en verificatie-status.",
      icon: <Package size={24} className="text-blue-600" />,
      color: "bg-blue-50 border-blue-100",
      roles: ["admin", "engineer"],
      component: AdminProductManager,
    },
    {
      id: "matrix",
      title: "Matrix Manager",
      desc: "Beheer technische logica, mof-maten en toleranties.",
      icon: <Grid size={24} className="text-purple-600" />,
      color: "bg-purple-50 border-purple-100",
      roles: ["admin", "engineer"],
      component: AdminMatrixManager,
    },
    {
      id: "reference_table",
      title: "Technische Encyclopedie",
      desc: "Read-only opzoeken van stamdata (Boringen, Mof-maten).",
      icon: <BookOpen size={24} className="text-amber-600" />,
      color: "bg-amber-50 border-amber-100",
      roles: ["admin", "engineer", "teamleader"],
      component: AdminReferenceTable,
    },
    {
      id: "factory",
      title: "Fabrieksstructuur",
      desc: "Inrichting van afdelingen, machines en terminals.",
      icon: <Layout size={24} className="text-emerald-600" />,
      color: "bg-emerald-50 border-emerald-100",
      roles: ["admin"],
      component: FactoryStructureManager,
    },
    {
      id: "personnel",
      title: "Personeel & Bezetting",
      desc: "Database van operators en actuele machine-bezetting.",
      icon: <UserCheck size={24} className="text-indigo-600" />,
      color: "bg-indigo-50 border-indigo-100",
      roles: ["admin", "teamleader", "engineer"],
      component: PersonnelManager,
    },
    {
      id: "conversions",
      title: "Conversie Matrix",
      desc: "Koppeling tussen Infor-LN codes en technische tekeningen.",
      icon: <ArrowRightLeft size={24} className="text-teal-600" />,
      color: "bg-teal-50 border-teal-100",
      roles: ["admin", "engineer"],
      component: ConversionManager,
    },
    {
      id: "logs",
      title: "Activiteiten Logboek",
      desc: "Systeem-audit trail en real-time monitoring van acties.",
      icon: <History size={24} className="text-slate-600" />,
      color: "bg-slate-50 border-slate-100",
      roles: ["admin"],
      component: AdminLogView,
    },
    {
      id: "labels",
      title: "Label Architect",
      desc: "Ontwerp en beheer labels voor de Zebra printers.",
      icon: <BoxSelect size={24} className="text-orange-600" />,
      color: "bg-orange-50 border-orange-100",
      roles: ["admin", "engineer"],
      component: AdminLabelDesigner,
    },
    {
      id: "ai_training",
      title: "AI Training & QA",
      desc: "Kwaliteitscontrole van AI antwoorden en kennisbank.",
      icon: <BrainCircuit size={24} className="text-fuchsia-600" />,
      color: "bg-fuchsia-50 border-fuchsia-100",
      roles: ["admin", "engineer"],
      component: AiTrainingView,
    },
    {
      id: "messages",
      title: "Berichten Hub",
      desc: "Beheer interne communicatie en systeem-notificaties.",
      icon: <MessageSquare size={24} className="text-rose-600" />,
      color: "bg-rose-50 border-rose-100",
      roles: ["admin", "engineer", "teamleader"],
      component: AdminMessagesView,
    },
    {
      id: "users",
      title: "Gebruikers & Rollen",
      desc: "Beheer systeem-accounts en toegangsrechten.",
      icon: <Users size={24} className="text-slate-600" />,
      color: "bg-slate-50 border-slate-100",
      roles: ["admin"],
      component: AdminUsersView,
    },
    {
      id: "settings",
      title: "Systeem Instellingen",
      desc: "Globale applicatie-configuratie en root-bescherming.",
      icon: <Settings2 size={24} className="text-blue-600" />,
      color: "bg-blue-50 border-blue-100",
      roles: ["admin"],
      component: AdminSettingsView,
    },
    {
      id: "migration",
      title: "Data Migratie",
      desc: "Legacy data importeren uit /artifacts/ mappen.",
      icon: <DatabaseZap size={24} className="text-orange-600" />,
      color: "bg-orange-50 border-orange-100",
      roles: ["admin"],
      component: DataMigrationTool,
    },
    {
      id: "database",
      title: "Database Explorer",
      desc: "Directe inspectie van paden en data-integriteit.",
      icon: <Database size={24} className="text-red-600" />,
      color: "bg-red-50 border-red-100",
      roles: ["admin"],
      component: AdminDatabaseView,
    },
  ];

  // Filter op basis van de huidige gebruikersrol
  const currentRole = (role || "").toLowerCase();
  const menuItems = allMenuItems.filter((item) =>
    item.roles.some((r) => r.toLowerCase() === currentRole)
  );

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
            {ActiveComponent && <ActiveComponent user={user} canEdit={true} />}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {menuItems.map((item) => (
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
