import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "./interpret.js";

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
    ergo: ["удобн", "эргоном", "подходит ли", "по росту", "по моему росту"],
    smalltalk: ["привет", "как дела"]
  },
  faq: [
    { id: "delivery", words: ["доставка", "привез"] },
    { id: "warranty", words: ["гарант"] }
  ]
};

function answer(questionId, optionId) {
  return { type: "answer", source: "button", payload: { questionId, optionId } };
}

function command(action, sku) {
  const payload = { action };
  if (sku !== undefined) payload.sku = sku;
  return { type: "command", source: "text", payload };
}

function talk(topic, faqId) {
  const payload = { topic };
  if (faqId !== undefined) payload.faqId = faqId;
  return { type: "talk", source: "text", payload };
}

function unclear(source, reason) {
  return { type: "unclear", source, payload: { reason } };
}

function text(value) {
  return { source: "text", text: value };
}

const controlPhrases = [
  {
    name: "answer work type",
    input: { source: "button", questionId: "q_work_type", optionId: "coding" },
    intent: answer("q_work_type", "coding")
  },
  {
    name: "answer confirmation",
    input: { source: "button", questionId: "confirm_desk_top_wide", optionId: "keep" },
    intent: answer("confirm_desk_top_wide", "keep")
  },
  {
    name: "answer back pain",
    input: { source: "button", questionId: "q_back_pain", optionId: "yes" },
    intent: answer("q_back_pain", "yes")
  },
  {
    name: "command remove with sku",
    input: text("убери кресло"),
    intent: command("remove", "CHAIR-460")
  },
  {
    name: "command add without sku",
    input: text("добавь лампу"),
    intent: command("add")
  },
  {
    name: "command replace with sku",
    input: text("замени стол"),
    intent: command("replace", "DESK-TOP-1800")
  },
  {
    name: "talk cheaper",
    input: text("хочу дешевле"),
    intent: talk("cheaper")
  },
  {
    name: "talk faq",
    input: text("какая доставка"),
    intent: talk("faq", "delivery")
  },
  {
    name: "talk smalltalk",
    input: text("привет"),
    intent: talk("smalltalk")
  },
  {
    name: "garbage",
    input: text("абракадабра"),
    intent: unclear("text", "no_match")
  },
  {
    name: "empty text",
    input: text(""),
    intent: unclear("text", "empty")
  },
  {
    name: "blank text",
    input: text("   "),
    intent: unclear("text", "empty")
  }
];

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

test("control phrases cover answer, command, talk, and garbage", () => {
  const counts = { answer: 0, command: 0, talk: 0, unclear: 0 };
  for (const row of controlPhrases) {
    assert.deepEqual(interpret(row.input, vocabulary), row.intent, row.name);
    counts[row.intent.type] += 1;
  }
  assert.ok(counts.answer >= 3);
  assert.ok(counts.command >= 3);
  assert.ok(counts.talk >= 3);
  assert.ok(counts.unclear >= 1);
});

test("a confirmation button is an answer", () => {
  assert.deepEqual(
    interpret(
      { source: "button", questionId: "confirm_desk_top_wide", optionId: "reject" },
      vocabulary
    ),
    answer("confirm_desk_top_wide", "reject")
  );
});

test("a button without a string option is unclear", () => {
  assert.deepEqual(
    interpret({ source: "button", questionId: "q_work_type" }, vocabulary),
    unclear("button", "bad_button")
  );
  assert.deepEqual(
    interpret({ source: "button", questionId: 1, optionId: "coding" }, vocabulary),
    unclear("button", "bad_button")
  );
});

test("commands ignore case, yo, and punctuation and skip size fields", () => {
  const expected = command("remove", "CHAIR-460");
  assert.deepEqual(interpret(text("УБЕРИ КРЕСЛО"), vocabulary), expected);
  assert.deepEqual(interpret(text("убери крёсло"), vocabulary), expected);
  assert.deepEqual(interpret(text("Убери, кресло!"), vocabulary), expected);
  assert.deepEqual(interpret(text("убери кресло на 20 см"), vocabulary), expected);
});

test("vocabulary words are normalized the same way as the text", () => {
  const vocab = {
    commands: [{ action: "remove", words: ["Убери"] }],
    products: [{ sku: "CHAIR-460", words: ["Крёсл"] }]
  };
  assert.deepEqual(interpret(text("убери кресла"), vocab), command("remove", "CHAIR-460"));
});

test("two products resolve to the one earlier in the text", () => {
  assert.deepEqual(
    interpret(text("убери стол и кресло"), vocabulary),
    command("remove", "DESK-TOP-1800")
  );
  assert.deepEqual(
    interpret(text("убери кресла и стол"), vocabulary),
    command("remove", "CHAIR-460")
  );
});

test("a stem matches word forms and not a stem inside a word", () => {
  const vocab = { topics: { smalltalk: ["кресл"] } };
  assert.deepEqual(interpret(text("кресло"), vocab), talk("smalltalk"));
  assert.deepEqual(interpret(text("кресла"), vocab), talk("smalltalk"));
  assert.deepEqual(interpret(text("скресл"), vocab), unclear("text", "no_match"));
});

