import {
  findProduct,
  firstReplacement,
  isProtected,
  resolveTarget,
  sceneAtMax,
  typeAtMax
} from "./limits.js";
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

function runAdd({ sku, product, sceneSkus, apply, catalog, limits, action }) {
  const facts = factsOf(action, sku);
  const typeCap = typeAtMax(sceneSkus, catalog, product.type);
  if (typeCap) {
    return refused("limit", facts, { sku, type: typeCap.type, max: typeCap.max });
  }
  const cap = sceneAtMax(sceneSkus, limits);
  if (cap) return refused("limit", facts, { max: cap.max });
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

function runReplace({ sku, withSku, sceneSkus, apply, catalog, limits, action }) {
  const target = resolveTarget(sku, sceneSkus, catalog);
  if (!target) return refused("not_found", factsOf(action, sku), { sku });

  const protection = isProtected(target, catalog, sceneSkus);
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
  const typeCap = typeAtMax(remaining, catalog, replacementProduct?.type);
  if (typeCap) {
    return refused("limit", factsOf(action, target, { withSku: replacement }), {
      sku: replacement,
      type: typeCap.type,
      max: typeCap.max
    });
  }
  const cap = sceneAtMax(remaining, limits);
  if (cap) {
    return refused("limit", factsOf(action, target, { withSku: replacement }), { max: cap.max });
  }

  const facts = factsOf(action, target, { withSku: replacement });
  return fromApply(apply({ op: "replace", sku: target, withSku: replacement }), facts, SAY.replace);
}

function runCommand({ intent, catalog, scene, limits }) {
  const action = intent?.payload?.action;
  const sku = intent?.payload?.sku;
  const withSku = intent?.payload?.withSku;
  const sceneSkus = Array.isArray(scene?.skus) ? scene.skus : [];
  const apply = typeof scene?.apply === "function" ? scene.apply : () => ({ ok: false, reasonCode: "not_found" });

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
    return runAdd({ sku, product, sceneSkus, apply, catalog, limits, action });
  }
  if (action === "remove") {
    return runRemove({ sku, sceneSkus, apply, catalog, action });
  }
  return runReplace({ sku, withSku, sceneSkus, apply, catalog, limits, action });
}

export { runCommand };
