import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_TEXT, reply } from "./reply.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const consultant = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "data", "consultant.json"), "utf8")
);
const templates = consultant.draft.replies;

const SAY_CODES = [
  "answer_ok",
  "unclear",
  "not_implemented",
  "not_found",
  "unknown_sku",
  "limit",
  "cannot_remove_support",
  "nothing_cheaper",
  "command_added",
  "command_removed",
  "command_replaced",
  "faq_answer",
  "smalltalk",
  "cheaper_done"
];

const names = {
  "CHAIR-460": "кресло",
  "DESK-LEGS-1400": "опоры стола",
  "DESK-TOP-1400": "стол 140",
  "DESK-TOP-1800": "стол 180",
  "MON-613-366": "монитор"
};

const QUESTION = "Чем вы в основном занимаетесь за столом?";

function quiet() {
  return { profile: {}, sceneSkus: [], nextQuestion: null };
}

function withQuestion() {
  return { profile: {}, sceneSkus: [], nextQuestion: { textFallback: QUESTION } };
}

function sayResult({ ok, kind, code, params, facts }) {
  return {
    ok,
    kind,
    sceneChanged: false,
    facts: facts ?? {},
    reasonCode: ok ? null : "unclear",
    say: { code, params: params ?? {} }
  };
}

function speak(result, extra = {}) {
  return reply({
    result,
    context: extra.context ?? quiet(),
    templates: extra.templates ?? templates,
    names: extra.names ?? names,
    maxWords: extra.maxWords ?? 35
  });
}

test("fallback text is the only built-in line", () => {
  assert.equal(FALLBACK_TEXT, "Не удалось ответить.");
});

