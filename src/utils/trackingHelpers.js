import { toDateSafe } from "./dateUtils";
const toDateLike = (value) => {
    if (value == null ||
        value instanceof Date ||
        typeof value === "string" ||
        typeof value === "number") {
        return value;
    }
    if (typeof value === "object") {
        return value;
    }
    return null;
};
export const normalizeOrderStatus = (status) => String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
/** @param {import('../types').TrackedProduct} product */
export const getTrackedStatus = (product) => String(product?.status || "").trim().toLowerCase();
/** @param {import('../types').TrackedProduct} product */
export const getTrackedStep = (product) => String(product?.currentStep || "").trim().toLowerCase();
/** @param {import('../types').TrackedProduct} product */
export const isArchivedRejectedProduct = (product) => getTrackedStatus(product) === "archived_rejected";
/** @param {import('../types').TrackedProduct} product */
export const isFinishedProduct = (product) => {
    const status = getTrackedStatus(product);
    const step = getTrackedStep(product);
    return ["finished", "completed", "gereed"].includes(status) || step === "finished";
};
/** @param {import('../types').TrackedProduct} product */
export const isRejectedProduct = (product) => {
    if (isArchivedRejectedProduct(product))
        return false;
    const status = getTrackedStatus(product);
    const step = getTrackedStep(product);
    return ["rejected", "afkeur"].includes(status) || step === "rejected";
};
/** @param {import('../types').TrackedProduct} product */
export const isInactiveTrackedProduct = (product) => {
    return isArchivedRejectedProduct(product) || isFinishedProduct(product) || isRejectedProduct(product);
};
/**
 * Statussen die een planningorder zichtbaar houden ondanks planningHidden=true.
 * Canonical lijst — gebruik dit overal in plaats van inline status-checks.
 */
export const ACTIVE_PLANNING_STATUSES = new Set([
    "in_progress",
    "in production",
    "active",
    "post_processing",
    "to_unload",
    "unloading",
    "to_inspect",
    "held_qc",
    "on_hold",
    "delegated",
]);
export const isActivePlanningOrder = (order) => {
    const s = normalizeOrderStatus(order?.status);
    return ACTIVE_PLANNING_STATUSES.has(s);
};
export const subtractWorkingDays = (fromDate, days) => {
    const d = new Date(fromDate);
    let counted = 0;
    while (counted < days) {
        d.setDate(d.getDate() - 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6)
            counted++;
    }
    return d;
};
export const getTrackedCompletionDate = (item) => {
    return (toDateSafe(toDateLike(item?.timestamps?.finished)) ||
        toDateSafe(toDateLike(item?.timestamps?.completed)) ||
        toDateSafe(toDateLike(item?.archivedAt)) ||
        toDateSafe(toDateLike(item?.updatedAt)) ||
        toDateSafe(toDateLike(item?.timestamps?.lossen_start)) ||
        toDateSafe(toDateLike(item?.timestamps?.wikkelen_end)) ||
        toDateSafe(toDateLike(item?.timestamps?.station_end)) ||
        toDateSafe(toDateLike(item?.createdAt)));
};
