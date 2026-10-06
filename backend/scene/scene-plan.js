function computeScenePlan(catalog, profile) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  const anchored = products
    .filter((product) => product?.alwaysPresent === true)
    .map((product) => product.sku);

  const needs = Array.isArray(profile?.needs) ? profile.needs : [];
  const resolved = needs.map((need) => need?.resolvedSku).filter((sku) => sku != null);

  return [...new Set([...anchored, ...resolved])];
}

export { computeScenePlan };
