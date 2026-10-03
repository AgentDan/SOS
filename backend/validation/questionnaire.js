import { isBlank, isMissing, validateEnvelopeFields } from "./envelope.js";

const QUESTION_REQUIRED = ["id", "phase", "priority", "textFallback", "type"];
const INFERENCE_CONFIDENCE = new Set(["high", "medium", "low"]);

function validateQuestionnaire(questionnaire, errors) {
  validateEnvelopeFields(questionnaire, "questionnaire", errors);

  if (!questionnaire || typeof questionnaire !== "object") {
    errors.push("questionnaire: missing questionnaire object");
    return;
  }

  const draft = questionnaire.draft;
  if (!draft || typeof draft !== "object") {
    errors.push("questionnaire: missing \"draft\" object");
    return;
  }

  const phases = Array.isArray(draft.phases) ? draft.phases : null;
  const scenarios = Array.isArray(draft.scenarios) ? draft.scenarios : null;
  const questions = Array.isArray(draft.questions) ? draft.questions : null;
  const inference = Array.isArray(draft.inference) ? draft.inference : null;

  if (!phases) errors.push("questionnaire: missing \"phases\" array");
  if (!scenarios) errors.push("questionnaire: missing \"scenarios\" array");
  if (!questions) errors.push("questionnaire: missing \"questions\" array");
  if (!inference) errors.push("questionnaire: missing \"inference\" array");

  const phaseIds = new Set();
  if (phases) {
    const seenPhaseIds = new Set();
    const seenOrders = new Set();
    const orders = [];

    for (const phase of phases) {
      const label = phase && phase.id ? phase.id : "<unknown phase>";

      if (isMissing(phase, "id")) {
        errors.push(`questionnaire: phase "${label}" is missing required field "id"`);
      } else if (seenPhaseIds.has(phase.id)) {
        errors.push(`questionnaire: duplicate phase id "${phase.id}"`);
      } else {
        seenPhaseIds.add(phase.id);
        phaseIds.add(phase.id);
      }

      if (isMissing(phase, "name")) {
        errors.push(`questionnaire: phase "${label}" is missing required field "name"`);
      }

      if (phase.order === undefined || phase.order === null || phase.order === "") {
        errors.push(`questionnaire: phase "${label}" is missing required field "order"`);
      } else if (!Number.isInteger(phase.order)) {
        errors.push(`questionnaire: phase "${label}" has non-integer order "${phase.order}"`);
      } else {
        if (seenOrders.has(phase.order)) {
          errors.push(`questionnaire: duplicate phase order ${phase.order}`);
        }
        seenOrders.add(phase.order);
        orders.push(phase.order);
      }
    }

    if (orders.length === phases.length && phases.length > 0) {
      const expected = phases.map((_, i) => i + 1);
      const sorted = [...orders].sort((a, b) => a - b);
      const mismatch = expected.some((n, i) => sorted[i] !== n);
      if (mismatch) {
        errors.push(
          `questionnaire: phase order must be consecutive integers starting at 1 (got ${sorted.join(", ")})`
        );
      }
    }
  }

  const scenarioIds = new Set();
  if (scenarios) {
    const seenScenarioIds = new Set();
    for (const scenario of scenarios) {
      const label = scenario && scenario.id ? scenario.id : "<unknown scenario>";

      if (isMissing(scenario, "id")) {
        errors.push(`questionnaire: scenario "${label}" is missing required field "id"`);
      } else if (seenScenarioIds.has(scenario.id)) {
        errors.push(`questionnaire: duplicate scenario id "${scenario.id}"`);
      } else {
        seenScenarioIds.add(scenario.id);
        scenarioIds.add(scenario.id);
      }

      if (isMissing(scenario, "name")) {
        errors.push(`questionnaire: scenario "${label}" is missing required field "name"`);
      }
    }
  }

  const questionsById = new Map();
  if (questions) {
    const seenQuestionIds = new Set();

    for (const question of questions) {
      const label = question && question.id ? question.id : "<unknown question>";

      for (const field of QUESTION_REQUIRED) {
        if (isMissing(question, field)) {
          errors.push(`questionnaire: question "${label}" is missing required field "${field}"`);
        }
      }

      if (question && question.id) {
        if (seenQuestionIds.has(question.id)) {
          errors.push(`questionnaire: duplicate question id "${question.id}"`);
        } else {
          seenQuestionIds.add(question.id);
          questionsById.set(question.id, question);
        }
      }

      if (question && question.phase && phaseIds.size > 0 && !phaseIds.has(question.phase)) {
        errors.push(
          `questionnaire: question "${label}" references unknown phase "${question.phase}"`
        );
      }

      if (question && question.type && question.type !== "text") {
        if (!Array.isArray(question.options) || question.options.length === 0) {
          errors.push(`questionnaire: question "${label}" is missing non-empty "options" array`);
        } else {
          const seenOptionIds = new Set();
          for (const option of question.options) {
            const optionLabel = option && option.id ? option.id : "<unknown option>";
            if (isMissing(option, "id") || isMissing(option, "label")) {
              errors.push(
                `questionnaire: question "${label}" option "${optionLabel}" is missing required field "id" or "label"`
              );
            }
            if (option && option.id) {
              if (seenOptionIds.has(option.id)) {
                errors.push(
                  `questionnaire: question "${label}" has duplicate option id "${option.id}"`
                );
              }
              seenOptionIds.add(option.id);
            }
          }
        }
      }

      if (question && Array.isArray(question.appliesToScenarios)) {
        for (const scenarioId of question.appliesToScenarios) {
          if (!scenarioIds.has(scenarioId)) {
            errors.push(
              `questionnaire: question "${label}" appliesToScenarios references unknown scenario "${scenarioId}"`
            );
          }
        }
      }
    }

    for (const question of questions) {
      if (!question || !Array.isArray(question.dependsOn)) continue;
      const label = question.id ? question.id : "<unknown question>";

      for (const dep of question.dependsOn) {
        const depQuestionId = dep && dep.questionId;
        const depOptionId = dep && dep.optionId;
        if (!depQuestionId) {
          errors.push(`questionnaire: question "${label}" dependsOn is missing "questionId"`);
          continue;
        }

        const target = questionsById.get(depQuestionId);
        if (!target) {
          errors.push(
            `questionnaire: question "${label}" dependsOn references unknown question "${depQuestionId}"`
          );
          continue;
        }

        if (depOptionId) {
          const options = Array.isArray(target.options) ? target.options : [];
          const exists = options.some((opt) => opt && opt.id === depOptionId);
          if (!exists) {
            errors.push(
              `questionnaire: question "${label}" references unknown option "${depOptionId}" in "${depQuestionId}"`
            );
          }
        }
      }
    }
  }

  if (inference) {
    const seenInferenceIds = new Set();

    for (const rule of inference) {
      const label = rule && rule.id ? rule.id : "<unknown inference>";

      if (isMissing(rule, "id")) {
        errors.push(`questionnaire: inference "${label}" is missing required field "id"`);
      } else if (seenInferenceIds.has(rule.id)) {
        errors.push(`questionnaire: duplicate inference id "${rule.id}"`);
      } else {
        seenInferenceIds.add(rule.id);
      }

      if (isMissing(rule, "resultNeed")) {
        errors.push(`questionnaire: inference "${label}" is missing required field "resultNeed"`);
      }

      if (isMissing(rule, "confidence")) {
        errors.push(`questionnaire: inference "${label}" is missing required field "confidence"`);
      } else if (!INFERENCE_CONFIDENCE.has(rule.confidence)) {
        errors.push(
          `questionnaire: inference "${label}" has invalid confidence "${rule.confidence}"`
        );
      }

      const when = rule && rule.when;
      const whenQuestionId = when && when.questionId;
      if (isBlank(whenQuestionId)) {
        errors.push(`questionnaire: inference "${label}" is missing required field "when.questionId"`);
        continue;
      }

      const target = questionsById.get(whenQuestionId);
      if (!target) {
        errors.push(
          `questionnaire: inference "${label}" when.questionId references unknown question "${whenQuestionId}"`
        );
        continue;
      }

      const whenOptionId = when.optionId;
      if (!isBlank(whenOptionId)) {
        const options = Array.isArray(target.options) ? target.options : [];
        const exists = options.some((opt) => opt && opt.id === whenOptionId);
        if (!exists) {
          errors.push(
            `questionnaire: inference "${label}" references unknown option "${whenOptionId}" in "${whenQuestionId}"`
          );
        }
      }
    }
  }
}

export { validateQuestionnaire };
