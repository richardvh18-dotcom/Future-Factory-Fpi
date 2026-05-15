import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { Loader2, ShieldAlert } from "lucide-react";
const ProtectedRoute = ({ children }) => {
    const { t } = useTranslation();
    const { user, role, loading, isAdmin } = useAdminAuth();
    if (loading) {
        return (_jsxs("div", { className: "h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-blue-600", children: [_jsx(Loader2, { className: "animate-spin mb-4", size: 48 }), _jsx("p", { className: "font-bold text-sm uppercase tracking-widest", children: t('auth.checking_rights') })] }));
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    if (!isAdmin && role !== "admin") {
        return (_jsxs("div", { className: "h-screen w-full flex flex-col items-center justify-center bg-red-50 text-red-600 p-8 text-center", children: [_jsx(ShieldAlert, { size: 64, className: "mb-6" }), _jsx("h1", { className: "text-3xl font-black uppercase italic mb-2", children: t('auth.access_denied') }), _jsx("p", { className: "font-medium mb-8 max-w-md", children: t('auth.no_admin_rights', { email: user.email }) }), _jsx("div", { className: "bg-white p-4 rounded-xl border border-red-200 text-left text-xs font-mono text-slate-600 mb-8", children: t('auth.detected_role', { role: role || t('common.none') }) }), _jsx("a", { href: "/portal", className: "px-8 py-3 bg-red-600 text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-red-700 transition-all", children: t('auth.back_to_portal') })] }));
    }
    return _jsx(_Fragment, { children: children });
};
export default ProtectedRoute;
