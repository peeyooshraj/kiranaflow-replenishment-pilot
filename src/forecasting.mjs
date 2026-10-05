import { fail } from "./errors.mjs";

function assertSeries(series) {
  if (!Array.isArray(series) || series.some((x) => typeof x !== "number" || !Number.isFinite(x) || x < 0)) {
    fail("INVALID_FORECAST_SERIES", "forecast series must contain finite non-negative numbers");
  }
}

export function naivePredict(history) {
  assertSeries(history);
  if (history.length < 1) return null;
  return history.at(-1);
}

export function movingAveragePredict(history, window) {
  assertSeries(history);
  if (!Number.isInteger(window) || window <= 0) {
    fail("INVALID_WINDOW", "moving-average window must be a positive integer");
  }
  if (history.length < window) return null;
  const tail = history.slice(-window);
  return tail.reduce((sum, value) => sum + value, 0) / window;
}

export function sesPredict(history, alpha) {
  assertSeries(history);
  if (!(alpha > 0 && alpha <= 1)) {
    fail("INVALID_ALPHA", "SES alpha must be in (0, 1]");
  }
  if (history.length < 1) return null;
  let level = history[0];
  for (let i = 1; i < history.length; i += 1) {
    level = alpha * history[i] + (1 - alpha) * level;
  }
  return level;
}

export function makeDefaultCandidates() {
  return [
    { name: "naive", minTrain: 1, predict: naivePredict },
    { name: "ma-3", minTrain: 3, predict: (h) => movingAveragePredict(h, 3) },
    { name: "ma-7", minTrain: 7, predict: (h) => movingAveragePredict(h, 7) },
    { name: "ses-0.2", minTrain: 1, predict: (h) => sesPredict(h, 0.2) },
    { name: "ses-0.5", minTrain: 1, predict: (h) => sesPredict(h, 0.5) },
    { name: "ses-0.8", minTrain: 1, predict: (h) => sesPredict(h, 0.8) },
  ];
}

export function rollingBacktest(series, candidate, { minEvaluationPoints = 3 } = {}) {
  assertSeries(series);
  if (!candidate || typeof candidate.predict !== "function" || !Number.isInteger(candidate.minTrain)) {
    fail("INVALID_CANDIDATE", "forecast candidate must define predict and integer minTrain");
  }
  if (!Number.isInteger(minEvaluationPoints) || minEvaluationPoints <= 0) {
    fail("INVALID_EVALUATION_WINDOW", "minEvaluationPoints must be a positive integer");
  }

  const predictions = [];
  for (let target = candidate.minTrain; target < series.length; target += 1) {
    const training = series.slice(0, target);
    const prediction = candidate.predict(training);
    if (prediction === null) continue;
    if (!Number.isFinite(prediction) || prediction < 0) {
      fail("INVALID_FORECAST_OUTPUT", `${candidate.name} produced an invalid forecast`, { prediction });
    }
    predictions.push(
      Object.freeze({ targetIndex: target, prediction, actual: series[target], trainingEndIndex: target - 1 }),
    );
  }

  if (predictions.length < minEvaluationPoints) {
    return Object.freeze({ status: "INSUFFICIENT_BACKTEST", name: candidate.name, predictions });
  }

  const absoluteError = predictions.reduce(
    (sum, row) => sum + Math.abs(row.actual - row.prediction),
    0,
  );
  const actualTotal = predictions.reduce((sum, row) => sum + row.actual, 0);
  return Object.freeze({
    status: "EVALUATED",
    name: candidate.name,
    predictions,
    mae: absoluteError / predictions.length,
    wape: actualTotal > 0 ? absoluteError / actualTotal : null,
  });
}

export function selectForecast(series, {
  minHistory = 8,
  minEvaluationPoints = 3,
  candidates = makeDefaultCandidates(),
} = {}) {
  assertSeries(series);
  if (series.length < minHistory) {
    return Object.freeze({
      status: "INSUFFICIENT_HISTORY",
      forecast: null,
      confidence: "INSUFFICIENT",
      historyLength: series.length,
      minHistory,
    });
  }

  const evaluations = candidates
    .map((candidate) => ({ candidate, result: rollingBacktest(series, candidate, { minEvaluationPoints }) }))
    .filter((row) => row.result.status === "EVALUATED")
    .sort((a, b) => a.result.mae - b.result.mae || a.candidate.name.localeCompare(b.candidate.name));

  if (evaluations.length === 0) {
    return Object.freeze({
      status: "INSUFFICIENT_BACKTEST",
      forecast: null,
      confidence: "INSUFFICIENT",
      historyLength: series.length,
    });
  }

  const champion = evaluations[0];
  const forecast = champion.candidate.predict(series);
  if (!Number.isFinite(forecast) || forecast < 0) {
    fail("INVALID_FORECAST_OUTPUT", "champion model produced an invalid final forecast");
  }

  return Object.freeze({
    status: "FORECAST_READY",
    forecast,
    confidence: "UNRATED",
    model: champion.candidate.name,
    mae: champion.result.mae,
    wape: champion.result.wape,
    evaluatedModels: evaluations.map((row) =>
      Object.freeze({ name: row.candidate.name, mae: row.result.mae, wape: row.result.wape }),
    ),
    historyLength: series.length,
  });
}
