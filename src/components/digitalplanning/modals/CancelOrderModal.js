import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
const CancelOrderModal = ({ isOpen, onClose, onConfirm, orderId, isProcessing = false }) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    if (!isOpen)
        return null;
    const handleSubmit = () => {
        if (!reason.trim() || reason.length < 5) {
            setError('Geef een duidelijke reden op (minimaal 5 tekens).');
            return;
        }
        onConfirm(reason);
    };
    return (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100", children: [_jsxs("div", { className: "bg-red-50 p-4 border-b border-red-100 flex justify-between items-center", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "p-2 bg-red-100 rounded-full text-red-600", children: _jsx(AlertTriangle, { size: 20 }) }), _jsx("h3", { className: "font-bold text-red-900", children: "Order Annuleren" })] }), _jsx("button", { onClick: onClose, className: "text-red-400 hover:text-red-600 transition-colors", children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "p-6 space-y-4", children: [_jsxs("p", { className: "text-sm text-slate-600", children: ["Je staat op het punt order ", _jsx("span", { className: "font-bold text-slate-900", children: orderId }), " te annuleren. Dit verwijdert de order niet definitief, maar markeert deze als geannuleerd."] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-xs font-bold uppercase text-slate-500 tracking-wider", children: ["Reden van annulering ", _jsx("span", { className: "text-red-500", children: "*" })] }), _jsx("textarea", { value: reason, onChange: (e) => {
                                        setReason(e.target.value);
                                        setError('');
                                    }, placeholder: "Bijv. Dubbele invoer, klant heeft geannuleerd, foutieve specificaties...", className: "w-full p-3 text-sm border-2 border-slate-200 rounded-xl focus:border-red-500 focus:ring-0 outline-none min-h-[100px] resize-none", autoFocus: true }), error && _jsx("p", { className: "text-xs font-bold text-red-500 animate-pulse", children: error })] })] }), _jsxs("div", { className: "p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3", children: [_jsx("button", { onClick: onClose, className: "px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors", disabled: isProcessing, children: "Terug" }), _jsxs("button", { onClick: handleSubmit, disabled: isProcessing, className: "px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg shadow-red-900/20 transition-all flex items-center gap-2", children: [isProcessing ? _jsx(Loader2, { size: 16, className: "animate-spin" }) : null, "Bevestig Annulering"] })] })] }) }));
};
export default CancelOrderModal;
