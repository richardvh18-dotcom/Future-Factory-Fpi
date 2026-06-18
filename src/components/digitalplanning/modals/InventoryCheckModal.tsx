import React, { useState, useMemo, useRef, useEffect } from "react";
import { X, ClipboardCheck, ScanBarcode, CheckCircle2, Save, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { logActivity, auth } from "../../../config/firebase";
import { useNotifications } from "../../../contexts/NotificationContext";
import { normalizeMachine } from "../../../utils/hubHelpers";
import { useFormPersistence } from "../../../hooks/useFormPersistence";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  trackedProducts: any[];
}

const InventoryCheckModal: React.FC<Props> = ({ isOpen, onClose, trackedProducts }) => {
  const { t } = useTranslation();
  const { showSuccess, showError, showConfirm } = useNotifications();
  const [formState, setFormState, clearPersistedForm] = useFormPersistence<{
    scanInput: string;
    checkedLots: string[];
    extraLots: string[];
  }>("inventory_check_modal_form", {
    scanInput: "",
    checkedLots: [],
    extraLots: [],
  });
  const scanInputRef = useRef<HTMLInputElement>(null);

  const scanInput = formState.scanInput;
  const checkedLots = formState.checkedLots;
  const extraLots = formState.extraLots;
  const checkedLotsSet = useMemo(() => new Set(checkedLots), [checkedLots]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const expectedProducts = useMemo(() => {
    return trackedProducts.filter(p => {
      const status = String(p?.status || "").toUpperCase();
      const step = String(p?.currentStep || "").toUpperCase();
      if (["COMPLETED", "FINISHED", "GEREED", "REJECTED", "AFKEUR", "DELETED", "ARCHIVED_REJECTED", "SHIPPED"].includes(status) || step === "FINISHED" || step === "REJECTED") return false;
      
      return true;
    }).sort((a, b) => String(a.lotNumber || "").localeCompare(String(b.lotNumber || "")));
  }, [trackedProducts]);

  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = scanInput.trim().toUpperCase();
      if (!code) return;

      const isExpected = expectedProducts.some(p => String(p.lotNumber || p.id || "").toUpperCase() === code);

      if (isExpected) {
        setFormState((prev) => ({
          ...prev,
          checkedLots: prev.checkedLots.includes(code) ? prev.checkedLots : [...prev.checkedLots, code],
        }));
        showSuccess(`Lot ${code} afgevinkt!`);
      } else {
        setFormState((prev) => ({
          ...prev,
          extraLots: prev.extraLots.includes(code) ? prev.extraLots : [...prev.extraLots, code],
        }));
        showSuccess(`Onverwacht lot ${code} toegevoegd!`);
      }
      setFormState((prev) => ({ ...prev, scanInput: "" }));
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const handleToggleLot = (lot: string) => {
    setFormState((prev) => ({
      ...prev,
      checkedLots: prev.checkedLots.includes(lot)
        ? prev.checkedLots.filter((entry) => entry !== lot)
        : [...prev.checkedLots, lot],
    }));
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  const handleSaveReport = async () => {
    const missing = expectedProducts.filter(p => !checkedLotsSet.has(String(p.lotNumber || p.id || "").toUpperCase()));
    const missingLots = missing.map(p => p.lotNumber || p.id);
    
    const confirm = await showConfirm({
      title: "Vloercontrole Afronden",
      message: `Je hebt ${checkedLots.length} van de ${expectedProducts.length} actieve lots afgevinkt.\n${missing.length > 0 ? `\nEr missen volgens het systeem nog ${missing.length} lots!` : ''}${extraLots.length > 0 ? `\n\nEr zijn ${extraLots.length} extra (onverwachte) lots gescand.` : ''}\n\nWil je dit rapport opslaan in het logboek?`,
      confirmText: "Opslaan",
      cancelText: "Blijven scannen",
      tone: missing.length > 0 || extraLots.length > 0 ? "warning" : "default"
    });

    if (!confirm) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
      return;
    }

    try {
      const details = `Vloercontrole ronde uitgevoerd voor alle actieve producten.
Gevonden (verwacht): ${checkedLots.length}/${expectedProducts.length}
Missend (${missing.length}): ${missing.length > 0 ? missingLots.join(", ") : "-"}
Onverwacht gevonden (${extraLots.length}): ${extraLots.length > 0 ? extraLots.join(", ") : "-"}`;
      
      await logActivity(
        auth.currentUser?.uid || "system",
        "INVENTORY_CHECK",
        details
      );
      
      showSuccess("Vloercontrole rapport succesvol opgeslagen in Audit Log.");
      clearPersistedForm();
      setFormState({ scanInput: "", checkedLots: [], extraLots: [] });
      onClose();
    } catch (err) {
      console.error("Fout bij opslaan inventarisatie:", err);
      showError("Kon rapport niet opslaan.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-purple-50/70 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-2xl font-black text-slate-900 italic flex items-center gap-2">
              <ClipboardCheck className="text-purple-600" /> Vloercontrole (Ronde)
            </h3>
            <p className="text-sm font-bold text-slate-500 mt-1">
              Controleer met je tablet of de producten fysiek liggen waar het systeem zegt dat ze liggen.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-8 flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50">
            <div className="flex flex-col h-full bg-white rounded-[24px] border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
              <div className="flex justify-between items-center mb-4 shrink-0">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">{t('inventoryCheck.activeProducts', 'Actieve Producten')}</h4>
              </div>

              <div className="relative mb-4 shrink-0">
                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" size={24} />
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setFormState((prev) => ({ ...prev, scanInput: e.target.value }))}
                  onKeyDown={handleScan}
                  placeholder={t("placeholders.dpScanOrTypeLot", "Scan of typ lotnummer...")}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-purple-100 rounded-2xl font-bold text-lg outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                />
              </div>

              <div className="flex gap-4 mb-4 shrink-0">
                <div className="flex-1 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-600">{t('inventoryCheck.found', 'Gevonden')}</span>
                  <span className="text-2xl font-black text-emerald-700">{checkedLots.length} / {expectedProducts.length}</span>
                </div>
                <div className="flex-1 bg-rose-50 p-4 rounded-2xl border border-rose-100 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-rose-600">{t('inventoryCheck.missing', 'Missend')}</span>
                  <span className="text-2xl font-black text-rose-700">{expectedProducts.length - checkedLots.length}</span>
                </div>
                <div className="flex-1 bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-600">{t('inventoryCheck.unexpected', 'Onverwacht')}</span>
                  <span className="text-2xl font-black text-amber-700">{extraLots.length}</span>
                </div>
              </div>

              {extraLots.length > 0 && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl shrink-0">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-700 flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} /> Onverwacht gevonden (Niet actief verwacht):
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {extraLots.map(lot => (
                      <span key={lot} onClick={() => setFormState((prev) => ({ ...prev, extraLots: prev.extraLots.filter((entry) => entry !== lot) }))} className="px-2 py-1 bg-white border border-amber-300 text-amber-800 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 cursor-pointer hover:bg-amber-100" title="Klik om scan te verwijderen">
                        {lot} <X size={10} className="text-amber-500" />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto border-t border-slate-100 mt-2 pt-2 custom-scrollbar pr-2">
                {expectedProducts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-bold">{t('inventoryCheck.noActiveProductsExpected', 'Geen actieve producten verwacht op dit station.')}</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {expectedProducts.map(p => {
                      const lotId = String(p.lotNumber || p.id || "").toUpperCase();
                      const isChecked = checkedLotsSet.has(lotId);
                      const stationLabel = normalizeMachine(p.currentStation || p.originMachine || p.machine) || "Onbekend";
                      const statusLabel = p.currentStep || p.status || "-";
                      return (
                        <div 
                          key={p.id}
                          onClick={() => handleToggleLot(lotId)}
                          className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${isChecked ? "bg-emerald-50 border-emerald-400" : "bg-white border-slate-100 hover:border-slate-300"}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 transition-colors ${isChecked ? "bg-emerald-500 border-emerald-600 text-white shadow-sm shadow-emerald-200" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                              {isChecked && <CheckCircle2 size={18} />}
                            </div>
                            <div className="min-w-0">
                              <div className={`font-black text-sm md:text-base truncate ${isChecked ? "text-emerald-900" : "text-slate-800"}`}>{p.lotNumber || p.id}</div>
                              <div className={`text-[10px] font-bold truncate ${isChecked ? "text-emerald-700" : "text-slate-500"}`}>{p.item}</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="text-[9px] font-black uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mb-1 inline-block">{stationLabel}</div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[80px]">{statusLabel}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
        </div>

          <div className="px-5 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
            <button 
              onClick={handleSaveReport}
              className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-200"
            >
              <Save size={18} /> Afronden & Rapport Opslaan
            </button>
          </div>
      </div>
    </div>
  );
};

export default InventoryCheckModal;