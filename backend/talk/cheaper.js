import { failTalk, okTalk } from "./result.js";

function catalogLayer(catalog) {
  if (catalog && (Array.isArray(catalog.products) || Array.isArray(catalog.types))) return catalog;
  if (catalog?.draft) return catalog.draft;
  return catalog ?? {};
}

function catalogProducts(catalog) {
  const products = catalogLayer(catalog).products;
  return Array.isArray(products) ? products : [];
}

function priceOf(product) {
  const price = product?.priceEur;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return price;
}

function nearestCheaper(products, current, price) {
  let replacement = null;
  for (const candidate of products) {
    if (!candidate || typeof candidate.sku !== "string" || candidate.sku.length === 0) continue;
    if (candidate.type === "person" || candidate.type !== current.type) continue;
    if (candidate.sku === current.sku) continue;
    const candidatePrice = priceOf(candidate);
    if (candidatePrice === null || candidatePrice >= price) continue;
    if (replacement === null || candidatePrice > replacement.price) {
      replacement = { sku: candidate.sku, price: candidatePrice };
    }
  }
  return replacement;
}

function runCheaper({ catalog, scene, canReplace }) {
  const products = catalogProducts(catalog);
  const sceneSkus = Array.isArray(scene?.skus) ? scene.skus : [];
  const apply =
    typeof scene?.apply === "function" ? scene.apply : () => ({ ok: false, reasonCode: "not_found" });
  const bySku = new Map();
  for (const product of products) {
    if (product?.sku) bySku.set(product.sku, product);
  }

  let best = null;
  for (const sku of sceneSkus) {
    const current = bySku.get(sku);
    if (!current || current.alwaysPresent === true || current.type === "person") continue;
    if (typeof current.type !== "string" || current.type.length === 0) continue;
    const price = priceOf(current);
    if (price === null) continue;
    const replacement = nearestCheaper(products, current, price);
    if (!replacement) continue;
    if (typeof canReplace === "function") {
      const swap = canReplace({ catalog, sceneSkus, sku, withSku: replacement.sku });
      if (!swap || swap.ok !== true) continue;
    }
    const savedEur = price - replacement.price;
    if (best === null || savedEur > best.savedEur) {
      best = { sku, withSku: replacement.sku, savedEur };
    }
  }

  if (!best) {
    return failTalk({
      reasonCode: "nothing_cheaper",
      facts: { topic: "cheaper" },
      say: { code: "nothing_cheaper", params: {} }
    });
  }

  const applied = apply({ op: "replace", sku: best.sku, withSku: best.withSku });
  if (!applied || applied.ok !== true) {
    const code = applied?.reasonCode;
    const reasonCode = typeof code === "string" && code.length > 0 ? code : "not_found";
    return failTalk({
      reasonCode,
      facts: { topic: "cheaper", sku: best.sku, withSku: best.withSku },
      say: { code: reasonCode, params: { sku: best.sku, withSku: best.withSku } }
    });
  }

  const facts = {
    topic: "cheaper",
    sku: best.sku,
    withSku: best.withSku,
    savedEur: best.savedEur
  };
  return okTalk({
    sceneChanged: applied.sceneChanged,
    facts,
    say: {
      code: "cheaper_done",
      params: { sku: facts.sku, withSku: facts.withSku, savedEur: facts.savedEur }
    }
  });
}

export { runCheaper };
