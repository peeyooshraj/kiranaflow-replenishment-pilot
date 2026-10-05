import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateInventoryPolicy,
  calculateSafetyStock,
  standardDeviation,
} from "../src/inventory-policy.mjs";

test("sample standard deviation is deterministic", () => {
  assert.equal(standardDeviation([2, 2, 2]), 0);
  assert.equal(standardDeviation([5]), null);
});

test("zero variability produces zero safety stock under the stated approximation", () => {
  assert.equal(
    calculateSafetyStock({
      dailyDemandMean: 5,
      demandStdDev: 0,
      leadTimeMeanDays: 3,
      leadTimeStdDevDays: 0,
      serviceFactor: 1.65,
    }),
    0,
  );
});

test("inventory policy preserves the proposed-order versus executed-order boundary", () => {
  const policy = calculateInventoryPolicy({
    usableStock: 10,
    reserved: 0,
    incomingConfirmed: 0,
    dailyForecast: 5,
    demandStdDev: 0,
    leadTimeMeanDays: 2,
    reviewPeriodDays: 4,
    serviceFactor: 1.65,
    packSize: 6,
  });
  assert.equal(policy.targetStock, 30);
  assert.equal(policy.rawRequirement, 20);
  assert.equal(policy.proposedRequirement, 24);
  assert.equal(policy.daysCover, 2);
  assert.equal(policy.belowReorderPoint, true);
  assert.equal("executedOrder" in policy, false);
});

test("confirmed incoming inventory reduces proposed requirement without changing on-hand cover", () => {
  const base = {
    usableStock: 10,
    reserved: 0,
    dailyForecast: 5,
    demandStdDev: 0,
    leadTimeMeanDays: 2,
    reviewPeriodDays: 4,
    serviceFactor: 0,
    packSize: 1,
  };
  const withoutIncoming = calculateInventoryPolicy({ ...base, incomingConfirmed: 0 });
  const withIncoming = calculateInventoryPolicy({ ...base, incomingConfirmed: 10 });
  assert.equal(withoutIncoming.rawRequirement - withIncoming.rawRequirement, 10);
  assert.equal(withoutIncoming.daysCover, withIncoming.daysCover);
});

test("zero forecast returns no invented infinite cover", () => {
  const policy = calculateInventoryPolicy({
    usableStock: 10,
    dailyForecast: 0,
    demandStdDev: 0,
    leadTimeMeanDays: 2,
    reviewPeriodDays: 4,
    serviceFactor: 1,
    packSize: 1,
  });
  assert.equal(policy.daysCover, null);
  assert.equal(policy.proposedRequirement, 0);
});

test("pack size is a real constraint and cannot be fractional or zero", () => {
  const common = {
    usableStock: 10,
    dailyForecast: 5,
    demandStdDev: 1,
    leadTimeMeanDays: 2,
    reviewPeriodDays: 4,
    serviceFactor: 1,
  };
  assert.throws(() => calculateInventoryPolicy({ ...common, packSize: 0 }));
  assert.throws(() => calculateInventoryPolicy({ ...common, packSize: 2.5 }));
});

test("more usable inventory cannot increase raw replenishment need under identical conditions", () => {
  const common = {
    dailyForecast: 5,
    demandStdDev: 1,
    leadTimeMeanDays: 2,
    reviewPeriodDays: 4,
    serviceFactor: 1,
    packSize: 1,
  };
  const low = calculateInventoryPolicy({ ...common, usableStock: 5 });
  const high = calculateInventoryPolicy({ ...common, usableStock: 15 });
  assert.ok(high.rawRequirement <= low.rawRequirement);
});
