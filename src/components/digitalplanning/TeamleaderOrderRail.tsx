import React from "react";
import PlanningSidebar from "./PlanningSidebar";
import OverproductionPanel from "./OverproductionPanel";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext";

interface TeamleaderOrderRailProps {
  canManageOverproduction?: boolean;
  overproductionGroups?: any[];
  onOpenOverproductionGroup?: (..._args: any[]) => void;
  resolveOverproductionRoute?: (..._args: any[]) => any;
  orders?: any[];
  trackedProducts?: any[];
  archivedProducts?: any[];
  archivedHistoryProducts?: any[];
}

interface TeamleaderSelectionValue {
  selectedSidebarEntryId?: string | null;
  handleSidebarSelect?: (..._args: unknown[]) => void;
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
  const { selectedSidebarEntryId, handleSidebarSelect } =
    useTeamleaderSelection() as TeamleaderSelectionValue;

  return (
    <div className="flex flex-col min-h-0 h-full w-full transition-all duration-300">
      {canManageOverproduction && (
        <OverproductionPanel
          overproductionGroups={overproductionGroups}
          onOpenOverproductionGroup={onOpenOverproductionGroup}
          resolveOverproductionRoute={resolveOverproductionRoute}
        />
      )}
      <div className="min-h-0 flex-1">
        <PlanningSidebar
          orders={orders as any[]}
          trackedProducts={trackedProducts as any[]}
          archivedProducts={archivedProducts as any[]}
          archivedHistoryProducts={archivedHistoryProducts as any[]}
          enableRejectionScopes={true}
          selectedOrderId={selectedSidebarEntryId || undefined}
          onSelect={(handleSidebarSelect as ((_: any) => void) | undefined) || (() => {})}
        />
      </div>
    </div>
  );
};

export default TeamleaderOrderRail;