// @ts-nocheck
import React, { useState } from 'react';
import { Sparkles, Loader2, ArrowRight, BrainCircuit } from 'lucide-react';
import { aiService } from '../../services/aiService';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface PlanningOrder {
  id: string;
  orderId: string;
  orderNumber?: string;
  deliveryDate?: string | Date;
  plannedDate?: string | Date;
  type?: 'klant' | 'project' | 'voorraad';
  priority?: 'immediate' | 'urgent' | 'high' | 'normal' | 'low';
  status: string;
  plan?: number;
  score?: number;
}

interface Props {
  orders: PlanningOrder[];
  onOrderClick?: (order: PlanningOrder) => void;
}

export const SmartPlanningSuggestions: React.FC<Props> = ({ orders, onOrderClick }) => {
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const handleGenerateSuggestions = async () => {
    if (!orders || orders.length === 0) return;
    
    setLoading(true);
    try {
      // 1. Schaalbare wiskunde: laat de Cloud Function de top orders berekenen
      const functions = getFunctions();
      const calculateSuggestions = httpsCallable(functions, 'calculateSmartSuggestions', { region: 'europe-west1' });
      
      const result = await calculateSuggestions({ orders });
      const topOrders = (result.data as any).topOrders || [];
      setSuggestions(topOrders);

      // 2. AI Analyse: Leg aan de Teamleider uit WAAROM
      const prompt = `
Je bent de productieplanner AI van FPi Future Factory.
Ik geef je de top ${topOrders.length} orders die prioriteit moeten krijgen op basis van ons algoritme.
Orders: ${JSON.stringify(topOrders.map(o => ({ 
  OrderNummer: o.orderId, 
  Score: o.score, 
  Deadline: o.deliveryDate || o.plannedDate || 'Onbekend' 
})))}

Geef een korte, professionele en menselijke verklaring (maximaal 2 of 3 zinnen) aan de teamleider waarom deze orders bovenaan staan. Focus op de deadlines (vrachtwagens). Gebruik geen markdown of opsommingstekens.
`;
      
      const aiResponse = await aiService.chat([{ role: 'user', content: prompt }]);
      setExplanation(aiResponse);
      
    } catch (error) {
      console.error('Fout bij het genereren van AI suggesties:', error);
      setExplanation("Kon geen AI-uitleg genereren, maar de berekende suggesties zijn hieronder geladen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-3 sm:p-4 rounded-2xl border border-indigo-100 shadow-sm mb-4 shrink-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-black text-indigo-950 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-indigo-500" />
            AI Planningsassistent
          </h3>
          <p className="text-[10px] text-indigo-700/70 mt-0.5 font-medium">Klantlevering t.o.v. voorraad</p>
        </div>
        <button 
          onClick={handleGenerateSuggestions}
          disabled={loading || orders.length === 0}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3" /> Genereer Voorstel</>}
        </button>
      </div>

      {explanation && (
        <div className="bg-white/80 p-3 rounded-xl border border-white shadow-sm mb-3 text-xs text-indigo-900 italic leading-relaxed">
          "{explanation}"
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
          {suggestions.map((order, index) => (
            <div 
              key={order.id} 
              onClick={() => onOrderClick && onOrderClick(order)}
              className="bg-white p-2 rounded-xl border border-indigo-50 flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-2">
                <div className="bg-indigo-100 text-indigo-700 font-black w-6 h-6 rounded-lg flex items-center justify-center text-[10px]">
                  {index + 1}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-xs group-hover:text-indigo-700 transition-colors">{order.orderId}</p>
                  <p className="text-[9px] text-slate-400 font-mono">Score: {order.score}</p>
                </div>
              </div>
              <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};