type NumericLike = number | string | null | undefined;

interface ShouldHidePlanningOrderArgs {
  remainingAtOrder: NumericLike;
  startedAtStation: NumericLike;
  stationPlan: NumericLike;
  hasStationActivity?: boolean;
}

export const shouldHidePlanningOrder = ({
  remainingAtOrder,
  startedAtStation,
  stationPlan,
  hasStationActivity = false,
}: ShouldHidePlanningOrderArgs): boolean => {
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
