import test from "node:test";
import assert from "node:assert/strict";
import { resolveNeed } from "../needs/matching.js";
import { assembleScene } from "./reads.js";

const legs = {
  sku: "DESK-LEGS-1400",
  type: "desk_legs",
  priceEur: 79,
  alwaysPresent: true,
  dimensions: { width: 1400, depth: 700, height: 1000 }
};

const chair = {
  sku: "CHAIR-460",
  type: "chair",
  priceEur: 129,
  dimensions: { width: 460, depth: 520, height: 900 },
  placement: { offset: { z: 760 }, seatHeightMm: 450 }
};

const person = {
  sku: "character",
  type: "person",
  label: "манекен",
  alwaysPresent: true,
  words: [],
  dimensions: { width: 814, depth: 778, height: 1420 }
};

function catalog(products) {
  return {
    types: [
      { id: "desk_legs" },
      { id: "chair" },
      { id: "person", maxOnScene: 1 }
    ],
    needs: [
      { id: "ergonomic_chair", criteria: { type: "chair" } },
      { id: "mannequin", criteria: { type: "person" } }
    ],
    products
  };
}

function total(products, skus) {
  let sum = 0;
  for (const sku of skus) {
    const product = products.find((item) => item.sku === sku);
    if (product && typeof product.priceEur === "number") sum += product.priceEur;
  }
  return sum;
}

test("a person stays out of skus, need matching, and the order total", () => {
  const goods = [legs, chair];
  const withPerson = [legs, chair, person];
  const profile = {
    needs: [{ id: "ergonomic_chair", resolvedSku: "CHAIR-460" }]
  };
  const extras = {
    ergonomics: {
      mannequin: { sku: "character", referenceHeightCm: 175 },
      defaults: { heightCm: 175, hand: "right" }
    }
  };

  const before = assembleScene(catalog(goods), profile, extras);
  const after = assembleScene(catalog(withPerson), profile, extras);

  assert.deepEqual(after.skus, before.skus);
  assert.equal(after.skus.includes("character"), false);
  assert.equal(after.person.sku, "character");
  assert.equal(total(withPerson, after.skus), total(goods, before.skus));
  assert.equal(total(withPerson, after.skus), 79 + 129);

  const priced = catalog(withPerson);
  assert.equal(resolveNeed(priced, "ergonomic_chair"), "CHAIR-460");
  assert.equal(resolveNeed(priced, "mannequin"), null);
});
