import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Cpu, Loader2, Users, FlaskConical, SearchCheck, Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { getPathString, PATHS } from "../../config/dbPaths";
import WorkstationHub from "./WorkstationHub";
import TeamleaderHub from "./TeamleaderHub";
import { useAdminAuth } from "../../hooks/useAdminAuth";

type Station = {
  id?: string;
  name?: string;
  type?: string;
  isAvailableForPlanning?: boolean;
};

type Department = {
  id?: string;
  slug?: string;
  name?: string;
  stations?: Station[];
};

type FactoryConfig = {
  departments?: Department[];
};

type DepartmentStationSelectorProps = {
  department: string;
  onBack: () => void;
  searchOrder?: string;
};

type AdminUser = {
  allowedStations?: string[];
};

type StationItem = {
  id?: string;
  name?: string;
  type?: string;
  isVirtualLotAction?: boolean;
  isQcHubAction?: boolean;
};

/**
 * DepartmentStationSelector
 * Laadt stations dynamisch uit factory_config in Firestore
 */
const DepartmentStationSelector = ({ department, onBack, searchOrder }: DepartmentStationSelectorProps) => {
    const normalizeKey = (value: string | undefined | null): string =>
      String(value || "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

    const resolveDepartmentAliases = (rawDepartment: string): string[] => {
      const normalized = normalizeKey(rawDepartment);
      const aliases = new Set<string>([normalized]);

      if (normalized === "fittings" || normalized === "fitting") {
        aliases.add("fittings");
        aliases.add("fitting");
      }
      if (normalized === "pipes" || normalized === "pipe") {
        aliases.add("pipes");
        aliases.add("pipe");
      }
      if (normalized === "spools" || normalized === "spool") {
        aliases.add("spools");
        aliases.add("spool");
      }
      if (normalized === "qc" || normalized === "qualitycontrol" || normalized === "kwaliteit") {
        aliases.add("qc");
        aliases.add("qualitycontrol");
        aliases.add("kwaliteit");
      }

      return Array.from(aliases);
    };

    // Station kleur/icon mapping
    const stationStyles = {
      'teamleader': {
        color: 'bg-yellow-400 text-black border-black',
        icon: <Users size={40} className="text-black" />
      },
      'bm': {
        color: 'bg-blue-500 text-white border-blue-700',
        icon: <Cpu size={24} className="text-white" />
      },
      'ba': {
        color: 'bg-blue-500 text-white border-blue-700',
        icon: <Cpu size={24} className="text-white" />
      },
      'bh': {
        color: 'bg-blue-500 text-white border-blue-700',
        icon: <Cpu size={24} className="text-white" />
      },
      'mazak': {
        color: 'bg-red-500 text-white border-red-700',
        icon: <Cpu size={24} className="text-white" />
      },
      'nabewerken': {
        color: 'bg-green-500 text-white border-green-700',
        icon: <Cpu size={24} className="text-white" />
      },
      'lossen': {
        color: 'bg-yellow-300 text-black border-yellow-600',
        icon: <Cpu size={24} className="text-black" />
      },
      'lab': {
        color: 'bg-cyan-100 text-cyan-800 border-cyan-300',
        icon: <FlaskConical size={24} className="text-cyan-700" />
      },
      'inspector': {
        color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        icon: <SearchCheck size={24} className="text-indigo-700" />
      },
      'workplace': {
        color: 'bg-slate-100 text-slate-800 border-slate-300',
        icon: <Briefcase size={24} className="text-slate-700" />
      },
      'algemeen': {
        color: 'bg-orange-400 text-white border-orange-700',
        icon: <Cpu size={24} className="text-white" />
      }
    };
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAdminAuth() as { user: AdminUser | null };
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [pendingWorkplace, setPendingWorkplace] = useState<StationItem | null>(null);
  const [showTeamleader, setShowTeamleader] = useState(false);
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Luister naar factory config
  useEffect(() => {
    const docRef = doc(db, getPathString(PATHS.FACTORY_CONFIG));

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setFactoryConfig(snap.data() as FactoryConfig);
        }
        setLoading(false);
      },
      (err: unknown) => {
        console.error("Factory config error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Bereken stations voor huidige department
  const matchedDepartment = useMemo(() => {
    if (!factoryConfig || !department) return undefined;
    const departmentKeys = resolveDepartmentAliases(department);

    return (factoryConfig.departments || []).find(
      (d) => {
        const slugKey = normalizeKey(d.slug);
        const idKey = normalizeKey(d.id);
        const nameKey = normalizeKey(d.name);
        return departmentKeys.includes(slugKey) || departmentKeys.includes(idKey) || departmentKeys.includes(nameKey);
      }
    );
  }, [factoryConfig, department]);

  const displayDepartmentName = String(
    matchedDepartment?.name || matchedDepartment?.slug || matchedDepartment?.id || department || ""
  );

  const stations = useMemo(() => {
    if (!matchedDepartment) return [];

    let availableStations: StationItem[] = (matchedDepartment.stations || [])
      .filter((s) => {
        if (s.isAvailableForPlanning === false) return false;
        const name = (s.name || "").toLowerCase();
        return name !== "algemeen";
      })
      .map((s) => ({ id: s.id || s.name, name: s.name || "", type: s.type || "" }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const deptKey = normalizeKey(`${matchedDepartment.name || ""} ${matchedDepartment.slug || ""} ${matchedDepartment.id || ""}`);
    const isQcDepartment = deptKey.includes("qc") || deptKey.includes("quality") || deptKey.includes("kwaliteit");

    if (isQcDepartment) {
      availableStations = [
        {
          id: "QC_VIRTUAL_LOT_ISSUANCE",
          name: t("departmentSelector.virtual_lot_issuance", "Virtuele Lotuitgifte"),
          type: "function",
          isVirtualLotAction: true,
        },
        ...availableStations,
      ];
    }

    // Filter op toegewezen stations als de gebruiker beperkingen heeft
    if (user && user.allowedStations && Array.isArray(user.allowedStations) && user.allowedStations.length > 0) {
      const allowedNorm = user.allowedStations.map((s) => (s || "").toUpperCase().replace(/\s/g, ""));
      
      availableStations = availableStations.filter((station) => {
        if (station.isVirtualLotAction || station.isQcHubAction) return true;
        const sName = (station.name || "").toUpperCase().replace(/\s/g, "");
        // Check of station naam (bv "BH11") in de allowed lijst staat
        // Ook checken of "TEAMLEADER" toegestaan is voor de teamleader knop
        if (sName.includes("TEAMLEADER") && allowedNorm.includes("TEAMLEADER")) return true;
        return allowedNorm.includes(sName);
      });
    }

    return availableStations;
  }, [matchedDepartment, user, t]);

  const isMachineLikeStation = (station: StationItem): boolean => {
    if (station.isVirtualLotAction || station.isQcHubAction) return false;
    const normalizedName = normalizeKey(station.name || station.id);
    if (["chemichlab", "chemicallab", "chemischlab"].includes(normalizedName)) return false;
    const type = String(station.type || "").toLowerCase().trim();
    if (!type) return true;
    return type === "machine" || type === "teamleader";
  };

  const getTranslatedStationName = (stationLike: StationItem | null | undefined): string => {
    const rawName = String(stationLike?.name || "").trim();
    const normalized = normalizeKey(rawName);

    if (["chemichlab", "chemicallab", "chemischlab"].includes(normalized)) {
      return t("departmentSelector.workplaces.chemical_lab", "Chemisch Lab");
    }

    return rawName;
  };

  // Auto-select station if user has only one assigned
  useEffect(() => {
    if (!selectedStation && stations.length === 1) {
      const singleStation = stations[0];
      // Don't auto-select teamleader hub
      if (!String(singleStation.name || "").toLowerCase().includes('teamleader')) {
        setSelectedStation(String(singleStation.name || ""));
      }
    }
  }, [stations, selectedStation]);

  // Als Teamleader is geselecteerd, toon TeamleaderHub
  if (showTeamleader) {
    const safeDepartment = String(matchedDepartment?.slug || matchedDepartment?.id || department || "all");
    return (
      <TeamleaderHub 
        onBack={() => setShowTeamleader(false)} 
        fixedScope={safeDepartment.toLowerCase()}
        departmentName={displayDepartmentName}
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
            <ArrowLeft size={14} /> {t('departmentSelector.back_to_hub', 'Terug naar Productie Hub')}
          </button>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-3 uppercase italic tracking-tighter leading-none">
            {displayDepartmentName} <span className="text-blue-600">{t('departmentSelector.stations', 'Stations')}</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            {t('departmentSelector.select_instruction', 'Selecteer een werkstation of management optie')}
          </p>
          {pendingWorkplace && (
            <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
              {t(
                'departmentSelector.workplace_not_configured',
                'Werkplek {{name}} ({{type}}) is nog niet gekoppeld aan een productieflow.'
              , {
                name: getTranslatedStationName(pendingWorkplace) || 'Onbekend',
                type: pendingWorkplace.type || 'function',
              })}
            </p>
          )}
        </div>

        {stations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 opacity-60">
            <Users size={48} className="mb-4" />
            <p className="font-bold uppercase tracking-widest text-sm">{t('departmentSelector.no_assigned', 'Geen stations toegewezen aan uw account')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {stations.map((station) => {
            const key = (station.name || station.id || "").toLowerCase();
            const stationType = String(station.type || "").toLowerCase();
            const isTeamleader = key.includes("teamleader");
            
            // Bepaal stijl op basis van naam
            let style = stationStyles.algemeen;
            if (isTeamleader) style = stationStyles.teamleader;
            else if (stationType.includes("lab") || key.includes("lab") || key.includes("qc_hub")) style = stationStyles.lab;
            else if (stationType.includes("inspect") || key.includes("inspect") || key.includes("tester") || key.includes("testing")) style = stationStyles.inspector;
            else if (stationType && !stationType.includes("machine")) style = stationStyles.workplace;
            else if (key.includes("bm")) style = stationStyles.bm;
            else if (key.includes("ba")) style = stationStyles.ba;
            else if (key.includes("bh")) style = stationStyles.bh;
            else if (key.includes("mazak")) style = stationStyles.mazak;
            else if (key.includes("nabewerk")) style = stationStyles.nabewerken;
            else if (key.includes("lossen")) style = stationStyles.lossen;

            return (
              <button
                key={station.id}
                onClick={() => {
                  if (isTeamleader) {
                    setPendingWorkplace(null);
                    setShowTeamleader(true);
                    return;
                  }

                  const normalizedName = normalizeKey(station.name || station.id);
                  if (station.isQcHubAction || ["chemichlab", "chemicallab", "chemischlab"].includes(normalizedName)) {
                    setPendingWorkplace(null);
                    navigate("/qc");
                    return;
                  }

                  if (station.isVirtualLotAction) {
                    setPendingWorkplace(null);
                    navigate("/admin", { state: { openScreen: "qshe_virtual_lots" } });
                    return;
                  }

                  if (!isMachineLikeStation(station)) {
                    setPendingWorkplace(station);
                    return;
                  }

                  setPendingWorkplace(null);
                  setSelectedStation(String(station.name || station.id || ""));
                }}
                className={`group relative p-6 rounded-2xl border-2 border-slate-200 bg-white text-center transition-all duration-200 hover:border-blue-500 hover:shadow-xl ${isTeamleader ? "col-span-2 row-span-2" : ""}`}
              >
                <div className={`${isTeamleader ? "w-20 h-20" : "w-12 h-12"} rounded-xl flex items-center justify-center mb-3 shadow-md mx-auto transition-transform group-hover:scale-110 ${style.color.split(' ')[0]}`}> 
                  {style.icon}
                </div>
                <h3 className={`${isTeamleader ? "text-lg" : "text-sm"} font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors`}>
                  {isTeamleader
                    ? <span dangerouslySetInnerHTML={{__html: t('departmentSelector.teamleader_hub_html', 'Teamleader<br/>Hub')}} />
                    : getTranslatedStationName(station)}
                </h3>
              </button>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentStationSelector;
