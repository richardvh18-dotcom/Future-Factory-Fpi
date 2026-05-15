import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from "react-i18next";
const TerminalManualInput = ({ isOpen, onClose, value, onChange, onSearch, }) => {
    const { t } = useTranslation();
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in text-left", children: _jsxs("div", { className: "w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden p-10 text-left", children: [_jsx("h3", { className: "text-xl font-black uppercase italic mb-6", children: t("digitalplanning.terminal.quick_search", "Snel zoeken") }), _jsx("input", { autoFocus: true, type: "text", value: value, onChange: (e) => onChange(e.target.value), onKeyDown: (e) => e.key === 'Enter' && onSearch(), className: "w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black text-slate-900 outline-none focus:border-blue-600 transition-all uppercase text-center", placeholder: t("digitalplanning.terminal.number_placeholder", "NUMMER...") }), _jsxs("div", { className: "flex gap-4 mt-8", children: [_jsx("button", { onClick: onClose, className: "flex-1 py-4 text-slate-400 font-black uppercase text-[10px]", children: t("common.cancel", "Annuleren") }), _jsx("button", { onClick: onSearch, className: "flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all", children: t("common.search", "Zoeken") })] })] }) }));
};
export default TerminalManualInput;
