import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readQuestionnaire } from "../config/load.js";
import { applyAnswer } from "./answer-service.js";

const questionnaire = readQuestionnaire();
const catalog = readCatalog();

function freshProfile() {
  return {
    clientId: "answer-test",
    scenario: null,
    status: "in_progress",
    fields: {},
    needs: [],
    confirmedNeeds: [],
    rejectedNeeds: []
  };
}

function pendingWideProfile() {
  return {
    ...freshProfile(),
    fields: {
      q_work_type: { value: "coding", source: "stated", confidence: "high" }
    },
    needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }]
  };
}

test("a stated answer updates fields and needs", () => {
  const profile = freshProfile();
  const result = applyAnswer({
    questionnaire,
    catalog,
    profile,
    questionId: "q_work_type",
    optionId: "coding"
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(result.profile.fields.q_work_type, {
    value: "coding",
    source: "stated",
    confidence: "high"
  });
  assert.deepEqual(result.profile.needs, [
    { id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }
  ]);
});

test("keep confirms a pending need", () => {
  const profile = pendingWideProfile();
  const result = applyAnswer({
    questionnaire,
    catalog,
    profile,
    questionId: "confirm_desk_top_wide",
    optionId: "keep"
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(result.profile.confirmedNeeds, ["desk_top_wide"]);
  assert.deepEqual(result.profile.needs, [
    { id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }
  ]);
});

test("reject drops the pending need", () => {
  const profile = pendingWideProfile();
  const result = applyAnswer({
    questionnaire,
    catalog,
    profile,
    questionId: "confirm_desk_top_wide",
    optionId: "reject"
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(result.profile.rejectedNeeds, ["desk_top_wide"]);
  assert.deepEqual(result.profile.needs, []);
});

test("unknown question is rejected", () => {
  const result = applyAnswer({
    questionnaire,
    catalog,
    profile: freshProfile(),
    questionId: "missing_question",
    optionId: "coding"
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: "unknown question" });
});

test("unknown option is rejected", () => {
  const result = applyAnswer({
    questionnaire,
    catalog,
    profile: freshProfile(),
    questionId: "q_work_type",
    optionId: "missing_option"
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "unknown option" });
});
