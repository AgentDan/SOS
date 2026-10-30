import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "./interpret.js";

function text(value) {
  return { source: "text", text: value };
}

const vocabulary = {
  commands: [
    { action: "replace", words: ["замени"] },
    { action: "add", words: ["добавь"] }
  ],
  products: [
    { sku: "DESK-TOP-1400", words: ["стол", "столешниц", "1400", "140"] },
    { sku: "DESK-TOP-1800", words: ["стол", "столешниц", "1800", "180"] },
    { sku: "DESK-TOP-2000", words: ["стол", "столешниц", "2000", "200", "двухметров"] },
    { sku: "MON-613-366", words: ["монитор", "экран", "27"] },
    { sku: "MON-715-427", words: ["монитор", "экран", "32"] }
  ]
};

test("two different products in a replace fill withSku", () => {
  assert.deepEqual(interpret(text("замени стол 180 на стол 200"), vocabulary), {
    type: "command",
    source: "text",
    payload: { action: "replace", sku: "DESK-TOP-1800", withSku: "DESK-TOP-2000" }
  });
  assert.deepEqual(interpret(text("замени монитор 27 на монитор 32"), vocabulary), {
    type: "command",
    source: "text",
    payload: { action: "replace", sku: "MON-613-366", withSku: "MON-715-427" }
  });
});

test("one product mention in a replace does not set withSku", () => {
  assert.deepEqual(interpret(text("замени стол на 200"), vocabulary), {
    type: "command",
    source: "text",
    payload: { action: "replace", sku: "DESK-TOP-2000" }
  });
  assert.deepEqual(interpret(text("замени монитор на 32"), vocabulary), {
    type: "command",
    source: "text",
    payload: { action: "replace", sku: "MON-715-427" }
  });
});

test("two mentions of the same product do not set withSku", () => {
  assert.deepEqual(interpret(text("замени монитор на монитор"), vocabulary), {
    type: "command",
    source: "text",
    payload: { action: "replace", sku: "MON-613-366" }
  });
});
