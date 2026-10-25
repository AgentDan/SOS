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
    optionalBoolean(draft.output.aiVoice, "output.aiVoice", errors);
    optionalStrings(draft.output.bannedStems, "output.bannedStems", errors);
    optionalStrings(draft.output.pressureStems, "output.pressureStems", errors);
    optionalStrings(draft.output.aiSkipCodes, "output.aiSkipCodes", errors);
  }
}

function optionalBoolean(value, label, errors) {
  if (value === undefined) return;
  checkType("ai-rules", value, "boolean", label, errors);
}

function optionalStrings(value, label, errors) {
  if (value === undefined) return;
  const ok = Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
  if (!ok) errors.push(`ai-rules: ${label} must be an array of non-empty strings`);
}

export { validateAiRules };
