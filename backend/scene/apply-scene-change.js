import { computeScenePlan } from "./scene-plan.js";

function catalogProducts(catalog) {
  return catalog?.products ?? catalog?.draft?.products ?? [];
}

function findProduct(catalog, sku) {
  return catalogProducts(catalog).find((product) => product?.sku === sku);
}

function sameSkus(left, right) {
  if (left.length !== right.length) return false;
  return left.every((sku, index) => sku === right[index]);
}

function failed(reasonCode, skus) {
  return { ok: false, reasonCode, sceneChanged: false, skus: [...skus] };
}

function copiesOf(skus, sku) {
  return skus.filter((item) => item === sku).length;
}

function hostsCargo(catalog, sku, skus) {
  return skus.some((item) => findProduct(catalog, item)?.placement?.hostSku === sku);
}

function lastSupport(catalog, sku, skus) {
  if (copiesOf(skus, sku) > 1) return false;
  const product = findProduct(catalog, sku);
  return product?.alwaysPresent === true || hostsCargo(catalog, sku, skus);
}

function succeed(catalog, profile, change, before) {
  if (change.op !== "refresh") {
    profile.sceneEdits ??= [];
    if (change.op === "add") profile.sceneEdits.push({ op: "add", sku: change.sku });
    else if (change.op === "remove") profile.sceneEdits.push({ op: "remove", sku: change.sku });
    else if (change.op === "replace") {
      profile.sceneEdits.push({ op: "replace", sku: change.sku, withSku: change.withSku });
    }
  }

  const skus = computeScenePlan(catalog, profile);
  return {
    ok: true,
    reasonCode: null,
    sceneChanged: !sameSkus(skus, before),
    skus
  };
}

function applySceneChange({ catalog, profile, change, before }) {
  const start = before === undefined ? computeScenePlan(catalog, profile) : [...before];
  const op = change?.op;

  if (op === "refresh") return succeed(catalog, profile, change, start);

  if (op === "add") {
    if (!findProduct(catalog, change.sku)) return failed("unknown_sku", start);
    return succeed(catalog, profile, change, start);
  }

  if (op === "remove") {
    if (!start.includes(change.sku)) return failed("not_found", start);
    if (lastSupport(catalog, change.sku, start)) return failed("cannot_remove_support", start);
    return succeed(catalog, profile, change, start);
  }

  if (op === "replace") {
    if (!findProduct(catalog, change.withSku)) return failed("unknown_sku", start);
    if (!start.includes(change.sku)) return failed("not_found", start);
    if (lastSupport(catalog, change.sku, start)) return failed("cannot_remove_support", start);
    return succeed(catalog, profile, change, start);
  }

  return failed("not_found", start);
}

export { applySceneChange };
