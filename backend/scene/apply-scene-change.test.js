import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { applySceneChange } from "./apply-scene-change.js";
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
  return { draft: { types, needs, products } };
}

function emptyProfile() {
  return { needs: [] };
}

test("add puts a catalog sku on the scene", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "add", sku: "CHAIR-460" }
  });

  assert.deepEqual(result, {
    ok: true,
    reasonCode: null,
    sceneChanged: true,
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  });
  assert.deepEqual(profile.sceneEdits, [{ op: "add", sku: "CHAIR-460" }]);
});

test("add of a sku already on scene succeeds without a change", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "add", sku: "DESK-LEGS-1400" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, false);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.skus, ["DESK-LEGS-1400"]);
  assert.deepEqual(profile.sceneEdits, [{ op: "add", sku: "DESK-LEGS-1400" }]);
});

test("add of an unknown sku fails", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "add", sku: "MISSING-SKU" }
  });

  assert.deepEqual(result, {
    ok: false,
    reasonCode: "unknown_sku",
    sceneChanged: false,
    skus: ["DESK-LEGS-1400"]
  });
  assert.equal(profile.sceneEdits, undefined);
});

test("remove of a missing sku fails", () => {
  const result = applySceneChange({
    catalog: loadCatalog(),
    profile: emptyProfile(),
    change: { op: "remove", sku: "CHAIR-460" }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "not_found");
  assert.equal(result.sceneChanged, false);
});

test("remove of an always-present support fails", () => {
  const profile = emptyProfile();
  const result = applySceneChange({
    catalog: loadCatalog(),
    profile,
    change: { op: "remove", sku: "DESK-LEGS-1400" }
  });
  assert.equal(result.reasonCode, "cannot_remove_support");
  assert.equal(profile.sceneEdits, undefined);
});

test("remove takes a sku off the scene", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  applySceneChange({ catalog, profile, change: { op: "add", sku: "CHAIR-460" } });
  const result = applySceneChange({ catalog, profile, change: { op: "remove", sku: "CHAIR-460" } });
  assert.deepEqual(result, {
    ok: true,
    reasonCode: null,
    sceneChanged: true,
    skus: ["DESK-LEGS-1400"]
  });
  assert.deepEqual(profile.sceneEdits, [
    { op: "add", sku: "CHAIR-460" },
    { op: "remove", sku: "CHAIR-460" }
  ]);
});

test("replace of an unknown withSku fails", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  applySceneChange({ catalog, profile, change: { op: "add", sku: "CHAIR-460" } });
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "replace", sku: "CHAIR-460", withSku: "MISSING-SKU" }
  });
  assert.equal(result.reasonCode, "unknown_sku");
  assert.equal(profile.sceneEdits.length, 1);
});

test("replace of a sku that is not on scene fails", () => {
  const result = applySceneChange({
    catalog: loadCatalog(),
    profile: emptyProfile(),
    change: { op: "replace", sku: "CHAIR-460", withSku: "DESK-TOP-1800" }
  });
  assert.equal(result.reasonCode, "not_found");
});

test("replace of an always-present support fails", () => {
  const result = applySceneChange({
    catalog: loadCatalog(),
    profile: emptyProfile(),
    change: { op: "replace", sku: "DESK-LEGS-1400", withSku: "CHAIR-460" }
  });
  assert.equal(result.reasonCode, "cannot_remove_support");
});

test("replace swaps a sku on the scene", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  applySceneChange({ catalog, profile, change: { op: "add", sku: "CHAIR-460" } });
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "replace", sku: "CHAIR-460", withSku: "DESK-TOP-1800" }
  });
  assert.deepEqual(result, {
    ok: true,
    reasonCode: null,
    sceneChanged: true,
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800"]
  });
  assert.deepEqual(profile.sceneEdits.at(-1), {
    op: "replace",
    sku: "CHAIR-460",
    withSku: "DESK-TOP-1800"
  });
});

test("refresh without a profile change leaves the scene as it was", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  const before = computeScenePlan(catalog, profile);
  const result = applySceneChange({
    catalog,
    profile,
    change: { op: "refresh" },
    before
  });
  assert.deepEqual(result, {
    ok: true,
    reasonCode: null,
    sceneChanged: false,
    skus: before
  });
  assert.equal(profile.sceneEdits, undefined);
});

test("refresh sees a scene change that came from the profile", () => {
  const catalog = loadCatalog();
  const profile = emptyProfile();
  const before = computeScenePlan(catalog, profile);
  profile.needs = [{ id: "desk_top_wide", resolvedSku: "DESK-TOP-1800" }];
  const result = applySceneChange({ catalog, profile, change: { op: "refresh" }, before });
  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, true);
  assert.ok(result.skus.includes("DESK-TOP-1800"));
  assert.equal(profile.sceneEdits, undefined);
});

test("applySceneChange does not mutate the catalog", () => {
  const catalog = loadCatalog();
  const snapshot = structuredClone(catalog);
  applySceneChange({
    catalog,
    profile: emptyProfile(),
    change: { op: "add", sku: "CHAIR-460" }
  });
  assert.deepEqual(catalog, snapshot);
});
