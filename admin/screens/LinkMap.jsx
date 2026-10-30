import { useEffect, useMemo, useRef, useState } from "react";
import { getSection, isAbort } from "../api/admin-api.js";
import { buildLinkMap, describeLink, diffMaps, linkKey } from "../lib/link-map.js";
import { problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { Banner } from "../components/Banner.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]";
const BUTTON = `cursor-pointer rounded-lg border border-[#ddd4c6] bg-[#fffdf8] px-3 py-2 dark:border-[#343b46] dark:bg-[#1e232b] ${FOCUS}`;
const BUTTON_ON = `cursor-pointer rounded-lg border border-[#1f6b4a] bg-[#1f6b4a] px-3 py-2 text-[#f4fff8] dark:border-[#3d9a6e] dark:bg-[#3d9a6e] ${FOCUS}`;
const MUTED = "text-[#5e584e] dark:text-[#b7b0a4]";

const KINDS = [
  { id: "scenario", title: "Сценарии", one: "Сценарий" },
  { id: "question", title: "Вопросы", one: "Вопрос" },
  { id: "option", title: "Ответы", one: "Ответ" },
  { id: "need", title: "Потребности", one: "Потребность" },
  { id: "type", title: "Типы", one: "Тип" },
  { id: "product", title: "Товары", one: "Товар" }
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

const LINK_KIND = {
  applies: "Сценарий задаёт вопрос",
  "has-option": "Есть ответ",
  infers: "Вывод",
  "picks-scenario": "Выбор сценария",
  "default-scenario": "По умолчанию",
  "needs-type": "Нужен тип",
  matches: "Подходит товар",
  "is-type": "Тип товара",
  "hosts-on": "Ставится на"
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
  canBeHost: "Может быть опорой",
  canHostOn: "Ставится на",
  maxOnScene: "Максимум на сцене",
  dimensions: "Размеры",
  priceEur: "Цена, €",
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

const NODE_W = 160;
const NODE_H = 58;
const COL_GAP = 64;
const ROW_GAP = 10;
const PAD = 16;
const HEADER = 28;
const GUTTER = 36;

function kindOne(kind) {
  const found = KINDS.find((item) => item.id === kind);
  return found ? found.one : "Узел";
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

function diffLine(counts) {
  const total =
    counts.nodesAdded + counts.nodesRemoved + counts.nodesChanged + counts.linksAdded + counts.linksRemoved;
  if (total === 0) return null;
  return [
    `+${counts.nodesAdded} ${plural(counts.nodesAdded, "узел", "узла", "узлов")}`,
    `−${counts.nodesRemoved} ${plural(counts.nodesRemoved, "узел", "узла", "узлов")}`,
    `~${counts.nodesChanged} изменено`,
    `+${counts.linksAdded} ${plural(counts.linksAdded, "связь", "связи", "связей")}`,
    `−${counts.linksRemoved} ${plural(counts.linksRemoved, "связь", "связи", "связей")}`
  ].join(", ");
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

function nodeTone(status) {
  if (status === "added") {
    return "border-[#1f6b4a] bg-[#e7f6ee] text-[#0f6b3c] dark:border-[#7dcea0] dark:bg-[#143024] dark:text-[#d8f5e4]";
  }
  if (status === "removed") {
    return "border-dashed border-[#8e1d1d] bg-[#fde8e8] text-[#8e1d1d] dark:border-[#ffb4b4] dark:bg-[#3a1c1c] dark:text-[#ffd0d0]";
  }
  if (status === "changed") {
    return "border-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]";
  }
  return "border-[#ddd4c6] bg-[#fffdf8] text-[#1e1b16] dark:border-[#343b46] dark:bg-[#1e232b] dark:text-[#f3efe6]";
}

function linkPaint(status, diffMode) {
  if (!diffMode || !status || status === "same") {
    return {
      line: "stroke-[#6f675c] dark:stroke-[#b7b0a4]",
      fill: "fill-[#6f675c] dark:fill-[#b7b0a4]",
      dash: false,
      mark: ""
    };
  }
  if (status === "added") {
    return {
      line: "stroke-[#1f6b4a] dark:stroke-[#7dcea0]",
      fill: "fill-[#1f6b4a] dark:fill-[#7dcea0]",
      dash: false,
      mark: "+"
    };
  }
  if (status === "removed") {
    return {
      line: "stroke-[#8e1d1d] dark:stroke-[#ffb4b4]",
      fill: "fill-[#8e1d1d] dark:fill-[#ffb4b4]",
      dash: true,
      mark: "−"
    };
  }
  return {
    line: "stroke-[#7a4e00] dark:stroke-[#ffe0a3]",
    fill: "fill-[#7a4e00] dark:fill-[#ffe0a3]",
    dash: false,
    mark: "~"
  };
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

function connectedIds(id, links) {
  const next = new Map();
  for (const link of links) {
    if (!next.has(link.from)) next.set(link.from, []);
    if (!next.has(link.to)) next.set(link.to, []);
    next.get(link.from).push(link.to);
    next.get(link.to).push(link.from);
  }
  const seen = new Set();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const item of next.get(current) || []) stack.push(item);
  }
  return seen;
}

function layout(nodes) {
  const grouped = new Map(KINDS.map((kind) => [kind.id, []]));
  for (const node of nodes) {
    if (grouped.has(node.kind)) grouped.get(node.kind).push(node);
  }
  const positions = new Map();
  let bottom = PAD + HEADER;
  KINDS.forEach((kind, column) => {
    grouped.get(kind.id).forEach((node, row) => {
      const y = PAD + HEADER + row * (NODE_H + ROW_GAP);
      positions.set(node.id, {
        x: PAD + column * (NODE_W + COL_GAP),
        y,
        w: NODE_W,
        h: NODE_H
      });
      bottom = Math.max(bottom, y + NODE_H);
    });
  });
  const width = PAD * 2 + KINDS.length * NODE_W + (KINDS.length - 1) * COL_GAP + GUTTER;
  return { positions, width, height: bottom + PAD };
}

function endpoints(from, to) {
  const fromY = from.y + from.h / 2;
  const toY = to.y + to.h / 2;
  if (Math.abs(from.x - to.x) < 4) {
    return { x1: from.x + from.w, y1: fromY, x2: to.x + to.w, y2: toY };
  }
  if (to.x >= from.x) {
    return { x1: from.x + from.w, y1: fromY, x2: to.x, y2: toY };
  }
  return { x1: from.x, y1: fromY, x2: to.x + to.w, y2: toY };
}

function cubicPoint(t, x1, y1, c1x, c1y, c2x, c2y, x2, y2) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * x1 + b * c1x + c * c2x + d * x2,
    y: a * y1 + b * c1y + c * c2y + d * y2
  };
}

function curve(x1, y1, x2, y2) {
  const sameColumn = Math.abs(x1 - x2) < 8;
  let c1x;
  let c2x;
  if (sameColumn) {
    c1x = x1 + 28;
    c2x = x2 + 28;
  } else {
    const dir = x2 >= x1 ? 1 : -1;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
    c1x = x1 + dir * dx;
    c2x = x2 - dir * dx;
  }
  return {
    d: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
    mid: cubicPoint(0.5, x1, y1, c1x, y1, c2x, y2, x2, y2)
  };
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

function dataOf(node) {
  return node && node.data && typeof node.data === "object" ? node.data : null;
}

function FieldList({ data }) {
  const keys = unionKeys(data, null);
  if (keys.length === 0) return <p className={`m-0 ${MUTED}`}>Нет полей</p>;
  return (
    <dl className="m-0 grid gap-2">
      {keys.map((key) => (
        <div key={key} className="min-w-0">
          <dt className={`text-[0.86rem] font-[650] ${MUTED}`}>{fieldLabel(key)}</dt>
          <dd className="m-0 break-words">{formatValue(data[key])}</dd>
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
    <div className="grid gap-2">
      <div className={`grid grid-cols-2 gap-2 text-[0.86rem] font-[650] ${MUTED}`}>
        <div>Опубликовано</div>
        <div>Черновик</div>
      </div>
      {keys.length === 0 ? <p className={`m-0 ${MUTED}`}>Нет полей</p> : null}
      {keys.map((key) => {
        const hasLeft = Boolean(left && Object.hasOwn(left, key));
        const hasRight = Boolean(right && Object.hasOwn(right, key));
        const different = signature(hasLeft, left && left[key]) !== signature(hasRight, right && right[key]);
        const tone = different
          ? "rounded-md bg-[#fff4d6] px-1.5 py-1 text-[#7a4e00] dark:bg-[#3a2e12] dark:text-[#ffe0a3]"
          : "px-1.5 py-1";
        return (
          <div key={key} className="min-w-0">
            <div className={`text-[0.86rem] font-[650] ${MUTED}`}>{different ? "~ " : ""}{fieldLabel(key)}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`min-w-0 break-words ${tone}`}>{hasLeft ? formatValue(left[key]) : "нет"}</div>
              <div className={`min-w-0 break-words ${tone}`}>{hasRight ? formatValue(right[key]) : "нет"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NodeCard({ node, mode, model, onOpen }) {
  const publishedNode = model.publishedById.get(node.id) || null;
  const draftNode = model.draftById.get(node.id) || null;
  const status = mode === "diff" ? model.diff.nodes.get(node.id) || "same" : null;
  const ownLinks = model.links.filter((link) => link.from === node.id || link.to === node.id);
  const section = sectionFor(node.kind);
  const single = mode === "draft" ? draftNode || node : publishedNode || node;
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="mt-0 mb-1 font-[650] leading-tight text-[1.15rem] break-words">{node.label}</h3>
        <p className="m-0">{kindOne(node.kind)}</p>
        <p className={`m-0 break-words ${MUTED}`}>Идентификатор: {node.key}</p>
        {status ? <p className={`mt-2 mb-0 font-[650] ${statusClass(status)}`}>{statusText(status)}</p> : null}
      </div>
      {mode === "diff" ? (
        <DiffFields publishedNode={publishedNode} draftNode={draftNode} />
      ) : (
        <FieldList data={dataOf(single) || {}} />
      )}
      <div>
        <h3 className="mt-0 mb-2 text-[1rem] font-[650]">Связи</h3>
        {ownLinks.length === 0 ? <p className={`m-0 ${MUTED}`}>Связей нет</p> : null}
        {ownLinks.length > 0 ? (
          <ul className="m-0 grid list-disc gap-1 pl-[1.1rem]">
            {ownLinks.map((link) => (
              <li key={linkKey(link)} className="break-words">
                {describeLink(link, model.nodesById)}
                {mode === "diff" ? ` — ${statusText(model.diff.links.get(linkKey(link)))}` : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        className={BUTTON}
        aria-label={`Открыть в разделе «${sectionLabel(section)}»`}
        onClick={() => onOpen(section)}
      >
        Открыть в разделе
      </button>
    </div>
  );
}

function Holes({ problems, empty, hint, onPick }) {
  return (
    <section className="mb-4 max-w-full" aria-label="Дыры">
      <h2 className="mt-0 mb-2.5 font-[650] leading-tight text-[1.15rem]">Дыры</h2>
      {hint ? <p className={`mt-0 mb-2 ${MUTED}`}>{hint}</p> : null}
      {empty ? <p className={`mt-0 mb-2 ${MUTED}`}>Слой пуст</p> : null}
      {!empty && problems.length === 0 ? <p className={`mt-0 mb-2 ${MUTED}`}>Дыр не найдено</p> : null}
      {!empty && problems.length > 0 ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {problems.map((item, index) => {
            const tone =
              item.level === "error"
                ? "border-l-[#8e1d1d] bg-[#fde8e8] text-[#8e1d1d] dark:border-l-[#ffb4b4] dark:bg-[#3a1c1c] dark:text-[#ffb4b4]"
                : "border-l-[#7a4e00] bg-[#fff4d6] text-[#7a4e00] dark:border-l-[#ffe0a3] dark:bg-[#3a2e12] dark:text-[#ffe0a3]";
            const mark = item.level === "error" ? "Ошибка" : "Внимание";
            const body = (
              <>
                <span className="font-bold">{mark}</span>
                <span className="min-w-0 break-words">{item.text}</span>
              </>
            );
            if (!item.nodeId) {
              return (
                <li
                  key={`${index}:${item.text}`}
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-[10px] border-l-4 px-3 py-2.5 ${tone}`}
                >
                  {body}
                </li>
              );
            }
            return (
              <li key={`${index}:${item.text}`}>
                <button
                  type="button"
                  className={`grid w-full max-w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-[10px] border-l-4 px-3 py-2.5 text-left ${tone} ${FOCUS}`}
                  onClick={() => onPick(item.nodeId)}
                >
                  {body}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function Endpoint({ node, onPick }) {
  if (!node) return "—";
  return (
    <button
      type="button"
      className={`cursor-pointer bg-transparent p-0 text-left underline decoration-[#cfc6b8] dark:decoration-[#4a5360] ${FOCUS}`}
      onClick={() => onPick(node.id)}
    >
      {kindOne(node.kind)} «{node.label}»
    </button>
  );
}

function LinkTable({ links, nodesById, mode, linkStatus, onPick, isolated }) {
  const columns = [
    { key: "from", title: "Откуда", render: (link) => <Endpoint node={nodesById.get(link.from)} onPick={onPick} /> },
    { key: "to", title: "Куда", render: (link) => <Endpoint node={nodesById.get(link.to)} onPick={onPick} /> },
    { key: "kind", title: "Вид", render: (link) => LINK_KIND[link.kind] || link.kind },
    { key: "label", title: "Подпись", render: (link) => (link.label ? link.label : "—") }
  ];
  if (mode === "diff") {
    columns.push({
      key: "status",
      title: "Статус",
      render: (link) => <span className={statusClass(linkStatus(link))}>{statusText(linkStatus(link))}</span>
    });
  }
  return (
    <div className="max-w-full">
      {links.length > 0 ? (
        <div className="max-w-full overflow-x-auto">
          <DataTable columns={columns} rows={links} rowKey={(link) => linkKey(link)} />
        </div>
      ) : (
        <p className={`mt-0 mb-2 ${MUTED}`}>Связей нет</p>
      )}
      {isolated.length > 0 ? (
        <div className="mt-4">
          <h3 className="mt-0 mb-2 text-[1rem] font-[650]">Узлы без связей</h3>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {isolated.map((node) => (
              <li key={node.id}>
                <button type="button" className={BUTTON} onClick={() => onPick(node.id)}>
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

function Scheme({ nodes, links, mode, nodeStatus, linkStatus, selected, chain, onToggle }) {
  const { positions, width, height } = layout(nodes);
  const svgLabel =
    mode === "diff"
      ? "Схема связей: сценарии, вопросы, ответы, потребности, типы и товары. Плюс — добавлено, минус — будет удалено, тильда — изменено."
      : "Схема связей: сценарии, вопросы, ответы, потребности, типы и товары.";
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label="Схема связей, область прокручивается"
      className={`max-h-[70vh] max-w-full overflow-auto rounded-xl border border-[#ddd4c6] bg-[#f3f0e8] dark:border-[#343b46] dark:bg-[#14171c] ${FOCUS}`}
    >
      <div className="relative" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={width}
          height={height}
          role="img"
          aria-label={svgLabel}
        >
          {links.map((link) => {
            const from = positions.get(link.from);
            const to = positions.get(link.to);
            if (!from || !to) return null;
            const ends = endpoints(from, to);
            const curved = curve(ends.x1, ends.y1, ends.x2, ends.y2);
            const status = mode === "diff" ? linkStatus(link) : null;
            const paint = linkPaint(status, mode === "diff");
            const active = !chain || (chain.has(link.from) && chain.has(link.to));
            return (
              <g key={linkKey(link)} opacity={active ? 0.95 : 0.15}>
                <path
                  d={curved.d}
                  fill="none"
                  strokeWidth={active && chain ? 2.4 : 1.5}
                  strokeDasharray={paint.dash ? "6 4" : undefined}
                  className={paint.line}
                />
                {paint.mark ? (
                  <>
                    <circle cx={curved.mid.x} cy={curved.mid.y} r="7" className="fill-[#f3f0e8] dark:fill-[#14171c]" />
                    <text
                      x={curved.mid.x}
                      y={curved.mid.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="12"
                      fontWeight="700"
                      className={paint.fill}
                    >
                      {paint.mark}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
        {KINDS.map((kind, column) => (
          <p
            key={kind.id}
            className={`absolute m-0 text-[0.86rem] font-[650] ${MUTED}`}
            style={{ left: PAD + column * (NODE_W + COL_GAP), top: PAD, width: NODE_W }}
          >
            {kind.title}
          </p>
        ))}
        {nodes.map((node) => {
          const box = positions.get(node.id);
          if (!box) return null;
          const status = mode === "diff" ? nodeStatus(node.id) : null;
          const mark = nodeMark(status);
          const dimmed = Boolean(chain && !chain.has(node.id));
          const pressed = selected === node.id;
          const words = status ? statusWords(status) : "";
          return (
            <button
              key={node.id}
              id={`map-node-${node.id}`}
              type="button"
              title={node.label}
              aria-pressed={pressed}
              aria-label={`${kindOne(node.kind)} «${node.label}»${words ? `, ${words}` : ""}`}
              className={`absolute z-10 cursor-pointer overflow-visible rounded-lg border px-2 py-1 text-left ${FOCUS} ${nodeTone(status)} ${
                dimmed ? "opacity-30" : "opacity-100"
              } ${pressed ? "ring-2 ring-[#1f6b4a] dark:ring-[#7dcea0]" : ""}`}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onClick={() => onToggle(node.id)}
            >
              <span className="line-clamp-2 break-words text-[0.82rem] leading-[1.25]">
                {mark ? (
                  <span className="mr-1 font-[700]" aria-hidden="true">
                    {mark}
                  </span>
                ) : null}
                {node.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function nodeMark(status) {
  if (status === "added") return "+";
  if (status === "removed") return "−";
  if (status === "changed") return "~";
  return "";
}

function LinkMap({ openSection = () => {} }) {
  const [view, setView] = useState({ kind: "loading" });
  const [mode, setMode] = useState("published");
  const [presentation, setPresentation] = useState("graph");
  const [selected, setSelected] = useState(null);
  const [kinds, setKinds] = useState(() => Object.fromEntries(KINDS.map((item) => [item.id, true])));
  const focusRef = useRef(false);

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

  const model = useMemo(() => {
    if (view.kind !== "ready") return null;
    return assemble(view.questionnaire, view.catalog, mode);
  }, [view, mode]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selected || !model) return;
    if (!model.nodesById.has(selected)) setSelected(null);
  }, [selected, model]);

  useEffect(() => {
    if (!focusRef.current || !selected || presentation !== "graph") return;
    const el = document.getElementById(`map-node-${selected}`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    el.focus();
    focusRef.current = false;
  }, [selected, presentation, kinds, mode]);

  function reveal(id) {
    if (!model) return;
    const node = model.nodesById.get(id);
    if (node && kinds[node.kind] === false) {
      setKinds((current) => ({ ...current, [node.kind]: true }));
    }
  }

  function toggleKind(id) {
    setKinds((current) => ({ ...current, [id]: current[id] === false }));
  }

  if (view.kind === "loading") return <Loading text="Загружаем карту связей…" />;
  if (view.kind === "error" || view.kind === "crash") {
    return (
      <div className="min-w-0 max-w-full">
        <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Карта связей</h1>
        {view.kind === "crash" ? (
          <Banner kind="error" text="Не получилось открыть карту связей" />
        ) : (
          <ErrorBlock lines={view.lines} />
        )}
      </div>
    );
  }

  const visibleNodes = model.nodes.filter((node) => kinds[node.kind] !== false);
  const visibleLinks = model.links.filter((link) => {
    const from = model.nodesById.get(link.from);
    const to = model.nodesById.get(link.to);
    return Boolean(from && to && kinds[from.kind] !== false && kinds[to.kind] !== false);
  });
  const linked = new Set();
  for (const link of visibleLinks) {
    linked.add(link.from);
    linked.add(link.to);
  }
  const isolated = visibleNodes.filter((node) => !linked.has(node.id));
  const chain = selected ? connectedIds(selected, model.links) : null;
  const selectedNode = selected ? model.nodesById.get(selected) || null : null;
  const counter = mode === "diff" ? diffLine(model.diff.counts) : null;
  const nodeStatus = (id) => model.diff.nodes.get(id) || "same";
  const linkStatus = (link) => model.diff.links.get(linkKey(link)) || "same";

  let body;
  if (model.layerEmpty) {
    body = <p className={`mt-0 mb-2 ${MUTED}`}>Слой пуст</p>;
  } else if (model.nodes.length === 0) {
    body = <p className={`mt-0 mb-2 ${MUTED}`}>Нет данных для карты</p>;
  } else if (visibleNodes.length === 0) {
    body = <p className={`mt-0 mb-2 ${MUTED}`}>Все виды узлов скрыты. Отметьте хотя бы один вид.</p>;
  } else if (presentation === "table") {
    body = (
      <LinkTable
        links={visibleLinks}
        nodesById={model.nodesById}
        mode={mode}
        linkStatus={linkStatus}
        isolated={isolated}
        onPick={(id) => {
          reveal(id);
          setSelected(id);
        }}
      />
    );
  } else {
    body = (
      <Scheme
        nodes={visibleNodes}
        links={visibleLinks}
        mode={mode}
        nodeStatus={nodeStatus}
        linkStatus={linkStatus}
        selected={selected}
        chain={chain}
        onToggle={(id) => setSelected((current) => (current === id ? null : id))}
      />
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Карта связей</h1>
      <p className={`mt-0 mb-4 ${MUTED}`}>
        Откуда берётся решение консультанта. Здесь только просмотр. Править данные можно в разделах и на экране «Ручки».
      </p>
      <div className="mb-4 flex max-w-full flex-wrap gap-x-6 gap-y-3">
        <div role="group" aria-label="Слой данных" className="flex flex-wrap gap-2">
          {MODES.map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              className={mode === id ? BUTTON_ON : BUTTON}
              onClick={() => setMode(id)}
            >
              {text}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Вид карты" className="flex flex-wrap gap-2">
          {VIEWS.map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={presentation === id}
              className={presentation === id ? BUTTON_ON : BUTTON}
              onClick={() => setPresentation(id)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <fieldset className="mb-4 min-w-0 border-0 p-0">
        <legend className={`mb-2 text-[0.86rem] font-[650] ${MUTED}`}>Виды узлов</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {KINDS.map((kind) => (
            <label key={kind.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className={`rounded-lg ${FOCUS}`}
                checked={kinds[kind.id] !== false}
                onChange={() => toggleKind(kind.id)}
              />
              <span>{kind.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {model.notes.map((note) => (
        <p key={note} className={`mt-0 mb-2 ${MUTED}`}>
          {note}
        </p>
      ))}
      <Holes
        problems={model.problems}
        empty={model.problemsEmpty}
        hint={mode === "diff" && !model.problemsEmpty ? "По черновику: он станет рабочим после публикации." : ""}
        onPick={(id) => {
          reveal(id);
          focusRef.current = true;
          setPresentation("graph");
          setSelected(id);
        }}
      />
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <h2 className="mt-0 mb-2.5 font-[650] leading-tight text-[1.15rem]">
            {presentation === "table" ? "Таблица связей" : "Схема"}
          </h2>
          {mode === "diff" && !model.layerEmpty && model.nodes.length > 0 ? (
            <p className="mt-0 mb-2 font-[650]">{counter || "Черновик совпадает с опубликованным"}</p>
          ) : null}
          {mode === "diff" && presentation === "graph" && !model.layerEmpty && model.nodes.length > 0 ? (
            <p className={`mt-0 mb-2 text-[0.86rem] ${MUTED}`}>
              + добавлено, − будет удалено, ~ изменено. Без значка узел и связь не менялись. Удалённые связи пунктирные.
            </p>
          ) : null}
          {body}
        </div>
        <aside
          className="min-w-0 rounded-xl border border-[#ddd4c6] bg-[#fffdf8] p-3.5 shadow-[0_1px_2px_rgba(40,32,20,0.06)] dark:border-[#343b46] dark:bg-[#1e232b] dark:shadow-none min-[1000px]:max-h-[calc(100vh-2rem)] min-[1000px]:overflow-auto"
          aria-label="Карточка узла"
        >
          {selectedNode ? (
            <NodeCard node={selectedNode} mode={mode} model={model} onOpen={openSection} />
          ) : (
            <p className={`m-0 ${MUTED}`}>Выберите узел на схеме, в таблице или в списке дыр</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export { LinkMap };
