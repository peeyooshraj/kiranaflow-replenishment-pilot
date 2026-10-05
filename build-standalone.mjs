import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("./", import.meta.url));
const modules = [
  "src/domain.mjs",
  "src/errors.mjs",
  "src/forecasting.mjs",
  "src/inventory-policy.mjs",
  "src/network.mjs",
  "src/decisions.mjs",
  "src/exceptions.mjs",
  "src/explanations.mjs",
  "src/intake.mjs",
  "src/ledger.mjs",
  "src/browser-storage.mjs",
  "src/field-pilot.mjs",
  "src/demo-data.mjs",
  "src/dashboard.mjs",
  "src/app.mjs",
];

function toClassicScript(source, filename) {
  if (/^\s*import\s/m.test(source) === false && filename !== "src/domain.mjs") {
    // A module may legitimately have no imports. This branch is intentionally a no-op.
  }
  return source
    .split("\n")
    .filter((line) => !/^\s*import\s.+from\s+["'][^"']+["'];?\s*$/.test(line))
    .join("\n")
    .replace(/\bexport\s+(?=(const|let|var|function|class|async\s+function)\b)/g, "");
}

const [template, css, heroImage, ...sources] = await Promise.all([
  readFile(resolve(root, "app.html"), "utf8"),
  readFile(resolve(root, "styles.css"), "utf8"),
  readFile(resolve(root, "assets/kirana-hero.jpg")),
  ...modules.map((path) => readFile(resolve(root, path), "utf8")),
]);

const heroDataUri = `data:image/jpeg;base64,${heroImage.toString("base64")}`;
const bundle = sources.map((source, index) => `\n/* ${modules[index]} */\n${toClassicScript(source, modules[index])}`).join("\n").replaceAll("./assets/kirana-hero.jpg", heroDataUri);
if (/\bimport\s.+from\s+["']/.test(bundle) || /\bexport\s+(const|function|class|let|var)\b/.test(bundle)) {
  throw new Error("standalone build still contains module syntax");
}

const standalone = template
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/app.mjs"></script>', `<script>\n${bundle}\n</script>`);

if (standalone === template || /type="module"|src="\.\/src\/app\.mjs"/.test(standalone)) {
  throw new Error("standalone template replacement failed");
}

await writeFile(resolve(root, "kiranaflow-standalone.html"), standalone, "utf8");
console.log("Built kiranaflow-standalone.html");
