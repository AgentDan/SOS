import { getPendingConfirmations } from "../director/confirmation-engine.js";
import { deriveNeeds } from "../needs/derive-needs.js";
import { applyConfirmation } from "../profile/apply-confirmation.js";
import { applyFact } from "../profile/apply-facts.js";
import { applySceneChange } from "../scene/apply-scene-change.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { checkAnswer, checkConfirmation } from "../understanding/check-answer.js";
import { interpret } from "../understanding/interpret.js";
import { readQuestionnaire } from "../config/load.js";
import { buildContext } from "./context.js";
import { persistTurn } from "./persist.js";
import { failResult, notImplemented, okResult } from "./results.js";

function applyTurn({ questionnaire, catalog, profile, questionId, optionId }) {
  if (typeof questionId === "string" && questionId.startsWith("confirm_")) {
    const needId = questionId.slice("confirm_".length);
    const pending = getPendingConfirmations(profile);
    const checked = checkConfirmation({ pending, needId, optionId });
    if (!checked.ok) return { status: checked.status, body: checked.body, profile };

    applyConfirmation(profile, needId, optionId);
    if (optionId === "reject") {
      profile.needs = deriveNeeds({ questionnaire, catalog, profile });
    }
    return { status: 200, body: { ok: true }, profile };
  }

  const checked = checkAnswer({ questionnaire, questionId, optionId });
  if (!checked.ok) return { status: checked.status, body: checked.body, profile };

  applyFact(profile, questionId, optionId);
  profile.needs = deriveNeeds({ questionnaire, catalog, profile });
  return { status: 200, body: { ok: true }, profile };
}

function answerIntent({ questionnaire, catalog, profile, intent }) {
  const { questionId, optionId } = intent.payload ?? {};
  const before = computeScenePlan(catalog, profile);
  const turned = applyTurn({ questionnaire, catalog, profile, questionId, optionId });
  const scene = applySceneChange({ catalog, profile, change: { op: "refresh" }, before });
  const facts = { questionId, optionId };

  if (turned.status === 200) {
    return {
      ...turned,
      result: okResult({
        kind: "answer",
        sceneChanged: scene.sceneChanged,
        facts,
        say: { code: "answer_ok", params: {} }
      })
    };
  }

  return {
    ...turned,
    result: failResult({ kind: "answer", reasonCode: "not_found", facts })
  };
}

function applyIntent({ questionnaire, catalog, profile, intent }) {
  if (intent?.type === "answer") {
    return answerIntent({ questionnaire, catalog, profile, intent });
  }

  if (intent?.type === "command") {
    return { status: 200, body: { ok: true }, profile, result: notImplemented("command") };
  }

  if (intent?.type === "talk") {
    return { status: 200, body: { ok: true }, profile, result: notImplemented("talk") };
  }

  if (intent?.type === "unclear") {
    const reason = intent.payload?.reason;
    return {
      status: 200,
      body: { ok: true },
      profile,
      result: failResult({
        kind: "unclear",
        reasonCode: "unclear",
        facts: { reason },
        say: { code: "unclear", params: { reason } }
      })
    };
  }

  throw new Error("unknown intent type");
}

function runTurn({ clientId, questionId, optionId }) {
  if (!(typeof questionId === "string" && questionId.startsWith("confirm_"))) {
    const checked = checkAnswer({
      questionnaire: readQuestionnaire(),
      questionId,
      optionId
    });
    if (!checked.ok) return { status: checked.status, body: checked.body };
  }

  const context = buildContext(clientId);
  const outcome = applyIntent({
    ...context,
    intent: {
      type: "answer",
      source: "button",
      payload: { questionId, optionId }
    }
  });
  persistTurn(outcome);
  return outcome;
}

function runMessage({ clientId, text }) {
  const context = buildContext(clientId);
  const intent = interpret({ source: "text", text }, context.vocabulary);
  const outcome = applyIntent({ ...context, intent });
  persistTurn(outcome);
  return outcome;
}

export { applyTurn, applyIntent, runTurn, runMessage };
