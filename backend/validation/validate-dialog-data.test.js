import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readEnvelope } from "../config/load.js";
import { validateDialogData } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "data");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, name), "utf-8"));
}

function validPair() {
  return {
    questionnaire: structuredClone(loadJson("questionnaire.json")),
    catalog: structuredClone(readEnvelope("catalog"))
  };
}

function expectFail(run) {
  assert.throws(run, (err) => err instanceof Error && /Dialog data validation failed/.test(err.message));
}

test("valid dialog data passes", () => {
  assert.equal(validateDialogData(validPair()), true);
});

test("unknown question phase is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.questions[0].phase = "unknown_phase";
  expectFail(() => validateDialogData(data));
});

test("unknown dependsOn optionId is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.questions[3].dependsOn = [
    { questionId: "q_desk_width", optionId: "maybe" }
  ];
  expectFail(() => validateDialogData(data));
});

test("unknown inference.when optionId is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.inference[0].when.optionId = "maybe";
  expectFail(() => validateDialogData(data));
});

test("duplicate question id is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.questions[1].id = data.questionnaire.draft.questions[0].id;
  expectFail(() => validateDialogData(data));
});

test("phase order gap is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.phases[1].order = 3;
  data.questionnaire.draft.phases[2].order = 4;
  expectFail(() => validateDialogData(data));
});

test("invalid inference confidence is rejected", () => {
  const data = validPair();
  data.questionnaire.draft.inference[0].confidence = "maybe";
  expectFail(() => validateDialogData(data));
});

function loadSkeleton() {
  return {
    ...validPair(),
    consultant: structuredClone(loadJson("consultant.json")),
    director: structuredClone(loadJson("director.json")),
    sales: structuredClone(loadJson("sales.json")),
    commands: structuredClone(loadJson("commands.json")),
    aiRules: structuredClone(loadJson("ai-rules.json"))
  };
}

test("skeleton config sections pass validation", () => {
  assert.equal(validateDialogData(loadSkeleton()), true);
});

test("broken config envelope is rejected", () => {
  const data = loadSkeleton();
  data.consultant.section = "other";
  data.consultant.draftVersion = 1.5;
  data.consultant.history = {};
  assert.throws(
    () => validateDialogData(data),
    (err) =>
      err instanceof Error &&
      /consultant: section must be "consultant"/.test(err.message) &&
      /consultant: draftVersion must be an integer/.test(err.message) &&
      /consultant: history must be an array/.test(err.message)
  );
});

test("duplicate catalog need id is rejected", () => {
  const data = validPair();
  data.catalog.draft.needs[1].id = data.catalog.draft.needs[0].id;
  assert.throws(
    () => validateDialogData(data),
    (err) => err instanceof Error && /catalog: duplicate need id "desk_top_wide"/.test(err.message)
  );
});

test("need criteria type must exist in catalog types", () => {
  const data = validPair();
  data.catalog.draft.needs[0].criteria.type = "missing_type";
  assert.throws(
    () => validateDialogData(data),
    (err) =>
      err instanceof Error &&
      /catalog: need "desk_top_wide" criteria\.type references unknown type "missing_type"/.test(err.message)
  );
});

test("inference resultNeed must exist in catalog needs", () => {
  const data = validPair();
  data.questionnaire.draft.inference[0].resultNeed = "missing_need";
  assert.throws(
    () => validateDialogData(data),
    (err) =>
      err instanceof Error &&
      /questionnaire: inference "inf_wide_desk" resultNeed "missing_need" does not exist in catalog\.draft\.needs/.test(
        err.message
      )
  );
});

test("consultant faq entries need a unique id, words and an answer", () => {
  const duplicate = loadSkeleton();
  duplicate.consultant.draft.faq.push({
    id: "delivery",
    words: ["ещё"],
    answer: "ТЕСТ: текст ответа заполняет владелец"
  });
  assert.throws(
    () => validateDialogData(duplicate),
    (err) => err instanceof Error && /consultant: duplicate faq id "delivery"/.test(err.message)
  );

  const emptyId = loadSkeleton();
  emptyId.consultant.draft.faq[0].id = "";
  assert.throws(
    () => validateDialogData(emptyId),
    (err) => err instanceof Error && /consultant: faq id must be a non-empty string/.test(err.message)
  );

  const emptyWords = loadSkeleton();
  emptyWords.consultant.draft.faq[0].words = [""];
  assert.throws(
    () => validateDialogData(emptyWords),
    (err) =>
      err instanceof Error &&
      /consultant: faq "delivery" words must be a non-empty array of non-empty strings/.test(err.message)
  );

  const emptyAnswer = loadSkeleton();
  emptyAnswer.consultant.draft.faq[0].answer = "";
  assert.throws(
    () => validateDialogData(emptyAnswer),
    (err) =>
      err instanceof Error && /consultant: faq "delivery" answer must be a non-empty string/.test(err.message)
  );
});

test("consultant topics are optional arrays of non-empty strings", () => {
  const omitted = loadSkeleton();
  delete omitted.consultant.draft.topics;
  assert.equal(validateDialogData(omitted), true);

  const emptyList = loadSkeleton();
  emptyList.consultant.draft.topics = { cheaper: [], smalltalk: ["привет"] };
  assert.equal(validateDialogData(emptyList), true);

  const blank = loadSkeleton();
  blank.consultant.draft.topics.cheaper = ["дешевл", ""];
  assert.throws(
    () => validateDialogData(blank),
    (err) =>
      err instanceof Error &&
      /consultant: topics\.cheaper must be an array of non-empty strings/.test(err.message)
  );

  const missing = loadSkeleton();
  missing.consultant.draft.topics = { cheaper: ["дешевл"] };
  assert.throws(
    () => validateDialogData(missing),
    (err) =>
      err instanceof Error &&
      /consultant: topics\.smalltalk must be an array of non-empty strings/.test(err.message)
  );

  const notObject = loadSkeleton();
  notObject.consultant.draft.topics = ["дешевл"];
  assert.throws(
    () => validateDialogData(notObject),
    (err) => err instanceof Error && /consultant: topics must be an object/.test(err.message)
  );
});

test("consultant formality must be вы or ты", () => {
  const formal = loadSkeleton();
  formal.consultant.draft.formality = "ты";
  assert.equal(validateDialogData(formal), true);

  const data = loadSkeleton();
  data.consultant.draft.formality = "hello";
  assert.throws(
    () => validateDialogData(data),
    (err) =>
      err instanceof Error && /consultant: formality must be "вы" or "ты"/.test(err.message)
  );
});

test("command words and unique actions are required", () => {
  const ok = loadSkeleton();
  assert.equal(validateDialogData(ok), true);

  const duplicate = loadSkeleton();
  duplicate.commands.draft.commands.push({
    action: "add",
    words: ["ещё"]
  });
  assert.throws(
    () => validateDialogData(duplicate),
    (err) => err instanceof Error && /commands: duplicate action "add"/.test(err.message)
  );

  const emptyWords = loadSkeleton();
  emptyWords.commands.draft.commands[0].words = [""];
  assert.throws(
    () => validateDialogData(emptyWords),
    (err) =>
      err instanceof Error &&
      /commands: "add" words must be a non-empty array of non-empty strings/.test(err.message)
  );
});

test("commands limits.maxItems must be an integer >= 1", () => {
  const ok = loadSkeleton();
  ok.commands.draft.limits = { maxItems: 1 };
  assert.equal(validateDialogData(ok), true);

  const bad = loadSkeleton();
  bad.commands.draft.limits = { maxItems: 0 };
  assert.throws(
    () => validateDialogData(bad),
    (err) =>
      err instanceof Error && /commands: limits.maxItems must be an integer >= 1/.test(err.message)
  );
});

test("catalog product label is an optional non-empty string", () => {
  const chair = (data) => data.catalog.draft.products.find((item) => item.sku === "CHAIR-460");

  const kept = validPair();
  assert.equal(typeof chair(kept).label, "string");
  assert.ok(chair(kept).label.length > 0);
  assert.equal(validateDialogData(kept), true);

  const omitted = validPair();
  delete chair(omitted).label;
  assert.equal(validateDialogData(omitted), true);

  const empty = validPair();
  chair(empty).label = "";
  assert.throws(
    () => validateDialogData(empty),
    (err) =>
      err instanceof Error &&
      /catalog: product "CHAIR-460" label must be a non-empty string/.test(err.message)
  );

  const number = validPair();
  chair(number).label = 12;
  assert.throws(
    () => validateDialogData(number),
    (err) =>
      err instanceof Error &&
      /catalog: product "CHAIR-460" label must be a non-empty string/.test(err.message)
  );
});

test("catalog model3d is the glb object key of the product", () => {
  const ok = validPair();
  assert.equal(validateDialogData(ok), true);
  for (const product of ok.catalog.draft.products) {
    assert.equal(product.media.model3d, `${product.sku}.glb`);
  }
  for (const product of ok.catalog.published.products) {
    assert.equal(product.media.model3d, `${product.sku}.glb`);
  }

  const pathKey = validPair();
  pathKey.catalog.draft.products[0].media = { model3d: "/models/desk.glb" };
  assert.throws(
    () => validateDialogData(pathKey),
    (err) =>
      err instanceof Error &&
      /catalog: product ".*?" media\.model3d must be ".*\.glb"/.test(err.message)
  );
});

test("catalog product words must be a non-empty array of strings", () => {
  const ok = validPair();
  ok.catalog.draft.products[0].words = ["опор"];
  assert.equal(validateDialogData(ok), true);

  const bad = validPair();
  bad.catalog.draft.products[0].words = [""];
  assert.throws(
    () => validateDialogData(bad),
    (err) =>
      err instanceof Error &&
      /catalog: product ".*?" words must be a non-empty array of non-empty strings/.test(err.message)
  );
});

test("consultant replies are an optional map of templates", () => {
  const omitted = loadSkeleton();
  delete omitted.consultant.draft.replies;
  assert.equal(validateDialogData(omitted), true);

  const allowed = loadSkeleton();
  allowed.consultant.draft.replies = {
    sample: "{item} {newItem} {savedEur} {max} {answer} {question}"
  };
  assert.equal(validateDialogData(allowed), true);

  const notObject = loadSkeleton();
  notObject.consultant.draft.replies = ["Записал."];
  assert.throws(
    () => validateDialogData(notObject),
    (err) => err instanceof Error && /consultant: replies must be an object/.test(err.message)
  );

  const empty = loadSkeleton();
  empty.consultant.draft.replies = { answer_ok: "" };
  assert.throws(
    () => validateDialogData(empty),
    (err) =>
      err instanceof Error &&
      /consultant: replies "answer_ok" must be a non-empty string/.test(err.message)
  );

  const placeholder = loadSkeleton();
  placeholder.consultant.draft.replies = { cheaper_done: "Экономия {price} €." };
  assert.throws(
    () => validateDialogData(placeholder),
    (err) =>
      err instanceof Error &&
      /consultant: replies "cheaper_done" has unknown placeholder "\{price\}"/.test(err.message)
  );
});

test("ai-rules output.noContradict must be a boolean", () => {
  const data = loadSkeleton();
  data.aiRules.draft.output.noContradict = "yes";
  assert.throws(
    () => validateDialogData(data),
    (err) =>
      err instanceof Error &&
      /ai-rules: output\.noContradict must be a boolean/.test(err.message)
  );
});
