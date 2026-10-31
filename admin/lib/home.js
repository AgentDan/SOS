import { summarizeProblems } from "./link-map.js";
import { DIALOG_SECTIONS } from "./nav.js";
import { routeForNode } from "./search.js";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function routeForSection(name) {
  if (name === "catalog") return { screen: "catalog" };
  if (name === "questionnaire") return { screen: "questionnaire" };
  if (DIALOG_SECTIONS.includes(name)) return { screen: "dialog", name };
  if (name === "ergonomics") return { screen: "ergonomics" };
  return { screen: "section", name };
}

function countNamed(list, key) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    if (typeof item[key] !== "string" || item[key].length === 0) continue;
    rows.push(item);
  }
  return rows;
}

function homeStats(input) {
  const source = isRecord(input) ? input : {};
  const catalog = isRecord(source.catalog) ? source.catalog : {};
  const questionnaire = isRecord(source.questionnaire) ? source.questionnaire : {};
  const products = countNamed(catalog.products, "sku");
  let withoutModel = 0;
  for (const product of products) {
    if (!(isRecord(product.media) && product.media.model3d)) withoutModel += 1;
  }
  const questions = countNamed(questionnaire.questions, "id");
  let answers = 0;
  for (const question of questions) {
    answers += countNamed(question.options, "id").length;
  }
  const summary = summarizeProblems(source.problems);
  const withoutAnswer = summary.find((row) => row.id === "need-without-answer");
  return {
    products: products.length,
    withoutModel,
    questions: questions.length,
    answers,
    needs: countNamed(catalog.needs, "id").length,
    needsWithoutAnswer: withoutAnswer ? withoutAnswer.count : 0
  };
}

function gapRows(problems, nodes) {
  const byId = new Map();
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (!isRecord(node) || typeof node.id !== "string" || node.id.length === 0) continue;
      if (!byId.has(node.id)) byId.set(node.id, node);
    }
  }
  const errors = [];
  const warns = [];
  const list = Array.isArray(problems) ? problems : [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    if (item.level !== "error" && item.level !== "warn") continue;
    if (typeof item.text !== "string" || item.text.length === 0) continue;
    let route = null;
    if (typeof item.nodeId === "string" && item.nodeId.length > 0) {
      const node = byId.get(item.nodeId);
      if (node) route = routeForNode(node);
    }
    const row = { level: item.level, text: item.text, route };
    if (item.level === "error") errors.push(row);
    else warns.push(row);
  }
  return [...errors, ...warns];
}

function timeOf(entry) {
  if (!isRecord(entry) || typeof entry.ts !== "string") return Number.NaN;
  return Date.parse(entry.ts);
}

function recentRows(entries, limit = 6) {
  const cap = typeof limit === "number" && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  if (!Array.isArray(entries)) return [];
  const rows = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const hasTs = typeof entry.ts === "string" && entry.ts.length > 0;
    const hasAction = typeof entry.action === "string" && entry.action.length > 0;
    const hasSection = typeof entry.section === "string" && entry.section.length > 0;
    if (!hasTs && !hasAction && !hasSection) return;
    rows.push({ entry, index });
  });
  rows.sort((left, right) => {
    const leftTime = timeOf(left.entry);
    const rightTime = timeOf(right.entry);
    const leftOk = Number.isFinite(leftTime);
    const rightOk = Number.isFinite(rightTime);
    if (leftOk && rightOk && leftTime !== rightTime) return rightTime - leftTime;
    if (leftOk !== rightOk) return leftOk ? -1 : 1;
    return right.index - left.index;
  });
  return rows.slice(0, cap).map((item) => item.entry);
}

export { routeForSection, homeStats, gapRows, recentRows };
