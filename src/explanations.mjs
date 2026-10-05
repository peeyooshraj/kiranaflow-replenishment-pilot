const LABELS = Object.freeze({
  STOCKOUT_RISK: "Projected stock cover is shorter than the observed replenishment lead time.",
  BELOW_REORDER_POINT: "Inventory position is at or below the configured reorder point.",
  EXCESS_COVER: "Stock cover is above the configured excess-cover threshold.",
  LOST_DEMAND_OBSERVED: "Customers requested units that were recorded as unavailable.",
  DEMAND_EMERGENCE: "Recent observed demand is positive while the comparison baseline was zero.",
  DEMAND_SURGE: "Recent observed demand is materially above the comparison baseline under the configured policy.",
  LEAD_TIME_DETERIORATION: "Recent replenishment lead time is materially above its comparison baseline.",
  DISTRIBUTOR_UNAVAILABLE: "The distributor currently reports zero allocatable stock.",
  DISTRIBUTOR_AVAILABILITY_UNKNOWN: "Current distributor availability is unknown.",
  FORECAST_INSUFFICIENT: "Demand history does not support an authoritative forecast under the current rules.",
  FORECAST_UNRATED: "The forecast exists, but confidence bands have not been calibrated.",
  DATA_INVALID: "Required operational data failed validation.",
  DATA_CONFLICTED: "Operational records conflict and require reconciliation.",
  DATA_STALE: "Operational data is too stale for an authoritative recommendation.",
  DATA_UNKNOWN: "Required operational data is unknown.",
});

export function explainExceptions(exceptionResult) {
  const reasons = exceptionResult.factors.map((factor) => LABELS[factor.code] ?? factor.code);
  const limitations = exceptionResult.factors
    .filter((factor) => factor.severity === "BLOCKING" || factor.code.endsWith("UNKNOWN") || factor.code === "FORECAST_UNRATED")
    .map((factor) => LABELS[factor.code] ?? factor.code);
  return Object.freeze({
    what: exceptionResult.factors.length ? "Inventory exception requires attention." : "No configured exception detected.",
    why: Object.freeze(reasons),
    limitations: Object.freeze(limitations),
    actionBoundary: exceptionResult.recommendationAllowed
      ? "Decision support only; a human must accept, modify, defer or reject any proposal."
      : "Authoritative recommendation suppressed; human/data review required.",
  });
}
