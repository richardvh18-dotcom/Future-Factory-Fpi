 import React, { useState, useEffect, useMemo, useCallback } from "react";
 import { useTranslation } from "react-i18next";
 import { useNavigate } from "react-router-dom";
 import { Loader2, AlertTriangle, Link2 } from "lucide-react";
 import { getISOWeek, format } from "date-fns";
 import { getOrderFinishedUnits, getTrackedRecordOrderId } from "../../utils/planningProgress";
 import { isRejectedProduct, isInactiveTrackedProduct } from "../../utils/trackingHelpers";
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
 import TeamleaderEfficiencyView from "../teamleader/TeamleaderEfficiencyView";
 import PersonnelOccupancyView from "../personnel/PersonnelOccupancyView";
 import AiPredictionView from "./AiPredictionView";
 import ImportExportDashboard from "./ImportExportDashboard";
 import TeamleaderOrderRail from "./TeamleaderOrderRail";
 import TeamleaderDetailPane from "./TeamleaderDetailPane";
 import { useTeamleaderFirestore } from "./useTeamleaderFirestore";
 import { useTeamleaderDataStore } from "./useTeamleaderDataStore";
 import { useTeamleaderMetrics } from "./useTeamleaderMetrics";
import { useTeamleaderModalData } from "./modals/useTeamleaderModalData";
 import { useTeamleaderEventHandlers } from "./useTeamleaderEventHandlers";
 import { TeamleaderHeader } from "./TeamleaderHeader";
import { TeamleaderModals } from "./TeamleaderModals";
 import { TeamleaderSelectionProvider } from "./TeamleaderSelectionContext";
