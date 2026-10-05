import test from "node:test";
import assert from "node:assert/strict";

import { calculateInventoryPolicy } from "../src/inventory-policy.mjs";
import { allocateScarceStock } from "../src/network.mjs";

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("2,000 seeded inventory-policy cases preserve non-negativity and finite outputs", () => {
  const random = rng(20261005);
  for (let i = 0; i < 2000; i += 1) {
    const usableStock = Math.floor(random() * 500);
    const reserved = Math.floor(random() * (usableStock + 1));
    const result = calculateInventoryPolicy({
      usableStock,
      reserved,
      incomingConfirmed: Math.floor(random() * 200),
      dailyForecast: random() * 30,
      demandStdDev: random() * 10,
      leadTimeMeanDays: 1 + random() * 14,
      leadTimeStdDevDays: random() * 4,
      reviewPeriodDays: random() * 14,
      serviceFactor: random() * 3,
      packSize: 1 + Math.floor(random() * 12),
    });
    for (const value of Object.values(result)) {
      if (typeof value === "number") {
        assert.ok(Number.isFinite(value));
        assert.ok(value >= 0);
      }
    }
  }
});

test("500 seeded scarce-supply networks conserve stock and obey every shop bound", () => {
  const random = rng(44);
  for (let i = 0; i < 500; i += 1) {
    const shopCount = 2 + Math.floor(random() * 6);
    const requests = [];
    for (let s = 0; s < shopCount; s += 1) {
      const packSize = 1 + Math.floor(random() * 8);
      const packs = 1 + Math.floor(random() * 8);
      requests.push({
        shopId: `K${s}`,
        requirement: packSize * packs,
        packSize,
        priorityWeight: 1 + Math.floor(random() * 5),
      });
    }
    const total = requests.reduce((sum, row) => sum + row.requirement, 0);
    const availableStock = Math.floor(random() * (total + 1));
    const result = allocateScarceStock({ availableStock, requests });
    assert.ok(result.usedStock <= availableStock);
    assert.equal(result.remainingStock, availableStock - result.usedStock);
    for (const row of result.allocations) {
      assert.ok(row.allocation <= row.requirement);
      assert.equal(row.allocation % row.packSize, 0);
      assert.ok(row.unmet >= 0);
    }
  }
});
