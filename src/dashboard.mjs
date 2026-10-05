import { createRecommendation } from "./decisions.mjs";
import { detectStoreExceptions, scoreException } from "./exceptions.mjs";
import { explainExceptions } from "./explanations.mjs";
import { selectForecast } from "./forecasting.mjs";
import { calculateInventoryPolicy, standardDeviation } from "./inventory-policy.mjs";
import { aggregateRequirements, allocateScarceStock } from "./network.mjs";
import { DEMO_NETWORK, DEMO_POLICY } from "./demo-data.mjs";

export function buildDashboard(network = DEMO_NETWORK, policy = DEMO_POLICY) {
  const shops = network.shops.map((shop) => {
    const forecast = selectForecast([...shop.demandHistory]);
    if (forecast.status !== "FORECAST_READY") {
      return Object.freeze({ shop, forecast, inventoryPolicy: null, exceptions: null, explanation: null, recommendation: null });
    }
    const demandStdDev = standardDeviation([...shop.demandHistory]) ?? 0;
    const inventoryPolicy = calculateInventoryPolicy({
      usableStock: shop.onHand,
      reserved: shop.reserved,
      incomingConfirmed: shop.incomingConfirmed,
      dailyForecast: forecast.forecast,
      demandStdDev,
      leadTimeMeanDays: shop.leadTimeMeanDays,
      leadTimeStdDevDays: shop.leadTimeStdDevDays,
      reviewPeriodDays: policy.reviewPeriodDays,
      serviceFactor: policy.serviceFactor,
      packSize: shop.packSize,
    });
    const exceptions = detectStoreExceptions({
      policy,
      state: {
        dataStatus: shop.inventoryEvidence?.status ?? "UNKNOWN",
        daysCover: inventoryPolicy.daysCover,
        leadTimeMeanDays: shop.leadTimeMeanDays,
        belowReorderPoint: inventoryPolicy.belowReorderPoint,
        lostDemand: shop.lostDemand,
        baselineDemand: shop.baselineDemand,
        recentDemand: shop.recentDemand,
        baselineLeadTimeDays: shop.baselineLeadTimeDays,
        recentLeadTimeDays: shop.recentLeadTimeDays,
        distributorAvailability: network.distributor.availableStock,
        forecastStatus: forecast.status,
        forecastConfidence: forecast.confidence,
      },
    });
    const score = scoreException(exceptions, policy.priorityWeights);
    const explanation = explainExceptions(exceptions);
    const recommendation = createRecommendation({
      recommendationId: `REC-${shop.shopId}-${shop.skuId}-${network.policyVersion}`,
      shopId: shop.shopId,
      skuId: shop.skuId,
      proposedQuantity: inventoryPolicy.proposedRequirement,
      relevantState: {
        inventoryPosition: inventoryPolicy.inventoryPosition,
        forecast: forecast.forecast,
        distributorAvailable: network.distributor.availableStock,
        exceptionCodes: exceptions.factors.map((factor) => factor.code),
      },
      algorithmVersion: network.algorithmVersion,
      policyVersion: network.policyVersion,
      generatedAt: network.generatedAt,
    });
    return Object.freeze({ shop, forecast, inventoryPolicy, exceptions, score, explanation, recommendation });
  });

  const requests = shops
    .filter((row) => row.recommendation && row.exceptions.recommendationAllowed)
    .map((row) => ({
      shopId: row.shop.shopId,
      requirement: row.recommendation.proposedQuantity,
      packSize: row.shop.packSize,
      priorityWeight: Math.max(1, row.score.score),
    }));
  const aggregated = aggregateRequirements(requests);
  const allocation = allocateScarceStock({
    availableStock: network.distributor.availableStock,
    requests,
  });

  return Object.freeze({ network, policy, shops: Object.freeze(shops), aggregated, allocation });
}
