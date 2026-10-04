import test from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, checkConfirmation } from "./check-answer.js";

const questionnaire = {
  draft: {
    questions: [
      {
        id: "q_work_type",
        options: [{ id: "coding" }, { id: "design" }]
      }
    ]
  }
};

test("checkAnswer accepts a known option", () => {
  assert.deepEqual(
    checkAnswer({ questionnaire, questionId: "q_work_type", optionId: "coding" }),
    { ok: true }
  );
});

test("checkAnswer rejects an unknown question", () => {
  assert.deepEqual(
    checkAnswer({ questionnaire, questionId: "missing", optionId: "coding" }),
    { ok: false, status: 404, body: { error: "unknown question" } }
  );
});

test("checkAnswer rejects an unknown option", () => {
  assert.deepEqual(
    checkAnswer({ questionnaire, questionId: "q_work_type", optionId: "missing" }),
    { ok: false, status: 400, body: { error: "unknown option" } }
  );
});

test("checkConfirmation accepts keep and reject", () => {
  const pending = [{ id: "desk_top_wide" }];
  assert.deepEqual(
    checkConfirmation({ pending, needId: "desk_top_wide", optionId: "keep" }),
    { ok: true }
  );
  assert.deepEqual(
    checkConfirmation({ pending, needId: "desk_top_wide", optionId: "reject" }),
    { ok: true }
  );
});

test("checkConfirmation rejects an unknown need", () => {
  assert.deepEqual(
    checkConfirmation({ pending: [], needId: "desk_top_wide", optionId: "keep" }),
    { ok: false, status: 404, body: { error: "unknown question" } }
  );
});

test("checkConfirmation rejects an unknown option", () => {
  assert.deepEqual(
    checkConfirmation({
      pending: [{ id: "desk_top_wide" }],
      needId: "desk_top_wide",
      optionId: "maybe"
    }),
    { ok: false, status: 400, body: { error: "unknown option" } }
  );
});
