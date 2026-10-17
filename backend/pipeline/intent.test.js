import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../understanding/interpret.js";
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

test("applyIntent command adds a sku and writes sceneEdits only on success", () => {
  const profile = freshProfile();
  const outcome = applyIntent({
    questionnaire,
    catalog,
    profile,
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } },
    limits: { maxItems: 12 }
  });

  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.kind, "command");
  assert.equal(outcome.result.say.code, "command_added");
  assert.deepEqual(outcome.profile.sceneEdits, [{ op: "add", sku: "CHAIR-460" }]);
  assert.ok(computeScenePlan(catalog, outcome.profile).includes("CHAIR-460"));
});

test("applyIntent command refusals do not write sceneEdits", () => {
  const profile = freshProfile();
  const refused = applyIntent({
    questionnaire,
    catalog,
    profile,
    intent: { type: "command", source: "text", payload: { action: "remove", sku: "DESK-LEGS-1400" } }
  });
  acceptedResult(refused.result);
  assert.equal(refused.result.reasonCode, "cannot_remove_support");
  assert.equal(refused.profile.sceneEdits, undefined);

  const missing = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: { type: "command", source: "text", payload: { action: "add", sku: "NO-SUCH" } }
  });
  acceptedResult(missing.result);
  assert.equal(missing.result.reasonCode, "unknown_sku");
  assert.equal(missing.profile.sceneEdits, undefined);

  const missingOnScene = applyIntent({
    questionnaire,
    catalog,
    profile: freshProfile(),
    intent: { type: "command", source: "text", payload: { action: "remove", sku: "CHAIR-460" } }
  });
  acceptedResult(missingOnScene.result);
  assert.equal(missingOnScene.result.reasonCode, "not_found");
  assert.equal(missingOnScene.profile.sceneEdits, undefined);

  const added = freshProfile();
  applyIntent({
    questionnaire,
    catalog,
    profile: added,
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } },
    limits: { maxItems: 12 }
  });
  const again = applyIntent({
    questionnaire,
    catalog,
    profile: added,
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } },
    limits: { maxItems: 12 }
  });
  acceptedResult(again.result);
  assert.equal(again.result.reasonCode, "limit");
  assert.deepEqual(added.sceneEdits, [{ op: "add", sku: "CHAIR-460" }]);
});

test("interpret then applyIntent removes a chair from a test catalog", () => {
  const localCatalog = {
    types: [
      { id: "desk_legs", maxOnScene: 1 },
      { id: "chair", maxOnScene: 2 }
    ],
    products: [
      { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true },
      { sku: "CHAIR-460", type: "chair", words: ["кресл"] }
    ]
  };
  const vocab = {
    commands: [{ action: "remove", words: ["убер"] }],
    products: [{ sku: "CHAIR-460", words: ["кресл"] }]
  };
  const profile = {
    ...freshProfile(),
    sceneEdits: [{ op: "add", sku: "CHAIR-460" }]
  };
  const intent = interpret({ source: "text", text: "убери кресло" }, vocab);
  const outcome = applyIntent({
    questionnaire,
    catalog: localCatalog,
    profile,
    intent,
    limits: { maxItems: 12 }
  });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.say.code, "command_removed");
  assert.equal(computeScenePlan(localCatalog, outcome.profile).includes("CHAIR-460"), false);
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
