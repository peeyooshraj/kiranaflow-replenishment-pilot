import { fail } from "./errors.mjs";

export const DEMAND_EVIDENCE_STATUS = Object.freeze({
  OBSERVED: "OBSERVED",
  CENSORED_BY_STOCKOUT: "CENSORED_BY_STOCKOUT",
  DATA_MISSING: "DATA_MISSING",
});

function finiteNonNegative(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("INVALID_DEMAND_EVIDENCE", `${field} must be a finite non-negative number`, {
      field,
      value,
    });
  }
  return value;
}

export function reconstructDemandPeriod(period) {
  if (!period || typeof period !== "object") {
    fail("INVALID_DEMAND_PERIOD", "demand period must be an object");
  }
  if (period.stockAvailable === null || period.stockAvailable === undefined) {
    return Object.freeze({
      status: DEMAND_EVIDENCE_STATUS.DATA_MISSING,
      demand: null,
      lowerBound: null,
    });
  }
  if (typeof period.stockAvailable !== "boolean") {
    fail("INVALID_STOCK_AVAILABILITY", "stockAvailable must be boolean, null, or undefined");
  }

  const sales = finiteNonNegative(period.sales, "sales");
  const lostDemand = finiteNonNegative(period.lostDemand ?? 0, "lostDemand");
  const observedSignal = sales + lostDemand;

  if (!period.stockAvailable) {
    return Object.freeze({
      status: DEMAND_EVIDENCE_STATUS.CENSORED_BY_STOCKOUT,
      demand: null,
      lowerBound: observedSignal,
    });
  }

  return Object.freeze({
    status: DEMAND_EVIDENCE_STATUS.OBSERVED,
    demand: observedSignal,
    lowerBound: observedSignal,
  });
}

export function buildForecastSeries(periods) {
  if (!Array.isArray(periods) || periods.length === 0) {
    return Object.freeze({ status: "INSUFFICIENT_HISTORY", values: [], reasons: ["NO_HISTORY"] });
  }

  const reconstructed = periods.map(reconstructDemandPeriod);
  const censored = reconstructed.filter(
    (x) => x.status === DEMAND_EVIDENCE_STATUS.CENSORED_BY_STOCKOUT,
  ).length;
  const missing = reconstructed.filter((x) => x.status === DEMAND_EVIDENCE_STATUS.DATA_MISSING).length;

  if (censored || missing) {
    const reasons = [];
    if (censored) reasons.push("STOCKOUT_CENSORED_HISTORY");
    if (missing) reasons.push("MISSING_HISTORY");
    return Object.freeze({
      status: "INSUFFICIENT_HISTORY",
      values: [],
      reasons,
      censoredPeriods: censored,
      missingPeriods: missing,
    });
  }

  return Object.freeze({
    status: "READY",
    values: reconstructed.map((x) => x.demand),
    reasons: [],
    censoredPeriods: 0,
    missingPeriods: 0,
  });
}
