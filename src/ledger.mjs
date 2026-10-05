import { DomainValidationError } from "./errors.mjs";
import { recordStockReceipt, reconcilePhysicalCount, recordLostDemand, replaceShop } from "./intake.mjs";

export const LEDGER_EVENT = Object.freeze({
  STOCK_RECEIPT: "STOCK_RECEIPT",
  PHYSICAL_COUNT: "PHYSICAL_COUNT",
  LOST_DEMAND: "LOST_DEMAND",
  REGISTER_SALE: "REGISTER_SALE",
});

export const REGISTER_PHOTO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function canonicalLedgerEvent(input) {
  if (!input || typeof input !== "object") throw new DomainValidationError("INVALID_LEDGER_EVENT", "ledger event must be an object");
  const { eventId, shopId, skuId, eventType, quantity, occurredAt, source, evidencePhotoId = null } = input;
  for (const [field, value] of Object.entries({ eventId, shopId, skuId, eventType, occurredAt, source })) {
    if (typeof value !== "string" || value.trim() === "") throw new DomainValidationError("INVALID_LEDGER_EVENT", `${field} is required`);
  }
  if (!Object.values(LEDGER_EVENT).includes(eventType)) throw new DomainValidationError("INVALID_LEDGER_EVENT_TYPE", "unsupported ledger event type");
  if (!Number.isFinite(quantity) || quantity < 0) throw new DomainValidationError("INVALID_QUANTITY", "ledger quantity must be finite and non-negative");
  if (Number.isNaN(Date.parse(occurredAt))) throw new DomainValidationError("INVALID_TIMESTAMP", "ledger occurredAt must be an ISO timestamp");
  return Object.freeze({ eventId, shopId, skuId, eventType, quantity, occurredAt, source, evidencePhotoId });
}

export function replayLedger(baseNetwork, rawEvents) {
  const events = rawEvents.map(canonicalLedgerEvent).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const ids = new Set(); let network = baseNetwork;
  for (const event of events) {
    if (ids.has(event.eventId)) throw new DomainValidationError("DUPLICATE_LEDGER_EVENT", `duplicate ledger event ${event.eventId}`);
    ids.add(event.eventId);
    const shop = network.shops.find((candidate) => candidate.shopId === event.shopId && candidate.skuId === event.skuId);
    if (!shop) throw new DomainValidationError("UNKNOWN_LEDGER_TARGET", `unknown shop/SKU for ${event.eventId}`);
    let updated;
    if (event.eventType === LEDGER_EVENT.STOCK_RECEIPT) updated = recordStockReceipt(shop, { quantity: event.quantity, observedAt: event.occurredAt, reference: event.eventId });
    else if (event.eventType === LEDGER_EVENT.PHYSICAL_COUNT) updated = reconcilePhysicalCount(shop, { countedQuantity: event.quantity, observedAt: event.occurredAt, reason: "LEDGER_VERIFIED" });
    else if (event.eventType === LEDGER_EVENT.LOST_DEMAND) updated = recordLostDemand(shop, { quantity: event.quantity });
    else {
      if (event.quantity > shop.onHand) throw new DomainValidationError("SALE_EXCEEDS_RECORDED_STOCK", `register sale exceeds recorded stock for ${event.eventId}`);
      updated = Object.freeze({ ...shop, onHand: shop.onHand - event.quantity, inventoryEvidence: Object.freeze({ status: "KNOWN", source: event.source, observedAt: event.occurredAt, previous: shop.inventoryEvidence ?? null }) });
    }
    network = replaceShop(network, updated);
  }
  return Object.freeze(network);
}

export function photoRetentionState(photo, nowIso) {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) throw new DomainValidationError("INVALID_TIMESTAMP", "now must be an ISO timestamp");
  if (photo.status !== "VERIFIED" || !photo.verifiedAt) return Object.freeze({ deletable: false, deleteAfter: null });
  const verified = Date.parse(photo.verifiedAt);
  if (Number.isNaN(verified)) throw new DomainValidationError("INVALID_TIMESTAMP", "verifiedAt must be an ISO timestamp");
  const deleteAfterMs = verified + REGISTER_PHOTO_RETENTION_MS;
  return Object.freeze({ deletable: now >= deleteAfterMs, deleteAfter: new Date(deleteAfterMs).toISOString() });
}
