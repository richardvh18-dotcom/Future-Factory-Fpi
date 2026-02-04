import React, { useState, useEffect, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Activity,
  Monitor,
  Cpu,
  Users,
  Calendar,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import DepartmentStationSelector from "./DepartmentStationSelector";
import PlannerHub from "./PlannerHub";

/**
 * DigitalPlanningHub V5.0 - Stability Edition
 * Voorkomt witte schermen bij refresh door fallback-logica en
 * het opvangen van ontbrekende router states.
 */
const DigitalPlanningHub = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeDept, setActiveDept] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchOrderNumber, setSearchOrderNumber] = useState(null);

  // --- REFRESH VEILIGHEID ---
  useEffect(() => {
    try {
      console.log('[DigitalPlanningHub] Location:', location.pathname);
      console.log('[DigitalPlanningHub] State:', location.state);
      
      // Als we een order zoeken via AI link
      if (location.state?.searchOrder) {
        console.log('[DigitalPlanningHub] Search order:', location.state.searchOrder);
        setSearchOrderNumber(location.state.searchOrder);
      }
      
      // Als we via een link met state binnenkomen (bijv. vanaf Portal)
      if (location.state?.initialView) {
        console.log('[DigitalPlanningHub] Setting activeDept:', location.state.initialView);
        setActiveDept(location.state.initialView);
      }
    } catch (err) {
      console.error("Fout bij initialiseren planning view:", err);
      setErrorMessage(err.message);
      setHasError(true);
    }
  }, [location.state?.initialView, location.state?.searchOrder]);

  const DEPARTMENTS = [
    {
      id: "FITTINGS",
      title: "Fitting Productions",
      icon: <Monitor size={40} />,
      description: "Hulpstukken & Voorbewerking",
      color: "bg-emerald-600",
    },
    {
      id: "PIPES",
      title: "Pipe Productions",
      icon: <Cpu size={40} />,
      description: "Leidingwerk & Lamineren",
      color: "bg-orange-600",
    },
    {
      id: "SPOOLS",
      title: "Spools Productions",
      icon: <Activity size={40} />,
      description: "Assemblage & Prefab",
      color: "bg-purple-600",
    },
    {
      id: "PLANNER",
      title: "Central Planner",
      icon: <Calendar size={40} />,
      description: "Werkvoorbereiding & Planning",
      color: "bg-slate-600",
    },
  ];

  // Foutscherm als er iets kritiek misgaat
  if (hasError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 bg-slate-50">
        <AlertTriangle size={48} className="text-rose-500 mb-4" />
        <h2 className="text-xl font-black uppercase">
          Systeemfout in Planning
        </h2>
        <p className="text-slate-500 text-sm mt-2">
          De module kon niet correct worden geladen.
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
          Herstellen
        </button>
      </div>
    );
  }

  // Toon de Planner Hub (Centrale Planning)
  if (activeDept === "PLANNER") {
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
          searchOrder={searchOrderNumber}
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
            Productie <span className="text-blue-600">Hub</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Industrial Operations Center
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setActiveDept(dept.id)}
              className="group relative p-10 rounded-3xl border-2 border-slate-200 bg-white hover:border-blue-500 hover:shadow-2xl text-center transition-all duration-300"
            >
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg mx-auto transition-transform group-hover:scale-110 ${dept.color}`}>
                {dept.icon}
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2 group-hover:text-blue-600 transition-colors italic">
                {dept.title}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-relaxed">
                {dept.description}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <button
            onClick={() => navigate("/portal")}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all bg-slate-50 px-6 py-3 rounded-xl border border-slate-200"
          >
            <ArrowLeft size={14} /> Terug naar Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default DigitalPlanningHub;
