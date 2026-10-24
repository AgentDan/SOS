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

function dependentTypeIds(catalog, typeId) {
  const ids = [];
  for (const type of catalogTypes(catalog)) {
    if (!type || !Array.isArray(type.canHostOn) || typeof type.id !== "string") continue;
    if (type.canHostOn.includes(typeId)) ids.push(type.id);
  }
  return ids;
}

function isLastOfType(sku, catalog, sceneSkus) {
  const typeId = findProduct(catalog, sku)?.type;
  if (typeof typeId !== "string" || typeId.length === 0) return false;
  let count = 0;
  for (const item of sceneSkus) {
    if (findProduct(catalog, item)?.type === typeId) count += 1;
  }
  return count <= 1;
}

function hostedSkus(sku, catalog, sceneSkus, useTypes) {
  const typeId = findProduct(catalog, sku)?.type;
  const dependent = new Set(
    useTypes && typeof typeId === "string" && isLastOfType(sku, catalog, sceneSkus)
      ? dependentTypeIds(catalog, typeId)
      : []
  );
  const hosted = [];
  for (const item of sceneSkus) {
    const product = findProduct(catalog, item);
    if (!product) continue;
    if (product.placement?.hostSku === sku || dependent.has(product.type)) hosted.push(item);
  }
  return hosted;
}

function resolveTarget(sku, sceneSkus, catalog) {
  if (sceneSkus.includes(sku)) return sku;
  const product = findProduct(catalog, sku);
  if (!product) return null;
  return sceneSkus.find((item) => findProduct(catalog, item)?.type === product.type) ?? null;
}

function isProtected(sku, catalog, sceneSkus, options) {
  const product = findProduct(catalog, sku);
  const useTypes = !options || options.types !== false;
  const hosted = hostedSkus(sku, catalog, sceneSkus, useTypes);
  const copies = sceneSkus.filter((item) => item === sku).length;
  return {
    blocked: copies <= 1 && (product?.alwaysPresent === true || hosted.length > 0),
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

function firstReplacement(catalog, typeId, target) {
  return catalogProducts(catalog).find(
    (product) => product?.sku && product.type === typeId && product.sku !== target
  );
}

export {
  findProduct,
  resolveTarget,
  isProtected,
  typeAtMax,
  firstReplacement
};
