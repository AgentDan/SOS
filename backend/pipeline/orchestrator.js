import { getPendingConfirmations } from "../director/confirmation-engine.js";
import { deriveNeeds } from "../needs/derive-needs.js";
import { applyConfirmation } from "../profile/apply-confirmation.js";
import { loadProfile } from "../profile/profile-store.js";
import { applyFact } from "../profile/apply-facts.js";
import { runCommand } from "../commands/commands.js";
import { canReplace } from "../commands/placement.js";
import { runTalk } from "../talk/talk.js";
import { applySceneChange } from "../scene/apply-scene-change.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { assembleScene } from "./reads.js";
import { checkAnswer, checkConfirmation } from "../understanding/check-answer.js";
import { interpret } from "../understanding/interpret.js";
import { readQuestionnaire } from "../config/load.js";
import { buildContext } from "./context.js";
import { persistTurn } from "./persist.js";
import { failResult, okResult } from "./results.js";

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

function applyIntent({ questionnaire, catalog, profile, intent, consultant }) {
  if (intent?.type === "answer") {
    return answerIntent({ questionnaire, catalog, profile, intent });
  }

  if (intent?.type === "command") {
    const before = assembleScene(catalog, profile);
    const result = runCommand({
      intent,
      catalog,
      scene: {
        skus: before.skus,
        placements: before.placements,
        apply: (change) => applySceneChange({ catalog, profile, change, before: before.skus })
      }
    });
    return { status: 200, body: { ok: true }, profile, result };
  }

  if (intent?.type === "talk") {
    const before = computeScenePlan(catalog, profile);
    const result = runTalk({
      intent,
      catalog,
      consultant,
      scene: {
        skus: before,
        apply: (change) => applySceneChange({ catalog, profile, change, before })
      },
      canReplace
    });
    return { status: 200, body: { ok: true }, profile, result };
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
  if (typeof questionId === "string" && questionId.startsWith("confirm_")) {
    const checked = checkConfirmation({
      pending: getPendingConfirmations(loadProfile(clientId)),
      needId: questionId.slice("confirm_".length),
      optionId
    });
    if (!checked.ok) return { status: checked.status, body: checked.body };
  } else {
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
