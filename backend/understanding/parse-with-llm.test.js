import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "./interpret.js";
import { parseWithLlm } from "./parse-with-llm.js";

const vocabulary = {
  commands: [
    { action: "add", words: ["добав", "постав"] },
    { action: "remove", words: ["убер"] },
    { action: "replace", words: ["замен"] },
    { action: "distance", words: ["расстоя"] }
  ],
  products: [
    { sku: "CHAIR-460", words: ["кресл"] },
    { sku: "DESK-TOP-1800", words: ["стол"] },
    { sku: "MON-613-366", words: ["монитор"] },
    { sku: "MON-613-367", words: ["экран"] }
  ],
  topics: {
    cheaper: ["дешевл"],
    smalltalk: ["привет"]
  },
  faq: [
    { id: "delivery", words: ["доставк"] },
    { id: "warranty", words: ["гаранти"] }
  ]
};

function llmReturning(payload) {
  return async () => ({ ok: true, text: JSON.stringify(payload) });
}

test("a valid model answer matches the dictionary intent", async () => {
  const commandText = "добавь кресло";
  const command = await parseWithLlm({
    text: commandText,
    vocabulary,
    llm: llmReturning({ type: "command", action: "add", sku: "CHAIR-460", note: "лишнее", clientId: "secret" })
  });
  assert.deepEqual(command, interpret({ source: "text", text: commandText }, vocabulary));

  const distanceText = "расстояние между креслом и столом";
  const distance = await parseWithLlm({
    text: distanceText,
    vocabulary,
    llm: llmReturning({ type: "command", action: "distance", skus: ["CHAIR-460", "DESK-TOP-1800"], sku: "CHAIR-460" })
  });
  assert.deepEqual(distance, interpret({ source: "text", text: distanceText }, vocabulary));

  const talkText = "какая доставка";
  const talk = await parseWithLlm({
    text: talkText,
    vocabulary,
    llm: llmReturning({ type: "talk", topic: "faq", faqId: "delivery", answer: "секретно" })
  });
  assert.deepEqual(talk, interpret({ source: "text", text: talkText }, vocabulary));
});

test("an invented sku is null", async () => {
  const intent = await parseWithLlm({
    text: "поставь лампу",
    vocabulary,
    llm: llmReturning({ type: "command", action: "add", sku: "LAMP-1" })
  });
  assert.equal(intent, null);
});

test("an invented action is null", async () => {
  const intent = await parseWithLlm({
    text: "поставь кресло",
    vocabulary,
    llm: llmReturning({ type: "command", action: "paint", sku: "CHAIR-460" })
  });
  assert.equal(intent, null);
});

test("non-json is null", async () => {
  const intent = await parseWithLlm({
    text: "поставь кресло",
    vocabulary,
    llm: async () => ({ ok: true, text: "не json" })
  });
  assert.equal(intent, null);
});

test("a failed llm call is null", async () => {
  const intent = await parseWithLlm({
    text: "поставь кресло",
    vocabulary,
    llm: async () => ({ ok: false, reason: "timeout" })
  });
  assert.equal(intent, null);
});

test("more than two skus is null", async () => {
  const intent = await parseWithLlm({
    text: "расстояние между всем",
    vocabulary,
    llm: llmReturning({
      type: "command",
      action: "distance",
      skus: ["CHAIR-460", "DESK-TOP-1800", "MON-613-366"]
    })
  });
  assert.equal(intent, null);
});

test("unclear from the model is null", async () => {
  const intent = await parseWithLlm({
    text: "апвыапр",
    vocabulary,
    llm: llmReturning({ type: "unclear" })
  });
  assert.equal(intent, null);
});

test("blank text skips the model and a long phrase is clipped to 300 characters", async () => {
  let calls = 0;
  const blank = await parseWithLlm({
    text: "  \n\t",
    vocabulary,
    llm: async () => {
      calls += 1;
      return { ok: false, reason: "network" };
    }
  });
  assert.equal(blank, null);
  assert.equal(calls, 0);

  let user = "";
  await parseWithLlm({
    text: `  ${"я".repeat(400)}`,
    vocabulary,
    llm: async ({ user: phrase }) => {
      user = phrase;
      return { ok: false, reason: "network" };
    }
  });
  assert.equal(user.length, 300);
  assert.equal(user.startsWith("я"), true);
});
