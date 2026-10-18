const STEP_MM = 50;

function overlaps(center, width, otherCenter, otherWidth) {
  const half = width / 2;
  const otherHalf = otherWidth / 2;
  return center - half < otherCenter + otherHalf && otherCenter - otherHalf < center + half;
}

function chooseCopyX({ offsetX, itemWidth, hostWidth, occupied }) {
  const span = hostWidth - itemWidth;
  if (!Number.isFinite(span) || span < 0) return offsetX;
  const steps = Math.floor(span / 2 / STEP_MM + 1e-9);
  const candidates = [];
  for (let step = -steps; step <= steps; step += 1) candidates.push(step * STEP_MM);
  candidates.sort((left, right) => {
    const distance = Math.abs(left - offsetX) - Math.abs(right - offsetX);
    if (distance !== 0) return distance;
    return left - right;
  });
  const taken = Array.isArray(occupied) ? occupied : [];
  for (const x of candidates) {
    const blocked = taken.some((item) => overlaps(x, itemWidth, item.x, item.width));
    if (!blocked) return x;
  }
  return offsetX;
}

function copyOffsetX(copy, options) {
  const offsetX = options?.offsetX ?? 0;
  if (!(copy > 1)) return offsetX;
  return chooseCopyX({ ...options, offsetX });
}

export { copyOffsetX };
