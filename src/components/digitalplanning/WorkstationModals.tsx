import React from "react";
import { useTranslation } from "react-i18next";
import { ScanBarcode, X, Pencil, Nfc, Loader2, LogOut } from "lucide-react";
import { useWorkstationStore } from "./useWorkstationStore";
import PostProcessingFinishModal from "./modals/PostProcessingFinishModal";
import RepairModal from "./modals/RepairModal";
import ProductDetailModal from "../products/ProductDetailModal";
import ProductionStartModal from "./modals/ProductionStartModal";
import OperatorLinkModal from "./modals/OperatorLinkModal";
import { NFC_STATUS } from "../../hooks/useNFCReader";

export const WorkstationModals = ({
  stationId,
  rawProducts,
  handleStartProduction,
  handleOpenProductInfo,
  handleLinkProduct,
  handlePostProcessingFinish,
  handleRepairComplete,
  handleOperatorShiftCheckin,
  handleOperatorCheckout,
  handleSaveHourCorrection,
  onDismissPromptShift,
  stationOccupancy,
  currentShiftKey,
  nfc,
  SHIFT_CONFIG,
  getShiftColor,
  toFiniteNumber,
  currentUser,
  isPostProcessing,
  isBM01,
}: any) => {
  const { t } = useTranslation();
  const store = useWorkstationStore();

  return (
    <>
      {store.showStartModal && store.selectedOrder && (
        <div className="fixed z-[9999]">
          <ProductionStartModal
            order={store.selectedOrder}
            isOpen={store.showStartModal}
            onClose={() => store.setShowStartModal(false)}
            onStartInitiated={() => {
              store.setShowStartModal(false);
              if (!isPostProcessing && !isBM01) {
                store.setActiveTab("winding");
              }
            }}
            onStart={handleStartProduction}
            stationId={stationId}
            existingProducts={rawProducts}
            onOpenProductInfo={handleOpenProductInfo}
          />
        </div>
      )}

      {store.linkedProductData && (
        <div className="fixed z-[9999]">
          <ProductDetailModal
            product={store.linkedProductData}
            onClose={() => store.setLinkedProductData(null)}
            userRole={currentUser?.role || "operator"}
          />
        </div>
      )}

      {store.showLinkModal && store.orderToLink && (
        <div className="fixed z-[9999]">
          <OperatorLinkModal
            order={store.orderToLink}
            onClose={() => {
              store.setShowLinkModal(false);
              store.setOrderToLink(null);
            }}
            onLinkProduct={handleLinkProduct}
          />
        </div>
      )}

      {store.finishModalOpen && store.itemToFinish && (
        <div className="fixed z-[9999]">
          <PostProcessingFinishModal
            product={store.itemToFinish}
            onClose={() => {
              store.setFinishModalOpen(false);
              store.setItemToFinish(null);
            }}
            onConfirm={handlePostProcessingFinish}
            currentStation={stationId}
          />
        </div>
      )}

      {store.showRepairModal && store.itemToRepair && (
        <div className="fixed z-[9999]">
          <RepairModal
            product={store.itemToRepair}
            onClose={() => { store.setShowRepairModal(false); store.setItemToRepair(null); }}
            onConfirm={handleRepairComplete}
          />
        </div>
      )}

      {store.showOperatorCheckinModal && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-[24px] border border-slate-200 shadow-2xl p-5 sm:p-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <ScanBarcode size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">{t("digitalplanning.workstation.operator_checkin", "Operator aanmelden")}</h3>
                  <p className="text-xs text-slate-500 font-bold">{t("digitalplanning.workstation.station", "Station")}: {stationId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onDismissPromptShift();
                  store.setShowOperatorCheckinModal(false);
                }}
                className="px-2 py-1 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold text-xs uppercase"
              >
                {t("digitalplanning.workstation.later", "Later")}
              </button>
            </div>

            {(() => {
              const shiftCfg = SHIFT_CONFIG[currentShiftKey];
              const endH = shiftCfg ? Math.floor(shiftCfg.checkoutMinute / 60) : null;
              const endM = shiftCfg ? shiftCfg.checkoutMinute % 60 : null;
              const endLabel = endH !== null ? `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}` : null;
              return shiftCfg ? (
                <div className="mb-4 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{t("digitalplanning.workstation.current_shift", "Huidige dienst")}</p>
                    <p className="text-sm font-black text-blue-800">{shiftCfg.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{t("digitalplanning.workstation.auto_logout_at", "Auto-uitlog om")}</p>
                    <p className="text-sm font-black text-blue-800">{endLabel}</p>
                  </div>
                </div>
              ) : null;
            })()}

            <p className="text-sm text-slate-600 mb-4">
              {t("digitalplanning.workstation.checkin_help", "Scan badge/QR of vul personeelsnummer in om de shift op deze machine te starten. Je kunt meerdere operators achter elkaar aanmelden.")}
            </p>

            <input
              type="text"
              value={store.operatorBadgeInput}
              onChange={(e) => store.setOperatorBadgeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleOperatorShiftCheckin();
                }
              }}
              placeholder={t("personnelOccupancy.labels.employeeNumber", "Personeelsnummer")}
              autoFocus
              className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white font-bold text-slate-800 outline-none focus:border-blue-500"
            />

            <button
              onClick={() => handleOperatorShiftCheckin()}
              disabled={store.isCheckingInOperator}
              className="w-full mt-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest disabled:opacity-60"
            >
              {store.isCheckingInOperator ? t("digitalplanning.workstation.checking_in", "Aanmelden...") : t("digitalplanning.workstation.checkin_on_machine", "Aanmelden op machine")}
            </button>

            {nfc?.isSupported && (
              <button
                type="button"
                onClick={nfc.status === NFC_STATUS.SCANNING ? nfc.stopScan : nfc.startScan}
                disabled={store.isCheckingInOperator}
                className={`w-full mt-2 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                  nfc.status === NFC_STATUS.SCANNING
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                    : nfc.status === NFC_STATUS.SUCCESS
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : nfc.status === NFC_STATUS.ERROR
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                }`}
              >
                <Nfc size={16} />
                {nfc.status === NFC_STATUS.SCANNING
                  ? "NFC actief — houd tag voor lezer..."
                  : nfc.status === NFC_STATUS.SUCCESS
                  ? "Tag gelezen ✓"
                  : nfc.status === NFC_STATUS.ERROR
                  ? nfc.errorMessage || "NFC fout"
                  : "Aanmelden via NFC-tag"}
              </button>
            )}

            {stationOccupancy.length > 0 && (
              <div className="mt-4 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-[11px] font-black uppercase text-slate-500 mb-2">{t("digitalplanning.workstation.currently_logged_in_here", "Nu ingelogd op dit station")}</p>
                <div className="flex flex-wrap gap-2">
                  {stationOccupancy.map((occ: any, idx: number) => (
                    <div key={`${occ.operatorNumber || occ.id || idx}_${idx}`} className="flex items-center gap-1">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase border ${getShiftColor(occ.shift)}`}>
                        {occ.operatorName}
                        {toFiniteNumber(occ.hoursWorked) > 0 && (
                          <span className="ml-1 text-slate-400">({toFiniteNumber(occ.hoursWorked).toFixed(1)}u)</span>
                        )}
                        {occ.hoursAdjusted && (
                          <span className="ml-1 text-amber-500 font-black" title="Uren gecorrigeerd">✎</span>
                        )}
                      </span>
                      <button
                        type="button"
                        title={t("digitalplanning.workstation.logout", "Uitloggen")}
                        onClick={() => handleOperatorCheckout?.(occ)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={12} />
                      </button>
                      {["teamleader", "admin", "planner"].includes(String(currentUser?.role || "").toLowerCase()) && (
                        <button
                          type="button"
                          title="Uren corrigeren"
                          onClick={() => {
                            store.setHourCorrectionEntry(occ);
                            store.setCorrectedHours(String(occ.hoursWorked || ""));
                            store.setCorrectionReason("");
                            store.setShowHourCorrectionModal(true);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {store.showHourCorrectionModal && store.hourCorrectionEntry && (
        <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-[24px] border border-slate-200 shadow-2xl p-5 sm:p-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><Pencil size={18} /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900">{t('workstationModals.correctHours', 'Uren corrigeren')}</h3>
                  <p className="text-xs text-slate-500 font-bold">{store.hourCorrectionEntry.operatorName} · {store.hourCorrectionEntry.machineId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { store.setShowHourCorrectionModal(false); store.setHourCorrectionEntry(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 font-bold">
              Gebruik dit als iemand eerder naar huis is gegaan. De gecorrigeerde uren worden ook gemarkeerd voor ATPS-export.
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Gewerkte uren (gecorrigeerd)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  value={store.correctedHours}
                  onChange={(e) => store.setCorrectedHours(e.target.value)}
                  placeholder={t("placeholders.dpWorkedHoursExample", "bijv. 6 of 7.5")}
                  className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white font-black text-lg text-slate-900 outline-none focus:border-amber-400 text-center"
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  Origineel automatisch berekend: {Number(store.hourCorrectionEntry.hoursWorked || 0).toFixed(1)} uur
                </p>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Reden (optioneel)
                </label>
                <input
                  type="text"
                  value={store.correctionReason}
                  onChange={(e) => store.setCorrectionReason(e.target.value)}
                  placeholder={t("placeholders.dpWorkstationReasonExample", "bijv. eerder naar huis, doktersbezoek...")}
                  className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white font-bold text-sm text-slate-800 outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => { store.setShowHourCorrectionModal(false); store.setHourCorrectionEntry(null); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-xs uppercase hover:bg-slate-50"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleSaveHourCorrection}
                disabled={store.isSavingCorrection}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase disabled:opacity-60"
              >
                {store.isSavingCorrection ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};