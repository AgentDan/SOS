import test from "node:test";
import assert from "node:assert/strict";
import { formatDistance, gap } from "./distance.js";

function box(x, y, z, dimensions, rotY = 0) {
  return { placement: { x, y, z, rotY }, dimensions };
}

const cube = { width: 100, height: 100, depth: 100 };

test("touching boxes have gap 0 and are not an overlap", () => {
  const desk = box(0, 0, 0, { width: 100, height: 30, depth: 100 });
  const monitor = box(0, 30, 0, { width: 40, height: 40, depth: 40 });
  const touching = gap(desk, monitor);
  assert.equal(touching.gapMm, 0);
  assert.equal(touching.overlap, false);
  assert.deepEqual(touching.axes, { x: 0, y: 0, z: 0 });

  const turned = gap(
    box(0, 0, 0, cube, 180),
    box(0, 100, 0, cube, 180)
  );
  assert.equal(turned.gapMm, 0);
  assert.equal(turned.overlap, false);
});

test("intersection on all three axes is an overlap with gap 0", () => {
  const result = gap(box(0, 0, 0, cube), box(40, 10, 0, cube));
  assert.equal(result.overlap, true);
  assert.equal(result.gapMm, 0);
  assert.deepEqual(result.axes, { x: 0, y: 0, z: 0 });
});

test("a gap on one axis is that distance", () => {
  const result = gap(box(0, 0, 0, cube), box(200, 0, 0, cube));
  assert.equal(result.overlap, false);
  assert.equal(result.axes.x, 100);
  assert.equal(result.axes.y, 0);
  assert.equal(result.axes.z, 0);
  assert.equal(result.gapMm, 100);
});

test("gaps on two axes combine as a straight-line distance", () => {
  const result = gap(box(0, 0, 0, cube), box(130, 0, 140, cube));
  assert.equal(result.overlap, false);
  assert.equal(result.axes.x, 30);
  assert.equal(result.axes.y, 0);
  assert.equal(result.axes.z, 40);
  assert.equal(result.gapMm, 50);
});

test("unknown dimensions throw", () => {
  const placed = box(0, 0, 0, cube);
  assert.throws(() => gap(placed, { placement: { x: 0, y: 0, z: 0, rotY: 0 } }), /размеры/);
  assert.throws(
    () => gap(placed, { placement: { x: 0, y: 0, z: 0 }, dimensions: { width: 10, depth: 10 } }),
    /размеры/
  );
  assert.throws(() => gap(placed, { y: 0, z: 0, dimensions: cube }), /положен/);
});

test("formatDistance speaks centimeters", () => {
  assert.equal(formatDistance(0), "0 см, они касаются");
  assert.equal(formatDistance(4), "меньше 1 см");
  assert.equal(formatDistance(9.9), "меньше 1 см");
  assert.equal(formatDistance(10), "1 см");
  assert.equal(formatDistance(100), "10 см");
  assert.equal(formatDistance(120), "12 см");
  assert.throws(() => formatDistance(Number.NaN), /расстояни/);
});
