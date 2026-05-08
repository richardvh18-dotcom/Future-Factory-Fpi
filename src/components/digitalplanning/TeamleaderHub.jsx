import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  Link2,
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
import { normalizeMachine } from "../../utils/hubHelpers";
import {
  getLotFromTrackedRecord,
  resolveOverproductionRoute,
  getPriorityLevel,
  getOverproductionTargetCandidates,
} from "./teamleaderHub.helpers";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNotifications } from "../../contexts/NotificationContext";
import { useBackgroundTasks } from "../../contexts/BackgroundTaskContext";
import TeamleaderDashboard from "../teamleader/TeamleaderDashboard";
import TeamleaderEfficiencyView from "../teamleader/TeamleaderEfficiencyView.tsx";
import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView";
import AiPredictionView from "./AiPredictionView";
import ImportExportDashboard from "./ImportExportDashboard";
import TeamleaderOrderRail from "./TeamleaderOrderRail.tsx";
import TeamleaderDetailPane from "./TeamleaderDetailPane";
import { useTeamleaderFirestore } from "./useTeamleaderFirestore";
import { useTeamleaderDataStore } from "./useTeamleaderDataStore";
import { useTeamleaderMetrics } from "./useTeamleaderMetrics";
import { useTeamleaderModalData } from "./useTeamleaderModalData";
import { useTeamleaderEventHandlers } from "./useTeamleaderEventHandlers";
import { TeamleaderHeader } from "./TeamleaderHeader";
import { TeamleaderModals } from "./TeamleaderModals";
import { TeamleaderSelectionProvider } from "./TeamleaderSelectionContext.tsx";
import { TeamleaderModalProvider } from "./TeamleaderModalContext.tsx";
import TeamleaderExportModal from "./modals/TeamleaderExportModal";

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

  const getOrderIdFromTrackedRecord = getTrackedRecordOrderId;

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportModalType, setExportModalType] = useState("planning");
  const [exportModalLocked, setExportModalLocked] = useState(false);
  const [exportTrackingTaskId, setExportTrackingTaskId] = useState(null);
  const [exportPreloadedTask, setExportPreloadedTask] = useState(null);

  const { tasks } = useBackgroundTasks();

  // Wanneer de getrackte taak klaar is en de modal gesloten is → heropen de modal
  useEffect(() => {
    if (!exportTrackingTaskId || showExportModal) return;
    const task = tasks.find(t => t.id === exportTrackingTaskId);
    if (task && (task.status === 'completed' || task.status === 'failed')) {
      setExportPreloadedTask(task);
      setShowExportModal(true);
      setExportTrackingTaskId(null);
    }
  }, [tasks, exportTrackingTaskId, showExportModal]);

  // All Firestore real-time listeners extracted to useTeamleaderFirestore hook (Phase 4)
  const {
    rawOrders,
    rawProducts,
    bezetting,
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

  const clearSelection = useCallback(() => {
    setSelectedOrderId(null);
    setSelectedSidebarEntry(null);
  }, []);

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

  const overproductionTargetCandidates = useMemo(() => {
    return getOverproductionTargetCandidates({
      rawOrders,
      overproductionTargetOrderId,
      selectedOverproductionGroup,
    });
  }, [rawOrders, overproductionTargetOrderId, selectedOverproductionGroup]);

  // Sidebar selection removed - now in useTeamleaderEventHandlers hook

  // Archived lot dossier handler removed - now in useTeamleaderEventHandlers hook

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
    effectiveAllowedNorms,
  });

  const selectionContextValue = useMemo(
    () => ({
      selectedOrder,
      selectedSidebarEntry,
      selectedDetailEntry,
      selectedSidebarEntryId,
      handleSidebarSelect,
      clearSelection,
    }),
    [
      selectedOrder,
      selectedSidebarEntry,
      selectedDetailEntry,
      selectedSidebarEntryId,
      handleSidebarSelect,
      clearSelection,
    ]
  );

  const modalContextValue = useMemo(
    () => ({
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
      archivedProducts: archivedHistoryProducts,
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
    }),
    [
      showAddOrderModal, creatingOrder, newOrderData, handleCreateOrder,
      selectedStationDetail, dataStore, rawProducts, archivedHistoryProducts,
      activeKpi, lastKpi, kpiWeekOffset, modalTitle, modalData,
      handleArchiveRejectedProduct, handleMoveLot,
      viewingDossier, rawOrders, targetSlug, effectiveStations,
      selectedOverproductionGroup, overproductionTargetOrderId,
      overproductionManualStation, overproductionTargetCandidates,
      resolveOverproductionRoute, assigningOverproduction, handleAssignOverproduction,
      t,
    ]
  );

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
    <TeamleaderModalProvider value={modalContextValue}>
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
              onOpenMachineExport={(type) => {
                setExportModalType(type || "planning");
                setExportModalLocked(true);
                setShowExportModal(true);
              }}
            />
          ) : (
            <TeamleaderSelectionProvider value={selectionContextValue}>
              <div className="h-full flex gap-6 overflow-hidden">
                <TeamleaderOrderRail
                  canManageOverproduction={canManageOverproduction}
                  overproductionGroups={overproductionGroups}
                  onOpenOverproductionGroup={handleOpenOverproductionGroup}
                  resolveOverproductionRoute={resolveOverproductionRoute}
                  orders={dataStore}
                  trackedProducts={rawProducts}
                  archivedHistoryProducts={archivedHistoryProducts}
                />
                <TeamleaderDetailPane
                  handleMoveLot={handleMoveLot}
                  setViewingDossier={setViewingDossier}
                  targetSlug={targetSlug}
                  effectiveStations={effectiveStations}
                  rawProducts={rawProducts}
                  archivedHistoryProducts={archivedHistoryProducts}
                  handleOpenArchivedLotDossier={handleOpenArchivedLotDossier}
                />
              </div>
            </TeamleaderSelectionProvider>
          )}
        </div>
      </div>


      <TeamleaderModals />

      {showExportModal && (
        <TeamleaderExportModal
          isOpen={showExportModal}
          onClose={() => {
            setShowExportModal(false);
            setExportModalLocked(false);
            setExportPreloadedTask(null);
          }}
          rawOrders={rawOrders}
          rawProducts={rawProducts}
          archivedProducts={archivedHistoryProducts}
          initialExportType={exportModalType}
          lockExportType={exportModalLocked}
          onTaskCreated={(taskId) => {
            setExportTrackingTaskId(taskId);
          }}
          preloadedTask={exportPreloadedTask}
        />
      )}
    </div>
    </TeamleaderModalProvider>
  );
});

export default TeamleaderHub;
