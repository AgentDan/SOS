import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "catalog.json");
const target = path.join(root, "data", "catalog");

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const raw = JSON.parse(readFileSync(source, "utf-8"));
mkdirSync(path.join(target, "sku"), { recursive: true });

writeJson(path.join(target, "_envelope.json"), {
  section: raw.section,
  draftVersion: raw.draftVersion,
  publishedVersion: raw.publishedVersion,
  history: raw.history,
  published: raw.published
});
writeJson(path.join(target, "types.json"), raw.draft.types);
writeJson(path.join(target, "needs.json"), raw.draft.needs);
for (const product of raw.draft.products) {
  writeJson(path.join(target, "sku", `${product.sku}.json`), product);
}

rmSync(source);
console.log("Migrated data/catalog.json to data/catalog/");
