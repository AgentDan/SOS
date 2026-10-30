import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { applySceneEdits, computeScenePlan } from "./scene-plan.js";

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

test("applySceneEdits adds a missing sku", () => {
  assert.deepEqual(applySceneEdits(["DESK-LEGS-1400"], [{ op: "add", sku: "CHAIR-460" }]), [
    "DESK-LEGS-1400",
    "CHAIR-460"
  ]);
});

test("applySceneEdits removes a sku", () => {
  assert.deepEqual(
    applySceneEdits(["DESK-LEGS-1400", "CHAIR-460"], [{ op: "remove", sku: "CHAIR-460" }]),
    ["DESK-LEGS-1400"]
  );
});

test("applySceneEdits replaces a sku in place", () => {
  assert.deepEqual(
    applySceneEdits(["DESK-LEGS-1400", "CHAIR-460"], [
      { op: "replace", sku: "CHAIR-460", withSku: "DESK-TOP-1800" }
    ]),
    ["DESK-LEGS-1400", "DESK-TOP-1800"]
  );
});

test("applySceneEdits skips a replace when the sku is missing", () => {
  const skus = ["DESK-LEGS-1400"];
  assert.deepEqual(
    applySceneEdits(skus, [{ op: "replace", sku: "CHAIR-460", withSku: "DESK-TOP-1800" }]),
    ["DESK-LEGS-1400"]
  );
  assert.deepEqual(skus, ["DESK-LEGS-1400"]);
});

test("applySceneEdits keeps copies, removes the last one, and replaces the first", () => {
  const base = ["DESK-LEGS-1400"];
  const two = [
    { op: "add", sku: "MON-613-366" },
    { op: "add", sku: "MON-613-366" }
  ];
  assert.deepEqual(applySceneEdits(base, two), [
    "DESK-LEGS-1400",
    "MON-613-366",
    "MON-613-366"
  ]);
  assert.deepEqual(applySceneEdits(base, [...two, { op: "remove", sku: "MON-613-366" }]), [
    "DESK-LEGS-1400",
    "MON-613-366"
  ]);
  assert.deepEqual(
    applySceneEdits(base, [...two, { op: "replace", sku: "MON-613-366", withSku: "CHAIR-460" }]),
    ["DESK-LEGS-1400", "CHAIR-460", "MON-613-366"]
  );
});

test("applySceneEdits ignores an unknown op", () => {
  assert.deepEqual(
    applySceneEdits(["DESK-LEGS-1400"], [
      { op: "move", sku: "DESK-LEGS-1400" },
      { op: "add", sku: "CHAIR-460" }
    ]),
    ["DESK-LEGS-1400", "CHAIR-460"]
  );
});

test("computeScenePlan without sceneEdits matches the needs-only plan", () => {
  const profile = {
    needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }]
  };
  const skus = computeScenePlan(loadCatalog(), profile);
  assert.ok(skus.includes("DESK-LEGS-1400"));
  assert.ok(skus.includes("DESK-TOP-1800"));
  assert.equal(skus.includes("CHAIR-460"), false);
});

test("accessory needs stay off the scene until they are resolved or a command adds them", () => {
  const catalog = loadCatalog();
  const products = catalog.draft.products;
  for (const type of ["keyboard", "mouse", "speaker"]) {
    const items = products.filter((product) => product.type === type);
    assert.ok(items.length > 0);
    for (const item of items) assert.notEqual(item.alwaysPresent, true);
    assert.equal(
      catalog.draft.needs.some((need) => need.criteria?.type === type),
      true
    );
  }
  const planned = computeScenePlan(catalog, {
    needs: [
      { id: "desk_top_wide", resolvedSku: "DESK-TOP-1800" },
      { id: "ergonomic_chair", resolvedSku: "CHAIR-460" }
    ]
  });
  assert.equal(planned.includes("KB-440"), false);
  assert.equal(planned.includes("MOUSE-65"), false);
  assert.equal(planned.includes("SPK-100"), false);
  const kept = computeScenePlan(catalog, {
    needs: [{ id: "desk_top_wide", resolvedSku: "DESK-TOP-1800" }],
    sceneEdits: [
      { op: "add", sku: "KB-440" },
      { op: "add", sku: "MOUSE-65" },
      { op: "add", sku: "SPK-100" }
    ]
  });
  assert.ok(kept.includes("KB-440"));
  assert.ok(kept.includes("MOUSE-65"));
  assert.ok(kept.includes("SPK-100"));
});

test("the questionnaire monitor is one copy and an add makes the second", () => {
  const catalog = loadCatalog();
  const monitor = catalog.draft.products.find((product) => product.type === "monitor");
  const planned = computeScenePlan(catalog, {
    needs: [{ id: "monitor_main", resolvedSku: monitor.sku }]
  });
  assert.equal(planned.filter((sku) => sku === monitor.sku).length, 1);
  const second = computeScenePlan(catalog, {
    needs: [{ id: "monitor_main", resolvedSku: monitor.sku }],
    sceneEdits: [{ op: "add", sku: monitor.sku }]
  });
  assert.equal(second.filter((sku) => sku === monitor.sku).length, 2);
});

test("computeScenePlan applies sceneEdits after the needs plan", () => {
  const skus = computeScenePlan(loadCatalog(), {
    needs: [{ id: "desk_top_wide", resolvedSku: "DESK-TOP-1800" }],
    sceneEdits: [
      { op: "add", sku: "CHAIR-460" },
      { op: "remove", sku: "DESK-TOP-1800" }
    ]
  });
  assert.deepEqual(skus, ["DESK-LEGS-1400", "CHAIR-460"]);
});
