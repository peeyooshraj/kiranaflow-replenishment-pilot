import test from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPE, SOURCE_TYPE } from "../src/domain.mjs";
import { DomainValidationError } from "../src/errors.mjs";
import { InMemoryEventStore } from "../src/event-store.mjs";
import { deriveInventory } from "../src/inventory.mjs";
import { assertSameUnit, validateObservedEvent } from "../src/validation.mjs";

const NOW = new Date("2026-10-05T06:00:00.000Z");

function inventoryEvent(overrides = {}) {
  return {
    eventId: "evt-1",
    sourceId: "device-k001",
    sourceType: SOURCE_TYPE.SYNTHETIC_TEST,
    shopId: "K001",
    skuId: "SKU001",
    eventType: EVENT_TYPE.INVENTORY_SNAPSHOT,
    version: 1,
    observedAt: "2026-10-05T05:00:00.000Z",
    payload: {
      onHand: 20,
      reserved: 3,
      damaged: 2,
      expired: 1,
      incomingConfirmed: 5,
      unit: "packet",
    },
    ...overrides,
  };
}

test("valid inventory events are canonicalized and frozen", () => {
  const event = validateObservedEvent(inventoryEvent(), { now: NOW });
  assert.equal(event.shopId, "K001");
  assert.equal(event.observedAt, "2026-10-05T05:00:00.000Z");
  assert.ok(Object.isFrozen(event));
  assert.ok(Object.isFrozen(event.payload));
});

test("missing is not silently interpreted as zero for required quantities", () => {
  const bad = inventoryEvent({ payload: { onHand: undefined, unit: "packet" } });
  assert.throws(
    () => validateObservedEvent(bad, { now: NOW }),
    (error) => error instanceof DomainValidationError && error.code === "INVALID_QUANTITY",
  );
});

test("non-finite and negative quantities fail closed", () => {
  for (const value of [NaN, Infinity, -1]) {
    const bad = inventoryEvent({ payload: { ...inventoryEvent().payload, onHand: value } });
    assert.throws(() => validateObservedEvent(bad, { now: NOW }), DomainValidationError);
  }
});

test("cross-field inventory contradictions are rejected", () => {
  const reserved = inventoryEvent({ payload: { ...inventoryEvent().payload, onHand: 5, reserved: 6 } });
  assert.throws(
    () => validateObservedEvent(reserved, { now: NOW }),
    (error) => error.code === "RESERVED_EXCEEDS_ON_HAND",
  );

  const unusable = inventoryEvent({
    payload: { ...inventoryEvent().payload, onHand: 5, damaged: 3, expired: 3, reserved: 0 },
  });
  assert.throws(
    () => validateObservedEvent(unusable, { now: NOW }),
    (error) => error.code === "UNUSABLE_EXCEEDS_ON_HAND",
  );
});

test("future observations are rejected", () => {
  const bad = inventoryEvent({ observedAt: "2026-10-05T07:00:00.000Z" });
  assert.throws(
    () => validateObservedEvent(bad, { now: NOW }),
    (error) => error.code === "FUTURE_OBSERVATION",
  );
});

test("undefined unit conversion cannot be silently treated as 1:1", () => {
  assert.throws(
    () => assertSameUnit("case", "packet"),
    (error) => error.code === "UNIT_MISMATCH",
  );
});

test("inventory derivation conserves defined inventory semantics", () => {
  const event = validateObservedEvent(inventoryEvent(), { now: NOW });
  const result = deriveInventory(event);
  assert.deepEqual(result, { usableStock: 17, inventoryPosition: 19, unit: "packet" });
});

test("duplicate retries are idempotent", () => {
  const store = new InMemoryEventStore({ clock: () => NOW });
  const first = store.ingest(inventoryEvent());
  const second = store.ingest(inventoryEvent());
  assert.equal(first.status, "APPLIED");
  assert.equal(second.status, "DUPLICATE_NO_EFFECT");
  assert.equal(store.rawEventCount, 1);
});

test("reusing an event identity with different content fails loudly", () => {
  const store = new InMemoryEventStore({ clock: () => NOW });
  store.ingest(inventoryEvent());
  const collision = inventoryEvent({ payload: { ...inventoryEvent().payload, onHand: 19 } });
  assert.throws(
    () => store.ingest(collision),
    (error) => error.code === "EVENT_ID_COLLISION",
  );
  assert.equal(store.rawEventCount, 1);
});

test("late stale events are preserved but cannot overwrite newer current state", () => {
  const store = new InMemoryEventStore({ clock: () => NOW });
  const v2 = inventoryEvent({
    eventId: "evt-v2",
    version: 2,
    observedAt: "2026-10-05T05:30:00.000Z",
    payload: { ...inventoryEvent().payload, onHand: 12 },
  });
  const v1 = inventoryEvent({ eventId: "evt-v1", version: 1 });

  assert.equal(store.ingest(v2).status, "APPLIED");
  assert.equal(store.ingest(v1).status, "STALE_EVENT");
  assert.equal(store.rawEventCount, 2);
  assert.equal(
    store.getCurrent({ shopId: "K001", skuId: "SKU001", eventType: EVENT_TYPE.INVENTORY_SNAPSHOT })
      .version,
    2,
  );
});

test("independent sources cannot silently overwrite the same authoritative state stream", () => {
  const store = new InMemoryEventStore({ clock: () => NOW });
  store.ingest(inventoryEvent());
  const competing = inventoryEvent({
    eventId: "other-source-2",
    sourceId: "csv-k001",
    version: 2,
    observedAt: "2026-10-05T05:30:00.000Z",
  });
  assert.equal(store.ingest(competing).status, "CONFLICTED_SOURCE");
  assert.equal(
    store.getCurrent({ shopId: "K001", skuId: "SKU001", eventType: EVENT_TYPE.INVENTORY_SNAPSHOT })
      .sourceId,
    "device-k001",
  );
});

test("a higher version with an older observation time cannot silently move state backward", () => {
  const store = new InMemoryEventStore({ clock: () => NOW });
  store.ingest(
    inventoryEvent({
      eventId: "newer-time-v1",
      version: 1,
      observedAt: "2026-10-05T05:30:00.000Z",
    }),
  );
  const contradictory = inventoryEvent({
    eventId: "older-time-v2",
    version: 2,
    observedAt: "2026-10-05T05:10:00.000Z",
  });
  assert.equal(store.ingest(contradictory).status, "CONFLICTED_ORDER");
});

test("same input and clock produce deterministic state", () => {
  const a = new InMemoryEventStore({ clock: () => NOW });
  const b = new InMemoryEventStore({ clock: () => NOW });
  const event = inventoryEvent();
  assert.deepEqual(a.ingest(event), b.ingest(event));
});

test("demand events require explicit non-negative quantity and unit", () => {
  const base = {
    eventId: "sale-1",
    sourceId: "pos-k001",
    sourceType: SOURCE_TYPE.SYNTHETIC_TEST,
    shopId: "K001",
    skuId: "SKU001",
    eventType: EVENT_TYPE.SALE,
    version: 1,
    observedAt: "2026-10-05T05:00:00.000Z",
    payload: { quantity: 2, unit: "packet" },
  };
  assert.equal(validateObservedEvent(base, { now: NOW }).payload.quantity, 2);
  assert.throws(
    () => validateObservedEvent({ ...base, payload: { quantity: -2, unit: "packet" } }, { now: NOW }),
    DomainValidationError,
  );
});
