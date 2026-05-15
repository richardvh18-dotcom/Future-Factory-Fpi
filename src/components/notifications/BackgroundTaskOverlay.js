import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useBackgroundTasks } from "../../contexts/BackgroundTaskContext";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
export default function BackgroundTaskOverlay() {
    const { tasks, downloadTaskResult } = useBackgroundTasks();
    const visibleTasks = tasks.slice(0, 3);
    if (visibleTasks.length === 0)
        return null;
    return (_jsx("div", { className: "fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 w-72 pointer-events-none", children: visibleTasks.map((task) => (_jsx("div", { className: `pointer-events-auto bg-white border-2 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ${task.status === "completed"
                ? "border-emerald-100"
                : task.status === "failed"
                    ? "border-rose-100"
                    : "border-blue-100"}`, children: _jsxs("div", { className: "p-3", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [task.status === "processing" && _jsx(Loader2, { className: "animate-spin text-blue-500", size: 18 }), task.status === "completed" && _jsx(CheckCircle, { className: "text-emerald-500", size: 18 }), task.status === "failed" && _jsx(AlertCircle, { className: "text-rose-500", size: 18 }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-[10px] font-black text-slate-500 uppercase tracking-widest truncate", children: task.taskName || "Export" }), _jsx("p", { className: "text-[9px] text-slate-400", children: task.createdAt?.toDate ? format(task.createdAt.toDate(), "HH:mm") : "" })] })] }), task.status === "processing" && (_jsx("div", { className: "w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-1", children: _jsx("div", { className: "bg-blue-500 h-full animate-pulse w-full" }) })), task.status === "completed" && (_jsxs("button", { onClick: () => downloadTaskResult(task), className: "w-full flex items-center justify-center gap-2 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg transition-colors", children: [_jsx(Download, { size: 14 }), " Download Gereed"] })), task.status === "failed" && (_jsxs("p", { className: "text-[10px] text-rose-600 font-medium", children: ["Fout: ", task.error || "Onbekende fout"] }))] }) }, task.id))) }));
}
