import React from "react";
import { useBackgroundTasks } from "../../contexts/BackgroundTaskContext";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface BackgroundTaskTimestamp {
  toDate?: () => Date;
}

interface BackgroundTask {
  id: string;
  status?: string;
  taskName?: string;
  createdAt?: BackgroundTaskTimestamp | null;
  error?: string;
  result?: string;
  fileName?: string;
}

interface BackgroundTasksContextValue {
  tasks: BackgroundTask[];
  downloadTaskResult: (task: BackgroundTask) => void;
}

export default function BackgroundTaskOverlay() {
  const { tasks, downloadTaskResult } = useBackgroundTasks() as BackgroundTasksContextValue;
  const visibleTasks = tasks.slice(0, 3);

  if (visibleTasks.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 w-72 pointer-events-none">
      {visibleTasks.map((task) => (
        <div
          key={task.id}
          className={`pointer-events-auto bg-white border-2 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ${
            task.status === "completed"
              ? "border-emerald-100"
              : task.status === "failed"
                ? "border-rose-100"
                : "border-blue-100"
          }`}
        >
          <div className="p-3">
            <div className="flex items-center gap-3 mb-2">
              {task.status === "processing" && <Loader2 className="animate-spin text-blue-500" size={18} />}
              {task.status === "completed" && <CheckCircle className="text-emerald-500" size={18} />}
              {task.status === "failed" && <AlertCircle className="text-rose-500" size={18} />}

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">
                  {task.taskName || "Export"}
                </p>
                <p className="text-[9px] text-slate-400">
                  {task.createdAt?.toDate ? format(task.createdAt.toDate(), "HH:mm") : ""}
                </p>
              </div>
            </div>

            {task.status === "processing" && (
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-1">
                <div className="bg-blue-500 h-full animate-pulse w-full" />
              </div>
            )}

            {task.status === "completed" && (
              <button
                onClick={() => downloadTaskResult(task)}
                className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg transition-colors"
              >
                <Download size={14} /> Download Gereed
              </button>
            )}

            {task.status === "failed" && (
              <p className="text-[10px] text-rose-600 font-medium">
                Fout: {task.error || "Onbekende fout"}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
