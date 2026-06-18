import React from "react";
import { Loader, CheckCircle } from "lucide-react";
import { useProgressOperationsStore } from "../../contexts/ProgressOperationContext";

const ProgressToast: React.FC = () => {
  const operationsMap = useProgressOperationsStore((state) => state.operations);
  const operations = Object.entries(operationsMap).map(([id, op]) => ({ id, ...op }));
  const operationCount = operations.length;

  if (operationCount === 0) return null;

  const isAnyBusy = operations.some(
    (operation) => !operation.status.includes("Klaar") && !operation.status.includes("Fout")
  );

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm w-72">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-4 border border-slate-700 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          {isAnyBusy ? (
            <Loader size={20} className="animate-spin text-blue-400 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm mb-2">
              {isAnyBusy ? `Verwerken (${operationCount} actief)...` : "Verwerkt"}
            </div>
            <div className="space-y-2 text-xs max-h-40 overflow-y-auto">
              {operations.map((operation) => {
                const isDone = operation.status.includes("Klaar");
                const isError = operation.status.includes("Fout");
                const isBusy = !isDone && !isError;

                return (
                  <div key={operation.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={
                          isDone
                            ? "text-emerald-400"
                            : isError
                            ? "text-rose-400"
                            : "text-slate-300"
                        }
                      >
                        {isDone ? "✓" : isError ? "✗" : "◌"}
                      </span>
                      <span className="text-slate-200 truncate font-medium">
                        {operation.lotNumber}
                      </span>
                      <span className="text-slate-400 ml-auto whitespace-nowrap">
                        {operation.status}
                      </span>
                    </div>
                    {isBusy && (
                      <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full animate-progress-indeterminate" />
                      </div>
                    )}
                    {isDone && <div className="w-full h-1 bg-emerald-500 rounded-full" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressToast;