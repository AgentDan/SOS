import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_LABELS,
  checkKnobValue,
  describeValue,
  getAtPath,
  knobPath,
  knobsForSection,
  labelFor,
  leafMatches,
  pathKey,
  setAtPath
} from "./form-tree.js";

test("describeValue names every kind of form field", () => {
  assert.equal(describeValue("Алекс"), "text");
  assert.equal(describeValue("я".repeat(80)), "text");
  assert.equal(describeValue("я".repeat(81)), "longtext");
  assert.equal(describeValue("две\nстроки"), "longtext");
  assert.equal(describeValue(0), "number");
  assert.equal(describeValue(-12), "number");
  assert.equal(describeValue(1.5), "number");
  assert.equal(describeValue(true), "boolean");
  assert.equal(describeValue(false), "boolean");
  assert.equal(describeValue([]), "strings");
  assert.equal(describeValue(["дешевл"]), "strings");
  assert.equal(describeValue([{ id: "delivery" }]), "objects");
  assert.equal(describeValue(["слово", { id: "x" }]), "objects");
  assert.equal(describeValue({}), "group");
  assert.equal(describeValue({ greeting: "" }), "group");
  assert.equal(describeValue(null), "unknown");
  assert.equal(describeValue(undefined), "unknown");
  assert.equal(describeValue(NaN), "unknown");
  assert.equal(describeValue(Infinity), "unknown");
  assert.equal(describeValue([1, 2]), "unknown");
  assert.equal(describeValue(["a", 1]), "unknown");
  assert.equal(describeValue([null]), "unknown");
});

test("setAtPath returns a copy and keeps the original", () => {
  const source = {
    low: 35,
    gains: { pause: 8, decline: -12 },
    faq: [{ question: "a", answer: "b" }]
  };
  const next = setAtPath(source, ["faq", 0, "answer"], "c");
  const paused = setAtPath(source, ["gains", "pause"], 9);
  assert.equal(source.faq[0].answer, "b");
  assert.equal(source.gains.pause, 8);
  assert.equal(source.low, 35);
  assert.equal(next.faq[0].answer, "c");
  assert.equal(next.faq[0].question, "a");
  assert.equal(next.low, 35);
  assert.notEqual(next, source);
  assert.notEqual(next.faq, source.faq);
  assert.notEqual(next.faq[0], source.faq[0]);
  assert.equal(next.gains, source.gains);
  assert.equal(paused.gains.pause, 9);
  assert.notEqual(paused.gains, source.gains);
  assert.deepEqual(Object.keys(setAtPath({ a: 1, b: 2, c: 3 }, ["b"], 9)), ["a", "b", "c"]);
});

test("setAtPath throws when the path is missing", () => {
  assert.throws(() => setAtPath({ a: 1 }, ["nope"], 1), /nope/);
  assert.throws(() => setAtPath({ a: { b: 1 } }, ["a", "c"], 1), /a\.c/);
  assert.throws(() => setAtPath({ faq: [{ answer: "b" }] }, ["faq", 3], 1), /faq\.3/);
  assert.throws(() => setAtPath({ a: "text" }, ["a", "b"], 1), /a\.b/);
  assert.throws(() => setAtPath({ a: 1 }, [], 1), /Путь не задан/);
  assert.throws(() => setAtPath(null, ["a"], 1), /a/);
});

test("getAtPath and pathKey read a path without changing it", () => {
  const source = { gains: { pause: 8 }, faq: [{ question: "Как доставка?" }] };
  assert.equal(getAtPath(source, ["gains", "pause"]), 8);
  assert.equal(getAtPath(source, ["faq", 0, "question"]), "Как доставка?");
  assert.equal(getAtPath(source, []), source);
  assert.equal(getAtPath(source, ["faq", 2]), undefined);
  assert.equal(getAtPath(source, ["missing"]), undefined);
  assert.equal(pathKey(["gains", "pause"]), "gains.pause");
  assert.equal(pathKey(["faq", 0, "question"]), "faq.0.question");
  assert.equal(pathKey([]), "");
});

test("knobsForSection drops star paths and keeps registry order", () => {
  const knobs = [
    { id: "low", section: "director", path: "low" },
    { id: "price", section: "catalog", path: "products.*.priceEur" },
    { id: "pause", section: "director", path: "gains.pause" },
    { id: "humor", section: "consultant", path: "humor" },
    { id: "persona", section: "director", path: "personas.*.name" },
    { id: "blank", section: "director", path: "" },
    null,
    { id: "no-path", section: "director" }
  ];
  assert.deepEqual(
    knobsForSection(knobs, "director").map((knob) => knob.id),
    ["low", "pause"]
  );
  assert.deepEqual(knobsForSection(knobs, "catalog"), []);
  assert.deepEqual(knobPath({ path: "gains.pause" }), ["gains", "pause"]);
  assert.deepEqual(knobPath({ path: "faq.0.question" }), ["faq", 0, "question"]);
  assert.deepEqual(knobPath({ path: "output.maxWords" }), ["output", "maxWords"]);
});

test("checkKnobValue accepts an in-range number and rejects the rest", () => {
  const low = { type: "number", min: 0, max: 100 };
  assert.deepEqual(checkKnobValue(low, 35), { ok: true, value: 35, message: "" });
  assert.deepEqual(checkKnobValue(low, 0), { ok: true, value: 0, message: "" });
  assert.deepEqual(checkKnobValue(low, 100), { ok: true, value: 100, message: "" });
  assert.deepEqual(checkKnobValue(low, "35"), { ok: true, value: 35, message: "" });
  assert.equal(typeof checkKnobValue(low, "35").value, "number");
  assert.deepEqual(checkKnobValue(low, "35.0"), { ok: true, value: 35, message: "" });
  assert.deepEqual(checkKnobValue(low, 150), { ok: false, value: 150, message: "от 0 до 100" });
  assert.deepEqual(checkKnobValue(low, -1), { ok: false, value: -1, message: "от 0 до 100" });
  assert.equal(checkKnobValue(low, "сто").message, "Введите число");
  assert.equal(checkKnobValue(low, "").ok, false);
  assert.equal(checkKnobValue(low, "1.").ok, false);
  assert.equal(checkKnobValue({ type: "number", min: 1 }, 0).message, "не меньше 1");
  assert.equal(checkKnobValue({ type: "number", max: 5 }, 6).message, "не больше 5");
  assert.equal(checkKnobValue({ type: "number" }, 4).ok, true);
});

test("checkKnobValue checks enum and boolean", () => {
  const formality = { type: "enum", options: ["вы", "ты"] };
  assert.deepEqual(checkKnobValue(formality, "вы"), { ok: true, value: "вы", message: "" });
  assert.equal(checkKnobValue(formality, "Вы").message, "Нет такого варианта");
  assert.equal(checkKnobValue({ type: "enum" }, "вы").ok, false);
  assert.equal(checkKnobValue({ type: "boolean" }, true).ok, true);
  assert.equal(checkKnobValue({ type: "boolean" }, false).ok, true);
  assert.equal(checkKnobValue({ type: "boolean" }, "true").message, "Нужно да или нет");
  assert.equal(checkKnobValue({ type: "string" }, "вы").message, "Неизвестный тип ручки");
});

test("leafMatches searches the label, the key and the value", () => {
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", ""), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", "   "), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", null), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", "ПРИВ"), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", "greet"), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", "ЗДРАВСТВУЙТЕ"), true);
  assert.equal(leafMatches("Приветствие", "greeting", "Здравствуйте", "нет"), false);
  assert.equal(leafMatches("Ответы", "replies", ["Записал.", "Не нашёл такого."], "такого"), true);
  assert.equal(leafMatches("Юмор", "humor", 1, "1"), true);
});

test("labelFor prefers the knob registry, then known words, then the key", () => {
  const knobs = [
    { path: "low", label: "Нижний порог терпения" },
    { path: "gains.pause", label: "  Терпение за паузу  " },
    { path: "products.*.priceEur", label: "Цена товара" },
    { path: "greeting", label: "   " }
  ];
  assert.equal(labelFor(["low"], knobs), "Нижний порог терпения");
  assert.equal(labelFor(["gains", "pause"], knobs), "Терпение за паузу");
  assert.equal(labelFor(["greeting"], knobs), "Приветствие");
  assert.equal(labelFor(["gains"], []), "Как меняется терпение");
  assert.equal(labelFor(["replies", "answer_ok"], knobs), "answer_ok");
  assert.equal(labelFor(["low"], []), "low");
  assert.equal(labelFor(["declinesBeforeAssume"], []), "declinesBeforeAssume");
  assert.equal(FIELD_LABELS.name, "Имя консультанта");
  assert.equal(FIELD_LABELS.faq, "Частые вопросы");
  assert.equal(FIELD_LABELS.closing, "Завершение продажи");
  assert.equal(FIELD_LABELS.loyalty, "Постоянные клиенты");
  assert.equal(FIELD_LABELS.confirm, "Подтверждение");
});

test("garbage inputs do not throw", () => {
  assert.equal(getAtPath(null, ["a"]), undefined);
  assert.equal(getAtPath({ a: 1 }, null), undefined);
  assert.equal(getAtPath({ a: 1 }, "a"), undefined);
  assert.equal(pathKey(null), "");
  assert.deepEqual(knobsForSection(null, "director"), []);
  assert.deepEqual(knobsForSection([], null), []);
  assert.deepEqual(knobsForSection("knobs", "director"), []);
  assert.deepEqual(knobPath(null), []);
  assert.deepEqual(knobPath({}), []);
  assert.deepEqual(knobPath({ path: 12 }), []);
  assert.equal(checkKnobValue(null, 1).ok, false);
  assert.equal(checkKnobValue(undefined, true).message, "Ручка указана неверно");
  assert.equal(leafMatches(null, null, null, null), true);
  assert.equal(leafMatches(undefined, undefined, undefined, "x"), false);
  assert.equal(labelFor(null, null), "");
  assert.equal(labelFor([], [{ path: "low", label: "Нижний порог терпения" }]), "");
  assert.equal(describeValue(new Date()), "unknown");
  assert.equal(describeValue(() => {}), "unknown");
});
