import React, { useState } from "react";
import { X, Wrench, Save, Loader2, CheckSquare } from "lucide-react";

const REPAIR_ACTIONS = [
  "Nieuw etiket/volgnummer",
  "Opgedikt",
  "Binnenkant gerepareerd",
  "Cosmetische reparatie",
  "Flens vlakken",
  "Lektest herhaald"
];

const RepairModal = ({ product, onClose, onConfirm }) => {
  const [selectedActions, setSelectedActions] = useState([]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const toggleAction = (action) => {
    setSelectedActions(prev => 
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onConfirm({ actions: selectedActions, notes });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-[30px] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
              <Wrench size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase text-lg italic tracking-tight">Reparatie Uitvoeren</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{product.lotNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">Uitgevoerde Acties</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REPAIR_ACTIONS.map(action => (
                <button
                  key={action}
                  onClick={() => toggleAction(action)}
                  className={`p-3 rounded-xl text-xs font-bold text-left flex items-center gap-3 transition-all border-2 ${
                    selectedActions.includes(action)
                      ? "bg-orange-50 border-orange-500 text-orange-700"
                      : "bg-white border-slate-100 text-slate-600 hover:border-orange-200"
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${selectedActions.includes(action) ? "bg-orange-500 border-orange-500 text-white" : "border-slate-300 bg-white"}`}>
                    {selectedActions.includes(action) && <CheckSquare size={12} />}
                  </div>
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Toelichting</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium text-slate-700 outline-none focus:border-orange-500 transition-all min-h-[100px]"
              placeholder="Beschrijf de reparatie..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors text-xs uppercase tracking-wider">Annuleren</button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Gereed & Naar BM01
          </button>
        </div>
      </div>
    </div>
  );
};

export default RepairModal;