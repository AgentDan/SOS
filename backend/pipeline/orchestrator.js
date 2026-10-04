import { getPendingConfirmations } from "../director/confirmation-engine.js";
import { deriveNeeds } from "../needs/derive-needs.js";
import { applyConfirmation } from "../profile/apply-confirmation.js";
import { applyFact } from "../profile/apply-facts.js";
import { checkAnswer, checkConfirmation } from "../understanding/check-answer.js";
import { readQuestionnaire } from "../config/load.js";
import { buildContext } from "./context.js";
import { persistTurn } from "./persist.js";

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
  const result = applyTurn({ ...context, questionId, optionId });
  persistTurn(result);
  return result;
}

export { applyTurn, runTurn };
