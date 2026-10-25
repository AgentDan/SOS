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
    rowBackMarginMm: 100,
    flankTypes: ["speaker"],
    frontTypes: ["keyboard", "mouse"],
    frontMarginMm: 150,
    accessoryGapMm: 100
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
const keyboard = product("KB-440", "keyboard", { width: 440, depth: 140, height: 25 });
const mouse = product("MOUSE-65", "mouse", { width: 65, depth: 110, height: 38 });
const speaker = product("SPK-100", "speaker", { width: 100, depth: 110, height: 200 });

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

const accessorySkus = [
  "DESK-LEGS-1400",
  "DESK-TOP-1800",
  "MON-613-366",
  "MON-613-367",
  "KB-440",
  "MOUSE-65",
  "SPK-100",
  "SPK-100"
];

function planBox(place, dimensions) {
  return {
    x0: place.x - dimensions.width / 2,
    x1: place.x + dimensions.width / 2,
    z0: place.z - dimensions.depth / 2,
    z1: place.z + dimensions.depth / 2
  };
}

function overlaps(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

test("keyboard, mouse and speakers sit on the desk without overlapping", () => {
  const products = [legs, top1800, monitor, monitorB, keyboard, mouse, speaker];
  const right = layout({
    catalog: catalogOf(...products),
    skus: accessorySkus,
    hand: "right"
  });
  const left = layout({
    catalog: catalogOf(...products),
    skus: accessorySkus,
    hand: "left"
  });

  assert.deepEqual(right.issues, []);
  assert.deepEqual(left.issues, []);
  assert.deepEqual(
    right.placements.map((item) => item.sku),
    accessorySkus
  );
  assert.deepEqual(
    left.placements.map((item) => item.sku),
    accessorySkus
  );

  assert.deepEqual(ofSku(right, "KB-440"), [{ sku: "KB-440", x: 0, y: 1030, z: 180, rotY: 0 }]);
  assert.deepEqual(ofSku(right, "MOUSE-65"), [{ sku: "MOUSE-65", x: 352.5, y: 1030, z: 180, rotY: 0 }]);
  assert.deepEqual(ofSku(left, "MOUSE-65"), [{ sku: "MOUSE-65", x: -352.5, y: 1030, z: 180, rotY: 0 }]);
  assert.deepEqual(ofSku(right, "SPK-100"), [
    { sku: "SPK-100", x: -813, y: 1030, z: -245, rotY: 0 },
    { sku: "SPK-100", x: 813, y: 1030, z: -245, rotY: 0 }
  ]);
  assert.deepEqual(ofSku(left, "SPK-100"), ofSku(right, "SPK-100"));

  const sizes = new Map(products.map((item) => [item.sku, item.dimensions]));
  for (const result of [right, left]) {
    const onDesk = result.placements.filter((item) => item.y === 1030);
    assert.equal(onDesk.length, 6);
    for (let i = 0; i < onDesk.length; i += 1) {
      for (let j = i + 1; j < onDesk.length; j += 1) {
        const a = planBox(onDesk[i], sizes.get(onDesk[i].sku));
        const b = planBox(onDesk[j], sizes.get(onDesk[j].sku));
        assert.equal(overlaps(a, b), false, `${onDesk[i].sku} overlaps ${onDesk[j].sku}`);
      }
    }
  }
});

test("a mouse without a keyboard is shifted 150 mm toward the working hand", () => {
  const alone = layout({
    catalog: catalogOf(legs, top1800, monitor, mouse),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MOUSE-65"],
    hand: "left"
  });
  assert.deepEqual(ofSku(alone, "MOUSE-65"), [{ sku: "MOUSE-65", x: -150, y: 1030, z: 195, rotY: 0 }]);
});

test("speakers without monitors stand 300 mm from the desk center", () => {
  const result = layout({
    catalog: catalogOf(legs, top1800, speaker),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800", "SPK-100", "SPK-100"]
  });
  assert.deepEqual(ofSku(result, "SPK-100").map((item) => item.x), [-300, 300]);
  assert.equal(ofSku(result, "SPK-100")[0].z, -245);
});

test("speakers that do not fit on the top are left unplaced", () => {
  const narrow = product("DESK-TOP-1800", "desk_top", { width: 1600, depth: 800, height: 30 });
  const result = layout({
    catalog: catalogOf(legs, narrow, monitor, monitorB, speaker),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MON-613-367", "SPK-100", "SPK-100"]
  });
  assert.equal(ofSku(result, "SPK-100").length, 0);
  assert.deepEqual(
    result.issues.filter((item) => item.sku === "SPK-100"),
    [
      { sku: "SPK-100", code: "row_overflow" },
      { sku: "SPK-100", code: "row_overflow" }
    ]
  );
  assert.equal(result.issues.some((item) => item.sku === "MON-613-366"), false);
});
