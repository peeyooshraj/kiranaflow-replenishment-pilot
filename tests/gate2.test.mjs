import test from "node:test";
import assert from "node:assert/strict";

import { buildForecastSeries, reconstructDemandPeriod } from "../src/demand.mjs";
import {
  makeDefaultCandidates,
  movingAveragePredict,
  rollingBacktest,
  selectForecast,
  sesPredict,
} from "../src/forecasting.mjs";

test("an in-stock period keeps sales and observed lost demand explicit", () => {
  assert.deepEqual(reconstructDemandPeriod({ sales: 8, lostDemand: 2, stockAvailable: true }), {
    status: "OBSERVED",
    demand: 10,
    lowerBound: 10,
  });
});

test("a stockout zero is censored rather than treated as zero demand", () => {
  assert.deepEqual(reconstructDemandPeriod({ sales: 0, lostDemand: 6, stockAvailable: false }), {
    status: "CENSORED_BY_STOCKOUT",
    demand: null,
    lowerBound: 6,
  });
});

test("missing stock-availability evidence does not silently become in-stock", () => {
  assert.equal(reconstructDemandPeriod({ sales: 0, lostDemand: 0 }).status, "DATA_MISSING");
});

test("strict forecast-series builder fails closed on censored history", () => {
  const result = buildForecastSeries([
    { sales: 5, stockAvailable: true },
    { sales: 0, lostDemand: 3, stockAvailable: false },
    { sales: 6, stockAvailable: true },
  ]);
  assert.equal(result.status, "INSUFFICIENT_HISTORY");
  assert.deepEqual(result.reasons, ["STOCKOUT_CENSORED_HISTORY"]);
  assert.equal(result.values.length, 0);
});

test("moving average and SES are deterministic for fixed inputs", () => {
  const series = [2, 4, 6, 8];
  assert.equal(movingAveragePredict(series, 2), 7);
  assert.equal(sesPredict(series, 0.5), sesPredict(series, 0.5));
});

test("rolling backtest never includes the target observation in training", () => {
  const series = [1, 2, 3, 4, 5, 100];
  const spy = {
    name: "spy",
    minTrain: 2,
    predict(history) {
      return history.at(-1);
    },
  };
  const result = rollingBacktest(series, spy, { minEvaluationPoints: 1 });
  const predictionFor100 = result.predictions.find((row) => row.targetIndex === 5);
  assert.equal(predictionFor100.trainingEndIndex, 4);
  assert.equal(predictionFor100.prediction, 5);
  assert.equal(predictionFor100.actual, 100);
});

test("insufficient history returns an explicit state rather than a weak authoritative forecast", () => {
  const result = selectForecast([1, 2, 1], { minHistory: 8 });
  assert.equal(result.status, "INSUFFICIENT_HISTORY");
  assert.equal(result.forecast, null);
  assert.equal(result.confidence, "INSUFFICIENT");
});

test("candidate competition is deterministic and returns a supported forecast", () => {
  const series = [4, 5, 4, 6, 5, 5, 6, 5, 4, 5, 6, 5];
  const a = selectForecast(series);
  const b = selectForecast(series);
  assert.deepEqual(a, b);
  assert.equal(a.status, "FORECAST_READY");
  assert.ok(Number.isFinite(a.forecast));
  assert.ok(a.evaluatedModels.length > 0);
});

test("default candidates have unique stable names", () => {
  const names = makeDefaultCandidates().map((candidate) => candidate.name);
  assert.equal(new Set(names).size, names.length);
});
