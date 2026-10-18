const INTENT_TYPES = Object.freeze(["answer", "command", "talk", "unclear"]);
const INTENT_SOURCES = Object.freeze(["button", "text"]);
const TALK_TOPICS = Object.freeze(["faq", "cheaper", "smalltalk"]);
const REASON_CODES = Object.freeze([
  "unclear",
  "unknown_sku",
  "limit",
  "cannot_remove_support",
  "nothing_cheaper",
  "not_found",
  "not_implemented",
  "distance_unclear",
  "distance_not_on_scene",
  "distance_need_two"
]);
const REPLY_VIA = Object.freeze(["template", "ai"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function done(errors) {
  return { ok: errors.length === 0, errors };
}

function rejectObject() {
  return { ok: false, errors: ["must be an object"] };
}

function requireString(obj, key, path, errors) {
  if (obj[key] === undefined) errors.push(`${path} is required`);
  else if (typeof obj[key] !== "string") errors.push(`${path} must be a string`);
}

function optionalString(obj, key, path, errors) {
  if (obj[key] === undefined) return;
  if (typeof obj[key] !== "string") errors.push(`${path} must be a string`);
}

function optionalNumber(obj, key, path, errors) {
  if (obj[key] === undefined) return;
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    errors.push(`${path} must be a number`);
  }
}

function requireOneOf(obj, key, allowed, path, errors) {
  if (obj[key] === undefined) errors.push(`${path} is required`);
  else if (!allowed.includes(obj[key])) {
    errors.push(`${path} must be one of: ${allowed.join(", ")}`);
  }
}

function requireBoolean(obj, key, errors) {
  if (obj[key] === undefined) errors.push(`${key} is required`);
  else if (typeof obj[key] !== "boolean") errors.push(`${key} must be a boolean`);
}

function requirePlainObject(obj, key, path, errors) {
  if (obj[key] === undefined) errors.push(`${path} is required`);
  else if (!isPlainObject(obj[key])) errors.push(`${path} must be an object`);
}

function validateAnswerPayload(payload, errors) {
  requireString(payload, "questionId", "payload.questionId", errors);
  requireString(payload, "optionId", "payload.optionId", errors);
}

function validateCommandPayload(payload, errors) {
  requireString(payload, "action", "payload.action", errors);
  optionalString(payload, "sku", "payload.sku", errors);
  optionalString(payload, "withSku", "payload.withSku", errors);
  optionalString(payload, "direction", "payload.direction", errors);
  optionalNumber(payload, "amount", "payload.amount", errors);
  optionalString(payload, "unit", "payload.unit", errors);
}

function validateTalkPayload(payload, errors) {
  requireOneOf(payload, "topic", TALK_TOPICS, "payload.topic", errors);
  optionalString(payload, "faqId", "payload.faqId", errors);
}

function validateUnclearPayload(payload, errors) {
  requireString(payload, "reason", "payload.reason", errors);
}

const PAYLOAD_CHECKS = {
  answer: validateAnswerPayload,
  command: validateCommandPayload,
  talk: validateTalkPayload,
  unclear: validateUnclearPayload
};

function validateIntent(value) {
  if (!isPlainObject(value)) return rejectObject();

  const errors = [];
  requireOneOf(value, "type", INTENT_TYPES, "type", errors);
  requireOneOf(value, "source", INTENT_SOURCES, "source", errors);
  requirePlainObject(value, "payload", "payload", errors);
  if (isPlainObject(value.payload) && PAYLOAD_CHECKS[value.type]) {
    PAYLOAD_CHECKS[value.type](value.payload, errors);
  }
  return done(errors);
}

function validateExecutorResult(value) {
  if (!isPlainObject(value)) return rejectObject();

  const errors = [];
  requireBoolean(value, "ok", errors);
  requireOneOf(value, "kind", INTENT_TYPES, "kind", errors);
  requireBoolean(value, "sceneChanged", errors);
  requirePlainObject(value, "facts", "facts", errors);

  if (value.ok === true && value.reasonCode !== null) {
    errors.push("reasonCode must be null when ok is true");
  }
  if (value.ok === false) {
    if (typeof value.reasonCode !== "string") {
      errors.push("reasonCode is required when ok is false");
    } else if (!REASON_CODES.includes(value.reasonCode)) {
      errors.push(`reasonCode must be one of: ${REASON_CODES.join(", ")}`);
    }
  }

  if (value.say === undefined) {
    errors.push("say is required");
  } else if (!isPlainObject(value.say)) {
    errors.push("say must be an object");
  } else {
    requireString(value.say, "code", "say.code", errors);
    requirePlainObject(value.say, "params", "say.params", errors);
  }

  return done(errors);
}

function nestErrors(path, check) {
  return check.errors.map((error) =>
    error === "must be an object" ? `${path} must be an object` : `${path}.${error}`
  );
}

function requireStringArray(obj, key, path, errors) {
  const value = obj[key];
  if (value === undefined) {
    errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}

function requireObjectOrNull(obj, key, path, errors) {
  const value = obj[key];
  if (value === undefined) {
    errors.push(`${path} is required`);
    return;
  }
  if (value !== null && !isPlainObject(value)) {
    errors.push(`${path} must be an object or null`);
  }
}

function validateReplyInput(value) {
  if (!isPlainObject(value)) return rejectObject();

  const errors = [];
  errors.push(...nestErrors("result", validateExecutorResult(value.result)));

  if (value.context === undefined) {
    errors.push("context is required");
  } else if (!isPlainObject(value.context)) {
    errors.push("context must be an object");
  } else {
    requirePlainObject(value.context, "profile", "context.profile", errors);
    requireStringArray(value.context, "sceneSkus", "context.sceneSkus", errors);
    requireObjectOrNull(value.context, "nextQuestion", "context.nextQuestion", errors);
  }

  return done(errors);
}

function validateReplyOutput(value) {
  if (!isPlainObject(value)) return rejectObject();

  const errors = [];
  if (value.text === undefined) errors.push("text is required");
  else if (typeof value.text !== "string" || value.text.length === 0) {
    errors.push("text must be a non-empty string");
  }
  requireOneOf(value, "via", REPLY_VIA, "via", errors);
  return done(errors);
}

export {
  INTENT_TYPES,
  INTENT_SOURCES,
  TALK_TOPICS,
  REASON_CODES,
  REPLY_VIA,
  validateIntent,
  validateExecutorResult,
  validateReplyInput,
  validateReplyOutput
};
