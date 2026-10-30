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

function catalogTypes(catalog) {
  const types = catalog?.types ?? catalog?.draft?.types ?? [];
  return Array.isArray(types) ? types : [];
}

function findType(catalog, typeId) {
  return catalogTypes(catalog).find((type) => type?.id === typeId);
}

function hostsCargo(catalog, sku, skus) {
  const hostType = findProduct(catalog, sku)?.type;
  if (typeof hostType !== "string" || hostType.length === 0) return false;
  return skus.some((item) => {
    const cargoType = findProduct(catalog, item)?.type;
    if (typeof cargoType !== "string") return false;
    const type = findType(catalog, cargoType);
    return Array.isArray(type?.canHostOn) && type.canHostOn.includes(hostType);
  });
}

function lastSupport(catalog, sku, skus, withSku) {
  if (copiesOf(skus, sku) > 1) return false;
  const product = findProduct(catalog, sku);
  if (product?.alwaysPresent === true) return true;
  if (!hostsCargo(catalog, sku, skus)) return false;
  if (typeof withSku === "string" && withSku.length > 0) {
    const next = findProduct(catalog, withSku);
    if (next && product && next.type === product.type) return false;
  }
  return true;
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
    if (lastSupport(catalog, change.sku, start, change.withSku)) {
      return failed("cannot_remove_support", start);
    }
    return succeed(catalog, profile, change, start);
  }

  return failed("not_found", start);
}

export { applySceneChange };
