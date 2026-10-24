import test from "node:test";
import assert from "node:assert/strict";
import { validateErgonomics } from "./ergonomics.js";

function envelope(draft) {
  return {
    section: "ergonomics",
    draftVersion: 1,
    publishedVersion: 1,
    history: [],
    draft,
    published: draft
  };
}

function goodDraft() {
  return {
    bounds: { heightMinCm: 140, heightMaxCm: 210 },
    defaults: { heightCm: 175, hand: "right" }
  };
}

function errorsOf(data) {
  const errors = [];
  validateErgonomics(data, errors);
  return errors;
}

test("shipped ergonomics shape is accepted", () => {
  assert.deepEqual(errorsOf(envelope(goodDraft())), []);
});

test("height bounds must be integers from 100 to 250 with min below max", () => {
  const low = goodDraft();
  low.bounds.heightMinCm = 99;
  assert.ok(errorsOf(envelope(low)).some((line) => line.includes("bounds.heightMinCm")));

  const high = goodDraft();
  high.bounds.heightMaxCm = 251;
  assert.ok(errorsOf(envelope(high)).some((line) => line.includes("bounds.heightMaxCm")));

  const fraction = goodDraft();
  fraction.bounds.heightMinCm = 140.5;
  assert.ok(errorsOf(envelope(fraction)).some((line) => line.includes("bounds.heightMinCm")));

  const reversed = goodDraft();
  reversed.bounds.heightMinCm = 180;
  reversed.bounds.heightMaxCm = 170;
  assert.ok(errorsOf(envelope(reversed)).some((line) => line.includes("less than")));

  const equal = goodDraft();
  equal.bounds.heightMinCm = 175;
  equal.bounds.heightMaxCm = 175;
  assert.ok(errorsOf(envelope(equal)).some((line) => line.includes("less than")));
});

test("default height must be an integer inside bounds and hand must be right or left", () => {
  const outside = goodDraft();
  outside.defaults.heightCm = 139;
  assert.ok(errorsOf(envelope(outside)).some((line) => line.includes("defaults.heightCm")));

  const fraction = goodDraft();
  fraction.defaults.heightCm = 175.5;
  assert.ok(errorsOf(envelope(fraction)).some((line) => line.includes("defaults.heightCm")));

  const edges = goodDraft();
  edges.defaults.heightCm = 140;
  edges.defaults.hand = "left";
  assert.deepEqual(errorsOf(envelope(edges)), []);
  edges.defaults.heightCm = 210;
  assert.deepEqual(errorsOf(envelope(edges)), []);

  const hand = goodDraft();
  hand.defaults.hand = "both";
  assert.ok(errorsOf(envelope(hand)).some((line) => line.includes("defaults.hand")));
});

test("mannequin is optional and, when set, needs a string sku and a height from 100 to 250", () => {
  const withMannequin = goodDraft();
  withMannequin.mannequin = { sku: "character", referenceHeightCm: 142 };
  assert.deepEqual(errorsOf(envelope(withMannequin)), []);

  const missingSku = goodDraft();
  missingSku.mannequin = { referenceHeightCm: 142 };
  assert.ok(errorsOf(envelope(missingSku)).some((line) => line.includes("mannequin.sku")));

  const low = goodDraft();
  low.mannequin = { sku: "character", referenceHeightCm: 99 };
  assert.ok(errorsOf(envelope(low)).some((line) => line.includes("referenceHeightCm")));

  const fraction = goodDraft();
  fraction.mannequin = { sku: "character", referenceHeightCm: 142.5 };
  assert.ok(errorsOf(envelope(fraction)).some((line) => line.includes("referenceHeightCm")));

  const notObject = goodDraft();
  notObject.mannequin = "character";
  assert.ok(errorsOf(envelope(notObject)).some((line) => line.includes("mannequin must be an object")));
});

function table(overrides = {}) {
  return {
    seatHeightFactor: 2.6,
    deskHeightFactor: 4.15,
    eyeAboveSeatFactor: 4.57,
    monitorDistanceFactor: 3.4,
    monitorDistanceMinMm: 500,
    monitorDistanceMaxMm: 700,
    tolerance: { deskHeightMm: 60, monitorDistanceMm: 100, monitorTopMm: 80 },
    ...overrides
  };
}

