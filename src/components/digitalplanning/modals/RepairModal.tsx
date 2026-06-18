import React, { useState } from "react";
import { X, Wrench, Save, Loader2, CheckSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormPersistence } from "../../../hooks/useFormPersistence";

const getRepairActions = (t: (key: string, defaultValue: string) => string) => [
  t("digitalplanning.repair.action_new_label", "Nieuw etiket/volgnummer"),
  t("digitalplanning.repair.action_thickened", "Opgedikt"),
  t("digitalplanning.repair.action_inner_repair", "Binnenkant gerepareerd"),
  t("digitalplanning.repair.action_cosmetic", "Cosmetische reparatie"),
  t("digitalplanning.repair.action_flange_flat", "Flens vlakken"),
  t("digitalplanning.repair.action_leaktest", "Lektest herhaald"),
];

type RepairModalProps = {
  product: {
    lotNumber?: string;
    id?: string;
    [key: string]: any;
  };
  onClose: () => void;
  onConfirm: (data: { actions: string[]; notes: string }) => void | Promise<void>;
};

const RepairModal = ({ product, onClose, onConfirm }: RepairModalProps) => {
  const { t } = useTranslation();
  const [formState, setFormState, clearPersistedForm] = useFormPersistence<{ selectedActions: string[]; notes: string }>(
    "repair_modal_form",
    { selectedActions: [], notes: "" }
  );
  const [isSaving, setIsSaving] = useState(false);
  const repairActions = getRepairActions(t as any);

  const selectedActions = formState.selectedActions;
  const notes = formState.notes;

  const toggleAction = (action: string) => {
    setFormState((prev) => ({
      ...prev,
      selectedActions: prev.selectedActions.includes(action)
        ? prev.selectedActions.filter((a) => a !== action)
        : [...prev.selectedActions, action],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onConfirm({ actions: selectedActions, notes });
      clearPersistedForm();
      setFormState({ selectedActions: [], notes: "" });
    } finally {
      setIsSaving(false);
    }
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
              <h3 className="font-black text-slate-800 uppercase text-lg italic tracking-tight">{t("digitalplanning.repair.title", "Reparatie Uitvoeren")}</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{product.lotNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">{t("digitalplanning.repair.actions_label", "Uitgevoerde Acties")}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {repairActions.map(action => (
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
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">{t("digitalplanning.repair.notes_label", "Toelichting")}</label>
            <textarea
              value={notes}
              onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium text-slate-700 outline-none focus:border-orange-500 transition-all min-h-[100px]"
              placeholder={t("digitalplanning.repair.notes_placeholder", "Beschrijf de reparatie...")}
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors text-xs uppercase tracking-wider">{t("digitalplanning.repair.cancel", "Annuleren")}</button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {t("digitalplanning.repair.ready_bm01", "Gereed & Naar BM01")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RepairModal;