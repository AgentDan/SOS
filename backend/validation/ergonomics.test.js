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
