import { buildLinkMap } from "./link-map.js";

const SCREEN_ENTRIES = [
  { id: "screen:home", kind: "screen", label: "Главная", route: { screen: "overview" } },
  { id: "screen:catalog", kind: "screen", label: "Каталог", route: { screen: "catalog" } },
  { id: "screen:questionnaire", kind: "screen", label: "Анкета", route: { screen: "questionnaire" } },
  { id: "screen:dialog", kind: "screen", label: "Диалог", route: { screen: "dialog", name: "consultant" } },
  { id: "screen:dialog:consultant", kind: "screen", label: "Диалог: Консультант", route: { screen: "dialog", name: "consultant" } },
  { id: "screen:dialog:director", kind: "screen", label: "Диалог: Режиссёр", route: { screen: "dialog", name: "director" } },
  { id: "screen:dialog:sales", kind: "screen", label: "Диалог: Продажа", route: { screen: "dialog", name: "sales" } },
  { id: "screen:dialog:commands", kind: "screen", label: "Диалог: Команды сцены", route: { screen: "dialog", name: "commands" } },
  { id: "screen:dialog:ai-rules", kind: "screen", label: "Диалог: Правила AI", route: { screen: "dialog", name: "ai-rules" } },
  { id: "screen:ergonomics", kind: "screen", label: "Эргономика", route: { screen: "section", name: "ergonomics" } },
  { id: "screen:map", kind: "screen", label: "Карта связей", route: { screen: "map" } },
  { id: "screen:journal", kind: "screen", label: "Версии и журнал", route: { screen: "journal" } }
];

const KIND_ORDER = ["screen", "product", "question", "option", "need", "type", "scenario"];

const KIND_TITLES = {
  screen: "Экраны",
  product: "Товары",
  question: "Вопросы",
  option: "Ответы",
  need: "Потребности",
  type: "Типы",
  scenario: "Сценарии"
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fold(value) {
  return String(value ?? "")
    .replace(/Ё/g, "Е")
    .replace(/ё/g, "е")
    .toLowerCase();
}

function nodeKey(node) {
  if (isRecord(node) && typeof node.key === "string" && node.key.length > 0) return node.key;
  const id = isRecord(node) && typeof node.id === "string" ? node.id : "";
  const cut = id.indexOf(":");
  return cut >= 0 ? id.slice(cut + 1) : id;
}

function optionQuestionId(node) {
  const data = isRecord(node) && isRecord(node.data) ? node.data : null;
  if (data && typeof data.questionId === "string" && data.questionId.length > 0) return data.questionId;
  const key = nodeKey(node);
  const cut = key.indexOf(":");
  return cut > 0 ? key.slice(0, cut) : "";
}

function routeForNode(node) {
  if (!isRecord(node)) return null;
  if (node.kind === "screen" && isRecord(node.route)) return node.route;
  const key = nodeKey(node);
  if (node.kind === "product") return key ? { screen: "catalog", sku: key } : null;
  if (node.kind === "type") return key ? { screen: "catalog", tab: "types", item: key } : null;
  if (node.kind === "need") return key ? { screen: "catalog", tab: "needs", item: key } : null;
  if (node.kind === "question") return key ? { screen: "questionnaire", q: key } : null;
  if (node.kind === "option") {
    const questionId = optionQuestionId(node);
    return questionId ? { screen: "questionnaire", q: questionId } : null;
  }
  if (node.kind === "scenario") return { screen: "questionnaire", tab: "scenarios" };
  return null;
}

function kindTitle(kind) {
  return KIND_TITLES[kind] || "Прочее";
}

function countText(count) {
  const n = Math.abs(Math.trunc(Number(count))) || 0;
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word = "товаров";
  if (!(mod100 > 10 && mod100 < 20)) {
    if (mod10 === 1) word = "товар";
    else if (mod10 >= 2 && mod10 <= 4) word = "товара";
  }
  return `${n} ${word}`;
}

function dimensionText(dimensions) {
  if (!isRecord(dimensions)) return "";
  const parts = [];
  for (const key of ["width", "depth", "height"]) {
    const value = dimensions[key];
    if (typeof value === "number" && Number.isFinite(value)) parts.push(String(value));
  }
  return parts.join("×");
}

function pushPart(parts, value) {
  if (typeof value === "string" && value.length > 0) parts.push(value);
  else if (typeof value === "number" && Number.isFinite(value)) parts.push(String(value));
}

function textOf(parts) {
  return parts.filter((part) => typeof part === "string" && part.length > 0).join("\n");
}

function screenEntries() {
  return SCREEN_ENTRIES.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    hint: typeof entry.hint === "string" ? entry.hint : "",
    text: textOf([entry.label, entry.hint, entry.id]),
    route: entry.route
  }));
}

