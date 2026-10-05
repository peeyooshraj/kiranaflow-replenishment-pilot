import { makeEventKey } from "./domain.mjs";
import { fail } from "./errors.mjs";
import { validateObservedEvent } from "./validation.mjs";

function stateKey(event) {
  return `${event.shopId}::${event.skuId}::${event.eventType}`;
}

function sameEvent(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class InMemoryEventStore {
  #events = new Map();
  #current = new Map();

  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
  }

  ingest(rawEvent) {
    const event = validateObservedEvent(rawEvent, { now: this.clock() });
    const eventKey = makeEventKey(event);

    if (this.#events.has(eventKey)) {
      const existing = this.#events.get(eventKey);
      if (!sameEvent(existing, event)) {
        fail("EVENT_ID_COLLISION", "the same source/event ID was reused with different content", {
          eventId: event.eventId,
          sourceId: event.sourceId,
        });
      }
      return Object.freeze({ status: "DUPLICATE_NO_EFFECT", event: existing });
    }

    this.#events.set(eventKey, event);
    const key = stateKey(event);
    const previous = this.#current.get(key);

    if (previous && event.sourceId !== previous.sourceId) {
      return Object.freeze({ status: "CONFLICTED_SOURCE", event, current: previous });
    }

    if (previous && event.version <= previous.version) {
      return Object.freeze({ status: "STALE_EVENT", event, current: previous });
    }

    if (previous && Date.parse(event.observedAt) <= Date.parse(previous.observedAt)) {
      return Object.freeze({ status: "CONFLICTED_ORDER", event, current: previous });
    }

    this.#current.set(key, event);
    return Object.freeze({ status: "APPLIED", event, previous: previous ?? null });
  }

  getCurrent({ shopId, skuId, eventType }) {
    return this.#current.get(`${shopId}::${skuId}::${eventType}`) ?? null;
  }

  get rawEventCount() {
    return this.#events.size;
  }
}
