import { getPendingConfirmations } from "../director/confirmation-engine.js";
import { computeNeeds } from "../needs/inference-engine.js";
import { runMatching } from "../needs/matching.js";

function screenStatedAnswer({ questionnaire, questionId, optionId }) {
  if (typeof questionId === "string" && questionId.startsWith("confirm_")) return null;

  const question = (questionnaire.draft.questions ?? []).find((item) => item.id === questionId);
  if (!question) {
    return { status: 404, body: { error: "unknown question" } };
  }

  const option = (question.options ?? []).find((item) => item.id === optionId);
  if (!option) {
    return { status: 400, body: { error: "unknown option" } };
  }

  return null;
}

function applyAnswer({ questionnaire, catalog, profile, questionId, optionId }) {
  if (typeof questionId === "string" && questionId.startsWith("confirm_")) {
    const needId = questionId.slice("confirm_".length);
    const pending = getPendingConfirmations(profile);
    const need = pending.find((item) => item.id === needId);
    if (!need) return { status: 404, body: { error: "unknown question" }, profile };

    if (optionId === "keep") {
      profile.confirmedNeeds = [...new Set([...(profile.confirmedNeeds ?? []), needId])];
    } else if (optionId === "reject") {
      profile.rejectedNeeds = [...new Set([...(profile.rejectedNeeds ?? []), needId])];
      profile.needs = computeNeeds(questionnaire, profile);
      profile.needs = runMatching(catalog, profile.needs);
    } else {
      return { status: 400, body: { error: "unknown option" }, profile };
    }

    return { status: 200, body: { ok: true }, profile };
  }

  const rejected = screenStatedAnswer({ questionnaire, questionId, optionId });
  if (rejected) return { ...rejected, profile };

  profile.fields[questionId] = {
    value: optionId,
    source: "stated",
    confidence: "high"
  };
  profile.needs = computeNeeds(questionnaire, profile);
  profile.needs = runMatching(catalog, profile.needs);
  return { status: 200, body: { ok: true }, profile };
}

export { applyAnswer, screenStatedAnswer };
