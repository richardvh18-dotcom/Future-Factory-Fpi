import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
const LoggedOutView = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    return (_jsx("div", { className: "min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-cyan-950 to-orange-950 text-white", children: _jsxs("div", { className: "bg-white/10 backdrop-blur-xl border-2 border-white/20 rounded-[40px] shadow-2xl p-12 flex flex-col items-center animate-in zoom-in-95 duration-500", children: [_jsx(LogOut, { size: 48, className: "text-rose-400 mb-6" }), _jsx("h1", { className: "text-3xl font-black uppercase italic tracking-tight mb-2", children: t('auth.logged_out_title') }), _jsx("p", { className: "text-cyan-200/80 text-sm font-bold uppercase tracking-[0.2em] mb-8", children: t('auth.logged_out_subtitle') }), _jsx("button", { onClick: () => navigate("/login"), className: "bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-500 transition-all shadow-xl active:scale-95", children: t('auth.login_again') })] }) }));
};
export default LoggedOutView;
