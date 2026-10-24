import test from "node:test";
import assert from "node:assert/strict";
import { layout } from "./layout.js";

const types = [
  { id: "desk_legs" },
  {
    id: "desk_top",
    rowTypes: ["monitor"],
    rowGapMm: 100,
    edgeMarginMm: 50,
    rowBackMarginMm: 100
  },
  { id: "monitor" },
  { id: "chair" }
];

function product(sku, type, dimensions, extra) {
  return { sku, type, dimensions, ...extra };
}

const legs = product("DESK-LEGS-1400", "desk_legs", { width: 1400, depth: 700, height: 1000 });
const top1400 = product("DESK-TOP-1400", "desk_top", { width: 1400, depth: 700, height: 30 });
const top1800 = product("DESK-TOP-1800", "desk_top", { width: 1800, depth: 800, height: 30 });
const monitor = product("MON-613-366", "monitor", { width: 613, depth: 205, height: 366 }, {
  placement: { hostSku: "MISSING" }
});
const monitorB = product("MON-613-367", "monitor", { width: 613, depth: 205, height: 366 });
const chair = product("CHAIR-460", "chair", { width: 460, depth: 520, height: 900 }, {
  placement: { offset: { x: 0, z: 760 } }
});

function catalogOf(...products) {
  return { types, products };
}

function ofSku(result, sku) {
  return result.placements.filter((item) => item.sku === sku);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

test("a 1400 desk places one monitor against the back margin", () => {
  const result = layout({
    catalog: catalogOf(legs, top1400, monitor),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"]
  });
  assert.deepEqual(ofSku(result, "DESK-LEGS-1400"), [
    { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 }
  ]);
  assert.deepEqual(ofSku(result, "DESK-TOP-1400"), [
    { sku: "DESK-TOP-1400", x: 0, y: 1000, z: 0, rotY: 0 }
  ]);
  assert.deepEqual(ofSku(result, "MON-613-366"), [
    { sku: "MON-613-366", x: 0, y: 1030, z: -350 + 100 + 102.5, rotY: 0 }
  ]);
  assert.deepEqual(result.issues, []);
});

test("two monitors on an 1800 desk are symmetric and follow sku order", () => {
  const width = 613;
  const gap = 100;
  const total = width * 2 + gap;
  const left = -total / 2 + width / 2;
  assert.equal(left, -356.5);

  const forward = layout({
    catalog: catalogOf(legs, top1800, monitor, monitorB),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MON-613-367"]
  });
  const reversed = layout({
    catalog: catalogOf(legs, top1800, monitor, monitorB),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-367", "MON-613-366"]
  });

  assert.deepEqual(ofSku(forward, "MON-613-366").map((item) => item.x), [left]);
  assert.deepEqual(ofSku(forward, "MON-613-367").map((item) => item.x), [-left]);
  assert.deepEqual(ofSku(reversed, "MON-613-367").map((item) => item.x), [left]);
  assert.deepEqual(ofSku(reversed, "MON-613-366").map((item) => item.x), [-left]);
  assert.deepEqual(
    forward.placements.map((item) => item.x).sort((a, b) => a - b),
    reversed.placements.map((item) => item.x).sort((a, b) => a - b)
  );
});

test("the same inputs always produce the same layout", () => {
  const catalog = deepFreeze(catalogOf(legs, top1800, monitor, monitorB, chair));
  const skus = Object.freeze([
    "DESK-LEGS-1400",
    "DESK-TOP-1800",
    "MON-613-367",
    "CHAIR-460",
    "MON-613-366"
  ]);
  assert.deepEqual(layout({ catalog, skus }), layout({ catalog, skus }));
});

test("a monitor without a desk top is reported and not placed", () => {
  const result = layout({
    catalog: catalogOf(legs, monitor),
    skus: ["DESK-LEGS-1400", "MON-613-366"]
  });
  assert.deepEqual(result.placements, [{ sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 }]);
  assert.deepEqual(result.issues, [{ sku: "MON-613-366", code: "no_host" }]);
});

test("only the first chair is placed, facing the desk", () => {
  const placed = layout({
    catalog: catalogOf(chair),
    skus: ["CHAIR-460", "CHAIR-460"]
  });
  assert.deepEqual(placed.placements, [{ sku: "CHAIR-460", x: 0, y: 0, z: 760, rotY: 180 }]);
  assert.deepEqual(placed.issues, [{ sku: "CHAIR-460", code: "no_layout_rule" }]);

  const bare = product("CHAIR-460", "chair", { width: 460, depth: 520, height: 900 });
  const origin = layout({ catalog: catalogOf(bare), skus: ["CHAIR-460"] });
  assert.equal(origin.placements[0].z, 0);
  assert.equal(origin.placements[0].rotY, 180);
});

test("a row wider than the desk is still centered and marked overflow", () => {
  const narrow = product("DESK-TOP-1400", "desk_top", { width: 400, depth: 700, height: 30 });
  const result = layout({
    catalog: catalogOf(legs, narrow, monitor),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"]
  });
  assert.equal(ofSku(result, "MON-613-366")[0].x, 0);
  assert.deepEqual(result.issues, [{ sku: "MON-613-366", code: "row_overflow" }]);
});

test("legs and a desk top without a monitor are both placed", () => {
  const result = layout({
    catalog: catalogOf(legs, top1400),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400"]
  });
  assert.deepEqual(result.placements, [
    { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 },
    { sku: "DESK-TOP-1400", x: 0, y: 1000, z: 0, rotY: 0 }
  ]);
  assert.deepEqual(result.issues, []);
});

test("a desk top without legs stands on the floor, and a second top has no rule", () => {
  const alone = layout({
    catalog: catalogOf(top1400, monitor),
    skus: ["DESK-TOP-1400", "MON-613-366"]
  });
  assert.equal(ofSku(alone, "DESK-TOP-1400")[0].y, 0);
  assert.equal(ofSku(alone, "MON-613-366")[0].y, 30);

  const second = product("DESK-TOP-1800", "desk_top", { width: 1800, depth: 800, height: 30 });
  const extra = layout({
    catalog: catalogOf(legs, top1400, second),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400", "DESK-TOP-1800"]
  });
  assert.deepEqual(extra.issues, [{ sku: "DESK-TOP-1800", code: "no_layout_rule" }]);
  assert.equal(ofSku(extra, "DESK-TOP-1800").length, 0);
});
