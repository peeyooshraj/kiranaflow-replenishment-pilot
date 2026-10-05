import test from "node:test";
import assert from "node:assert/strict";

import { DECISION_STATUS } from "../src/domain.mjs";
import {
  createRecommendation,
  decisionIsStale,
  fingerprintRecommendation,
  recordHumanDecision,
} from "../src/decisions.mjs";

function recommendation(overrides = {}) {
  return createRecommendation({
    recommendationId: "R1",
    shopId: "K1",
    skuId: "S1",
    proposedQuantity: 24,
    relevantState: { inventoryPosition: 10, forecast: 5, distributorAvailable: 60 },
    algorithmVersion: "0.1.0",
    policyVersion: "demo-v1",
    generatedAt: "2026-10-05T06:00:00Z",
    ...overrides,
  });
}

test("recommendation fingerprints are stable across object key order", () => {
  const a = fingerprintRecommendation({ b: 2, a: { y: 2, x: 1 } });
  const b = fingerprintRecommendation({ a: { x: 1, y: 2 }, b: 2 });
  assert.equal(a, b);
});

test("accepted recommendation records a human decision but does not execute an order", () => {
  const rec = recommendation();
  const decision = recordHumanDecision(rec, {
    action: DECISION_STATUS.ACCEPTED,
    displayedFingerprint: rec.fingerprint,
    currentFingerprint: rec.fingerprint,
    decidedAt: "2026-10-05T06:05:00Z",
  });
  assert.equal(decision.status, "ACCEPTED");
  assert.equal(decision.chosenQuantity, 24);
  assert.equal(decision.executedOrder, false);
});

test("human can explicitly modify a recommendation without rewriting the original suggestion", () => {
  const rec = recommendation();
  const decision = recordHumanDecision(rec, {
    action: DECISION_STATUS.MODIFIED,
    modifiedQuantity: 12,
    displayedFingerprint: rec.fingerprint,
    currentFingerprint: rec.fingerprint,
    decidedAt: "2026-10-05T06:05:00Z",
    reason: "SHELF_SPACE",
  });
  assert.equal(rec.proposedQuantity, 24);
  assert.equal(decision.suggestedQuantity, 24);
  assert.equal(decision.chosenQuantity, 12);
  assert.equal(decision.reason, "SHELF_SPACE");
});

test("a state change makes the displayed recommendation stale before approval", () => {
  const oldRec = recommendation();
  const newRec = recommendation({
    recommendationId: "R2",
    relevantState: { inventoryPosition: 30, forecast: 5, distributorAvailable: 60 },
    proposedQuantity: 6,
  });
  const decision = recordHumanDecision(oldRec, {
    action: DECISION_STATUS.ACCEPTED,
    displayedFingerprint: oldRec.fingerprint,
    currentFingerprint: newRec.fingerprint,
    decidedAt: "2026-10-05T06:05:00Z",
  });
  assert.equal(decision.status, "STALE");
  assert.equal("executedOrder" in decision, false);
});

test("a saved human decision becomes stale when its recommendation state changes", () => {
  const rec = recommendation();
  const decision = recordHumanDecision(rec, {
    action: DECISION_STATUS.ACCEPTED,
    displayedFingerprint: rec.fingerprint,
    currentFingerprint: rec.fingerprint,
    decidedAt: "2026-10-05T06:05:00Z",
  });
  const changed = recommendation({ relevantState: { inventoryPosition: 5, forecast: 8 } });
  assert.equal(decisionIsStale(decision, changed.fingerprint), true);
  assert.equal(decisionIsStale(decision, rec.fingerprint), false);
});

test("invalid modified quantities fail closed", () => {
  const rec = recommendation();
  assert.throws(() =>
    recordHumanDecision(rec, {
      action: DECISION_STATUS.MODIFIED,
      modifiedQuantity: -1,
      displayedFingerprint: rec.fingerprint,
      currentFingerprint: rec.fingerprint,
      decidedAt: "2026-10-05T06:05:00Z",
    }),
  );
});
