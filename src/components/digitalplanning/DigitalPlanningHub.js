import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck
import React, { useState, useEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { ArrowLeft, Activity, Monitor, Cpu, Calendar, Loader2, AlertTriangle, } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
const DepartmentStationSelector = React.lazy(() => import('./DepartmentStationSelector'));
const PlannerHub = React.lazy(() => import("./PlannerHub.tsx"));
const TeamleaderHub = React.lazy(() => import('./TeamleaderHub'));
/**
 * DigitalPlanningHub V5.0 - Stability Edition
 * Voorkomt witte schermen bij refresh door fallback-logica en
 * het opvangen van ontbrekende router states.
 */
const DigitalPlanningHub = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAdminAuth();
    const [activeDept, setActiveDept] = useState(null);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [searchOrderNumber, setSearchOrderNumber] = useState(null);
    const [factoryConfig, setFactoryConfig] = useState(null);
    const [configLoading, setConfigLoading] = useState(true);
    // Laad factory config voor station-afdeling mapping
    useEffect(() => {
        const docRef = doc(db, ...PATHS.FACTORY_CONFIG);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setFactoryConfig(snap.data());
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
                    stationDept = dept.id || dept.slug;
                    break;
                }
            }
            if (stationDept) {
                setActiveDept(stationDept.toUpperCase());
                return; // Stop verdere logica om reset te voorkomen
            }
        }
        try {
            console.log('[DigitalPlanningHub] Location:', location.pathname);
            console.log('[DigitalPlanningHub] State:', location.state);
            if (location.state?.searchOrder) {
                console.log('[DigitalPlanningHub] Search order:', location.state.searchOrder);
                setSearchOrderNumber(location.state.searchOrder);
            }
            // Als we via een link met state binnenkomen (bijv. vanaf Portal)
            if (location.state?.initialView) {
                console.log('[DigitalPlanningHub] Setting activeDept:', location.state.initialView);
                setActiveDept(location.state.initialView);
            }
            else if (!location.state?.searchOrder) {
                // FIX: Reset naar hoofdmenu als er geen specifieke state is (bijv. klik op Sidebar)
                // Dit zorgt ervoor dat een klik op 'Planning' je altijd terugbrengt naar de start
                setActiveDept(null);
            }
        }
        catch (err) {
            console.error("Fout bij initialiseren planning view:", err);
            setErrorMessage(err.message);
            setHasError(true);
        }
    }, [location, user, factoryConfig, configLoading]); // Trigger bij elke navigatie en als user/config data laadt
    const DEPARTMENTS = [
        {
            id: "FITTINGS",
            title: t("digitalplanning.hub.fitting_title"),
            icon: _jsx(Monitor, { size: 40 }),
            description: "",
            color: "bg-emerald-600",
        },
        {
            id: "PIPES",
            title: t("digitalplanning.hub.pipe_title"),
            icon: _jsx(Cpu, { size: 40 }),
            description: "",
            color: "bg-orange-600",
        },
        {
            id: "SPOOLS",
            title: t("digitalplanning.hub.spools_title"),
            icon: _jsx(Activity, { size: 40 }),
            description: "",
            color: "bg-purple-600",
        },
        {
            id: "PLANNER",
            title: t("digitalplanning.hub.planner_title"),
            icon: _jsx(Calendar, { size: 40 }),
            description: t("digitalplanning.hub.planner_desc"),
            color: "bg-slate-600",
        },
    ];
    // Foutscherm als er iets kritiek misgaat
    if (hasError) {
        return (_jsxs("div", { className: "h-full flex flex-col items-center justify-center p-10 bg-slate-50", children: [_jsx(AlertTriangle, { size: 48, className: "text-rose-500 mb-4" }), _jsx("h2", { className: "text-xl font-black uppercase", children: t("digitalplanning.hub.system_error_title") }), _jsx("p", { className: "text-slate-500 text-sm mt-2", children: t("digitalplanning.hub.system_error_desc") }), errorMessage && (_jsx("p", { className: "text-rose-600 text-xs mt-2 font-mono bg-rose-50 p-3 rounded", children: errorMessage })), _jsx("button", { onClick: () => window.location.reload(), className: "mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs", children: t("digitalplanning.hub.recover") })] }));
    }
    // Toon de Planner Hub (Centrale Planning)
    if (activeDept === "PLANNER") {
        return (_jsx(Suspense, { fallback: _jsx("div", { className: "h-full flex items-center justify-center", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) }), children: _jsx(PlannerHub, { onBack: () => setActiveDept(null) }) }));
    }
    // Toon de Teamleader Hub (Direct Dashboard)
    if (activeDept === "TEAMLEADER") {
        return (_jsx(Suspense, { fallback: _jsx("div", { className: "h-full flex items-center justify-center", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) }), children: _jsx(TeamleaderHub, { onBack: () => setActiveDept(null) }) }));
    }
    // Toon de Workstation Hub (Afdelings-specifiek)
    if (activeDept) {
        return (_jsx(Suspense, { fallback: _jsx("div", { className: "h-full flex items-center justify-center", children: _jsx(Loader2, { className: "animate-spin text-blue-500" }) }), children: _jsx(DepartmentStationSelector, { department: activeDept, onBack: () => setActiveDept(null), searchOrder: searchOrderNumber }, activeDept) }));
    }
    // Toon het hoofdmenu (Productie Hub Keuze)
    return (_jsx("div", { className: "h-full w-full bg-white flex flex-col p-8 overflow-y-auto", children: _jsxs("div", { className: "max-w-7xl mx-auto w-full flex-1 flex flex-col justify-center py-10", children: [_jsxs("div", { className: "text-center mb-12", children: [_jsxs("h1", { className: "text-5xl md:text-6xl font-black text-slate-900 mb-3 uppercase italic tracking-tighter leading-none", children: [t("digitalplanning.hub.title"), " ", _jsx("span", { className: "text-blue-600", children: t("digitalplanning.hub.title_hub") })] }), _jsx("p", { className: "text-slate-400 font-bold uppercase tracking-widest text-[10px]", children: t("digitalplanning.hub.subtitle") })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto w-full", children: DEPARTMENTS.map((dept) => (_jsxs("button", { onClick: () => setActiveDept(dept.id), className: "group relative p-10 rounded-3xl border-2 border-slate-200 bg-white hover:border-blue-500 hover:shadow-2xl text-center transition-all duration-300", children: [_jsx("div", { className: `w-20 h-20 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg mx-auto transition-transform group-hover:scale-110 ${dept.color}`, children: dept.icon }), _jsx("h3", { className: "text-xl font-black text-slate-800 uppercase tracking-tight mb-2 group-hover:text-blue-600 transition-colors italic", children: dept.title }), dept.description && (_jsx("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-relaxed", children: dept.description }))] }, dept.id))) }), _jsx("div", { className: "mt-16 flex justify-center", children: _jsxs("button", { onClick: () => navigate("/portal"), className: "flex items-center gap-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] tracking-[0.2em] transition-all bg-slate-50 px-6 py-3 rounded-xl border border-slate-200", children: [_jsx(ArrowLeft, { size: 14 }), " ", t("digitalplanning.hub.back_to_portal")] }) })] }) }));
};
export default DigitalPlanningHub;
