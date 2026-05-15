import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Cpu, Loader2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import WorkstationHub from "./WorkstationHub";
import TeamleaderHub from "./TeamleaderHub";
import { useAdminAuth } from "../../hooks/useAdminAuth";
/**
 * DepartmentStationSelector
 * Laadt stations dynamisch uit factory_config in Firestore
 */
const DepartmentStationSelector = ({ department, onBack, searchOrder }) => {
    // Station kleur/icon mapping
    const stationStyles = {
        'teamleader': {
            color: 'bg-yellow-400 text-black border-black',
            icon: _jsx(Users, { size: 40, className: "text-black" })
        },
        'bm': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        },
        'ba': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        },
        'bh': {
            color: 'bg-blue-500 text-white border-blue-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        },
        'mazak': {
            color: 'bg-red-500 text-white border-red-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        },
        'nabewerken': {
            color: 'bg-green-500 text-white border-green-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        },
        'lossen': {
            color: 'bg-yellow-300 text-black border-yellow-600',
            icon: _jsx(Cpu, { size: 24, className: "text-black" })
        },
        'algemeen': {
            color: 'bg-orange-400 text-white border-orange-700',
            icon: _jsx(Cpu, { size: 24, className: "text-white" })
        }
    };
    const { t } = useTranslation();
    const { user } = useAdminAuth();
    const [selectedStation, setSelectedStation] = useState(null);
    const [showTeamleader, setShowTeamleader] = useState(false);
    const [factoryConfig, setFactoryConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    // Luister naar factory config
    useEffect(() => {
        const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setFactoryConfig(snap.data());
            }
            setLoading(false);
        }, (err) => {
            console.error("Factory config error:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    // Bereken stations voor huidige department
    const stations = useMemo(() => {
        if (!factoryConfig || !department)
            return [];
        const slugMap = { FITTINGS: "fittings", PIPES: "pipes", SPOOLS: "spools" };
        const targetSlug = slugMap[department] || department.toLowerCase();
        const deptData = (factoryConfig.departments || []).find((d) => d.slug === targetSlug || d.id === targetSlug || d.name?.toLowerCase() === targetSlug);
        let availableStations = deptData ? (deptData.stations || [])
            .filter(s => {
            const name = (s.name || "").toLowerCase();
            return name !== "algemeen";
        })
            .map(s => ({ id: s.id || s.name, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : [];
        // Filter op toegewezen stations als de gebruiker beperkingen heeft
        if (user && user.allowedStations && Array.isArray(user.allowedStations) && user.allowedStations.length > 0) {
            const allowedNorm = user.allowedStations.map(s => (s || "").toUpperCase().replace(/\s/g, ""));
            availableStations = availableStations.filter(station => {
                const sName = (station.name || "").toUpperCase().replace(/\s/g, "");
                // Check of station naam (bv "BH11") in de allowed lijst staat
                // Ook checken of "TEAMLEADER" toegestaan is voor de teamleader knop
                if (sName.includes("TEAMLEADER") && allowedNorm.includes("TEAMLEADER"))
                    return true;
                return allowedNorm.includes(sName);
            });
        }
        return availableStations;
    }, [factoryConfig, department, user]);
    // Auto-select station if user has only one assigned
    useEffect(() => {
        if (!selectedStation && stations.length === 1) {
            const singleStation = stations[0];
            // Don't auto-select teamleader hub
            if (!singleStation.name.toLowerCase().includes('teamleader')) {
                console.log(`[DeptStationSelector] Auto-selecting single station: ${singleStation.name}`);
                setSelectedStation(singleStation.name);
            }
        }
    }, [stations, selectedStation]);
    // Als Teamleader is geselecteerd, toon TeamleaderHub
    if (showTeamleader) {
        const safeDepartment = String(department || "all");
        return (_jsx(TeamleaderHub, { onBack: () => setShowTeamleader(false), fixedScope: safeDepartment.toLowerCase(), departmentName: safeDepartment }));
    }
    // Als een station is geselecteerd, toon WorkstationHub
    if (selectedStation) {
        return (_jsx(WorkstationHub, { initialStationId: selectedStation, onExit: () => setSelectedStation(null), searchOrder: searchOrder }));
    }
    // Toon station selector
    if (loading) {
        return (_jsx("div", { className: "h-full w-full bg-white flex items-center justify-center", children: _jsx(Loader2, { className: "animate-spin text-blue-600", size: 48 }) }));
    }
    return (_jsx("div", { className: "h-full w-full bg-white flex flex-col p-8 overflow-y-auto", children: _jsxs("div", { className: "max-w-7xl mx-auto w-full flex-1 flex flex-col py-10", children: [_jsxs("div", { className: "mb-8", children: [_jsxs("button", { onClick: onBack, className: "flex items-center gap-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 mb-6", children: [_jsx(ArrowLeft, { size: 14 }), " ", t('departmentSelector.back_to_hub', 'Terug naar Productie Hub')] }), _jsxs("h1", { className: "text-4xl md:text-5xl font-black text-slate-900 mb-3 uppercase italic tracking-tighter leading-none", children: [department, " ", _jsx("span", { className: "text-blue-600", children: t('departmentSelector.stations', 'Stations') })] }), _jsx("p", { className: "text-slate-400 font-bold uppercase tracking-widest text-[10px]", children: t('departmentSelector.select_instruction', 'Selecteer een werkstation of management optie') })] }), stations.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-20 text-slate-400 opacity-60", children: [_jsx(Users, { size: 48, className: "mb-4" }), _jsx("p", { className: "font-bold uppercase tracking-widest text-sm", children: t('departmentSelector.no_assigned', 'Geen stations toegewezen aan uw account') })] })) : (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4", children: stations.map((station) => {
                        const key = station.name?.toLowerCase() || station.id?.toLowerCase();
                        const isTeamleader = key.includes("teamleader");
                        // Bepaal stijl op basis van naam
                        let style = stationStyles.algemeen;
                        if (isTeamleader)
                            style = stationStyles.teamleader;
                        else if (key.includes("bm"))
                            style = stationStyles.bm;
                        else if (key.includes("ba"))
                            style = stationStyles.ba;
                        else if (key.includes("bh"))
                            style = stationStyles.bh;
                        else if (key.includes("mazak"))
                            style = stationStyles.mazak;
                        else if (key.includes("nabewerk"))
                            style = stationStyles.nabewerken;
                        else if (key.includes("lossen"))
                            style = stationStyles.lossen;
                        return (_jsxs("button", { onClick: () => isTeamleader ? setShowTeamleader(true) : setSelectedStation(station.name), className: `group relative p-6 rounded-2xl border-2 border-slate-200 bg-white text-center transition-all duration-200 hover:border-blue-500 hover:shadow-xl ${isTeamleader ? "col-span-2 row-span-2" : ""}`, children: [_jsx("div", { className: `${isTeamleader ? "w-20 h-20" : "w-12 h-12"} rounded-xl flex items-center justify-center mb-3 shadow-md mx-auto transition-transform group-hover:scale-110 ${style.color.split(' ')[0]}`, children: style.icon }), _jsx("h3", { className: `${isTeamleader ? "text-lg" : "text-sm"} font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors`, children: isTeamleader ? _jsx("span", { dangerouslySetInnerHTML: { __html: t('departmentSelector.teamleader_hub_html', 'Teamleader<br/>Hub') } }) : station.name })] }, station.id));
                    }) }))] }) }));
};
export default DepartmentStationSelector;
