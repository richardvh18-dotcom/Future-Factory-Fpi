import React, { useState, FC } from "react";
import i18n from "i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { BrainCircuit, Loader2, Sparkles, ArrowRight, X } from "lucide-react";
import { aiService } from "../../services/aiService";

interface PlanningOrder {
  id?: string;
  orderId: string;
  score: number;
  deliveryDate?: string;
  plannedDate?: string;
  machine?: string;
  [key: string]: any;
}

interface Props {
  orders: PlanningOrder[];
  onOrderClick?: (order: PlanningOrder) => void;
  availableMachines?: string[];
}

const normalizeMachineName = (name: string | undefined) => {
  let m = String(name || "").trim().toUpperCase();
  if (m.startsWith("40")) m = m.slice(2);
  return m;
};

export const SmartPlanningSuggestions: FC<Props> = ({ orders, onOrderClick, availableMachines = [] }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlanningOrder[]>([]);
  const [showModal, setShowModal] = useState<boolean>(false);

  const uniqueMachines = Array.from(
    new Set([
      ...orders.map(o => normalizeMachineName(o.machine)),
      ...availableMachines.map(m => normalizeMachineName(m))
    ].filter(Boolean))
  ).sort();

  const handleGenerateSuggestions = async (machineFilter: string | null = null): Promise<void> => {
    setShowModal(false);
    if (!orders || orders.length === 0) return;

    const filteredOrders = machineFilter ? orders.filter(o => normalizeMachineName(o.machine) === machineFilter) : orders;
    if (filteredOrders.length === 0) {
      setSuggestions([]);
      setExplanation(`Er is momenteel geen openstaande planning voor ${machineFilter}.`);
      return;
    }

    setLoading(true);
    try {
      // 1. Schaalbare wiskunde: laat de Cloud Function de top orders berekenen
      const functions = getFunctions(undefined, "europe-west1");
      const calculateSuggestions = httpsCallable<{ orders: PlanningOrder[] }, { topOrders: PlanningOrder[] }>(
        functions,
        "calculateSmartSuggestions"
      );

      const result = await calculateSuggestions({ orders: filteredOrders });
      const topOrders = result.data.topOrders || [];
      setSuggestions(topOrders);

      // 2. AI Analyse: Leg aan de Teamleider uit WAAROM
      const prompt = `
Je bent de productieplanner AI van FPi Future Factory.
Ik geef je de top ${topOrders.length} orders die prioriteit moeten krijgen op basis van ons algoritme${machineFilter ? ` voor machine ${machineFilter}` : ' voor de hele afdeling'}.
Orders: ${JSON.stringify(
        topOrders.map((o) => ({
          OrderNummer: o.orderId,
          Score: o.score,
          Deadline: o.deliveryDate || o.plannedDate || "Onbekend",
        }))
      )}

Geef een korte, professionele en menselijke verklaring (maximaal 2 of 3 zinnen) aan de teamleider waarom deze orders bovenaan staan. Focus op de deadlines (vrachtwagens). Gebruik geen markdown of opsommingstekens.
`;

      const aiResponse = await aiService.chat([{ role: "user", content: prompt }]);
      setExplanation(aiResponse);
    } catch (error: unknown) {
      console.error("Fout bij het genereren van AI suggesties:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-2 sm:p-3 rounded-xl border border-indigo-100 shadow-sm mb-3 shrink-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
        <div 
          onClick={() => { if (!loading && orders.length > 0) setShowModal(true); }}
          className={!loading && orders.length > 0 ? "cursor-pointer group" : ""}
          title="Klik om een AI voorstel te genereren"
        >
          <h3 className="text-sm font-black text-indigo-950 flex items-center gap-1.5 group-hover:text-indigo-700 transition-colors">
            <BrainCircuit className="w-3.5 h-3.5 text-indigo-500 group-hover:animate-pulse" />
            AI Planningsassistent
          </h3>
          <p className="text-[9px] text-indigo-700/70 mt-0.5 font-medium group-hover:text-indigo-600 transition-colors">{i18n.t('smartPlanning.customerDeliveryVsStock', 'Klantlevering t.o.v. voorraad')}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={loading || orders.length === 0}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:shadow-none shrink-0"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-2.5 h-2.5" /> Voorstel</>}
        </button>
      </div>

      {explanation && (
        <div className="bg-white/80 p-2 rounded-lg border border-white shadow-sm mb-2 text-[10px] text-indigo-900 italic leading-tight">
          "{explanation}"
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 mt-2">
          {suggestions.map((order, index) => (
            <div
              key={order.id}
              onClick={() => onOrderClick && onOrderClick(order)}
              className="bg-white p-1.5 rounded-lg border border-indigo-50 flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-1.5">
                <div className="bg-indigo-100 text-indigo-700 font-black w-5 h-5 rounded-lg flex items-center justify-center text-[8px]">
                  {index + 1}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-[9px] group-hover:text-indigo-700 transition-colors">{order.orderId}</p>
                  <p className="text-[8px] text-slate-400 font-mono">Score: {order.score}</p>
                </div>
              </div>
              <ArrowRight className="w-2.5 h-2.5 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <BrainCircuit className="text-indigo-500" size={18} /> Voorstel Genereren
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <p className="text-sm font-bold text-slate-500 mb-4">{i18n.t('smartPlanning.optimizeWhichPart', 'Voor welk onderdeel wil je de AI planning optimaliseren?')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleGenerateSuggestions(null)} className="col-span-2 p-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 shadow-sm">
                  Hele Afdeling
                </button>
                {uniqueMachines.map(machine => (
                  <button key={machine} onClick={() => handleGenerateSuggestions(machine)} className="p-3 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 border-2 border-slate-100 hover:border-blue-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-all active:scale-95">
                    {machine}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};