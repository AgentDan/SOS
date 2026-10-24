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

function widthOf(product) {
  const width = product?.dimensions?.width;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null;
  return width;
}

function gapOf(type, field) {
  const value = type?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function listSkus(sceneSkus) {
  return Array.isArray(sceneSkus) ? sceneSkus : [];
}

function withoutOne(skus, sku) {
  const index = skus.indexOf(sku);
  if (index === -1) return skus.slice();
  return skus.slice(0, index).concat(skus.slice(index + 1));
}

function replaceOne(skus, fromSku, toSku) {
  const index = skus.indexOf(fromSku);
  if (index === -1) return skus.concat(toSku);
  const next = skus.slice();
  next[index] = toSku;
  return next;
}

function withoutListed(skus, removeSkus) {
  const next = skus.slice();
  for (const sku of removeSkus) {
    const index = next.indexOf(sku);
    if (index !== -1) next.splice(index, 1);
  }
  return next;
}

function hostOnScene(catalog, sceneSkus, canHostOn) {
  const allowed = new Set(canHostOn);
  for (const sku of sceneSkus) {
    const typeId = findProduct(catalog, sku)?.type;
    if (allowed.has(typeId)) return sku;
  }
  return null;
}

function occupied(widths, gap) {
  if (widths.length === 0) return 0;
  let sum = 0;
  for (const width of widths) sum += width;
  return sum + gap * (widths.length - 1);
}

function rowFits(usable, gap, widths, newWidth) {
  const extraGap = widths.length > 0 ? gap : 0;
  return usable >= occupied(widths, gap) + extraGap + newWidth;
}

function howManyFit(usable, gap, itemWidth) {
  if (!(itemWidth > 0)) return 0;
  const widths = [];
  while (rowFits(usable, gap, widths, itemWidth)) widths.push(itemWidth);
  return widths.length;
}

function rowItems(catalog, sceneSkus, rowTypes) {
  const allowed = new Set(rowTypes);
  const widths = [];
  let inRow = 0;
  for (const sku of sceneSkus) {
    const product = findProduct(catalog, sku);
    if (!allowed.has(product?.type)) continue;
    inRow += 1;
    const width = widthOf(product);
    if (width === null) return { inRow, widths: null };
    widths.push(width);
  }
  return { inRow, widths };
}

function refuse(reasonCode, facts, sku) {
  return { ok: false, reasonCode, facts, sku };
}

function canPlace({ catalog, sceneSkus, sku }) {
  const skus = listSkus(sceneSkus);
  const product = findProduct(catalog, sku);
  const type = findType(catalog, product?.type);
  const canHostOn = type?.canHostOn;
  if (!Array.isArray(canHostOn) || canHostOn.length === 0) return { ok: true };

  const hostSku = hostOnScene(catalog, skus, canHostOn);
  if (!hostSku) return refuse("no_host", {}, sku);

  const host = findProduct(catalog, hostSku);
  const hostType = findType(catalog, host?.type);
  const rowTypes = hostType?.rowTypes;
  if (!Array.isArray(rowTypes) || !rowTypes.includes(product.type)) return { ok: true };

  const gap = gapOf(hostType, "rowGapMm");
  const edge = gapOf(hostType, "edgeMarginMm");
  const hostWidth = widthOf(host);
  const itemWidth = widthOf(product);
  const row = rowItems(catalog, skus, rowTypes);
  const usable = hostWidth === null ? 0 : hostWidth - 2 * edge;
  const fits = itemWidth === null || hostWidth === null ? 0 : howManyFit(usable, gap, itemWidth);
  const facts = { hostSku, inRow: row.inRow, fits };
  if (hostWidth === null || itemWidth === null || row.widths === null) return refuse("host_full", facts, sku);
  if (!rowFits(usable, gap, row.widths, itemWidth)) return refuse("host_full", facts, sku);
  return { ok: true };
}

function rowCargo(catalog, hostSku, sceneSkus) {
  const hostType = findType(catalog, findProduct(catalog, hostSku)?.type);
  const rowTypes = hostType?.rowTypes;
  if (!Array.isArray(rowTypes) || rowTypes.length === 0) return [];
  const allowed = new Set(rowTypes);
  return sceneSkus.filter((sku) => allowed.has(findProduct(catalog, sku)?.type));
}

function canReplace({ catalog, sceneSkus, sku, withSku }) {
  const skus = listSkus(sceneSkus);
  const remaining = withoutOne(skus, sku);
  const placed = canPlace({ catalog, sceneSkus: remaining, sku: withSku });
  if (!placed.ok) return { ...placed, sku: placed.sku ?? withSku };

  const cargo = rowCargo(catalog, sku, skus);
  if (cargo.length === 0) return { ok: true };

  let virtual = withoutListed(replaceOne(skus, sku, withSku), cargo);
  for (const item of cargo) {
    const check = canPlace({ catalog, sceneSkus: virtual, sku: item });
    if (!check.ok) return { ...check, sku: check.sku ?? item };
    virtual = virtual.concat(item);
  }
  return { ok: true };
}

export { canPlace, canReplace };
