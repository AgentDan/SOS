import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_TEXT, reply } from "../voice/reply.js";
import { validateReplyOutput } from "./contracts.js";

const templates = {
  answer_ok: "Записал.",
  unclear: "Не совсем понял. Скажите иначе, пожалуйста.",
  command_added: "Готово, добавил: {item}.",
  smalltalk: "альфа бета гамма"
};

function result(overrides) {
  return {
    ok: true,
    kind: "answer",
    sceneChanged: false,
    facts: {},
    reasonCode: null,
    say: { code: "answer_ok", params: {} },
    ...overrides
  };
}

test("template replies satisfy validateReplyOutput", () => {
  const samples = [
    reply({
      result: result(),
      context: { nextQuestion: { textFallback: "Чем вы в основном занимаетесь за столом?" } },
      templates,
      names: {},
      maxWords: 35
    }),
    reply({
      result: result({
        ok: false,
        kind: "unclear",
        reasonCode: "unclear",
        say: { code: "missing", params: {} }
      }),
      context: { nextQuestion: null },
      templates: {},
      names: {},
      maxWords: 35
    }),
    reply({
      result: result({ kind: "talk", say: { code: "smalltalk", params: {} } }),
      context: { nextQuestion: null },
      templates,
      names: { "CHAIR-460": "кресло" },
      maxWords: 2
    }),
    reply({
      result: result({
        kind: "command",
        say: { code: "command_added", params: { sku: "CHAIR-460" } }
      }),
      context: { nextQuestion: null },
      templates,
      names: { "CHAIR-460": "кресло" },
      maxWords: 35
    })
  ];

  assert.equal(samples[1].text, FALLBACK_TEXT);
  assert.equal(samples[2].text, "альфа бета…");
  for (const spoken of samples) {
    assert.deepEqual(validateReplyOutput(spoken), { ok: true, errors: [] });
  }
});
