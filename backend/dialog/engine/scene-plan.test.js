import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { computeScenePlan } from "./scene-plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "..", "..", "..", "storage", "config", "catalog.json");

function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
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
