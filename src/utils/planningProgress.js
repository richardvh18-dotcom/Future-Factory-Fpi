const getNumeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
/**
 * Geeft de effectieve planningshoeveelheid voor een order.
 *
 * Regels:
 * - quantity is de originele orderhoeveelheid (LN import, nooit handmatig verlaagd).
 * - plan wordt door de teamleider handmatig bijgesteld (bijv. "nog 6 van 10 te maken").
 * - Als plan expliciet kleiner is dan quantity → handmatige correctie, gebruik plan.
 * - Anders → gebruik quantity als bron van waarheid.
 *
 * Gebruik dit voor "Te doen" berekeningen en de sidebar "Totaal Gereed / X" weergave.
 * Gebruik quantity direct voor de "Orderhoeveelheid" label.
 * @param {import('../types').PlanningOrder} order
 * @returns {number}
 */
export const getEffectivePlanQty = (order) => {
    const qty = getNumeric(order?.quantity || order?.qty || order?.plannedQuantity);
    const plan = getNumeric(order?.plan);
    if (plan > 0 && plan < qty)
        return plan;
    return qty || plan || 0;
};
export const getOrderIdentity = (order) => String(order?.orderId || order?.id || "").trim();
export const getTrackedRecordOrderId = (record) => {
    const directOrderId = String(record?.orderId || "").trim();
    if (directOrderId)
        return directOrderId;
    const rawId = String(record?.id || "").trim();
    if (!rawId)
        return "";
    return rawId.replace(/_\d{6,}$/, "");
};
export const getTrackedRecordLotId = (record) => {
    const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
    if (directLot)
        return directLot;
    const rawId = String(record?.id || "").trim();
    if (!rawId)
        return "";
    const lotFromId = rawId.match(/_(\d{6,})$/);
    return lotFromId ? lotFromId[1] : "";
};
export const isTrackedRecordFinished = (record) => {
    const statusUpper = String(record?.status || "").trim().toUpperCase();
    const stepUpper = String(record?.currentStep || "").trim().toUpperCase();
    const stationUpper = String(record?.currentStation || "").trim().toUpperCase();
    return (["COMPLETED", "FINISHED", "GEREED"].includes(statusUpper) ||
        stepUpper === "FINISHED" ||
        stationUpper === "GEREED" ||
        !!record?.archivedAt);
};
export const countFinishedTrackedLots = (records = [], { orderId = "", getOrderIdFromRecord = getTrackedRecordOrderId, } = {}) => {
    const normalizedOrderId = String(orderId || "").trim();
    return Array.from(new Set((Array.isArray(records) ? records : [])
        .filter((record) => {
        if (record?.isVirtualLot)
            return false;
        if (normalizedOrderId && getOrderIdFromRecord(record) !== normalizedOrderId)
            return false;
        return isTrackedRecordFinished(record);
    })
        .map(getTrackedRecordLotId)
        .filter(Boolean))).length;
};
export const getOrderFinishedUnits = (order, options = {}) => {
    const typedOptions = options;
    const orderFinishedQty = Math.max(getNumeric(order?.produced), getNumeric(order?.finishedCount), getNumeric(order?.finishValue), getNumeric(order?.wrapped), getNumeric(order?.completed));
    const trackedFinishedQty = (() => {
        if (typeof typedOptions.trackedFinishedCount === "number") {
            return getNumeric(typedOptions.trackedFinishedCount);
        }
        if (typedOptions.trackedFinishedCountByOrder instanceof Map) {
            return getNumeric(typedOptions.trackedFinishedCountByOrder.get(getOrderIdentity(order)));
        }
        if (Array.isArray(typedOptions.trackedRecords)) {
            return countFinishedTrackedLots(typedOptions.trackedRecords, {
                orderId: getOrderIdentity(order),
                getOrderIdFromRecord: typedOptions.getOrderIdFromRecord,
            });
        }
        return 0;
    })();
    return Math.max(orderFinishedQty, trackedFinishedQty);
};
