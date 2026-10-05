import { EVENT_TYPE, SOURCE_TYPE } from "./domain.mjs";
import { fail } from "./errors.mjs";

const eventTypes = new Set(Object.values(EVENT_TYPE));
const sourceTypes = new Set(Object.values(SOURCE_TYPE));

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("INVALID_STRING", `${field} must be a non-empty string`, { field });
  }
  return value.trim();
}

function requireFiniteNonNegative(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("INVALID_QUANTITY", `${field} must be a finite non-negative number`, { field, value });
  }
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    fail("INVALID_VERSION", `${field} must be a positive integer`, { field, value });
  }
  return value;
}

function parseTimestamp(value, field, nowMs) {
  const ms = Date.parse(value);
  if (typeof value !== "string" || Number.isNaN(ms)) {
    fail("INVALID_TIMESTAMP", `${field} must be an ISO-compatible timestamp`, { field, value });
  }
  if (ms > nowMs) {
    fail("FUTURE_OBSERVATION", `${field} cannot be in the future for an observed event`, { field, value });
  }
  return new Date(ms).toISOString();
}

function validateInventoryPayload(payload) {
  const onHand = requireFiniteNonNegative(payload.onHand, "payload.onHand");
  const reserved = requireFiniteNonNegative(payload.reserved ?? 0, "payload.reserved");
  const damaged = requireFiniteNonNegative(payload.damaged ?? 0, "payload.damaged");
  const expired = requireFiniteNonNegative(payload.expired ?? 0, "payload.expired");
  const incomingConfirmed = requireFiniteNonNegative(
    payload.incomingConfirmed ?? 0,
    "payload.incomingConfirmed",
  );

  if (reserved > onHand) {
    fail("RESERVED_EXCEEDS_ON_HAND", "reserved inventory cannot exceed on-hand inventory", {
      reserved,
      onHand,
    });
  }
  if (damaged + expired > onHand) {
    fail("UNUSABLE_EXCEEDS_ON_HAND", "damaged plus expired inventory cannot exceed on-hand inventory", {
      damaged,
      expired,
      onHand,
    });
  }

  const unit = requireNonEmptyString(payload.unit, "payload.unit");
  return { ...payload, onHand, reserved, damaged, expired, incomingConfirmed, unit };
}

function validateDemandPayload(payload) {
  const quantity = requireFiniteNonNegative(payload.quantity, "payload.quantity");
  const unit = requireNonEmptyString(payload.unit, "payload.unit");
  return { ...payload, quantity, unit };
}

export function validateObservedEvent(input, { now = new Date() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("INVALID_EVENT", "event must be an object");
  }

  const eventId = requireNonEmptyString(input.eventId, "eventId");
  const sourceId = requireNonEmptyString(input.sourceId, "sourceId");
  const shopId = requireNonEmptyString(input.shopId, "shopId");
  const skuId = requireNonEmptyString(input.skuId, "skuId");
  const eventType = requireNonEmptyString(input.eventType, "eventType");
  const sourceType = requireNonEmptyString(input.sourceType, "sourceType");
  const version = requirePositiveInteger(input.version, "version");
  const observedAt = parseTimestamp(input.observedAt, "observedAt", now.getTime());

  if (!eventTypes.has(eventType)) {
    fail("UNKNOWN_EVENT_TYPE", `unsupported eventType: ${eventType}`, { eventType });
  }
  if (!sourceTypes.has(sourceType)) {
    fail("UNKNOWN_SOURCE_TYPE", `unsupported sourceType: ${sourceType}`, { sourceType });
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    fail("INVALID_PAYLOAD", "payload must be an object");
  }

  let payload;
  switch (eventType) {
    case EVENT_TYPE.SALE:
    case EVENT_TYPE.RETURN:
    case EVENT_TYPE.LOST_DEMAND:
    case EVENT_TYPE.STOCK_ADJUSTMENT:
      payload = validateDemandPayload(input.payload);
      break;
    case EVENT_TYPE.INVENTORY_SNAPSHOT:
    case EVENT_TYPE.DISTRIBUTOR_SNAPSHOT:
      payload = validateInventoryPayload(input.payload);
      break;
    default:
      fail("UNKNOWN_EVENT_TYPE", `unsupported eventType: ${eventType}`, { eventType });
  }

  return Object.freeze({
    eventId,
    sourceId,
    sourceType,
    shopId,
    skuId,
    eventType,
    version,
    observedAt,
    payload: Object.freeze(payload),
  });
}

export function assertSameUnit(left, right) {
  if (left !== right) {
    fail("UNIT_MISMATCH", `cannot combine ${left} with ${right} without an explicit conversion`, {
      left,
      right,
    });
  }
  return left;
}
