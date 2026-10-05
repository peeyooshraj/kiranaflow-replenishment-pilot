import test from "node:test";
import assert from "node:assert/strict";

import { detectStoreExceptions, scoreException } from "../src/exceptions.mjs";
import { explainExceptions } from "../src/explanations.mjs";

const POLICY = {
  excessCoverDays: 30,
  demandShiftFraction: 0.25,
  leadTimeDeteriorationFraction: 0.25,
};

test("multiple contributing factors are preserved instead of collapsed into one invented root cause", () => {
  const result = detectStoreExceptions({
    policy: POLICY,
    state: {
      dataStatus: "KNOWN",
      daysCover: 2,
      leadTimeMeanDays: 5,
      belowReorderPoint: true,
      lostDemand: 3,
      baselineDemand: 10,
      recentDemand: 15,
      baselineLeadTimeDays: 4,
      recentLeadTimeDays: 6,
      distributorAvailability: 0,
      forecastStatus: "FORECAST_READY",
      forecastConfidence: "UNRATED",
    },
  });
  const codes = result.factors.map((factor) => factor.code);
  for (const expected of [
    "STOCKOUT_RISK",
    "BELOW_REORDER_POINT",
    "LOST_DEMAND_OBSERVED",
    "DEMAND_SURGE",
    "LEAD_TIME_DETERIORATION",
    "DISTRIBUTOR_UNAVAILABLE",
  ]) assert.ok(codes.includes(expected));
});

test("invalid, stale, conflicted, or insufficient analytical states suppress recommendation", () => {
  for (const dataStatus of ["INVALID", "STALE", "CONFLICTED"]) {
    const result = detectStoreExceptions({ policy: POLICY, state: { dataStatus, distributorAvailability: 10 } });
    assert.equal(result.recommendationAllowed, false);
    assert.equal(result.requiresManualReview, true);
  }
  const insufficient = detectStoreExceptions({
    policy: POLICY,
    state: { dataStatus: "KNOWN", distributorAvailability: 10, forecastStatus: "INSUFFICIENT_HISTORY" },
  });
  assert.equal(insufficient.recommendationAllowed, false);
});

test("unknown distributor availability is not converted to zero", () => {
  const result = detectStoreExceptions({ policy: POLICY, state: { dataStatus: "KNOWN" } });
  const codes = result.factors.map((factor) => factor.code);
  assert.ok(codes.includes("DISTRIBUTOR_AVAILABILITY_UNKNOWN"));
  assert.equal(codes.includes("DISTRIBUTOR_UNAVAILABLE"), false);
});

test("zero demand baseline does not divide by zero and is labeled demand emergence", () => {
  const result = detectStoreExceptions({
    policy: POLICY,
    state: { dataStatus: "KNOWN", baselineDemand: 0, recentDemand: 4, distributorAvailability: 10 },
  });
  assert.ok(result.factors.some((factor) => factor.code === "DEMAND_EMERGENCE"));
});

test("priority score is transparent and decomposable into configured policy weights", () => {
  const exceptionResult = detectStoreExceptions({
    policy: POLICY,
    state: {
      dataStatus: "KNOWN",
      daysCover: 1,
      leadTimeMeanDays: 3,
      lostDemand: 2,
      distributorAvailability: 10,
    },
  });
  const score = scoreException(exceptionResult, { STOCKOUT_RISK: 5, LOST_DEMAND_OBSERVED: 3 });
  assert.equal(score.score, 8);
  assert.deepEqual(score.contributions, [
    { code: "LOST_DEMAND_OBSERVED", weight: 3 },
    { code: "STOCKOUT_RISK", weight: 5 },
  ]);
});

test("explanation exposes evidence limitations and preserves the human action boundary", () => {
  const result = detectStoreExceptions({
    policy: POLICY,
    state: {
      dataStatus: "KNOWN",
      distributorAvailability: null,
      forecastStatus: "INSUFFICIENT_HISTORY",
    },
  });
  const explanation = explainExceptions(result);
  assert.ok(explanation.why.length >= 2);
  assert.ok(explanation.limitations.length >= 2);
  assert.match(explanation.actionBoundary, /suppressed/i);
});
