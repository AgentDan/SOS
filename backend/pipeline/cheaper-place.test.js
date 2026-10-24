import test from "node:test";
import assert from "node:assert/strict";
import { canReplace } from "../commands/placement.js";
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
