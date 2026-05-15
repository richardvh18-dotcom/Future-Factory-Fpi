import { toDateSafe } from "./dateUtils";

type DateLikeCompat =
  | Date
  | string
  | number
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

type StatusLike = { status?: unknown; currentStep?: unknown } | null | undefined;
type OrderLike = { status?: unknown } | null | undefined;
type DateCarrier = {
  timestamps?: {
    finished?: unknown;
    completed?: unknown;
    lossen_start?: unknown;
    wikkelen_end?: unknown;
    station_end?: unknown;
  };
  archivedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
} | null | undefined;

const toDateLike = (value: unknown): DateLikeCompat => {
  if (
    value == null ||
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "object") {
    return value as DateLikeCompat;
  }

  return null;
};

export const normalizeOrderStatus = (status: unknown): string =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** @param {import('../types').TrackedProduct} product */
export const getTrackedStatus = (product: StatusLike): string => String(product?.status || "").trim().toLowerCase();

/** @param {import('../types').TrackedProduct} product */
export const getTrackedStep = (product: StatusLike): string => String(product?.currentStep || "").trim().toLowerCase();

/** @param {import('../types').TrackedProduct} product */
export const isArchivedRejectedProduct = (product: StatusLike): boolean => getTrackedStatus(product) === "archived_rejected";

/** @param {import('../types').TrackedProduct} product */
export const isFinishedProduct = (product: StatusLike): boolean => {
  const status = getTrackedStatus(product);
  const step = getTrackedStep(product);
  return ["finished", "completed", "gereed"].includes(status) || step === "finished";
};

/** @param {import('../types').TrackedProduct} product */
export const isRejectedProduct = (product: StatusLike): boolean => {
  if (isArchivedRejectedProduct(product)) return false;
  const status = getTrackedStatus(product);
  const step = getTrackedStep(product);
  return ["rejected", "afkeur"].includes(status) || step === "rejected";
};

/** @param {import('../types').TrackedProduct} product */
export const isInactiveTrackedProduct = (product: StatusLike): boolean => {
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

export const isActivePlanningOrder = (order: OrderLike): boolean => {
  const s = normalizeOrderStatus(order?.status);
  return ACTIVE_PLANNING_STATUSES.has(s);
};

export const subtractWorkingDays = (fromDate: Date | string | number, days: number): Date => {
  const d = new Date(fromDate);
  let counted = 0;
  while (counted < days) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) counted++;
  }
  return d;
};

export const getTrackedCompletionDate = (item: DateCarrier): Date | null => {
  return (
    toDateSafe(toDateLike(item?.timestamps?.finished)) ||
    toDateSafe(toDateLike(item?.timestamps?.completed)) ||
    toDateSafe(toDateLike(item?.archivedAt)) ||
    toDateSafe(toDateLike(item?.updatedAt)) ||
    toDateSafe(toDateLike(item?.timestamps?.lossen_start)) ||
    toDateSafe(toDateLike(item?.timestamps?.wikkelen_end)) ||
    toDateSafe(toDateLike(item?.timestamps?.station_end)) ||
    toDateSafe(toDateLike(item?.createdAt))
  );
};