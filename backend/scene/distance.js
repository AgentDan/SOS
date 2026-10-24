function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readBox(item) {
  if (item === null || typeof item !== "object") {
    throw new Error("Неизвестные размеры предмета");
  }
  const placement = item.placement && typeof item.placement === "object" ? item.placement : item;
  const dimensions =
    item.dimensions && typeof item.dimensions === "object" ? item.dimensions : placement.dimensions;
  const width = dimensions?.width;
  const height = dimensions?.height;
  const depth = dimensions?.depth;
  if (!finite(width) || !finite(height) || !finite(depth) || width <= 0 || height <= 0 || depth <= 0) {
    throw new Error("Неизвестные размеры предмета");
  }
  if (!finite(placement.x) || !finite(placement.y) || !finite(placement.z)) {
    throw new Error("Неизвестное положение предмета");
  }
  const rotY = placement.rotY === undefined ? 0 : placement.rotY;
  if (!finite(rotY)) throw new Error("Неизвестное положение предмета");

  const turns = ((rotY % 360) + 360) % 360;
  const swap = turns === 90 || turns === 270;
  const spanX = swap ? depth : width;
  const spanZ = swap ? width : depth;
  return {
    x0: placement.x - spanX / 2,
    x1: placement.x + spanX / 2,
    y0: placement.y,
    y1: placement.y + height,
    z0: placement.z - spanZ / 2,
    z1: placement.z + spanZ / 2
  };
}

function axisGap(a0, a1, b0, b1) {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

function overlapDepth(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function gap(a, b) {
  const left = readBox(a);
  const right = readBox(b);
  const axes = {
    x: axisGap(left.x0, left.x1, right.x0, right.x1),
    y: axisGap(left.y0, left.y1, right.y0, right.y1),
    z: axisGap(left.z0, left.z1, right.z0, right.z1)
  };
  const overlap =
    overlapDepth(left.x0, left.x1, right.x0, right.x1) > 0 &&
    overlapDepth(left.y0, left.y1, right.y0, right.y1) > 0 &&
    overlapDepth(left.z0, left.z1, right.z0, right.z1) > 0;
  return { gapMm: Math.hypot(axes.x, axes.y, axes.z), overlap, axes };
}

function formatDistance(gapMm) {
  if (!finite(gapMm) || gapMm < 0) throw new Error("Неизвестное расстояние");
  if (gapMm === 0) return "0 см, они касаются";
  if (gapMm < 10) return "меньше 1 см";
  return `${Math.round(gapMm / 10)} см`;
}

export { gap, formatDistance };
