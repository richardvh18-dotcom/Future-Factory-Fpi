import React, { useState } from "react";
import { X, Save, Loader2, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveQcInspection } from "../../services/qcSecurityService";
import { auth } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";
import { useFormPersistence } from "../../hooks/useFormPersistence";

type AddInspectionModalProps = {
  onClose: () => void;
};

const AddInspectionModal = ({ onClose }: AddInspectionModalProps) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData, clearPersistedForm] = useFormPersistence("add_inspection_modal_form", {
    lotNumber: "",
    checkType: "",
    result: "OK" as "OK" | "NOK",
    note: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await saveQcInspection({
        lotNumber: formData.lotNumber,
        checkType: formData.checkType,
        result: formData.result,
        note: formData.note,
        actorLabel: auth.currentUser?.email || "QC Inspector",
        source: "AddInspectionModal"
      });
      showSuccess(t("qc.inspection_saved", "Inspectie succesvol opgeslagen via backend en gelogd."));
      clearPersistedForm();
      setFormData({
        lotNumber: "",
        checkType: "",
        result: "OK",
        note: "",
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Fout bij opslaan van inspectie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <ClipboardCheck size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase text-lg italic tracking-tight">{t("addInspectionModal.newInspection", "Nieuwe Inspectie")}</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t("addInspectionModal.shopfloorQualityControl", "Kwaliteitscontrole Vloer")}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("common.lotNumber", "Lotnummer")}</label>
            <input type="text" required value={formData.lotNumber} onChange={(e) => setFormData({ ...formData, lotNumber: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcInspectionLotExample", "Bijv. 4026...")} />
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addInspectionModal.checkType", "Type Controle")}</label>
            <input type="text" required value={formData.checkType} onChange={(e) => setFormData({ ...formData, checkType: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder={t("placeholders.qcInspectionTypeExample", "Bijv. Visueel / Wanddikte / Destructief")} />
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("common.result", "Resultaat")}</label>
            <select value={formData.result} onChange={(e) => setFormData({ ...formData, result: e.target.value as "OK" | "NOK" })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500">
              <option value="OK">{t("addInspectionModal.okApproved", "OK (Goedgekeurd)")}</option>
              <option value="NOK">{t("addInspectionModal.nokRejected", "NOK (Afgekeurd)")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">{t("addInspectionModal.noteOptional", "Notitie (Optioneel)")}</label>
            <textarea value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium outline-none focus:border-blue-500 resize-none min-h-[80px]" placeholder={t("placeholders.qcInspectionNote", "Opmerkingen over de inspectie...")} />
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-xs uppercase tracking-wider flex-1">{t("common.cancel", "Annuleren")}</button>
            <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 flex-[2]">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Opslaan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddInspectionModal;