import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { validateDialogData } from "./validate-dialog-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "storage", "config");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, name), "utf-8"));
}

function validPair() {
  return {
    questionnaire: structuredClone(loadJson("questionnaire.json")),
    catalog: structuredClone(loadJson("catalog.json"))
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
