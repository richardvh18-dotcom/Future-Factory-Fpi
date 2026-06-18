import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getPathString, PATHS } from "../../config/dbPaths";
import {
  ArrowLeft,
  Activity,
  Monitor,
  Cpu,
  Calendar,
  Loader2,
  AlertTriangle,
  Factory,
  Wrench,
  Boxes,
  ShieldCheck,
} from "lucide-react";

import { useAdminAuth } from "../../hooks/useAdminAuth";

const DepartmentStationSelector = React.lazy(() => import('./DepartmentStationSelector'));
const PlannerHub = React.lazy(() => import("./PlannerHub"));
const TeamleaderHub = React.lazy(() => import('./TeamleaderHub'));

type AppUser = {
  role?: string;
  allowedStations?: string[];
};

type FactoryStation = {
  name?: string;
};

type FactoryDepartment = {
  id?: string;
  slug?: string;
  name?: string;
  isActive?: boolean;
  stations?: FactoryStation[];
};

type FactoryConfig = {
  departments?: FactoryDepartment[];
};

type LocationState = {
  searchOrder?: string;
  initialView?: string;
};

/**
 * DigitalPlanningHub V5.0 - Stability Edition
 * Voorkomt witte schermen bij refresh door fallback-logica en
 * het opvangen van ontbrekende router states.
 */
