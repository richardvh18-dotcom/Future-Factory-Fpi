import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Loader, CheckCircle } from "lucide-react";
const ProgressToast = ({ operationCount, getOperations }) => {
    if (operationCount === 0)
        return null;
    const operations = getOperations();
    const isAnyBusy = operations.some((operation) => !operation.status.includes("Klaar") && !operation.status.includes("Fout"));
    return (_jsx("div", { className: "fixed bottom-4 right-4 z-[9999] max-w-sm w-72", children: _jsx("div", { className: "bg-slate-900 text-white rounded-xl shadow-2xl p-4 border border-slate-700 backdrop-blur-sm", children: _jsxs("div", { className: "flex items-start gap-3", children: [isAnyBusy ? (_jsx(Loader, { size: 20, className: "animate-spin text-blue-400 flex-shrink-0 mt-0.5" })) : (_jsx(CheckCircle, { size: 20, className: "text-emerald-400 flex-shrink-0 mt-0.5" })), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "font-black text-sm mb-2", children: isAnyBusy ? `Verwerken (${operationCount} actief)...` : "Verwerkt" }), _jsx("div", { className: "space-y-2 text-xs max-h-40 overflow-y-auto", children: operations.map((operation) => {
                                    const isDone = operation.status.includes("Klaar");
                                    const isError = operation.status.includes("Fout");
                                    const isBusy = !isDone && !isError;
                                    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("span", { className: isDone
                                                            ? "text-emerald-400"
                                                            : isError
                                                                ? "text-rose-400"
                                                                : "text-slate-300", children: isDone ? "✓" : isError ? "✗" : "◌" }), _jsx("span", { className: "text-slate-200 truncate font-medium", children: operation.lotNumber }), _jsx("span", { className: "text-slate-400 ml-auto whitespace-nowrap", children: operation.status })] }), isBusy && (_jsx("div", { className: "w-full h-1 bg-slate-700 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-blue-400 rounded-full animate-progress-indeterminate" }) })), isDone && _jsx("div", { className: "w-full h-1 bg-emerald-500 rounded-full" })] }, operation.id));
                                }) })] })] }) }) }));
};
export default ProgressToast;
