import test from "node:test";
import assert from "node:assert/strict";
import { firstReplacement, isProtected, resolveTarget, sceneAtMax, typeAtMax } from "./limits.js";

const catalog = {
  types: [
    { id: "desk_top", maxOnScene: 1 },
    { id: "chair", maxOnScene: 2 }
  ],
  products: [
    { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true },
    { sku: "DESK-TOP-1400", type: "desk_top" },
    { sku: "DESK-TOP-1800", type: "desk_top" },
    { sku: "MON-613-366", type: "monitor", placement: { hostSku: "DESK-TOP-1400" } },
    { sku: "CHAIR-460", type: "chair" }
  ]
};

test("resolveTarget falls back to another sku of the same type", () => {
  assert.equal(
    resolveTarget("DESK-TOP-1400", ["DESK-LEGS-1400", "DESK-TOP-1800"], catalog),
    "DESK-TOP-1800"
  );
});

test("isProtected flags alwaysPresent and a host with cargo", () => {
  assert.equal(isProtected("DESK-LEGS-1400", catalog, ["DESK-LEGS-1400"]).blocked, true);
  const hosted = isProtected("DESK-TOP-1400", catalog, [
    "DESK-TOP-1400",
    "MON-613-366"
  ]);
  assert.equal(hosted.blocked, true);
  assert.deepEqual(hosted.hosted, ["MON-613-366"]);
});

test("typeAtMax and sceneAtMax report the cap", () => {
  assert.deepEqual(typeAtMax(["DESK-TOP-1800"], catalog, "desk_top"), {
    type: "desk_top",
    max: 1
  });
  assert.equal(typeAtMax(["CHAIR-460"], catalog, "chair"), null);
  assert.deepEqual(sceneAtMax(["A", "B"], { maxItems: 2 }), { max: 2 });
  assert.equal(sceneAtMax(["A"], { maxItems: 2 }), null);
});

test("firstReplacement skips skus already on scene", () => {
  assert.equal(firstReplacement(catalog, "desk_top", ["DESK-TOP-1400"]).sku, "DESK-TOP-1800");
  assert.equal(firstReplacement(catalog, "chair", ["CHAIR-460"]), undefined);
});
