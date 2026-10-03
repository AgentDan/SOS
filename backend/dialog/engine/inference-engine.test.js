import test from "node:test";
import assert from "node:assert/strict";
import { computeNeeds } from "./inference-engine.js";

function questionnaire() {
  return {
    draft: {
      inference: [
        {
          id: "inf_wide_desk",
          when: { questionId: "q_work_type", optionId: "coding" },
          resultNeed: "desk_top_wide",
          confidence: "medium"
        },
        {
          id: "inf_chair",
          when: { questionId: "q_back_pain", optionId: "yes" },
          resultNeed: "ergonomic_chair",
          confidence: "high"
        }
      ]
    }
  };
}

function profile(overrides = {}) {
  return {
    clientId: "test",
    scenario: null,
    status: "in_progress",
    fields: {},
    needs: [],
    ...overrides
  };
}

function field(questionId, value) {
  return { [questionId]: { value, source: "stated", confidence: "high" } };
}

test("coding work type infers desk_top_wide at medium confidence", () => {
  const needs = computeNeeds(
    questionnaire(),
    profile({ fields: field("q_work_type", "coding") })
  );
  assert.equal(needs.some((n) => n.id === "desk_top_wide" && n.confidence === "medium"), true);
});

test("design work type does not infer desk_top_wide", () => {
  const needs = computeNeeds(
    questionnaire(),
    profile({ fields: field("q_work_type", "design") })
  );
  assert.equal(needs.some((n) => n.id === "desk_top_wide"), false);
});

test("back pain yes infers ergonomic_chair at high confidence", () => {
  const needs = computeNeeds(
    questionnaire(),
    profile({ fields: field("q_back_pain", "yes") })
  );
  assert.equal(needs.some((n) => n.id === "ergonomic_chair" && n.confidence === "high"), true);
});

test("both matching answers produce two needs", () => {
  const needs = computeNeeds(
    questionnaire(),
    profile({
      fields: {
        ...field("q_work_type", "coding"),
        ...field("q_back_pain", "yes")
      }
    })
  );
  assert.equal(needs.length, 2);
  assert.equal(needs.some((n) => n.id === "desk_top_wide"), true);
  assert.equal(needs.some((n) => n.id === "ergonomic_chair"), true);
});

test("repeated computeNeeds with the same fields is idempotent", () => {
  const input = profile({
    fields: {
      ...field("q_work_type", "coding"),
      ...field("q_back_pain", "yes")
    }
  });
  const first = computeNeeds(questionnaire(), input);
  const second = computeNeeds(questionnaire(), { ...input, needs: first });
  assert.equal(first.length, second.length);
  assert.deepEqual(
    first.map((n) => n.id).sort(),
    [...new Set(second.map((n) => n.id))].sort()
  );
  assert.equal(new Set(second.map((n) => n.id)).size, second.length);
});

test("existing resolvedSku is kept across recomputation", () => {
  const needs = computeNeeds(
    questionnaire(),
    profile({
      fields: field("q_work_type", "coding"),
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DSK-140" }]
    })
  );
  const desk = needs.find((n) => n.id === "desk_top_wide");
  assert.equal(desk.resolvedSku, "DSK-140");
});

test("empty fields produce empty needs", () => {
  const needs = computeNeeds(questionnaire(), profile());
  assert.deepEqual(needs, []);
});
