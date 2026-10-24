// Единственный текст в коде: запас, если шаблон consultant битый или отсутствует.
const FALLBACK_TEXT = "Не удалось ответить.";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asMap(value) {
  return isPlainObject(value) ? value : {};
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function named(names, sku) {
  if (typeof sku !== "string" || sku.length === 0) return "";
  const label = asMap(names)[sku];
  return nonEmpty(label) ?? sku;
}

function questionText(nextQuestion) {
  if (!isPlainObject(nextQuestion) || typeof nextQuestion.textFallback !== "string") return "";
  return nextQuestion.textFallback.trim();
}

function chosenTemplate(code, params, templates) {
  const map = asMap(templates);
  const key = code === "limit" && params.max != null ? "limit_max" : code;
  if (typeof key !== "string") return null;
  return nonEmpty(map[key]);
}

function fallbackTemplate(ok, templates) {
  const map = asMap(templates);
  const key = ok === true ? "answer_ok" : "unclear";
  return nonEmpty(map[key]) ?? FALLBACK_TEXT;
}

function fill(template, values) {
  return template.replace(/\{([^{}]*)\}/g, (token, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return token;
    const value = values[name];
    if (value == null) return "";
    return String(value);
  });
}

function clipWords(text, maxWords) {
  if (typeof maxWords !== "number" || !Number.isFinite(maxWords) || maxWords < 1) return text;
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function reply({ result, context, templates, names, maxWords } = {}) {
  const outcome = isPlainObject(result) ? result : {};
  const say = isPlainObject(outcome.say) ? outcome.say : {};
  const params = isPlainObject(say.params) ? say.params : {};
  const facts = isPlainObject(outcome.facts) ? outcome.facts : {};
  const template = chosenTemplate(say.code, params, templates) ?? fallbackTemplate(outcome.ok, templates);
  const question = questionText(context?.nextQuestion);

  const values = {
    item: named(names, params.sku),
    newItem: named(names, params.withSku),
    savedEur: params.savedEur,
    max: params.max,
    answer: facts.answer,
    question,
    a: params.a,
    b: params.b,
    name: params.name
  };
  if (typeof params.distance === "string") values.distance = params.distance;
  let text = fill(template, values);

  if (outcome.ok === true && outcome.kind === "answer" && question) {
    text = `${text} ${question}`;
  }

  text = clipWords(text, maxWords);
  if (text.trim() === "") text = FALLBACK_TEXT;

  const spoken = { text, via: "template" };
  if (say.code === "distance_measure") {
    const map = asMap(templates);
    const fallback = nonEmpty(map.distance_need_two) ?? nonEmpty(map.unclear);
    if (fallback) spoken.fallback = fallback;
  }
  return spoken;
}

export { reply, FALLBACK_TEXT };
