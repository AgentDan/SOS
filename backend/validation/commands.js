import { checkType, isPlainObject, validateSectionEnvelope } from "./envelope.js";

function wordsAreValid(words) {
  return (
    Array.isArray(words) &&
    words.length > 0 &&
    words.every((word) => typeof word === "string" && word.length > 0)
  );
}

function validateCommands(commands, errors) {
  if (commands === undefined) return;
  if (!validateSectionEnvelope(commands, "commands", errors)) return;

  const draft = commands.draft;
  checkType("commands", draft.commands, "array", "commands", errors);
  checkType("commands", draft.directions, "array", "directions", errors);
  checkType("commands", draft.amounts, "array", "amounts", errors);

  if (Array.isArray(draft.commands)) {
    const seen = new Set();
    for (const entry of draft.commands) {
      const action = entry && entry.action;
      const label = typeof action === "string" && action.length > 0 ? action : "<unknown>";
      if (typeof action !== "string" || action.length === 0) {
        errors.push("commands: command action must be a non-empty string");
      } else if (seen.has(action)) {
        errors.push(`commands: duplicate action "${action}"`);
      } else {
        seen.add(action);
      }
      if (!wordsAreValid(entry && entry.words)) {
        errors.push(`commands: "${label}" words must be a non-empty array of non-empty strings`);
      }
    }
  }

  if (draft.limits !== undefined) {
    if (!isPlainObject(draft.limits)) {
      errors.push("commands: limits must be an object");
    } else if (!Number.isInteger(draft.limits.maxItems) || draft.limits.maxItems < 1) {
      errors.push("commands: limits.maxItems must be an integer >= 1");
    }
  }
}

export { validateCommands };
