import { buildConfirmationQuestion, getPendingConfirmations } from "./confirmation-engine.js";

function getEligibleQuestions(questionnaire, profile, phaseId) {
  const questions = questionnaire?.draft?.questions ?? [];
  const fields = profile?.fields ?? {};
  const scenario = profile?.scenario ?? null;

  const eligible = questions.filter((question) => {
    if (question.phase !== phaseId) return false;
    if (fields[question.id]) return false;

    const scenarios = Array.isArray(question.appliesToScenarios)
      ? question.appliesToScenarios
      : [];
    // TODO: нет вопроса, устанавливающего scenario — добавить в следующей итерации данных
    if (scenarios.length > 0 && scenario !== null && !scenarios.includes(scenario)) {
      return false;
    }

    const deps = Array.isArray(question.dependsOn) ? question.dependsOn : [];
    return deps.every((dep) => fields[dep.questionId]?.value === dep.optionId);
  });

  return eligible.sort((a, b) => b.priority - a.priority);
}

function getNextQuestion(questionnaire, profile, catalog) {
  const phases = [...(questionnaire?.draft?.phases ?? [])].sort((a, b) => a.order - b.order);

  for (const phase of phases) {
    if (phase.id === "confirmation") {
      const pending = getPendingConfirmations(profile);
      if (pending.length > 0) {
        return { phase: phase.id, question: buildConfirmationQuestion(pending[0], catalog) };
      }
      continue;
    }

    const eligible = getEligibleQuestions(questionnaire, profile, phase.id);
    if (eligible.length > 0) {
      return { phase: phase.id, question: eligible[0] };
    }
  }

  return null;
}

export { getEligibleQuestions, getNextQuestion };
