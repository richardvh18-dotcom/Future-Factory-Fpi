import React from "react";
import PlanningSidebar from "./PlanningSidebar";
import OverproductionPanel from "./OverproductionPanel";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext.tsx";

const TeamleaderOrderRail = ({
  canManageOverproduction,
  overproductionGroups,
  onOpenOverproductionGroup,
  resolveOverproductionRoute,
  orders,
  trackedProducts,
  archivedProducts,
  archivedHistoryProducts,
}) => {
  const { selectedDetailEntry, selectedSidebarEntryId, handleSidebarSelect } = useTeamleaderSelection();

  return (
    <div className={`shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? "hidden lg:flex w-[38rem]" : "w-full lg:w-[38rem]"}`}>
      {canManageOverproduction && (
        <OverproductionPanel
          overproductionGroups={overproductionGroups}
          onOpenOverproductionGroup={onOpenOverproductionGroup}
          resolveOverproductionRoute={resolveOverproductionRoute}
        />
      )}
      <div className="min-h-0 flex-1">
        <PlanningSidebar
          orders={orders}
          trackedProducts={trackedProducts}
          archivedProducts={archivedProducts}
          archivedHistoryProducts={archivedHistoryProducts}
          enableRejectionScopes={true}
          selectedOrderId={selectedSidebarEntryId}
          onSelect={handleSidebarSelect}
        />
      </div>
    </div>
  );
};

export default TeamleaderOrderRail;
