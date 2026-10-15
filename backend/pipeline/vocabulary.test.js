import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readCommands, readConsultant } from "../config/load.js";
import { buildVocabulary } from "./vocabulary.js";

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

test("full sources fill every vocabulary list", () => {
  const vocab = buildVocabulary({
    commands: {
      commands: [
        { action: "remove", words: ["убери"] },
        { action: 1, words: ["нет"] },
        { words: ["без action"] }
      ]
    },
    consultant: {
      topics: { cheaper: ["дешевле"], smalltalk: ["привет"] },
      faq: [{ id: "delivery", words: ["доставка"] }, { id: "skip" }]
    },
    catalog: {
      products: [
        { sku: "CHAIR-460", words: ["кресл"] },
        { sku: "DESK-LEGS-1400" }
      ]
    }
  });

  assert.deepEqual(vocab, {
    commands: [{ action: "remove", words: ["убери"] }],
    products: [{ sku: "CHAIR-460", words: ["кресл"] }],
    topics: { cheaper: ["дешевле"], smalltalk: ["привет"] },
    faq: [{ id: "delivery", words: ["доставка"] }]
  });
});

test("shipped commands and consultant give an empty vocabulary", () => {
  const vocab = buildVocabulary({
    commands: readCommands(),
    consultant: readConsultant(),
    catalog: readCatalog()
  });
  assert.deepEqual(vocab, {
    commands: [],
    products: [],
    topics: { cheaper: [], smalltalk: [] },
    faq: []
  });
});

test("missing or crooked sources do not throw", () => {
  assert.deepEqual(buildVocabulary({}), {
    commands: [],
    products: [],
    topics: { cheaper: [], smalltalk: [] },
    faq: []
  });
  assert.deepEqual(buildVocabulary(undefined), {
    commands: [],
    products: [],
    topics: { cheaper: [], smalltalk: [] },
    faq: []
  });
  assert.deepEqual(
    buildVocabulary({
      commands: { commands: "nope" },
      consultant: { topics: "nope", faq: [{ id: 1, words: ["x"] }] },
      catalog: { products: [{ sku: "A", words: "стол" }] }
    }),
    {
      commands: [],
      products: [],
      topics: { cheaper: [], smalltalk: [] },
      faq: []
    }
  );
});

test("buildVocabulary does not change a frozen input", () => {
  const input = {
    commands: { commands: [{ action: "add", words: ["добавь"] }] },
    consultant: { topics: { cheaper: ["дешевле"] }, faq: [] },
    catalog: { products: [{ sku: "CHAIR-460", words: ["кресл"] }] }
  };
  const before = structuredClone(input);
  deepFreeze(input);
  buildVocabulary(input);
  assert.deepEqual(input, before);
});
