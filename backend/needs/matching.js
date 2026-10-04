function criteriaFor(catalog, needId) {
  const needs = catalog?.draft?.needs ?? [];
  const need = needs.find((item) => item && item.id === needId);
  return need?.criteria ?? null;
}

function resolveNeed(catalog, needId) {
  const criteria = criteriaFor(catalog, needId);
  if (!criteria) return null;

  const products = catalog?.draft?.products ?? [];
  let matches = products.filter((product) => product.type === criteria.type);

  if (criteria.minWidth != null) {
    matches = matches.filter((product) => (product.dimensions?.width ?? 0) >= criteria.minWidth);
  }

  if (matches.length === 0) return null;

  let best = matches[0];
  for (const product of matches) {
    const width = product.dimensions?.width ?? Infinity;
    const bestWidth = best.dimensions?.width ?? Infinity;
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
