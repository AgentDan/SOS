import { okTalk } from "./result.js";

// Порядок кодов реплик в data/consultant.json: стол, потом монитор.
const ISSUE_CODES = [
  "desk_too_high",
  "desk_too_low",
  "monitor_too_far",
  "monitor_too_close",
  "monitor_too_high",
  "monitor_too_low"
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function productsOf(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products;
  return Array.isArray(products) ? products : [];
}

function cm(mm) {
  if (typeof mm !== "number" || !Number.isFinite(mm)) return "";
  return Math.round(mm / 10);
}

function codeRank(code) {
  const index = ISSUE_CODES.indexOf(code);
  return index === -1 ? ISSUE_CODES.length : index;
}

function deltaOf(issue) {
  const value = issue?.deltaMm;
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function usable(issue) {
  return isPlainObject(issue) && typeof issue.code === "string" && issue.code.length > 0;
}

function heaviest(issues) {
  let best = null;
  for (const issue of issues) {
    if (!usable(issue)) continue;
    if (!best) {
      best = issue;
      continue;
    }
    const delta = deltaOf(issue);
    const bestDelta = deltaOf(best);
    if (delta > bestDelta || (delta === bestDelta && codeRank(issue.code) < codeRank(best.code))) {
      best = issue;
    }
  }
  return best;
}

function itemLabel(catalog, sku) {
  if (typeof sku !== "string" || sku.length === 0) return null;
  const product = productsOf(catalog).find((entry) => entry && entry.sku === sku);
  if (typeof product?.label === "string" && product.label.length > 0) return product.label;
  return sku;
}

function noData() {
  return okTalk({
    sceneChanged: false,
    facts: { topic: "ergo", issues: [] },
    say: { code: "ergo_no_data", params: {} }
  });
}

function runErgo({ ergo, catalog, scene } = {}) {
  const measured = ergo === undefined ? scene?.ergo : ergo;
  if (!isPlainObject(measured)) return noData();

  const issues = Array.isArray(measured.issues) ? measured.issues : [];
  const issue = heaviest(issues);
  const facts = { topic: "ergo", issues: [...issues] };
  if (!issue) {
    return okTalk({
      sceneChanged: false,
      facts,
      say: { code: "ergo_ok", params: {} }
    });
  }

  const params = {
    actual: cm(issue.actualMm),
    target: cm(issue.targetMm),
    delta: cm(issue.deltaMm)
  };
  const item = itemLabel(catalog, issue.sku);
  if (item !== null) params.item = item;

  return okTalk({
    sceneChanged: false,
    facts,
    say: { code: `ergo_${issue.code}`, params }
  });
}

export { runErgo };
