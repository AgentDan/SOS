import test from "node:test";
import assert from "node:assert/strict";
import { firstReplacement, isProtected, resolveTarget, typeAtMax } from "./limits.js";

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

test("a second copy of a support may be removed", () => {
  const hosted = isProtected("DESK-TOP-1400", catalog, [
    "DESK-TOP-1400",
    "DESK-TOP-1400",
    "MON-613-366"
  ]);
  assert.equal(hosted.blocked, false);
  assert.deepEqual(hosted.hosted, ["MON-613-366"]);
  assert.equal(
    isProtected("DESK-LEGS-1400", catalog, ["DESK-LEGS-1400", "DESK-LEGS-1400"]).blocked,
    false
  );
});

test("typeAtMax reports the cap and ignores a type without maxOnScene", () => {
  assert.deepEqual(typeAtMax(["DESK-TOP-1800"], catalog, "desk_top"), {
    type: "desk_top",
    max: 1
  });
  assert.equal(typeAtMax(["CHAIR-460"], catalog, "chair"), null);
  const open = {
    types: [{ id: "monitor" }],
    products: [{ sku: "MON-613-366", type: "monitor" }]
  };
  assert.equal(typeAtMax(["MON-613-366", "MON-613-366", "MON-613-366"], open, "monitor"), null);
});

test("the last desk is protected when a monitor depends on its type", () => {
  const typed = {
    types: [
      { id: "desk_top", canHostOn: ["desk_legs"] },
      { id: "monitor", canHostOn: ["desk_top"] }
    ],
    products: [
      { sku: "DESK-TOP-1800", type: "desk_top" },
      { sku: "DESK-TOP-1400", type: "desk_top" },
      { sku: "MON-613-366", type: "monitor", placement: { hostSku: "DESK-TOP-1400" } }
    ]
  };
  const last = isProtected("DESK-TOP-1800", typed, ["DESK-TOP-1800", "MON-613-366"]);
  assert.equal(last.blocked, true);
  assert.deepEqual(last.hosted, ["MON-613-366"]);

  const earlier = isProtected("DESK-TOP-1800", typed, [
    "DESK-TOP-1800",
    "DESK-TOP-1400",
    "MON-613-366"
  ]);
  assert.equal(earlier.blocked, false);
  assert.deepEqual(earlier.hosted, []);
});

test("firstReplacement takes another sku of the same type", () => {
  assert.equal(firstReplacement(catalog, "desk_top", "DESK-TOP-1400").sku, "DESK-TOP-1800");
  assert.equal(firstReplacement(catalog, "desk_top", "DESK-TOP-1800").sku, "DESK-TOP-1400");
  assert.equal(firstReplacement(catalog, "chair", "CHAIR-460"), undefined);
});
