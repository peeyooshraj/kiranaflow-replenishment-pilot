import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_NETWORK } from "../src/demo-data.mjs";
import { LEDGER_EVENT, canonicalLedgerEvent, replayLedger, photoRetentionState } from "../src/ledger.mjs";

const base = { shopId: "K-DEMO-01", skuId: "OIL-1L", source: "TEST" };
test("ledger replay reconstructs stock from receipt, sale and physical-count facts", () => {
  const events = [
    { ...base, eventId:"E1", eventType:LEDGER_EVENT.STOCK_RECEIPT, quantity:12, occurredAt:"2026-10-05T06:10:00.000Z" },
    { ...base, eventId:"E2", eventType:LEDGER_EVENT.REGISTER_SALE, quantity:5, occurredAt:"2026-10-05T07:00:00.000Z" },
    { ...base, eventId:"E3", eventType:LEDGER_EVENT.PHYSICAL_COUNT, quantity:13, occurredAt:"2026-10-05T08:00:00.000Z" },
  ];
  assert.equal(replayLedger(DEMO_NETWORK, events).shops[0].onHand, 13);
});
test("register sale cannot manufacture negative inventory", () => {
  assert.throws(() => replayLedger(DEMO_NETWORK, [{ ...base, eventId:"E1", eventType:LEDGER_EVENT.REGISTER_SALE, quantity:99, occurredAt:"2026-10-05T07:00:00.000Z" }]), /exceeds recorded stock/);
});
test("duplicate ledger identities fail rather than double count", () => {
  const e = { ...base, eventId:"E1", eventType:LEDGER_EVENT.STOCK_RECEIPT, quantity:2, occurredAt:"2026-10-05T07:00:00.000Z" };
  assert.throws(() => replayLedger(DEMO_NETWORK, [e,e]), /duplicate ledger event/);
});
test("unverified photo is never age-purged", () => {
  assert.equal(photoRetentionState({ status:"PENDING_VERIFICATION", verifiedAt:null }, "2027-01-01T00:00:00.000Z").deletable, false);
});
test("verified photo becomes deletable only after seven full days", () => {
  const photo = { status:"VERIFIED", verifiedAt:"2026-10-05T10:00:00.000Z" };
  assert.equal(photoRetentionState(photo, "2026-10-12T09:59:59.999Z").deletable, false);
  assert.equal(photoRetentionState(photo, "2026-10-12T10:00:00.000Z").deletable, true);
  assert.equal(photoRetentionState(photo, "2026-10-12T10:00:00.000Z").deleteAfter, "2026-10-12T10:00:00.000Z");
});
test("ledger rejects missing identity and invalid quantities", () => {
  assert.throws(() => canonicalLedgerEvent({ ...base, eventId:"", eventType:LEDGER_EVENT.LOST_DEMAND, quantity:1, occurredAt:"2026-10-05T07:00:00.000Z" }));
  assert.throws(() => canonicalLedgerEvent({ ...base, eventId:"E1", eventType:LEDGER_EVENT.LOST_DEMAND, quantity:-1, occurredAt:"2026-10-05T07:00:00.000Z" }));
});
