import test from "node:test";
import assert from "node:assert/strict";
import { runErgo } from "./ergo-answer.js";

function issue(code, sku, actualMm, targetMm, deltaMm) {
  const row = { code, actualMm, targetMm, deltaMm };
  if (sku !== undefined) row.sku = sku;
  return row;
}

test("null ergo says the data is missing", () => {
  const result = runErgo({ ergo: null, catalog: { products: [] }, scene: { skus: [] } });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "talk");
  assert.equal(result.sceneChanged, false);
  assert.equal(result.reasonCode, null);
  assert.equal(result.say.code, "ergo_no_data");
  assert.deepEqual(result.say.params, {});
  assert.deepEqual(result.facts, { topic: "ergo", issues: [] });
});

test("no issues says the setup fits", () => {
  const result = runErgo({
    ergo: { targets: { deskHeightMm: 726 }, issues: [] },
    catalog: {},
    scene: {}
  });
  assert.equal(result.say.code, "ergo_ok");
  assert.deepEqual(result.say.params, {});
  assert.deepEqual(result.facts, { topic: "ergo", issues: [] });
  assert.equal(result.sceneChanged, false);
});

test("one issue names the code and rounds millimetres to centimetres", () => {
  const issues = [issue("desk_too_high", "DESK-TOP-1800", 1030, 726, 304)];
  const result = runErgo({
    ergo: { issues },
    catalog: { products: [{ sku: "DESK-TOP-1800", label: "стол 180" }] }
  });
  assert.equal(result.say.code, "ergo_desk_too_high");
  assert.deepEqual(result.say.params, { actual: 103, target: 73, delta: 30, item: "стол 180" });
  assert.deepEqual(result.facts, { topic: "ergo", issues });
});

test("two issues keep the one with the greater deltaMm", () => {
  const issues = [
    issue("desk_too_high", "DESK", 800, 700, 100),
    issue("monitor_too_far", "MON", 900, 500, 400)
  ];
  const result = runErgo({
    ergo: { issues },
    catalog: {
      draft: { products: [{ sku: "MON", label: "монитор" }] }
    }
  });
  assert.equal(result.say.code, "ergo_monitor_too_far");
  assert.deepEqual(result.say.params, { actual: 90, target: 50, delta: 40, item: "монитор" });
  assert.deepEqual(result.facts.issues, issues);

  const widerNegative = [
    issue("monitor_too_close", "MON", 50, 595, -545),
    issue("desk_too_high", "DESK", 1030, 726, 304)
  ];
  const desk = runErgo({ ergo: { issues: widerNegative }, catalog: {} });
  assert.equal(desk.say.code, "ergo_desk_too_high");
  assert.equal(desk.say.params.item, "DESK");
});

test("equal deltaMm keeps the earlier code: desk before monitor", () => {
  const issues = [
    issue("monitor_too_high", "MON", 200, 100, 100),
    issue("desk_too_low", "DESK", 100, 200, 100)
  ];
  const result = runErgo({ ergo: { issues }, catalog: { products: [] } });
  assert.equal(result.say.code, "ergo_desk_too_low");
});

test("centimetres round half away from zero on the positive side", () => {
  const result = runErgo({
    ergo: { issues: [issue("monitor_too_low", undefined, 5, 15, 25)] }
  });
  assert.equal(result.say.code, "ergo_monitor_too_low");
  assert.deepEqual(result.say.params, { actual: 1, target: 2, delta: 3 });
});