const DigitalPlanningHub = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAdminAuth() as { user: AppUser | null };
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchOrderNumber, setSearchOrderNumber] = useState<string | null>(null);
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const normalizeKey = (value: string | undefined | null): string =>
    String(value || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "");

  const toDepartmentId = (department: FactoryDepartment): string => {
    const raw = String(department.id || department.slug || department.name || "").trim();
    return raw ? raw.toUpperCase() : "";
  };

  const stylePalette: Array<{ icon: React.ReactNode; color: string; iconColor: string }> = [
    { icon: <Factory size={40} />, color: "#EEF2FF", iconColor: "#4338CA" },
    { icon: <Wrench size={40} />, color: "#FFE4E6", iconColor: "#BE123C" },
    { icon: <Boxes size={40} />, color: "#CCFBF1", iconColor: "#0F766E" },
    { icon: <ShieldCheck size={40} />, color: "#FEF3C7", iconColor: "#B45309" },
    { icon: <Cpu size={40} />, color: "#E0F2FE", iconColor: "#075985" },
    { icon: <Activity size={40} />, color: "#ECFCCB", iconColor: "#3F6212" },
  ];

  const getDepartmentStyle = (
    department: FactoryDepartment,
    fallbackIndex: number
  ): { icon: React.ReactNode; color: string; iconColor: string } => {
    const key = normalizeKey(`${department.name || ""} ${department.slug || ""} ${department.id || ""}`);
    if (key.includes("fitting")) return { icon: <Monitor size={40} />, color: "#DCFCE7", iconColor: "#047857" };
    if (key.includes("pipe") || key.includes("buis")) return { icon: <Cpu size={40} />, color: "#FFEDD5", iconColor: "#C2410C" };
    if (key.includes("spool")) return { icon: <Activity size={40} />, color: "#F3E8FF", iconColor: "#6D28D9" };
    if (key === "qc" || key.includes("quality") || key.includes("kwaliteit")) {
      return { icon: <AlertTriangle size={40} />, color: "#CFFAFE", iconColor: "#0E7490" };
    }
    const paletteIndex = fallbackIndex % stylePalette.length;
    return stylePalette[paletteIndex];
  };

  // Laad factory config voor station-afdeling mapping
  useEffect(() => {
    const docRef = doc(db, getPathString(PATHS.FACTORY_CONFIG));
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setFactoryConfig(snap.data() as FactoryConfig);
      }
      setConfigLoading(false);
    }, (err) => {
        console.error("Factory config error in DigitalPlanningHub:", err);
        setConfigLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- REFRESH VEILIGHEID ---
  useEffect(() => {
    // Auto-navigatie voor gebruikers met maar één toegewezen station
    if (!configLoading && user && factoryConfig && user.allowedStations?.length === 1) {
      const singleStationName = user.allowedStations[0];
      
      // Ga niet automatisch naar de teamleader hub
      if (singleStationName.toUpperCase() === 'TEAMLEADER') {
          return;
      }

      let stationDept = null;
      for (const dept of factoryConfig.departments || []) {
        const station = (dept.stations || []).find(s => s.name === singleStationName);
        if (station) {
          stationDept = toDepartmentId(dept);
          break;
        }
      }

      if (stationDept) {
        setActiveDept(stationDept);
        return; // Stop verdere logica om reset te voorkomen
      }
    }

    try {
      console.log('[DigitalPlanningHub] Location:', location.pathname);
      console.log('[DigitalPlanningHub] State:', location.state);
      
      const state = (location.state || {}) as LocationState;
      if (state.searchOrder) {
        console.log('[DigitalPlanningHub] Search order:', state.searchOrder);
        setSearchOrderNumber(state.searchOrder);
      }
      
      // Als we via een link met state binnenkomen (bijv. vanaf Portal)
      if (state.initialView) {
        console.log('[DigitalPlanningHub] Setting activeDept:', state.initialView);
        setActiveDept(state.initialView);
      } else if (!state.searchOrder) {
        // FIX: Reset naar hoofdmenu als er geen specifieke state is (bijv. klik op Sidebar)
        // Dit zorgt ervoor dat een klik op 'Planning' je altijd terugbrengt naar de start
        setActiveDept(null);
      }
    } catch (err: unknown) {
      console.error("Fout bij initialiseren planning view:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err || "Onbekende fout"));
      setHasError(true);
    }
  }, [location, user, factoryConfig, configLoading]); // Trigger bij elke navigatie en als user/config data laadt

  const DEPARTMENTS = useMemo(() => {
    const dynamicDepartments = (factoryConfig?.departments || [])
      .filter((dept) => dept && dept.isActive !== false)
      .map((dept, index) => {
        const id = toDepartmentId(dept);
        if (!id) return null;
        const style = getDepartmentStyle(dept, index);
        return {
          id,
          title: String(dept.name || dept.slug || dept.id || id),
          icon: style.icon,
          description: "",
          color: style.color,
          iconColor: style.iconColor,
        };
      })
      .filter((dept): dept is { id: string; title: string; icon: React.ReactNode; description: string; color: string; iconColor: string } => Boolean(dept));

    return [
      ...dynamicDepartments,
      {
        id: "PLANNER",
        title: t("digitalplanning.hub.planner_title"),
        icon: <Calendar size={40} />,
        description: t("digitalplanning.hub.planner_desc"),
        color: "#E2E8F0",
        iconColor: "#334155",
      },
    ];
  }, [factoryConfig, t]);

  // Foutscherm als er iets kritiek misgaat
  if (hasError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 bg-slate-50">
        <AlertTriangle size={48} className="text-rose-500 mb-4" />
        <h2 className="text-xl font-black uppercase">
          {t("digitalplanning.hub.system_error_title")}
        </h2>
        <p className="text-slate-500 text-sm mt-2">
          {t("digitalplanning.hub.system_error_desc")}
        </p>
        {errorMessage && (
          <p className="text-rose-600 text-xs mt-2 font-mono bg-rose-50 p-3 rounded">
            {errorMessage}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs"
        >
          {t("digitalplanning.hub.recover")}
        </button>
      </div>
    );
  }

  // Toon de Planner Hub (Centrale Planning)
  if (String(activeDept || "").toUpperCase() === "PLANNER") {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" />
          </div>
        }
      >
        <PlannerHub onBack={() => setActiveDept(null)} />
      </Suspense>
    );
  }

  // Toon de Teamleader Hub (Direct Dashboard)
  if (String(activeDept || "").toUpperCase() === "TEAMLEADER") {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" />
          </div>
        }
      >
      <TeamleaderHub onBack={() => setActiveDept(null)} />
      </Suspense>
    );
  }

  // Toon de Workstation Hub (Afdelings-specifiek)
  if (activeDept) {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" />
          </div>
        }
      >
        <DepartmentStationSelector
          key={activeDept}
          department={activeDept}
          onBack={() => setActiveDept(null)}
          searchOrder={searchOrderNumber || undefined}
        />
      </Suspense>
    );
  }

  // Toon het hoofdmenu (Productie Hub Keuze)
  return (
    <div className="h-full w-full bg-white flex flex-col p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col justify-center py-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 mb-3 uppercase italic tracking-tighter leading-none">
            {t("digitalplanning.hub.title")} <span className="text-blue-600">{t("digitalplanning.hub.title_hub")}</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            {t("digitalplanning.hub.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setActiveDept(dept.id)}
              className="group relative p-10 rounded-3xl border-2 border-slate-200 bg-white hover:border-blue-500 hover:shadow-2xl text-center transition-all duration-300"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg mx-auto transition-transform group-hover:scale-110"
                style={{ backgroundColor: dept.color, color: dept.iconColor }}
              >
                {dept.icon}
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2 group-hover:text-blue-600 transition-colors italic">
                {dept.title}
              </h3>
              {dept.description && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-relaxed">
                  {dept.description}
                </p>
              )}
            </button>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <button
            onClick={() => navigate("/portal")}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all bg-slate-50 px-6 py-3 rounded-xl border border-slate-200"
          >
            <ArrowLeft size={14} /> {t("digitalplanning.hub.back_to_portal")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DigitalPlanningHub;
