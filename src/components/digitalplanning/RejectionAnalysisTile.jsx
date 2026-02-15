import React from "react";
import { AlertOctagon } from "lucide-react";

/**
 * RejectionAnalysisTile
 * Toont een visuele analyse van de afkeurredenen op het dashboard.
 */
const RejectionAnalysisTile = React.memo(({ products = [] }) => {
  // 1. Filter alle afgekeurde producten (Veilige check op array)
  const rejected = Array.isArray(products)
    ? products.filter(
        (p) => p.currentStep === "REJECTED" || p.status === "Afkeur"
      )
    : [];

  // 2. Groepeer op reden
  const reasons = rejected.reduce((acc, curr) => {
    const reason = curr.rejectionReason || "Onbekend/Overig";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  // 3. Sorteer en pak top 3
  const sortedReasons = Object.entries(reasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const totalRejected = rejected.length;

  return (
    <div className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm col-span-1 md:col-span-2 hover:border-rose-300 transition-colors text-left">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
          <AlertOctagon size={18} className="text-rose-500" /> Kwaliteitsanalyse
        </h4>
        <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
          {totalRejected} Totaal
        </span>
      </div>

      <div className="space-y-4">
        {sortedReasons.length > 0 ? (
          sortedReasons.map(([reason, count]) => {
            const percentage =
              totalRejected > 0 ? Math.round((count / totalRejected) * 100) : 0;
            return (
              <div key={reason}>
                <div className="flex justify-between text-[10px] font-black uppercase mb-1.5">
                  <span className="text-slate-600">{reason}</span>
                  <span className="text-slate-400">
                    {count} stuks ({percentage}%)
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-rose-500 rounded-full shadow-sm transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-slate-300">
            <AlertOctagon size={32} className="mb-2 opacity-50" />
            <p className="text-[10px] font-bold uppercase tracking-widest">
              Geen afkeur data
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default RejectionAnalysisTile;
