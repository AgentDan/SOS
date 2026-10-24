function uniqueSkus(skus) {
  const out = [];
  const seen = new Set();
  for (const sku of skus) {
    if (sku == null || seen.has(sku)) continue;
    seen.add(sku);
    out.push(sku);
  }
  return out;
}

function withoutLast(skus, sku) {
  const index = skus.lastIndexOf(sku);
  if (index === -1) return skus;
  return skus.slice(0, index).concat(skus.slice(index + 1));
}

function applySceneEdits(skus, edits) {
  let next = uniqueSkus(Array.isArray(skus) ? skus : []);
  if (!Array.isArray(edits)) return next;

  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    if (edit.op === "add") {
      next = [...next, edit.sku];
    } else if (edit.op === "remove") {
      next = withoutLast(next, edit.sku);
    } else if (edit.op === "replace") {
      const index = next.indexOf(edit.sku);
      if (index === -1) continue;
      const replaced = next.slice();
      replaced[index] = edit.withSku;
      next = replaced;
    }
  }

  return next;
}

function catalogProducts(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  return Array.isArray(products) ? products : [];
}

function isPersonSku(catalog, sku) {
  const product = catalogProducts(catalog).find((item) => item && item.sku === sku);
  return product?.type === "person";
}

function computeScenePlan(catalog, profile) {
  const products = catalogProducts(catalog);
  const anchored = products
    .filter((product) => product?.alwaysPresent === true && product?.type !== "person")
    .map((product) => product.sku);

  const needs = Array.isArray(profile?.needs) ? profile.needs : [];
  const resolved = needs.map((need) => need?.resolvedSku).filter((sku) => sku != null);

  return applySceneEdits([...new Set([...anchored, ...resolved])], profile?.sceneEdits).filter(
    (sku) => !isPersonSku(catalog, sku)
  );
}

export { applySceneEdits, computeScenePlan };
