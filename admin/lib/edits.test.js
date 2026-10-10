import test from "node:test";
import assert from "node:assert/strict";
import { draftsDiffer, hasUnsavedEdits, sameJson } from "./edits.js";

test("unsaved edits compare the editor text as the user left it", () => {
  assert.equal(hasUnsavedEdits('{"a":1}\n', '{"a":1}\n'), false);
  assert.equal(hasUnsavedEdits('{"a": 1}\n', '{"a":1}\n'), true);
  assert.equal(hasUnsavedEdits("", ""), false);
});

test("draft and published compare by value, including key order", () => {
  assert.equal(sameJson({ a: 1, b: [2, { c: 3 }] }, { b: [{ c: 3 }, 2], a: 1 }), false);
  assert.equal(sameJson({ a: 1, b: { c: 3 } }, { b: { c: 3 }, a: 1 }), true);
  assert.equal(draftsDiffer({ low: 35 }, { low: 35 }), false);
  assert.equal(draftsDiffer({ low: 36 }, { low: 35 }), true);
  assert.equal(draftsDiffer({ low: 35 }, undefined), true);
});
