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

function applySceneEdits(skus, edits) {
  let next = uniqueSkus(Array.isArray(skus) ? skus : []);
  if (!Array.isArray(edits)) return next;

  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    if (edit.op === "add") {
      next = uniqueSkus([...next, edit.sku]);
    } else if (edit.op === "remove") {
      next = next.filter((sku) => sku !== edit.sku);
    } else if (edit.op === "replace") {
      const index = next.indexOf(edit.sku);
      if (index === -1) continue;
      const replaced = next.slice();
      replaced[index] = edit.withSku;
      next = uniqueSkus(replaced);
    }
  }

  return next;
}

function computeScenePlan(catalog, profile) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  const anchored = products
    .filter((product) => product?.alwaysPresent === true)
    .map((product) => product.sku);

  const needs = Array.isArray(profile?.needs) ? profile.needs : [];
  const resolved = needs.map((need) => need?.resolvedSku).filter((sku) => sku != null);

  return applySceneEdits([...new Set([...anchored, ...resolved])], profile?.sceneEdits);
}

export { applySceneEdits, computeScenePlan };
