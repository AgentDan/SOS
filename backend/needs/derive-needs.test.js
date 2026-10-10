import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { computeNeeds } from "./inference-engine.js";
import { runMatching } from "./matching.js";
import { deriveNeeds } from "./derive-needs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");

function load(name) {
  return JSON.parse(readFileSync(path.join(dataDir, name), "utf8"));
}

function loadCatalog() {
  const dir = path.join(dataDir, "catalog");
  const types = JSON.parse(readFileSync(path.join(dir, "types.json"), "utf8"));
  const needs = JSON.parse(readFileSync(path.join(dir, "needs.json"), "utf8"));
  const skuDir = path.join(dir, "sku");
  const products = readdirSync(skuDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(skuDir, name), "utf8")));
  const typeIndex = new Map(types.map((type, index) => [type.id, index]));
  products.sort((a, b) => {
    const ai = typeIndex.has(a.type) ? typeIndex.get(a.type) : Number.MAX_SAFE_INTEGER;
    const bi = typeIndex.has(b.type) ? typeIndex.get(b.type) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    if (String(a.sku) < String(b.sku)) return -1;
    if (String(a.sku) > String(b.sku)) return 1;
    return 0;
  });
  return { draft: { types, needs, products } };
}

test("deriveNeeds matches computeNeeds followed by runMatching", () => {
  const questionnaire = load("questionnaire.json");
  const catalog = loadCatalog();
  const profile = {
    fields: {
      q_work_type: { value: "coding", source: "stated", confidence: "high" },
      q_back_pain: { value: "yes", source: "stated", confidence: "high" }
    },
    needs: [],
    rejectedNeeds: []
  };

  assert.deepEqual(
    deriveNeeds({ questionnaire, catalog, profile }),
    runMatching(catalog, computeNeeds(questionnaire, profile))
  );
});
