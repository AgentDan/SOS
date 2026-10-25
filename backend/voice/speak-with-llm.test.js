import test from "node:test";
import assert from "node:assert/strict";
import { speakWithLlm } from "./speak-with-llm.js";

const rules = {
  maxWords: 35,
  emoji: true,
  noPromises: true,
  noPressure: true,
  bannedStems: ["гарантир", "обещаю", "бесплатно", "скидк", "акци", "100%", "навсегда", "лучш"],
  pressureStems: ["срочно", "только сегодня", "успей", "последн", "пока не поздно"],
  aiSkipCodes: ["answer_ok", "unclear", "smalltalk"]
};

const SAMPLES = [
  ["Готово, добавил: кресло.", "Готово, кресло уже на месте."],
  ["Стол высоковат: 103 см, для вашего роста лучше около 73 см.", "Стол высоковат: сейчас 103 см, удобнее около 73 см."],
  ["Расстояние между монитор и стол: 10 см.", "Между монитором и столом 10 см."],
  ["Сделал дешевле: стол 180 → стол 140. Экономия 70 €.", "Вышло дешевле: стол 180 заменил на стол 140, экономия 70 €."],
  ["Для вашего роста всё стоит удобно.", "Похоже, для вашего роста всё стоит удобно."]
];

function answering(text) {
  return async () => ({ ok: true, text: JSON.stringify({ text }) });
}

test("a good paraphrase is returned as an ai reply", async () => {
  let seen;
  for (const [template, text] of SAMPLES) {
    const spoken = await speakWithLlm({
      template,
      result: { kind: "command", say: { code: "command_added" } },
      rules,
      llm: async (request) => {
        seen = request;
        return { ok: true, text: JSON.stringify({ text }) };
      }
    });
    assert.deepEqual(spoken, { text, via: "ai" });
  }
  assert.equal(seen.purpose, "voice");
  assert.match(seen.system, /Перефразируй реплику консультанта по продаже офисной мебели/);
  assert.match(seen.system, /Максимум 35 слов/);
  assert.equal(seen.user.includes("Для вашего роста всё стоит удобно."), true);
  assert.equal(seen.user.includes("command_added"), true);
  assert.equal(seen.user.includes("profile"), false);
  assert.equal(seen.user.includes("clientId"), false);
});

test("a changed number, a promise, a link, and a long line are dropped", async () => {
  const cases = [
    ["Расстояние между монитор и стол: 10 см.", "Между монитором и столом 12 см."],
    ["Готово, добавил: кресло.", "Гарантирую, кресло уже на месте."],
    ["Готово, добавил: кресло.", "Кресло на месте, подробности на www.shop.ru."],
    ["Готово.", `${"слово ".repeat(40).trim()}.`]
  ];
  for (const [template, text] of cases) {
    const spoken = await speakWithLlm({
      template,
      result: { kind: "command", say: { code: "command_added" } },
      rules,
      llm: answering(text)
    });
    assert.equal(spoken, null, text);
  }
});

test("non-json and a failed call return null", async () => {
  const broken = await speakWithLlm({
    template: "Готово, добавил: кресло.",
    result: { kind: "command", say: { code: "command_added" } },
    rules,
    llm: async () => ({ ok: true, text: "не json" })
  });
  assert.equal(broken, null);

  const failed = await speakWithLlm({
    template: "Готово, добавил: кресло.",
    result: { kind: "command", say: { code: "command_added" } },
    rules,
    llm: async () => ({ ok: false, reason: "timeout" })
  });
  assert.equal(failed, null);

  const thrown = await speakWithLlm({
    template: "Готово, добавил: кресло.",
    result: { kind: "command", say: { code: "command_added" } },
    rules,
    llm: async () => {
      throw new Error("boom");
    }
  });
  assert.equal(thrown, null);
});

test("skip codes and an answer do not call the model", async () => {
  let calls = 0;
  const llm = async () => {
    calls += 1;
    return { ok: true, text: JSON.stringify({ text: "Живая реплика вместо шаблона." }) };
  };
  for (const code of ["answer_ok", "unclear", "smalltalk"]) {
    const spoken = await speakWithLlm({
      template: "Записал.",
      result: { kind: "command", say: { code } },
      rules,
      llm
    });
    assert.equal(spoken, null, code);
  }
  const answer = await speakWithLlm({
    template: "Записал. Чем вы занимаетесь?",
    result: { kind: "answer", say: { code: "not_found" } },
    rules,
    llm
  });
  assert.equal(answer, null);
  assert.equal(calls, 0);
});
