function widthOf(product) {
  const fromModel = product?.modelSizeMm?.width;
  if (typeof fromModel === "number" && Number.isFinite(fromModel) && fromModel > 0) return fromModel;
  const fromCard = product?.dimensions?.width;
  if (typeof fromCard === "number" && Number.isFinite(fromCard) && fromCard > 0) return fromCard;
  return null;
}

function criteriaFor(catalog, needId) {
  const needs = catalog?.needs ?? catalog?.draft?.needs ?? [];
  const need = needs.find((item) => item && item.id === needId);
  return need?.criteria ?? null;
}

function resolveNeed(catalog, needId) {
  const criteria = criteriaFor(catalog, needId);
  if (!criteria) return null;

  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  let matches = products.filter((product) => product.type === criteria.type && product.type !== "person");

  if (criteria.minWidth != null) {
    matches = matches.filter((product) => (widthOf(product) ?? 0) >= criteria.minWidth);
  }

  if (matches.length === 0) return null;

  let best = matches[0];
  for (const product of matches) {
    const width = widthOf(product) ?? Infinity;
    const bestWidth = widthOf(best) ?? Infinity;
    if (width < bestWidth) best = product;
  }

  return best.sku;
}

function runMatching(catalog, needs) {
  const list = Array.isArray(needs) ? needs : [];
  return list.map((need) => {
    if (need.resolvedSku != null) return { ...need };

    const resolvedSku = resolveNeed(catalog, need.id);
    if (resolvedSku == null) return { ...need };

    return { ...need, resolvedSku };
  });
}

export { resolveNeed, runMatching };
