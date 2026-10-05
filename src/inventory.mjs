import { EVENT_TYPE } from "./domain.mjs";
import { fail } from "./errors.mjs";

export function deriveInventory(snapshotEvent) {
  if (!snapshotEvent || snapshotEvent.eventType !== EVENT_TYPE.INVENTORY_SNAPSHOT) {
    fail("WRONG_EVENT_TYPE", "deriveInventory requires an INVENTORY_SNAPSHOT event");
  }

  const { onHand, damaged, expired, reserved, incomingConfirmed, unit } = snapshotEvent.payload;
  const usableStock = onHand - damaged - expired;
  const inventoryPosition = usableStock + incomingConfirmed - reserved;

  if (!Number.isFinite(usableStock) || !Number.isFinite(inventoryPosition)) {
    fail("NON_FINITE_DERIVATION", "inventory derivation produced a non-finite value");
  }
  if (usableStock < 0) {
    fail("NEGATIVE_USABLE_STOCK", "usable stock cannot be negative");
  }

  return Object.freeze({ usableStock, inventoryPosition, unit });
}
