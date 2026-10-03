import { checkType, validateSectionEnvelope } from "./envelope.js";

function validateConsultant(consultant, errors) {
  if (consultant === undefined) return;
  if (!validateSectionEnvelope(consultant, "consultant", errors)) return;

  const draft = consultant.draft;
  checkType("consultant", draft.name, "string", "name", errors);
  checkType("consultant", draft.formality, "string", "formality", errors);
  if (
    typeof draft.formality === "string" &&
    draft.formality !== "вы" &&
    draft.formality !== "ты"
  ) {
    errors.push('consultant: formality must be "вы" or "ты"');
  }
  checkType("consultant", draft.humor, "number", "humor", errors);
  checkType("consultant", draft.greeting, "string", "greeting", errors);
  checkType("consultant", draft.commandsIntro, "string", "commandsIntro", errors);
  checkType("consultant", draft.faq, "array", "faq", errors);

  if (checkType("consultant", draft.inserts, "object", "inserts", errors)) {
    checkType("consultant", draft.inserts.reactions, "array", "inserts.reactions", errors);
    checkType("consultant", draft.inserts.bridges, "object", "inserts.bridges", errors);
    checkType("consultant", draft.inserts.tips, "object", "inserts.tips", errors);
    checkType("consultant", draft.inserts.confirmBridge, "string", "inserts.confirmBridge", errors);
  }
}

export { validateConsultant };
