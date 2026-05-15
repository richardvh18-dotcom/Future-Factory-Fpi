import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth, logActivity } from '../../config/firebase';
import { PATHS } from '../../config/dbPaths';
import { User, Check, Save, X, Shield, Loader2, MapPin, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../contexts/NotificationContext';
const UserStationManager = () => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [users, setUsers] = useState([]);
    const [allStations, setAllStations] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [tempAllowed, setTempAllowed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCountry, setFilterCountry] = useState("All");
    const [filterDept, setFilterDept] = useState("All");
    useEffect(() => {
        // 1. Users ophalen
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setUsers(userList);
        });
        // 2. Stations ophalen uit Factory Config
        const unsubConfig = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
            if (snap.exists()) {
                const config = snap.data();
                const stations = [];
                if (config.departments) {
                    config.departments.forEach(dept => {
                        if (dept.stations) {
                            dept.stations.forEach(st => {
                                stations.push({
                                    id: st.name,
                                    name: st.name,
                                    department: dept.title || dept.name || t('common.other', "Overig"),
                                    country: dept.country || t('common.other', "Overig")
                                });
                            });
                        }
                    });
                }
                // DEBUG: Controleer in de browser console (F12) welke landen er geladen worden
                console.log("🌍 Gevonden landen in config:", [...new Set(stations.map(s => s.country))]);
                // Voeg speciale rollen toe
                stations.push({
                    id: 'TEAMLEADER',
                    name: t('adminUserStation.teamleaderHub', 'Teamleader Hub'),
                    department: t('adminUserStation.management', 'Management'),
                    country: t('adminUserStation.global', 'Global')
                });
                setAllStations(stations);
            }
            setLoading(false);
        });
        return () => {
            unsubUsers();
            unsubConfig();
        };
    }, []);
    const handleUserSelect = (user) => {
        setSelectedUser(user);
        setFilterCountry("All");
        setFilterDept("All");
        // Als allowedStations niet bestaat of leeg is, gaan we ervan uit dat ze toegang hebben tot ALLES (standaard gedrag)
        // Om te editen zetten we dan alle vinkjes AAN, zodat je kunt zien dat ze alles hebben en kunt gaan beperken.
        if (!user.allowedStations) {
            setTempAllowed(allStations.map(s => s.id));
        }
        else {
            setTempAllowed(user.allowedStations);
        }
    };
    const handleSave = async () => {
        if (!selectedUser)
            return;
        try {
            const userRef = doc(db, 'users', selectedUser.id);
            await updateDoc(userRef, {
                allowedStations: tempAllowed
            });
            await logActivity(auth.currentUser?.uid, "USER_UPDATE", `Station access updated for user: ${selectedUser.email}`);
            setSelectedUser(null);
            // Optioneel: Toon succes melding
        }
        catch (error) {
            console.error("Fout bij opslaan:", error);
            notify(t('adminUserStation.saveError', { message: error.message }));
        }
    };
    // Filter logica
    const filteredStations = allStations.filter(s => {
        if (filterCountry !== "All" && s.country !== filterCountry)
            return false;
        if (filterDept !== "All" && s.department !== filterDept)
            return false;
        return true;
    });
    const uniqueCountries = ["All", ...new Set(allStations.map(s => s.country))].sort();
    const uniqueDepts = ["All", ...new Set(allStations.filter(s => filterCountry === "All" || s.country === filterCountry).map(s => s.department))].sort();
    if (loading)
        return _jsx("div", { className: "p-8 flex justify-center", children: _jsx(Loader2, { className: "animate-spin" }) });
    return (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]", children: [_jsxs("div", { className: "bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col", children: [_jsx("div", { className: "p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700", children: t('adminUserStation.users', 'Gebruikers') }), _jsx("div", { className: "overflow-y-auto flex-1 p-2 space-y-1", children: users.map(user => (_jsxs("button", { onClick: () => handleUserSelect(user), className: `w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ${selectedUser?.id === user.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 text-slate-600'}`, children: [_jsx("div", { className: "bg-slate-200 p-2 rounded-full", children: _jsx(User, { size: 16 }) }), _jsxs("div", { className: "truncate", children: [_jsx("div", { className: "font-bold text-sm", children: user.name || user.email || t('common.unknown') }), _jsx("div", { className: "text-xs opacity-70", children: user.role || t('adminUserStation.user', 'Gebruiker') })] })] }, user.id))) })] }), _jsx("div", { className: "md:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col", children: selectedUser ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center", children: [_jsx("span", { className: "font-bold text-slate-700", children: t('adminUserStation.accessFor', { name: selectedUser.name || selectedUser.email }) }), _jsx("div", { className: "flex gap-2", children: _jsx("button", { onClick: () => setSelectedUser(null), className: "p-2 text-slate-400 hover:text-slate-600", children: _jsx(X, { size: 20 }) }) })] }), _jsxs("div", { className: "px-6 pt-4 pb-2 grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-1", children: t('adminUserStation.location', 'Locatie') }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("select", { value: filterCountry, onChange: (e) => { setFilterCountry(e.target.value); setFilterDept("All"); }, className: "w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer", children: uniqueCountries.map(c => _jsx("option", { value: c, children: c === "All" ? t('common.all', 'Alles') : c }, c)) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase ml-1", children: t('adminUserStation.department', 'Afdeling') }), _jsxs("div", { className: "relative", children: [_jsx(Briefcase, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("select", { value: filterDept, onChange: (e) => setFilterDept(e.target.value), className: "w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer", children: uniqueDepts.map(d => _jsx("option", { value: d, children: d === "All" ? t('common.all', 'Alles') : d }, d)) })] })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [filteredStations.map(station => (_jsxs("label", { className: `flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${tempAllowed.includes(station.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`, children: [_jsx("div", { className: `w-5 h-5 rounded border flex items-center justify-center ${tempAllowed.includes(station.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'}`, children: tempAllowed.includes(station.id) && _jsx(Check, { size: 14 }) }), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm text-slate-700", children: station.name }), _jsx("div", { className: "text-xs text-slate-400", children: station.department })] })] }, station.id))), filteredStations.length === 0 && (_jsx("div", { className: "col-span-2 text-center py-8 text-slate-400 text-xs italic", children: t('adminUserStation.noStationsFound', 'Geen stations gevonden.') }))] }) }), _jsx("div", { className: "p-4 border-t border-slate-100 bg-slate-50 flex justify-end", children: _jsxs("button", { onClick: handleSave, className: "flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors", children: [_jsx(Save, { size: 18 }), " ", t('adminUserStation.save', 'Opslaan')] }) })] })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center text-slate-400", children: [_jsx(Shield, { size: 48, className: "mb-4 opacity-20" }), _jsx("p", { children: t('adminUserStation.selectUser', 'Selecteer een gebruiker om rechten te beheren') })] })) })] }));
};
export default UserStationManager;
