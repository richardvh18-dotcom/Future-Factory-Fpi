import test from "node:test";
import assert from "node:assert/strict";
import { shouldHideBH18PlanningOrder } from "../../src/utils/terminalOrderFilters.js";

test("hides BH18 order when remaining is zero", () => {
  const hidden = shouldHideBH18PlanningOrder({
    remainingAtOrder: 0,
    startedAtStation: 0,
    stationPlan: 8,
  });

  assert.equal(hidden, true);
});

test("hides BH18 order when station started reached station plan", () => {
  const hidden = shouldHideBH18PlanningOrder({
    remainingAtOrder: 1,
    startedAtStation: 1,
    stationPlan: 1,
  });

  assert.equal(hidden, true);
});

test("keeps BH18 order when station still has work", () => {
  const hidden = shouldHideBH18PlanningOrder({
    remainingAtOrder: 2,
    startedAtStation: 6,
    stationPlan: 8,
  });

  assert.equal(hidden, false);
});

test("legacy mismatch: quantity can be larger, but station plan decides", () => {
  const hidden = shouldHideBH18PlanningOrder({
    remainingAtOrder: 1,
    startedAtStation: 1,
    stationPlan: 1,
  });

  assert.equal(hidden, true);
});

test("keeps BH18 order visible when station still has active lots", () => {
  const hidden = shouldHideBH18PlanningOrder({
    remainingAtOrder: 0,
    startedAtStation: 5,
    stationPlan: 5,
    hasStationActivity: true,
  });

  assert.equal(hidden, false);
});
