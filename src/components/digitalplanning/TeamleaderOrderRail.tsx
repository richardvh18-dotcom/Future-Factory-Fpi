import React from "react";
import PlanningSidebar from "./PlanningSidebar";
import OverproductionPanel from "./OverproductionPanel";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext";

interface TeamleaderOrderRailProps {
  canManageOverproduction?: boolean;
  overproductionGroups?: unknown[];
  onOpenOverproductionGroup?: (...args: unknown[]) => void;
  resolveOverproductionRoute?: (...args: unknown[]) => unknown;
  orders?: unknown[];
  trackedProducts?: unknown[];
  archivedProducts?: unknown[];
  archivedHistoryProducts?: unknown[];
}

interface TeamleaderSelectionValue {
  selectedDetailEntry?: unknown;
  selectedSidebarEntryId?: string | null;
  handleSidebarSelect?: (...args: unknown[]) => void;
}

const TeamleaderOrderRail = ({
  canManageOverproduction,
  overproductionGroups,
  onOpenOverproductionGroup,
  resolveOverproductionRoute,
  orders,
  trackedProducts,
  archivedProducts,
  archivedHistoryProducts,
}: TeamleaderOrderRailProps) => {
  const { selectedDetailEntry, selectedSidebarEntryId, handleSidebarSelect } =
    useTeamleaderSelection() as TeamleaderSelectionValue;

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
          orders={orders as never[]}
          trackedProducts={trackedProducts as never[]}
          archivedProducts={archivedProducts as never[]}
          archivedHistoryProducts={archivedHistoryProducts as never[]}
          enableRejectionScopes={true}
          selectedOrderId={selectedSidebarEntryId}
          onSelect={handleSidebarSelect}
        />
      </div>
    </div>
  );
};

export default TeamleaderOrderRail;