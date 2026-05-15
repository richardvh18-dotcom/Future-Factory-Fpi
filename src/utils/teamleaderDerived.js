import { getISOWeek, startOfISOWeek } from "date-fns";
import { normalizeMachine, getStartedCounterField } from "./hubHelpers";
import { normalizeOrderStatus } from "./trackingHelpers";
const toValidDate = (value) => {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === "object" && value !== null && "toDate" in value) {
        const dateFactory = value.toDate;
        if (typeof dateFactory === "function") {
            const parsed = dateFactory();
            return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
        }
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
};
const toMillisSafe = (value) => {
    if (typeof value === "object" && value !== null && "toMillis" in value) {
        const millisFactory = value.toMillis;
        if (typeof millisFactory === "function") {
            const millis = millisFactory();
            return Number.isFinite(millis) ? millis : 0;
        }
    }
    const parsedDate = toValidDate(value);
    return parsedDate ? parsedDate.getTime() : 0;
};
const OPEN_OR_RUNNING_STATUSES = [
    "open",
    "planned",
    "waiting",
    "released",
    "release",
    "nieuw",
    "new",
    "pending",
    "todo",
    "to_do",
    "te_doen",
    "in_progress",
    "in_behandeling",
    "active",
    "processing",
    "running",
    "lopend",
];
export const isOpenOrRunningOrder = (order) => {
    const normalized = normalizeOrderStatus(order?.status || order?.orderStatus);
    return OPEN_OR_RUNNING_STATUSES.includes(normalized);
};
export const getOrderRemainingQueueQty = (order) => {
    // Altijd dynamisch berekenen: plan - started_<machine>.
    // Nooit de opgeslagen toDoQty-teller gebruiken; die kan stale zijn als plan handmatig of via LN wijzigt.
    const planQty = Number(order?.plan ?? order?.quantity ?? 0);
    const stationNorm = normalizeMachine(order?.machine || order?.station || "");
    const startedField = getStartedCounterField(stationNorm);
    const startedQty = startedField ? Number(order?.[startedField] || 0) : 0;
    if (!Number.isFinite(planQty))
        return 0;
    if (!Number.isFinite(startedQty))
        return Math.max(planQty, 0);
    return Math.max(planQty - startedQty, 0);
};
export const getDeliveredQtyForOrder = (order) => {
    const candidates = [
        order?.lnDeliveredQty,
        order?.deliveredQty,
        order?.quantityDelivered,
        order?.delivered,
    ];
    for (const value of candidates) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
};
export const getInspectionApprovedQtyForOrder = (order) => {
    const explicitApproved = Number(order?.inspectionApprovedQty);
    if (Number.isFinite(explicitApproved))
        return explicitApproved;
    const produced = Number(order?.produced);
    if (Number.isFinite(produced))
        return produced;
    return 0;
};
export const getDeliveryInspectionDeltaForOrder = (order) => {
    const deliveredQty = getDeliveredQtyForOrder(order);
    if (deliveredQty == null)
        return null;
    return deliveredQty - getInspectionApprovedQtyForOrder(order);
};
export const isEventInCurrentWeek = (value, { currentWeek, currentYear }) => {
    const eventDate = toValidDate(value);
    if (!eventDate)
        return false;
    return getISOWeek(eventDate) === currentWeek && eventDate.getFullYear() === currentYear;
};
export const getLegacyRejectedOrders = ({ rawOrders, rawProducts, getOrderIdFromTrackedRecord, getFinishedQtyForOrder, isInactiveTrackedProduct, }) => {
    const currentWeekStart = startOfISOWeek(new Date());
    const hasActiveProductsForOrder = (orderId) => {
        const normalizedOrderId = String(orderId || "").trim();
        if (!normalizedOrderId)
            return false;
        return rawProducts.some((product) => {
            if (getOrderIdFromTrackedRecord(product) !== normalizedOrderId)
                return false;
            return !isInactiveTrackedProduct(product);
        });
    };
    return rawOrders.filter((order) => {
        const status = String(order?.status || order?.orderStatus || "").toLowerCase().trim();
        const archiveReason = String(order?.archiveReason || order?.archivedReason || "").toLowerCase().trim();
        const rejectedCount = Number(order?.rejectedCount || 0);
        const planCount = Number(order?.plan ?? order?.quantity ?? 0);
        const finishedCount = getFinishedQtyForOrder(order);
        const orderDate = (() => {
            const value = (order?.plannedDate || order?.date || order?.deliveryDate || null);
            return toValidDate(value);
        })();
        const explicitRejected = ["rejected", "afkeur", "definitieve afkeur"].includes(status) || archiveReason === "rejected";
        if (explicitRejected)
            return true;
        const isOlderOrder = orderDate ? orderDate < currentWeekStart : false;
        const fullyAccountedFor = planCount > 0 && rejectedCount + finishedCount >= planCount;
        const hasNoActiveProducts = !hasActiveProductsForOrder(order?.orderId || order?.id);
        return rejectedCount > 0 && hasNoActiveProducts && (isOlderOrder || fullyAccountedFor);
    });
};
export const buildOverproductionGroups = ({ rawProducts, getLotFromTrackedRecord }) => {
    const unresolved = rawProducts.filter((product) => {
        if (!product?.isOverproduction)
            return false;
        return String(product.orderId || "").trim().toUpperCase() === "NOG_TE_BEPALEN";
    });
    const grouped = new Map();
    unresolved.forEach((product) => {
        const originalOrderId = String(product.originalOrderId || "ONBEKEND").trim();
        const originMachine = String(product.originMachine || product.currentStation || "ONBEKEND").trim();
        const item = String(product.item || "").trim();
        const key = `${originalOrderId}__${originMachine}__${item}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                key,
                originalOrderId,
                originMachine,
                item,
                products: [],
                lotNumbers: [],
                count: 0,
                createdAtMs: 0,
            });
        }
        const entry = grouped.get(key);
        if (!entry)
            return;
        entry.products.push(product);
        entry.lotNumbers.push(getLotFromTrackedRecord(product) || String(product.id || "").trim());
        entry.count += 1;
        const createdAtMs = toMillisSafe(product.createdAt || product.updatedAt);
        entry.createdAtMs = Math.max(entry.createdAtMs || 0, Number.isFinite(createdAtMs) ? createdAtMs : 0);
    });
    return Array.from(grouped.values());
};
