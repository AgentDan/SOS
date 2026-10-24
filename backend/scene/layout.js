function catalogLayer(catalog) {
  if (catalog && (Array.isArray(catalog.products) || Array.isArray(catalog.types))) return catalog;
  if (catalog?.draft) return catalog.draft;
  return catalog ?? {};
}

function indexBy(items, key) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    const id = item?.[key];
    if (typeof id === "string" && id.length > 0 && !map.has(id)) map.set(id, item);
  }
  return map;
}

function positive(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

function nonNegative(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function sizeOf(product, key) {
  return positive(product?.dimensions?.[key]);
}

function centers(widths, gap) {
  let total = 0;
  for (const width of widths) total += width;
  if (widths.length > 1) total += gap * (widths.length - 1);
  let cursor = -total / 2;
  const xs = [];
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index];
    xs.push(cursor + width / 2);
    cursor += width;
    if (index < widths.length - 1) cursor += gap;
  }
  return { xs, total };
}

function layout({ catalog, skus } = {}) {
  const layer = catalogLayer(catalog);
  const products = indexBy(layer.products, "sku");
  const types = indexBy(layer.types, "id");
  const list = Array.isArray(skus) ? skus.slice() : [];

  function productOf(sku) {
    return typeof sku === "string" ? products.get(sku) : undefined;
  }

  const legsIndex = list.findIndex((sku) => productOf(sku)?.type === "desk_legs");
  const topIndex = list.findIndex((sku) => productOf(sku)?.type === "desk_top");
  const top = topIndex === -1 ? undefined : productOf(list[topIndex]);
  const topType = top ? types.get(top.type) : undefined;
  const rowTypes = new Set(Array.isArray(topType?.rowTypes) ? topType.rowTypes : []);
  const listedRowTypes = new Set();
  for (const type of types.values()) {
    if (!Array.isArray(type?.rowTypes)) continue;
    for (const typeId of type.rowTypes) {
      if (typeof typeId === "string" && typeId.length > 0) listedRowTypes.add(typeId);
    }
  }

  function isRowItem(typeId) {
    if (typeof typeId !== "string" || typeId.length === 0) return false;
    if (top) return rowTypes.has(typeId);
    return typeId === "monitor" || listedRowTypes.has(typeId);
  }

  const legs = legsIndex === -1 ? undefined : productOf(list[legsIndex]);
  const legsHeight = legs ? (sizeOf(legs, "height") ?? 0) : 0;
  const topY = legs ? legsHeight : 0;
  const topHeight = top ? (sizeOf(top, "height") ?? 0) : 0;
  const topDepth = top ? (sizeOf(top, "depth") ?? 0) : 0;
  const topWidth = top ? (sizeOf(top, "width") ?? 0) : 0;
  const gap = nonNegative(topType?.rowGapMm);
  const edge = nonNegative(topType?.edgeMarginMm);
  const back = nonNegative(topType?.rowBackMarginMm);

  const row = [];
  if (top) {
    for (let index = 0; index < list.length; index += 1) {
      if (index === legsIndex || index === topIndex) continue;
      const product = productOf(list[index]);
      if (!isRowItem(product?.type)) continue;
      const width = sizeOf(product, "width");
      const depth = sizeOf(product, "depth");
      if (width === null || depth === null) continue;
      row.push({ sku: list[index], width, depth });
    }
  }

  const { xs, total } = centers(
    row.map((item) => item.width),
    gap
  );
  const usable = topWidth - 2 * edge;
  const overflow = top && row.length > 0 && total > usable;
  let rowCursor = 0;
  let chairSeen = false;
  const placements = [];
  const issues = [];

  for (let index = 0; index < list.length; index += 1) {
    const sku = list[index];
    const product = productOf(sku);
    const typeId = product?.type;

    if (index === legsIndex) {
      placements.push({ sku, x: 0, y: 0, z: 0, rotY: 0 });
      continue;
    }
    if (index === topIndex) {
      placements.push({ sku, x: 0, y: topY, z: 0, rotY: 0 });
      continue;
    }
    if (isRowItem(typeId)) {
      if (!top) {
        issues.push({ sku, code: "no_host" });
        continue;
      }
      const width = sizeOf(product, "width");
      const depth = sizeOf(product, "depth");
      if (width === null || depth === null) {
        issues.push({ sku, code: "no_layout_rule" });
        continue;
      }
      const item = row[rowCursor];
      const x = xs[rowCursor];
      rowCursor += 1;
      placements.push({
        sku,
        x,
        y: topY + topHeight,
        z: -topDepth / 2 + back + item.depth / 2,
        rotY: 0
      });
      if (overflow) issues.push({ sku, code: "row_overflow" });
      continue;
    }
    if (typeId === "chair") {
      if (!chairSeen) {
        const z = product?.placement?.offset?.z;
        placements.push({
          sku,
          x: 0,
          y: 0,
          z: typeof z === "number" && Number.isFinite(z) ? z : 0,
          rotY: 180
        });
        chairSeen = true;
      } else {
        issues.push({ sku, code: "no_layout_rule" });
      }
      continue;
    }
    issues.push({ sku, code: "no_layout_rule" });
  }

  return { placements, issues };
}

export { layout };
