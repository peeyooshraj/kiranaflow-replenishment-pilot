import { fail } from "./errors.mjs";

function nonNegativeFinite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("INVALID_POLICY_INPUT", `${field} must be a finite non-negative number`, { field, value });
  }
  return value;
}

function positiveFinite(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail("INVALID_POLICY_INPUT", `${field} must be a finite positive number`, { field, value });
  }
  return value;
}

export function standardDeviation(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  values.forEach((value) => nonNegativeFinite(value, "demandHistory"));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateSafetyStock({
  dailyDemandMean,
  demandStdDev,
  leadTimeMeanDays,
  leadTimeStdDevDays = 0,
  serviceFactor,
}) {
  const demand = nonNegativeFinite(dailyDemandMean, "dailyDemandMean");
  const demandSd = nonNegativeFinite(demandStdDev, "demandStdDev");
  const lead = positiveFinite(leadTimeMeanDays, "leadTimeMeanDays");
  const leadSd = nonNegativeFinite(leadTimeStdDevDays, "leadTimeStdDevDays");
  const z = nonNegativeFinite(serviceFactor, "serviceFactor");
  const varianceDuringLead = lead * demandSd ** 2 + demand ** 2 * leadSd ** 2;
  return z * Math.sqrt(varianceDuringLead);
}

export function calculateInventoryPolicy({
  usableStock,
  reserved = 0,
  incomingConfirmed = 0,
  dailyForecast,
  demandStdDev,
  leadTimeMeanDays,
  leadTimeStdDevDays = 0,
  reviewPeriodDays,
  serviceFactor,
  packSize,
}) {
  const usable = nonNegativeFinite(usableStock, "usableStock");
  const reservedQty = nonNegativeFinite(reserved, "reserved");
  const incoming = nonNegativeFinite(incomingConfirmed, "incomingConfirmed");
  const forecast = nonNegativeFinite(dailyForecast, "dailyForecast");
  const lead = positiveFinite(leadTimeMeanDays, "leadTimeMeanDays");
  const review = nonNegativeFinite(reviewPeriodDays, "reviewPeriodDays");
  const pack = positiveFinite(packSize, "packSize");

  if (!Number.isInteger(pack)) {
    fail("INVALID_PACK_SIZE", "packSize must be a positive integer in the canonical base unit");
  }
  if (reservedQty > usable) {
    fail("RESERVED_EXCEEDS_USABLE", "reserved stock cannot exceed usable stock");
  }

  const safetyStock = calculateSafetyStock({
    dailyDemandMean: forecast,
    demandStdDev,
    leadTimeMeanDays: lead,
    leadTimeStdDevDays,
    serviceFactor,
  });
  const inventoryPosition = usable + incoming - reservedQty;
  const leadTimeDemand = forecast * lead;
  const reorderPoint = leadTimeDemand + safetyStock;
  const targetStock = forecast * (lead + review) + safetyStock;
  const rawRequirement = Math.max(0, targetStock - inventoryPosition);
  const proposedRequirement = rawRequirement === 0 ? 0 : Math.ceil(rawRequirement / pack) * pack;
  const daysCover = forecast > 0 ? usable / forecast : null;

  const output = {
    inventoryPosition,
    leadTimeDemand,
    safetyStock,
    reorderPoint,
    targetStock,
    rawRequirement,
    proposedRequirement,
    daysCover,
    belowReorderPoint: inventoryPosition <= reorderPoint,
  };

  for (const [field, value] of Object.entries(output)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      fail("INVALID_POLICY_OUTPUT", `${field} produced an invalid value`, { field, value });
    }
  }
  return Object.freeze(output);
}
