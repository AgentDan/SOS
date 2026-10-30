import { useEffect, useRef, useState } from "react";
import { getSection, isAbort } from "../api/admin-api.js";
import { buildLinkMap, chainOf, diffMaps, linkKey, onlyHere } from "../lib/link-map.js";
import { problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { Banner } from "../components/Banner.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]";
const MUTED = "text-[#5e584e] dark:text-[#b7b0a4]";
const FIELD =
  "w-full rounded-lg border border-[#ddd4c6] bg-[#fffdf8] px-2.5 py-2 text-[15px] dark:border-[#343b46] dark:bg-[#1e232b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]";
const SEG = "flex flex-wrap items-center rounded-[10px] border border-[#ddd4c6] bg-[#fffdf8] p-1 dark:border-[#343b46] dark:bg-[#1e232b]";
const SEG_ON = `cursor-pointer rounded-lg bg-[#1f6b4a] px-3 py-1.5 text-[14px] font-[650] text-[#f4fff8] dark:bg-[#3d9a6e] ${FOCUS}`;
const SEG_OFF = `cursor-pointer rounded-lg bg-transparent px-3 py-1.5 text-[14px] ${FOCUS}`;

const KINDS = [
  {
    id: "scenario",
    title: "Сценарии",
    one: "Сценарий",
    dot: "bg-[#6d4bd1] dark:bg-[#b9a6ff]",
    stripe: "bg-[#6d4bd1] dark:bg-[#b9a6ff]",
    ring: "outline outline-2 outline-[#6d4bd1] dark:outline-[#b9a6ff]"
  },
  {
    id: "question",
    title: "Вопросы",
    one: "Вопрос",
    dot: "bg-[#2b6cb0] dark:bg-[#8ab8f0]",
    stripe: "bg-[#2b6cb0] dark:bg-[#8ab8f0]",
    ring: "outline outline-2 outline-[#2b6cb0] dark:outline-[#8ab8f0]"
  },
  {
    id: "option",
    title: "Ответы",
    one: "Ответ",
    dot: "bg-[#0f766e] dark:bg-[#6fd3c8]",
    stripe: "bg-[#0f766e] dark:bg-[#6fd3c8]",
    ring: "outline outline-2 outline-[#0f766e] dark:outline-[#6fd3c8]"
  },
  {
    id: "need",
    title: "Потребности",
    one: "Потребность",
    dot: "bg-[#b7791f] dark:bg-[#f0c36b]",
    stripe: "bg-[#b7791f] dark:bg-[#f0c36b]",
    ring: "outline outline-2 outline-[#b7791f] dark:outline-[#f0c36b]"
  },
  {
    id: "type",
    title: "Типы",
    one: "Тип",
    dot: "bg-[#475569] dark:bg-[#a9b6c7]",
    stripe: "bg-[#475569] dark:bg-[#a9b6c7]",
    ring: "outline outline-2 outline-[#475569] dark:outline-[#a9b6c7]"
  },
  {
    id: "product",
    title: "Товары",
    one: "Товар",
    dot: "bg-[#1f6b4a] dark:bg-[#7dcea0]",
    stripe: "bg-[#1f6b4a] dark:bg-[#7dcea0]",
    ring: "outline outline-2 outline-[#1f6b4a] dark:outline-[#7dcea0]"
  }
];

const MODES = [
  ["published", "Опубликовано"],
  ["draft", "Черновик"],
  ["diff", "Разница"]
];

const VIEWS = [
  ["graph", "Схема"],
  ["table", "Таблица связей"]
];

const LINK_PAINT = {
  applies: {
    name: "Сценарий задаёт вопрос",
    line: "stroke-[#6d4bd1] dark:stroke-[#b9a6ff]",
    fill: "fill-[#6d4bd1] dark:fill-[#b9a6ff]",
    dot: "bg-[#6d4bd1] dark:bg-[#b9a6ff]"
  },
  "has-option": {
    name: "Есть ответ",
    line: "stroke-[#2b6cb0] dark:stroke-[#8ab8f0]",
    fill: "fill-[#2b6cb0] dark:fill-[#8ab8f0]",
    dot: "bg-[#2b6cb0] dark:bg-[#8ab8f0]"
  },
  infers: {
    name: "Вывод",
    line: "stroke-[#b7791f] dark:stroke-[#f0c36b]",
    fill: "fill-[#b7791f] dark:fill-[#f0c36b]",
    dot: "bg-[#b7791f] dark:bg-[#f0c36b]"
  },
  "picks-scenario": {
    name: "Выбор сценария",
    line: "stroke-[#6d4bd1] dark:stroke-[#b9a6ff]",
    fill: "fill-[#6d4bd1] dark:fill-[#b9a6ff]",
    dot: "bg-[#6d4bd1] dark:bg-[#b9a6ff]"
  },
  "default-scenario": {
    name: "По умолчанию",
    line: "stroke-[#0f766e] dark:stroke-[#6fd3c8]",
    fill: "fill-[#0f766e] dark:fill-[#6fd3c8]",
    dot: "bg-[#0f766e] dark:bg-[#6fd3c8]"
  },
  "needs-type": {
    name: "Нужен тип",
    line: "stroke-[#475569] dark:stroke-[#a9b6c7]",
    fill: "fill-[#475569] dark:fill-[#a9b6c7]",
    dot: "bg-[#475569] dark:bg-[#a9b6c7]"
  },
  matches: {
    name: "Подходит товар",
    line: "stroke-[#1f6b4a] dark:stroke-[#7dcea0]",
    fill: "fill-[#1f6b4a] dark:fill-[#7dcea0]",
    dot: "bg-[#1f6b4a] dark:bg-[#7dcea0]"
  },
  "is-type": {
    name: "Тип товара",
    line: "stroke-[#0f766e] dark:stroke-[#6fd3c8]",
    fill: "fill-[#0f766e] dark:fill-[#6fd3c8]",
    dot: "bg-[#0f766e] dark:bg-[#6fd3c8]"
  },
  "hosts-on": {
    name: "Ставится на",
    line: "stroke-[#475569] dark:stroke-[#a9b6c7]",
    fill: "fill-[#475569] dark:fill-[#a9b6c7]",
    dot: "bg-[#475569] dark:bg-[#a9b6c7]"
  }
};

const FIELD_ORDER = [
  "id",
  "sku",
  "name",
  "label",
  "textFallback",
  "questionId",
  "optionId",
  "phase",
  "type",
  "priority",
  "dependsOn",
  "criteria",
  "why",
  "words",
  "canBeHost",
  "canHostOn",
  "maxOnScene",
  "dimensions",
  "priceEur",
  "movable",
  "model3d",
  "heightCm"
];

const FIELD_LABELS = {
  id: "Идентификатор",
  sku: "Артикул",
  name: "Название",
  label: "Подпись",
  textFallback: "Текст",
  questionId: "Вопрос",
  optionId: "Ответ",
  phase: "Фаза",
  type: "Тип",
  priority: "Приоритет",
  dependsOn: "Зависит от",
  criteria: "Критерий",
  why: "Зачем",
  words: "Слова для поиска",
  canBeHost: "Может быть опорой",
  canHostOn: "Ставится на",
  maxOnScene: "Максимум на сцене",
  dimensions: "Размеры, мм",
  priceEur: "Цена",
  movable: "Двигается",
  model3d: "Модель",
  minWidth: "Минимальная ширина",
  width: "Ширина",
  depth: "Глубина",
  height: "Высота",
  heightCm: "Рост, см",
  rowTypes: "Ряд",
  rowGapMm: "Зазор ряда, мм",
  edgeMarginMm: "Отступ от края, мм",
  rowBackMarginMm: "Задний отступ ряда, мм",
  flankTypes: "По бокам",
  frontTypes: "Спереди",
  frontMarginMm: "Передний отступ, мм",
  accessoryGapMm: "Зазор аксессуаров, мм"
};

const NODE_W = 232;
const NODE_H = 72;
const COL_GAP = 120;
const ROW_GAP = 12;
const PAD = 24;
const HEADER = 36;
const GUTTER = 48;

function kindMeta(kind) {
  return KINDS.find((item) => item.id === kind) || KINDS[0];
}

function kindOne(kind) {
  return kindMeta(kind).one;
}

function sectionFor(kind) {
  if (kind === "need" || kind === "type" || kind === "product") return "catalog";
  return "questionnaire";
}

function plural(count, one, few, many) {
  const value = Math.abs(Number(count)) || 0;
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function statusWords(status) {
  if (status === "added") return "добавлено";
  if (status === "removed") return "будет удалено";
  if (status === "changed") return "изменено";
  if (status === "same") return "без изменений";
  return "";
}

function statusText(status) {
  if (status === "added") return "+ добавлено";
  if (status === "removed") return "− будет удалено";
  if (status === "changed") return "~ изменено";
  return "без изменений";
}

function statusClass(status) {
  if (status === "added") return "text-[#0f6b3c] dark:text-[#b7ebc9]";
  if (status === "removed") return "text-[#8e1d1d] dark:text-[#ffb4b4]";
  if (status === "changed") return "text-[#7a4e00] dark:text-[#ffe0a3]";
  return "";
}

function nodeMark(status) {
  if (status === "added") return "+";
  if (status === "removed") return "−";
  if (status === "changed") return "~";
  return "";
}

function linkPaint(link, diffMode, status) {
  if (diffMode && status === "added") {
    return {
      line: "stroke-[#1f6b4a] dark:stroke-[#7dcea0]",
      fill: "fill-[#1f6b4a] dark:fill-[#7dcea0]",
      dash: false,
      mark: "+"
    };
  }
  if (diffMode && status === "removed") {
    return {
      line: "stroke-[#8e1d1d] dark:stroke-[#ffb4b4]",
      fill: "fill-[#8e1d1d] dark:fill-[#ffb4b4]",
      dash: true,
      mark: "−"
    };
  }
  if (diffMode && status === "changed") {
    return {
      line: "stroke-[#7a4e00] dark:stroke-[#ffe0a3]",
      fill: "fill-[#7a4e00] dark:fill-[#ffe0a3]",
      dash: false,
      mark: "~"
    };
  }
  const paint = LINK_PAINT[link.kind] || LINK_PAINT.applies;
  return { line: paint.line, fill: paint.fill, dash: false, mark: "" };
}

function layerValue(section, name) {
  if (!section || typeof section !== "object" || section[name] == null) return null;
  return section[name];
}

function layerMissing(section, name) {
  return layerValue(section, name) == null;
}

function indexNodes(nodes) {
  const map = new Map();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

function unionNodes(draftNodes, publishedNodes) {
  const seen = new Set();
  const out = [];
  for (const node of [...draftNodes, ...publishedNodes]) {
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function unionLinks(draftLinks, publishedLinks) {
  const seen = new Set();
  const out = [];
  for (const link of [...draftLinks, ...publishedLinks]) {
    const key = linkKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function partialNotes(questionnaire, catalog, mode) {
  const notes = [];
  if (mode === "diff") {
    const draftQ = layerMissing(questionnaire, "draft");
    const draftC = layerMissing(catalog, "draft");
    const publishedQ = layerMissing(questionnaire, "published");
    const publishedC = layerMissing(catalog, "published");
    if (draftQ && draftC && !(publishedQ && publishedC)) notes.push("Черновик: слой пуст");
    if (publishedQ && publishedC && !(draftQ && draftC)) notes.push("Опубликованное: слой пуст");
    if (draftQ !== draftC) {
      if (draftQ) notes.push("Черновик анкеты: слой пуст");
      if (draftC) notes.push("Черновик каталога: слой пуст");
    }
    if (publishedQ !== publishedC) {
      if (publishedQ) notes.push("Опубликованная анкета: слой пуст");
      if (publishedC) notes.push("Опубликованный каталог: слой пуст");
    }
    return notes;
  }
  const questionnaireMissing = layerMissing(questionnaire, mode);
  const catalogMissing = layerMissing(catalog, mode);
  if (questionnaireMissing && !catalogMissing) notes.push("Анкета: слой пуст");
  if (catalogMissing && !questionnaireMissing) notes.push("Каталог: слой пуст");
  return notes;
}

function assemble(questionnaire, catalog, mode) {
  const published = buildLinkMap({
    questionnaire: layerValue(questionnaire, "published"),
    catalog: layerValue(catalog, "published")
  });
  const draft = buildLinkMap({
    questionnaire: layerValue(questionnaire, "draft"),
    catalog: layerValue(catalog, "draft")
  });
  const diff = diffMaps(published, draft);
  const publishedById = indexNodes(published.nodes);
  const draftById = indexNodes(draft.nodes);
  const draftMissing = layerMissing(questionnaire, "draft") && layerMissing(catalog, "draft");
  const publishedMissing = layerMissing(questionnaire, "published") && layerMissing(catalog, "published");
  let nodes = published.nodes;
  let links = published.links;
  let nodesById = publishedById;
  let problems = published.problems;
  let layerEmpty = publishedMissing;
  let problemsEmpty = publishedMissing;
  if (mode === "draft") {
    nodes = draft.nodes;
    links = draft.links;
    nodesById = draftById;
    problems = draft.problems;
    layerEmpty = draftMissing;
    problemsEmpty = draftMissing;
  } else if (mode === "diff") {
    nodes = unionNodes(draft.nodes, published.nodes);
    links = unionLinks(draft.links, published.links);
    nodesById = new Map(publishedById);
    for (const [id, node] of draftById) nodesById.set(id, node);
    problems = draft.problems;
    layerEmpty = draftMissing && publishedMissing;
    problemsEmpty = draftMissing;
  }
  return {
    diff,
    publishedById,
    draftById,
    nodes,
    links,
    nodesById,
    problems,
    layerEmpty,
    problemsEmpty,
    notes: partialNotes(questionnaire, catalog, mode)
  };
}

function membersOf(chain, links) {
  const ids = new Set(chain.ids);
  for (const link of links) {
    if (!chain.linkKeys.has(linkKey(link))) continue;
    ids.add(link.from);
    ids.add(link.to);
  }
  return ids;
}

function layout(nodes) {
  const columns = [];
  const grouped = new Map();
  for (const kind of KINDS) {
    const list = nodes.filter((node) => node.kind === kind.id);
    if (list.length === 0) continue;
    columns.push(kind);
    grouped.set(kind.id, list);
  }
  const positions = new Map();
  let bottom = PAD + HEADER;
  columns.forEach((kind, column) => {
    grouped.get(kind.id).forEach((node, row) => {
      const y = PAD + HEADER + row * (NODE_H + ROW_GAP);
      positions.set(node.id, { x: PAD + column * (NODE_W + COL_GAP), y, w: NODE_W, h: NODE_H });
      bottom = Math.max(bottom, y + NODE_H);
    });
  });
  const width = PAD * 2 + Math.max(columns.length, 1) * NODE_W + Math.max(columns.length - 1, 0) * COL_GAP + GUTTER;
  return { columns, grouped, positions, width, height: Math.max(bottom + PAD, PAD + HEADER + NODE_H) };
}

function portY(box, index, count) {
  if (count <= 1) return box.y + box.h / 2;
  const inset = 12;
  return box.y + inset + ((box.h - inset * 2) * index) / (count - 1);
}

function curve(x1, y1, x2, y2, sameColumn) {
  let c1x;
  let c2x;
  if (sameColumn) {
    c1x = x1 + 36;
    c2x = x2 + 36;
  } else {
    const dir = x2 >= x1 ? 1 : -1;
    const dx = Math.max(48, Math.abs(x2 - x1) * 0.45);
    c1x = x1 + dir * dx;
    c2x = x2 - dir * dx;
  }
  const t = 0.5;
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    d: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
    mid: { x: a * x1 + b * c1x + c * c2x + d * x2, y: a * y1 + b * y1 + c * y2 + d * y2 }
  };
}

function linkGeometry(links, positions) {
  const buckets = new Map();
  function bucket(id) {
    if (!buckets.has(id)) buckets.set(id, { left: 0, right: 0 });
    return buckets.get(id);
  }
  const planned = [];
  for (const link of links) {
    const from = positions.get(link.from);
    const to = positions.get(link.to);
    if (!from || !to) continue;
    const same = Math.abs(from.x - to.x) < 4;
    const forward = to.x >= from.x;
    const fromSide = same || forward ? "right" : "left";
    const toSide = same || !forward ? "right" : "left";
    const fromIndex = bucket(link.from)[fromSide];
    bucket(link.from)[fromSide] += 1;
    const toIndex = bucket(link.to)[toSide];
    bucket(link.to)[toSide] += 1;
    planned.push({ link, from, to, same, fromSide, toSide, fromIndex, toIndex });
  }
  return planned.map((item) => {
    const fromCount = buckets.get(item.link.from)[item.fromSide];
    const toCount = buckets.get(item.link.to)[item.toSide];
    const y1 = portY(item.from, item.fromIndex, fromCount);
    const y2 = portY(item.to, item.toIndex, toCount);
    const x1 = item.fromSide === "right" ? item.from.x + item.from.w : item.from.x;
    const x2 = item.toSide === "right" ? item.to.x + item.to.w : item.to.x;
    const gap = 8;
    const endX = item.toSide === "left" ? x2 - gap : x2 + gap;
    const pointing = item.toSide === "left" ? 1 : -1;
    return {
      link: item.link,
      curved: curve(x1, y1, endX, y2, item.same),
      arrow: { x: x2, y: y2, pointing }
    };
  });
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = ordered(value[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

function signature(present, value) {
  if (!present) return "∅";
  try {
    return JSON.stringify(ordered(value));
  } catch {
    return "";
  }
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || key;
}

function unionKeys(left, right) {
  const present = new Set();
  for (const source of [left, right]) {
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(source)) present.add(key);
  }
  const known = new Set(FIELD_ORDER);
  const preferred = FIELD_ORDER.filter((key) => present.has(key));
  const rest = [...present].filter((key) => !known.has(key)).sort();
  return [...preferred, ...rest];
}

function formatValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => formatValue(item)).join(", ");
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "—";
    return keys.map((key) => `${fieldLabel(key)}: ${formatValue(value[key])}`).join("; ");
  }
  return "—";
}

function formatField(key, value) {
  if (key === "dimensions" && value && typeof value === "object" && !Array.isArray(value)) {
    const parts = [value.width, value.depth, value.height].filter((item) => typeof item === "number" && Number.isFinite(item));
    if (parts.length > 0) return parts.join(" × ");
  }
  if (key === "priceEur" && typeof value === "number" && Number.isFinite(value)) return `${value} €`;
  return formatValue(value);
}

function dataOf(node) {
  return node && node.data && typeof node.data === "object" ? node.data : null;
}

function needConfidence(nodeId, links) {
  const values = [];
  const seen = new Set();
  for (const link of links) {
    if (link.kind !== "infers" || link.to !== nodeId || !link.label || seen.has(link.label)) continue;
    seen.add(link.label);
    values.push(link.label);
  }
  return values.join(", ");
}

function nodeFooter(node, links) {
  if (node.kind === "product") {
    const data = dataOf(node) || {};
    const bits = [];
    if (typeof data.sku === "string" && data.sku) bits.push(data.sku);
    if (typeof data.priceEur === "number") bits.push(`${data.priceEur} €`);
    return bits.join(" · ");
  }
  if (node.kind === "option") return node.key || "";
  if (node.kind === "need") return needConfidence(node.id, links);
  return "";
}

function FieldTable({ data }) {
  const keys = unionKeys(data, null);
  if (keys.length === 0) return <p className={`m-0 ${MUTED}`}>Нет полей</p>;
  return (
    <dl className="m-0 grid">
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-2 border-b border-[#eee6da] py-2 dark:border-[#2a313b]">
          <dt className={`text-[13px] ${MUTED}`}>{fieldLabel(key)}</dt>
          <dd className="m-0 break-words text-[14px]">{formatField(key, data[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function DiffFields({ publishedNode, draftNode }) {
  const left = dataOf(publishedNode);
  const right = dataOf(draftNode);
  const keys = unionKeys(left, right);
  return (
    <div>
      <div className={`grid grid-cols-2 gap-2 pb-1 text-[13px] font-[650] ${MUTED}`}>
        <div>Опубликовано</div>
        <div>Черновик</div>
      </div>
      {keys.length === 0 ? <p className={`m-0 ${MUTED}`}>Нет полей</p> : null}
      {keys.map((key) => {
        const hasLeft = Boolean(left && Object.hasOwn(left, key));
        const hasRight = Boolean(right && Object.hasOwn(right, key));
        const different = signature(hasLeft, left && left[key]) !== signature(hasRight, right && right[key]);
        const tone = different ? "rounded-lg bg-[#fff4d6] px-2 py-1.5 dark:bg-[#3a2e12]" : "px-2 py-1.5";
        return (
          <div key={key} className={`border-b border-[#eee6da] dark:border-[#2a313b] ${tone}`}>
            <div className={`text-[13px] ${different ? "font-[650] text-[#7a4e00] dark:text-[#ffe0a3]" : MUTED}`}>
              {different ? "~ " : ""}
              {fieldLabel(key)}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[14px]">
              <div className="min-w-0 break-words">{hasLeft ? formatField(key, left[key]) : "нет"}</div>
              <div className="min-w-0 break-words">{hasRight ? formatField(key, right[key]) : "нет"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LinkJump({ link, end, nodesById, mode, linkStatus, onPick }) {
  const other = nodesById.get(end === "from" ? link.from : link.to);
  const paint = LINK_PAINT[link.kind] || LINK_PAINT.applies;
  const status = mode === "diff" ? linkStatus(link) : null;
  const caption = link.label ? ` (${link.label})` : "";
  if (!other) {
    return (
      <p className={`m-0 px-2 py-1.5 ${MUTED}`}>
        {paint.name}
        {caption}
      </p>
    );
  }
  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f3f0e8] dark:hover:bg-[#191d24] ${FOCUS}`}
      onClick={() => onPick(other.id)}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindMeta(other.kind).dot}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words text-[14px]">
          {kindOne(other.kind)} «{other.label}»
          {caption}
        </span>
        <span className={`block text-[12px] ${MUTED}`}>{paint.name}</span>
        {status ? <span className={`block text-[12px] font-[650] ${statusClass(status)}`}>{statusText(status)}</span> : null}
      </span>
    </button>
  );
}

function NodeCard({ node, mode, model, linkStatus, onPick, onOpen }) {
  const publishedNode = model.publishedById.get(node.id) || null;
  const draftNode = model.draftById.get(node.id) || null;
  const status = mode === "diff" ? model.diff.nodes.get(node.id) || "same" : null;
  const meta = kindMeta(node.kind);
  const section = sectionFor(node.kind);
  const single = mode === "draft" ? draftNode || node : publishedNode || node;
  const incoming = model.links.filter((link) => link.to === node.id);
  const outgoing = model.links.filter((link) => link.from === node.id);
  const confidence = node.kind === "need" ? needConfidence(node.id, model.links) : "";
  return (
    <div className="grid gap-4">
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-2 text-[12px] font-[650] uppercase tracking-[0.04em]">
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
          <span className={MUTED}>{meta.one}</span>
        </p>
        <h2 className="mt-1 mb-1 text-[18px] font-[650] leading-tight break-words">{node.label}</h2>
        <p className={`m-0 break-words text-[13px] ${MUTED}`}>Идентификатор: {node.key}</p>
        {confidence ? <p className={`mt-1 mb-0 text-[13px] ${MUTED}`}>Уверенность: {confidence}</p> : null}
        {status ? <p className={`mt-2 mb-0 text-[14px] font-[650] ${statusClass(status)}`}>{statusText(status)}</p> : null}
      </div>
      {mode === "diff" ? <DiffFields publishedNode={publishedNode} draftNode={draftNode} /> : <FieldTable data={dataOf(single) || {}} />}
      <div>
        <h3 className="mt-0 mb-1 text-[14px] font-[650]">Приходит из</h3>
        {incoming.length === 0 ? <p className={`m-0 text-[14px] ${MUTED}`}>Ничего не приходит</p> : null}
        <div className="grid">
          {incoming.map((link) => (
            <LinkJump
              key={linkKey(link)}
              link={link}
              end="from"
              nodesById={model.nodesById}
              mode={mode}
              linkStatus={linkStatus}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
      <div>
        <h3 className="mt-0 mb-1 text-[14px] font-[650]">Ведёт к</h3>
        {outgoing.length === 0 ? <p className={`m-0 text-[14px] ${MUTED}`}>Никуда не ведёт</p> : null}
        <div className="grid">
          {outgoing.map((link) => (
            <LinkJump
              key={linkKey(link)}
              link={link}
              end="to"
              nodesById={model.nodesById}
              mode={mode}
              linkStatus={linkStatus}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`cursor-pointer rounded-lg border border-[#ddd4c6] bg-[#fffdf8] px-3 py-2 text-[14px] dark:border-[#343b46] dark:bg-[#1e232b] ${FOCUS}`}
        aria-label={`Открыть в разделе «${sectionLabel(section)}»`}
        onClick={() => onOpen(section)}
      >
        Открыть в разделе
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div>
      <h2 className="mt-0 mb-2 text-[14px] font-[650]">Цвета связей</h2>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {Object.entries(LINK_PAINT).map(([id, paint]) => (
          <li key={id} className="flex items-center gap-2 text-[13px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${paint.dot}`} aria-hidden="true" />
            <span>{paint.name}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 mb-0 text-[13px] ${MUTED}`}>
        + добавлено, − будет удалено, ~ изменено. Удалённые связи пунктирные. «только здесь» — узла нет в цепочке другого сценария.
      </p>
    </div>
  );
}

function Holes({ problems, empty, hint, open, onToggle, onPick }) {
  const errors = problems.filter((item) => item.level === "error").length;
  const tone =
    empty || problems.length === 0
      ? "border-[#ddd4c6] bg-[#fffdf8] text-[#5e584e] dark:border-[#343b46] dark:bg-[#1e232b] dark:text-[#b7b0a4]"
      : errors > 0
        ? "border-[#8e1d1d] bg-[#fde8e8] text-[#8e1d1d] dark:border-[#ffb4b4] dark:bg-[#3a1c1c] dark:text-[#ffb4b4]"
        : "border-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]";
  const label = empty ? "Слой пуст" : problems.length === 0 ? "Дыр нет" : `Дыр: ${problems.length}`;
  return (
    <>
      <button
        type="button"
        className={`cursor-pointer rounded-full border px-3 py-1.5 text-[14px] font-[650] ${tone} ${FOCUS}`}
        aria-expanded={open}
        aria-controls="map-holes"
        title={hint || undefined}
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div id="map-holes" className="order-last mt-2 basis-full max-w-full" role="region" aria-label="Дыры">
          {hint ? <p className={`mt-0 mb-2 text-[13px] ${MUTED}`}>{hint}</p> : null}
          {empty ? <p className={`m-0 text-[14px] ${MUTED}`}>Слой пуст</p> : null}
          {!empty && problems.length === 0 ? <p className={`m-0 text-[14px] ${MUTED}`}>Дыр не найдено</p> : null}
          {!empty && problems.length > 0 ? (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {problems.map((item, index) => {
                const row =
                  item.level === "error"
                    ? "border-l-[#8e1d1d] bg-[#fde8e8] text-[#8e1d1d] dark:border-l-[#ffb4b4] dark:bg-[#3a1c1c] dark:text-[#ffb4b4]"
                    : "border-l-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-l-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]";
                const mark = item.level === "error" ? "Ошибка" : "Внимание";
                const body = (
                  <>
                    <span className="font-[650]">{mark}</span>
                    <span className="min-w-0 break-words">{item.text}</span>
                  </>
                );
                if (!item.nodeId) {
                  return (
                    <li
                      key={`${index}:${item.text}`}
                      className={`grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border-l-4 px-3 py-2 text-[14px] ${row}`}
                    >
                      {body}
                    </li>
                  );
                }
                return (
                  <li key={`${index}:${item.text}`}>
                    <button
                      type="button"
                      className={`grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border-l-4 px-3 py-2 text-left text-[14px] ${row} ${FOCUS}`}
                      onClick={() => onPick(item.nodeId)}
                    >
                      {body}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Endpoint({ node, onPick }) {
  if (!node) return "—";
  const meta = kindMeta(node.kind);
  return (
    <button
      type="button"
      className={`inline-flex max-w-full cursor-pointer items-center gap-2 bg-transparent p-0 text-left text-[14px] ${FOCUS}`}
      onClick={() => onPick(node.id)}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span className="min-w-0 break-words">
        {meta.one} «{node.label}»
      </span>
    </button>
  );
}

function linkBlob(link, nodesById, mode, linkStatus) {
  const from = nodesById.get(link.from);
  const to = nodesById.get(link.to);
  const paint = LINK_PAINT[link.kind] || LINK_PAINT.applies;
  return [from && from.label, to && to.label, from && from.key, to && to.key, paint.name, link.label, mode === "diff" ? statusText(linkStatus(link)) : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function LinkTable({ links, nodesById, mode, linkStatus, onPick, isolated, query }) {
  const needle = query.trim().toLowerCase();
  const rows = needle ? links.filter((link) => linkBlob(link, nodesById, mode, linkStatus).includes(needle)) : links;
  const head = "sticky top-0 z-[1] bg-[#fffdf8] px-3 py-2 text-left text-[13px] font-[650] text-[#5e584e] shadow-[inset_0_-1px_0_#ddd4c6] dark:bg-[#1e232b] dark:text-[#b7b0a4] dark:shadow-[inset_0_-1px_0_#343b46]";
  const cell = "px-3 py-2 align-top text-[14px]";
  return (
    <div className="min-w-0 max-w-full">
      {rows.length === 0 ? <p className={`mt-0 mb-3 ${MUTED}`}>{links.length === 0 ? "Связей нет" : "Ничего не найдено"}</p> : null}
      {rows.length > 0 ? (
        <div className="max-h-[70vh] max-w-full overflow-auto rounded-xl border border-[#ddd4c6] dark:border-[#343b46]">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 bg-[#fffdf8] text-left dark:bg-[#1e232b]">
            <thead>
              <tr>
                <th scope="col" className={head}>Откуда</th>
                <th scope="col" className={head}>Куда</th>
                <th scope="col" className={head}>Вид</th>
                <th scope="col" className={head}>Подпись</th>
                {mode === "diff" ? <th scope="col" className={head}>Статус</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((link, index) => {
                const stripe = index % 2 === 1 ? "bg-[#f7f4ee] dark:bg-[#191d24]" : "bg-[#fffdf8] dark:bg-[#1e232b]";
                const paint = LINK_PAINT[link.kind] || LINK_PAINT.applies;
                const status = mode === "diff" ? linkStatus(link) : null;
                return (
                  <tr key={linkKey(link)} className={`${stripe} hover:bg-[#e7f6ee] dark:hover:bg-[#143024]`}>
                    <td className={cell}>
                      <Endpoint node={nodesById.get(link.from)} onPick={onPick} />
                    </td>
                    <td className={cell}>
                      <Endpoint node={nodesById.get(link.to)} onPick={onPick} />
                    </td>
                    <td className={cell}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${paint.dot}`} aria-hidden="true" />
                        {paint.name}
                      </span>
                    </td>
                    <td className={cell}>{link.label ? link.label : "—"}</td>
                    {mode === "diff" ? <td className={`${cell} font-[650] ${statusClass(status)}`}>{statusText(status)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {isolated.length > 0 ? (
        <div className="mt-4">
          <h3 className="mt-0 mb-2 text-[14px] font-[650]">Узлы без связей</h3>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {isolated.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={`cursor-pointer rounded-lg border border-[#ddd4c6] bg-[#fffdf8] px-3 py-1.5 text-[14px] dark:border-[#343b46] dark:bg-[#1e232b] ${FOCUS}`}
                  onClick={() => onPick(node.id)}
                >
                  {kindOne(node.kind)} «{node.label}»
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Scheme({
  nodes,
  links,
  columns,
  grouped,
  positions,
  width,
  height,
  scale,
  frameRef,
  mode,
  nodeStatus,
  linkStatus,
  pinned,
  hover,
  members,
  linkKeys,
  onlyIds,
  onToggle,
  onHover
}) {
  const geometry = linkGeometry(links, positions);
  const chainOn = Boolean(members);
  const orderedLinks = [...geometry].sort((left, right) => {
    const leftOn = chainOn && linkKeys.has(linkKey(left.link)) ? 1 : 0;
    const rightOn = chainOn && linkKeys.has(linkKey(right.link)) ? 1 : 0;
    return leftOn - rightOn;
  });
  const svgLabel = chainOn
    ? "Схема связей. Яркие линии — цепочка выбранного узла, остальные приглушены."
    : "Схема связей: сценарии, вопросы, ответы, потребности, типы и товары.";
  return (
    <div
      ref={frameRef}
      role="region"
      tabIndex={0}
      aria-label="Схема связей, область прокручивается"
      className={`max-h-[70vh] min-w-0 max-w-full overflow-auto rounded-xl border border-[#ddd4c6] bg-[#f7f4ee] dark:border-[#343b46] dark:bg-[#191d24] ${FOCUS}`}
    >
      <div style={{ width: width * scale, height: height * scale }}>
        <div className="relative" style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {columns.map((kind, column) => {
            const list = grouped.get(kind.id);
            const bandH = list.length * NODE_H + (list.length - 1) * ROW_GAP;
            return (
              <div
                key={`${kind.id}-band`}
                aria-hidden="true"
                className="absolute rounded-xl bg-[#e7e1d6]/70 dark:bg-[#14171c]"
                style={{ left: PAD + column * (NODE_W + COL_GAP) - 8, top: PAD + HEADER - 8, width: NODE_W + 16, height: bandH + 16 }}
              />
            );
          })}
          <svg className="pointer-events-none absolute top-0 left-0 z-[1]" width={width} height={height} role="img" aria-label={svgLabel}>
            {orderedLinks.map((item) => {
              const key = linkKey(item.link);
              const active = !chainOn || linkKeys.has(key);
              const status = mode === "diff" ? linkStatus(item.link) : null;
              const paint = linkPaint(item.link, mode === "diff", status);
              const opacity = !chainOn ? 0.35 : active ? 1 : 0.06;
              const showText = active && scale >= 0.9 && (paint.mark || (chainOn && item.link.label));
              const caption = [paint.mark, item.link.label].filter(Boolean).join(" ");
              const labelWidth = Math.max(18, caption.length * 6.6 + 12);
              const tip = item.arrow.pointing;
              const base = item.arrow.x - tip * 8;
              return (
                <g key={key} opacity={opacity}>
                  <path d={item.curved.d} fill="none" strokeWidth={active && chainOn ? 2.25 : 1} strokeDasharray={paint.dash ? "7 5" : undefined} className={paint.line} />
                  {active && chainOn ? (
                    <polygon
                      points={`${item.arrow.x},${item.arrow.y} ${base},${item.arrow.y - 3.5} ${base},${item.arrow.y + 3.5}`}
                      className={paint.fill}
                    />
                  ) : null}
                  {showText ? (
                    <g>
                      <rect
                        x={item.curved.mid.x - labelWidth / 2}
                        y={item.curved.mid.y - 9}
                        width={labelWidth}
                        height={16}
                        rx="4"
                        className="fill-[#f7f4ee] dark:fill-[#191d24]"
                      />
                      <text x={item.curved.mid.x} y={item.curved.mid.y} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="650" className={paint.fill}>
                        {caption}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {columns.map((kind, column) => (
            <p
              key={kind.id}
              className="absolute z-[2] m-0 flex items-center gap-2 text-[13px] font-[650]"
              style={{ left: PAD + column * (NODE_W + COL_GAP), top: PAD, width: NODE_W }}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${kind.dot}`} aria-hidden="true" />
              <span>{kind.title}</span>
              <span className={MUTED}>{grouped.get(kind.id).length}</span>
            </p>
          ))}
          {nodes.map((node) => {
            const box = positions.get(node.id);
            if (!box) return null;
            const meta = kindMeta(node.kind);
            const status = mode === "diff" ? nodeStatus(node.id) : null;
            const mark = nodeMark(status);
            const dimmed = Boolean(members && !members.has(node.id));
            const pressed = pinned === node.id;
            const preview = !pinned && hover === node.id;
            const focusId = pinned || hover;
            const exclusive = Boolean(onlyIds && onlyIds.has(node.id) && node.id !== focusId);
            const footer = nodeFooter(node, links);
            const words = [status ? statusWords(status) : "", exclusive ? "только здесь" : ""].filter(Boolean).join(", ");
            let border = "border-[#ddd4c6] bg-[#fffdf8] text-[#1e1b16] dark:border-[#343b46] dark:bg-[#1e232b] dark:text-[#f3efe6]";
            if (status === "added") {
              border = "border-[#1f6b4a] bg-[#e7f6ee] text-[#0f6b3c] dark:border-[#7dcea0] dark:bg-[#143024] dark:text-[#d8f5e4]";
            } else if (status === "removed") {
              border = "border-dashed border-[#8e1d1d] bg-[#fde8e8] text-[#8e1d1d] dark:border-[#ffb4b4] dark:bg-[#3a1c1c] dark:text-[#ffd0d0]";
            } else if (status === "changed") {
              border = "border-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]";
            } else if (exclusive) {
              border = "border-[#b7791f] bg-[#fffdf8] text-[#1e1b16] dark:border-[#f0c36b] dark:bg-[#1e232b] dark:text-[#f3efe6]";
            }
            return (
              <button
                key={node.id}
                id={`map-node-${node.id}`}
                type="button"
                title={node.label}
                aria-pressed={pressed}
                aria-label={`${meta.one} «${node.label}»${words ? `, ${words}` : ""}`}
                className={`absolute z-10 cursor-pointer overflow-hidden rounded-[12px] border px-2 py-1.5 text-left shadow-[0_1px_2px_rgba(40,32,20,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${border} ${
                  dimmed ? "opacity-[0.35]" : "opacity-100"
                } ${pressed || preview ? meta.ring : ""} ${FOCUS}`}
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                onClick={() => onToggle(node.id)}
                onMouseEnter={() => onHover(node.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => {
                  if (!pinned) onHover(node.id);
                }}
                onBlur={() => onHover(null)}
              >
                <span className={`absolute top-0 bottom-0 left-0 w-1 ${meta.stripe}`} aria-hidden="true" />
                {exclusive ? (
                  <span className="absolute top-1.5 right-1.5 rounded-md bg-[#fff4d6] px-1 py-0.5 text-[10px] font-[650] leading-none text-[#7a4e00] dark:bg-[#3a2e12] dark:text-[#ffe0a3]">
                    только здесь
                  </span>
                ) : null}
                <span className={`flex h-full min-w-0 flex-col justify-center gap-0.5 pl-2 ${exclusive ? "pr-16" : "pr-1"}`}>
                  <span className={`text-[11px] font-[650] uppercase tracking-[0.04em] ${MUTED}`}>
                    {mark ? <span className="mr-1 normal-case">{mark}</span> : null}
                    {meta.one}
                  </span>
                  <span className="line-clamp-2 text-[14px] leading-[1.2] font-[650]">{node.label}</span>
                  {footer ? <span className={`truncate text-[11px] ${MUTED}`}>{footer}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LinkMap({ openSection = () => {} }) {
  const [view, setView] = useState({ kind: "loading" });
  const [mode, setMode] = useState("published");
  const [presentation, setPresentation] = useState("graph");
  const [pinned, setPinned] = useState(null);
  const [hover, setHover] = useState(null);
  const [onlySelected, setOnlySelected] = useState(true);
  const [holesOpen, setHolesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const [kinds, setKinds] = useState(() => Object.fromEntries(KINDS.map((item) => [item.id, true])));
  const focusRef = useRef(false);
  const frameRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    (async () => {
      const signal = controller.signal;
      const [questionnaireOutcome, catalogOutcome] = await Promise.all([
        getSection("questionnaire", { signal }).then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        ),
        getSection("catalog", { signal }).then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        )
      ]);
      if (!alive) return;
      const failed = [questionnaireOutcome, catalogOutcome].filter((item) => !item.ok);
      if (failed.some((item) => isAbort(item.error) || item.error.status === 401)) return;
      if (failed.length > 0) {
        setView({
          kind: "error",
          lines: failed.flatMap((item) => problemLines(item.error.status, item.error.body))
        });
        return;
      }
      setView({
        kind: "ready",
        questionnaire: questionnaireOutcome.value,
        catalog: catalogOutcome.value
      });
    })().catch((err) => {
      if (!alive || isAbort(err)) return;
      setView({ kind: "crash" });
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      setPinned(null);
      setHover(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const model = view.kind === "ready" ? assemble(view.questionnaire, view.catalog, mode) : null;

  useEffect(() => {
    if (!pinned || !model) return;
    if (!model.nodesById.has(pinned)) setPinned(null);
  }, [pinned, model]);

  useEffect(() => {
    if (!focusRef.current || !pinned || presentation !== "graph") return;
    const el = document.getElementById(`map-node-${pinned}`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    el.focus();
    focusRef.current = false;
  }, [pinned, presentation, kinds, mode, onlySelected, scale]);

  function reveal(id) {
    if (!model) return;
    const node = model.nodesById.get(id);
    if (node && kinds[node.kind] === false) {
      setKinds((current) => ({ ...current, [node.kind]: true }));
    }
  }

  function pick(id) {
    reveal(id);
    setHover(null);
    setPinned(id);
  }

  function bump(delta) {
    setScale((current) => {
      const next = Math.round((current + delta) * 100) / 100;
      return Math.min(1.5, Math.max(0.5, next));
    });
  }

  if (view.kind === "loading") return <Loading text="Загружаем карту связей…" />;
  if (view.kind === "error" || view.kind === "crash") {
    return (
      <div className="min-w-0 max-w-full">
        <h1 className="mt-0 mb-3 text-[1.6rem] leading-tight font-[650]">Карта связей</h1>
        {view.kind === "crash" ? <Banner kind="error" text="Не получилось открыть карту связей" /> : <ErrorBlock lines={view.lines} />}
      </div>
    );
  }

  const activeId = pinned || hover;
  const chain = activeId ? chainOf(activeId, model.links) : null;
  const members = chain ? membersOf(chain, model.links) : null;
  const activeNode = activeId ? model.nodesById.get(activeId) : null;
  const onlyIds = activeNode && activeNode.kind === "scenario" ? onlyHere(activeNode.id, model.nodes, model.links) : null;
  const kindOn = (node) => Boolean(node) && kinds[node.kind] !== false;
  let graphNodes = model.nodes.filter((node) => kindOn(node));
  if (pinned && onlySelected && members) graphNodes = graphNodes.filter((node) => members.has(node.id));
  const graphLinks = model.links.filter((link) => {
    const from = model.nodesById.get(link.from);
    const to = model.nodesById.get(link.to);
    if (!kindOn(from) || !kindOn(to)) return false;
    if (pinned && onlySelected && members) return members.has(link.from) && members.has(link.to) && chain.linkKeys.has(linkKey(link));
    return true;
  });
  const placed = layout(graphNodes);
  const visibleNodes = model.nodes.filter((node) => kindOn(node));
  const visibleLinks = model.links.filter((link) => kindOn(model.nodesById.get(link.from)) && kindOn(model.nodesById.get(link.to)));
  const linked = new Set();
  for (const link of visibleLinks) {
    linked.add(link.from);
    linked.add(link.to);
  }
  const isolated = visibleNodes.filter((node) => !linked.has(node.id));
  const pinnedNode = pinned ? model.nodesById.get(pinned) || null : null;
  const counts = model.diff.counts;
  const diffTotal = counts.nodesAdded + counts.nodesRemoved + counts.nodesChanged + counts.linksAdded + counts.linksRemoved;
  const kindCounts = Object.fromEntries(KINDS.map((kind) => [kind.id, model.nodes.filter((node) => node.kind === kind.id).length]));
  const nodeStatus = (id) => model.diff.nodes.get(id) || "same";
  const linkStatus = (link) => model.diff.links.get(linkKey(link)) || "same";
  const holeHint = mode === "diff" && !model.problemsEmpty ? "По черновику: он станет рабочим после публикации." : "";

  function fit() {
    const frame = frameRef.current;
    if (!frame || placed.width <= 0) return;
    const next = Math.min(1.5, Math.max(0.5, frame.clientWidth / placed.width));
    setScale(Math.round(next * 100) / 100);
  }

  let body;
  if (model.layerEmpty) {
    body = <p className={`m-0 ${MUTED}`}>Слой пуст</p>;
  } else if (model.nodes.length === 0) {
    body = <p className={`m-0 ${MUTED}`}>Нет данных для карты</p>;
  } else if (visibleNodes.length === 0) {
    body = <p className={`m-0 ${MUTED}`}>Все виды узлов скрыты. Отметьте хотя бы один вид.</p>;
  } else if (presentation === "table") {
    body = (
      <div className="grid gap-3">
        <label className="grid max-w-md gap-1 text-[14px]">
          <span className={MUTED}>Поиск по связям</span>
          <input className={FIELD} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <LinkTable
          links={visibleLinks}
          nodesById={model.nodesById}
          mode={mode}
          linkStatus={linkStatus}
          isolated={isolated}
          query={query}
          onPick={pick}
        />
      </div>
    );
  } else if (graphNodes.length === 0) {
    body = <p className={`m-0 ${MUTED}`}>В цепочке нет узлов отмеченных видов.</p>;
  } else {
    body = (
      <Scheme
        nodes={graphNodes}
        links={graphLinks}
        columns={placed.columns}
        grouped={placed.grouped}
        positions={placed.positions}
        width={placed.width}
        height={placed.height}
        scale={scale}
        frameRef={frameRef}
        mode={mode}
        nodeStatus={nodeStatus}
        linkStatus={linkStatus}
        pinned={pinned}
        hover={hover}
        members={members}
        linkKeys={chain ? chain.linkKeys : new Set()}
        onlyIds={onlyIds}
        onToggle={(id) => setPinned((current) => (current === id ? null : id))}
        onHover={setHover}
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full text-[15px]">
      <h1 className="mt-0 mb-1 text-[1.6rem] leading-tight font-[650]">Карта связей</h1>
      <p className={`mt-0 mb-3 ${MUTED}`}>Откуда берётся решение консультанта. Здесь только просмотр.</p>
      <div className="sticky top-0 z-[3] mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#ddd4c6] bg-[#f3f0e8] py-3 dark:border-[#343b46] dark:bg-[#14171c]">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Слой данных" className={SEG}>
            {MODES.map(([id, text]) => (
              <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? SEG_ON : SEG_OFF} onClick={() => setMode(id)}>
                {text}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Вид карты" className={SEG}>
            {VIEWS.map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={presentation === id}
                className={presentation === id ? SEG_ON : SEG_OFF}
                onClick={() => setPresentation(id)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presentation === "graph" ? (
            <div role="group" aria-label="Масштаб схемы" className={SEG}>
              <button type="button" className={`${SEG_OFF} disabled:cursor-not-allowed disabled:opacity-40`} aria-label="Уменьшить" disabled={scale <= 0.5} onClick={() => bump(-0.1)}>
                −
              </button>
              <span className="px-1 text-[13px] tabular-nums">{Math.round(scale * 100)}%</span>
              <button type="button" className={`${SEG_OFF} disabled:cursor-not-allowed disabled:opacity-40`} aria-label="Увеличить" disabled={scale >= 1.5} onClick={() => bump(0.1)}>
                +
              </button>
              <button type="button" className={SEG_OFF} onClick={fit}>
                Вписать
              </button>
            </div>
          ) : null}
          {pinned ? (
            <button
              type="button"
              aria-pressed={onlySelected}
              className={onlySelected ? SEG_ON : SEG_OFF + " rounded-[10px] border border-[#ddd4c6] dark:border-[#343b46]"}
              onClick={() => setOnlySelected((current) => !current)}
            >
              Только выбранное
            </button>
          ) : null}
        </div>
      </div>
      {model.notes.map((note) => (
        <p key={note} className={`mt-0 mb-2 text-[14px] ${MUTED}`}>
          {note}
        </p>
      ))}
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Виды узлов">
        {KINDS.map((kind) => {
          const on = kinds[kind.id] !== false;
          return (
            <button
              key={kind.id}
              type="button"
              aria-pressed={on}
              className={
                on
                  ? `inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#1f6b4a] bg-[#e7f6ee] px-3 py-1.5 text-[14px] font-[650] text-[#0f6b3c] dark:border-[#3d9a6e] dark:bg-[#143024] dark:text-[#d8f5e4] ${FOCUS}`
                  : `inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#ddd4c6] bg-[#fffdf8] px-3 py-1.5 text-[14px] dark:border-[#343b46] dark:bg-[#1e232b] ${FOCUS}`
              }
              onClick={() => setKinds((current) => ({ ...current, [kind.id]: current[kind.id] === false }))}
            >
              <span className={`h-2 w-2 rounded-full ${kind.dot}`} aria-hidden="true" />
              <span>{kind.title}</span>
              <span className={on ? "" : MUTED}>{kindCounts[kind.id]}</span>
            </button>
          );
        })}
        <Holes problems={model.problems} empty={model.problemsEmpty} hint={holeHint} open={holesOpen} onToggle={() => setHolesOpen((current) => !current)} onPick={(id) => {
          reveal(id);
          focusRef.current = true;
          setPresentation("graph");
          setHover(null);
          setPinned(id);
          setHolesOpen(true);
        }} />
        {mode === "diff" && !model.layerEmpty && model.nodes.length > 0 ? (
          <p
            className={`m-0 rounded-full border px-3 py-1.5 text-[14px] font-[650] ${
              diffTotal === 0
                ? "border-[#ddd4c6] text-[#5e584e] dark:border-[#343b46] dark:text-[#b7b0a4]"
                : "border-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]"
            }`}
          >
            {diffTotal === 0
              ? "Черновик совпадает с опубликованным"
              : `+${counts.nodesAdded + counts.linksAdded}, −${counts.nodesRemoved + counts.linksRemoved}, ~${counts.nodesChanged}`}
          </p>
        ) : null}
      </div>
      <div className="grid min-w-0 items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">{body}</div>
        <aside
          className="min-w-0 rounded-xl border border-[#ddd4c6] bg-[#fffdf8] p-4 shadow-[0_1px_2px_rgba(40,32,20,0.06)] dark:border-[#343b46] dark:bg-[#1e232b] dark:shadow-none min-[900px]:sticky min-[900px]:top-3 min-[900px]:max-h-[calc(100vh-1.5rem)] min-[900px]:overflow-auto"
          aria-label="Карточка узла"
        >
          {pinnedNode ? (
            <NodeCard node={pinnedNode} mode={mode} model={model} linkStatus={linkStatus} onPick={pick} onOpen={openSection} />
          ) : (
            <div className="grid gap-4">
              <p className="m-0 text-[15px]">Нажмите на узел, чтобы увидеть цепочку</p>
              <Legend />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export { LinkMap };
