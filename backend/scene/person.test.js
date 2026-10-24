import test from "node:test";
import assert from "node:assert/strict";
import { placePerson } from "./person.js";

function catalog() {
  return {
    products: [
      {
        sku: "CHAIR-460",
        type: "chair",
        placement: { seatHeightMm: 450 }
      },
      {
        sku: "CHAIR-OTHER",
        type: "chair",
        placement: { seatHeightMm: 400 }
      },
      { sku: "character", type: "person" },
      { sku: "DESK-LEGS-1400", type: "desk_legs" }
    ]
  };
}

function place(overrides = {}) {
  return placePerson({
    catalog: catalog(),
    ergonomics: { mannequin: { sku: "character", referenceHeightCm: 175 } },
    body: { heightCm: 175 },
    placements: [{ sku: "CHAIR-460", x: 12, y: 0, z: 760, rotY: 180 }],
    ...overrides
  });
}

test("placePerson returns null without a mannequin setting or a product", () => {
  assert.equal(place({ ergonomics: {} }), null);
  assert.equal(place({ ergonomics: undefined }), null);
  assert.equal(
    place({ ergonomics: { mannequin: { sku: "missing", referenceHeightCm: 175 } } }),
    null
  );
});

test("placePerson returns null when no chair is placed", () => {
  assert.equal(
    place({ placements: [{ sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 }] }),
    null
  );
});

test("scale is 1 at the reference height, above 1 when taller, and clamped to 0.7..1.3", () => {
  assert.equal(place().scale, 1);
  assert.ok(place({ body: { heightCm: 195 } }).scale > 1);
  assert.equal(place({ body: { heightCm: 80 } }).scale, 0.7);
  assert.equal(place({ body: { heightCm: 300 } }).scale, 1.3);
});

test("the mannequin takes x, z and rotY from the first chair", () => {
  const person = place({
    placements: [
      { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 },
      { sku: "CHAIR-460", x: 12, y: 0, z: 760, rotY: 180 },
      { sku: "CHAIR-OTHER", x: 90, y: 0, z: 10, rotY: 0 }
    ]
  });
  assert.deepEqual(person, {
    sku: "character",
    x: 12,
    y: 450,
    z: 760,
    rotY: 180,
    scale: 1
  });
});
