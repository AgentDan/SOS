import { checkType, validateSectionEnvelope } from "./envelope.js";

function validateAiRules(aiRules, errors) {
  if (aiRules === undefined) return;
  if (!validateSectionEnvelope(aiRules, "ai-rules", errors)) return;

  const draft = aiRules.draft;

  if (checkType("ai-rules", draft.input, "object", "input", errors)) {
    checkType("ai-rules", draft.input.strict, "boolean", "input.strict", errors);
    checkType("ai-rules", draft.input.unclear, "string", "input.unclear", errors);
    checkType("ai-rules", draft.input.detectMood, "boolean", "input.detectMood", errors);
    checkType("ai-rules", draft.input.faq, "boolean", "input.faq", errors);
    checkType("ai-rules", draft.input.tier, "string", "input.tier", errors);
  }

  if (checkType("ai-rules", draft.output, "object", "output", errors)) {
    checkType("ai-rules", draft.output.maxWords, "number", "output.maxWords", errors);
    checkType("ai-rules", draft.output.emoji, "boolean", "output.emoji", errors);
    checkType("ai-rules", draft.output.keepOptions, "boolean", "output.keepOptions", errors);
    checkType("ai-rules", draft.output.noPrices, "boolean", "output.noPrices", errors);
    checkType("ai-rules", draft.output.noPromises, "boolean", "output.noPromises", errors);
    checkType("ai-rules", draft.output.noContradict, "boolean", "output.noContradict", errors);
    checkType("ai-rules", draft.output.offerCheaper, "boolean", "output.offerCheaper", errors);
    checkType("ai-rules", draft.output.noPressure, "boolean", "output.noPressure", errors);
    checkType("ai-rules", draft.output.tier, "string", "output.tier", errors);
  }
}

export { validateAiRules };
