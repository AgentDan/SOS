import test from "node:test";
import assert from "node:assert/strict";
import { canPlace, canReplace } from "../commands/placement.js";
import { layout } from "../scene/layout.js";
import { runCheaper } from "../talk/cheaper.js";

function scene(skus) {
  const calls = [];
  return {
    skus,
    calls,
    apply: (change) => {
      calls.push(change);
      return { ok: true, sceneChanged: false };
    }
  };
}

const catalog = {
  types: [
    { id: "desk_legs", canHostOn: [] },
    {
      id: "desk_top",
      canHostOn: ["desk_legs"],
      rowTypes: ["monitor"],
      rowGapMm: 100,
      edgeMarginMm: 50
    },
    { id: "monitor", canHostOn: ["desk_top"] }
  ],
  products: [
    { sku: "LEGS", type: "desk_legs", priceEur: 79, alwaysPresent: true },
    { sku: "WIDE", type: "desk_top", priceEur: 259, dimensions: { width: 1800 } },
    { sku: "NARROW", type: "desk_top", priceEur: 189, dimensions: { width: 1400 } },
    { sku: "MON", type: "monitor", priceEur: 249, dimensions: { width: 613 } }
  ]
};

test("a cheaper desk is skipped when two monitors would not fit", () => {
  const crowded = scene(["LEGS", "WIDE", "MON", "MON"]);
  const refused = runCheaper({ catalog, scene: crowded, canReplace });
  assert.equal(refused.reasonCode, "nothing_cheaper");
  assert.deepEqual(crowded.calls, []);

  const room = scene(["LEGS", "WIDE", "MON"]);
  const swapped = runCheaper({ catalog, scene: room, canReplace });
  assert.equal(swapped.ok, true);
  assert.deepEqual(swapped.facts, {
    topic: "cheaper",
    sku: "WIDE",
    withSku: "NARROW",
    savedEur: 70
  });
  assert.deepEqual(room.calls, [{ op: "replace", sku: "WIDE", withSku: "NARROW" }]);
});

test("layout has no error for an item canPlace accepts by model size", () => {
  const types = [
    {
      id: "desk_top",
      rowTypes: ["monitor"],
      rowGapMm: 100,
      edgeMarginMm: 50,
      rowBackMarginMm: 100
    },
    { id: "monitor", canHostOn: ["desk_top"] }
  ];
  const top = {
    sku: "TOP",
    type: "desk_top",
    dimensions: { width: 1000, depth: 800, height: 30 },
    modelSizeMm: { width: 1800, height: 30, depth: 800 }
  };
  const monitor = {
    sku: "MON",
    type: "monitor",
    dimensions: { width: 900, depth: 400, height: 500 },
    modelSizeMm: { width: 400, height: 500, depth: 200 }
  };
  const fitted = { types, products: [top, monitor] };
  const placed = canPlace({ catalog: fitted, sceneSkus: ["TOP", "MON"], sku: "MON" });
  assert.equal(placed.ok, true);
  const result = layout({ catalog: fitted, skus: ["TOP", "MON", "MON"] });
  assert.equal(result.issues.some((item) => item.sku === "MON"), false);
  assert.equal(result.placements.filter((item) => item.sku === "MON").length, 2);

  const cards = {
    types,
    products: [
      { sku: "TOP", type: "desk_top", dimensions: { width: 1000, depth: 800, height: 30 } },
      { sku: "MON", type: "monitor", dimensions: { width: 900, depth: 400, height: 500 } }
    ]
  };
  assert.equal(canPlace({ catalog: cards, sceneSkus: ["TOP", "MON"], sku: "MON" }).ok, false);
});
