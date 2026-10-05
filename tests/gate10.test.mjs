import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));

test("premium hero asset is local, optimized and referenced by the browser UI", () => {
  const asset = here("../assets/kirana-hero.jpg"), app = readFileSync(here("../src/app.mjs"), "utf8");
  assert.ok(statSync(asset).size > 0);
  assert.ok(statSync(asset).size < 400_000, "hero image should remain reasonably lightweight");
  assert.match(app, /\.\/assets\/kirana-hero\.jpg/);
  assert.match(app, /alt = "Illustrated Indian neighbourhood kirana shop/);
});

test("standalone builder embeds the hero rather than depending on an external file", () => {
  const build = readFileSync(here("../build-standalone.mjs"), "utf8");
  assert.match(build, /data:image\/jpeg;base64/);
  assert.match(build, /replaceAll\("\.\/assets\/kirana-hero\.jpg"/);
});

test("visual system retains named brand and operational palette roles", () => {
  const css = readFileSync(here("../styles.css"), "utf8");
  for (const token of ["--midnight", "--plum", "--gold", "--coral", "--sage", "--red"]) assert.match(css, new RegExp(token));
});

test("decision controls use visible inline editing rather than a browser prompt", () => {
  const app = readFileSync(here("../src/app.mjs"), "utf8");
  assert.doesNotMatch(app, /window\.prompt/);
  assert.match(app, /quantity-editor/);
  assert.match(app, /Nothing here sends an order automatically/);
});

test("unimplemented CSV integration is labelled rather than pretending to import", () => {
  const app = readFileSync(here("../src/app.mjs"), "utf8");
  assert.match(app, /POS \/ CSV import is not connected yet/);
  assert.match(app, /falsely imply that KiranaFlow can already import it/);
});
