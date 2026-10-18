import test from "node:test";
import assert from "node:assert/strict";
import { layoutCopyXs } from "./copies.js";
import { enumerateInstances, instanceKey } from "./physics/registry.js";

const MONITOR = 613;

function layout(count, hostWidth, extra = {}) {
  return layoutCopyXs({
    count,
    itemWidth: MONITOR,
    hostWidth,
    offsetX: 0,
    ...extra
  });
}

function distinct(xs) {
  return new Set(xs).size === xs.length;
}

test("instance keys number each copy of a sku", () => {
  assert.equal(instanceKey("MON-613-366", 1), "MON-613-366#1");
  assert.deepEqual(
    enumerateInstances(["MON-613-366", "CHAIR-460", "MON-613-366"]).map((item) => item.id),
    ["MON-613-366#1", "CHAIR-460#1", "MON-613-366#2"]
  );
});

test("one copy stays on the placement offset", () => {
  assert.deepEqual(layout(1, 1400), [0]);
  assert.deepEqual(layout(1, 1800), [0]);
  assert.deepEqual(layout(1, 1800, { offsetX: 40 }), [40]);
});

test("two and three monitors spread across 1400 and 1800", () => {
  assert.deepEqual(layout(2, 1400), [-393.5, 393.5]);
  assert.deepEqual(layout(2, 1800), [-593.5, 593.5]);
  assert.deepEqual(layout(3, 1800), [-593.5, 0, 593.5]);
  assert.deepEqual(layout(3, 1400), [-393.5, 0, 393.5]);
  for (const hostWidth of [1400, 1800]) {
    for (const count of [2, 3]) {
      const xs = layout(count, hostWidth);
      assert.equal(distinct(xs), true, `${count} on ${hostWidth}`);
      const step = (hostWidth - MONITOR) / (count - 1);
      for (let i = 1; i < xs.length; i += 1) {
        assert.equal(xs[i] - xs[i - 1], step);
      }
    }
  }
});

test("copies that do not fit still spread instead of stacking", () => {
  const crowded = layout(3, 1400);
  assert.equal(distinct(crowded), true);
  assert.ok(MONITOR * 3 > 1400);

  const wider = layoutCopyXs({ count: 2, itemWidth: 600, hostWidth: 500, offsetX: 0 });
  assert.deepEqual(wider, [-50, 50]);

  const exact = layoutCopyXs({ count: 2, itemWidth: 400, hostWidth: 400, offsetX: 0 });
  assert.deepEqual(exact, [-100, 100]);
  assert.equal(distinct(exact), true);
});

test("removing a copy uses the layout of the copies that remain", () => {
  assert.deepEqual(layout(3, 1800), [-593.5, 0, 593.5]);
  assert.deepEqual(layout(2, 1800), [-593.5, 593.5]);
  assert.deepEqual(layout(1, 1800), [0]);
});

test("a foreign object pushes the group into the free gap", () => {
  const xs = layoutCopyXs({
    count: 2,
    itemWidth: 400,
    hostWidth: 2000,
    offsetX: 0,
    occupied: [{ x: 800, width: 400 }]
  });
  assert.deepEqual(xs, [-800, 400]);
  for (const x of xs) {
    const overlaps = Math.abs(x - 800) * 2 < 400 + 400;
    assert.equal(overlaps, false, x);
  }
});

test("a group with no free gap overlaps the host instead of stacking", () => {
  const xs = layoutCopyXs({
    count: 2,
    itemWidth: 400,
    hostWidth: 1000,
    offsetX: 0,
    occupied: [{ x: 0, width: 900 }]
  });
  assert.deepEqual(xs, [-300, 300]);
});
