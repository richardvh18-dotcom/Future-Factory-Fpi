import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import OrderDetailRaw from "./OrderDetail";
const OrderDetail = OrderDetailRaw;
import ArchivedOrderDetailPanel from "./ArchivedOrderDetailPanel";
import OrderDetailPlaceholder from "./OrderDetailPlaceholder";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext";
/**
 * TeamleaderDetailPane — right-side detail column of TeamleaderHub.
 * Shows OrderDetail when an active order is selected, ArchivedOrderDetailPanel
 * when an archived order entry is selected, or a placeholder when nothing is selected.
 */
const TeamleaderDetailPane = React.memo(function TeamleaderDetailPane({ handleMoveLot, setViewingDossier, targetSlug, effectiveStations, rawProducts, archivedHistoryProducts, handleOpenArchivedLotDossier, handleReopenArchivedOrderWithIncrease, }) {
    const { selectedOrder, selectedSidebarEntry, selectedDetailEntry, clearSelection } = useTeamleaderSelection();
    return (_jsx("div", { className: `flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`, children: selectedOrder ? (_jsx(OrderDetail, { order: selectedOrder, products: [...rawProducts, ...archivedHistoryProducts], onClose: clearSelection, isManager: true, onMoveLot: handleMoveLot, onOpenDossier: setViewingDossier, showAllStations: true, currentDepartment: targetSlug, allowedStations: effectiveStations })) : selectedSidebarEntry?.isArchivedOrder ? (_jsx(ArchivedOrderDetailPanel, { selectedSidebarEntry: selectedSidebarEntry, onClose: clearSelection, onOpenArchivedLotDossier: handleOpenArchivedLotDossier, onReopenArchivedOrderWithIncrease: handleReopenArchivedOrderWithIncrease })) : (_jsx(OrderDetailPlaceholder, {})) }));
});
TeamleaderDetailPane.displayName = "TeamleaderDetailPane";
export default TeamleaderDetailPane;
