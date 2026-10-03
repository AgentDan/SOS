import { checkType, validateSectionEnvelope } from "./envelope.js";

function validateCommands(commands, errors) {
  if (commands === undefined) return;
  if (!validateSectionEnvelope(commands, "commands", errors)) return;

  const draft = commands.draft;
  checkType("commands", draft.commands, "array", "commands", errors);
  checkType("commands", draft.directions, "array", "directions", errors);
  checkType("commands", draft.amounts, "array", "amounts", errors);
}

export { validateCommands };
