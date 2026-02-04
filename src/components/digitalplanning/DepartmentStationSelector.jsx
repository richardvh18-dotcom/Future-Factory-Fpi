import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Cpu, Users, Loader2 } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import WorkstationHub from "./WorkstationHub";
import TeamleaderHub from "./TeamleaderHub";

/**
 * DepartmentStationSelector
 * Laadt stations dynamisch uit factory_config in Firestore
 */
const DepartmentStationSelector = ({ department, onBack, searchOrder }) => {
  const [selectedStation, setSelectedStation] = useState(null);
  const [showTeamleader, setShowTeamleader] = useState(false);
  const [factoryConfig, setFactoryConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Luister naar factory config
  useEffect(() => {
    const docRef = doc(db, ...PATHS.FACTORY_CONFIG);

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setFactoryConfig(snap.data());
        }
        setLoading(false);
      },
      (err) => {
        console.error("Factory config error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Bereken stations voor huidige department
  const stations = useMemo(() => {
    if (!factoryConfig || !department) return [];
    
    const slugMap = { FITTINGS: "fittings", PIPES: "pipes", SPOOLS: "spools" };
    const targetSlug = slugMap[department] || department.toLowerCase();
    
    const deptData = (factoryConfig.departments || []).find(
      (d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug
    );
    
    return deptData ? (deptData.stations || []).map(s => ({ id: s.id || s.name, name: s.name })) : [];
  }, [factoryConfig, department]);

  // Als Teamleader is geselecteerd, toon TeamleaderHub
  if (showTeamleader) {
    return (
      <TeamleaderHub 
        onBack={() => setShowTeamleader(false)} 
        fixedScope={department.toLowerCase()}
        departmentName={department}
      />
    );
  }

  // Als een station is geselecteerd, toon WorkstationHub
  if (selectedStation) {
    return (
      <WorkstationHub
        initialStationId={selectedStation}
        onExit={() => setSelectedStation(null)}
        searchOrder={searchOrder}
      />
    );
  }

  // Toon station selector
  if (loading) {
    return (
      <div className="h-full w-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white flex flex-col p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col py-10">
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 mb-6"
          >
            <ArrowLeft size={14} /> Terug naar Productie Hub
          </button>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-3 uppercase italic tracking-tighter leading-none">
            {department} <span className="text-blue-600">Stations</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            Selecteer een werkstation of management optie
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {stations.map((station) => (
            <button
              key={station.id}
              onClick={() => {
                if (station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") {
                  setShowTeamleader(true);
                } else {
                  setSelectedStation(station.name);
                }
              }}
              className={`group relative p-6 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-500 hover:shadow-xl text-center transition-all duration-200 ${
                (station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? "col-span-2 row-span-2" : ""
              }`}
            >
              <div className={`${
                (station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? "w-20 h-20" : "w-12 h-12"
              } rounded-xl flex items-center justify-center text-white mb-3 shadow-md mx-auto transition-transform group-hover:scale-110 ${
                (station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? "bg-blue-600" : "bg-blue-600"
              }`}
              >
                {(station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? (
                  <Users size={40} />
                ) : (
                  <Cpu size={24} />
                )}
              </div>
              <h3 className={`${
                (station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? "text-lg" : "text-sm"
              } font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors`}>
                {(station.name?.toLowerCase() === "teamleader" || station.id?.toLowerCase() === "teamleader") ? (
                  <>
                    Teamleader <br /> Hub
                  </>
                ) : (
                  station.name
                )}
              </h3>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DepartmentStationSelector;
