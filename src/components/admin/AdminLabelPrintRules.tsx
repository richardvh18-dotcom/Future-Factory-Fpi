import React, { useState, useEffect } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PrintRuleDef, PrintRuleCondition } from "../../utils/labelHelpers";
import { useLabelCatalog } from "../../hooks/useLabelCatalog";
import { Plus, Trash2, Save, X, Edit3, Settings2, AlertTriangle, Layers } from "lucide-react";
import toast from "react-hot-toast";

const RULES_PATH = "future-factory/settings/label_print_rules";

const DEFAULT_RULE: Omit<PrintRuleDef, "id"> = {
  name: "Nieuwe Print Regel",
  priority: 100,
  active: true,
  conditions: [{ field: "productType", operator: "==", value: "" }],
  output: {
    labelCount: 1,
    templateId: "",
    templateIds: [],
    requiredTags: []
  }
};

export default function AdminLabelPrintRules() {
  const [rules, setRules] = useState<PrintRuleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<PrintRuleDef | null>(null);
  const { labelTemplates } = useLabelCatalog();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, RULES_PATH), (snapshot) => {
      const loadedRules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PrintRuleDef));
      // Sorteer op prioriteit: laagste getal = hoogste prioriteit
      loadedRules.sort((a, b) => a.priority - b.priority);
      setRules(loadedRules);
      setLoading(false);
    }, (error) => {
      console.error("Fout bij laden regels:", error);
      toast.error("Kan label regels niet laden");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    
    try {
      const ruleRef = editingRule.id 
        ? doc(db, RULES_PATH, editingRule.id) 
        : doc(collection(db, RULES_PATH));
        
      const ruleToSave = { ...editingRule };
      if (!editingRule.id) {
        (ruleToSave as any).createdAt = serverTimestamp();
      }
      (ruleToSave as any).updatedAt = serverTimestamp();
      delete ruleToSave.id;

      await setDoc(ruleRef, ruleToSave, { merge: true });
      toast.success("Regel succesvol opgeslagen");
      setEditingRule(null);
    } catch (error: any) {
      console.error(error);
      toast.error("Fout bij opslaan: " + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Weet je zeker dat je deze regel wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, RULES_PATH, id));
      toast.success("Regel verwijderd");
    } catch (error: any) {
      console.error(error);
      toast.error("Fout bij verwijderen: " + error.message);
    }
  };

  // Voorwaarden helpers
  const updateCondition = (index: number, key: keyof PrintRuleCondition, value: any) => {
    if (!editingRule) return;
    const newConditions = [...editingRule.conditions];
    newConditions[index] = { ...newConditions[index], [key]: value };
    setEditingRule({ ...editingRule, conditions: newConditions });
  };

  const addCondition = () => {
    if (!editingRule) return;
    setEditingRule({
      ...editingRule,
      conditions: [...editingRule.conditions, { field: "productType", operator: "==", value: "" }]
    });
  };

  const removeCondition = (index: number) => {
    if (!editingRule) return;
    const newConditions = editingRule.conditions.filter((_, i) => i !== index);
    setEditingRule({ ...editingRule, conditions: newConditions });
  };

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Regels laden...</div>;

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">
            Label Print <span className="text-blue-600">Regels</span>
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-1">
            Automatiseer labelaantallen en formaten ("Als dit, dan dat")
          </p>
        </div>
        <button
          onClick={() => setEditingRule(DEFAULT_RULE as PrintRuleDef)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg"
        >
          <Plus size={16} /> Nieuwe Regel
        </button>
      </div>

      {/* MODAL VOOR BEWERKEN / TOEVOEGEN */}
      {editingRule && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleSave} className="p-8">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-black uppercase text-slate-800 flex items-center gap-2">
                  <Settings2 className="text-blue-600" />
                  {editingRule.id ? "Regel Bewerken" : "Nieuwe Regel"}
                </h2>
                <button type="button" onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Naam (ter referentie)</label>
                  <input 
                    type="text" 
                    required
                    value={editingRule.name} 
                    onChange={(e) => setEditingRule({...editingRule, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Prioriteit (Lager = Belangrijker)</label>
                    <input 
                      type="number" 
                      required
                      value={editingRule.priority} 
                      onChange={(e) => setEditingRule({...editingRule, priority: Number(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={editingRule.active} 
                        onChange={(e) => setEditingRule({...editingRule, active: e.target.checked})}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-black uppercase tracking-widest text-slate-700 mt-0.5">Actief</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Voorwaarden (CONDITIONS) */}
              <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2">
                  <Layers size={16} className="text-blue-500" /> Als aan AL DEZE voorwaarden wordt voldaan (ALS):
                </h3>
                
                {editingRule.conditions.map((cond, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 mb-3 items-center">
                    <select value={cond.field} onChange={(e) => updateCondition(idx, 'field', e.target.value)} className="w-full sm:w-1/3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-blue-500">
                      <option value="productType">Product Type (bijv. ELBOW)</option>
                      <option value="diameterVal">Diameter in mm (diameterVal)</option>
                      <option value="extraCode">Extra Code (bijv. A2G3)</option>
                    </select>
                    <select value={cond.operator} onChange={(e) => updateCondition(idx, 'operator', e.target.value as any)} className="w-full sm:w-1/4 bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-blue-500">
                      <option value="==">Is Gelijk Aan (==)</option>
                      <option value="!=">Is Niet Gelijk Aan (!=)</option>
                      <option value="contains">Bevat tekst (contains)</option>
                      <option value=">">Groter Dan {'>'}</option>
                      <option value="<">Kleiner Dan {'<'}</option>
                      <option value=">=">Groter Of Gelijk {'>='}</option>
                      <option value="<=">Kleiner Of Gelijk {'<='}</option>
                    </select>
                    <input type="text" placeholder="Waarde" value={cond.value} onChange={(e) => updateCondition(idx, 'value', e.target.value)} className="w-full sm:w-1/3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => removeCondition(idx)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                  </div>
                ))}
                <button type="button" onClick={addCondition} className="text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 mt-3 flex items-center gap-1"><Plus size={14} /> Voorwaarde Toevoegen</button>
              </div>

              {/* Acties (OUTPUT) */}
              <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                <h3 className="text-sm font-black uppercase text-blue-900 mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> DAN pas deze instellingen toe:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Aantal Labels</label><input type="number" min="1" value={editingRule.output.labelCount || 1} onChange={(e) => setEditingRule({...editingRule, output: {...editingRule.output, labelCount: parseInt(e.target.value)}})} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" /></div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Soort Label</label>
                    <select 
                      value={editingRule.output.labelSizeId || ""}
                      onChange={(e) => setEditingRule({
                        ...editingRule, 
                        output: {
                          ...editingRule.output, 
                          labelSizeId: e.target.value as any,
                          templateId: "",
                          templateIds: []
                        }
                      })}
                      className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">Automatisch (Systeem beslist)</option>
                      <option value="Small">Forceer: Fitting Klein</option>
                      <option value="Large">Forceer: Fitting Groot</option>
                      <option value="Flange">Forceer: Flens Label</option>
                    </select>
                  </div>
                  <div><label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Verplichte Tags</label><input type="text" placeholder="bijv: FLENS, CODE" value={(editingRule.output.requiredTags || []).join(", ")} onChange={(e) => { const tags = e.target.value.split(",").map(t => t.trim()).filter(Boolean); setEditingRule({...editingRule, output: {...editingRule.output, requiredTags: tags}}); }} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" /></div>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={() => setEditingRule(null)} className="px-6 py-4 font-black text-slate-500 hover:bg-slate-100 rounded-2xl uppercase text-xs tracking-widest transition-colors">Annuleren</button>
                <button type="submit" className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 flex items-center gap-2 active:scale-95 transition-all"><Save size={18} /> Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIJST WEERGAVE */}
      <div className="space-y-4">
        {rules.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 italic font-bold">Geen regels gevonden. Draai het import script of voeg er handmatig een toe.</div>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${rule.active ? 'bg-white border-slate-200 shadow-sm hover:border-blue-300' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex flex-col items-center justify-center text-blue-600 border border-blue-100"><span className="text-[8px] font-black uppercase tracking-tighter">Prio</span><span className="font-black text-lg leading-none">{rule.priority}</span></div>
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-wide flex items-center gap-3">{rule.name} {!rule.active && <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase tracking-widest">Inactief</span>}</h3>
                <p className="text-xs text-slate-500 mt-1.5 font-medium">ALS <span className="font-black text-slate-700">{rule.conditions.length} voorwaarde(n)</span> matcht DAN <span className="font-black text-blue-600">Print {rule.output.labelCount}x {
                  rule.output.templateIds && rule.output.templateIds.length > 0
                    ? rule.output.templateIds.map(id => labelTemplates?.find((t: any) => t.id === id)?.name || id).join(" + ")
                    : labelTemplates?.find((t: any) => t.id === (rule.output.templateId || rule.output.labelSizeId))?.name || rule.output.templateId || rule.output.labelSizeId || "Dynamisch"
                }</span>{rule.output.requiredTags?.length ? ` + Tags: [${rule.output.requiredTags.join(", ")}]` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingRule(rule)} className="p-3 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"><Edit3 size={18} /></button>
              <button onClick={() => handleDelete(rule.id!)} className="p-3 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}