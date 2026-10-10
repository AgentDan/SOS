import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveNeed, runMatching } from "./matching.js";

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

test("desk_top_wide resolves to the wide top, not DESK-TOP-1400", () => {
  const sku = resolveNeed(loadCatalog(), "desk_top_wide");
  assert.equal(sku, "DESK-TOP-1800");
  assert.notEqual(sku, "DESK-TOP-1400");
});

test("ergonomic_chair resolves to CHAIR-460", () => {
  assert.equal(resolveNeed(loadCatalog(), "ergonomic_chair"), "CHAIR-460");
});

test("unknown need resolves to null", () => {
  assert.equal(resolveNeed(loadCatalog(), "unknown_need"), null);
});

test("runMatching leaves an already resolved sku unchanged", () => {
  const needs = [
    { id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1400" }
  ];
  const result = runMatching(loadCatalog(), needs);
  assert.equal(result[0].resolvedSku, "DESK-TOP-1400");
  assert.equal(needs[0].resolvedSku, "DESK-TOP-1400");
  assert.notEqual(result, needs);
});

test("runMatching resolves each unresolved need independently", () => {
  const needs = [
    { id: "desk_top_wide", confidence: "medium", resolvedSku: null },
    { id: "ergonomic_chair", confidence: "high", resolvedSku: null }
  ];
  const result = runMatching(loadCatalog(), needs);
  assert.deepEqual(result, [
    { id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" },
    { id: "ergonomic_chair", confidence: "high", resolvedSku: "CHAIR-460" }
  ]);
  assert.equal(needs[0].resolvedSku, null);
  assert.equal(needs[1].resolvedSku, null);
});

const DESK_TOP_WIDE = {
  id: "desk_top_wide",
  name: "Широкая столешница",
  why: "",
  criteria: { type: "desk_top", minWidth: 1600 }
};

test("resolveNeed returns null when no product meets minWidth", () => {
  const catalog = {
    draft: {
      needs: [DESK_TOP_WIDE],
      products: [
        {
          sku: "DESK-TOP-1400",
          type: "desk_top",
          dimensions: { width: 1400, depth: 700, height: 30 }
        },
        {
          sku: "DESK-TOP-1500",
          type: "desk_top",
          dimensions: { width: 1500, depth: 800, height: 30 }
        }
      ]
    }
  };
  assert.equal(resolveNeed(catalog, "desk_top_wide"), null);
});

test("resolveNeed picks the narrowest product that still meets minWidth", () => {
  const catalog = {
    draft: {
      needs: [DESK_TOP_WIDE],
      products: [
        {
          sku: "DESK-TOP-2000",
          type: "desk_top",
          dimensions: { width: 2000, depth: 800, height: 30 }
        },
        {
          sku: "DESK-TOP-1600",
          type: "desk_top",
          dimensions: { width: 1600, depth: 800, height: 30 }
        },
        {
          sku: "DESK-TOP-1400",
          type: "desk_top",
          dimensions: { width: 1400, depth: 700, height: 30 }
        }
      ]
    }
  };
  assert.equal(resolveNeed(catalog, "desk_top_wide"), "DESK-TOP-1600");
});
