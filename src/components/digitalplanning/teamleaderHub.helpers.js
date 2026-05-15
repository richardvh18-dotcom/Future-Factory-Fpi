import { normalizeMachine, PIPE_MACHINES } from "../../utils/hubHelpers";
export const getLotFromTrackedRecord = (record) => {
    const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
    if (directLot)
        return directLot;
    const rawId = String(record?.id || "").trim();
    if (!rawId)
        return "";
    const lotFromId = rawId.match(/_(\d{6,})$/);
    return lotFromId ? lotFromId[1] : "";
};
export const resolveOverproductionRoute = (targetOrder, group, manualStation = "") => {
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
export const getPriorityLevel = (order) => {
    const rawPriority = order?.priority;
    const normalizedPriority = rawPriority === true
        ? "high"
        : String(rawPriority || "").toLowerCase().trim();
    if (normalizedPriority === "immediate")
        return "immediate";
    if (normalizedPriority === "urgent")
        return "urgent";
    if (normalizedPriority === "high")
        return "high";
    if (order?.isMoved)
        return "high";
    if (order?.isUrgent)
        return "urgent";
    return "normal";
};
export const getOverproductionTargetCandidates = ({ rawOrders, overproductionTargetOrderId, selectedOverproductionGroup, }) => {
    const input = String(overproductionTargetOrderId || "").trim().toLowerCase();
    const sameItem = String(selectedOverproductionGroup?.item || "").trim().toLowerCase();
    return rawOrders
        .filter((order) => !["completed", "cancelled", "rejected", "shipped"].includes(String(order?.status || "").toLowerCase()))
        .filter((order) => {
        if (input) {
            return String(order.orderId || "").toLowerCase().includes(input);
        }
        if (!sameItem)
            return true;
        return String(order.item || "").trim().toLowerCase() === sameItem;
    })
        .sort((a, b) => String(a.orderId || "").localeCompare(String(b.orderId || "")))
        .slice(0, 12);
};
