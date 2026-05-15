import { useMemo } from "react";
import { addWeeks, endOfISOWeek, format, startOfISOWeek } from "date-fns";

type GenericRecord = Record<string, unknown>;

type UseTeamleaderModalDataArgs = {
  activeKpi?: string;
  dataStore: GenericRecord[];
  rawProducts: GenericRecord[];
  archivedHistoryProducts: GenericRecord[];
  archivedRejectedProducts: GenericRecord[];
  bezetting: GenericRecord[];
  kpiWeekOffset: number;
  getOrderProgressMeta: (order: GenericRecord) => { activeTrackedInScopeCount?: number } | null | undefined;
  getOrderRemainingQueueQty: (order: GenericRecord) => number;
  getOrderIdFromTrackedRecord: (record: GenericRecord) => string;
  isInAllowedScope: (record: GenericRecord) => boolean;
  isInactiveTrackedProduct: (record: GenericRecord) => boolean;
  isRejectedProduct: (record: GenericRecord) => boolean;
  isPriorityOrder: (order: GenericRecord) => boolean;
  getPriorityLevel: (order: GenericRecord) => string;
  getDeliveredQtyForOrder: (order: GenericRecord) => number;
  getInspectionApprovedQtyForOrder: (order: GenericRecord) => number;
  getDeliveryInspectionDeltaForOrder: (order: GenericRecord) => number;
};