import { TeamleaderModalProvider, useTeamleaderModalStore } from "./modals/TeamleaderModalContext";
 import TeamleaderExportModal from "./modals/TeamleaderExportModal";
 import { SmartPlanningSuggestions } from "./SmartPlanningSuggestions";
 
 type TeamleaderHubProps = {
   onBack?: () => void;
   onExit?: () => void;
   fixedScope?: string;
   departmentName?: string;
   allowedMachines?: string[];
   title?: string;
 };
 
 const TeamleaderHub = React.memo(({
   onBack,
   onExit,
   fixedScope = "all",
   departmentName = "Algemeen",
   allowedMachines = [],
   title = "Teamleader Hub",
 }: TeamleaderHubProps) => {
   const { t } = useTranslation();
   const { user } = useAdminAuth();
   let navigate: any = null;
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
   const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
   const [selectedSidebarEntry, setSelectedSidebarEntry] = useState<Record<string, any> | null>(null);
   const [isCopying, setIsCopying] = useState(false);
   const [isClearing, setIsClearing] = useState(false);
   const [departmentFilter, setDepartmentFilter] = useState("ALL");
   const [showAiPrediction, setShowAiPrediction] = useState(false);
   const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
   const [isSyncingDrawings, setIsSyncingDrawings] = useState(false);
   const [isArchivingLegacyRejected, setIsArchivingLegacyRejected] = useState(false);
   
   const { showSuccess, showInfo, showWarning, showConfirm, notify } = useNotifications();
 
   const showExportModal = useTeamleaderModalStore(state => state.showExportModal);
   const exportTrackingTaskId = useTeamleaderModalStore(state => state.exportTrackingTaskId);
   const exportModalType = useTeamleaderModalStore(state => state.exportModalType);
   const exportModalLocked = useTeamleaderModalStore(state => state.exportModalLocked);
   const exportPreloadedTask = useTeamleaderModalStore(state => state.exportPreloadedTask);
   
   const overproductionTargetOrderId = useTeamleaderModalStore(state => state.overproductionTargetOrderId);
   const selectedOverproductionGroup = useTeamleaderModalStore(state => state.selectedOverproductionGroup);
   const activeKpi = useTeamleaderModalStore(state => state.activeKpi);
   const kpiWeekOffset = useTeamleaderModalStore(state => state.kpiWeekOffset);
 
   const { tasks } = useBackgroundTasks();
   const tasksList = tasks as Record<string, any>[];
 
   useEffect(() => {
     if (!exportTrackingTaskId || showExportModal) return;
     const task = tasksList.find((t) => t.id === exportTrackingTaskId);
     if (task && (task.status === 'completed' || task.status === 'failed')) {
       const store = useTeamleaderModalStore.getState();
       store.setExportPreloadedTask(task);
       store.setShowExportModal(true);
       store.setExportTrackingTaskId(null);
     }
   }, [tasksList, exportTrackingTaskId, showExportModal]);
 
   const {
     rawOrders,
     rawProducts,
     bezetting,
     archivedHistoryProducts,
     archivedRejectedProducts,
     factoryConfig: rawFactoryConfig,
     loading,
     dbError,
     activeDowntimes,
   } = useTeamleaderFirestore({ user });
   
   const factoryConfig = rawFactoryConfig ?? undefined;
   const rawOrdersList = (rawOrders || []) as any[];
   const rawProductsList = (rawProducts || []) as any[];
   const archivedHistoryProductsList = (archivedHistoryProducts || []) as any[];
   const archivedRejectedProductsList = (archivedRejectedProducts || []) as any[];
   const bezettingList = (bezetting || []) as any[];
 
   useEffect(() => {
     setShowAiPrediction(false);
   }, [activeTab]);
 
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
   const dataStoreList = (dataStore || []) as any[];

  const officialDepartmentName = useMemo(() => {
    const departments = Array.isArray((factoryConfig as any)?.departments)
      ? (factoryConfig as any).departments
      : [];

    const selectedSlug = departmentFilter !== "ALL"
      ? String(departmentFilter || "").toLowerCase()
      : String(targetSlug || "").toLowerCase();

    const matchedDepartment = departments.find((d: any) => {
      const slug = String(d?.slug || "").toLowerCase();
      const id = String(d?.id || "").toLowerCase();
      const name = String(d?.name || "").toLowerCase();
      return slug === selectedSlug || id === selectedSlug || name === selectedSlug;
    });

    const configuredName = String(matchedDepartment?.name || "").trim();
    if (configuredName) return configuredName;

    if (departmentFilter !== "ALL") return String(departmentFilter).trim();
    return String(departmentName || targetSlug || "all").trim();
  }, [factoryConfig, departmentFilter, targetSlug, departmentName]);
   
   const selectedOrder = useMemo(() => {
     if (!selectedOrderId) return null;
    const matchedOrder = dataStoreList.find((o) => o.id === selectedOrderId || o.orderId === selectedOrderId) || null;
    if (!matchedOrder) return null;

    if (
      selectedSidebarEntry &&
      (selectedSidebarEntry.orderId === matchedOrder.orderId || selectedSidebarEntry.id === matchedOrder.id)
    ) {
      return { ...matchedOrder, ...selectedSidebarEntry };
    }

    return matchedOrder;
  }, [dataStoreList, selectedOrderId, selectedSidebarEntry]);
 
   const selectedDetailEntry = useMemo(() => {
     if (selectedOrder) return selectedOrder;
     if (selectedSidebarEntry?.isArchivedOrder) return selectedSidebarEntry;
     return null;
   }, [selectedOrder, selectedSidebarEntry]);
 
   const selectedSidebarEntryId = useMemo(() => {
     if (selectedSidebarEntry?.orderId) return selectedSidebarEntry.orderId;
     if ((selectedSidebarEntry as any)?.id) return (selectedSidebarEntry as any).id;
     return selectedOrderId;
   }, [selectedSidebarEntry, selectedOrderId]);
 
   const clearSelection = useCallback(() => {
     setSelectedOrderId(null);
     setSelectedSidebarEntry(null);
   }, []);
 
   const canManageOverproduction = fixedScope === "all" && ["planner", "admin", "teamleader"].includes(String(user?.role || ""));
   
   const getFinishedQtyForOrder = (order: any) => {
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
 
   const getOrderProgressMeta = (order: any) => {
     const orderId = String(order?.orderId || order?.id || "").trim();
     if (!orderId) return null;
     return orderProgressMeta.get(orderId) || null;
   };
 
   const isInAllowedScope = (product: any) => {
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
       selectedOverproductionGroup: selectedOverproductionGroup || undefined,
     });
   }, [rawOrders, overproductionTargetOrderId, selectedOverproductionGroup]);
 
   const hasActiveTrackingForOrder = (orderId: string | null | undefined) => {
     const normalizedOrderId = String(orderId || "").trim();
     if (!normalizedOrderId) return true;
 
     const relatedProducts = rawProductsList.filter(
       (product: any) => getOrderIdFromTrackedRecord(product) === normalizedOrderId
     );
 
     if (relatedProducts.length === 0) return true;
 
     return relatedProducts.some((product: any) => {
       return !isInactiveTrackedProduct(product);
     });
   };
 
   const isInactiveTrackedProductAny = (product: any) => isInactiveTrackedProduct(product as any);
   const isRejectedProductAny = (product: any) => isRejectedProduct(product as any);
   const getDeliveredQtyForOrderAny = (order: any) => getDeliveredQtyForOrder(order as any) ?? 0;
   const getInspectionApprovedQtyForOrderAny = (order: any) => getInspectionApprovedQtyForOrder(order as any) ?? 0;
   const getDeliveryInspectionDeltaForOrderAny = (order: any) => getDeliveryInspectionDeltaForOrder(order as any) ?? 0;
   const getOrderRemainingQueueQtyAny = (order: any) => getOrderRemainingQueueQty(order as any) ?? 0;
 
   const isPriorityOrder = (order: any) => {
     if (getPriorityLevel(order) === "normal") return false;
     if (!isOpenOrRunningOrder(order)) return false;
     return hasActiveTrackingForOrder(order?.orderId);
   };
 
   const metrics = useTeamleaderMetrics({
     loading,
     dataStore: dataStoreList,
     rawProducts: rawProductsList,
     bezetting: bezettingList,
     archivedHistoryProducts: archivedHistoryProductsList,
     archivedRejectedProducts: archivedRejectedProductsList,
     activeDowntimes: activeDowntimes || [],
     effectiveAllowedNorms,
     effectiveStations,
     safeScope,
     todayStr,
     currentWeek,
     currentYear,
     getOrderIdFromTrackedRecord,
     getOrderProgressMeta,
     getOrderRemainingQueueQty: getOrderRemainingQueueQtyAny,
     getDeliveredQtyForOrder: getDeliveredQtyForOrderAny,
     getInspectionApprovedQtyForOrder: getInspectionApprovedQtyForOrderAny,
     isEventInCurrentWeek,
     isInAllowedScope,
     isInactiveTrackedProduct: isInactiveTrackedProductAny,
     isRejectedProduct: isRejectedProductAny,
     isPriorityOrder,
   });
 
   const modalData = useTeamleaderModalData({
     activeKpi: activeKpi || undefined,
     dataStore: dataStoreList,
     rawProducts: rawProductsList,
     archivedHistoryProducts: archivedHistoryProductsList,
     archivedRejectedProducts: archivedRejectedProductsList,
     bezetting: bezettingList,
     kpiWeekOffset,
     getOrderProgressMeta,
     getOrderRemainingQueueQty: getOrderRemainingQueueQtyAny,
     getOrderIdFromTrackedRecord,
     isInAllowedScope,
     isInactiveTrackedProduct: isInactiveTrackedProductAny,
     isRejectedProduct: isRejectedProductAny,
     isPriorityOrder,
     getPriorityLevel,
     getDeliveredQtyForOrder: getDeliveredQtyForOrderAny,
     getInspectionApprovedQtyForOrder: getInspectionApprovedQtyForOrderAny,
     getDeliveryInspectionDeltaForOrder: getDeliveryInspectionDeltaForOrderAny,
   });
 
   const {
     handleOpenExtendedPersonnel,
     handleOpenOverproductionGroup,
     handleAssignOverproduction,
     handleSidebarSelect,
     handleOpenArchivedLotDossier,
     handleReopenArchivedOrderWithIncrease,
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
     t: t as any,
     todayStr,
     setActiveTab,
     setIsMobileMenuOpen,
     setShowAiPrediction,
     setIsSyncingDrawings,
     setSelectedSidebarEntry,
     setSelectedOrderId,
     setIsCopying,
     setIsClearing,
     setIsArchivingLegacyRejected,
     showSuccess,
     showInfo,
     showWarning,
     showConfirm,
     notify,
     dataStore: dataStoreList,
     rawOrders: rawOrdersList,
     rawProducts: rawProductsList,
     bezetting: bezettingList,
     selectedSidebarEntry: selectedSidebarEntry || undefined,
     legacyRejectedOrders: legacyRejectedOrders as any[],
     getOrderIdFromTrackedRecord,
     getOrderProgressMeta,
     getFinishedQtyForOrder,
     resolveOverproductionRoute: resolveOverproductionRoute as any,
     isInAllowedScope,
     fixedScope,
     targetSlug,
     departmentFilter,
     effectiveAllowedNorms: effectiveAllowedNorms as any,
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
       handleCreateOrder,
       dataStore: dataStoreList,
       rawProducts: rawProductsList,
       archivedProducts: archivedHistoryProductsList,
       modalData,
       handleArchiveRejectedProduct,
       handleMoveLot,
       rawOrders: rawOrdersList,
       targetSlug,
       effectiveStations,
       overproductionTargetCandidates,
       resolveOverproductionRoute,
       handleAssignOverproduction,
       t,
     }),
     [
       handleCreateOrder, dataStoreList, rawProductsList, archivedHistoryProductsList,
       modalData, handleArchiveRejectedProduct, handleMoveLot, rawOrdersList,
       targetSlug, effectiveStations, overproductionTargetCandidates,
       resolveOverproductionRoute, handleAssignOverproduction, t
     ]
   );
 
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
         t={t as any}
       />
 
       <div className="flex-1 overflow-hidden p-6 w-full flex flex-col text-left">
         <div className="flex-1 overflow-y-auto custom-scrollbar relative">
           {activeTab === "dashboard" ? (
             <TeamleaderDashboard metrics={metrics as any} onKpiClick={handleKpiClick as any} onStationSelect={useTeamleaderModalStore.getState().setSelectedStationDetail} />
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
                 structure={factoryConfig as any}
                 occupancy={bezettingList}
                 personnel={[] as any[]}
                 selectedDateStr={todayStr}
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
               departmentDisplayName={officialDepartmentName}
               onCreateOrder={() => useTeamleaderModalStore.getState().setShowAddOrderModal(true)}
                   trackedProducts={rawProductsList}
                   archivedHistoryProducts={archivedHistoryProductsList}
                   effectiveAllowedNorms={effectiveAllowedNorms as any[]}
                   planningOrders={dataStoreList}
                   onOpenMachineExport={(type: string) => {
                 const store = useTeamleaderModalStore.getState();
                 store.setExportModalType(type || "planning");
                 store.setExportModalLocked(true);
                 store.setShowExportModal(true);
               }}
             />
           ) : (
           <TeamleaderSelectionProvider value={selectionContextValue as any}>
               <div className="h-full flex flex-col overflow-hidden">
                <div className="mx-auto flex h-full w-full max-w-[96vw] lg:max-w-[92vw] 2xl:max-w-[80vw] flex-col overflow-hidden">
                  <SmartPlanningSuggestions 
                    orders={dataStoreList} 
                    onOrderClick={handleSidebarSelect} 
                    availableMachines={effectiveStations?.map((s: any) => String(s?.name || s?.id || ""))}
                  />
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <TeamleaderOrderRail
                      canManageOverproduction={canManageOverproduction}
                      overproductionGroups={overproductionGroups as any[]}
                      onOpenOverproductionGroup={handleOpenOverproductionGroup}
                      resolveOverproductionRoute={resolveOverproductionRoute}
                      orders={dataStoreList}
                      trackedProducts={rawProductsList}
                      archivedHistoryProducts={archivedHistoryProductsList}
                    />
                  </div>
                  <TeamleaderDetailPane
                    handleMoveLot={handleMoveLot}
                    setViewingDossier={useTeamleaderModalStore.getState().setViewingDossier}
                    targetSlug={targetSlug}
                    effectiveStations={effectiveStations as any[]}
                    rawProducts={rawProductsList}
                    archivedHistoryProducts={archivedHistoryProductsList}
                    handleOpenArchivedLotDossier={handleOpenArchivedLotDossier}
                    handleReopenArchivedOrderWithIncrease={handleReopenArchivedOrderWithIncrease}
                  />
                 </div>
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
             const store = useTeamleaderModalStore.getState();
             store.setShowExportModal(false);
             store.setExportModalLocked(false);
             store.setExportPreloadedTask(null);
           }}
           rawOrders={rawOrdersList as any}
           rawProducts={rawProductsList as any}
           archivedProducts={archivedHistoryProductsList as any}
           initialExportType={exportModalType as any}
           lockExportType={exportModalLocked as any}
           onTaskCreated={((taskId: string) => {
             useTeamleaderModalStore.getState().setExportTrackingTaskId(taskId);
           }) as any}
           preloadedTask={exportPreloadedTask as any}
         />
       )}
     </div>
     </TeamleaderModalProvider>
   );
 });
 
 TeamleaderHub.displayName = "TeamleaderHub";
 
 export default TeamleaderHub;
