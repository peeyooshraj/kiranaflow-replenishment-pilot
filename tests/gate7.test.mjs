import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildDashboard } from "../src/dashboard.mjs";

test("synthetic dashboard is deterministic and carries recommendation fingerprints", () => {
  const a = buildDashboard();
  const b = buildDashboard();
  assert.deepEqual(a, b);
  assert.equal(a.shops.length, 3);
  for (const row of a.shops) {
    assert.equal(row.forecast.status, "FORECAST_READY");
    assert.equal(row.recommendation.fingerprint.length, 64);
    assert.equal("executedOrder" in row.recommendation, false);
  }
});

test("dashboard network allocation conserves distributor stock", () => {
  const dashboard = buildDashboard();
  assert.ok(dashboard.allocation.usedStock <= dashboard.network.distributor.availableStock);
  assert.equal(
    dashboard.allocation.usedStock + dashboard.allocation.remainingStock,
    dashboard.network.distributor.availableStock,
  );
});

test("browser surface declares synthetic/no-live-order boundary and accessible tabs", () => {
  const path = fileURLToPath(new URL("../app.html", import.meta.url));
  const html = readFileSync(path, "utf8");
  assert.match(html, /Synthetic demo · no live orders/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /Human review required/);
});

test("browser renderer uses textContent and does not use innerHTML for operational data", () => {
  const path = fileURLToPath(new URL("../src/app.mjs", import.meta.url));
  const source = readFileSync(path, "utf8");
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("browser dependency graph contains no Node-only built-in imports", () => {
  const browserModules = [
    "../src/domain.mjs",
    "../src/errors.mjs",
    "../src/forecasting.mjs",
    "../src/inventory-policy.mjs",
    "../src/network.mjs",
    "../src/decisions.mjs",
    "../src/exceptions.mjs",
    "../src/explanations.mjs",
    "../src/intake.mjs",
    "../src/ledger.mjs",
    "../src/browser-storage.mjs",
    "../src/field-pilot.mjs",
    "../src/demo-data.mjs",
    "../src/dashboard.mjs",
    "../src/app.mjs",
  ];
  for (const relative of browserModules) {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    assert.doesNotMatch(source, /from\s+["']node:/, `${relative} contains a Node-only import`);
  }
});
