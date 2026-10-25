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

function optionalMm(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function sizeOf(product, key) {
  return positive(product?.dimensions?.[key]);
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === "string" && id.length > 0);
}

function listedIds(types, field) {
  const ids = new Set();
  for (const type of types.values()) {
    for (const id of idList(type?.[field])) ids.add(id);
  }
  return ids;
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

function occupied(widths, gap) {
  if (widths.length === 0) return 0;
  let sum = 0;
  for (const width of widths) sum += width;
  return sum + gap * Math.max(0, widths.length - 1);
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

function layout({ catalog, skus, hand } = {}) {
  const layer = catalogLayer(catalog);
  const products = indexBy(layer.products, "sku");
  const types = indexBy(layer.types, "id");
  const list = Array.isArray(skus) ? skus.slice() : [];
  const sign = hand === "left" ? -1 : 1;

  function productOf(sku) {
    return typeof sku === "string" ? products.get(sku) : undefined;
  }

  const legsIndex = list.findIndex((sku) => productOf(sku)?.type === "desk_legs");
  const topIndex = list.findIndex((sku) => productOf(sku)?.type === "desk_top");
  const top = topIndex === -1 ? undefined : productOf(list[topIndex]);
  const topType = top ? types.get(top.type) : undefined;
  const rowTypes = new Set(idList(topType?.rowTypes));
  const listedRowTypes = listedIds(types, "rowTypes");
  const frontIds = top ? new Set(idList(topType?.frontTypes)) : listedIds(types, "frontTypes");
  const flankIds = top ? new Set(idList(topType?.flankTypes)) : listedIds(types, "flankTypes");

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
  const topWidth = top ? sizeOf(top, "width") : null;
  const gap = nonNegative(topType?.rowGapMm);
  const edge = nonNegative(topType?.edgeMarginMm);
  const back = nonNegative(topType?.rowBackMarginMm);
  const frontMargin = optionalMm(topType?.frontMarginMm);
  const accessoryGap = optionalMm(topType?.accessoryGapMm);
  const surfaceY = topY + topHeight;

  const row = [];
  const flanks = [];
  const keyboards = [];
  const mice = [];
  if (top) {
    for (let index = 0; index < list.length; index += 1) {
      if (index === legsIndex || index === topIndex) continue;
      const product = productOf(list[index]);
      const typeId = product?.type;
      const width = sizeOf(product, "width");
      const depth = sizeOf(product, "depth");
      const item = { index, sku: list[index], width, depth };
      if (isRowItem(typeId)) {
        if (width === null || depth === null) continue;
        row.push(item);
        continue;
      }
      if (typeId === "speaker" && flankIds.has(typeId)) flanks.push(item);
      else if (typeId === "keyboard" && frontIds.has(typeId)) keyboards.push(item);
      else if (typeId === "mouse" && frontIds.has(typeId)) mice.push(item);
    }
  }

  const { xs, total } = centers(
    row.map((item) => item.width),
    gap
  );
  const usable = topWidth === null ? 0 : topWidth - 2 * edge;
  const overflow = top && row.length > 0 && total > usable;

  let leftEdge = null;
  let rightEdge = null;
  for (let index = 0; index < row.length; index += 1) {
    const edgeLeft = xs[index] - row[index].width / 2;
    const edgeRight = xs[index] + row[index].width / 2;
    leftEdge = leftEdge === null ? edgeLeft : Math.min(leftEdge, edgeLeft);
    rightEdge = rightEdge === null ? edgeRight : Math.max(rightEdge, edgeRight);
  }
  const rowCenter = leftEdge === null ? 0 : (leftEdge + rightEdge) / 2;

  const speakerSpots = new Map();
  const measurable = flanks.filter((item) => item.width !== null && item.depth !== null);
  const group = measurable.slice(0, 2);
  const besideMonitors = row.length > 0;
  const speakersFit =
    group.length === 0 ||
    (topWidth !== null &&
      (!besideMonitors || accessoryGap !== null) &&
      rowAccepted(
        topWidth,
        edge,
        row.map((item) => item.width),
        group.map((item) => item.width),
        gap,
        accessoryGap ?? 0
      ));
  for (const item of flanks) {
    if (item.width === null || item.depth === null) {
      speakerSpots.set(item.index, { reason: "no_layout_rule" });
      continue;
    }
    if (!group.includes(item)) {
      speakerSpots.set(item.index, { reason: "no_layout_rule" });
      continue;
    }
    if (!speakersFit) {
      const reason = besideMonitors && accessoryGap === null ? "no_layout_rule" : "row_overflow";
      speakerSpots.set(item.index, { reason });
      continue;
    }
    const order = group.indexOf(item);
    let x;
    if (!besideMonitors) {
      x = order === 0 ? -300 : 300;
    } else if (order === 0) {
      x = leftEdge - accessoryGap - item.width / 2;
    } else {
      x = rightEdge + accessoryGap + item.width / 2;
    }
    speakerSpots.set(item.index, {
      place: { sku: item.sku, x, y: surfaceY, z: -topDepth / 2 + back + item.depth / 2, rotY: 0 }
    });
  }

  let keyboardPlace = null;
  if (frontMargin !== null && keyboards.length > 0) {
    const item = keyboards.find((entry) => entry.width !== null && entry.depth !== null);
    if (item) {
      keyboardPlace = {
        index: item.index,
        place: {
          sku: item.sku,
          x: rowCenter,
          y: surfaceY,
          z: topDepth / 2 - frontMargin - item.depth / 2,
          rotY: 0
        },
        width: item.width
      };
    }
  }

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
        y: surfaceY,
        z: -topDepth / 2 + back + item.depth / 2,
        rotY: 0
      });
      if (overflow) issues.push({ sku, code: "row_overflow" });
      continue;
    }
    if (typeId === "keyboard" && frontIds.has(typeId)) {
      if (!top) {
        issues.push({ sku, code: "no_host" });
        continue;
      }
      if (!keyboardPlace || keyboardPlace.index !== index) {
        issues.push({ sku, code: "no_layout_rule" });
        continue;
      }
      placements.push(keyboardPlace.place);
      continue;
    }
    if (typeId === "mouse" && frontIds.has(typeId)) {
      if (!top) {
        issues.push({ sku, code: "no_host" });
        continue;
      }
      const width = sizeOf(product, "width");
      const depth = sizeOf(product, "depth");
      const firstMouse = mice.find((entry) => entry.width !== null && entry.depth !== null);
      if (width === null || depth === null || !firstMouse || firstMouse.index !== index || frontMargin === null) {
        issues.push({ sku, code: "no_layout_rule" });
        continue;
      }
      let x;
      let z;
      if (keyboardPlace) {
        if (accessoryGap === null) {
          issues.push({ sku, code: "no_layout_rule" });
          continue;
        }
        x = keyboardPlace.place.x + sign * (keyboardPlace.width / 2 + accessoryGap + width / 2);
        z = keyboardPlace.place.z;
      } else {
        x = rowCenter + sign * 150;
        z = topDepth / 2 - frontMargin - depth / 2;
      }
      placements.push({ sku, x, y: surfaceY, z, rotY: 0 });
      continue;
    }
    if (typeId === "speaker" && flankIds.has(typeId)) {
      if (!top) {
        issues.push({ sku, code: "no_host" });
        continue;
      }
      const planned = speakerSpots.get(index);
      if (!planned || !planned.place) {
        issues.push({ sku, code: planned?.reason ?? "no_layout_rule" });
        continue;
      }
      placements.push(planned.place);
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
