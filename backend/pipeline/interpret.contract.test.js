import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../understanding/interpret.js";
import { validateIntent } from "./contracts.js";

const vocabulary = {
  commands: [
    { action: "remove", words: ["убери", "убрать"] },
    { action: "add", words: ["добавь", "поставь"] },
    { action: "replace", words: ["замени"] }
  ],
  products: [
    { sku: "CHAIR-460", words: ["кресл"] },
    { sku: "DESK-TOP-1800", words: ["стол"] }
  ],
  topics: {
    cheaper: ["дешевле", "Подёшевле"],
    ergo: ["удобн", "эргоном", "подходит ли"],
    smalltalk: ["привет", "как дела"]
  },
  faq: [
    { id: "delivery", words: ["доставка", "привез"] },
    { id: "warranty", words: ["гарант"] }
  ]
};

function text(value) {
  return { source: "text", text: value };
}

const controlPhrases = [
  { name: "answer work type", input: { source: "button", questionId: "q_work_type", optionId: "coding" } },
  {
    name: "answer confirmation",
    input: { source: "button", questionId: "confirm_desk_top_wide", optionId: "keep" }
  },
  { name: "answer back pain", input: { source: "button", questionId: "q_back_pain", optionId: "yes" } },
  { name: "command remove with sku", input: text("убери кресло") },
  { name: "command add without sku", input: text("добавь лампу") },
  { name: "command replace with sku", input: text("замени стол") },
  { name: "command with case yo and punctuation", input: text("Убери, крёсло!") },
  { name: "earlier sku", input: text("убери стол и кресло") },
  { name: "talk cheaper", input: text("хочу дешевле") },
  { name: "talk ergo", input: text("удобно ли мне") },
  { name: "talk faq", input: text("какая доставка") },
  { name: "earlier faq", input: text("есть гарантия и доставка") },
  { name: "talk smalltalk", input: text("привет") },
  { name: "phrase from a word boundary", input: text("ну как дела") },
  { name: "command before cheaper", input: text("хочу дешевле, убери стол") },
  { name: "faq before smalltalk", input: text("привет, какая доставка") },
  { name: "garbage", input: text("абракадабра") },
  { name: "empty text", input: text("") },
  { name: "blank text", input: text("   ") },
  { name: "numeric text", input: text(1) },
  { name: "null text", input: text(null) },
  { name: "missing text", input: text(undefined) },
  { name: "broken button", input: { source: "button", questionId: "q_work_type" } },
  { name: "stem form", input: text("кресло") },
  { name: "stem inside a word", input: text("скресл") }
];

test("a distance intent with two skus satisfies the contract", () => {
  const vocab = {
    commands: [{ action: "distance", words: ["расстоя"] }],
    products: [
      { sku: "MON-613-366", words: ["монитор"] },
      { sku: "CHAIR-460", words: ["кресл"] }
    ]
  };
  const intent = interpret(text("расстояние между монитором и креслом"), vocab);
  assert.deepEqual(validateIntent(intent), { ok: true, errors: [] });
  assert.deepEqual(intent.payload.skus, ["MON-613-366", "CHAIR-460"]);
});

test("control phrases satisfy the intent contract", () => {
  for (const row of controlPhrases) {
    const intent = interpret(row.input, vocabulary);
    assert.deepEqual(validateIntent(intent), { ok: true, errors: [] }, row.name);
  }
});
