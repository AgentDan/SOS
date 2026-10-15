/**
 * interpret(input, vocabulary) → Intent.
 * Чистая функция: не читает диск и env, не пишет и не меняет аргументы.
 *
 * input:
 * - кнопка: { source: "button", questionId, optionId }
 * - текст: { source: "text", text }
 *
 * vocabulary — любое поле можно не передавать или оставить пустым:
 * {
 *   commands: [{ action: "add" | "remove" | "replace" | string, words: string[] }],
 *   products: [{ sku: string, words: string[] }],
 *   topics:   { cheaper: string[], smalltalk: string[] },
 *   faq:      [{ id: string, words: string[] }]
 * }
 *
 * Нормализация текста и слов словаря одна и та же: нижний регистр, «ё» → «е»,
 * знаки препинания заменяются пробелами, повторные пробелы схлопываются.
 * Слово словаря найдено, если с границы слова текста начинается эта подстрока
 * (основа «кресл» находит «кресло» и «кресла», но не «скресл»).
 * Фраза из нескольких слов ищется так же: подстрока нормализованного текста
 * с границы слова.
 *
 * Кнопка со строковыми questionId и optionId → answer. questionId с префиксом
 * confirm_ идёт тем же путём. Иначе → unclear, reason "bad_button".
 *
 * Текст, первое совпадение выигрывает:
 * 1. Пустая строка, не строка или одни пробелы → unclear, reason "empty".
 * 2. Команда из commands → command { action, sku? }. sku — товар, чьё слово
 *    стоит в тексте раньше остальных. Нет артикула — поля sku нет.
 *    direction, amount и unit скелет не заполняет.
 * 3. Слово из topics.cheaper → talk { topic: "cheaper" }.
 * 4. Слово из faq[].words → talk { topic: "faq", faqId }. При нескольких
 *    совпадениях берётся то, чьё слово стоит в тексте раньше.
 * 5. Слово из topics.smalltalk → talk { topic: "smalltalk" }.
 * 6. Иначе → unclear, reason "no_match".
 *
 * Внутри шагов 2 и 4 при равной позиции в тексте побеждает запись,
 * которая раньше в словаре.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalize(value) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function findAtBoundary(text, phrase) {
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(phrase, from);
    if (index === -1) return -1;
    if (index === 0 || text.charAt(index - 1) === " ") return index;
    from = index + 1;
  }
  return -1;
}

function earliestIndex(text, words) {
  if (!Array.isArray(words)) return -1;
  let best = -1;
  for (const word of words) {
    if (typeof word !== "string") continue;
    const phrase = normalize(word);
    if (!phrase) continue;
    const index = findAtBoundary(text, phrase);
    if (index < 0) continue;
    if (best < 0 || index < best) best = index;
  }
  return best;
}

function earliestEntry(text, entries, accept) {
  if (!Array.isArray(entries)) return null;
  let winner = null;
  for (const entry of entries) {
    if (!isPlainObject(entry) || !accept(entry)) continue;
    const index = earliestIndex(text, entry.words);
    if (index < 0) continue;
    if (!winner || index < winner.index) winner = { index, entry };
  }
  return winner ? winner.entry : null;
}

function listMatches(text, words) {
  return earliestIndex(text, words) >= 0;
}

function unclear(source, reason) {
  return { type: "unclear", source, payload: { reason } };
}

function fromButton(input) {
  if (typeof input.questionId !== "string" || typeof input.optionId !== "string") {
    return unclear("button", "bad_button");
  }
  return {
    type: "answer",
    source: "button",
    payload: { questionId: input.questionId, optionId: input.optionId }
  };
}

function fromText(text, vocabulary) {
  if (typeof text !== "string" || text.trim() === "") return unclear("text", "empty");

  const normalized = normalize(text);
  const vocab = isPlainObject(vocabulary) ? vocabulary : {};
  const topics = isPlainObject(vocab.topics) ? vocab.topics : {};

  const command = earliestEntry(normalized, vocab.commands, (entry) => typeof entry.action === "string");
  if (command) {
    const payload = { action: command.action };
    const product = earliestEntry(normalized, vocab.products, (entry) => typeof entry.sku === "string");
    if (product) payload.sku = product.sku;
    return { type: "command", source: "text", payload };
  }

  if (listMatches(normalized, topics.cheaper)) {
    return { type: "talk", source: "text", payload: { topic: "cheaper" } };
  }

  const faq = earliestEntry(normalized, vocab.faq, (entry) => typeof entry.id === "string");
  if (faq) {
    return { type: "talk", source: "text", payload: { topic: "faq", faqId: faq.id } };
  }

  if (listMatches(normalized, topics.smalltalk)) {
    return { type: "talk", source: "text", payload: { topic: "smalltalk" } };
  }

  return unclear("text", "no_match");
}

function interpret(input, vocabulary) {
  if (isPlainObject(input) && input.source === "button") return fromButton(input);
  return fromText(isPlainObject(input) ? input.text : undefined, vocabulary);
}

export { interpret };
