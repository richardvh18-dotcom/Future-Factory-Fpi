import React from "react";
import OrderDetailRaw from "./OrderDetail";
const OrderDetail = OrderDetailRaw as React.ComponentType<any>;
import ArchivedOrderDetailPanel from "./ArchivedOrderDetailPanel";
import OrderDetailPlaceholder from "./OrderDetailPlaceholder";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext";

/**
 * TeamleaderDetailPane — right-side detail column of TeamleaderHub.
 * Shows OrderDetail when an active order is selected, ArchivedOrderDetailPanel
 * when an archived order entry is selected, or a placeholder when nothing is selected.
 */
const TeamleaderDetailPane = React.memo(function TeamleaderDetailPane({
  handleMoveLot,
  setViewingDossier,
  targetSlug,
  effectiveStations,
  rawProducts,
  archivedHistoryProducts,
  handleOpenArchivedLotDossier,
}: any) {
  const { selectedOrder, selectedSidebarEntry, selectedDetailEntry, clearSelection } = useTeamleaderSelection() as any;

  return (
    <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
      {selectedOrder ? (
        <OrderDetail
          order={selectedOrder}
          products={[...rawProducts, ...archivedHistoryProducts]}
          onClose={clearSelection}
          isManager={true}
          onMoveLot={handleMoveLot}
          onOpenDossier={setViewingDossier}
          showAllStations={true}
          currentDepartment={targetSlug}
          allowedStations={effectiveStations}
        />
      ) : selectedSidebarEntry?.isArchivedOrder ? (
        <ArchivedOrderDetailPanel
          selectedSidebarEntry={selectedSidebarEntry}
          onClose={clearSelection}
          onOpenArchivedLotDossier={handleOpenArchivedLotDossier}
        />
      ) : (
        <OrderDetailPlaceholder />
      )}
    </div>
  );
});

TeamleaderDetailPane.displayName = "TeamleaderDetailPane";

export default TeamleaderDetailPane;
