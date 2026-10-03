import test from "node:test";
import assert from "node:assert/strict";
import { getEligibleQuestions, getNextQuestion } from "./question-engine.js";

function questionnaire() {
  return {
    draft: {
      phases: [
        { id: "situation", order: 1, name: "Ситуация" },
        { id: "needs", order: 2, name: "Потребности" }
      ],
      questions: [
        {
          id: "q_work_type",
          phase: "situation",
          priority: 10,
          type: "single",
          dependsOn: [],
          appliesToScenarios: ["home_office", "gaming_setup"],
          options: [{ id: "coding", label: "Программирую" }]
        },
        {
          id: "q_desk_width",
          phase: "needs",
          priority: 5,
          type: "single",
          dependsOn: [],
          appliesToScenarios: ["home_office", "gaming_setup"],
          options: [
            { id: "narrow", label: "До 120 см" },
            { id: "wide", label: "От 160 см" }
          ]
        },
        {
          id: "q_back_pain",
          phase: "needs",
          priority: 4,
          type: "single",
          dependsOn: [],
          appliesToScenarios: ["home_office", "gaming_setup"],
          options: [{ id: "yes", label: "Да" }]
        },
        {
          id: "q_monitor_arm",
          phase: "needs",
          priority: 3,
          type: "single",
          dependsOn: [{ questionId: "q_desk_width", optionId: "wide" }],
          appliesToScenarios: ["gaming_setup"],
          options: [{ id: "yes", label: "Да" }]
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

function answered(questionId, value) {
  return { [questionId]: { value, source: "stated", confidence: "high" } };
}

test("question with unmet dependsOn is not eligible", () => {
  const eligible = getEligibleQuestions(questionnaire(), profile(), "needs");
  assert.equal(eligible.some((q) => q.id === "q_monitor_arm"), false);
});

test("question with met dependsOn is eligible", () => {
  const eligible = getEligibleQuestions(
    questionnaire(),
    profile({ fields: answered("q_desk_width", "wide") }),
    "needs"
  );
  assert.equal(eligible.some((q) => q.id === "q_monitor_arm"), true);
});

test("already answered question is not eligible again", () => {
  const eligible = getEligibleQuestions(
    questionnaire(),
    profile({ fields: answered("q_work_type", "coding") }),
    "situation"
  );
  assert.equal(eligible.some((q) => q.id === "q_work_type"), false);
});

test("eligible questions are sorted by priority descending", () => {
  const eligible = getEligibleQuestions(questionnaire(), profile(), "needs");
  assert.deepEqual(
    eligible.map((q) => q.id),
    ["q_desk_width", "q_back_pain"]
  );
});

test("getNextQuestion moves to the next phase by order when current phase is done", () => {
  const next = getNextQuestion(
    questionnaire(),
    profile({ fields: answered("q_work_type", "coding") })
  );
  assert.equal(next.phase, "needs");
  assert.equal(next.question.id, "q_desk_width");
});

test("getNextQuestion returns null when every phase is exhausted", () => {
  const next = getNextQuestion(
    questionnaire(),
    profile({
      fields: {
        ...answered("q_work_type", "coding"),
        ...answered("q_desk_width", "narrow"),
        ...answered("q_back_pain", "yes")
      }
    })
  );
  assert.equal(next, null);
});

function withConfirmation(source) {
  const draft = source.draft;
  return {
    draft: {
      ...draft,
      phases: [...draft.phases, { id: "confirmation", order: 3, name: "Подтверждение" }]
    }
  };
}

function answeredThroughNeeds() {
  return {
    ...answered("q_work_type", "coding"),
    ...answered("q_desk_width", "narrow"),
    ...answered("q_back_pain", "yes")
  };
}

const confirmationCatalog = {
  draft: {
    products: [{ sku: "DESK-TOP-1800", name: "Desk top 1800x800" }]
  }
};

test("getNextQuestion asks to confirm a medium-confidence resolved need", () => {
  const next = getNextQuestion(
    withConfirmation(questionnaire()),
    profile({
      fields: answeredThroughNeeds(),
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }]
    }),
    confirmationCatalog
  );
  assert.equal(next.phase, "confirmation");
  assert.equal(next.question.id, "confirm_desk_top_wide");
});

test("getNextQuestion returns null when that need is already confirmed", () => {
  const next = getNextQuestion(
    withConfirmation(questionnaire()),
    profile({
      fields: answeredThroughNeeds(),
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }],
      confirmedNeeds: ["desk_top_wide"]
    }),
    confirmationCatalog
  );
  assert.equal(next, null);
});

test("question is not eligible when scenario is set and not in appliesToScenarios", () => {
  const eligible = getEligibleQuestions(
    questionnaire(),
    profile({
      scenario: "home_office",
      fields: answered("q_desk_width", "wide")
    }),
    "needs"
  );
  assert.equal(eligible.some((q) => q.id === "q_monitor_arm"), false);
});