function buildSearchIndex(input) {
  const source = isRecord(input) ? input : {};
  let map;
  try {
    map = buildLinkMap({
      questionnaire: isRecord(source.questionnaire) ? source.questionnaire : {},
      catalog: isRecord(source.catalog) ? source.catalog : {}
    });
  } catch {
    map = { nodes: [] };
  }
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const typeLabel = new Map();
  const questionLabel = new Map();
  const productCount = new Map();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.key !== "string") continue;
    if (node.kind === "type") typeLabel.set(node.key, typeof node.label === "string" ? node.label : node.key);
    if (node.kind === "question") questionLabel.set(node.key, typeof node.label === "string" ? node.label : node.key);
    if (node.kind === "product") {
      const typeId = isRecord(node.data) && typeof node.data.type === "string" ? node.data.type : "";
      if (typeId) productCount.set(typeId, (productCount.get(typeId) || 0) + 1);
    }
  }
  const phaseName = new Map();
  const phases = isRecord(source.questionnaire) && Array.isArray(source.questionnaire.phases) ? source.questionnaire.phases : [];
  for (const phase of phases) {
    if (!isRecord(phase) || typeof phase.id !== "string" || phase.id.length === 0) continue;
    const name = typeof phase.name === "string" && phase.name.trim().length > 0 ? phase.name : phase.id;
    phaseName.set(phase.id, name);
  }

  const entries = screenEntries();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || node.id.length === 0) continue;
    const route = routeForNode(node);
    if (!route) continue;
    const data = isRecord(node.data) ? node.data : {};
    const label = typeof node.label === "string" && node.label.length > 0 ? node.label : nodeKey(node);
    let hint = "";
    const parts = [label, node.id, node.key];
    if (node.kind === "product") {
      const typeId = typeof data.type === "string" ? data.type : "";
      const typeText = typeLabel.get(typeId) || typeId;
      const size = dimensionText(data.dimensions);
      hint = textOf([typeText, size]).replaceAll("\n", " · ");
      pushPart(parts, data.sku);
      pushPart(parts, data.label);
      pushPart(parts, data.name);
      if (Array.isArray(data.words)) {
        for (const word of data.words) pushPart(parts, word);
      }
    } else if (node.kind === "option") {
      const questionId = optionQuestionId(node);
      hint = questionLabel.get(questionId) || "";
      pushPart(parts, hint);
      pushPart(parts, data.label);
    } else if (node.kind === "question") {
      const phaseId = typeof data.phase === "string" ? data.phase : "";
      hint = phaseName.get(phaseId) || phaseId;
      pushPart(parts, data.textFallback);
    } else if (node.kind === "type") {
      hint = countText(productCount.get(node.key) || 0);
    } else if (node.kind === "need") {
      const criteria = isRecord(data.criteria) ? data.criteria : {};
      const typeId = typeof criteria.type === "string" ? criteria.type : "";
      const typeText = typeLabel.get(typeId) || typeId;
      const width =
        typeof criteria.minWidth === "number" && Number.isFinite(criteria.minWidth) ? `от ${criteria.minWidth} мм` : "";
      hint = textOf([typeText, width]).replaceAll("\n", ", ");
      pushPart(parts, data.name);
    } else if (node.kind === "scenario") {
      pushPart(parts, data.name);
    }
    entries.push({
      id: node.id,
      kind: node.kind,
      label,
      hint,
      text: textOf(parts),
      route
    });
  }
  return entries;
}

function exactKeys(entry) {
  const keys = [];
  if (typeof entry.id === "string" && entry.id.length > 0) {
    keys.push(entry.id);
    const cut = entry.id.indexOf(":");
    if (cut >= 0 && cut < entry.id.length - 1) keys.push(entry.id.slice(cut + 1));
  }
  if (isRecord(entry.route) && typeof entry.route.sku === "string" && entry.route.sku.length > 0) {
    keys.push(entry.route.sku);
  }
  return keys;
}

function kindRank(kind) {
  const index = KIND_ORDER.indexOf(kind);
  return index >= 0 ? index : KIND_ORDER.length;
}

function searchIndex(index, query, limit = 30) {
  const needle = fold(typeof query === "string" ? query.trim() : "");
  if (!needle) return [];
  const words = needle.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  const cap = typeof limit === "number" && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 30;
  const hits = [];
  const list = Array.isArray(index) ? index : [];
  for (const entry of list) {
    if (!isRecord(entry) || typeof entry.text !== "string") continue;
    const hay = fold(entry.text);
    if (!words.every((word) => hay.includes(word))) continue;
    hits.push(entry);
  }
  hits.sort((left, right) => {
    const leftExact = exactKeys(left).some((key) => fold(key) === needle) ? 0 : fold(left.label).startsWith(needle) ? 1 : 2;
    const rightExact = exactKeys(right).some((key) => fold(key) === needle) ? 0 : fold(right.label).startsWith(needle) ? 1 : 2;
    if (leftExact !== rightExact) return leftExact - rightExact;
    const kind = kindRank(left.kind) - kindRank(right.kind);
    if (kind !== 0) return kind;
    const label = String(left.label ?? "").localeCompare(String(right.label ?? ""), "ru");
    if (label !== 0) return label;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
  const buckets = new Map();
  for (const item of hits.slice(0, cap)) {
    const kind = typeof item.kind === "string" ? item.kind : "";
    if (!buckets.has(kind)) buckets.set(kind, []);
    buckets.get(kind).push(item);
  }
  const groups = [];
  const seen = new Set();
  for (const kind of KIND_ORDER) {
    if (!buckets.has(kind)) continue;
    seen.add(kind);
    groups.push({ kind, title: kindTitle(kind), items: buckets.get(kind) });
  }
  for (const [kind, items] of buckets) {
    if (seen.has(kind)) continue;
    groups.push({ kind, title: kindTitle(kind), items });
  }
  return groups;
}

export { SCREEN_ENTRIES, buildSearchIndex, routeForNode, searchIndex, kindTitle };
