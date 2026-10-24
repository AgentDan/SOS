import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readConsultant, readDraft } from "../config/load.js";
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

test("published layers fill the vocabulary", () => {
  const commands = readDraft("commands");
  const consultant = readConsultant();
  const catalog = readCatalog();
  const vocab = buildVocabulary({ commands, consultant, catalog });
  assert.deepEqual(
    vocab.commands.map((entry) => entry.action),
    commands.commands.map((entry) => entry.action)
  );
  assert.deepEqual(
    vocab.products,
    catalog.products
      .filter(
        (product) =>
          product.type !== "person" && typeof product.sku === "string" && Array.isArray(product.words)
      )
      .map((product) => ({ sku: product.sku, words: product.words }))
  );
  assert.deepEqual(vocab.topics, {
    cheaper: consultant.topics.cheaper,
    smalltalk: consultant.topics.smalltalk
  });
  assert.deepEqual(
    vocab.faq,
    consultant.faq
      .filter((entry) => typeof entry.id === "string" && Array.isArray(entry.words))
      .map((entry) => ({ id: entry.id, words: entry.words }))
  );
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

test("a person product is left out of the vocabulary", () => {
  const vocab = buildVocabulary({
    catalog: {
      products: [
        { sku: "CHAIR-460", type: "chair", words: ["кресл"] },
        { sku: "character", type: "person", words: ["манекен"] }
      ]
    }
  });
  assert.deepEqual(vocab.products, [{ sku: "CHAIR-460", words: ["кресл"] }]);
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
