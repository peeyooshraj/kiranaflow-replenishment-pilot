import { DomainValidationError } from "./errors.mjs";

function finiteNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new DomainValidationError("INVALID_QUANTITY", `${field} must be a finite non-negative number`, { field, value });
}

function evidence(source, observedAt, previous = null) {
  if (typeof source !== "string" || source.trim() === "") throw new DomainValidationError("INVALID_SOURCE", "inventory source is required");
  if (typeof observedAt !== "string" || Number.isNaN(Date.parse(observedAt))) throw new DomainValidationError("INVALID_TIMESTAMP", "observedAt must be an ISO timestamp");
  return Object.freeze({ status: "KNOWN", source: source.trim(), observedAt, previous });
}

export function recordStockReceipt(shop, { quantity, observedAt, reference = null }) {
  finiteNonNegative(quantity, "quantity");
  return Object.freeze({ ...shop, onHand: shop.onHand + quantity, inventoryEvidence: evidence(reference ? `DELIVERY:${reference}` : "DELIVERY", observedAt, shop.inventoryEvidence ?? null) });
}

export function reconcilePhysicalCount(shop, { countedQuantity, observedAt, reason = "PHYSICAL_COUNT" }) {
  finiteNonNegative(countedQuantity, "countedQuantity");
  return Object.freeze({ ...shop, onHand: countedQuantity, inventoryEvidence: evidence(`COUNT:${reason}`, observedAt, shop.inventoryEvidence ?? null) });
}

export function recordLostDemand(shop, { quantity = 1 }) {
  finiteNonNegative(quantity, "quantity");
  return Object.freeze({ ...shop, lostDemand: shop.lostDemand + quantity });
}

export function replaceShop(network, replacement) {
  if (!network.shops.some((shop) => shop.shopId === replacement.shopId)) throw new DomainValidationError("UNKNOWN_SHOP", "replacement shop does not exist in network");
  return Object.freeze({ ...network, shops: Object.freeze(network.shops.map((shop) => shop.shopId === replacement.shopId ? replacement : shop)) });
}
