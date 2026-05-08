import React from "react";
import { getISOWeek, format, startOfISOWeek, endOfISOWeek, addWeeks } from "date-fns";
import { X, Loader2, Factory, Link2 } from "lucide-react";
import StationDetailModal from "./modals/StationDetailModal";
import TraceModal from "./modals/TraceModal";
import ProductDossierModal from "./modals/ProductDossierModal.jsx";
import { useTeamleaderModal } from "./TeamleaderModalContext.tsx";

/**
 * TeamleaderModals
 *
 * Renders all modal dialogs for the TeamleaderHub:
 *   - StationDetailModal
 *   - TraceModal (KPI detail)
 *   - ProductDossierModal
 *   - Overproduction assign modal
 *
 * All state is consumed from TeamleaderModalContext — no props needed.
 */
export const TeamleaderModals = () => {
  const {
    // Add order modal
    showAddOrderModal,
    setShowAddOrderModal,
    creatingOrder,
    newOrderData,
    setNewOrderData,
    handleCreateOrder,
    // StationDetailModal
    selectedStationDetail,
    setSelectedStationDetail,
    dataStore,
    rawProducts,
    archivedProducts,
    // TraceModal (KPI)
    activeKpi,
    setActiveKpi,
    lastKpi,
    setLastKpi,
    kpiWeekOffset,
    setKpiWeekOffset,
    modalTitle,
    modalData,
    handleArchiveRejectedProduct,
    handleMoveLot,
    setViewingDossier,
    // ProductDossierModal
    viewingDossier,
    rawOrders,
    targetSlug,
    effectiveStations,
    // Overproduction modal
    selectedOverproductionGroup,
    setSelectedOverproductionGroup,
    overproductionTargetOrderId,
    setOverproductionTargetOrderId,
    overproductionManualStation,
    setOverproductionManualStation,
    overproductionTargetCandidates,
    resolveOverproductionRoute,
    assigningOverproduction,
    handleAssignOverproduction,
    t,
  } = useTeamleaderModal();
  return (
    <>
      {showAddOrderModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateOrder}
            className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Teamleader</p>
                <h3 className="text-xl font-black text-slate-900 italic mt-1">{t('teamleader.new_order', 'Nieuwe order')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddOrderModal(false)}
                className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Order ID</label>
                <input
                  type="text"
                  value={newOrderData.orderId}
                  onChange={(e) => setNewOrderData((prev) => ({ ...prev, orderId: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Bijv. N20030001"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Machine</label>
                <input
                  type="text"
                  value={newOrderData.machine}
                  onChange={(e) => setNewOrderData((prev) => ({ ...prev, machine: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Bijv. 40BH18"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Item / Omschrijving</label>
                <input
                  type="text"
                  value={newOrderData.item}
                  onChange={(e) => setNewOrderData((prev) => ({ ...prev, item: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Product omschrijving"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Plan / Aantal</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newOrderData.plan}
                  onChange={(e) => setNewOrderData((prev) => ({ ...prev, plan: String(e.target.value || '').replace(/[^0-9]/g, '') }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Bijv. 10"
                  required
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddOrderModal(false)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-100"
                disabled={creatingOrder}
              >
                {t('common.cancel', 'Annuleren')}
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                disabled={creatingOrder}
              >
                {creatingOrder && <Loader2 size={14} className="animate-spin" />}
                {creatingOrder ? t('common.saving', 'Opslaan...') : t('common.save', 'Opslaan')}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedStationDetail && (
        <div className="fixed z-[9999]">
          <StationDetailModal
            stationId={selectedStationDetail}
            allOrders={dataStore}
            allProducts={rawProducts}
            allArchivedProducts={archivedProducts}
            onClose={() => setSelectedStationDetail(null)}
          />
        </div>
      )}

      <TraceModal
        isOpen={!!activeKpi}
        onClose={() => {
          setActiveKpi(null);
          setLastKpi(null);
          setKpiWeekOffset(0);
        }}
        title={modalTitle}
        data={modalData}
        onRowAction={activeKpi === "afkeur" ? handleArchiveRejectedProduct : null}
        rowActionLabel={activeKpi === "afkeur" ? "Sluit af" : ""}
        weekNavigation={
          activeKpi === "gereed" || activeKpi === "afkeur"
            ? {
                label: `Week ${getISOWeek(addWeeks(new Date(), kpiWeekOffset))} (${format(startOfISOWeek(addWeeks(new Date(), kpiWeekOffset)), "dd-MM")} t/m ${format(endOfISOWeek(addWeeks(new Date(), kpiWeekOffset)), "dd-MM")})`,
                onPrevious: () => setKpiWeekOffset((prev) => prev - 1),
                onNext: () => setKpiWeekOffset((prev) => Math.min(prev + 1, 0)),
                canGoNext: kpiWeekOffset < 0,
                onCurrentWeek: () => setKpiWeekOffset(0),
              }
            : null
        }
        onRowClick={(item) => {
          setLastKpi(activeKpi);
          setActiveKpi(null);
          setViewingDossier(item);
        }}
      />

      {viewingDossier && (
        <div className="fixed z-[9999]">
          <ProductDossierModal
            isOpen={true}
            product={viewingDossier}
            onClose={() => {
              setViewingDossier(null);
              if (lastKpi) setActiveKpi(lastKpi);
            }}
            orders={rawOrders}
            onMoveLot={handleMoveLot}
            currentDepartment={targetSlug}
            allowedStations={effectiveStations}
          />
        </div>
      )}

      {selectedOverproductionGroup && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[24px] sm:rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-100 bg-amber-50/70 flex items-start justify-between gap-4 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2">
                  <Link2 size={14} /> {t('teamleader.link_overproduction', 'Overproductie koppelen')}
                </p>
                <h3 className="text-2xl font-black text-slate-900 italic mt-2">
                  {selectedOverproductionGroup.originalOrderId}
                </h3>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {selectedOverproductionGroup.count} extra producten · {selectedOverproductionGroup.item || "Onbekend product"}
                </p>
              </div>
              <button
                onClick={() => setSelectedOverproductionGroup(null)}
                className="p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  {t('bm01.lot_number', 'Lotnummer')}s
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedOverproductionGroup.lotNumbers.map((lot) => (
                    <span
                      key={lot}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-700"
                    >
                      {lot}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">
                  {t('teamleader.new_ln_order_number', 'New LN order number')}
                </label>
                <input
                  type="text"
                  value={overproductionTargetOrderId}
                  onChange={(e) => setOverproductionTargetOrderId(e.target.value.toUpperCase())}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-800 outline-none focus:border-blue-500"
                  placeholder={t('teamleader.overproduction_order_placeholder', 'Bijv. 125874 of LN-NEW-001')}
                />
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                  {overproductionTargetCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => setOverproductionTargetOrderId(String(candidate.orderId || ""))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{candidate.orderId}</p>
                          <p className="text-xs font-bold text-slate-500 mt-1">{candidate.item || "-"}</p>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {candidate.machine || "-"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const targetOrder = rawOrders.find(
                  (order) =>
                    String(order.orderId || "").trim().toUpperCase() ===
                    String(overproductionTargetOrderId || "").trim().toUpperCase()
                );
                const route = resolveOverproductionRoute(
                  targetOrder,
                  selectedOverproductionGroup,
                  overproductionManualStation
                );
                return (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {t('teamleader.next_route', 'Next route')}
                        </p>
                        <p className="text-sm font-black text-slate-900 mt-2">
                          {route.station || t('teamleader.to_be_determined', 'To be determined')}
                        </p>
                        <p className="text-xs font-bold text-slate-500 mt-1">
                          {route.mode === "auto"
                            ? t('teamleader.auto_route_help', 'This order skips Winding and Unloading and goes directly to the next station.')
                            : t('teamleader.manual_route_help', 'Pipes are not fixed yet; choose the target station manually.')}
                        </p>
                      </div>
                      <div className="px-3 py-2 rounded-2xl bg-white border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600">
                        {route.mode === "auto" ? t('teamleader.auto', 'Auto') : t('teamleader.manual', 'Manual')}
                      </div>
                    </div>

                    {route.mode === "manual" && (
                      <div className="mt-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">
                          {t('teamleader.target_station_pipes', 'Target station pipes')}
                        </label>
                        <select
                          value={overproductionManualStation}
                          onChange={(e) => setOverproductionManualStation(e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                        >
                          <option value="">{t('teamleader.choose_station', 'Choose station...')}</option>
                          <option value="Nabewerking">{t('teamleader.station_finishing', 'Finishing')}</option>
                          <option value="Mazak">Mazak</option>
                          <option value="BM01">BM01</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setSelectedOverproductionGroup(null)}
                className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-100"
              >
                {t('common.cancel', 'Annuleren')}
              </button>
              <button
                onClick={handleAssignOverproduction}
                disabled={assigningOverproduction}
                className="px-5 py-3 rounded-2xl bg-amber-500 text-white font-black text-xs uppercase tracking-widest hover:bg-amber-600 shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {assigningOverproduction ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />}
                {assigningOverproduction ? "Koppelen..." : "Koppel en stuur door"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
