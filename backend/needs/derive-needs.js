import { computeNeeds } from "./inference-engine.js";
import { runMatching } from "./matching.js";

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

function catalogNeeds(catalog) {
  const needs = catalog?.needs ?? catalog?.draft?.needs ?? [];
  return Array.isArray(needs) ? needs : [];
}

function onePerType(catalog, needs) {
  const list = Array.isArray(needs) ? needs : [];
  const defined = catalogNeeds(catalog);
  const typeOf = new Map();
  const orderOf = new Map();
  defined.forEach((need, index) => {
    if (!need || typeof need.id !== "string") return;
    orderOf.set(need.id, index);
    const type = need.criteria?.type;
    if (typeof type === "string" && type.length > 0) typeOf.set(need.id, type);
  });

  const best = new Map();
  for (const need of list) {
    const type = typeOf.get(need?.id);
    if (!type) continue;
    const current = best.get(type);
    if (!current) {
      best.set(type, need);
      continue;
    }
    const rank = CONFIDENCE_RANK[need.confidence] ?? 0;
    const currentRank = CONFIDENCE_RANK[current.confidence] ?? 0;
    if (rank > currentRank) {
      best.set(type, need);
      continue;
    }
    if (rank < currentRank) continue;
    const order = orderOf.get(need.id) ?? Number.MAX_SAFE_INTEGER;
    const currentOrder = orderOf.get(current.id) ?? Number.MAX_SAFE_INTEGER;
    if (order < currentOrder) best.set(type, need);
  }

  const kept = new Set(best.values());
  return list.filter((need) => {
    const type = typeOf.get(need?.id);
    if (!type) return true;
    return kept.has(need);
  });
}

function deriveNeeds({ questionnaire, catalog, profile }) {
  return runMatching(catalog, onePerType(catalog, computeNeeds(questionnaire, profile)));
}

export { deriveNeeds, onePerType };