test("a phrase matches from a word boundary", () => {
  assert.deepEqual(interpret(text("ну как дела"), vocabulary), talk("smalltalk"));
  assert.deepEqual(interpret(text("некак дела"), vocabulary), unclear("text", "no_match"));
});

test("the earlier faq word sets faqId", () => {
  assert.deepEqual(
    interpret(text("есть гарантия и доставка"), vocabulary),
    talk("faq", "warranty")
  );
  assert.deepEqual(
    interpret(text("есть доставка и гарантия"), vocabulary),
    talk("faq", "delivery")
  );
});

test("ergonomics phrases are talk ergo", () => {
  assert.deepEqual(interpret(text("удобно ли мне"), vocabulary), talk("ergo"));
  assert.deepEqual(interpret(text("подходит ли мне этот стол"), vocabulary), talk("ergo"));
  assert.deepEqual(interpret(text("эргономика"), vocabulary), talk("ergo"));
});

test("decision order checks command, then cheaper, then ergo, then faq, then smalltalk", () => {
  assert.deepEqual(interpret(text("хочу дешевле, убери стол"), vocabulary), command("remove", "DESK-TOP-1800"));
  assert.deepEqual(interpret(text("дешевле ли доставка"), vocabulary), talk("cheaper"));
  assert.deepEqual(interpret(text("удобно ли мне дешевле"), vocabulary), talk("cheaper"));
  assert.deepEqual(interpret(text("доставка, удобно ли мне"), vocabulary), talk("ergo"));
  assert.deepEqual(interpret(text("привет, какая доставка"), vocabulary), talk("faq", "delivery"));
  assert.deepEqual(interpret(text("абракадабра"), vocabulary), unclear("text", "no_match"));
});

test("empty, blank, and non-string text are unclear", () => {
  assert.deepEqual(interpret(text(""), vocabulary), unclear("text", "empty"));
  assert.deepEqual(interpret(text("   \n\t"), vocabulary), unclear("text", "empty"));
  for (const value of [1, null, undefined]) {
    assert.deepEqual(interpret(text(value), vocabulary), unclear("text", "empty"), String(value));
  }
  assert.deepEqual(interpret(text("абракадабра"), vocabulary), unclear("text", "no_match"));
});

test("an empty or partial vocabulary does not throw", () => {
  const phrase = text("убери кресло");
  assert.deepEqual(interpret(phrase, {}), unclear("text", "no_match"));
  assert.deepEqual(interpret(phrase, undefined), unclear("text", "no_match"));
  assert.deepEqual(
    interpret(text("дешевле"), { topics: { cheaper: ["дешевле"] } }),
    talk("cheaper")
  );
  assert.deepEqual(
    interpret({ source: "button", questionId: "q_work_type", optionId: "coding" }, undefined),
    answer("q_work_type", "coding")
  );
});

test("interpret does not change the input or a frozen vocabulary", () => {
  const input = text("Убери, крёсло!");
  const vocab = structuredClone(vocabulary);
  const beforeInput = structuredClone(input);
  const beforeVocab = structuredClone(vocab);
  deepFreeze(input);
  deepFreeze(vocab);

  assert.deepEqual(interpret(input, vocab), command("remove", "CHAIR-460"));
  assert.deepEqual(input, beforeInput);
  assert.deepEqual(vocab, beforeVocab);

  const button = Object.freeze({ source: "button", questionId: "q_work_type" });
  const beforeButton = structuredClone(button);
  assert.deepEqual(interpret(button, vocab), unclear("button", "bad_button"));
  assert.deepEqual(button, beforeButton);
});

const distanceVocabulary = {
  commands: [
    { action: "add", words: ["добав"] },
    { action: "remove", words: ["убер"] },
    { action: "replace", words: ["замен"] },
    { action: "distance", words: ["расстоя", "дистанц", "как далеко", "сколько до"] }
  ],
  products: [
    { sku: "MON-613-366", words: ["монитор"] },
    { sku: "MON-613-367", words: ["экран"] },
    { sku: "CHAIR-460", words: ["кресл"] },
    { sku: "DESK-TOP-1800", words: ["стол"] }
  ]
};

test("distance names two objects in mention order and leaves other commands alone", () => {
  assert.deepEqual(interpret(text("расстояние между монитором и креслом"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["MON-613-366", "CHAIR-460"] }
  });
  assert.deepEqual(interpret(text("расстояние до стола"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["DESK-TOP-1800"] }
  });
  assert.deepEqual(interpret(text("убери монитор"), distanceVocabulary), command("remove", "MON-613-366"));
  assert.deepEqual(interpret(text("расстояние между монитором и монитором"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["MON-613-366", "MON-613-366"] }
  });
  assert.deepEqual(interpret(text("как далеко от монитора до экрана"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["MON-613-366", "MON-613-367"] }
  });
  assert.deepEqual(interpret(text("добавь расстояние между монитором и креслом"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["MON-613-366", "CHAIR-460"] }
  });
  assert.deepEqual(interpret(text("сколько до"), distanceVocabulary), {
    type: "command",
    source: "text",
    payload: { action: "distance" }
  });
});
