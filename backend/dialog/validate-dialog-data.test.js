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
