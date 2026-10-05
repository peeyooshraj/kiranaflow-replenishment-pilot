import { DECISION_STATUS } from "./domain.mjs";
import { fail } from "./errors.mjs";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function fingerprintRecommendation(input) {
  if (!input || typeof input !== "object") fail("INVALID_RECOMMENDATION_STATE", "fingerprint input must be an object");
  const serialized = JSON.stringify(canonicalize(input));
  // This fingerprint detects stale recommendation state; it is not a security primitive.
  // Four salted FNV-1a 64-bit passes keep it synchronous and identical in Node and browsers.
  const mask = 0xffffffffffffffffn;
  const offset = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const parts = [];
  for (let salt = 0; salt < 4; salt += 1) {
    let hash = offset ^ BigInt(salt + 1);
    const text = `${salt}|${serialized}`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = (hash * prime) & mask;
    }
    parts.push(hash.toString(16).padStart(16, "0"));
  }
  return parts.join("");
}

export function createRecommendation({
  recommendationId,
  shopId,
  skuId,
  proposedQuantity,
  relevantState,
  algorithmVersion,
  policyVersion,
  generatedAt,
}) {
  for (const [field, value] of Object.entries({ recommendationId, shopId, skuId, algorithmVersion, policyVersion, generatedAt })) {
    if (typeof value !== "string" || value.trim() === "") {
      fail("INVALID_RECOMMENDATION", `${field} must be a non-empty string`, { field });
    }
  }
  if (!Number.isInteger(proposedQuantity) || proposedQuantity < 0) {
    fail("INVALID_RECOMMENDATION", "proposedQuantity must be a non-negative integer base-unit quantity");
  }
  if (!relevantState || typeof relevantState !== "object" || Array.isArray(relevantState)) {
    fail("INVALID_RECOMMENDATION", "relevantState must be an object");
  }

  const fingerprintInput = {
    shopId,
    skuId,
    proposedQuantity,
    relevantState,
    algorithmVersion,
    policyVersion,
  };
  return Object.freeze({
    recommendationId,
    shopId,
    skuId,
    proposedQuantity,
    relevantState: Object.freeze(canonicalize(relevantState)),
    algorithmVersion,
    policyVersion,
    generatedAt,
    fingerprint: fingerprintRecommendation(fingerprintInput),
    status: DECISION_STATUS.PROPOSED,
  });
}

export function recordHumanDecision(recommendation, {
  action,
  displayedFingerprint,
  currentFingerprint,
  decidedAt,
  modifiedQuantity,
  reason = null,
}) {
  if (!recommendation || recommendation.status !== DECISION_STATUS.PROPOSED) {
    fail("INVALID_RECOMMENDATION", "decision requires a PROPOSED recommendation");
  }
  if (
    displayedFingerprint !== recommendation.fingerprint ||
    currentFingerprint !== recommendation.fingerprint
  ) {
    return Object.freeze({
      status: DECISION_STATUS.STALE,
      recommendationId: recommendation.recommendationId,
      previousFingerprint: recommendation.fingerprint,
      currentFingerprint,
    });
  }
  if (![DECISION_STATUS.ACCEPTED, DECISION_STATUS.MODIFIED, DECISION_STATUS.DEFERRED, DECISION_STATUS.REJECTED].includes(action)) {
    fail("INVALID_DECISION_ACTION", `unsupported decision action: ${action}`);
  }
  if (typeof decidedAt !== "string" || Number.isNaN(Date.parse(decidedAt))) {
    fail("INVALID_DECISION_TIME", "decidedAt must be a valid timestamp string");
  }

  let chosenQuantity = null;
  if (action === DECISION_STATUS.ACCEPTED) {
    chosenQuantity = recommendation.proposedQuantity;
  } else if (action === DECISION_STATUS.MODIFIED) {
    if (!Number.isInteger(modifiedQuantity) || modifiedQuantity < 0) {
      fail("INVALID_MODIFIED_QUANTITY", "modifiedQuantity must be a non-negative integer");
    }
    chosenQuantity = modifiedQuantity;
  }

  return Object.freeze({
    status: action,
    recommendationId: recommendation.recommendationId,
    recommendationFingerprint: recommendation.fingerprint,
    suggestedQuantity: recommendation.proposedQuantity,
    chosenQuantity,
    reason,
    decidedAt: new Date(decidedAt).toISOString(),
    executedOrder: false,
  });
}

export function decisionIsStale(decision, currentFingerprint) {
  if (!decision || typeof decision.recommendationFingerprint !== "string") {
    fail("INVALID_DECISION", "decision has no recommendation fingerprint");
  }
  return decision.recommendationFingerprint !== currentFingerprint;
}
