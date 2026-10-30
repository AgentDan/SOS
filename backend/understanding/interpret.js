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
 *    слово стоит в тексте раньше остальных. На одной позиции сначала более
 *    длинная фраза, затем размер из words рядом с названием, затем более
 *    ранний товар. Нет артикула — поля sku нет.
 *    Для replace, если упоминаний товара два и они разные, payload.withSku —
 *    второе. Одинаковые упоминания withSku не ставят.
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
 * Внутри шага 6 при равной позиции побеждает запись, которая раньше в словаре.
 * У товаров на одной позиции побеждает более длинная фраза, затем товар,
 * чьё число из words стоит целым токеном рядом с этим названием, затем
 * более ранний порядок в каталоге. У distance то же разрешение, дальше
 * берутся следующие вхождения.
 * Слово из одних цифр не занимает позицию, если другое изделие делит с ним
 * название. «200» не совпадает с токеном «2000». Рядом — до трёх токенов
 * после названия или один токен перед ним; «см», «мм», «cm» и «mm» между
 * числом и названием не считаются. Нет такого соседа по названию — цифровое
 * слово ищется как обычная фраза. Другое слово этого товара в том же окне
 * тоже выбирает артикул и само остаётся отдельным совпадением.
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

const SIZE_UNITS = new Set(["см", "мм", "cm", "mm"]);

function isSizeWord(phrase) {
  return /^\d+$/u.test(phrase);
}

function prepareProducts(products) {
  const prepared = [];
  products.forEach((entry, order) => {
    if (!isPlainObject(entry) || typeof entry.sku !== "string" || !Array.isArray(entry.words)) return;
    const names = [];
    const sizes = [];
    for (const word of entry.words) {
      if (typeof word !== "string") continue;
      const phrase = normalize(word);
      if (!phrase) continue;
      if (isSizeWord(phrase)) sizes.push(phrase);
      else names.push(phrase);
    }
    prepared.push({ sku: entry.sku, order, names, sizes, shared: false });
  });

  const owners = new Map();
  for (const product of prepared) {
    for (const name of product.names) {
      const group = owners.get(name) ?? [];
      if (!group.includes(product)) group.push(product);
      owners.set(name, group);
    }
  }
  for (const group of owners.values()) {
    if (group.length < 2) continue;
    for (const product of group) product.shared = true;
  }
  return prepared;
}

function matchPhrases(product) {
  return product.shared ? product.names : [...product.names, ...product.sizes];
}

function rememberHit(byIndex, candidate) {
  const list = byIndex.get(candidate.index);
  if (!list) {
    byIndex.set(candidate.index, [candidate]);
    return;
  }
  const found = list.findIndex((item) => item.sku === candidate.sku);
  if (found < 0) list.push(candidate);
  else if (candidate.length > list[found].length) list[found] = candidate;
}

function textTokens(text) {
  const tokens = [];
  const pattern = /\S+/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    tokens.push({ text: match[0], index: match.index });
  }
  return tokens;
}

function nameSpan(tokens, charIndex, phrase) {
  const start = tokens.findIndex((token) => token.index === charIndex);
  if (start < 0) return null;
  const count = phrase.split(" ").length;
  return { start, end: Math.min(tokens.length - 1, start + count - 1) };
}

function tokenDistance(tokens, span, at) {
  if (at >= span.start && at <= span.end) return null;
  let distance = 0;
  if (at < span.start) {
    for (let index = span.start - 1; index >= at; index -= 1) {
      if (SIZE_UNITS.has(tokens[index].text)) continue;
      distance += 1;
      if (distance > 1) return null;
    }
    return distance > 0 ? distance : null;
  }
  for (let index = span.end + 1; index <= at; index += 1) {
    if (SIZE_UNITS.has(tokens[index].text)) continue;
    distance += 1;
    if (distance > 3) return null;
  }
  return distance > 0 ? distance : null;
}

function nearestSize(item, tokens, span) {
  const sizes = new Set(item.sizes);
  let best = null;
  for (let at = 0; at < tokens.length; at += 1) {
    if (!sizes.has(tokens[at].text)) continue;
    const distance = tokenDistance(tokens, span, at);
    if (distance == null) continue;
    if (!best || distance < best.distance || (distance === best.distance && at < best.at)) {
      best = { distance, at };
    }
  }
  return best;
}

function distinctive(name, tied) {
  return tied.some((item) => !item.names.includes(name));
}

function nearestExtra(item, tied, text, tokens, span) {
  let best = null;
  for (const name of item.names) {
    if (name === item.phrase || !distinctive(name, tied)) continue;
    for (const index of findAllBoundaries(text, name)) {
      const at = tokens.findIndex((token) => token.index === index);
      if (at < 0) continue;
      const distance = tokenDistance(tokens, span, at);
      if (distance == null) continue;
      if (!best || distance < best.distance || (distance === best.distance && name.length > best.length)) {
        best = { distance, length: name.length };
      }
    }
  }
  return best;
}

function pickHit(list, text, tokens) {
  let maxLength = 0;
  for (const item of list) if (item.length > maxLength) maxLength = item.length;
  const tied = list.filter((item) => item.length === maxLength).sort((left, right) => left.order - right.order);
  if (tied.length === 1 || !tied[0].shared) return tied[0];

  let sizePick = null;
  for (const item of tied) {
    const span = nameSpan(tokens, item.index, item.phrase);
    if (!span) continue;
    const place = nearestSize(item, tokens, span);
    if (!place) continue;
    const better =
      !sizePick ||
      place.distance < sizePick.distance ||
      (place.distance === sizePick.distance && place.at < sizePick.at) ||
      (place.distance === sizePick.distance && place.at === sizePick.at && item.order < sizePick.order);
    if (better) sizePick = { distance: place.distance, at: place.at, order: item.order, item };
  }
  if (sizePick) return sizePick.item;

  let extraPick = null;
  for (const item of tied) {
    const span = nameSpan(tokens, item.index, item.phrase);
    if (!span) continue;
    const extra = nearestExtra(item, tied, text, tokens, span);
    if (!extra) continue;
    const better =
      !extraPick ||
      extra.distance < extraPick.distance ||
      (extra.distance === extraPick.distance && extra.length > extraPick.length) ||
      (extra.distance === extraPick.distance && extra.length === extraPick.length && item.order < extraPick.order);
    if (better) extraPick = { distance: extra.distance, length: extra.length, order: item.order, item };
  }
  if (extraPick) return extraPick.item;
  return tied[0];
}

function productHits(text, products) {
  if (!Array.isArray(products)) return [];
  const byIndex = new Map();
  for (const product of prepareProducts(products)) {
    for (const phrase of matchPhrases(product)) {
      for (const index of findAllBoundaries(text, phrase)) {
        rememberHit(byIndex, {
          index,
          sku: product.sku,
          order: product.order,
          length: phrase.length,
          phrase,
          names: product.names,
          sizes: product.sizes,
          shared: product.shared
        });
      }
    }
  }
  const tokens = textTokens(text);
  const hits = [];
  for (const list of byIndex.values()) {
    const winner = pickHit(list, text, tokens);
    hits.push({ index: winner.index, sku: winner.sku, order: winner.order });
  }
  return hits.sort((left, right) => left.index - right.index || left.order - right.order);
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
    if (command.action === "replace" && hits.length >= 2 && hits[0].sku !== hits[1].sku) {
      payload.withSku = hits[1].sku;
    }
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
