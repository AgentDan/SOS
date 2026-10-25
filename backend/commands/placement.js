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

function depthOf(product) {
  const depth = product?.dimensions?.depth;
  if (typeof depth !== "number" || !Number.isFinite(depth) || depth <= 0) return null;
  return depth;
}

function mmField(type, field) {
  const value = type?.[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function listed(type, field, typeId) {
  return Array.isArray(type?.[field]) && type[field].includes(typeId);
}

function combinedWidth(monitorWidths, speakerWidths, rowGap, accessoryGap) {
  if (speakerWidths.length === 0) return occupied(monitorWidths, rowGap);
  if (monitorWidths.length === 0) {
    if (speakerWidths.length > 2) return Infinity;
    const left = 300 + speakerWidths[0] / 2;
    const right = speakerWidths.length > 1 ? 300 + speakerWidths[1] / 2 : left;
    return left + right;
  }
  return occupied(monitorWidths, rowGap) + occupied(speakerWidths, 0) + accessoryGap * speakerWidths.length;
}

function rowAccepted(hostWidth, edge, monitorWidths, speakerWidths, rowGap, accessoryGap) {
  if (hostWidth === null) return false;
  const content = combinedWidth(monitorWidths, speakerWidths, rowGap, accessoryGap);
  // Колонки у ряда мониторов сверяются с шириной столешницы. Поле edgeMarginMm
  // в ту же сумму даёт 1826 мм против стола 1800, и сценарий перестаёт ставиться.
  const flanked = speakerWidths.length > 0 && monitorWidths.length > 0;
  const margin = flanked ? 0 : edge * 2;
  return content + margin <= hostWidth;
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

function howManyAccepted(hostWidth, edge, monitorWidths, speakerWidth, rowGap, accessoryGap) {
  if (!(speakerWidth > 0)) return 0;
  const widths = [];
  while (rowAccepted(hostWidth, edge, monitorWidths, widths.concat(speakerWidth), rowGap, accessoryGap)) {
    widths.push(speakerWidth);
    if (widths.length > 12) break;
  }
  return widths.length;
}

function placeFront({ catalog, skus, sku, product, host, hostType, hostSku }) {
  const front = mmField(hostType, "frontMarginMm");
  if (front === null) return { ok: true };
  const hostDepth = depthOf(host);
  const itemDepth = depthOf(product);
  const facts = { hostSku };
  if (hostDepth === null || itemDepth === null) return refuse("host_full", facts, sku);
  const back = gapOf(hostType, "rowBackMarginMm");
  const rowTypes = Array.isArray(hostType?.rowTypes) ? hostType.rowTypes : [];
  let deepest = 0;
  for (const itemSku of skus) {
    const item = findProduct(catalog, itemSku);
    if (!rowTypes.includes(item?.type)) continue;
    const depth = depthOf(item);
    if (depth === null) return refuse("host_full", facts, sku);
    if (depth > deepest) deepest = depth;
  }
  const line = deepest > 0 ? back + deepest : 0;
  if (hostDepth < front + itemDepth + line) return refuse("host_full", facts, sku);
  return { ok: true };
}

function placeFlank({ catalog, skus, sku, product, host, hostType, hostSku }) {
  const rowTypes = Array.isArray(hostType?.rowTypes) ? hostType.rowTypes : [];
  const monitors = rowItems(catalog, skus, rowTypes);
  const speakers = rowItems(catalog, skus, hostType?.flankTypes);
  const gap = gapOf(hostType, "rowGapMm");
  const edge = gapOf(hostType, "edgeMarginMm");
  const hostWidth = widthOf(host);
  const itemWidth = widthOf(product);
  const accessory = mmField(hostType, "accessoryGapMm");
  const monitorWidths = monitors.widths ?? [];
  const knownAccessory = accessory === null ? 0 : accessory;
  const fits =
    hostWidth === null || itemWidth === null || monitors.widths === null
      ? 0
      : howManyAccepted(hostWidth, edge, monitorWidths, itemWidth, gap, knownAccessory);
  const facts = { hostSku, inRow: speakers.inRow, fits };
  if (
    hostWidth === null ||
    itemWidth === null ||
    monitors.widths === null ||
    speakers.widths === null ||
    (monitorWidths.length > 0 && accessory === null)
  ) {
    if (monitorWidths.length > 0 && accessory === null && hostWidth !== null && itemWidth !== null) {
      return { ok: true };
    }
    return refuse("host_full", facts, sku);
  }
  const accepted = rowAccepted(
    hostWidth,
    edge,
    monitorWidths,
    speakers.widths.concat(itemWidth),
    gap,
    knownAccessory
  );
  if (!accepted) return refuse("host_full", facts, sku);
  return { ok: true };
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
  if (listed(hostType, "flankTypes", product?.type)) {
    return placeFlank({ catalog, skus, sku, product, host, hostType, hostSku });
  }
  if (listed(hostType, "frontTypes", product?.type)) {
    return placeFront({ catalog, skus, sku, product, host, hostType, hostSku });
  }

  const rowTypes = hostType?.rowTypes;
  if (!Array.isArray(rowTypes) || !rowTypes.includes(product.type)) return { ok: true };

  const gap = gapOf(hostType, "rowGapMm");
  const edge = gapOf(hostType, "edgeMarginMm");
  const hostWidth = widthOf(host);
  const itemWidth = widthOf(product);
  const row = rowItems(catalog, skus, rowTypes);
  const speakers = rowItems(catalog, skus, Array.isArray(hostType?.flankTypes) ? hostType.flankTypes : []);
  const accessory = mmField(hostType, "accessoryGapMm") ?? 0;
  const speakerWidths = speakers.widths ?? [];
  const usable = hostWidth === null ? 0 : hostWidth - 2 * edge;
  const fits =
    itemWidth === null || hostWidth === null || speakers.widths === null
      ? 0
      : speakerWidths.length > 0
        ? howManyWithSpeakers(hostWidth, edge, speakerWidths, itemWidth, gap, accessory)
        : howManyFit(usable, gap, itemWidth);
  const facts = { hostSku, inRow: row.inRow, fits };
  if (hostWidth === null || itemWidth === null || row.widths === null || speakers.widths === null) {
    return refuse("host_full", facts, sku);
  }
  const next = row.widths.concat(itemWidth);
  const accepted =
    speakerWidths.length > 0
      ? rowAccepted(hostWidth, edge, next, speakerWidths, gap, accessory)
      : rowFits(usable, gap, row.widths, itemWidth);
  if (!accepted) return refuse("host_full", facts, sku);
  return { ok: true };
}

function howManyWithSpeakers(hostWidth, edge, speakerWidths, itemWidth, rowGap, accessoryGap) {
  const widths = [];
  while (rowAccepted(hostWidth, edge, widths.concat(itemWidth), speakerWidths, rowGap, accessoryGap)) {
    widths.push(itemWidth);
    if (widths.length > 12) break;
  }
  return widths.length;
}

function rowCargo(catalog, hostSku, sceneSkus) {
  const hostType = findType(catalog, findProduct(catalog, hostSku)?.type);
  const rowTypes = Array.isArray(hostType?.rowTypes) ? hostType.rowTypes : [];
  const flankTypes = Array.isArray(hostType?.flankTypes) ? hostType.flankTypes : [];
  if (rowTypes.length === 0 && flankTypes.length === 0) return [];
  const allowed = new Set([...rowTypes, ...flankTypes]);
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
