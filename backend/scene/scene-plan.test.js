import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { computeScenePlan } from "./scene-plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = path.join(__dirname, "..", "..", "data", "catalog");

function loadCatalog() {
  const types = JSON.parse(readFileSync(path.join(CATALOG_DIR, "types.json"), "utf-8"));
  const needs = JSON.parse(readFileSync(path.join(CATALOG_DIR, "needs.json"), "utf-8"));
  const skuDir = path.join(CATALOG_DIR, "sku");
  const products = readdirSync(skuDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(skuDir, name), "utf-8")));
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

test("empty profile returns only the always-present legs", () => {
  const skus = computeScenePlan(loadCatalog(), { needs: [] });
  assert.deepEqual(skus, ["DESK-LEGS-1400"]);
});

test("resolved desk top is listed together with the anchored legs", () => {
  const skus = computeScenePlan(loadCatalog(), {
    needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }]
  });
  assert.ok(skus.includes("DESK-LEGS-1400"));
  assert.ok(skus.includes("DESK-TOP-1800"));
});

test("unresolved need is left off the scene plan", () => {
  const skus = computeScenePlan(loadCatalog(), {
    needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: null }]
  });
  assert.deepEqual(skus, ["DESK-LEGS-1400"]);
  assert.equal(skus.includes(null), false);
});

test("the same resolved sku is listed once", () => {
  const skus = computeScenePlan(loadCatalog(), {
    needs: [
      { id: "need_a", resolvedSku: "DESK-TOP-1800" },
      { id: "need_b", resolvedSku: "DESK-TOP-1800" }
    ]
  });
  assert.equal(skus.filter((sku) => sku === "DESK-TOP-1800").length, 1);
  assert.equal(skus.filter((sku) => sku === "DESK-LEGS-1400").length, 1);
});
