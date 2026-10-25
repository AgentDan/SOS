import test from "node:test";
import assert from "node:assert/strict";
import { checkReply } from "./check-reply.js";

const rules = {
  maxWords: 35,
  emoji: true,
  noPromises: true,
  noPressure: true,
  bannedStems: ["гарантир", "обещаю", "бесплатно", "скидк", "акци", "100%", "навсегда", "лучш"],
  pressureStems: ["срочно", "только сегодня", "успей", "последн", "пока не поздно"]
};

function verdict(template, candidate, extra = {}) {
  return checkReply({ template, candidate, rules: { ...rules, ...extra } });
}

test("a normal candidate passes, including one emoji", () => {
  assert.deepEqual(verdict("Готово, добавил: кресло.", "Готово, кресло уже на месте."), { ok: true });
  assert.deepEqual(verdict("Готово, добавил: кресло.", "Готово, кресло уже на месте 😊."), { ok: true });
});

test("comma and dot decimals are the same number", () => {
  assert.deepEqual(verdict("Высота 73,5 см.", "Сейчас высота 73.5 см."), { ok: true });
  assert.deepEqual(verdict("Отступ 10 см.", "Отступ остаётся 10 см."), { ok: true });
  assert.deepEqual(verdict("Отступ 10 см.", "Отступ уже 12 см."), { ok: false, reason: "number_changed" });
  assert.deepEqual(verdict("Отступ 10 см.", "Отступ десять см."), { ok: false, reason: "number_changed" });
  assert.deepEqual(verdict("Отступ 10 см.", "Отступ 10 см и ещё 2."), { ok: false, reason: "number_changed" });
});

test("an empty candidate is rejected", () => {
  assert.deepEqual(verdict("Готово.", ""), { ok: false, reason: "empty" });
  assert.deepEqual(verdict("Готово.", "   "), { ok: false, reason: "empty" });
  assert.deepEqual(verdict("Готово.", "..."), { ok: false, reason: "empty" });
});

test("three sentences or too many words are too long", () => {
  assert.deepEqual(verdict("Готово.", "Раз. Два. Три."), { ok: false, reason: "too_long" });
  assert.deepEqual(
    verdict("Готово.", "раз два три четыре пять.", { maxWords: 4 }),
    { ok: false, reason: "too_long" }
  );
});

test("a promise stem is a banned word", () => {
  assert.deepEqual(verdict("Готово, кресло на месте.", "Я гарантирую, кресло на месте."), {
    ok: false,
    reason: "banned_word"
  });
  assert.deepEqual(verdict("Это 100% готово.", "Это 100% ваше кресло."), { ok: false, reason: "banned_word" });
});

test("a pressure stem is rejected", () => {
  assert.deepEqual(verdict("Готово, кресло на месте.", "Это срочно, кресло на месте."), {
    ok: false,
    reason: "pressure"
  });
  assert.deepEqual(verdict("Готово.", "Успей забрать кресло."), { ok: false, reason: "pressure" });
});

test("emoji follows the rule flag", () => {
  assert.deepEqual(verdict("Готово, кресло на месте.", "Готово, кресло на месте 😊.", { emoji: false }), {
    ok: false,
    reason: "emoji"
  });
  assert.deepEqual(verdict("Готово.", "Готово 😊👍."), { ok: false, reason: "emoji" });
});

test("a link or address is rejected", () => {
  assert.deepEqual(verdict("Готово, кресло на месте.", "Смотрите www.shop.ru, кресло на месте."), {
    ok: false,
    reason: "link"
  });
  assert.deepEqual(verdict("Готово.", "Подробности http://shop.ru тут."), { ok: false, reason: "link" });
  assert.deepEqual(verdict("Готово.", "Напишите на a@b.ru, кресло готово."), { ok: false, reason: "link" });
});

test("a cyrillic template requires cyrillic in the candidate", () => {
  assert.deepEqual(verdict("Готово, кресло на месте.", "Done, the chair is in place."), {
    ok: false,
    reason: "language"
  });
});
