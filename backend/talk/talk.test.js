import test from "node:test";
import assert from "node:assert/strict";
import { runTalk } from "./talk.js";

const faq = [
  { id: "delivery", words: ["доставк"], answer: "ТЕСТ: текст ответа заполняет владелец" },
  { id: "warranty", words: ["гаранти"], answer: "ТЕСТ: текст ответа заполняет владелец" }
];

function scene(skus) {
  const calls = [];
  return {
    skus,
    calls,
    apply: (change) => {
      calls.push(change);
      return { ok: true, sceneChanged: true };
    }
  };
}

function talk(topic, faqId) {
  const payload = { topic };
  if (faqId !== undefined) payload.faqId = faqId;
  return { type: "talk", source: "text", payload };
}

test("faq is answered by id from a layer or an envelope draft", () => {
  const board = scene([]);
  const layer = runTalk({
    intent: talk("faq", "warranty"),
    consultant: { faq },
    scene: board
  });
  assert.equal(layer.ok, true);
  assert.equal(layer.kind, "talk");
  assert.equal(layer.sceneChanged, false);
  assert.equal(layer.reasonCode, null);
  assert.deepEqual(layer.facts, {
    topic: "faq",
    faqId: "warranty",
    answer: "ТЕСТ: текст ответа заполняет владелец"
  });
  assert.deepEqual(layer.say, { code: "faq_answer", params: { faqId: "warranty" } });
  assert.deepEqual(board.calls, []);

  const envelope = runTalk({
    intent: talk("faq", "delivery"),
    consultant: { draft: { faq }, published: { faq: [] } },
    scene: scene([])
  });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.facts.faqId, "delivery");
  assert.equal(envelope.facts.answer, faq[0].answer);
});

test("unknown faqId is not_found", () => {
  const board = scene(["CHAIR"]);
  const result = runTalk({
    intent: talk("faq", "missing"),
    consultant: { faq },
    scene: board
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "not_found");
  assert.equal(result.say.code, "not_found");
  assert.equal(result.sceneChanged, false);
  assert.deepEqual(board.calls, []);
});

test("faq without faqId is not_found", () => {
  const result = runTalk({
    intent: talk("faq"),
    consultant: { faq },
    scene: scene([])
  });
  assert.equal(result.reasonCode, "not_found");
  assert.equal(result.say.code, "not_found");
  assert.deepEqual(result.facts, { topic: "faq" });
});

test("smalltalk leaves the scene untouched", () => {
  const board = scene(["CHAIR"]);
  const result = runTalk({ intent: talk("smalltalk"), scene: board });
  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, false);
  assert.deepEqual(result.facts, { topic: "smalltalk" });
  assert.deepEqual(result.say, { code: "smalltalk", params: {} });
  assert.deepEqual(board.calls, []);
});

test("ergo answers from the scene and does not apply a change", () => {
  const board = scene(["DESK-TOP-1800"]);
  board.ergo = {
    issues: [
      { code: "desk_too_high", sku: "DESK-TOP-1800", actualMm: 1030, targetMm: 726, deltaMm: 304 }
    ]
  };
  const result = runTalk({
    intent: talk("ergo"),
    catalog: { products: [{ sku: "DESK-TOP-1800", label: "стол 180" }] },
    scene: board
  });
  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, false);
  assert.equal(result.say.code, "ergo_desk_too_high");
  assert.deepEqual(result.say.params, { actual: 103, target: 73, delta: 30, item: "стол 180" });
  assert.equal(result.facts.topic, "ergo");
  assert.equal(result.facts.issues.length, 1);
  assert.deepEqual(board.calls, []);
});

test("unknown topic is not_implemented", () => {
  const board = scene(["CHAIR"]);
  const result = runTalk({ intent: talk("weather"), catalog: { products: [] }, scene: board });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "not_implemented");
  assert.equal(result.say.code, "not_implemented");
  assert.deepEqual(result.facts, { topic: "weather" });
  assert.deepEqual(board.calls, []);
});
