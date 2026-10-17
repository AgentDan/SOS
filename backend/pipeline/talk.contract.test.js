import test from "node:test";
import assert from "node:assert/strict";
import { runTalk } from "../talk/talk.js";
import { validateExecutorResult } from "./contracts.js";

const catalog = {
  products: [
    { sku: "LEG", type: "legs", priceEur: 80, alwaysPresent: true },
    { sku: "HI", type: "chair", priceEur: 30 },
    { sku: "LO", type: "chair", priceEur: 10 }
  ]
};

const consultant = {
  faq: [{ id: "delivery", words: ["доставк"], answer: "ТЕСТ: текст ответа заполняет владелец" }]
};

function scene(skus, apply) {
  return {
    skus,
    apply:
      apply ??
      ((change) => ({ ok: true, reasonCode: null, sceneChanged: true, skus, change }))
  };
}

function intent(topic, faqId) {
  const payload = { topic };
  if (faqId !== undefined) payload.faqId = faqId;
  return { type: "talk", source: "text", payload };
}

const cases = [
  { name: "faq ok", intent: intent("faq", "delivery"), skus: ["LEG"] },
  { name: "faq missing", intent: intent("faq", "missing"), skus: ["LEG"] },
  { name: "faq without id", intent: intent("faq"), skus: ["LEG"] },
  { name: "smalltalk", intent: intent("smalltalk"), skus: ["LEG"] },
  { name: "unknown topic", intent: intent("weather"), skus: ["LEG"] },
  { name: "cheaper ok", intent: intent("cheaper"), skus: ["LEG", "HI"] },
  { name: "nothing cheaper", intent: intent("cheaper"), skus: ["LEG"] },
  {
    name: "apply refusal",
    intent: intent("cheaper"),
    skus: ["LEG", "HI"],
    apply: () => ({ ok: false, reasonCode: "limit" })
  },
  {
    name: "apply without a code",
    intent: intent("cheaper"),
    skus: ["LEG", "HI"],
    apply: () => ({ ok: false })
  }
];

test("runTalk results satisfy the executor contract", () => {
  for (const row of cases) {
    const result = runTalk({
      intent: row.intent,
      catalog,
      consultant,
      scene: scene(row.skus, row.apply)
    });
    assert.equal(typeof result.say.code, "string", row.name);
    assert.deepEqual(validateExecutorResult(result), { ok: true, errors: [] }, row.name);
  }
});
