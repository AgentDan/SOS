import { callLlm } from "../ai/llm.js";

const TEXT_LIMIT = 300;

function words(entry) {
  if (!entry || !Array.isArray(entry.words)) return "";
  return entry.words.filter((word) => typeof word === "string" && word.trim() !== "").join(", ");
}

function list(items, format) {
  if (!Array.isArray(items)) return "";
  return items.map(format).filter(Boolean).join("; ");
}

function wordList(value) {
  if (!Array.isArray(value)) return "";
  return value.filter((word) => typeof word === "string" && word.trim() !== "").join(", ");
}

function systemPrompt(vocabulary) {
  const vocab = vocabulary && typeof vocabulary === "object" ? vocabulary : {};
  const topics = vocab.topics && typeof vocab.topics === "object" ? vocab.topics : {};
  const commands = list(vocab.commands, (entry) => {
    if (!entry || typeof entry.action !== "string") return "";
    const names = words(entry);
    return names ? `${entry.action} (${names})` : entry.action;
  });
  const products = list(vocab.products, (entry) => {
    if (!entry || typeof entry.sku !== "string") return "";
    const names = words(entry);
    return names ? `${entry.sku} (${names})` : entry.sku;
  });
  const faq = list(vocab.faq, (entry) => {
    if (!entry || typeof entry.id !== "string") return "";
    const names = words(entry);
    return names ? `${entry.id} (${names})` : entry.id;
  });

  return [
    "Ты разбираешь фразу клиента магазина офисной мебели.",
    "Верни только JSON.",
    `Допустимые действия: ${commands}.`,
    `Допустимые артикулы и их слова: ${products}.`,
    `Темы: cheaper (${wordList(topics.cheaper)}), ergo (${wordList(topics.ergo)}), smalltalk (${wordList(topics.smalltalk)}).`,
    `Частые вопросы: ${faq}.`,
    'Формат: {"type":"command","action":"...","sku":"...","skus":[]} или {"type":"talk","topic":"cheaper|ergo|smalltalk|faq","faqId":"..."} или {"type":"unclear"}.',
    "Для distance укажи в skus не больше двух артикулов в порядке упоминания. Для остальных действий укажи один sku.",
    "Если под одно слово подходят несколько артикулов, возьми первый из перечня.",
    'Если не уверен, верни {"type":"unclear"}. Ничего не выдумывай.'
  ].join(" ");
}

function actionSet(vocabulary) {
  const set = new Set();
  const commands = Array.isArray(vocabulary?.commands) ? vocabulary.commands : [];
  for (const entry of commands) {
    if (entry && typeof entry.action === "string") set.add(entry.action);
  }
  return set;
}

function skuSet(vocabulary) {
  const set = new Set();
  const products = Array.isArray(vocabulary?.products) ? vocabulary.products : [];
  for (const entry of products) {
    if (entry && typeof entry.sku === "string") set.add(entry.sku);
  }
  return set;
}

function faqSet(vocabulary) {
  const set = new Set();
  const faq = Array.isArray(vocabulary?.faq) ? vocabulary.faq : [];
  for (const entry of faq) {
    if (entry && typeof entry.id === "string") set.add(entry.id);
  }
  return set;
}

function knownSku(value, skus) {
  return typeof value === "string" && skus.has(value) ? value : null;
}

function commandIntent(parsed, actions, skus) {
  if (typeof parsed.action !== "string" || !actions.has(parsed.action)) return null;

  let sku = null;
  if (Object.prototype.hasOwnProperty.call(parsed, "sku") && parsed.sku !== undefined) {
    sku = knownSku(parsed.sku, skus);
    if (!sku) return null;
  }

  let listed = null;
  if (Object.prototype.hasOwnProperty.call(parsed, "skus") && parsed.skus !== undefined) {
    if (!Array.isArray(parsed.skus) || parsed.skus.length > 2) return null;
    listed = [];
    for (const item of parsed.skus) {
      const valid = knownSku(item, skus);
      if (!valid) return null;
      listed.push(valid);
    }
  }

  if (parsed.action === "distance") {
    const chosen = listed && listed.length > 0 ? listed : sku ? [sku] : [];
    const payload = { action: "distance" };
    if (chosen.length > 0) payload.skus = chosen;
    return { type: "command", source: "text", payload };
  }

  if (listed && listed.length > 1 && !sku) return null;
  const payload = { action: parsed.action };
  const chosen = sku ?? (listed && listed.length === 1 ? listed[0] : undefined);
  if (chosen) payload.sku = chosen;
  return { type: "command", source: "text", payload };
}

function talkIntent(parsed, faqIds) {
  const topic = parsed.topic;
  if (topic !== "cheaper" && topic !== "ergo" && topic !== "smalltalk" && topic !== "faq") return null;
  const hasFaq = Object.prototype.hasOwnProperty.call(parsed, "faqId") && parsed.faqId !== undefined;
  if (hasFaq && (typeof parsed.faqId !== "string" || !faqIds.has(parsed.faqId))) return null;
  if (topic === "faq") {
    if (typeof parsed.faqId !== "string" || !faqIds.has(parsed.faqId)) return null;
    return { type: "talk", source: "text", payload: { topic: "faq", faqId: parsed.faqId } };
  }
  return { type: "talk", source: "text", payload: { topic } };
}

function toIntent(raw, vocabulary) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.type === "unclear") return null;
  if (parsed.type === "command") return commandIntent(parsed, actionSet(vocabulary), skuSet(vocabulary));
  if (parsed.type === "talk") return talkIntent(parsed, faqSet(vocabulary));
  return null;
}

async function parseWithLlm({ text, vocabulary, llm = callLlm, fetchImpl } = {}) {
  if (typeof text !== "string") return null;
  const clipped = text.trim().slice(0, TEXT_LIMIT);
  if (!clipped) return null;

  const ask = typeof llm === "function" ? llm : callLlm;
  let result;
  try {
    result = await ask({
      system: systemPrompt(vocabulary),
      user: clipped,
      maxTokens: 150,
      fetchImpl
    });
  } catch {
    return null;
  }
  if (!result || result.ok !== true || typeof result.text !== "string") return null;
  return toIntent(result.text, vocabulary);
}

export { parseWithLlm };
