import { checkType, validateSectionEnvelope } from "./envelope.js";

function validateDirector(director, errors) {
  if (director === undefined) return;
  if (!validateSectionEnvelope(director, "director", errors)) return;

  const draft = director.draft;
  checkType("director", draft.personas, "array", "personas", errors);
  checkType("director", draft.low, "number", "low", errors);
  checkType("director", draft.declinesBeforeAssume, "number", "declinesBeforeAssume", errors);

  if (checkType("director", draft.gains, "object", "gains", errors)) {
    for (const key of ["reaction", "bridge", "tip", "pause", "story", "decline", "confirm"]) {
      checkType("director", draft.gains[key], "number", `gains.${key}`, errors);
    }
  }
}

export { validateDirector };
