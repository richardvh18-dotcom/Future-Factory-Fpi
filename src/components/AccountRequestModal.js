import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, UserPlus, Mail, User, Globe, Building2, Send, CheckCircle } from "lucide-react";
import { submitAccountRequest } from '../services/planningSecurityService';
/**
 * AccountRequestModal - Formulier voor account aanvraag
 */
const AccountRequestModal = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({ name: "", email: "", country: "", department: "" });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState(null);
    const departments = [
        "Productie - Fittings", "Productie - Pipes", "Productie - Spools",
        "Kwaliteitscontrole", "Planning", "Logistiek", "Magazijn",
        "Onderhoud", "Management", "Administratie", "Anders",
    ];
    const countries = ["Nederland", "België", "Duitsland", "Frankrijk", "Verenigd Koninkrijk", "Anders"];
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await submitAccountRequest({
                name: formData.name,
                email: formData.email,
                country: formData.country,
                department: formData.department,
            });
            setSubmitted(true);
            setTimeout(() => {
                setFormData({ name: "", email: "", country: "", department: "" });
                setSubmitted(false);
                onClose();
            }, 3000);
        }
        catch (err) {
            console.error(t('accountRequest.submit_error_console', 'Error submitting request:'), err);
            setError(t('accountRequest.submit_error', 'Error submitting request'));
        }
        finally {
            setLoading(false);
        }
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200", children: _jsx("div", { className: "bg-gradient-to-br from-slate-900 via-cyan-950 to-blue-950 rounded-[40px] shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 border-2 border-white/20", children: submitted ? (_jsxs("div", { className: "p-12 text-center", children: [_jsx("div", { className: "mb-6 flex justify-center", children: _jsx("div", { className: "p-6 bg-green-500/20 rounded-full", children: _jsx(CheckCircle, { size: 64, className: "text-green-400" }) }) }), _jsx("h2", { className: "text-3xl font-black text-white uppercase italic tracking-tighter mb-4", children: t('accountRequest.success.title', 'Request Sent') }), _jsx("p", { className: "text-cyan-200/80 text-sm font-medium leading-relaxed", children: t('accountRequest.success.message', 'Your request has been sent to the administrators.') })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "p-8 text-white border-b border-white/10", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("div", { className: "p-3 bg-cyan-500/20 rounded-2xl", children: _jsx(UserPlus, { size: 24, className: "text-cyan-400" }) }), _jsx("h2", { className: "text-3xl font-black uppercase italic tracking-tighter", children: t('accountRequest.title', 'Request Account') })] }), _jsx("p", { className: "text-cyan-200/60 text-sm font-bold", children: t('accountRequest.subtitle', 'Enter your details below') })] }), _jsx("button", { onClick: onClose, className: "p-2 hover:bg-white/10 rounded-xl transition-colors", children: _jsx(X, { size: 24 }) })] }) }), _jsxs("form", { onSubmit: handleSubmit, className: "p-8 space-y-5", children: [error && (_jsx("div", { className: "bg-rose-500/20 border-2 border-rose-400/50 p-4 rounded-2xl text-rose-200 text-sm font-bold", children: error })), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2", children: [_jsx(User, { size: 12 }), " ", t('accountRequest.form.name', 'Name')] }), _jsx("input", { type: "text", name: "name", required: true, value: formData.name, onChange: handleChange, placeholder: "bijv. Jan Jansen", className: "w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2", children: [_jsx(Mail, { size: 12 }), " ", t('accountRequest.form.email', 'Email')] }), _jsx("input", { type: "email", name: "email", required: true, value: formData.email, onChange: handleChange, placeholder: "naam@futurepipe.com", className: "w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900 placeholder:text-slate-400" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2", children: [_jsx(Globe, { size: 12 }), " ", t('accountRequest.form.country', 'Country')] }), _jsxs("select", { name: "country", required: true, value: formData.country, onChange: handleChange, className: "w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900", children: [_jsx("option", { value: "", children: t('accountRequest.form.select_country', 'Select country') }), countries.map((c) => _jsx("option", { value: c, children: c }, c))] })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-[10px] font-black text-cyan-200/80 uppercase tracking-widest ml-1 flex items-center gap-2", children: [_jsx(Building2, { size: 12 }), " ", t('accountRequest.form.department', 'Department')] }), _jsxs("select", { name: "department", required: true, value: formData.department, onChange: handleChange, className: "w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-cyan-500 transition-all text-sm text-slate-900", children: [_jsx("option", { value: "", children: t('accountRequest.form.select_department', 'Select department') }), departments.map((d) => _jsx("option", { value: d, children: d }, d))] })] }), _jsxs("div", { className: "flex gap-3 pt-4", children: [_jsx("button", { type: "button", onClick: onClose, className: "flex-1 px-6 py-4 bg-white/10 border-2 border-white/20 text-cyan-200 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/20 transition-all", children: t('accountRequest.actions.cancel', 'Cancel') }), _jsx("button", { type: "submit", disabled: loading, className: "flex-1 px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl", children: loading ? (_jsx("div", { className: "animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" })) : (_jsxs(_Fragment, { children: [_jsx(Send, { size: 16 }), t('accountRequest.actions.send', 'Send Request')] })) })] })] })] })) }) }));
};
export default AccountRequestModal;