test("table is optional and, when set, uses positive factors, min below max, and a non-negative tolerance", () => {
  const withTable = goodDraft();
  withTable.table = table();
  assert.deepEqual(errorsOf(envelope(withTable)), []);

  const forward = goodDraft();
  forward.table = table({ eyeForwardMm: 150 });
  assert.deepEqual(errorsOf(envelope(forward)), []);

  const zeros = goodDraft();
  zeros.table = table({
    tolerance: { deskHeightMm: 0, monitorDistanceMm: 0, monitorTopMm: 0 }
  });
  assert.deepEqual(errorsOf(envelope(zeros)), []);
});

test("table rejects a non-object, non-positive numbers, a reversed range, and a bad tolerance", () => {
  const missing = goodDraft();
  missing.table = table();
  delete missing.table.seatHeightFactor;
  assert.ok(errorsOf(envelope(missing)).some((line) => line.includes("table.seatHeightFactor")));

  const zero = goodDraft();
  zero.table = table({ deskHeightFactor: 0 });
  assert.ok(errorsOf(envelope(zero)).some((line) => line.includes("table.deskHeightFactor")));

  const text = goodDraft();
  text.table = table({ monitorDistanceFactor: "3.4" });
  assert.ok(errorsOf(envelope(text)).some((line) => line.includes("table.monitorDistanceFactor")));

  const reversed = goodDraft();
  reversed.table = table({ monitorDistanceMinMm: 700, monitorDistanceMaxMm: 500 });
  assert.ok(errorsOf(envelope(reversed)).some((line) => line.includes("less than")));

  const equal = goodDraft();
  equal.table = table({ monitorDistanceMinMm: 500, monitorDistanceMaxMm: 500 });
  assert.ok(errorsOf(envelope(equal)).some((line) => line.includes("less than")));

  const forward = goodDraft();
  forward.table = table({ eyeForwardMm: 0 });
  assert.ok(errorsOf(envelope(forward)).some((line) => line.includes("table.eyeForwardMm")));

  const negative = goodDraft();
  negative.table = table({
    tolerance: { deskHeightMm: -1, monitorDistanceMm: 100, monitorTopMm: 80 }
  });
  assert.ok(errorsOf(envelope(negative)).some((line) => line.includes("tolerance.deskHeightMm")));

  const gap = goodDraft();
  gap.table = table();
  delete gap.table.tolerance.monitorTopMm;
  assert.ok(errorsOf(envelope(gap)).some((line) => line.includes("tolerance.monitorTopMm")));

  const noTolerance = goodDraft();
  noTolerance.table = table({ tolerance: null });
  assert.ok(errorsOf(envelope(noTolerance)).some((line) => line.includes("table.tolerance must be an object")));

  const list = goodDraft();
  list.table = [];
  assert.ok(errorsOf(envelope(list)).some((line) => line.includes("table must be an object")));
});

test("mannequin.offsetMm is optional and, when set, is three numbers from -500 to 500", () => {
  const omitted = goodDraft();
  omitted.mannequin = { sku: "character", referenceHeightCm: 180 };
  assert.deepEqual(errorsOf(envelope(omitted)), []);

  const zeros = goodDraft();
  zeros.mannequin = {
    sku: "character",
    referenceHeightCm: 180,
    offsetMm: { x: 0, y: 0, z: 0 }
  };
  assert.deepEqual(errorsOf(envelope(zeros)), []);

  const edges = goodDraft();
  edges.mannequin = {
    sku: "character",
    referenceHeightCm: 180,
    offsetMm: { x: -500, y: 500, z: 12.5 }
  };
  assert.deepEqual(errorsOf(envelope(edges)), []);

  const text = goodDraft();
  text.mannequin = {
    sku: "character",
    referenceHeightCm: 180,
    offsetMm: { x: "0", y: 0, z: 0 }
  };
  assert.ok(errorsOf(envelope(text)).some((line) => line.includes("offsetMm.x")));

  const high = goodDraft();
  high.mannequin = {
    sku: "character",
    referenceHeightCm: 180,
    offsetMm: { x: 0, y: 501, z: 0 }
  };
  assert.ok(errorsOf(envelope(high)).some((line) => line.includes("offsetMm.y")));

  const low = goodDraft();
  low.mannequin = {
    sku: "character",
    referenceHeightCm: 180,
    offsetMm: { x: 0, y: 0, z: -501 }
  };
  assert.ok(errorsOf(envelope(low)).some((line) => line.includes("offsetMm.z")));
});
