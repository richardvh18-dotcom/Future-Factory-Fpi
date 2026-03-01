import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  Variable, 
  GitBranch,
  ArrowRight,
  X,
  Beaker,
  Lightbulb
} from "lucide-react";
import { useTranslation } from "react-i18next";

const TRIGGER_OPTIONS = [
  { value: "project", label: "Project Nummer" },
  { value: "diameter", label: "Diameter (DN)" },
  { value: "innerDiameter", label: "ID (Inwendige Diameter)" },
  { value: "pressure", label: "Drukklasse (PN)" },
  { value: "itemCode", label: "Artikel Code" },
  { value: "productType", label: "Product Type" },
  { value: "temperature", label: "Temperatuur Limiet" },
  { value: "pipingClass", label: "Piping Class" },
  { value: "tagNumber", label: "Tag Nummer" },
  { value: "jointCode", label: "Joint Code" },
  { value: "nprs", label: "NPRs (Nominal Pressure Rating)" },
  { value: "pq", label: "Pq (Qualified Pressure)" },
  { value: "extraCode", label: "Code (Extra Code)" }
];

const AdminLabelLogic = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState([]);
  const [selectedRule, setSelectedRule] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [availableCodes, setAvailableCodes] = useState([]);
  
  // Form state
  const [formCode, setFormCode] = useState("");
  const [variables, setVariables] = useState([]);
  const [testInputs, setTestInputs] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, ...PATHS.LABEL_LOGIC), (snap) => {
      setRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch available product codes from General Settings
    const fetchCodes = async () => {
        try {
            const settingsRef = doc(db, ...PATHS.GENERAL_SETTINGS);
            const snap = await getDoc(settingsRef);
            if (snap.exists() && Array.isArray(snap.data().codes)) {
                setAvailableCodes(snap.data().codes);
            }
        } catch (e) {
            console.error("Error fetching codes:", e);
        }
    };
    fetchCodes();

    return () => unsub();
  }, []);

  const handleSelect = (rule) => {
    setSelectedRule(rule);
    setFormCode(rule.productCode);
    setVariables(rule.variables || []);
    setTestInputs({});
  };

  const handleNew = () => {
    setSelectedRule({ id: "new" });
    setFormCode("");
    setVariables([]);
    setTestInputs({});
  };

  const handleLoadExample = () => {
    if (variables.length > 0 && !window.confirm(t('admin.confirmClearExample', "Huidige invoer wissen voor voorbeeld?"))) return;
    
    setSelectedRule({ id: "new_example" });
    setFormCode("A1S1");
    setVariables([
       {
           name: "id_mm",
           triggerField: "innerDiameter",
           defaultValue: t('adminLabelLogic.idMmDefault', "ID: -"),
           mappings: [
               { condition: "> 0", value: t('adminLabelLogic.idSpecMm', "ID Specificatie (mm)") }
           ]
       },
       {
           name: "nprs_bar",
           triggerField: "nprs",
           defaultValue: t('adminLabelLogic.nprsDefault', "NPRs: -"),
           mappings: [
               { condition: ">= 16", value: t('adminLabelLogic.nprsHigh', "NPRs High (bar)") },
               { condition: "< 16", value: t('adminLabelLogic.nprsLow', "NPRs Low (bar)") }
           ]
       },
       {
           name: "pq_mpa",
           triggerField: "pq",
           defaultValue: "",
           mappings: [
               { condition: "> 0", value: t('adminLabelLogic.pqQualified', "Pq Qualified (MPa)") }
           ]
       },
       {
           name: "temp_limit",
           triggerField: "temperature",
           defaultValue: "",
           mappings: [
               { condition: "> 60", value: t('adminLabelLogic.tempLimitWarning', "⚠️ Temp Limiet > 60°C") }
           ]
       }
    ]);
    setTestInputs({});
  };

  const addVariable = () => {
    setVariables([...variables, { 
      name: "", 
      defaultValue: "", 
      triggerField: "project", // Default trigger
      mappings: [] 
    }]);
  };

  const updateVariable = (index, field, value) => {
    const newVars = [...variables];
    newVars[index][field] = value;
    setVariables(newVars);
  };

  const addMapping = (varIndex) => {
    const newVars = [...variables];
    newVars[varIndex].mappings.push({ condition: "", value: "" });
    setVariables(newVars);
  };

  const updateMapping = (varIndex, mapIndex, field, value) => {
    const newVars = [...variables];
    newVars[varIndex].mappings[mapIndex][field] = value;
    setVariables(newVars);
  };

  const removeMapping = (varIndex, mapIndex) => {
    const newVars = [...variables];
    newVars[varIndex].mappings.splice(mapIndex, 1);
    setVariables(newVars);
  };

  const removeVariable = (index) => {
    const newVars = [...variables];
    newVars.splice(index, 1);
    setVariables(newVars);
  };

  const handleSave = async () => {
    if (!formCode) return alert(t('admin.productCodeRequired', "Product Code is verplicht"));
    
    const id = formCode.toUpperCase();
    const data = {
      productCode: id,
      variables,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, ...PATHS.LABEL_LOGIC, id), data);
      await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Label logic saved: ${id}`);
      alert(t('admin.logicSaved', "Logica opgeslagen!"));
    } catch (e) {
      console.error(e);
      alert(t('admin.saveError', { message: e.message }));
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm(t('common.areYouSure', "Zeker weten?"))) return;
    await deleteDoc(doc(db, ...PATHS.LABEL_LOGIC, id));
    await logActivity(auth.currentUser?.uid, "SETTINGS_UPDATE", `Label logic deleted: ${id}`);
    if (selectedRule?.id === id) setSelectedRule(null);
  };

  const calculateTestResult = (variable, input) => {
    if (input === undefined || input === "") return variable.defaultValue || t('admin.default', "(standaard)");
    
    // Helper voor evaluatie (lokaal, zelfde logica als in labelHelpers)
    const evaluate = (condition, val) => {
        const c = String(condition).trim();
        const v = String(val).trim();
        const nV = parseFloat(v);
        
        if (!isNaN(nV)) {
            if (c.startsWith(">=")) return nV >= parseFloat(c.substring(2));
            if (c.startsWith("<=")) return nV <= parseFloat(c.substring(2));
            if (c.startsWith(">")) return nV > parseFloat(c.substring(1));
            if (c.startsWith("<")) return nV < parseFloat(c.substring(1));
        }
        
        if (c.startsWith("!=")) return v.toUpperCase() !== c.substring(2).trim().toUpperCase();
        if (c.startsWith("==")) return v.toUpperCase() === c.substring(2).trim().toUpperCase();
        return v.toUpperCase() === c.toUpperCase();
    };

    if (variable.mappings) {
        const match = variable.mappings.find(m => evaluate(m.condition || m.project || "", input));
        if (match) return match.value;
    }
    return variable.defaultValue || t('admin.default', "(standaard)");
  };

  const filteredRules = rules.filter(r => r.productCode.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase italic">{t('labelLogic')}</h1>
          <p className="text-sm text-slate-500">{t('dynamicFieldsByProject')}</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleLoadExample} className="bg-white border-2 border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
              <Lightbulb size={18} className="text-yellow-500" /> {t('exampleA1S1')}
            </button>
            <button onClick={handleNew} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors">
              <Plus size={18} /> {t('newRule')}
            </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* List */}
        <div className="w-1/3 bg-white rounded-2xl border border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl text-sm font-bold outline-none" 
                placeholder={t('admin.searchProductCode', "Zoek product code...")}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredRules.map(rule => (
              <div 
                key={rule.id} 
                onClick={() => handleSelect(rule)}
                className={`p-4 rounded-xl cursor-pointer border-2 transition-all ${selectedRule?.id === rule.id ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-800">{rule.productCode}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(rule.id); }} className="text-slate-400 hover:text-rose-500">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {rule.variables?.length || 0} {t('variablesConfigured')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 overflow-y-auto">
          {selectedRule ? (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">{t('productCodeMatch')}</label>
                <input 
                  list="productCodes"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value.toUpperCase())}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-lg outline-none focus:border-blue-500"
                  placeholder={t('admin.exampleCode', "Bijv. A2E5")}
                />
                <datalist id="productCodes">
                    {availableCodes.map(code => (
                        <option key={code} value={code} />
                    ))}
                </datalist>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Variable size={18} className="text-blue-500" /> {t('variables')}
                  </h3>
                  <button onClick={addVariable} className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                    {t('addVariable')}
                  </button>
                </div>

                {variables.map((variable, vIdx) => (
                  <div key={vIdx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('variableNameInLabel')}</label>
                        <input 
                          value={variable.name}
                          onChange={e => updateVariable(vIdx, 'name', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold"
                          placeholder={t('exampleJointCode')}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('dependentTrigger')}</label>
                        <select 
                          value={variable.triggerField || "project"}
                          onChange={e => updateVariable(vIdx, 'triggerField', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none"
                        >
                          {TRIGGER_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{t(`triggers.${opt.value}`, opt.label)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('defaultValue')}</label>
                        <input 
                          value={variable.defaultValue}
                          onChange={e => updateVariable(vIdx, 'defaultValue', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder={t('fallbackValue')}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={() => removeVariable(vIdx)} className="text-xs text-rose-500 hover:underline flex items-center gap-1"><Trash2 size={12}/> {t('removeVariable')}</button>
                    </div>

                    <div className="pl-4 border-l-2 border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                          <GitBranch size={14} /> {t('rulesExceptions')}
                        </span>
                        <button onClick={() => addMapping(vIdx)} className="text-[10px] font-bold text-blue-600 hover:underline">
                          {t('addCondition')}
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        {variable.mappings.map((map, mIdx) => (
                          <div key={mIdx} className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono">{t('ifFieldEquals', { field: variable.triggerField || 'project' })}</span>
                            <input 
                              value={map.condition || map.project} // Fallback voor oude data
                              onChange={e => updateMapping(vIdx, mIdx, 'condition', e.target.value)}
                              className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                              placeholder={t('valuePlaceholder')}
                            />
                            <ArrowRight size={14} className="text-slate-300" />
                            <span className="text-xs text-slate-400 font-mono">{t('then')}</span>
                            <input 
                              value={map.value}
                              onChange={e => updateMapping(vIdx, mIdx, 'value', e.target.value)}
                              className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                              placeholder={t('value')}
                            />
                            <button onClick={() => removeMapping(vIdx, mIdx)} className="text-slate-300 hover:text-rose-500">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {variable.mappings.length === 0 && (
                          <p className="text-xs text-slate-400 italic">{t('noSpecificRules')}</p>
                        )}
                      </div>

                      {/* Test Simulator */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3 bg-slate-50/50 p-2 rounded-lg">
                        <div className="flex items-center gap-2 text-slate-400">
                            <Beaker size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{t('testLabel')}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-slate-500">{t('ifFieldEquals', { field: variable.triggerField || 'project' })}</span>
                            <input 
                                type="text" 
                                className="w-24 p-1.5 bg-white border border-slate-200 rounded-md text-xs font-mono focus:border-blue-500 outline-none"
                                placeholder={t('admin.valuePlaceholder', "Waarde...")}
                                value={testInputs[vIdx] || ""}
                                onChange={(e) => setTestInputs(prev => ({...prev, [vIdx]: e.target.value}))}
                            />
                            <ArrowRight size={14} className="text-slate-300" />
                            <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 min-w-[60px] text-center">
                                {calculateTestResult(variable, testInputs[vIdx])}
                            </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button onClick={handleSave} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-600 transition-colors">
                  <Save size={18} /> {t('save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <Variable size={64} className="mb-4" />
              <p>{t('selectOrCreateRule')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLabelLogic;
