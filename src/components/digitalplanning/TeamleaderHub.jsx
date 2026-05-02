import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  ClipboardList,
  Link2,
  Layers,
} from "lucide-react";
import { getISOWeek, format } from "date-fns";
import { getOrderFinishedUnits, getTrackedRecordOrderId } from "../../utils/planningProgress";
import {
  isRejectedProduct,
  isInactiveTrackedProduct,
} from "../../utils/trackingHelpers";
import {
  isOpenOrRunningOrder,
  getOrderRemainingQueueQty,
  getDeliveredQtyForOrder,
  getInspectionApprovedQtyForOrder,
  getDeliveryInspectionDeltaForOrder,
  isEventInCurrentWeek,
  getLegacyRejectedOrders,
  buildOverproductionGroups,
} from "../../utils/teamleaderDerived";
import { normalizeMachine, PIPE_MACHINES } from "../../utils/hubHelpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import TeamleaderDashboard from "../teamleader/TeamleaderDashboard";
import TeamleaderEfficiencyView from "../teamleader/TeamleaderEfficiencyView";
import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView";
import PlanningSidebar from "./PlanningSidebar";
import OrderDetail from "./OrderDetail";
import AiPredictionView from "./AiPredictionView";
import ImportExportDashboard from "./ImportExportDashboard";
import { useTeamleaderFirestore } from "./useTeamleaderFirestore";
import { useTeamleaderDataStore } from "./useTeamleaderDataStore";
import { useTeamleaderMetrics } from "./useTeamleaderMetrics";
import { useTeamleaderModalData } from "./useTeamleaderModalData";
import { useTeamleaderEventHandlers } from "./useTeamleaderEventHandlers";
import { TeamleaderHeader } from "./TeamleaderHeader";
import { TeamleaderModals } from "./TeamleaderModals";

/**
 * TeamleaderHub V7.3 - Strict Filtering Update & Cleanup
 * Fix voor dubbele planning en vervuiling tussen afdelingen.
 * Gebruikt 'effectiveStations' als centrale bron van waarheid.
 */
