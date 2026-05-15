import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Bevestigen", cancelText = "Annuleren", isDangerous = false, }) => {
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200", children: _jsx("div", { className: "bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border border-white/20", children: _jsxs("div", { className: "p-8 text-center", children: [_jsx("div", { className: `mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-sm ${isDangerous ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`, children: isDangerous ? _jsx(AlertTriangle, { size: 32 }) : _jsx(CheckCircle2, { size: 32 }) }), _jsx("h3", { className: "text-xl font-black text-slate-800 uppercase italic tracking-tight mb-3", children: title }), _jsx("p", { className: "text-sm text-slate-500 font-medium leading-relaxed mb-8 px-4", children: message }), _jsxs("div", { className: "flex gap-3 justify-center", children: [_jsx("button", { onClick: onClose, className: "flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all", children: cancelText }), _jsx("button", { onClick: () => {
                                    onConfirm();
                                    onClose();
                                }, className: `flex-1 py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 ${isDangerous ? "bg-red-600 hover:bg-red-700 shadow-red-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"}`, children: confirmText })] })] }) }) }));
};
export default ConfirmationModal;
