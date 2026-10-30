import test from "node:test";
import assert from "node:assert/strict";
import { onePerType } from "./derive-needs.js";

function catalog() {
  return {
    needs: [
      { id: "desk_top_wide", criteria: { type: "desk_top" } },
      { id: "ergonomic_chair", criteria: { type: "chair" } },
      { id: "desk_top_any", criteria: { type: "desk_top" } },
      { id: "monitor_main", criteria: { type: "monitor" } }
    ]
  };
}

function need(id, confidence) {
  return { id, confidence, resolvedSku: null };
}

test("a higher confidence need wins inside one type", () => {
  const kept = onePerType(catalog(), [
    need("desk_top_wide", "medium"),
    need("desk_top_any", "high"),
    need("monitor_main", "high")
  ]);
  assert.deepEqual(
    kept.map((item) => item.id),
    ["desk_top_any", "monitor_main"]
  );
});

test("equal confidence keeps the need earlier in the catalog", () => {
  const kept = onePerType(catalog(), [
    need("desk_top_any", "high"),
    need("monitor_main", "medium"),
    need("desk_top_wide", "high")
  ]);
  assert.deepEqual(
    kept.map((item) => item.id),
    ["monitor_main", "desk_top_wide"]
  );
});

test("high outranks medium and medium outranks low", () => {
  const medium = onePerType(catalog(), [need("desk_top_any", "low"), need("desk_top_wide", "medium")]);
  assert.deepEqual(medium.map((item) => item.id), ["desk_top_wide"]);
  const high = onePerType(catalog(), [need("desk_top_wide", "medium"), need("desk_top_any", "high")]);
  assert.deepEqual(high.map((item) => item.id), ["desk_top_any"]);
});

test("a need without a catalog type is kept", () => {
  const kept = onePerType(catalog(), [need("desk_top_wide", "high"), need("custom", "low")]);
  assert.deepEqual(
    kept.map((item) => item.id),
    ["desk_top_wide", "custom"]
  );
});
