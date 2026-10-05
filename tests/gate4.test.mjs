import test from "node:test";
import assert from "node:assert/strict";

import { aggregateRequirements, allocateScarceStock } from "../src/network.mjs";

test("network aggregation rejects duplicate shop requirements to prevent double counting", () => {
  assert.throws(() =>
    aggregateRequirements([
      { shopId: "K1", requirement: 10 },
      { shopId: "K1", requirement: 10 },
    ]),
  );
});

test("network aggregation sums one net requirement per participating shop", () => {
  assert.deepEqual(
    aggregateRequirements([
      { shopId: "K1", requirement: 10 },
      { shopId: "K2", requirement: 20 },
      { shopId: "K3", requirement: 0 },
    ]),
    { shopCount: 3, totalRequirement: 30 },
  );
});

test("scarce allocation never creates stock and respects shop bounds and pack sizes", () => {
  const result = allocateScarceStock({
    availableStock: 60,
    requests: [
      { shopId: "K1", requirement: 20, packSize: 5, priorityWeight: 3 },
      { shopId: "K2", requirement: 40, packSize: 10, priorityWeight: 2 },
      { shopId: "K3", requirement: 30, packSize: 5, priorityWeight: 1 },
    ],
  });
  assert.equal(result.status, "SCARCE_SUPPLY_ALLOCATED");
  assert.ok(result.usedStock <= 60);
  assert.equal(result.remainingStock, 60 - result.usedStock);
  for (const row of result.allocations) {
    assert.ok(row.allocation >= 0);
    assert.ok(row.allocation <= row.requirement);
    assert.equal(row.allocation % row.packSize, 0);
  }
});

test("higher-priority unmet need is preferred when constraints are otherwise equivalent", () => {
  const result = allocateScarceStock({
    availableStock: 10,
    requests: [
      { shopId: "LOW", requirement: 10, packSize: 5, priorityWeight: 1 },
      { shopId: "HIGH", requirement: 10, packSize: 5, priorityWeight: 5 },
    ],
  });
  const byShop = Object.fromEntries(result.allocations.map((row) => [row.shopId, row.allocation]));
  assert.equal(byShop.HIGH, 10);
  assert.equal(byShop.LOW, 0);
});

test("sufficient stock satisfies every pack-feasible requirement", () => {
  const result = allocateScarceStock({
    availableStock: 30,
    requests: [
      { shopId: "K1", requirement: 10, packSize: 5, priorityWeight: 2 },
      { shopId: "K2", requirement: 20, packSize: 10, priorityWeight: 1 },
    ],
  });
  assert.equal(result.status, "SUPPLY_SUFFICIENT");
  assert.deepEqual(result.allocations.map((row) => row.unmet), [0, 0]);
});

test("more distributor stock cannot reduce the optimized fulfilled-priority objective", () => {
  const requests = [
    { shopId: "K1", requirement: 20, packSize: 5, priorityWeight: 4 },
    { shopId: "K2", requirement: 20, packSize: 5, priorityWeight: 2 },
  ];
  const low = allocateScarceStock({ availableStock: 10, requests });
  const high = allocateScarceStock({ availableStock: 20, requests });
  assert.ok(high.objective >= low.objective);
});

test("optimizer capacity is bounded rather than silently freezing on huge exact problems", () => {
  assert.throws(() =>
    allocateScarceStock({
      availableStock: 10_001,
      requests: [{ shopId: "K1", requirement: 10_001, packSize: 1, priorityWeight: 1 }],
    }),
  );
});

test("allocation is deterministic regardless of incoming request order", () => {
  const requests = [
    { shopId: "K2", requirement: 10, packSize: 5, priorityWeight: 1 },
    { shopId: "K1", requirement: 10, packSize: 5, priorityWeight: 1 },
  ];
  const forward = allocateScarceStock({ availableStock: 10, requests });
  const reverse = allocateScarceStock({ availableStock: 10, requests: [...requests].reverse() });
  assert.deepEqual(forward, reverse);
});
