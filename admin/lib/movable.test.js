import test from "node:test";
import assert from "node:assert/strict";
import { draftWithMovable, movableEdits, movableOf, physicsRows } from "./movable.js";

const DRAFT = [
  { sku: "character", type: "person", label: "манекен" },
  { sku: "CHAIR-460", type: "chair", label: "кресло", movable: false },
  { sku: "MON-613-366", type: "monitor", label: "монитор", movable: true },
  { sku: "KB-440", type: "keyboard", label: "клавиатура" },
  { sku: "DESK-TOP-1400", type: "desk_top", label: "стол 140", movable: false }
];

const PUBLISHED = [
  { sku: "CHAIR-460", type: "chair", label: "кресло" },
  { sku: "MON-613-366", type: "monitor", movable: true },
  { sku: "KB-440", type: "keyboard", movable: false },
  { sku: "DESK-TOP-1400", type: "desk_top", movable: false }
];

test("a missing movable flag counts as movable", () => {
  assert.equal(movableOf({ sku: "KB-440" }), true);
  assert.equal(movableOf({ movable: true }), true);
  assert.equal(movableOf({ movable: false }), false);
  assert.equal(movableOf(undefined), true);
});

test("physics rows skip the mannequin and mark a draft flag that differs from published", () => {
  const rows = physicsRows(DRAFT, PUBLISHED);
  assert.deepEqual(
    rows.map((row) => [row.sku, row.label, row.type, row.movable, row.unpublished]),
    [
      ["CHAIR-460", "кресло", "chair", false, true],
      ["DESK-TOP-1400", "стол 140", "desk_top", false, false],
      ["KB-440", "клавиатура", "keyboard", true, true],
      ["MON-613-366", "монитор", "monitor", true, false]
    ]
  );
  assert.equal(rows.some((row) => row.sku === "character"), false);
});

test("the same effective flag in draft and published is not unpublished", () => {
  const rows = physicsRows(
    [
      { sku: "MOUSE-65", type: "mouse", label: "мышь" },
      { sku: "SPK-100", type: "speaker", label: "колонки", movable: true }
    ],
    [
      { sku: "MOUSE-65", type: "mouse" },
      { sku: "SPK-100", type: "speaker" }
    ]
  );
  assert.deepEqual(
    rows.map((row) => [row.sku, row.movable, row.unpublished]),
    [
      ["MOUSE-65", true, false],
      ["SPK-100", true, false]
    ]
  );
});

test("edits are only the switches that differ from the saved draft", () => {
  const rows = physicsRows(DRAFT, PUBLISHED);
  assert.deepEqual(
    movableEdits(rows, {
      "CHAIR-460": false,
      "MON-613-366": false,
      "KB-440": true,
      "DESK-TOP-1400": true
    }),
    [
      { sku: "DESK-TOP-1400", movable: true },
      { sku: "MON-613-366", movable: false }
    ]
  );
  assert.deepEqual(movableEdits(rows, { "CHAIR-460": false, "KB-440": true }), []);
  assert.deepEqual(movableEdits(rows, {}), []);
});

test("draftWithMovable writes the flag only on edited skus", () => {
  const draft = {
    types: [{ id: "chair" }],
    needs: [],
    products: [
      { sku: "CHAIR-460", movable: false, priceEur: 129 },
      { sku: "MON-613-366", label: "монитор" },
      { sku: "character", type: "person", label: "манекен" }
    ]
  };
  const next = draftWithMovable(draft, [{ sku: "MON-613-366", movable: false }]);
  assert.equal(draft.products[1].movable, undefined);
  assert.equal(next.products[0].movable, false);
  assert.equal(next.products[0].priceEur, 129);
  assert.equal(next.products[1].movable, false);
  assert.equal(next.products[1].label, "монитор");
  assert.equal(next.products[2].type, "person");
  assert.equal(Object.hasOwn(next.products[2], "movable"), false);
  assert.equal(next.types[0].id, "chair");
  assert.deepEqual(next.needs, []);
});
