import test from "node:test";
import assert from "node:assert/strict";
import { runCheaper } from "./cheaper.js";

function scene(skus, apply) {
  const calls = [];
  return {
    skus,
    calls,
    apply:
      apply ??
      ((change) => {
        calls.push(change);
        return { ok: true, sceneChanged: false };
      })
  };
}

test("replaces with the nearest cheaper sku and reports the saving", () => {
  const board = scene(["HI"]);
  const result = runCheaper({
    catalog: {
      products: [
        { sku: "HI", type: "chair", priceEur: 30 },
        { sku: "MID", type: "chair", priceEur: 20 },
        { sku: "LO", type: "chair", priceEur: 5 }
      ]
    },
    scene: board
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "talk");
  assert.equal(result.sceneChanged, false);
  assert.deepEqual(result.facts, {
    topic: "cheaper",
    sku: "HI",
    withSku: "MID",
    savedEur: 10
  });
  assert.deepEqual(result.say, {
    code: "cheaper_done",
    params: { sku: "HI", withSku: "MID", savedEur: 10 }
  });
  assert.deepEqual(board.calls, [{ op: "replace", sku: "HI", withSku: "MID" }]);
});

test("nothing cheaper is nothing_cheaper", () => {
  const board = scene(["LO"]);
  const result = runCheaper({
    catalog: {
      products: [
        { sku: "ONLY", type: "chair", priceEur: 15 },
        { sku: "LO", type: "chair", priceEur: 5 },
        { sku: "OTHER", type: "desk", priceEur: 1 }
      ]
    },
    scene: board
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "nothing_cheaper");
  assert.equal(result.sceneChanged, false);
  assert.deepEqual(result.facts, { topic: "cheaper" });
  assert.deepEqual(result.say, { code: "nothing_cheaper", params: {} });
  assert.deepEqual(board.calls, []);
});

test("a cheaper sku already on the scene can replace one copy", () => {
  const present = scene(["HI", "MID"]);
  const result = runCheaper({
    catalog: {
      products: [
        { sku: "HI", type: "chair", priceEur: 30 },
        { sku: "MID", type: "chair", priceEur: 20 }
      ]
    },
    scene: present
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts, {
    topic: "cheaper",
    sku: "HI",
    withSku: "MID",
    savedEur: 10
  });
  assert.deepEqual(present.calls, [{ op: "replace", sku: "HI", withSku: "MID" }]);

  const copies = scene(["HI", "HI"]);
  const once = runCheaper({
    catalog: {
      products: [
        { sku: "HI", type: "chair", priceEur: 30 },
        { sku: "MID", type: "chair", priceEur: 20 }
      ]
    },
    scene: copies
  });
  assert.deepEqual(once.facts, {
    topic: "cheaper",
    sku: "HI",
    withSku: "MID",
    savedEur: 10
  });
  assert.deepEqual(copies.calls, [{ op: "replace", sku: "HI", withSku: "MID" }]);
});

test("alwaysPresent is not replaced", () => {
  const board = scene(["LEG", "ONLY"]);
  const result = runCheaper({
    catalog: {
      products: [
        { sku: "LEG", type: "legs", priceEur: 500, alwaysPresent: true },
        { sku: "LEG-CHEAP", type: "legs", priceEur: 10 },
        { sku: "ONLY", type: "chair", priceEur: 40 }
      ]
    },
    scene: board
  });
  assert.equal(result.reasonCode, "nothing_cheaper");
  assert.deepEqual(board.calls, []);
});

test("the pair with the greatest saving wins, ties keep scene order", () => {
  const board = scene(["CHAIR-HI", "TOP-HI"]);
  const products = [
    { sku: "CHAIR-HI", type: "chair", priceEur: 100 },
    { sku: "CHAIR-MID", type: "chair", priceEur: 90 },
    { sku: "CHAIR-LO", type: "chair", priceEur: 5 },
    { sku: "TOP-HI", type: "top", priceEur: 200 },
    { sku: "TOP-MID", type: "top", priceEur: 160 },
    { sku: "TOP-LO", type: "top", priceEur: 20 }
  ];
  const result = runCheaper({ catalog: { draft: { products } }, scene: board });
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts, {
    topic: "cheaper",
    sku: "TOP-HI",
    withSku: "TOP-MID",
    savedEur: 40
  });
  assert.deepEqual(board.calls, [{ op: "replace", sku: "TOP-HI", withSku: "TOP-MID" }]);

  const tie = scene(["A", "B"]);
  const tied = runCheaper({
    catalog: {
      products: [
        { sku: "A", type: "chair", priceEur: 50 },
        { sku: "A2", type: "chair", priceEur: 40 },
        { sku: "B", type: "desk", priceEur: 80 },
        { sku: "B2", type: "desk", priceEur: 70 }
      ]
    },
    scene: tie
  });
  assert.equal(tied.facts.sku, "A");
  assert.equal(tied.facts.withSku, "A2");
  assert.equal(tied.facts.savedEur, 10);
  assert.deepEqual(tie.calls, [{ op: "replace", sku: "A", withSku: "A2" }]);
});

test("an apply refusal is returned as is", () => {
  const catalog = {
    products: [
      { sku: "HI", type: "chair", priceEur: 30 },
      { sku: "LO", type: "chair", priceEur: 10 }
    ]
  };
  const refused = runCheaper({
    catalog,
    scene: scene(["HI"], () => ({ ok: false, reasonCode: "limit" }))
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.reasonCode, "limit");
  assert.equal(refused.say.code, "limit");
  assert.deepEqual(refused.say.params, { sku: "HI", withSku: "LO" });
  assert.equal(refused.sceneChanged, false);

  const missing = runCheaper({
    catalog,
    scene: scene(["HI"], () => ({ ok: false }))
  });
  assert.equal(missing.reasonCode, "not_found");
  assert.equal(missing.say.code, "not_found");
});

test("a host that carries cargo can still get cheaper", () => {
  const board = scene(["TOP", "MON", "CHAIR"]);
  const result = runCheaper({
    catalog: {
      types: [
        { id: "top", canHostOn: [] },
        { id: "monitor", canHostOn: ["top"] },
        { id: "chair", canHostOn: [] }
      ],
      products: [
        { sku: "TOP", type: "top", priceEur: 200 },
        { sku: "TOP-LO", type: "top", priceEur: 20 },
        { sku: "MON", type: "monitor", priceEur: 100 },
        { sku: "CHAIR", type: "chair", priceEur: 80 },
        { sku: "CHAIR-LO", type: "chair", priceEur: 70 }
      ]
    },
    scene: board
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts, {
    topic: "cheaper",
    sku: "TOP",
    withSku: "TOP-LO",
    savedEur: 180
  });
  assert.deepEqual(board.calls, [{ op: "replace", sku: "TOP", withSku: "TOP-LO" }]);
});

test("cargo on one copy still allows another copy of the host to get cheaper", () => {
  const board = scene(["TOP", "TOP", "MON"]);
  const result = runCheaper({
    catalog: {
      types: [
        { id: "top", canHostOn: [] },
        { id: "monitor", canHostOn: ["top"] }
      ],
      products: [
        { sku: "TOP", type: "top", priceEur: 200 },
        { sku: "TOP-LO", type: "top", priceEur: 150 },
        { sku: "MON", type: "monitor", priceEur: 100 }
      ]
    },
    scene: board
  });
  assert.equal(result.ok, true);
  assert.equal(result.facts.sku, "TOP");
  assert.equal(result.facts.withSku, "TOP-LO");
});
