// @ts-nocheck
import { useMemo } from "react";
import { getISOWeek, startOfISOWeek } from "date-fns";
import { normalizeMachine, getStartedCounterField } from "../../utils/hubHelpers";
export const useTeamleaderMetrics = ({ loading, dataStore, rawProducts, bezetting, archivedHistoryProducts, archivedRejectedProducts, effectiveAllowedNorms, effectiveStations, safeScope, todayStr, currentWeek, currentYear, getOrderIdFromTrackedRecord, getOrderProgressMeta, getOrderRemainingQueueQty, getDeliveredQtyForOrder, getInspectionApprovedQtyForOrder, isEventInCurrentWeek, isInAllowedScope, isInactiveTrackedProduct, isRejectedProduct, isPriorityOrder, }) => {
    return useMemo(() => {
        if (loading)
            return {
                totalPlanned: 0,
                activeCount: 0,
                finishedCount: 0,
                rejectedCount: 0,
                priorityCount: 0,
                deliveryInspectionMismatchCount: 0,
                deliveryInspectionOverCount: 0,
                deliveryInspectionUnderCount: 0,
                deliveryInspectionMismatches: [],
                deliveryInspectionOverMismatches: [],
                deliveryInspectionUnderMismatches: [],
                bezettingAantal: 0,
                machineGridData: [],
            };
        const validOrderIds = new Set(dataStore.map((o) => o.orderId));
        const startOfWeekDate = startOfISOWeek(new Date());
        const stations = effectiveStations.filter((s) => {
            const name = (s.name || "").toLowerCase();
            if (safeScope === "fittings") {
                if (name.startsWith("ba"))
                    return false;
                if (s.department && s.department.toLowerCase() !== "fittings")
                    return false;
            }
            if (safeScope === "pipes" || safeScope === "pipe") {
                if (s.department && s.department.toLowerCase() !== "pipes")
                    return false;
            }
            if (safeScope !== "all" && s.department && s.department.toLowerCase() !== safeScope)
                return false;
            return name !== "teamleader" && name !== "algemeen";
        });
        const machineGridData = stations.map((station) => {
            const stationName = station.name;
            const stationId = station.id;
            const stationNorm = normalizeMachine(stationName || "");
            const mProducts = rawProducts.filter((p) => normalizeMachine(p.machine || "") === stationNorm);
            const mArchived = archivedHistoryProducts.filter((p) => normalizeMachine(p.machine || p.originMachine || "") === stationNorm);
            const currentOccupancy = bezetting.filter((b) => {
                if (b.date !== todayStr)
                    return false;
                const bId = (b.machineId || "").toLowerCase();
                const bName = (b.machineName || "").toLowerCase();
                const sId = (stationId || "").toLowerCase();
                const sName = (stationName || "").toLowerCase();
                return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
            });
            let workedHoursThisWeek = 0;
            bezetting.forEach((b) => {
                if (!b.date)
                    return;
                const bId = (b.machineId || "").toLowerCase();
                const bName = (b.machineName || "").toLowerCase();
                const sId = (stationId || "").toLowerCase();
                const sName = (stationName || "").toLowerCase();
                if ((sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName)) {
                    const bDate = new Date(b.date);
                    if (getISOWeek(bDate) === currentWeek) {
                        workedHoursThisWeek += parseFloat(b.hours ?? b.hoursWorked) || 0;
                    }
                }
            });
            const nameUpper = stationName.toUpperCase();
            const isBM01 = nameUpper.includes("BM01");
            const isNabewerking = nameUpper.includes("NABEWERK");
            const isMazak = nameUpper.includes("MAZAK");
            const isLossen = nameUpper.includes("LOSSEN");
            const isAlgemeen = nameUpper.includes("ALGEMEEN");
            const isDownstream = isBM01 || isNabewerking || isMazak || isLossen;
            let planned = 0;
            let active = 0;
            let finished = 0;
            let plannedHours = 0;
            if (isDownstream) {
                planned = 0;
                let stationPlanHours = 0;
                dataStore.forEach((o) => {
                    const orderPlan = Number(o.plan || o.quantity || 0);
                    const orderPlanForRatio = orderPlan || 1;
                    const produced = Number(o.produced || 0);
                    const remaining = Math.max(0, orderPlan - produced);
                    const ratio = Math.min(1, remaining / orderPlanForRatio);
                    if (isBM01 && Number(o.plannedHoursBM01) > 0) {
                        stationPlanHours += Number(o.plannedHoursBM01) * ratio;
                    }
                    else if (isNabewerking && Number(o.plannedHoursNabewerken) > 0) {
                        stationPlanHours += Number(o.plannedHoursNabewerken) * ratio;
                    }
                    else if (isMazak && normalizeMachine(o.machine || "") === "MAZAK") {
                        stationPlanHours += (Number(o.totalPlannedHours) || 0) * ratio;
                    }
                });
                plannedHours = stationPlanHours;
                const checkActive = (p) => {
                    const pStation = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
                    const pStep = (p.currentStep || "").toUpperCase().replace(/\s/g, "");
                    const isActiveItem = !isInactiveTrackedProduct(p);
                    if (!isActiveItem)
                        return false;
                    if (isBM01)
                        return pStation.includes("BM01") || pStep.includes("INSPECTIE") || pStep === "BM01";
                    if (isNabewerking) {
                        return (pStation === "NABEWERKING" ||
                            pStation === "NABEWERKEN" ||
                            pStation === "NABW" ||
                            pStation.includes("NABEWERK") ||
                            pStep === "NABEWERKING" ||
                            pStep === "NABEWERKEN" ||
                            pStep === "NABW" ||
                            pStep.includes("NABEWERK"));
                    }
                    if (isMazak)
                        return pStation.includes("MAZAK") || pStep.includes("MAZAK");
                    if (isLossen)
                        return pStation.includes("LOSSEN") || pStep.includes("LOSSEN");
                    return false;
                };
                active = rawProducts.filter(checkActive).length;
                const checkFinished = (p) => {
                    const pStatus = (p.status || "").toUpperCase();
                    const pStep = (p.currentStep || "").toUpperCase();
                    const isFinishedItem = ["COMPLETED", "FINISHED", "GEREED"].includes(pStatus) || pStep === "FINISHED";
                    const pLastStation = (p.lastStation || "").toUpperCase().replace(/\s/g, "");
                    const pCurrentStation = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
                    let isFinishedForThisStation = false;
                    if (isBM01) {
                        isFinishedForThisStation = isFinishedItem && (pLastStation.includes("BM01") || pCurrentStation.includes("BM01"));
                    }
                    else if (isNabewerking) {
                        isFinishedForThisStation = pLastStation.includes("NABEWERK") || pLastStation === "NABW" || (pCurrentStation.includes("NABEWERK") && isFinishedItem);
                    }
                    else if (isMazak) {
                        isFinishedForThisStation = pLastStation.includes("MAZAK") || (pCurrentStation.includes("MAZAK") && isFinishedItem);
                    }
                    else if (isLossen) {
                        isFinishedForThisStation = pLastStation.includes("LOSSEN") || (pCurrentStation.includes("LOSSEN") && isFinishedItem);
                    }
                    if (!isFinishedForThisStation)
                        return false;
                    const eventDate = p.timestamps?.finished || p.timestamps?.lossen_end || p.timestamps?.nabewerking_end || p.updatedAt || p.createdAt;
                    const d = typeof eventDate?.toDate === "function" ? eventDate.toDate() : new Date(eventDate || 0);
                    if (Number.isFinite(d?.getTime?.()) && d >= startOfWeekDate) {
                        return true;
                    }
                    return false;
                };
                finished = rawProducts.filter(checkFinished).length + archivedHistoryProducts.filter(checkFinished).length;
            }
            else if (!isAlgemeen) {
                let stationPlan = 0;
                let stationPlanHours = 0;
                const activeAtStationMap = new Map();
                rawProducts.forEach((p) => {
                    if (p.status === "rejected" || p.currentStep === "REJECTED")
                        return;
                    const stepUpper = (p.currentStep || "").toUpperCase();
                    if (stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA") {
                        const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
                        const orderId = getOrderIdFromTrackedRecord(p);
                        if (orderId && pMachineNorm) {
                            const key = `${orderId}_${pMachineNorm}`;
                            activeAtStationMap.set(key, (activeAtStationMap.get(key) || 0) + 1);
                        }
                    }
                });
                dataStore
                    .filter((o) => normalizeMachine(o.machine || "") === stationNorm)
                    .forEach((o) => {
                    // Altijd dynamisch berekenen: plan - started_<machine>.
                    const orderPlan = Number(o.plan || o.quantity || 0);
                    const startedField = getStartedCounterField(stationNorm);
                    const startedAtStation = Number(startedField ? o?.[startedField] || 0 : 0);
                    const remainingQueue = Math.max(0, orderPlan - startedAtStation);
                    const orderIdForActivity = String(o.orderId || "").trim();
                    const activeAtStationForOrder = activeAtStationMap.get(`${orderIdForActivity}_${stationNorm}`) || 0;
                    const totalRemaining = remainingQueue + activeAtStationForOrder;
                    stationPlan += totalRemaining;
                    const orderPlanForRatio = orderPlan || 1;
                    const ratio = Math.min(1, totalRemaining / orderPlanForRatio);
                    let hrs = 0;
                    if (stationNorm.startsWith("BH") && Number(o.plannedHoursBH) > 0) {
                        hrs = Number(o.plannedHoursBH);
                    }
                    else {
                        hrs = Number(o.totalPlannedHours) || 0;
                    }
                    stationPlanHours += hrs * ratio;
                });
                planned = stationPlan;
                plannedHours = stationPlanHours;
                active = rawProducts.filter((p) => {
                    const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
                    if (pMachineNorm !== stationNorm)
                        return false;
                    if (p.status === "rejected" || p.currentStep === "REJECTED")
                        return false;
                    const stepUpper = (p.currentStep || "").toUpperCase();
                    return stepUpper === "WIKKELEN" || stepUpper === "HOLD_AREA";
                }).length;
                finished = rawProducts.filter((p) => {
                    const pMachineNorm = normalizeMachine(p.originMachine || p.machine || "");
                    if (pMachineNorm !== stationNorm)
                        return false;
                    if (p.status === "rejected" || p.currentStep === "REJECTED")
                        return false;
                    const stepUpper = (p.currentStep || "").toUpperCase();
                    const stationUpper = (p.currentStation || "").toUpperCase().replace(/\s/g, "");
                    const hasLeftWinding = stepUpper !== "WIKKELEN" && stepUpper !== "HOLD_AREA";
                    const hasReachedNabewerkenOrBeyond = stationUpper.includes("NABEWERK") ||
                        stepUpper.includes("NABEWERK") ||
                        stationUpper.includes("BM01") ||
                        stepUpper.includes("INSPECTIE") ||
                        stepUpper === "BM01" ||
                        stationUpper === "MAZAK" ||
                        stepUpper.includes("MAZAK") ||
                        p.status === "completed" ||
                        p.currentStep === "Finished" ||
                        stationUpper === "GEREED";
                    if (hasLeftWinding && !hasReachedNabewerkenOrBeyond) {
                        const eventDate = p.timestamps?.lossen_start || p.timestamps?.wikkelen_end || p.updatedAt || p.createdAt;
                        const d = typeof eventDate?.toDate === "function" ? eventDate.toDate() : new Date(eventDate || 0);
                        if (Number.isFinite(d?.getTime?.()) && d >= startOfWeekDate) {
                            return true;
                        }
                    }
                    return false;
                }).length;
            }
            return {
                id: stationName,
                planned,
                finished,
                active,
                plannedHours,
                workedHoursThisWeek,
                operatorCount: currentOccupancy.length,
                operatorNames: currentOccupancy.map((o) => o.operatorName).join(", "),
                isDownstream,
                isAlgemeen,
            };
        });
        const pendingPlanningOrders = dataStore.filter((o) => {
            const hasRemainingQueue = getOrderRemainingQueueQty(o) > 0;
            const progressMeta = getOrderProgressMeta(o);
            const hasActiveFlow = Number(progressMeta?.activeTrackedInScopeCount || 0) > 0;
            return hasRemainingQueue || hasActiveFlow;
        });
        const deliveryInspectionMismatches = dataStore
            .map((order) => {
            const deliveredQty = getDeliveredQtyForOrder(order);
            if (!Number.isFinite(deliveredQty))
                return null;
            const inspectionApprovedQty = getInspectionApprovedQtyForOrder(order);
            const delta = deliveredQty - inspectionApprovedQty;
            if (delta === 0)
                return null;
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
            .sort((a, b) => Math.abs(b.deliveryInspectionDelta) - Math.abs(a.deliveryInspectionDelta));
        const deliveryInspectionOverMismatches = deliveryInspectionMismatches
            .filter((order) => Number(order?.deliveryInspectionDelta) > 0)
            .sort((a, b) => b.deliveryInspectionDelta - a.deliveryInspectionDelta);
        const deliveryInspectionUnderMismatches = deliveryInspectionMismatches
            .filter((order) => Number(order?.deliveryInspectionDelta) < 0)
            .sort((a, b) => a.deliveryInspectionDelta - b.deliveryInspectionDelta);
        return {
            plannedOrdersCount: pendingPlanningOrders.length,
            totalPlanned: pendingPlanningOrders.reduce((acc, o) => {
                const progressMeta = getOrderProgressMeta(o);
                const activeFlowQty = Number(progressMeta?.activeTrackedInScopeCount || 0);
                return acc + getOrderRemainingQueueQty(o) + activeFlowQty;
            }, 0),
            activeCount: rawProducts.filter((p) => {
                const linkedToVisibleOrder = validOrderIds.has(getOrderIdFromTrackedRecord(p));
                const inAllowedScope = isInAllowedScope(p);
                if (!linkedToVisibleOrder && !inAllowedScope)
                    return false;
                if (isInactiveTrackedProduct(p))
                    return false;
                return true;
            }).length,
            finishedCount: (() => {
                const getFinishedEventDate = (p) => {
                    const candidates = [
                        p?.timestamps?.finished,
                        p?.timestamps?.completed,
                        p?.inspection?.timestamp,
                        p?.updatedAt,
                        p?.lastUpdated,
                        p?.createdAt,
                    ];
                    for (const value of candidates) {
                        if (!value)
                            continue;
                        const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
                        if (Number.isFinite(date?.getTime?.()))
                            return date;
                    }
                    return null;
                };
                const activeFinished = rawProducts.filter((p) => {
                    if (!validOrderIds.has(getOrderIdFromTrackedRecord(p)))
                        return false;
                    if (effectiveAllowedNorms.length > 0) {
                        const m1 = normalizeMachine(p.machine || "");
                        const m2 = normalizeMachine(p.originMachine || "");
                        const m3 = normalizeMachine(p.currentStation || "");
                        if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3))
                            return false;
                    }
                    const status = p.status || "";
                    const step = p.currentStep || "";
                    if (!["Finished", "completed", "GEREED"].includes(status) && step !== "Finished")
                        return false;
                    const finishedAt = getFinishedEventDate(p);
                    return isEventInCurrentWeek(finishedAt, { currentWeek, currentYear });
                });
                const archivedFinished = archivedHistoryProducts.filter((p) => {
                    if (!validOrderIds.has(getOrderIdFromTrackedRecord(p)))
                        return false;
                    const finishedAt = getFinishedEventDate(p);
                    return isEventInCurrentWeek(finishedAt, { currentWeek, currentYear });
                });
                return activeFinished.length + archivedFinished.length;
            })(),
            rejectedCount: rawProducts.filter((p) => {
                if (!isRejectedProduct(p))
                    return false;
                if (effectiveAllowedNorms.length > 0) {
                    const m1 = normalizeMachine(p.machine || "");
                    const m2 = normalizeMachine(p.originMachine || "");
                    const m3 = normalizeMachine(p.currentStation || "");
                    if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3))
                        return false;
                }
                const rejectedAt = p?.inspection?.timestamp || p?.timestamps?.rejected || p?.updatedAt || p?.lastUpdated || p?.createdAt || null;
                return isEventInCurrentWeek(rejectedAt, { currentWeek, currentYear });
            }).length +
                archivedRejectedProducts.filter((p) => {
                    const status = String(p?.status || "").toLowerCase();
                    const step = String(p?.currentStep || "").toLowerCase();
                    if (!["rejected", "afkeur"].includes(status) && step !== "rejected")
                        return false;
                    if (effectiveAllowedNorms.length > 0) {
                        const m1 = normalizeMachine(p.machine || "");
                        const m2 = normalizeMachine(p.originMachine || "");
                        const m3 = normalizeMachine(p.currentStation || "");
                        if (!effectiveAllowedNorms.includes(m1) && !effectiveAllowedNorms.includes(m2) && !effectiveAllowedNorms.includes(m3))
                            return false;
                    }
                    const rejectedAt = p?.inspection?.timestamp || p?.timestamps?.rejected || p?.archivedAt || p?.updatedAt || p?.lastUpdated || p?.createdAt || null;
                    return isEventInCurrentWeek(rejectedAt, { currentWeek, currentYear });
                }).length,
            priorityCount: dataStore.filter((o) => isPriorityOrder(o)).length,
            deliveryInspectionMismatchCount: deliveryInspectionMismatches.length,
            deliveryInspectionOverCount: deliveryInspectionOverMismatches.length,
            deliveryInspectionUnderCount: deliveryInspectionUnderMismatches.length,
            deliveryInspectionMismatches,
            deliveryInspectionOverMismatches,
            deliveryInspectionUnderMismatches,
            tempRejectedCount: rawProducts.filter((p) => {
                if (!validOrderIds.has(getOrderIdFromTrackedRecord(p)))
                    return false;
                return p.inspection?.status === "Tijdelijke afkeur";
            }).length,
            ...(() => {
                let totalHours = 0;
                let productionHours = 0;
                let supportHours = 0;
                let weeklyTotalHours = 0;
                let weeklyProductionHours = 0;
                let weeklySupportHours = 0;
                const relevantOccupancy = bezetting.filter((b) => {
                    if (!b.date)
                        return false;
                    return stations.some((s) => {
                        const sId = (s.id || "").toLowerCase();
                        const sName = (s.name || "").toLowerCase();
                        const bId = (b.machineId || "").toLowerCase();
                        const bName = (b.machineName || "").toLowerCase();
                        return (sId && sId === bId) || (sName && sName === bId) || (sName && sName === bName);
                    });
                });
                relevantOccupancy.forEach((b) => {
                    const val = b.hours ?? b.hoursWorked;
                    const hours = parseFloat(val);
                    const netHours = isNaN(hours) ? 8 : hours;
                    if (b.date === todayStr) {
                        totalHours += netHours;
                        const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                        const isBH = machineId.includes("BH");
                        const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                        if (isBH || isBA) {
                            productionHours += netHours;
                        }
                        else {
                            supportHours += netHours;
                        }
                    }
                    const bDate = new Date(b.date);
                    if (getISOWeek(bDate) === currentWeek) {
                        weeklyTotalHours += netHours;
                        const machineId = (b.machineId || "").toUpperCase().replace(/\s/g, "");
                        const isBH = machineId.includes("BH");
                        const isBA = machineId.includes("BA") && !machineId.includes("NABEWERKING") && !machineId.includes("NABW");
                        if (isBH || isBA) {
                            weeklyProductionHours += netHours;
                        }
                        else {
                            weeklySupportHours += netHours;
                        }
                    }
                });
                const efficiency = totalHours > 0 ? (productionHours / totalHours) * 100 : 0;
                const weeklyEfficiency = weeklyTotalHours > 0 ? (weeklyProductionHours / weeklyTotalHours) * 100 : 0;
                return {
                    bezettingAantal: totalHours,
                    productionHours,
                    supportHours,
                    efficiency,
                    weeklyTotalHours,
                    weeklyProductionHours,
                    weeklySupportHours,
                    weeklyEfficiency,
                };
            })(),
            planningOrders: dataStore,
            trackedProducts: rawProducts,
            machineGridData,
        };
    }, [
        loading,
        dataStore,
        rawProducts,
        bezetting,
        archivedHistoryProducts,
        archivedRejectedProducts,
        effectiveAllowedNorms,
        effectiveStations,
        safeScope,
        todayStr,
        currentWeek,
        currentYear,
        getOrderIdFromTrackedRecord,
        getOrderProgressMeta,
        getOrderRemainingQueueQty,
        getDeliveredQtyForOrder,
        getInspectionApprovedQtyForOrder,
        isEventInCurrentWeek,
        isInAllowedScope,
        isInactiveTrackedProduct,
        isRejectedProduct,
        isPriorityOrder,
    ]);
};
