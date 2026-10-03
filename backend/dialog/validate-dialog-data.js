const QUESTION_REQUIRED = ["id", "phase", "priority", "textFallback", "type"];
const INFERENCE_CONFIDENCE = new Set(["high", "medium", "low"]);

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

function isMissing(obj, field) {
  return !obj || isBlank(obj[field]);
}

function validateQuestionnaire(questionnaire, errors) {
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

function validateCatalogDraft(catalog, errors) {
  if (!catalog || typeof catalog !== "object") {
    errors.push("catalog: missing catalog object");
    return;
  }

  const draft = catalog.draft;
  if (!draft || typeof draft !== "object") {
    errors.push("catalog: missing \"draft\" object");
    return;
  }

  const types = Array.isArray(draft.types) ? draft.types : null;
  const products = Array.isArray(draft.products) ? draft.products : null;

  if (!types) errors.push("catalog: missing \"types\" array");
  if (!products) errors.push("catalog: missing \"products\" array");

  const typeIds = new Set();
  if (types) {
    const seenTypeIds = new Set();
    for (const type of types) {
      const label = type && type.id ? type.id : "<unknown type>";

      if (isMissing(type, "id")) {
        errors.push(`catalog: type "${label}" is missing required field "id"`);
      } else if (seenTypeIds.has(type.id)) {
        errors.push(`catalog: duplicate type id "${type.id}"`);
      } else {
        seenTypeIds.add(type.id);
        typeIds.add(type.id);
      }

      if (isMissing(type, "label")) {
        errors.push(`catalog: type "${label}" is missing required field "label"`);
      }

      if (!type || typeof type.canBeHost !== "boolean") {
        errors.push(`catalog: type "${label}" is missing required field "canBeHost"`);
      }

      if (type && (type.maxOnScene === undefined || type.maxOnScene === null || type.maxOnScene === "")) {
        errors.push(`catalog: type "${label}" is missing required field "maxOnScene"`);
      }
    }

    for (const type of types) {
      if (!type || !Array.isArray(type.canHostOn)) continue;
      const label = type.id ? type.id : "<unknown type>";
      for (const hostTypeId of type.canHostOn) {
        if (!typeIds.has(hostTypeId)) {
          errors.push(
            `catalog: type "${label}" canHostOn references unknown type "${hostTypeId}"`
          );
        }
      }
    }
  }

  const seenSkus = new Set();
  const hostBySku = new Map();

  if (products) {
    for (const product of products) {
      const label = product && product.sku ? product.sku : "<unknown sku>";

      for (const field of ["sku", "type", "priceEur"]) {
        if (isMissing(product, field)) {
          errors.push(`catalog: product "${label}" is missing required field "${field}"`);
        }
      }

      const dimensions = product && product.dimensions;
      if (!dimensions || typeof dimensions !== "object") {
        errors.push(`catalog: product "${label}" is missing required field "dimensions"`);
      } else {
        for (const dim of ["width", "depth", "height"]) {
          const value = dimensions[dim];
          if (typeof value !== "number" || !(value > 0)) {
            errors.push(
              `catalog: product "${label}" dimensions.${dim} must be a positive number`
            );
          }
        }
      }

      if (product && product.sku) {
        if (seenSkus.has(product.sku)) {
          errors.push(`catalog: duplicate sku found: "${product.sku}"`);
        }
        seenSkus.add(product.sku);
      }

      if (product && product.type && typeIds.size > 0 && !typeIds.has(product.type)) {
        errors.push(`catalog: product "${label}" references unknown type "${product.type}"`);
      }

      const model3d = product && product.media && product.media.model3d;
      if (model3d !== undefined && model3d !== null && model3d !== "") {
        if (typeof model3d !== "string" || !model3d.startsWith("/")) {
          errors.push(
            `catalog: product "${label}" media.model3d must be a string starting with "/"`
          );
        }
      }
    }

    for (const product of products) {
      const hostSku = product && product.placement && product.placement.hostSku;
      if (!hostSku) continue;

      const label = product.sku ? product.sku : "<unknown sku>";

      if (hostSku === product.sku) {
        errors.push(`catalog: product "${label}" placement.hostSku refers to itself`);
        continue;
      }

      if (!seenSkus.has(hostSku)) {
        errors.push(
          `catalog: product "${label}" placement.hostSku "${hostSku}" does not exist in catalog`
        );
        continue;
      }

      if (product.sku) {
        hostBySku.set(product.sku, hostSku);
      }
    }

    for (const sku of hostBySku.keys()) {
      const visited = new Set();
      let current = sku;
      while (current && hostBySku.has(current)) {
        if (visited.has(current)) {
          errors.push(`catalog: circular placement chain detected involving "${sku}"`);
          break;
        }
        visited.add(current);
        current = hostBySku.get(current);
      }
    }
  }
}

function validateDialogData({ questionnaire, catalog }) {
  const errors = [];

  validateQuestionnaire(questionnaire, errors);
  validateCatalogDraft(catalog, errors);

  if (errors.length > 0) {
    throw new Error(`Dialog data validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return true;
}

export { validateDialogData };
