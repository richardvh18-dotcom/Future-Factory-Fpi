import { getISOWeek, startOfISOWeek } from "date-fns";
import { normalizeMachine, getStartedCounterField } from "./hubHelpers";
import { normalizeOrderStatus } from "./trackingHelpers";

type AnyRecord = Record<string, unknown>;

type DateValueLike =
  | Date
  | string
  | number
  | { toDate?: () => Date; toMillis?: () => number }
  | null
  | undefined;

type TrackedProduct = {
  isOverproduction?: boolean;
  orderId?: string;
  originalOrderId?: string;
  originMachine?: string;
  currentStation?: string;
  item?: string;
  id?: string;
  createdAt?: DateValueLike;
  updatedAt?: DateValueLike;
};

const toValidDate = (value: DateValueLike): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;

  if (typeof value === "object" && value !== null) {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === "function") {
      // Belangrijk: roep als objectmethode aan zodat `this` behouden blijft.
      const parsed = withToDate.toDate();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
};

const toMillisSafe = (value: DateValueLike): number => {
  if (typeof value === "object" && value !== null) {
    const withToMillis = value as { toMillis?: () => number };
    if (typeof withToMillis.toMillis === "function") {
      // Zelfde context-probleem als bij toDate voorkomen.
      const millis = withToMillis.toMillis();
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

export const isOpenOrRunningOrder = (order: AnyRecord): boolean => {
  const normalized = normalizeOrderStatus(order?.status || order?.orderStatus);
  return OPEN_OR_RUNNING_STATUSES.includes(normalized);
};

export const getOrderRemainingQueueQty = (order: AnyRecord): number => {
  // Altijd dynamisch berekenen: plan - started_<machine>.
  // Nooit de opgeslagen toDoQty-teller gebruiken; die kan stale zijn als plan handmatig of via LN wijzigt.
  const planQty = Number(order?.plan ?? order?.quantity ?? 0);
  const stationNorm = normalizeMachine(order?.machine || order?.station || "");
  const startedField = getStartedCounterField(stationNorm);
  const startedQty = startedField ? Number(order?.[startedField] || 0) : 0;

  if (!Number.isFinite(planQty)) return 0;
  if (!Number.isFinite(startedQty)) return Math.max(planQty, 0);
  return Math.max(planQty - startedQty, 0);
};

export const getDeliveredQtyForOrder = (order: AnyRecord): number | null => {
  const candidates = [
    order?.lnDeliveredQty,
    order?.deliveredQty,
    order?.quantityDelivered,
    order?.delivered,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

export const getInspectionApprovedQtyForOrder = (order: AnyRecord): number => {
  const explicitApproved = Number(order?.inspectionApprovedQty);
  if (Number.isFinite(explicitApproved)) return explicitApproved;
  const produced = Number(order?.produced);
  if (Number.isFinite(produced)) return produced;
  return 0;
};

export const getDeliveryInspectionDeltaForOrder = (order: AnyRecord): number | null => {
  const deliveredQty = getDeliveredQtyForOrder(order);
  if (deliveredQty == null) return null;
  return deliveredQty - getInspectionApprovedQtyForOrder(order);
};

export const isEventInCurrentWeek = (
  value: DateValueLike,
  { currentWeek, currentYear }: { currentWeek: number; currentYear: number }
): boolean => {
  const eventDate = toValidDate(value);
  if (!eventDate) return false;
  return getISOWeek(eventDate) === currentWeek && eventDate.getFullYear() === currentYear;
};

export const getLegacyRejectedOrders = ({
  rawOrders,
  rawProducts,
  getOrderIdFromTrackedRecord,
  getFinishedQtyForOrder,
  isInactiveTrackedProduct,
}: {
  rawOrders: AnyRecord[];
  rawProducts: AnyRecord[];
  getOrderIdFromTrackedRecord: (product: AnyRecord) => string | null;
  getFinishedQtyForOrder: (order: AnyRecord) => number;
  isInactiveTrackedProduct: (product: AnyRecord) => boolean;
}): AnyRecord[] => {
  const currentWeekStart = startOfISOWeek(new Date());

  const hasActiveProductsForOrder = (orderId: unknown): boolean => {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) return false;

    return rawProducts.some((product: AnyRecord) => {
      if (getOrderIdFromTrackedRecord(product) !== normalizedOrderId) return false;
      return !isInactiveTrackedProduct(product);
    });
  };

  return rawOrders.filter((order: AnyRecord) => {
    const status = String(order?.status || order?.orderStatus || "").toLowerCase().trim();
    const archiveReason = String(order?.archiveReason || order?.archivedReason || "").toLowerCase().trim();
    const rejectedCount = Number(order?.rejectedCount || 0);
    const planCount = Number(order?.plan ?? order?.quantity ?? 0);
    const finishedCount = getFinishedQtyForOrder(order);
    const orderDate = (() => {
      const value = (order?.plannedDate || order?.date || order?.deliveryDate || null) as DateValueLike;
      return toValidDate(value);
    })();

    const explicitRejected = ["rejected", "afkeur", "definitieve afkeur"].includes(status) || archiveReason === "rejected";
    if (explicitRejected) return true;

    const isOlderOrder = orderDate ? orderDate < currentWeekStart : false;
    const fullyAccountedFor = planCount > 0 && rejectedCount + finishedCount >= planCount;
    const hasNoActiveProducts = !hasActiveProductsForOrder(order?.orderId || order?.id);

    return rejectedCount > 0 && hasNoActiveProducts && (isOlderOrder || fullyAccountedFor);
  });
};

export const buildOverproductionGroups = ({ rawProducts, getLotFromTrackedRecord }: {
  rawProducts: TrackedProduct[];
  getLotFromTrackedRecord: (product: TrackedProduct) => string | null;
}) => {
  const unresolved = rawProducts.filter((product: TrackedProduct) => {
    if (!product?.isOverproduction) return false;
    return String(product.orderId || "").trim().toUpperCase() === "NOG_TE_BEPALEN";
  });

  const grouped = new Map<string, {
    key: string;
    originalOrderId: string;
    originMachine: string;
    item: string;
    products: TrackedProduct[];
    lotNumbers: string[];
    count: number;
    createdAtMs: number;
  }>();
  unresolved.forEach((product: TrackedProduct) => {
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
    if (!entry) return;
    entry.products.push(product);
    entry.lotNumbers.push(getLotFromTrackedRecord(product) || String(product.id || "").trim());
    entry.count += 1;

    const createdAtMs = toMillisSafe(product.createdAt || product.updatedAt);
    entry.createdAtMs = Math.max(entry.createdAtMs || 0, Number.isFinite(createdAtMs) ? createdAtMs : 0);
  });

  return Array.from(grouped.values());
};
