import React from 'react';
import { Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { useProgressOperations } from '../../contexts/ProgressOperationContext';

export const ProgressToast = () => {
  const { operationCount, getOperations } = useProgressOperations();

  if (operationCount === 0) return null;

  const operations = getOperations();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-4 border border-slate-700 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <Loader size={20} className="animate-spin text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-black text-sm mb-2">Verwerken ({operationCount} actief)...</div>
            <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
              {operations.map((op) => (
                <div key={op.id} className="flex items-center gap-2">
                  <span
                    className={
                      op.status.includes("Klaar")
                        ? "text-emerald-400"
                        : op.status.includes("Fout")
                          ? "text-rose-400"
                          : "text-slate-300"
                    }
                  >
                    {op.status.includes("Klaar") ? "✓" : op.status.includes("Fout") ? "✗" : "◌"}
                  </span>
                  <span className="text-slate-300">{op.lotNumber}</span>
                  {op.status !== "Bezig..." && op.status !== "Klaar ✓" && (
                    <span className="text-xs text-slate-400 ml-auto">{op.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
