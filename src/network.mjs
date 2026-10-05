import { fail } from "./errors.mjs";

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    fail("INVALID_NETWORK_QUANTITY", `${field} must be a non-negative integer base-unit quantity`, {
      field,
      value,
    });
  }
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    fail("INVALID_NETWORK_QUANTITY", `${field} must be a positive integer`, { field, value });
  }
  return value;
}

export function aggregateRequirements(requests) {
  if (!Array.isArray(requests)) fail("INVALID_REQUESTS", "requests must be an array");
  const seen = new Set();
  let totalRequirement = 0;
  for (const request of requests) {
    if (!request || typeof request !== "object") fail("INVALID_REQUEST", "request must be an object");
    if (typeof request.shopId !== "string" || request.shopId.trim() === "") {
      fail("INVALID_SHOP_ID", "shopId must be a non-empty string");
    }
    if (seen.has(request.shopId)) {
      fail("DUPLICATE_SHOP_REQUIREMENT", "a shop may contribute only one net requirement per SKU", {
        shopId: request.shopId,
      });
    }
    seen.add(request.shopId);
    totalRequirement += nonNegativeInteger(request.requirement, "requirement");
  }
  return Object.freeze({ shopCount: seen.size, totalRequirement });
}

function validateAllocationRequest(request) {
  if (!request || typeof request !== "object") fail("INVALID_REQUEST", "request must be an object");
  if (typeof request.shopId !== "string" || request.shopId.trim() === "") {
    fail("INVALID_SHOP_ID", "shopId must be a non-empty string");
  }
  const requirement = nonNegativeInteger(request.requirement, "requirement");
  const packSize = positiveInteger(request.packSize, "packSize");
  if (typeof request.priorityWeight !== "number" || !Number.isFinite(request.priorityWeight) || request.priorityWeight <= 0) {
    fail("INVALID_PRIORITY_WEIGHT", "priorityWeight must be a finite positive policy weight");
  }
  return Object.freeze({
    shopId: request.shopId.trim(),
    requirement,
    packSize,
    priorityWeight: request.priorityWeight,
  });
}

function better(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  if (b.score > a.score) return b;
  if (b.score < a.score) return a;
  if (b.used > a.used) return b;
  return a;
}

export function allocateScarceStock({ availableStock, requests, maxCapacity = 10_000 }) {
  const capacity = nonNegativeInteger(availableStock, "availableStock");
  positiveInteger(maxCapacity, "maxCapacity");
  if (capacity > maxCapacity) {
    fail("OPTIMIZER_CAPACITY_EXCEEDED", "availableStock exceeds the configured exact-optimizer capacity", {
      availableStock: capacity,
      maxCapacity,
    });
  }
  if (!Array.isArray(requests)) fail("INVALID_REQUESTS", "requests must be an array");

  const normalized = requests.map(validateAllocationRequest).sort((a, b) => a.shopId.localeCompare(b.shopId));
  if (new Set(normalized.map((x) => x.shopId)).size !== normalized.length) {
    fail("DUPLICATE_SHOP_REQUIREMENT", "duplicate shop allocation request for the same SKU");
  }

  const totalRequirement = normalized.reduce((sum, request) => sum + request.requirement, 0);
  if (normalized.length === 0) {
    return Object.freeze({ status: "NO_REQUIREMENTS", allocations: [], usedStock: 0, remainingStock: capacity, objective: 0 });
  }

  let states = Array(capacity + 1).fill(null);
  states[0] = { score: 0, used: 0, allocations: [] };

  for (const request of normalized) {
    const next = Array(capacity + 1).fill(null);
    const maxAllocation = Math.floor(request.requirement / request.packSize) * request.packSize;
    for (let used = 0; used <= capacity; used += 1) {
      const prior = states[used];
      if (!prior) continue;
      for (let allocation = 0; allocation <= maxAllocation && used + allocation <= capacity; allocation += request.packSize) {
        const candidate = {
          score: prior.score + allocation * request.priorityWeight,
          used: used + allocation,
          allocations: [...prior.allocations, { shopId: request.shopId, allocation }],
        };
        next[candidate.used] = better(next[candidate.used], candidate);
      }
    }
    states = next;
  }

  let best = null;
  for (const state of states) best = better(best, state);
  if (!best) fail("OPTIMIZATION_INFEASIBLE", "no feasible allocation state was produced");

  const requestByShop = new Map(normalized.map((request) => [request.shopId, request]));
  const allocations = best.allocations.map(({ shopId, allocation }) => {
    const request = requestByShop.get(shopId);
    return Object.freeze({
      shopId,
      requirement: request.requirement,
      allocation,
      unmet: request.requirement - allocation,
      packSize: request.packSize,
      priorityWeight: request.priorityWeight,
    });
  });

  return Object.freeze({
    status: capacity >= totalRequirement ? "SUPPLY_SUFFICIENT" : "SCARCE_SUPPLY_ALLOCATED",
    allocations: Object.freeze(allocations),
    usedStock: best.used,
    remainingStock: capacity - best.used,
    objective: best.score,
    totalRequirement,
  });
}
