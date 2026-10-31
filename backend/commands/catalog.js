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

export { catalogProducts, catalogTypes, findProduct, findType };