test("every known say code produces a non-empty template line", () => {
  const samples = {
    answer_ok: { ok: true, kind: "answer" },
    unclear: { ok: false, kind: "unclear", params: { reason: "no_match" } },
    not_implemented: { ok: false, kind: "command" },
    not_found: { ok: false, kind: "command", params: { sku: "CHAIR-460" } },
    unknown_sku: { ok: false, kind: "command", params: { sku: "NOPE" } },
    limit: { ok: false, kind: "command", params: { sku: "CHAIR-460" } },
    cannot_remove_support: { ok: false, kind: "command", params: { sku: "DESK-LEGS-1400" } },
    nothing_cheaper: { ok: false, kind: "talk" },
    command_added: { ok: true, kind: "command", params: { sku: "CHAIR-460" } },
    command_removed: { ok: true, kind: "command", params: { sku: "CHAIR-460" } },
    command_replaced: {
      ok: true,
      kind: "command",
      params: { sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" }
    },
    faq_answer: { ok: true, kind: "talk", params: { faqId: "delivery" }, facts: { answer: "Привезём." } },
    smalltalk: { ok: true, kind: "talk" },
    cheaper_done: {
      ok: true,
      kind: "talk",
      params: { sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400", savedEur: 70 }
    }
  };

  for (const code of SAY_CODES) {
    const sample = samples[code];
    const spoken = speak(
      sayResult({
        ok: sample.ok,
        kind: sample.kind,
        code,
        params: sample.params,
        facts: sample.facts
      })
    );
    assert.equal(spoken.via, "template", code);
    assert.equal(typeof spoken.text, "string", code);
    assert.ok(spoken.text.length > 0, code);
    assert.equal(spoken.text.includes(code), false, code);
  }
});

test("item and newItem come from names, and a missing label stays the sku", () => {
  const replaced = speak(
    sayResult({
      ok: true,
      kind: "command",
      code: "command_replaced",
      params: { sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" }
    })
  );
  assert.equal(replaced.text, "Готово, заменил: стол 180 → стол 140.");

  const added = speak(
    sayResult({
      ok: true,
      kind: "command",
      code: "command_added",
      params: { sku: "CHAIR-460" }
    }),
    { names: {} }
  );
  assert.equal(added.text, "Готово, добавил: CHAIR-460.");
});

test("savedEur is taken from params and is not invented from facts", () => {
  const priced = speak(
    sayResult({
      ok: true,
      kind: "talk",
      code: "cheaper_done",
      params: { sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400", savedEur: 70 },
      facts: { savedEur: 1 }
    })
  );
  assert.equal(priced.text, "Сделал дешевле: стол 180 → стол 140. Экономия 70 €.");

  const missing = speak(
    sayResult({
      ok: true,
      kind: "talk",
      code: "cheaper_done",
      params: { sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" },
      facts: { savedEur: 99 }
    })
  );
  assert.equal(missing.text.includes("99"), false);
  assert.equal(missing.text, "Сделал дешевле: стол 180 → стол 140. Экономия  €.");
});

test("faq answer is the fact, and limit_max is chosen only when max is present", () => {
  const faq = speak(
    sayResult({
      ok: true,
      kind: "talk",
      code: "faq_answer",
      facts: { answer: "Привезём завтра." }
    })
  );
  assert.equal(faq.text, "Привезём завтра.");

  const capped = speak(
    sayResult({
      ok: false,
      kind: "command",
      code: "limit",
      params: { sku: "CHAIR-460", max: 12 }
    })
  );
  assert.equal(capped.text, "Больше 12 предметов на сцене не поместится.");

  const plain = speak(
    sayResult({
      ok: false,
      kind: "command",
      code: "limit",
      params: { sku: "CHAIR-460" }
    })
  );
  assert.equal(plain.text, "Больше не поместится.");
});

test("a missing template falls back by ok, then to the built-in line", () => {
  const okFallback = speak(
    sayResult({ ok: true, kind: "command", code: "command_added", params: { sku: "CHAIR-460" } }),
    { templates: { answer_ok: "Записал." } }
  );
  assert.equal(okFallback.text, "Записал.");

  const refused = speak(
    sayResult({ ok: false, kind: "command", code: "unknown_sku" }),
    { templates: { unclear: "Не совсем понял. Скажите иначе, пожалуйста.", answer_ok: "Записал." } }
  );
  assert.equal(refused.text, "Не совсем понял. Скажите иначе, пожалуйста.");

  const brokenOk = speak(
    sayResult({ ok: true, kind: "command", code: "command_added" }),
    { templates: { unclear: "Не совсем понял. Скажите иначе, пожалуйста." } }
  );
  assert.equal(brokenOk.text, FALLBACK_TEXT);

  const broken = speak(
    sayResult({ ok: false, kind: "unclear", code: "unclear" }),
    { templates: {} }
  );
  assert.equal(broken.text, FALLBACK_TEXT);
});

test("maxWords clips on a word boundary, and a bad limit does not clip", () => {
  const result = sayResult({ ok: true, kind: "talk", code: "smalltalk" });
  const source = { smalltalk: "альфа бета гамма дельта" };

  assert.equal(speak(result, { templates: source, maxWords: 2 }).text, "альфа бета…");
  assert.equal(speak(result, { templates: source, maxWords: 4 }).text, "альфа бета гамма дельта");
  assert.equal(speak(result, { templates: source, maxWords: 0 }).text, "альфа бета гамма дельта");
  assert.equal(speak(result, { templates: source, maxWords: "2" }).text, "альфа бета гамма дельта");
  assert.equal(speak(result, { templates: source, maxWords: Number.NaN }).text, "альфа бета гамма дельта");
});

test("distance text comes from templates and leaves the number for the client", () => {
  const measured = speak(
    sayResult({
      ok: true,
      kind: "command",
      code: "distance_measure",
      params: { a: "монитор", b: "кресло" }
    })
  );
  assert.equal(measured.via, "template");
  assert.equal(measured.text, "Расстояние между монитор и кресло: {distance}.");
  assert.equal(measured.fallback, "Для такого замера нужны две штуки на сцене.");

  const missing = speak(
    sayResult({
      ok: false,
      kind: "command",
      code: "distance_not_on_scene",
      params: { name: "кресло" }
    })
  );
  assert.equal(missing.text, "кресло нет на сцене.");

  const unclearDistance = speak(
    sayResult({ ok: false, kind: "command", code: "distance_unclear" })
  );
  assert.equal(
    unclearDistance.text,
    "Назовите два объекта, между которыми нужно измерить расстояние."
  );

  const needTwo = speak(sayResult({ ok: false, kind: "command", code: "distance_need_two" }));
  assert.equal(needTwo.text, "Для такого замера нужны две штуки на сцене.");

  const neutral = speak(
    sayResult({
      ok: true,
      kind: "command",
      code: "distance_measure",
      params: { a: "монитор", b: "стол" }
    }),
    {
      templates: {
        distance_measure: "Расстояние между {a} и {b}: {distance}.",
        unclear: "Не совсем понял. Скажите иначе, пожалуйста."
      }
    }
  );
  assert.equal(neutral.text, "Расстояние между монитор и стол: {distance}.");
  assert.equal(neutral.fallback, "Не совсем понял. Скажите иначе, пожалуйста.");
});

test("the next question is appended only after a successful answer", () => {
  const answer = speak(
    sayResult({ ok: true, kind: "answer", code: "answer_ok" }),
    { context: withQuestion() }
  );
  assert.equal(answer.text, `Записал. ${QUESTION}`);

  const command = speak(
    sayResult({ ok: true, kind: "command", code: "command_added", params: { sku: "MON-613-366" } }),
    { context: withQuestion() }
  );
  assert.equal(command.text, "Готово, добавил: монитор.");

  const refused = speak(
    sayResult({ ok: false, kind: "answer", code: "not_found" }),
    { context: withQuestion() }
  );
  assert.equal(refused.text, "Не нашёл такого. Уточните, пожалуйста.");

  const clipped = speak(
    sayResult({ ok: true, kind: "answer", code: "answer_ok" }),
    { context: withQuestion(), maxWords: 1 }
  );
  assert.equal(clipped.text, "Записал.…");
});
