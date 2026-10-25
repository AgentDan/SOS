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
 *   topics:   { cheaper: string[], ergo: string[], smalltalk: string[] },
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
 * 2. Команда distance → command { action: "distance", skus? }.
 *    Проверяется раньше add, remove и replace: если в тексте есть её слово,
 *    это distance, даже когда слово другой команды стоит раньше.
 *    skus — до двух товаров в порядке упоминания. Повтор того же слова
 *    («монитором и монитором») даёт один sku дважды: две разные копии.
 *    Два разных слова одного типа тоже попадают в skus. Один товар — массив
 *    из одного элемента. Нет товаров — поля skus нет.
 * 3. Другая команда из commands → command { action, sku? }. sku — товар, чьё
 *    слово стоит в тексте раньше остальных. Нет артикула — поля sku нет.
 *    direction, amount и unit скелет не заполняет.
 * 4. Слово из topics.cheaper → talk { topic: "cheaper" }.
 * 5. Слово из topics.ergo → talk { topic: "ergo" }.
 * 6. Слово из faq[].words → talk { topic: "faq", faqId }. При нескольких
 *    совпадениях берётся то, чьё слово стоит в тексте раньше.
 * 7. Слово из topics.smalltalk → talk { topic: "smalltalk" }.
 * 8. Иначе → unclear, reason "no_match".
 *
 * Мульти-совпадения внутри шага решает первое слово по позиции в тексте,
 * как у команд и FAQ. Более ранний шаг побеждает, даже если его слово
 * в тексте стоит позже: «дешевле» в одной фразе с эргономикой остаётся cheaper.
 * Внутри шагов 3 и 6 при равной позиции в тексте побеждает запись,
 * которая раньше в словаре. У distance на одном индексе то же правило,
 * дальше берутся следующие вхождения.
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

function findAllBoundaries(text, phrase) {
  const indexes = [];
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(phrase, from);
    if (index === -1) break;
    if (index === 0 || text.charAt(index - 1) === " ") indexes.push(index);
    from = index + 1;
  }
  return indexes;
}

function productHits(text, products) {
  const byIndex = new Map();
  if (!Array.isArray(products)) return [];
  products.forEach((entry, order) => {
    if (!isPlainObject(entry) || typeof entry.sku !== "string" || !Array.isArray(entry.words)) return;
    for (const word of entry.words) {
      if (typeof word !== "string") continue;
      const phrase = normalize(word);
      if (!phrase) continue;
      for (const index of findAllBoundaries(text, phrase)) {
        const current = byIndex.get(index);
        if (!current || order < current.order) byIndex.set(index, { index, sku: entry.sku, order });
      }
    }
  });
  return [...byIndex.values()].sort((left, right) => left.index - right.index || left.order - right.order);
}

function matchingCommand(text, commands) {
  const list = Array.isArray(commands) ? commands : [];
  const distance = list.find((entry) => isPlainObject(entry) && entry.action === "distance");
  if (distance && earliestIndex(text, distance.words) >= 0) return distance;
  return earliestEntry(
    text,
    list,
    (entry) => typeof entry.action === "string" && entry.action !== "distance"
  );
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

  const hits = productHits(normalized, vocab.products);
  const command = matchingCommand(normalized, vocab.commands);
  if (command) {
    if (command.action === "distance") {
      const payload = { action: "distance" };
      const skus = hits.slice(0, 2).map((hit) => hit.sku);
      if (skus.length > 0) payload.skus = skus;
      return { type: "command", source: "text", payload };
    }
    const payload = { action: command.action };
    if (hits.length > 0) payload.sku = hits[0].sku;
    return { type: "command", source: "text", payload };
  }

  if (listMatches(normalized, topics.cheaper)) {
    return { type: "talk", source: "text", payload: { topic: "cheaper" } };
  }

  if (listMatches(normalized, topics.ergo)) {
    return { type: "talk", source: "text", payload: { topic: "ergo" } };
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
