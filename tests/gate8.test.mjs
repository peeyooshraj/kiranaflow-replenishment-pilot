import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_NETWORK } from "../src/demo-data.mjs";
import { recordStockReceipt, reconcilePhysicalCount, recordLostDemand, replaceShop } from "../src/intake.mjs";

test("delivery evidence increases stock without mutating prior shop state", () => {
  const shop = DEMO_NETWORK.shops[0];
  const updated = recordStockReceipt(shop, { quantity: 12, observedAt: "2026-10-05T06:10:00.000Z", reference: "INV-1" });
  assert.equal(updated.onHand, shop.onHand + 12); assert.equal(shop.onHand, 8); assert.match(updated.inventoryEvidence.source, /DELIVERY/);
});
test("physical count reconciles to observed quantity rather than applying a hidden delta", () => {
  const updated = reconcilePhysicalCount(DEMO_NETWORK.shops[0], { countedQuantity: 6, observedAt: "2026-10-05T06:10:00.000Z" });
  assert.equal(updated.onHand, 6); assert.equal(updated.inventoryEvidence.previous.source, "DEMO_POS_EXPORT");
});
test("lost demand is evidence and does not invent a sale or decrement stock", () => {
  const shop = DEMO_NETWORK.shops[0]; const updated = recordLostDemand(shop, { quantity: 1 }); assert.equal(updated.lostDemand, shop.lostDemand + 1); assert.equal(updated.onHand, shop.onHand);
});
test("network shop replacement is explicit and unknown shops fail closed", () => {
  const updated = reconcilePhysicalCount(DEMO_NETWORK.shops[0], { countedQuantity: 7, observedAt: "2026-10-05T06:10:00.000Z" }); assert.equal(replaceShop(DEMO_NETWORK, updated).shops[0].onHand, 7);
  assert.throws(() => replaceShop(DEMO_NETWORK, { ...updated, shopId: "NO-SUCH-SHOP" }), /replacement shop/);
});
