import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, reviewOperationalCsv, productAdvice } from "../src/field-pilot.mjs";

const header="date,sku,product,quantity_sold,closing_stock,unit,lead_time_days,pack_size,supplier";
const rows=Array.from({length:10},(_,i)=>`2026-09-${String(i+1).padStart(2,"0")},OIL1,Oil 1L,${4+i%3},${30-i},bottle,3,6,Gupta Traders`);
const csv=[header,...rows].join("\n");
test("real-shop CSV parser handles quoted commas without shifting columns",()=>{const x=parseCsv(`${header}\n2026-09-01,S1,"Rice, Premium",3,20,bag,2,1,Supplier`);assert.equal(x.status,"PARSED");assert.equal(x.rows[0].product,"Rice, Premium");});
test("missing required columns fail schema review instead of becoming defaults",()=>{const x=reviewOperationalCsv("date,sku,product\n2026-09-01,S1,Rice");assert.equal(x.status,"INVALID_SCHEMA");assert.match(x.errors[0],/quantity_sold/);});
test("review builds one product history from daily operational rows",()=>{const x=reviewOperationalCsv(csv);assert.equal(x.status,"READY");assert.equal(x.products.length,1);assert.equal(x.products[0].historyDays,10);assert.equal(x.products[0].onHand,21);});
test("bad row is quarantined and import requires review",()=>{const x=reviewOperationalCsv(`${csv}\n2026-09-11,OIL1,Oil 1L,NOPE,20,bottle,3,6,Gupta Traders`);assert.equal(x.status,"REVIEW_REQUIRED");assert.equal(x.invalidRows,1);assert.equal(x.products[0].historyDays,10);});
test("imported product can run through canonical forecasting and inventory policy",()=>{const p=reviewOperationalCsv(csv).products[0],a=productAdvice(p);assert.equal(a.status,"READY");assert.ok(Number.isFinite(a.forecast.forecast));assert.ok(a.inventory.proposedRequirement>=0);});
test("real-shop UI exposes reviewed setup and refuses fake live distributor sync",()=>{const app=readFileSync(fileURLToPath(new URL("../src/app.mjs",import.meta.url)),"utf8");assert.match(app,/Set up your shop/);assert.match(app,/Import & use my shop/);assert.match(app,/Distributor connection not live yet/);assert.match(app,/synthetic demo controls are deliberately hidden/);});
