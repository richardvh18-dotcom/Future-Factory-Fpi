export const shouldHidePlanningOrder = ({ remainingAtOrder, startedAtStation, stationPlan, hasStationActivity = false, }) => {
    if (hasStationActivity) {
        return false;
    }
    const safeRemaining = Number(remainingAtOrder);
    if (Number.isFinite(safeRemaining) && safeRemaining <= 0) {
        return true;
    }
    const safePlan = Number(stationPlan);
    const safeStarted = Number(startedAtStation);
    if (Number.isFinite(safePlan) && safePlan > 0 && Number.isFinite(safeStarted) && safeStarted >= safePlan) {
        return true;
    }
    return false;
};
