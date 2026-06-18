import React from "react";
import OrderDetail from "./OrderDetail";
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
  handleReopenArchivedOrderWithIncrease,
}: any) {
  const { selectedOrder, selectedSidebarEntry, selectedDetailEntry, clearSelection } = useTeamleaderSelection() as any;

  const detailContent = selectedOrder ? (
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
      onReopenArchivedOrderWithIncrease={handleReopenArchivedOrderWithIncrease}
    />
  ) : (
    <OrderDetailPlaceholder />
  );

  return (
    selectedDetailEntry ? (
      <div
        className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-[2px] p-3 sm:p-5 lg:p-8"
        onClick={clearSelection}
      >
        <div
          className="mx-auto h-full w-full max-w-[96vw] lg:max-w-[88vw] 2xl:max-w-[84vw] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="h-full w-full min-w-0">
            {detailContent}
          </div>
        </div>
      </div>
    ) : null
  );
});

TeamleaderDetailPane.displayName = "TeamleaderDetailPane";

export default TeamleaderDetailPane;
