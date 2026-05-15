import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { UserCog, Check, Users, Search, ChevronRight, Loader2, LogOut } from 'lucide-react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS } from '../../config/dbPaths';
const RoleSwitcher = () => {
    const { user, realRole, isImpersonating, impersonateRole: hookImpersonateRole, impersonateUser: hookImpersonateUser, stopImpersonating: hookStopImpersonating } = useAdminAuth();
    // Fallback functies voor als de hook ze niet direct teruggeeft (voorkomt errors)
    const impersonateRole = hookImpersonateRole || ((newRole) => {
        localStorage.setItem('impersonated_role', newRole);
        localStorage.removeItem('impersonated_user_id');
        window.location.reload();
    });
    const impersonateUser = hookImpersonateUser || ((userId) => {
        localStorage.setItem('impersonated_user_id', userId);
        localStorage.removeItem('impersonated_role');
        window.location.reload();
    });
    const stopImpersonating = hookStopImpersonating || (() => {
        localStorage.removeItem('impersonated_role');
        localStorage.removeItem('impersonated_user_id');
        window.location.reload();
    });
    const [isOpen, setIsOpen] = useState(false);
    const [showUserSelect, setShowUserSelect] = useState(false);
    const [usersList, setUsersList] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    // Fallback: Als realRole niet beschikbaar is (oude hook), check localStorage of user.role
    // Als er een impersonated_role in storage zit, zijn we per definitie admin (anders kon je niet switchen)
    const storedImpersonation = typeof window !== 'undefined' ? (localStorage.getItem('impersonated_role') || localStorage.getItem('impersonated_user_id')) : null;
    const effectiveRealRole = realRole || (storedImpersonation ? 'admin' : user?.role);
    const roles = [
        { id: 'admin', label: 'Admin (Standaard)' },
        { id: 'teamleader', label: 'Teamleider' },
        { id: 'planner', label: 'Planner' },
        { id: 'operator', label: 'Operator' },
        { id: 'viewer', label: 'Alleen Lezen' }
    ];
    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            // FIX: Verwijder orderBy om index-errors te voorkomen. Sorteer client-side.
            const q = query(collection(db, ...PATHS.USERS), limit(100));
            const snap = await getDocs(q);
            const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setUsersList(users);
        }
        catch (e) {
            console.error("Fout bij laden gebruikers:", e);
        }
        finally {
            setLoadingUsers(false);
        }
    };
    useEffect(() => {
        if (showUserSelect && usersList.length === 0) {
            loadUsers();
        }
    }, [showUserSelect]);
    // Alleen tonen als de gebruiker admin rechten heeft (of had voor de switch)
    if (effectiveRealRole !== 'admin')
        return null;
    const filteredUsers = usersList.filter(u => (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(searchTerm.toLowerCase()));
    return (_jsxs("div", { className: "relative inline-block", children: [_jsxs("button", { onClick: () => setIsOpen(!isOpen), className: `flex items-center gap-3 px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-xl active:scale-95 ${isImpersonating
                    ? 'bg-amber-500 text-white hover:bg-amber-600 ring-4 ring-amber-500/20'
                    : 'bg-slate-900 text-white hover:bg-slate-800'}`, children: [isImpersonating ? _jsx(LogOut, { size: 18 }) : _jsx(UserCog, { size: 18 }), isImpersonating ? `Stop: ${user?.name || user?.role}` : 'Admin: Wissel Rol / Gebruiker'] }), isOpen && (_jsx("div", { className: "absolute bottom-full left-0 mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 origin-bottom-left z-50", children: !showUserSelect ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "p-4 bg-slate-50 border-b border-slate-100", children: [_jsx("h4", { className: "font-black text-slate-800 uppercase text-xs tracking-widest", children: "Bekijk als..." }), _jsx("p", { className: "text-[10px] text-slate-500 mt-1", children: "Schakel tijdelijk over naar een andere rol of gebruiker." })] }), _jsxs("div", { className: "p-2 space-y-1", children: [roles.map((r) => (_jsxs("button", { onClick: () => {
                                        if (r.id === 'admin')
                                            stopImpersonating();
                                        else
                                            impersonateRole(r.id);
                                        setIsOpen(false);
                                    }, className: `w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all ${user?.role === r.id && !localStorage.getItem('impersonated_user_id')
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-50'}`, children: [r.label, user?.role === r.id && !localStorage.getItem('impersonated_user_id') && _jsx(Check, { size: 14 })] }, r.id))), _jsx("div", { className: "h-px bg-slate-100 my-1" }), _jsxs("button", { onClick: () => setShowUserSelect(true), className: "w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Users, { size: 14 }), " Specifieke Gebruiker"] }), _jsx(ChevronRight, { size: 14 })] })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2", children: [_jsx("button", { onClick: () => setShowUserSelect(false), className: "p-1 hover:bg-slate-200 rounded-full", children: _jsx(ChevronRight, { size: 16, className: "rotate-180" }) }), _jsx("h4", { className: "font-black text-slate-800 uppercase text-xs tracking-widest", children: "Kies Gebruiker" })] }), _jsx("div", { className: "p-2 border-b border-slate-100", children: _jsxs("div", { className: "flex items-center gap-2 bg-slate-100 px-2 py-1.5 rounded-lg", children: [_jsx(Search, { size: 14, className: "text-slate-400" }), _jsx("input", { className: "bg-transparent text-xs outline-none w-full", placeholder: "Zoek naam...", value: searchTerm, onChange: e => setSearchTerm(e.target.value), autoFocus: true })] }) }), _jsx("div", { className: "max-h-64 overflow-y-auto p-2 space-y-1 custom-scrollbar", children: loadingUsers ? (_jsxs("div", { className: "text-center py-8 text-xs text-slate-400 flex flex-col items-center gap-2", children: [_jsx(Loader2, { className: "animate-spin", size: 20 }), " Gebruikers laden..."] })) : (filteredUsers.length > 0 ? filteredUsers.map(u => (_jsxs("button", { onClick: () => {
                                    impersonateUser(u.id);
                                    setIsOpen(false);
                                }, className: `w-full flex items-center justify-between p-2 rounded-lg text-xs text-left transition-all ${user?.uid === u.id
                                    ? 'bg-blue-50 text-blue-700 font-bold'
                                    : 'text-slate-600 hover:bg-slate-50'}`, children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold", children: u.name || 'Naamloos' }), _jsx("div", { className: "text-[10px] opacity-70", children: u.role })] }), user?.uid === u.id && _jsx(Check, { size: 14 })] }, u.id))) : (_jsx("div", { className: "text-center py-4 text-xs text-slate-400 italic", children: "Geen gebruikers gevonden" }))) })] })) }))] }));
};
export default RoleSwitcher;
