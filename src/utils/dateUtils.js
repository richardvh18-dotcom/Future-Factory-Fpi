export const toDateSafe = (value) => {
    if (!value)
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    const valueObject = typeof value === "object" ? value : null;
    if (valueObject && typeof valueObject.toDate === "function") {
        const date = valueObject.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (valueObject && typeof valueObject.toMillis === "function") {
        const millis = valueObject.toMillis();
        if (Number.isFinite(millis)) {
            const date = new Date(millis);
            return Number.isNaN(date.getTime()) ? null : date;
        }
    }
    const seconds = valueObject?.seconds ?? valueObject?._seconds;
    if (typeof seconds === "number") {
        const nanoseconds = valueObject?.nanoseconds ?? valueObject?._nanoseconds ?? 0;
        const millis = seconds * 1000 + Math.floor(Number(nanoseconds) / 1000000);
        const date = new Date(millis);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (!(typeof value === "string" || typeof value === "number")) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
export const formatDateTimeSafe = (value, locale = "nl-NL", options = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
}, fallback = "-") => {
    const date = toDateSafe(value);
    return date ? date.toLocaleString(locale, options) : fallback;
};
export const resolveDeliveryDate = (...values) => {
    for (const value of values) {
        const date = toDateSafe(value);
        if (date)
            return date;
    }
    return null;
};
export const getDeliveryPlanningState = (deliveryDate, { now = new Date(), productionLeadDays = 21, finishBufferDays = 3, } = {}) => {
    const delivery = toDateSafe(deliveryDate);
    if (!delivery) {
        return {
            state: "unknown",
            deliveryDate: null,
            productionStartDate: null,
            finishTargetDate: null,
            daysUntilDelivery: null,
        };
    }
    const start = new Date(delivery);
    start.setDate(start.getDate() - productionLeadDays);
    const finishTarget = new Date(delivery);
    finishTarget.setDate(finishTarget.getDate() - finishBufferDays);
    const ref = toDateSafe(now) || new Date();
    const endOfDay = new Date(delivery);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfFinishTarget = new Date(finishTarget);
    startOfFinishTarget.setHours(0, 0, 0, 0);
    const startOfProduction = new Date(start);
    startOfProduction.setHours(0, 0, 0, 0);
    const daysUntilDelivery = Math.ceil((endOfDay.getTime() - ref.getTime()) / 86400000);
    let state = "planned";
    if (ref > endOfDay) {
        state = "overdue";
    }
    else if (ref >= startOfFinishTarget) {
        state = "finish_due";
    }
    else if (ref >= startOfProduction) {
        state = "in_production_window";
    }
    return {
        state,
        deliveryDate: delivery,
        productionStartDate: start,
        finishTargetDate: finishTarget,
        daysUntilDelivery,
    };
};
