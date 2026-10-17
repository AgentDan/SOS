import { checkType, isPlainObject, validateSectionEnvelope } from "./envelope.js";

function isStringList(value) {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function validateTopics(topics, errors) {
  if (topics === undefined) return;
  if (!isPlainObject(topics)) {
    errors.push("consultant: topics must be an object");
    return;
  }
  if (!isStringList(topics.cheaper)) {
    errors.push("consultant: topics.cheaper must be an array of non-empty strings");
  }
  if (!isStringList(topics.smalltalk)) {
    errors.push("consultant: topics.smalltalk must be an array of non-empty strings");
  }
}

function validateFaq(faq, errors) {
  if (!Array.isArray(faq)) return;
  const seen = new Set();
  for (const entry of faq) {
    const id = entry && entry.id;
    const label = typeof id === "string" && id.length > 0 ? id : "<unknown>";
    if (typeof id !== "string" || id.length === 0) {
      errors.push("consultant: faq id must be a non-empty string");
    } else if (seen.has(id)) {
      errors.push(`consultant: duplicate faq id "${id}"`);
    } else {
      seen.add(id);
    }
    if (!isStringList(entry && entry.words) || entry.words.length === 0) {
      errors.push(
        `consultant: faq "${label}" words must be a non-empty array of non-empty strings`
      );
    }
    if (!entry || typeof entry.answer !== "string" || entry.answer.length === 0) {
      errors.push(`consultant: faq "${label}" answer must be a non-empty string`);
    }
  }
}

const REPLY_PLACEHOLDERS = new Set([
  "item",
  "newItem",
  "savedEur",
  "max",
  "answer",
  "question"
]);

function validateReplies(replies, errors) {
  if (replies === undefined) return;
  if (!isPlainObject(replies)) {
    errors.push("consultant: replies must be an object");
    return;
  }

  for (const [key, value] of Object.entries(replies)) {
    const label = key.length > 0 ? key : "<empty>";
    if (key.length === 0) {
      errors.push("consultant: replies key must be a non-empty string");
    }
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`consultant: replies "${label}" must be a non-empty string`);
      continue;
    }
    for (const match of value.matchAll(/\{([^{}]*)\}/g)) {
      if (!REPLY_PLACEHOLDERS.has(match[1])) {
        errors.push(`consultant: replies "${label}" has unknown placeholder "{${match[1]}}"`);
      }
    }
  }
}

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
  validateTopics(draft.topics, errors);
  validateFaq(draft.faq, errors);
  validateReplies(draft.replies, errors);

  if (checkType("consultant", draft.inserts, "object", "inserts", errors)) {
    checkType("consultant", draft.inserts.reactions, "array", "inserts.reactions", errors);
    checkType("consultant", draft.inserts.bridges, "object", "inserts.bridges", errors);
    checkType("consultant", draft.inserts.tips, "object", "inserts.tips", errors);
    checkType("consultant", draft.inserts.confirmBridge, "string", "inserts.confirmBridge", errors);
  }
}

export { validateConsultant };
