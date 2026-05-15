import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck, Loader2, Save, AlertCircle } from "lucide-react";
import { getAuth, updatePassword } from "firebase/auth";
import { clearPasswordChangeFlag } from '../services/planningSecurityService';
const ForcePasswordChangeView = ({ user: _user, onComplete }) => {
    const [newPass, setNewPass] = useState("");
    const [confirmPass, setConfirmPass] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { t } = useTranslation();
    const handleUpdate = async (e) => {
        e.preventDefault();
        if (newPass.length < 6)
            return setError(t('forcePassword.min_length', 'Wachtwoord moet minimaal 6 tekens bevatten.'));
        if (newPass !== confirmPass)
            return setError(t('forcePassword.no_match', 'Wachtwoorden komen niet overeen.'));
        setLoading(true);
        setError(null);
        try {
            const auth = getAuth();
            const currentUser = auth.currentUser;
            await updatePassword(currentUser, newPass);
            await clearPasswordChangeFlag();
            onComplete();
        }
        catch (err) {
            console.error(err);
            setError(t('forcePassword.update_error', 'Fout bij updaten wachtwoord. Mogelijk moet u opnieuw inloggen.'));
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-[1000] bg-slate-900 flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-white w-full max-w-md rounded-[50px] p-10 shadow-2xl animate-in zoom-in-95 text-center", children: [_jsx("div", { className: "w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner", children: _jsx(ShieldCheck, { size: 40 }) }), _jsx("h1", { className: "text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-2", children: t('forcePassword.title', 'Nieuw Wachtwoord') }), _jsx("p", { className: "text-slate-400 text-sm font-medium mb-8", children: t('forcePassword.subtitle', 'U gebruikt momenteel een tijdelijk wachtwoord. Voor de veiligheid moet u dit nu wijzigen.') }), _jsxs("form", { onSubmit: handleUpdate, className: "space-y-4 text-left", children: [_jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block", children: t('forcePassword.new', 'Nieuw Wachtwoord') }), _jsxs("div", { className: "relative", children: [_jsx(Lock, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300", size: 18 }), _jsx("input", { type: "password", className: "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold", value: newPass, onChange: (e) => setNewPass(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", required: true })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block", children: t('forcePassword.confirm', 'Bevestig Wachtwoord') }), _jsxs("div", { className: "relative", children: [_jsx(Lock, { className: "absolute left-4 top-1/2 -translate-y-1/2 text-slate-300", size: 18 }), _jsx("input", { type: "password", className: "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold", value: confirmPass, onChange: (e) => setConfirmPass(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", required: true })] })] }), error && (_jsxs("div", { className: "bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border border-red-100", children: [_jsx(AlertCircle, { size: 16 }), " ", error] })), _jsxs("button", { type: "submit", disabled: loading, className: "w-full py-5 bg-slate-900 text-white rounded-[25px] font-black uppercase text-sm tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 mt-6", children: [loading ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(Save, { size: 20 }), t('forcePassword.update', 'Wachtwoord Bijwerken')] })] })] }) }));
};
export default ForcePasswordChangeView;