export const useTeamleaderModalData = ({
  activeKpi,
  dataStore,
  rawProducts,
  archivedHistoryProducts,
  archivedRejectedProducts,
  bezetting,
  kpiWeekOffset,
  getOrderProgressMeta,
  getOrderRemainingQueueQty,
  getOrderIdFromTrackedRecord,
  isInAllowedScope,
  isInactiveTrackedProduct,
  isRejectedProduct,
  isPriorityOrder,
  getPriorityLevel,
  getDeliveredQtyForOrder,
  getInspectionApprovedQtyForOrder,
  getDeliveryInspectionDeltaForOrder,
}: UseTeamleaderModalDataArgs): GenericRecord[] => {
  return useMemo(() => {
    if (!activeKpi) return [];

    const validOrderIds = new Set(dataStore.map((o) => String(o.orderId || "")));
    let data: GenericRecord[] = [];

    if (activeKpi === "gepland") {
      data = dataStore.filter((o) => {
        const progressMeta = getOrderProgressMeta(o);
        const hasActiveFlow = Number(progressMeta?.activeTrackedInScopeCount || 0) > 0;
        return getOrderRemainingQueueQty(o) > 0 || hasActiveFlow;
      });
    } else if (activeKpi === "in_proces") {
      data = rawProducts.filter((p) => {
        const linkedToVisibleOrder = validOrderIds.has(String(getOrderIdFromTrackedRecord(p) || ""));
        const inAllowedScope = isInAllowedScope(p);
        if (!linkedToVisibleOrder && !inAllowedScope) return false;
        return !isInactiveTrackedProduct(p);
      });
    } else if (activeKpi === "gereed") {
      const activeList = rawProducts.filter((p) => {
        if (!validOrderIds.has(String(getOrderIdFromTrackedRecord(p) || ""))) return false;
        const status = String(p.status || "");
        const step = String(p.currentStep || "");
        return ["Finished", "completed", "GEREED"].includes(status) || step === "Finished";
      });
      const archivedList = archivedHistoryProducts.filter((p) => validOrderIds.has(String(getOrderIdFromTrackedRecord(p) || "")));
      data = [...activeList, ...archivedList];
    } else if (activeKpi === "afkeur") {
      const activeRejected = rawProducts.filter((p) => isRejectedProduct(p));
      const archivedRejected = archivedRejectedProducts.filter((p) => {
        const status = String(p?.status || "").toLowerCase();
        const step = String(p?.currentStep || "").toLowerCase();
        return ["rejected", "afkeur"].includes(status) || step === "rejected";
      });
      data = [...activeRejected, ...archivedRejected];
    } else if (["tijdelijke_afkeur", "temp_rejected", "tijdelijke afkeur", "tijdelijk_afkeur"].includes(activeKpi)) {
      data = rawProducts
        .filter((p) => {
          if (!validOrderIds.has(String(getOrderIdFromTrackedRecord(p) || ""))) return false;
          const inspection = (p.inspection || {}) as Record<string, unknown>;
          return inspection.status === "Tijdelijke afkeur";
        })
        .sort((a, b) => {
          const inspectionA = (a.inspection || {}) as Record<string, unknown>;
          const inspectionB = (b.inspection || {}) as Record<string, unknown>;
          return new Date(String(inspectionA.timestamp || 0)).getTime() - new Date(String(inspectionB.timestamp || 0)).getTime();
        });
    } else if (activeKpi === "bezetting") {
      const currentDayStr = format(new Date(), "yyyy-MM-dd");
      data = bezetting
        .filter((b) => b.date === currentDayStr)
        .map((b) => ({
          ...b,
          lotNumber: b.operatorName,
          orderId: b.machineName || b.machineId,
          item: `${b.hours || 8} uur`,
          status: b.shift || "N/A",
        }));
    } else if (activeKpi === "prioriteit") {
      data = dataStore
        .filter((o) => isPriorityOrder(o))
        .sort((a, b) => {
          const rankA = getPriorityLevel(a) === "immediate" ? 3 : getPriorityLevel(a) === "urgent" ? 2 : 1;
          const rankB = getPriorityLevel(b) === "immediate" ? 3 : getPriorityLevel(b) === "urgent" ? 2 : 1;
          if (rankA !== rankB) return rankB - rankA;

          const dateA = a.dateObj ? new Date(a.dateObj).getTime() : Number.MAX_SAFE_INTEGER;
          const dateB = b.dateObj ? new Date(b.dateObj).getTime() : Number.MAX_SAFE_INTEGER;
          if (dateA !== dateB) return dateA - dateB;

          return String(a.orderId || "").localeCompare(String(b.orderId || ""));
        });
    } else if (activeKpi === "geleverd_mismatch") {
      data = dataStore
        .map((order) => {
          const deliveredQty = getDeliveredQtyForOrder(order);
          if (!Number.isFinite(deliveredQty)) return null;

          const inspectionApprovedQty = getInspectionApprovedQtyForOrder(order);
          const delta = getDeliveryInspectionDeltaForOrder(order);
          if (!Number.isFinite(delta) || delta === 0) return null;

          return {
            ...order,
            deliveredQty,
            inspectionApprovedQty,
            deliveryInspectionDelta: delta,
            status: `LN geleverd ${deliveredQty} / FF ${inspectionApprovedQty}`,
            updatedAt: order?.deliveryInspectionLastCheckedAt || order?.lastSync || order?.updatedAt || order?.lastUpdated || order?.createdAt || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(Number(b.deliveryInspectionDelta || 0)) - Math.abs(Number(a.deliveryInspectionDelta || 0)));
    } else if (activeKpi === "geleverd_mismatch_plus") {
      data = dataStore
        .map((order) => {
          const deliveredQty = getDeliveredQtyForOrder(order);
          if (!Number.isFinite(deliveredQty)) return null;

          const inspectionApprovedQty = getInspectionApprovedQtyForOrder(order);
          const delta = getDeliveryInspectionDeltaForOrder(order);
          if (!Number.isFinite(delta) || delta <= 0) return null;

          return {
            ...order,
            deliveredQty,
            inspectionApprovedQty,
            deliveryInspectionDelta: delta,
            status: `LN geleverd ${deliveredQty} / FF ${inspectionApprovedQty}`,
            updatedAt: order?.deliveryInspectionLastCheckedAt || order?.lastSync || order?.updatedAt || order?.lastUpdated || order?.createdAt || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(b.deliveryInspectionDelta || 0) - Number(a.deliveryInspectionDelta || 0));
    } else if (activeKpi === "geleverd_mismatch_min") {
      data = dataStore
        .map((order) => {
          const deliveredQty = getDeliveredQtyForOrder(order);
          if (!Number.isFinite(deliveredQty)) return null;

          const inspectionApprovedQty = getInspectionApprovedQtyForOrder(order);
          const delta = getDeliveryInspectionDeltaForOrder(order);
          if (!Number.isFinite(delta) || delta >= 0) return null;

          return {
            ...order,
            deliveredQty,
            inspectionApprovedQty,
            deliveryInspectionDelta: delta,
            status: `LN geleverd ${deliveredQty} / FF ${inspectionApprovedQty}`,
            updatedAt: order?.deliveryInspectionLastCheckedAt || order?.lastSync || order?.updatedAt || order?.lastUpdated || order?.createdAt || null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.deliveryInspectionDelta || 0) - Number(b.deliveryInspectionDelta || 0));
    }

    const isWeekNavigatedKpi = activeKpi === "gereed" || activeKpi === "afkeur";
    const selectedWeekDate = addWeeks(new Date(), kpiWeekOffset);
    const selectedWeekStart = startOfISOWeek(selectedWeekDate);
    const selectedWeekEnd = endOfISOWeek(selectedWeekDate);

    const getItemDateForKpi = (item: GenericRecord): Date | null => {
      const candidates =
        activeKpi === "gereed"
          ? [
              item?.timestamps?.finished,
              item?.timestamps?.completed,
              item?.updatedAt,
              item?.lastUpdated,
              item?.createdAt,
            ]
          : [
              item?.inspection?.timestamp,
              item?.timestamps?.rejected,
              item?.archivedAt,
              item?.updatedAt,
              item?.lastUpdated,
              item?.createdAt,
            ];

      for (const value of candidates) {
        if (!value) continue;
        if (typeof (value as { toDate?: () => Date })?.toDate === "function") {
          const date = (value as { toDate: () => Date }).toDate();
          if (Number.isFinite(date.getTime())) return date;
        }
        const date = new Date(value as string | number | Date);
        if (Number.isFinite(date.getTime())) return date;
      }
      return null;
    };

    let normalizedData = data.map((item) => ({
      ...item,
      machine: item.machine ? item.machine.replace("_INBOX", "") : item.machine,
      currentStation: item.currentStation ? item.currentStation.replace("_INBOX", "") : item.currentStation,
    }));

    if (isWeekNavigatedKpi) {
      normalizedData = normalizedData.filter((item) => {
        const eventDate = getItemDateForKpi(item);
        if (!eventDate) return false;
        return eventDate >= selectedWeekStart && eventDate <= selectedWeekEnd;
      });
    }

    return normalizedData;
  }, [
    activeKpi,
    dataStore,
    rawProducts,
    archivedHistoryProducts,
    archivedRejectedProducts,
    bezetting,
    kpiWeekOffset,
    getOrderProgressMeta,
    getOrderRemainingQueueQty,
    getOrderIdFromTrackedRecord,
    isInAllowedScope,
    isInactiveTrackedProduct,
    isRejectedProduct,
    isPriorityOrder,
    getPriorityLevel,
    getDeliveredQtyForOrder,
    getInspectionApprovedQtyForOrder,
    getDeliveryInspectionDeltaForOrder,
  ]);
};
