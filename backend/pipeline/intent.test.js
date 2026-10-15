import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readQuestionnaire } from "../config/load.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { validateExecutorResult } from "./contracts.js";
import { applyIntent, applyTurn } from "./orchestrator.js";

const questionnaire = readQuestionnaire();
const catalog = readCatalog();

function freshProfile() {
  return {
    clientId: "intent-test",
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

function acceptedResult(result) {
  assert.deepEqual(validateExecutorResult(result), { ok: true, errors: [] });
}

test("applyIntent answer matches applyTurn and notes a scene change", () => {
  const questionId = "q_work_type";
  const optionId = "coding";
  const viaTurn = applyTurn({
    questionnaire,
    catalog,
    profile: freshProfile(),
    questionId,
    optionId
  });
  const viaIntent = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: { type: "answer", source: "button", payload: { questionId, optionId } }
  });

  assert.equal(viaIntent.status, viaTurn.status);
  assert.deepEqual(viaIntent.body, viaTurn.body);
  assert.deepEqual(viaIntent.body, { ok: true });
  acceptedResult(viaIntent.result);
  assert.equal(viaIntent.result.ok, true);
  assert.equal(viaIntent.result.kind, "answer");
  assert.equal(viaIntent.result.sceneChanged, true);
  assert.equal(viaIntent.result.say.code, "answer_ok");
  assert.ok(computeScenePlan(catalog, viaIntent.profile).includes("DESK-TOP-1800"));
});

test("applyIntent answer without a new product leaves the scene unchanged", () => {
  const viaIntent = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: {
      type: "answer",
      source: "button",
      payload: { questionId: "q_work_type", optionId: "design" }
    }
  });

  acceptedResult(viaIntent.result);
  assert.equal(viaIntent.status, 200);
  assert.deepEqual(viaIntent.body, { ok: true });
  assert.equal(viaIntent.result.sceneChanged, false);
  assert.deepEqual(computeScenePlan(catalog, viaIntent.profile), ["DESK-LEGS-1400"]);
});

test("applyIntent answer keep matches applyTurn and does not change the scene", () => {
  const viaTurn = applyTurn({
    questionnaire,
    catalog,
    profile: pendingWideProfile(),
    questionId: "confirm_desk_top_wide",
    optionId: "keep"
  });
  const viaIntent = applyIntent({
    questionnaire,
    catalog,
    profile: pendingWideProfile(),
    intent: {
      type: "answer",
      source: "button",
      payload: { questionId: "confirm_desk_top_wide", optionId: "keep" }
    }
  });

  assert.equal(viaIntent.status, viaTurn.status);
  assert.deepEqual(viaIntent.body, viaTurn.body);
  acceptedResult(viaIntent.result);
  assert.equal(viaIntent.result.sceneChanged, false);
});

test("applyIntent answer of an unknown question matches applyTurn", () => {
  const viaTurn = applyTurn({
    questionnaire,
    catalog,
    profile: freshProfile(),
    questionId: "missing_question",
    optionId: "coding"
  });
  const viaIntent = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: {
      type: "answer",
      source: "button",
      payload: { questionId: "missing_question", optionId: "coding" }
    }
  });

  assert.equal(viaIntent.status, viaTurn.status);
  assert.deepEqual(viaIntent.body, viaTurn.body);
  assert.equal(viaIntent.status, 404);
  acceptedResult(viaIntent.result);
  assert.equal(viaIntent.result.ok, false);
  assert.equal(viaIntent.result.reasonCode, "not_found");
});

test("applyIntent command is a stub and leaves the profile alone", () => {
  const profile = freshProfile();
  const before = structuredClone(profile);
  const outcome = applyIntent({
    questionnaire,
    catalog,
    profile,
    intent: { type: "command", source: "text", payload: { action: "remove", sku: "CHAIR-460" } }
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  assert.deepEqual(outcome.profile, before);
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, false);
  assert.equal(outcome.result.kind, "command");
  assert.equal(outcome.result.reasonCode, "not_implemented");
});

test("applyIntent talk is a stub", () => {
  const outcome = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: { type: "talk", source: "text", payload: { topic: "cheaper" } }
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.kind, "talk");
  assert.equal(outcome.result.reasonCode, "not_implemented");
});

test("applyIntent unclear keeps the profile and names the reason", () => {
  const profile = freshProfile();
  const before = structuredClone(profile);
  const outcome = applyIntent({
    questionnaire,
    catalog,
    profile,
    intent: { type: "unclear", source: "text", payload: { reason: "no_match" } }
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  assert.deepEqual(outcome.profile, before);
  acceptedResult(outcome.result);
  assert.equal(outcome.result.kind, "unclear");
  assert.equal(outcome.result.reasonCode, "unclear");
  assert.deepEqual(outcome.result.facts, { reason: "no_match" });
  assert.deepEqual(outcome.result.say, { code: "unclear", params: { reason: "no_match" } });
});
