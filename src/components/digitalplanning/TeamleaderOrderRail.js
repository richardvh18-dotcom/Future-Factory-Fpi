import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import PlanningSidebar from "./PlanningSidebar";
import OverproductionPanel from "./OverproductionPanel";
import { useTeamleaderSelection } from "./TeamleaderSelectionContext";
const TeamleaderOrderRail = ({ canManageOverproduction, overproductionGroups, onOpenOverproductionGroup, resolveOverproductionRoute, orders, trackedProducts, archivedProducts, archivedHistoryProducts, }) => {
    const { selectedDetailEntry, selectedSidebarEntryId, handleSidebarSelect } = useTeamleaderSelection();
    return (_jsxs("div", { className: `shrink-0 flex flex-col min-h-0 transition-all duration-300 ${selectedDetailEntry ? "hidden lg:flex w-[38rem]" : "w-full lg:w-[38rem]"}`, children: [canManageOverproduction && (_jsx(OverproductionPanel, { overproductionGroups: overproductionGroups, onOpenOverproductionGroup: onOpenOverproductionGroup, resolveOverproductionRoute: resolveOverproductionRoute })), _jsx("div", { className: "min-h-0 flex-1", children: _jsx(PlanningSidebar, { orders: orders, trackedProducts: trackedProducts, archivedProducts: archivedProducts, archivedHistoryProducts: archivedHistoryProducts, enableRejectionScopes: true, selectedOrderId: selectedSidebarEntryId, onSelect: handleSidebarSelect }) })] }));
};
export default TeamleaderOrderRail;
