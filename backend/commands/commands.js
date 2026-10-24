import {
  findProduct,
  firstReplacement,
  isProtected,
  resolveTarget,
  typeAtMax
} from "./limits.js";
import { canPlace, canReplace } from "./placement.js";
import { failCommand, okCommand } from "./result.js";

const SAY = {
  add: "command_added",
  remove: "command_removed",
  replace: "command_replaced"
};

function compact(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function factsOf(action, sku, extra) {
  return compact({ action, sku, ...extra });
}

function refused(reasonCode, facts, params) {
  return failCommand({
    reasonCode,
    facts,
    say: { code: reasonCode, params: compact(params ?? {}) }
  });
}

function fromApply(applied, facts, successCode) {
  if (!applied || applied.ok !== true) {
    const reasonCode = applied?.reasonCode ?? "not_found";
    return refused(reasonCode, facts, { sku: facts.sku, withSku: facts.withSku });
  }
  return okCommand({
    sceneChanged: applied.sceneChanged,
    facts,
    say: { code: successCode, params: compact({ sku: facts.sku, withSku: facts.withSku }) }
  });
}

function withoutCopy(skus, sku) {
  const index = skus.indexOf(sku);
  if (index === -1) return skus.slice();
  return skus.slice(0, index).concat(skus.slice(index + 1));
}

function runAdd({ sku, product, sceneSkus, apply, catalog, action }) {
  const facts = factsOf(action, sku);
  const placement = canPlace({ catalog, sceneSkus, sku });
  if (!placement.ok) {
    return refused(placement.reasonCode, { ...facts, ...placement.facts }, { sku });
  }
  const typeCap = typeAtMax(sceneSkus, catalog, product.type);
  if (typeCap) {
    return refused("limit", facts, { sku, type: typeCap.type, max: typeCap.max });
  }
  return fromApply(apply({ op: "add", sku }), facts, SAY.add);
}

function runRemove({ sku, sceneSkus, apply, catalog, action }) {
  const target = resolveTarget(sku, sceneSkus, catalog);
  const facts = factsOf(action, target ?? sku);
  if (!target) return refused("not_found", facts, { sku });
  const protection = isProtected(target, catalog, sceneSkus);
  if (protection.blocked) {
    return refused("cannot_remove_support", facts, { sku: target, hosted: protection.hosted });
  }
  return fromApply(apply({ op: "remove", sku: target }), factsOf(action, target), SAY.remove);
}

function runReplace({ sku, withSku, sceneSkus, apply, catalog, action }) {
  const target = resolveTarget(sku, sceneSkus, catalog);
  if (!target) return refused("not_found", factsOf(action, sku), { sku });

  const protection = isProtected(target, catalog, sceneSkus, { types: false });
  if (protection.blocked) {
    return refused("cannot_remove_support", factsOf(action, target), {
      sku: target,
      hosted: protection.hosted
    });
  }

  const remaining = withoutCopy(sceneSkus, target);
  let replacement = withSku;
  if (replacement !== undefined) {
    if (typeof replacement !== "string" || !findProduct(catalog, replacement)) {
      return refused("unknown_sku", factsOf(action, target, { withSku: replacement }), {
        sku: replacement
      });
    }
    if (replacement === target) {
      return failCommand({
        reasonCode: "limit",
        facts: { ...factsOf(action, target, { withSku: replacement }), detail: "same_sku" },
        say: { code: "limit", params: { sku: replacement } }
      });
    }
  } else {
    const product = findProduct(catalog, target);
    const found = firstReplacement(catalog, product?.type, target);
    if (!found) {
      return failCommand({
        reasonCode: "not_found",
        facts: { ...factsOf(action, target), detail: "no_replacement" },
        say: { code: "not_found", params: { sku: target } }
      });
    }
    replacement = found.sku;
  }

  const replacementProduct = findProduct(catalog, replacement);
  const swap = canReplace({ catalog, sceneSkus, sku: target, withSku: replacement });
  if (!swap.ok) {
    return refused(swap.reasonCode, { ...factsOf(action, target, { withSku: replacement }), ...swap.facts }, {
      sku: swap.sku ?? replacement
    });
  }
  const typeCap = typeAtMax(remaining, catalog, replacementProduct?.type);
  if (typeCap) {
    return refused("limit", factsOf(action, target, { withSku: replacement }), {
      sku: replacement,
      type: typeCap.type,
      max: typeCap.max
    });
  }

  const facts = factsOf(action, target, { withSku: replacement });
  return fromApply(apply({ op: "replace", sku: target, withSku: replacement }), facts, SAY.replace);
}

function productLabel(catalog, sku) {
  const product = findProduct(catalog, sku);
  if (typeof product?.label === "string" && product.label.length > 0) return product.label;
  return sku;
}

function copyCount(sceneSkus, sku) {
  return sceneSkus.filter((item) => item === sku).length;
}

function namedSkus(skus) {
  if (!Array.isArray(skus)) return [];
  return skus.filter((sku) => typeof sku === "string" && sku.length > 0).slice(0, 2);
}

function runDistance({ skus, sceneSkus, catalog, action }) {
  const named = namedSkus(skus);
  const facts = factsOf(action);
  if (named.length < 2) return refused("distance_unclear", facts, {});

  const [a, b] = named;
  const countA = copyCount(sceneSkus, a);
  const countB = a === b ? countA : copyCount(sceneSkus, b);
  if (countA === 0) return refused("distance_not_on_scene", facts, { name: productLabel(catalog, a) });
  if (countB === 0) return refused("distance_not_on_scene", facts, { name: productLabel(catalog, b) });
  if (a === b && countA < 2) return refused("distance_need_two", facts, {});

  return okCommand({
    sceneChanged: false,
    facts: { action, measure: { a, b } },
    say: {
      code: "distance_measure",
      params: { a: productLabel(catalog, a), b: productLabel(catalog, b) }
    }
  });
}

function runCommand({ intent, catalog, scene }) {
  const action = intent?.payload?.action;
  const sku = intent?.payload?.sku;
  const withSku = intent?.payload?.withSku;
  const sceneSkus = Array.isArray(scene?.skus) ? scene.skus : [];
  const apply = typeof scene?.apply === "function" ? scene.apply : () => ({ ok: false, reasonCode: "not_found" });

  if (action === "distance") {
    return runDistance({ skus: intent?.payload?.skus, sceneSkus, catalog, action });
  }

  if (action !== "add" && action !== "remove" && action !== "replace") {
    return refused("not_implemented", factsOf(action), { action });
  }

  if (typeof sku !== "string" || sku.length === 0) {
    return refused("unknown_sku", factsOf(action), {});
  }

  const product = findProduct(catalog, sku);
  if (!product) {
    return refused("unknown_sku", factsOf(action, sku), { sku });
  }

  if (action === "add") {
    return runAdd({ sku, product, sceneSkus, apply, catalog, action });
  }
  if (action === "remove") {
    return runRemove({ sku, sceneSkus, apply, catalog, action });
  }
  return runReplace({ sku, withSku, sceneSkus, apply, catalog, action });
}

export { runCommand };
