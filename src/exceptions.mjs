import { DATA_STATUS } from "./domain.mjs";
import { fail } from "./errors.mjs";

function finiteOrNull(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("INVALID_EXCEPTION_INPUT", `${field} must be finite or null`, { field, value });
  }
  return value;
}

function positive(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail("INVALID_EXCEPTION_POLICY", `${field} must be finite and positive`, { field, value });
  }
  return value;
}

export function detectStoreExceptions({ state, policy }) {
  if (!state || typeof state !== "object") fail("INVALID_EXCEPTION_INPUT", "state must be an object");
  if (!policy || typeof policy !== "object") fail("INVALID_EXCEPTION_POLICY", "policy must be an object");

  const excessCoverDays = positive(policy.excessCoverDays, "excessCoverDays");
  const demandShiftFraction = positive(policy.demandShiftFraction, "demandShiftFraction");
  const leadTimeDeteriorationFraction = positive(
    policy.leadTimeDeteriorationFraction,
    "leadTimeDeteriorationFraction",
  );
  const factors = [];

  const dataStatus = state.dataStatus ?? DATA_STATUS.KNOWN;
  if (dataStatus === DATA_STATUS.INVALID || dataStatus === DATA_STATUS.CONFLICTED) {
    factors.push({ code: dataStatus === DATA_STATUS.INVALID ? "DATA_INVALID" : "DATA_CONFLICTED", severity: "BLOCKING" });
  } else if (dataStatus === DATA_STATUS.STALE) {
    factors.push({ code: "DATA_STALE", severity: "BLOCKING" });
  } else if (dataStatus !== DATA_STATUS.KNOWN) {
    factors.push({ code: "DATA_UNKNOWN", severity: "BLOCKING" });
  }

  const daysCover = finiteOrNull(state.daysCover, "daysCover");
  const leadTimeMeanDays = finiteOrNull(state.leadTimeMeanDays, "leadTimeMeanDays");
  if (daysCover !== null && daysCover < 0) fail("INVALID_EXCEPTION_INPUT", "daysCover cannot be negative");
  if (leadTimeMeanDays !== null && leadTimeMeanDays <= 0) {
    fail("INVALID_EXCEPTION_INPUT", "leadTimeMeanDays must be positive when known");
  }
  if (daysCover !== null && leadTimeMeanDays !== null && daysCover < leadTimeMeanDays) {
    factors.push({ code: "STOCKOUT_RISK", severity: "HIGH" });
  }
  if (state.belowReorderPoint === true) factors.push({ code: "BELOW_REORDER_POINT", severity: "HIGH" });
  if (daysCover !== null && daysCover > excessCoverDays) factors.push({ code: "EXCESS_COVER", severity: "MEDIUM" });

  const lostDemand = finiteOrNull(state.lostDemand, "lostDemand");
  if (lostDemand !== null && lostDemand < 0) fail("INVALID_EXCEPTION_INPUT", "lostDemand cannot be negative");
  if (lostDemand > 0) factors.push({ code: "LOST_DEMAND_OBSERVED", severity: "HIGH" });

  const baselineDemand = finiteOrNull(state.baselineDemand, "baselineDemand");
  const recentDemand = finiteOrNull(state.recentDemand, "recentDemand");
  if (baselineDemand !== null && recentDemand !== null) {
    if (baselineDemand < 0 || recentDemand < 0) fail("INVALID_EXCEPTION_INPUT", "demand levels cannot be negative");
    if (baselineDemand === 0 && recentDemand > 0) {
      factors.push({ code: "DEMAND_EMERGENCE", severity: "MEDIUM" });
    } else if (baselineDemand > 0 && (recentDemand - baselineDemand) / baselineDemand >= demandShiftFraction) {
      factors.push({ code: "DEMAND_SURGE", severity: "MEDIUM" });
    }
  }

  const baselineLead = finiteOrNull(state.baselineLeadTimeDays, "baselineLeadTimeDays");
  const recentLead = finiteOrNull(state.recentLeadTimeDays, "recentLeadTimeDays");
  if (baselineLead !== null && recentLead !== null) {
    if (baselineLead <= 0 || recentLead <= 0) fail("INVALID_EXCEPTION_INPUT", "lead-time levels must be positive");
    if ((recentLead - baselineLead) / baselineLead >= leadTimeDeteriorationFraction) {
      factors.push({ code: "LEAD_TIME_DETERIORATION", severity: "MEDIUM" });
    }
  }

  if (state.distributorAvailability === null || state.distributorAvailability === undefined) {
    factors.push({ code: "DISTRIBUTOR_AVAILABILITY_UNKNOWN", severity: "MEDIUM" });
  } else {
    const availability = finiteOrNull(state.distributorAvailability, "distributorAvailability");
    if (availability < 0) fail("INVALID_EXCEPTION_INPUT", "distributorAvailability cannot be negative");
    if (availability === 0) factors.push({ code: "DISTRIBUTOR_UNAVAILABLE", severity: "HIGH" });
  }

  if (state.forecastStatus && state.forecastStatus !== "FORECAST_READY") {
    factors.push({ code: "FORECAST_INSUFFICIENT", severity: "BLOCKING" });
  } else if (state.forecastConfidence === "UNRATED") {
    factors.push({ code: "FORECAST_UNRATED", severity: "LOW" });
  }

  const blocking = factors.some((factor) => factor.severity === "BLOCKING");
  const codes = new Set(factors.map((factor) => factor.code));
  const conflicting = codes.has("STOCKOUT_RISK") && codes.has("EXCESS_COVER");
  const sorted = factors.sort((a, b) => a.code.localeCompare(b.code));
  return Object.freeze({
    factors: Object.freeze(sorted.map((factor) => Object.freeze(factor))),
    requiresManualReview: blocking || conflicting,
    recommendationAllowed: !blocking && !conflicting,
  });
}

export function scoreException(exceptionResult, weightByCode) {
  if (!exceptionResult || !Array.isArray(exceptionResult.factors)) {
    fail("INVALID_EXCEPTION_RESULT", "exceptionResult must contain factors");
  }
  if (!weightByCode || typeof weightByCode !== "object") {
    fail("INVALID_PRIORITY_POLICY", "weightByCode must be a policy object");
  }
  let score = 0;
  const contributions = [];
  for (const factor of exceptionResult.factors) {
    const weight = weightByCode[factor.code] ?? 0;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      fail("INVALID_PRIORITY_POLICY", `invalid weight for ${factor.code}`);
    }
    if (weight > 0) {
      score += weight;
      contributions.push(Object.freeze({ code: factor.code, weight }));
    }
  }
  return Object.freeze({ score, contributions: Object.freeze(contributions) });
}
