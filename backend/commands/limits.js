function catalogLayer(catalog) {
  if (catalog && (Array.isArray(catalog.products) || Array.isArray(catalog.types))) return catalog;
  if (catalog?.draft) return catalog.draft;
  return catalog ?? {};
}

function catalogProducts(catalog) {
  const products = catalogLayer(catalog).products;
  return Array.isArray(products) ? products : [];
}

function catalogTypes(catalog) {
  const types = catalogLayer(catalog).types;
  return Array.isArray(types) ? types : [];
}

function findProduct(catalog, sku) {
  return catalogProducts(catalog).find((product) => product?.sku === sku);
}

function findType(catalog, typeId) {
  return catalogTypes(catalog).find((type) => type?.id === typeId);
}

function hostedSkus(sku, catalog, sceneSkus) {
  return sceneSkus.filter((item) => findProduct(catalog, item)?.placement?.hostSku === sku);
}

function resolveTarget(sku, sceneSkus, catalog) {
  if (sceneSkus.includes(sku)) return sku;
  const product = findProduct(catalog, sku);
  if (!product) return null;
  return sceneSkus.find((item) => findProduct(catalog, item)?.type === product.type) ?? null;
}

function isProtected(sku, catalog, sceneSkus) {
  const product = findProduct(catalog, sku);
  const hosted = hostedSkus(sku, catalog, sceneSkus);
  return {
    blocked: product?.alwaysPresent === true || hosted.length > 0,
    hosted
  };
}

function typeCount(sceneSkus, catalog, typeId) {
  return sceneSkus.filter((item) => findProduct(catalog, item)?.type === typeId).length;
}

function typeAtMax(sceneSkus, catalog, typeId) {
  const type = findType(catalog, typeId);
  if (!type || !Number.isInteger(type.maxOnScene)) return null;
  if (typeCount(sceneSkus, catalog, typeId) >= type.maxOnScene) {
    return { type: typeId, max: type.maxOnScene };
  }
  return null;
}

function sceneAtMax(sceneSkus, limits) {
  const max = limits?.maxItems;
  if (!Number.isInteger(max) || max < 1) return null;
  if (sceneSkus.length >= max) return { max };
  return null;
}

function firstReplacement(catalog, typeId, sceneSkus) {
  return catalogProducts(catalog).find(
    (product) => product?.sku && product.type === typeId && !sceneSkus.includes(product.sku)
  );
}

export {
  catalogLayer,
  catalogProducts,
  findProduct,
  hostedSkus,
  resolveTarget,
  isProtected,
  typeAtMax,
  sceneAtMax,
  firstReplacement
};
