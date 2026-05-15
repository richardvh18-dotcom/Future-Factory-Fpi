import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, HelpCircle, XCircle } from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
const ConfirmDialog = () => {
    const { confirmDialog, resolveConfirm } = useNotifications();
    if (!confirmDialog)
        return null;
    const getToneClasses = (tone) => {
        switch (tone) {
            case "danger":
                return {
                    icon: _jsx(XCircle, { className: "h-6 w-6" }),
                    iconWrap: "text-rose-700 bg-rose-100 border-rose-200",
                    confirm: "bg-rose-600 hover:bg-rose-700 text-white",
                };
            case "info":
                return {
                    icon: _jsx(HelpCircle, { className: "h-6 w-6" }),
                    iconWrap: "text-blue-700 bg-blue-100 border-blue-200",
                    confirm: "bg-blue-600 hover:bg-blue-700 text-white",
                };
            case "warning":
            default:
                return {
                    icon: _jsx(AlertTriangle, { className: "h-6 w-6" }),
                    iconWrap: "text-amber-700 bg-amber-100 border-amber-200",
                    confirm: "bg-amber-500 hover:bg-amber-600 text-slate-900",
                };
        }
    };
    const toneClasses = getToneClasses(confirmDialog.tone);
    return (_jsx("div", { className: "fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm", children: _jsx("div", { className: "w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_35px_85px_-35px_rgba(15,23,42,0.7)] animate-in", children: _jsxs("div", { className: "p-6 sm:p-7", children: [_jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: `mt-0.5 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border ${toneClasses.iconWrap}`, children: toneClasses.icon }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "text-sm font-black uppercase tracking-[0.2em] text-slate-800 sm:text-base", children: confirmDialog.title }), _jsx("p", { className: "mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 sm:text-[15px]", children: confirmDialog.message })] })] }), _jsxs("div", { className: "mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end", children: [_jsx("button", { type: "button", onClick: () => resolveConfirm(false), className: "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50", children: confirmDialog.cancelText }), _jsx("button", { type: "button", onClick: () => resolveConfirm(true), className: `inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-black uppercase tracking-[0.12em] transition-colors ${toneClasses.confirm}`, children: confirmDialog.confirmText })] })] }) }) }));
};
export default ConfirmDialog;
