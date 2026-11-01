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

function segmentCount(seed, allowBreaks) {
  const pen = createPen(seed);
  pen.stroke("main", [0, 0, 0], [1, 0, 0], allowBreaks ? {} : { breaks: false });
  const drawn = pen.result().main;
  assert.ok(drawn);
  assert.equal(drawn.length % 6, 0);
  return drawn.length / 6;
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
    main: { width: 1.55, opacity: 0.92 },
    second: { width: 1.1, opacity: 0.62 },
    light: { width: 0.9, opacity: 0.38 },
    ghost: { width: 0.85, opacity: 0.2 },
    hatch: { width: 0.75, opacity: 0.3 },
    vein: { width: 0.7, opacity: 0.3 }
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

test("a stroke longer than 0.9 m breaks for a fitting seed", () => {
  let found = null;
  for (let seed = 1; seed <= 40; seed++) {
    const open = segmentCount(seed, true);
    const shut = segmentCount(seed, false);
    if (open !== shut) {
      found = { seed, open, shut };
      break;
    }
  }
  assert.ok(found, "no seed lifted the pen");
  assert.equal(found.shut, 4);
  assert.equal(found.open, 6);
});

test("hatchBand with zero width does nothing", () => {
  const pen = createPen(5);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 1, 0], 0, 0.2);
  pen.hatchBand([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 0.2, { step: 0 });
  assert.deepEqual(pen.result(), {});
});
