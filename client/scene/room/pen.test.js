import test from "node:test";
import assert from "node:assert/strict";
import { PENS, createPen, seededRandom } from "./pen.js";

function snapshot(seed) {
  const pen = createPen(seed);
  pen.stroke("main", [0, 0, 0], [1.4, 0.1, 0], { ghost: true });
  pen.rawStroke("second", [0, 1, 0], [0, 1.4, 0.2]);
  pen.polyline("vein", [
    [0, 0, 0],
    [0.2, 0, 0.1],
    [0.35, 0.01, 0.22]
  ]);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 1, 0], 0.4, 0.12, { step: 0.05 });
  const drawn = pen.result();
  const plain = {};
  for (const name of Object.keys(drawn)) plain[name] = Array.from(drawn[name]);
  return plain;
}

function gapCount(positions) {
  if (!positions) return 0;
  let gaps = 0;
  for (let i = 6; i < positions.length; i += 6) {
    const distance = Math.hypot(
      positions[i - 3] - positions[i],
      positions[i - 2] - positions[i + 1],
      positions[i - 1] - positions[i + 2]
    );
    if (distance > 0.008) gaps += 1;
  }
  return gaps;
}

test("one seed repeats the same strokes", () => {
  const left = seededRandom(11);
  const right = seededRandom(11);
  assert.equal(left(), right());
  assert.equal(left(), right());
  const sample = seededRandom(3);
  for (let i = 0; i < 8; i++) {
    const value = sample();
    assert.ok(value >= 0 && value < 1);
  }
  assert.deepEqual(snapshot(7), snapshot(7));
});

test("another seed draws a different stroke", () => {
  assert.notDeepEqual(snapshot(7), snapshot(8));
});

test("pens keep the sketch weights", () => {
  assert.deepEqual(PENS, {
    main: { width: 1.55, opacity: 0.95 },
    second: { width: 1.1, opacity: 0.67 },
    light: { width: 0.9, opacity: 0.43 },
    ghost: { width: 0.85, opacity: 0.25 },
    hatch: { width: 0.75, opacity: 0.35 },
    vein: { width: 0.7, opacity: 0.35 }
  });
});

test("a zero-length raw stroke adds nothing", () => {
  const pen = createPen(3);
  pen.rawStroke("main", [1, 2, 3], [1, 2, 3]);
  pen.rawStroke("light", [0, 0, 0], [5e-5, 0, 0]);
  assert.deepEqual(pen.result(), {});
});

test("stored strokes are pairs of points", () => {
  const pen = createPen(9);
  pen.stroke("main", [0, 0, 0], [1.5, 0.2, 0]);
  pen.polyline("vein", [
    [0, 0, 0],
    [0.2, 0, 0.1],
    [0.3, 0.02, 0.05]
  ]);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 0, 1], 0.5, 0.1, { step: 0.05 });
  const drawn = pen.result();
  const names = Object.keys(drawn);
  assert.ok(names.length > 0);
  for (const positions of Object.values(drawn)) {
    assert.ok(positions instanceof Float32Array);
    assert.equal(positions.length % 6, 0);
    assert.ok(positions.length >= 6);
  }
});

test("a stroke longer than 1.2 m breaks for a fitting seed", () => {
  let found = null;
  for (let seed = 1; seed <= 80; seed++) {
    const openPen = createPen(seed);
    openPen.stroke("main", [0, 0, 0], [2, 0, 0]);
    const shutPen = createPen(seed);
    shutPen.stroke("main", [0, 0, 0], [2, 0, 0], { breaks: false });
    const open = openPen.result().main;
    const shut = shutPen.result().main;
    if (gapCount(open) > 0) {
      found = seed;
      assert.equal(gapCount(shut), 0);
      assert.equal(shut.length / 6, 8);
      break;
    }
  }
  assert.ok(found, "no seed lifted the pen");
});

test("strokes up to 1.2 m stay whole", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const pen = createPen(seed);
    pen.stroke("main", [0, 0, 0], [1.2, 0, 0]);
    assert.equal(gapCount(pen.result().main), 0, `seed ${seed}`);
  }
});

test("long strokes break on at most about a fifth of a fixed sample", () => {
  let breaks = 0;
  for (let i = 0; i < 200; i++) {
    const pen = createPen(9000 + i);
    pen.stroke("main", [0, 0, 0], [2, 0, 0]);
    if (gapCount(pen.result().main) > 0) breaks += 1;
  }
  assert.ok(breaks > 0, "expected at least one break");
  assert.ok(breaks / 200 <= 0.2, `breaks ${breaks}/200`);
});

test("hatchBand with zero width does nothing", () => {
  const pen = createPen(5);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 1, 0], 0, 0.2);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 0.2, { step: 0 });
  assert.deepEqual(pen.result(), {});
});
