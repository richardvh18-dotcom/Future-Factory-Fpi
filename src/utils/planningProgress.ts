type PlanningOrderLike = {
  id?: string;
  orderId?: string;
  quantity?: number | string;
  qty?: number | string;
  plannedQuantity?: number | string;
  plan?: number | string;
  produced?: number | string;
  finishedCount?: number | string;
  finishValue?: number | string;
  wrapped?: number | string;
  completed?: number | string;
};

type TrackedRecordLike = {
  id?: string;
  orderId?: string;
  lotNumber?: string;
  activeLot?: string;
  status?: string;
  currentStep?: string;
  currentStation?: string;
  archivedAt?: unknown;
  isVirtualLot?: boolean;
};

const getNumeric = (value: unknown) => {
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
export const getEffectivePlanQty = (order: PlanningOrderLike | null | undefined) => {
  const qty = getNumeric(order?.quantity || order?.qty || order?.plannedQuantity);
  const plan = getNumeric(order?.plan);
  if (plan > 0 && plan < qty) return plan;
  return qty || plan || 0;
};

export const getOrderIdentity = (order: PlanningOrderLike | null | undefined) =>
  String(order?.orderId || order?.id || "").trim();

export const getTrackedRecordOrderId = (record: TrackedRecordLike | null | undefined) => {
  const directOrderId = String(record?.orderId || "").trim();
  if (directOrderId) return directOrderId;

  const rawId = String(record?.id || "").trim();
  if (!rawId) return "";

  return rawId.replace(/_\d{6,}$/, "");
};

export const getTrackedRecordLotId = (record: TrackedRecordLike | null | undefined) => {
  const directLot = String(record?.lotNumber || record?.activeLot || "").trim();
  if (directLot) return directLot;

  const rawId = String(record?.id || "").trim();
  if (!rawId) return "";

  const lotFromId = rawId.match(/_(\d{6,})$/);
  return lotFromId ? lotFromId[1] : "";
};

export const isTrackedRecordFinished = (record: TrackedRecordLike | null | undefined) => {
  const statusUpper = String(record?.status || "").trim().toUpperCase();
  const stepUpper = String(record?.currentStep || "").trim().toUpperCase();
  const stationUpper = String(record?.currentStation || "").trim().toUpperCase();

  return (
    ["COMPLETED", "FINISHED", "GEREED"].includes(statusUpper) ||
    stepUpper === "FINISHED" ||
    stationUpper === "GEREED" ||
    !!record?.archivedAt
  );
};

export const countFinishedTrackedLots = (
  records: TrackedRecordLike[] = [],
  {
    orderId = "",
    getOrderIdFromRecord = getTrackedRecordOrderId,
  }: {
    orderId?: string;
    getOrderIdFromRecord?: (record: TrackedRecordLike | null | undefined) => string;
  } = {}
) => {
  const normalizedOrderId = String(orderId || "").trim();

  return Array.from(
    new Set(
      (Array.isArray(records) ? records : ([] as TrackedRecordLike[]))
        .filter((record) => {
          if (record?.isVirtualLot) return false;
          if (normalizedOrderId && getOrderIdFromRecord(record) !== normalizedOrderId) return false;
          return isTrackedRecordFinished(record);
        })
        .map(getTrackedRecordLotId)
        .filter(Boolean)
    )
  ).length;
};

export const getOrderFinishedUnits = (
  order: PlanningOrderLike | null | undefined,
  options: {
    trackedFinishedCount?: number;
    trackedFinishedCountByOrder?: Map<string, number>;
    trackedRecords?: TrackedRecordLike[];
    getOrderIdFromRecord?: (record: TrackedRecordLike | null | undefined) => string;
  } = {}
) => {
  const typedOptions = options;

  const orderFinishedQty = Math.max(
    getNumeric(order?.produced),
    getNumeric(order?.finishedCount),
    getNumeric(order?.finishValue),
    getNumeric(order?.wrapped),
    getNumeric(order?.completed)
  );

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