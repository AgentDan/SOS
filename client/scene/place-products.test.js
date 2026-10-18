import test from "node:test";
import assert from "node:assert/strict";
import { pickHostId } from "./place-products.js";

test("cargo lands on the least loaded copy of its host", () => {
  const legs = (n) => [`DESK-LEGS-1400#${n}`, { product: { sku: "DESK-LEGS-1400" } }];
  const entries = [
    legs(1),
    legs(2),
    ["DESK-TOP-1400#1", { product: { sku: "DESK-TOP-1400" }, hostId: "DESK-LEGS-1400#1" }]
  ];
  assert.equal(pickHostId("DESK-LEGS-1400", entries), "DESK-LEGS-1400#2");
  assert.equal(pickHostId("DESK-TOP-1400", entries), "DESK-TOP-1400#1");
  assert.equal(pickHostId("MISSING", entries), null);
});

test("equal load keeps the earlier copy", () => {
  const entries = [
    ["DESK-TOP-1400#2", { product: { sku: "DESK-TOP-1400" } }],
    ["DESK-TOP-1400#1", { product: { sku: "DESK-TOP-1400" } }]
  ];
  assert.equal(pickHostId("DESK-TOP-1400", entries), "DESK-TOP-1400#1");
});
