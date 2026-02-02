import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import {
  Package,
  Loader2,
  ClipboardCheck,
  History,
  ArrowRight,
} from "lucide-react";
import ProductReleaseModal from "./modals/ProductReleaseModal";
import { normalizeMachine } from "../../utils/hubHelpers";

/**
 * LossenView - Beheert de inkomende producten voor een specifiek werkstation.
 * Gefikst: BH31 naar Nabewerking flow hersteld door betere normalisatie.
 */
const LossenView = ({ stationId, appId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    if (!stationId || !appId) return;

    setLoading(true);
    const productsRef = collection(db, ...PATHS.TRACKING);

    const unsubscribe = onSnapshot(
      productsRef,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const currentStationNorm = normalizeMachine(stationId);

        const filtered = docs.filter((item) => {
          // Filter op currentStation die overeenkomt met dit werkstation
          const itemStationNorm = normalizeMachine(item.currentStation || "");
          const currentStationNorm = normalizeMachine(stationId);
          const isOurStation = itemStationNorm === currentStationNorm;

          // Alleen items tonen die op "Lossen" stap staan
          const isLossenStep = item.currentStep === "Lossen";

          // Of items die status "in_progress" hebben en nog niet finished zijn
          const isActive = item.status === "in_progress" && item.currentStep !== "Finished";

          return isOurStation && isLossenStep && isActive;
        });

        setItems(
          filtered.sort((a, b) => {
            const tA = a.updatedAt?.seconds || 0;
            const tB = b.updatedAt?.seconds || 0;
            return tB - tA;
          })
        );

        setLoading(false);
      },
      (err) => {
        console.error("Lossen fout:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [stationId, appId]);

  if (loading)
    return (
      <div className="p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div className="p-4 space-y-3 bg-white h-full overflow-y-auto custom-scrollbar text-left">
      {selectedProduct && (
        <ProductReleaseModal
          isOpen={true}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          appId={appId}
        />
      )}

      {items.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 opacity-40">
          <Package size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Geen inkomende items voor {stationId}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4 ml-2">
            <ArrowRight size={16} className="text-emerald-500" />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Wachtend op ontvangst ({items.length})
            </h3>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-slate-100 rounded-[35px] p-6 shadow-sm hover:border-emerald-300 transition-all group animate-in slide-in-from-bottom-2"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="text-left">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Lotnummer
                  </span>
                  <span className="font-black text-slate-900 text-lg tracking-tighter italic">
                    {item.lotNumber}
                  </span>
                </div>
                <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase">
                  Ontvangen
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 mb-5 border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Manufactured Item
                </p>
                <p className="text-xs font-mono font-bold text-slate-700 truncate">
                  {item.itemCode}
                </p>
                {item.lastStation && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60 opacity-80">
                    <History size={10} className="text-blue-500" />
                    <span className="text-[8px] font-black text-slate-500 uppercase italic">
                      Herkomst: {item.lastStation}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedProduct(item)}
                className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
              >
                <ClipboardCheck size={18} /> Verwerken & Vrijgeven
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LossenView;
