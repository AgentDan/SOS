import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { interpret } from "../understanding/interpret.js";
import { readCatalog, readQuestionnaire } from "../config/load.js";
import { saveProfile } from "../profile/profile-store.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { validateExecutorResult } from "./contracts.js";
import { applyIntent, applyTurn, runMessage } from "./orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TALK_CLIENTS = ["intent-talk-faq", "intent-talk-cheaper", "intent-talk-smalltalk"];
let talkDataDir;
let previousDataDir;
let talkDataReady = false;

function forgetClient(clientId) {
  rmSync(path.join(__dirname, "..", "..", "runtime", "clients", clientId), {
    recursive: true,
    force: true
  });
}

before(() => {
  for (const clientId of TALK_CLIENTS) forgetClient(clientId);
  previousDataDir = process.env.SOS_DATA_DIR;
  talkDataDir = mkdtempSync(path.join(os.tmpdir(), "sos-talk-"));
  cpSync(path.join(__dirname, "..", "..", "data"), talkDataDir, { recursive: true });
  const file = path.join(talkDataDir, "consultant.json");
  const consultant = JSON.parse(readFileSync(file, "utf8"));
  consultant.published.topics = structuredClone(consultant.draft.topics);
  consultant.published.faq = structuredClone(consultant.draft.faq);
  writeFileSync(file, `${JSON.stringify(consultant, null, 2)}\n`);
  process.env.SOS_DATA_DIR = talkDataDir;
  talkDataReady = true;
});

after(() => {
  if (talkDataReady) {
    if (previousDataDir === undefined) delete process.env.SOS_DATA_DIR;
    else process.env.SOS_DATA_DIR = previousDataDir;
  }
  if (talkDataDir) rmSync(talkDataDir, { recursive: true, force: true });
  for (const clientId of TALK_CLIENTS) forgetClient(clientId);
});

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
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } }
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
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } }
  });
  const chairMax = catalog.types.find((type) => type.id === "chair").maxOnScene;
  for (let copy = 1; copy < chairMax; copy += 1) {
    const extra = applyIntent({
      questionnaire,
      catalog,
      profile: added,
      intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } }
    });
    acceptedResult(extra.result);
    assert.equal(extra.result.ok, true);
  }
  const overType = applyIntent({
    questionnaire,
    catalog,
    profile: added,
    intent: { type: "command", source: "text", payload: { action: "add", sku: "CHAIR-460" } }
  });
  acceptedResult(overType.result);
  assert.equal(overType.result.reasonCode, "limit");
  assert.equal(overType.result.say.params.max, chairMax);
  assert.equal(added.sceneEdits.length, chairMax);
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
    intent
  });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.say.code, "command_removed");
  assert.equal(computeScenePlan(localCatalog, outcome.profile).includes("CHAIR-460"), false);
});

test("runMessage faq is answered from the consultant", () => {
  const clientId = "intent-talk-faq";
  forgetClient(clientId);
  const outcome = runMessage({ clientId, text: "а доставка есть?" });
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.kind, "talk");
  assert.equal(outcome.result.sceneChanged, false);
  assert.equal(outcome.result.say.code, "faq_answer");
  assert.equal(outcome.result.facts.faqId, "delivery");
  const consultant = JSON.parse(readFileSync(path.join(talkDataDir, "consultant.json"), "utf8"));
  const delivery = consultant.published.faq.find((item) => item.id === "delivery");
  assert.equal(outcome.result.facts.answer, delivery.answer);
  assert.notEqual(outcome.result.reasonCode, "not_implemented");
});

test("runMessage cheaper replaces a dearer desk already on the scene", () => {
  const clientId = "intent-talk-cheaper";
  forgetClient(clientId);
  saveProfile({
    clientId,
    scenario: null,
    status: "in_progress",
    fields: {},
    needs: [],
    confirmedNeeds: [],
    rejectedNeeds: [],
    sceneEdits: [{ op: "add", sku: "DESK-TOP-1800" }]
  });
  const outcome = runMessage({ clientId, text: "покажи дешевле" });
  const products = readCatalog().products;
  const price = (sku) => products.find((item) => item.sku === sku).priceEur;
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.kind, "talk");
  assert.equal(outcome.result.say.code, "cheaper_done");
  assert.equal(outcome.result.facts.sku, "DESK-TOP-1800");
  assert.equal(outcome.result.facts.withSku, "DESK-TOP-1400");
  assert.equal(outcome.result.facts.savedEur, price("DESK-TOP-1800") - price("DESK-TOP-1400"));
  assert.deepEqual(outcome.profile.sceneEdits.at(-1), {
    op: "replace",
    sku: "DESK-TOP-1800",
    withSku: "DESK-TOP-1400"
  });
  assert.notEqual(outcome.result.reasonCode, "not_implemented");
});

test("runMessage smalltalk is not a stub", () => {
  const clientId = "intent-talk-smalltalk";
  forgetClient(clientId);
  const outcome = runMessage({ clientId, text: "привет" });
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  acceptedResult(outcome.result);
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.kind, "talk");
  assert.equal(outcome.result.sceneChanged, false);
  assert.deepEqual(outcome.result.facts, { topic: "smalltalk" });
  assert.deepEqual(outcome.result.say, { code: "smalltalk", params: {} });
  assert.notEqual(outcome.result.reasonCode, "not_implemented");
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