const TeamleaderHub = React.memo(({
  onBack,
  onExit,
  fixedScope = "all",
  departmentName = "Algemeen",
  allowedMachines = [],
  title = "Teamleader Hub",
}) => {
  const { t } = useTranslation();
  const { user } = useAdminAuth();
  let navigate = null;
  try {
    navigate = useNavigate();
  } catch {
    navigate = null;
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();

  const getOrderIdFromTrackedRecord = (record) => {
    return getTrackedRecordOrderId(record);
  };

  const getLotFromTrackedRecord = (record) => {
    const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
    if (directLot) return directLot;

    const rawId = String(record?.id || "").trim();
    if (!rawId) return "";

    const lotFromId = rawId.match(/_(\d{6,})$/);
    return lotFromId ? lotFromId[1] : "";
  };

  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedSidebarEntry, setSelectedSidebarEntry] = useState(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    orderId: "",
    item: "",
    machine: "",
    plan: ""
  });
  const [departmentFilter, setDepartmentFilter] = useState("ALL"); // Nieuw filter
  const [showAiPrediction, setShowAiPrediction] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncingDrawings, setIsSyncingDrawings] = useState(false);
  const [isArchivingLegacyRejected, setIsArchivingLegacyRejected] = useState(false);
  const { showSuccess, showInfo, showWarning, showConfirm , notify} = useNotifications();

  // Modals state
  const [activeKpi, setActiveKpi] = useState(null);
  const [lastKpi, setLastKpi] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  const [kpiWeekOffset, setKpiWeekOffset] = useState(0);
  const [viewingDossier, setViewingDossier] = useState(null);
  const [selectedStationDetail, setSelectedStationDetail] = useState(null);
  const [selectedOverproductionGroup, setSelectedOverproductionGroup] = useState(null);
  const [overproductionTargetOrderId, setOverproductionTargetOrderId] = useState("");
  const [overproductionManualStation, setOverproductionManualStation] = useState("");
  const [assigningOverproduction, setAssigningOverproduction] = useState(false);

  // All Firestore real-time listeners extracted to useTeamleaderFirestore hook (Phase 4)
  const {
    rawOrders,
    rawProducts,
    bezetting,
    archivedProducts,
    archivedHistoryProducts,
    archivedRejectedProducts,
    factoryConfig,
    loading,
    dbError,
  } = useTeamleaderFirestore({ user });

  // Reset AI view bij wisselen van tab
  useEffect(() => {
    setShowAiPrediction(false);
  }, [activeTab]);

  // Derived scope + filtered data store extracted to useTeamleaderDataStore hook (Phase 4)
  const {
    safeScope,
    targetSlug,
    effectiveStations,
    effectiveAllowedNorms,
    orderProgressMeta,
    dataStore,
  } = useTeamleaderDataStore({
    rawOrders,
    rawProducts,
    factoryConfig,
    fixedScope,
    allowedMachines,
    departmentFilter,
    getOrderIdFromTrackedRecord,
    getLotFromTrackedRecord,
  });
  
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return dataStore.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId);
  }, [dataStore, selectedOrderId]);

  const selectedDetailEntry = useMemo(() => {
    if (selectedOrder) return selectedOrder;
    if (selectedSidebarEntry?.isArchivedOrder) return selectedSidebarEntry;
    return null;
  }, [selectedOrder, selectedSidebarEntry]);

  const selectedSidebarEntryId = useMemo(() => {
    if (selectedSidebarEntry?.orderId) return selectedSidebarEntry.orderId;
    if (selectedSidebarEntry?.id) return selectedSidebarEntry.id;
    return selectedOrderId;
  }, [selectedSidebarEntry, selectedOrderId]);

  const canManageOverproduction = fixedScope === "all" && ["planner", "admin", "teamleader"].includes(user?.role);
  const getFinishedQtyForOrder = (order) => {
    return getOrderFinishedUnits(order, {
      trackedRecords: [...rawProducts, ...archivedHistoryProducts],
      getOrderIdFromRecord: getOrderIdFromTrackedRecord,
    });
  };

  const legacyRejectedOrders = useMemo(() => {
    return getLegacyRejectedOrders({
      rawOrders,
      rawProducts,
      getOrderIdFromTrackedRecord,
      getFinishedQtyForOrder,
      isInactiveTrackedProduct,
    });
  }, [rawOrders, rawProducts]);

  const getOrderProgressMeta = (order) => {
    const orderId = String(order?.orderId || order?.id || "").trim();
    if (!orderId) return null;
    return orderProgressMeta.get(orderId) || null;
  };


  const isInAllowedScope = (product) => {
    if (effectiveAllowedNorms.length === 0) return true;
    const m1 = normalizeMachine(product?.machine || "");
    const m2 = normalizeMachine(product?.originMachine || "");
    const m3 = normalizeMachine(product?.currentStation || "");
    return [m1, m2, m3].some((value) => value && effectiveAllowedNorms.includes(value));
  };

  const overproductionGroups = useMemo(() => {
    return buildOverproductionGroups({
      rawProducts,
      getLotFromTrackedRecord,
    });
  }, [rawProducts]);

  const resolveOverproductionRoute = (targetOrder, group, manualStation = "") => {
    const itemText = `${targetOrder?.item || ""} ${group?.item || ""}`.toUpperCase();
    const normalizedItem = itemText.trim().replace(/\s+/g, " ");
    const machineNorm = normalizeMachine(targetOrder?.machine || group?.originMachine || "");

    if (normalizedItem.startsWith("FL")) {
      return { station: "Mazak", mode: "auto", label: "Mazak" };
    }

    if (PIPE_MACHINES.includes(machineNorm) || itemText.includes("PIPE") || itemText.includes("BUIS")) {
      const chosenStation = String(manualStation || "").trim();
      return { station: chosenStation || null, mode: "manual", label: chosenStation || "Handmatig kiezen" };
    }

    return { station: "Nabewerking", mode: "auto", label: "Nabewerking" };
  };

  const overproductionTargetCandidates = useMemo(() => {
    const input = String(overproductionTargetOrderId || "").trim().toLowerCase();
    const group = selectedOverproductionGroup;
    const sameItem = String(group?.item || "").trim().toLowerCase();

    return rawOrders
      .filter((order) => !["completed", "cancelled", "rejected", "shipped"].includes(String(order?.status || "").toLowerCase()))
      .filter((order) => {
        if (input) {
          return String(order.orderId || "").toLowerCase().includes(input);
        }
        if (!sameItem) return true;
        return String(order.item || "").trim().toLowerCase() === sameItem;
      })
      .sort((a, b) => String(a.orderId || "").localeCompare(String(b.orderId || "")))
      .slice(0, 12);
  }, [rawOrders, overproductionTargetOrderId, selectedOverproductionGroup]);

  // Sidebar selection removed - now in useTeamleaderEventHandlers hook

  // Archived lot dossier handler removed - now in useTeamleaderEventHandlers hook

  const getPriorityLevel = (order) => {
    const rawPriority = order?.priority;
    const normalizedPriority =
      rawPriority === true
        ? "high"
        : String(rawPriority || "").toLowerCase().trim();

    if (normalizedPriority === "immediate") return "immediate";
    if (normalizedPriority === "urgent") return "urgent";
    if (normalizedPriority === "high") return "high";
    if (order?.isMoved) return "high";
    if (order?.isUrgent) return "urgent";
    return "normal";
  };

  const hasActiveTrackingForOrder = (orderId) => {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) return true;

    const relatedProducts = rawProducts.filter(
      (product) => getOrderIdFromTrackedRecord(product) === normalizedOrderId
    );

    // Als er geen trackingregels zijn, val terug op orderstatus-only gedrag.
    if (relatedProducts.length === 0) return true;

    return relatedProducts.some((product) => {
      return !isInactiveTrackedProduct(product);
    });
  };

  const isPriorityOrder = (order) => {
    if (getPriorityLevel(order) === "normal") return false;
    if (!isOpenOrRunningOrder(order)) return false;
    return hasActiveTrackingForOrder(order?.orderId);
  };

  const metrics = useTeamleaderMetrics({
    loading,
    dataStore,
    rawProducts,
    bezetting,
    archivedProducts,
    archivedHistoryProducts,
    archivedRejectedProducts,
    effectiveAllowedNorms,
    effectiveStations,
    safeScope,
    todayStr,
    currentWeek,
    currentYear,
    getOrderIdFromTrackedRecord,
    getOrderProgressMeta,
    getOrderRemainingQueueQty,
    getDeliveredQtyForOrder,
    getInspectionApprovedQtyForOrder,
    isEventInCurrentWeek,
    isInAllowedScope,
    isInactiveTrackedProduct,
    isRejectedProduct,
    isPriorityOrder,
  });

  const modalData = useTeamleaderModalData({
    activeKpi,
    dataStore,
    rawProducts,
    archivedHistoryProducts,
    archivedRejectedProducts,
    bezetting,
    kpiWeekOffset,
    getOrderProgressMeta,
    getOrderRemainingQueueQty,
    getOrderIdFromTrackedRecord,
    isInAllowedScope,
    isInactiveTrackedProduct,
    isRejectedProduct,
    isPriorityOrder,
    getPriorityLevel,
    getDeliveredQtyForOrder,
    getInspectionApprovedQtyForOrder,
    getDeliveryInspectionDeltaForOrder,
  });

  // Extract all event handlers into a dedicated hook (Phase 3)
  const {
    handleOpenExtendedPersonnel,
    handleOpenOverproductionGroup,
    handleAssignOverproduction,
    handleSidebarSelect,
    handleOpenArchivedLotDossier,
    handleKpiClick,
    handleDrawingSync,
    handleExport,
    handlePlannerExcelExport,
    handleCopyYesterday,
    handleClearToday,
    handleMoveLot,
    handleArchiveRejectedProduct,
    handleCreateOrder,
    handleArchiveLegacyRejectedOrders,
  } = useTeamleaderEventHandlers({
    user,
    navigate,
    t,
    todayStr,
    setActiveTab,
    setIsMobileMenuOpen,
    setShowAiPrediction,
    setIsSyncingDrawings,
    setModalTitle,
    setKpiWeekOffset,
    setActiveKpi,
    setLastKpi,
    setSelectedSidebarEntry,
    setSelectedOrderId,
    setViewingDossier,
    setSelectedStationDetail,
    setSelectedOverproductionGroup,
    setOverproductionTargetOrderId,
    setOverproductionManualStation,
    setAssigningOverproduction,
    setIsCopying,
    setIsClearing,
    setShowAddOrderModal,
    setCreatingOrder,
    setNewOrderData,
    setIsArchivingLegacyRejected,
    showSuccess,
    showInfo,
    showWarning,
    showConfirm,
    notify,
    dataStore,
    rawOrders,
    rawProducts,
    bezetting,
    selectedOverproductionGroup,
    overproductionTargetOrderId,
    overproductionManualStation,
    selectedSidebarEntry,
    newOrderData,
    legacyRejectedOrders,
    getOrderIdFromTrackedRecord,
    getOrderProgressMeta,
    getFinishedQtyForOrder,
    resolveOverproductionRoute,
    isInAllowedScope,
    fixedScope,
    targetSlug,
    departmentFilter,
  });

  // All event handlers now come from useTeamleaderEventHandlers hook (Phase 3 refactoring)

  if (loading)
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          {t('teamleader.loading_data', 'Productiedata synchroniseren...')}
        </p>
      </div>
    );

  if (!user?.role || user?.role === 'guest')
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center">
        <h3 className="text-xl font-black uppercase italic text-slate-400">{t('teamleader.access_denied', 'Toegang Beperkt')}</h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">{t('teamleader.no_rights', 'Uw account heeft nog geen rechten om deze data te bekijken.')}</p>
        <button onClick={onBack || onExit} className="mt-8 px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">{t('common.back', 'Terug')}</button>
      </div>
    );

  if (dbError)
    return (
      <div className="h-full flex flex-col items-center justify-center p-10 text-center">
        <AlertTriangle size={48} className="text-rose-500 mb-4" />
        <h3 className="text-xl font-black uppercase italic">{t('teamleader.db_error_title', 'Database Verbindingsfout')}</h3>
        <p className="text-slate-500 text-sm mt-2 max-w-xs">{t('teamleader.db_error_desc', 'De app kon geen verbinding maken met Firestore (Fout: {{error}}).', { error: dbError })}</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">
          {t('teamleader.retry', 'Opnieuw Proberen')}
        </button>
      </div>
    );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-left w-full animate-in fade-in duration-300 overflow-hidden relative">
      <TeamleaderHeader
        onBack={onBack}
        onExit={onExit}
        fixedScope={fixedScope}
        departmentName={departmentName}
        title={title}
        departmentFilter={departmentFilter}
        setDepartmentFilter={setDepartmentFilter}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canManageOverproduction={canManageOverproduction}
        overproductionGroups={overproductionGroups}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        showAiPrediction={showAiPrediction}
        setShowAiPrediction={setShowAiPrediction}
        isSyncingDrawings={isSyncingDrawings}
        handleDrawingSync={handleDrawingSync}
        t={t}
      />

      <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {activeTab === "dashboard" ? (
            <TeamleaderDashboard metrics={metrics} onKpiClick={handleKpiClick} onStationSelect={setSelectedStationDetail} />
          ) : activeTab === "bezetting" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <button
                  onClick={handleOpenExtendedPersonnel}
                  className="px-4 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-sm"
                  title={t('teamleader.open_extended_personnel_admin', 'Open uitgebreide Personeel & Bezetting in Admin Hub')}
                >
                  <Link2 size={14} /> {t('teamleader.extended_personnel_module', 'Uitgebreide Personeel Module')}
                </button>
              </div>
              <PersonnelOccupancyView
                scope={departmentFilter !== "ALL" ? departmentFilter.toLowerCase() : fixedScope}
                onCopyYesterday={handleCopyYesterday}
                isCopying={isCopying}
                onClearToday={handleClearToday}
                isClearing={isClearing}
              />
            </div>
          ) : activeTab === "efficiency" ? (
            showAiPrediction ? (
              <AiPredictionView onClose={() => setShowAiPrediction(false)} />
            ) : (
              <TeamleaderEfficiencyView departmentName={departmentFilter !== "ALL" ? departmentFilter : departmentName} lockDepartment={fixedScope !== "all"} />
            )
          ) : activeTab === "import_export" ? (
            <ImportExportDashboard
              currentDepartment={departmentFilter !== "ALL" ? departmentFilter.toLowerCase() : targetSlug}
              onCreateOrder={() => setShowAddOrderModal(true)}
              trackedProducts={rawProducts}
              archivedHistoryProducts={archivedHistoryProducts}
              effectiveAllowedNorms={effectiveAllowedNorms}
              planningOrders={dataStore}
            />
          ) : (
            <div className="h-full flex gap-6 overflow-hidden">
              <div className={`shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? 'hidden lg:flex w-[38rem]' : 'w-full lg:w-[38rem]'}`}>
                {canManageOverproduction && (
                  <div className="mb-4 shrink-0 rounded-[32px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600 flex items-center gap-2">
                          <AlertTriangle size={14} /> {t('teamleader.overproduction', 'Overproduction')}
                        </p>
                        <h3 className="text-lg font-black text-slate-900 italic mt-2">{t('teamleader.pending_extra_products', 'Open pending extra products')}</h3>
                        <p className="text-xs font-bold text-slate-500 mt-1">{t('teamleader.link_extras_help', 'Koppel extras aan een nieuw LN-ordernummer en stuur ze direct door naar de juiste vervolgstap.')}</p>
                      </div>
                      <div className="px-3 py-2 rounded-2xl bg-white border border-amber-200 text-amber-700 text-sm font-black min-w-[3rem] text-center">
                        {overproductionGroups.length}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 max-h-[18rem] overflow-y-auto custom-scrollbar pr-1">
                      {overproductionGroups.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 px-4 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
                          {t('teamleader.no_pending_overproduction', 'Geen openstaande overproductie')}
                        </div>
                      ) : (
                        overproductionGroups.map((group) => {
                          const sampleRoute = resolveOverproductionRoute({ machine: group.originMachine, item: group.item }, group, "");
                          return (
                            <button
                              key={group.key}
                              onClick={() => handleOpenOverproductionGroup(group)}
                              className="w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50/40 transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-black text-slate-900">{group.originalOrderId}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">{t('teamleader.extra_count', '{{count}} extra', { count: group.count })}</span>
                                  </div>
                                  <p className="text-xs font-bold text-slate-600 mt-1 truncate">{group.item || "Onbekend product"}</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Bron: {group.originMachine || "-"} · Route: {sampleRoute.station || "Handmatig"}</p>
                                </div>
                                <div className="flex items-center gap-2 text-amber-600 font-black text-xs uppercase">
                                  <Layers size={14} /> {group.lotNumbers.length}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <PlanningSidebar
                    orders={dataStore}
                    trackedProducts={rawProducts}
                    archivedProducts={archivedProducts}
                    archivedHistoryProducts={archivedHistoryProducts}
                    enableRejectionScopes={true}
                    selectedOrderId={selectedSidebarEntryId}
                    onSelect={handleSidebarSelect}
                  />
                </div>
              </div>
              <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
                {selectedOrder ? (
                  <OrderDetail 
                    order={selectedOrder} 
                    products={[...rawProducts, ...archivedHistoryProducts]} 
                    onClose={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }} 
                    isManager={true} 
                    onMoveLot={handleMoveLot} 
                    onOpenDossier={setViewingDossier} 
                    showAllStations={true} 
                    currentDepartment={targetSlug}
                    allowedStations={effectiveStations}
                  />
                ) : selectedSidebarEntry?.isArchivedOrder ? (
                  <div className="h-full flex flex-col p-8 lg:p-10 text-left overflow-y-auto">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">{t('teamleader.history_archive', 'History / Archief')}</p>
                        
                        
                        <h3 className="text-2xl font-black text-slate-900 italic tracking-tight mt-1">{selectedSidebarEntry.orderId || selectedSidebarEntry.id || '-'}</h3>
                        <p className="text-sm font-bold text-slate-500 mt-1">{selectedSidebarEntry.item || selectedSidebarEntry.itemDescription || '-'}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedOrderId(null); setSelectedSidebarEntry(null); }}
                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
                      >
                        {t('common.close', 'Sluiten')}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('digitalplanning.status', 'Status')}</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">{t('teamleader.completed_archive', 'Voltooid (Archief)')}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('digitalplanning.machine', 'Machine')}</p>
                        <p className="text-sm font-bold text-slate-800 mt-1">{selectedSidebarEntry.machine || selectedSidebarEntry.originMachine || '-'}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('bm01.lot_number', 'Lotnummer')}s</p>
                        {Array.isArray(selectedSidebarEntry.lotNumbers) && selectedSidebarEntry.lotNumbers.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {selectedSidebarEntry.lotNumbers.map((lot) => (
                              <div key={lot} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                                <span className="text-sm font-bold text-slate-800 break-all">{lot}</span>
                                <button
                                  onClick={() => handleOpenArchivedLotDossier(lot)}
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                                >
                                  {t('digitalplanning.order_detail.view_dossier', 'Bekijk uitgebreid dossier')}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 px-3 py-2">
                            <span className="text-sm font-bold text-slate-800 break-all">{selectedSidebarEntry.lotNumber || selectedSidebarEntry.lotNumbersText || '-'}</span>
                            <button
                              onClick={() => handleOpenArchivedLotDossier(selectedSidebarEntry.lotNumber)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                            >
                              {t('digitalplanning.order_detail.view_dossier', 'Bekijk uitgebreid dossier')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center opacity-40 italic text-center">
                    <ClipboardList size={64} className="mb-4 text-slate-300" />
                    <p className="font-black uppercase tracking-widest text-xs text-slate-400">{t('teamleader.select_order', 'Selecteer een order uit de lijst')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>


      <TeamleaderModals
        showAddOrderModal={showAddOrderModal}
        setShowAddOrderModal={setShowAddOrderModal}
        creatingOrder={creatingOrder}
        newOrderData={newOrderData}
        setNewOrderData={setNewOrderData}
        handleCreateOrder={handleCreateOrder}
        selectedStationDetail={selectedStationDetail}
        setSelectedStationDetail={setSelectedStationDetail}
        dataStore={dataStore}
        rawProducts={rawProducts}
        archivedProducts={archivedProducts}
        activeKpi={activeKpi}
        setActiveKpi={setActiveKpi}
        lastKpi={lastKpi}
        setLastKpi={setLastKpi}
        kpiWeekOffset={kpiWeekOffset}
        setKpiWeekOffset={setKpiWeekOffset}
        modalTitle={modalTitle}
        modalData={modalData}
        handleArchiveRejectedProduct={handleArchiveRejectedProduct}
        handleMoveLot={handleMoveLot}
        setViewingDossier={setViewingDossier}
        viewingDossier={viewingDossier}
        rawOrders={rawOrders}
        targetSlug={targetSlug}
        effectiveStations={effectiveStations}
        selectedOverproductionGroup={selectedOverproductionGroup}
        setSelectedOverproductionGroup={setSelectedOverproductionGroup}
        overproductionTargetOrderId={overproductionTargetOrderId}
        setOverproductionTargetOrderId={setOverproductionTargetOrderId}
        overproductionManualStation={overproductionManualStation}
        setOverproductionManualStation={setOverproductionManualStation}
        overproductionTargetCandidates={overproductionTargetCandidates}
        resolveOverproductionRoute={resolveOverproductionRoute}
        assigningOverproduction={assigningOverproduction}
        handleAssignOverproduction={handleAssignOverproduction}
        t={t}
      />
    </div>
  );
});

export default TeamleaderHub;
