# KiranaFlow

KiranaFlow is an early-stage supply-chain analytics project for studying demand sensing, inventory risk, replenishment and distributor coordination across independent kirana retailers.

## Current build gate

**Gates 1–10** are implemented. The project includes a shopkeeper-first synthetic browser surface, evidence-aware inventory updates, a persistent single-device pilot ledger and a retailer/distributor view built on the same tested analytical modules; it does not duplicate the inventory/forecasting formulas in the UI.

Implemented contracts:

- explicit event identity and source identity
- strict event/schema/domain validation
- missing required quantities cannot silently become zero
- non-finite and negative physical quantities fail closed
- cross-field inventory contradictions are rejected
- observation timestamps cannot be in the future
- unit mismatches require an explicit conversion
- duplicate retries are idempotent
- reused event identities with changed content fail as collisions
- competing authoritative sources are surfaced as conflicts instead of overwriting one another
- stale late-arriving events are preserved but cannot overwrite newer state
- higher versions with contradictory observation order are contained
- deterministic inventory derivation
- immutable canonical event objects

Gate 2 currently adds:

- stockout-censored demand is distinct from observed zero demand
- missing stock-availability evidence remains explicit
- strict forecast input refuses to silently impute censored/missing periods
- naive, moving-average and simple-exponential-smoothing candidates
- rolling-origin backtests that cannot see their prediction target
- deterministic model competition using MAE with WAPE as a secondary diagnostic
- explicit insufficient-history/backtest states
- forecast confidence remains `UNRATED` until confidence bands are empirically/configurably defined

Gate 3 adds deterministic safety-stock, reorder-point, days-of-cover, target-stock and proposed-requirement calculations. Policy inputs such as service factor and review period remain explicit configuration rather than learned facts. Pack-size feasibility is enforced, and the output is a proposed requirement—not an executed purchase order.

Gate 4 adds one-net-requirement-per-shop aggregation plus a bounded exact allocation optimizer for a distributor/SKU shortage. It maximizes explicitly supplied priority-weighted fulfilled quantity subject to distributor stock, shop requirement and pack-size constraints. Priority weights are policy inputs, not learned truth, and the optimizer refuses exact problems above its configured capacity instead of risking an unbounded browser/server workload.

Gate 5 adds canonical recommendation fingerprints and Accept/Modify/Defer/Reject decision recording. A state change makes the displayed recommendation stale before approval, and recorded decisions can later be tested against a new fingerprint. Even an accepted decision explicitly remains `executedOrder: false` in this prototype.

Gate 6 preserves multiple contributing factors, suppresses recommendations on invalid/stale/conflicted/insufficient states, distinguishes unknown distributor availability from zero availability, handles a zero demand baseline without division-by-zero, produces transparent policy-weight contributions, and generates explanations that expose limitations and the human-action boundary.

Gate 8 adds explicit stock-intake operations for distributor receipts, physical-count reconciliation and lost-demand evidence. Inventory evidence carries its source and observation time; prior evidence is retained when a physical count or receipt updates the synthetic shop. The browser also exposes POS/CSV and handwritten-register-photo intake points. Those two parsers are intentionally not represented as operational integrations yet: CSV validation and handwriting OCR require real adapters plus a review/confirmation stage before they may change canonical inventory.

Gate 9 adds browser-persistent IndexedDB storage for the single-device pilot. Verified stock receipts, physical counts, lost demand and manually verified register sales are append-only ledger events and are replayed to reconstruct the current synthetic shop state after reload. Register images are stored separately as temporary evidence. A photo cannot be age-purged while awaiting verification; after verification it becomes eligible for automatic deletion exactly seven days later. The verified ledger event remains. This is local-device persistence, not cloud backup or retailer-to-distributor synchronization.

Gate 10 adds a richer visual system without changing operational semantics: deep indigo/aubergine identity colors, controlled gold/coral warmth, explicit red/sage status roles, responsive decision surfaces and a locally bundled, brand-neutral kirana hero image. The image is compressed for delivery and embedded into the standalone artifact so direct opening has no network dependency.

Gate 11 begins the real-shop Field Pilot path. A shop can create a local profile, download the canonical CSV template, import a multi-product sales/stock history, review schema/row errors before commit, persist the validated catalogue, and run the tested forecasting and inventory-policy modules per imported SKU. Backups export the shop profile, catalogue and operational ledger to JSON and can be restored. The field-mode distributor screen explicitly refuses to imply live synchronization. POS adapters, automated handwriting OCR, hosted backup/authentication and live distributor synchronization remain external integration gates rather than simulated capabilities.

The canonical operational CSV columns are `date, sku, product, quantity_sold, closing_stock, unit, lead_time_days, pack_size`; `supplier` is optional. Invalid numeric/date fields are quarantined for review, and a file with invalid rows cannot be committed through the UI until corrected.

Randomized tests currently exercise 2,000 seeded inventory-policy states and 500 seeded scarce-supply networks for non-finite outputs, negative quantities, stock conservation, pack feasibility and shop allocation bounds. These are engineering checks, not evidence of field performance or production scale.

## Run the browser demo

```bash
npm start
```

Then open `http://127.0.0.1:4173`. The interface is intentionally marked as a synthetic demonstration. Its human decision controls record in-memory demo decisions only; they never create a purchase order or call an external system.

## Open without a server

Run `npm run build` after source changes. It generates `kiranaflow-standalone.html`, a single self-contained browser file with the same analytical modules bundled inline. The standalone artifact is intended for direct opening/double-click demonstration; the modular source remains canonical for development and tests.

## Run tests

```bash
npm test
```

No external npm dependencies are required.

## Project status

This is not production software and does not connect to real kirana or distributor systems. The initial test fixtures are synthetic. Claims about stockout reduction, sales improvement or retailer competitiveness require future field evidence.
