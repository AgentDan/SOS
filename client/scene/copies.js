function overlaps(center, width, otherCenter, otherWidth) {
  const half = width / 2;
  const otherHalf = otherWidth / 2;
  return center - half < otherCenter + otherHalf && otherCenter - otherHalf < center + half;
}

function sortedSpread(count, first, last) {
  if (count === 1) return [(first + last) / 2];
  const step = (last - first) / (count - 1);
  const xs = [];
  for (let i = 0; i < count; i += 1) xs.push(first + i * step);
  xs.sort((left, right) => left - right);
  return xs;
}

function centersInInterval(start, end, count, itemWidth) {
  const first = start + itemWidth / 2;
  const last = end - itemWidth / 2;
  return sortedSpread(count, first, last);
}

function collapsed(xs) {
  if (xs.length <= 1) return false;
  return Math.max(...xs) - Math.min(...xs) < 1e-6;
}

function edgeSpread(count, span) {
  const step = span / count;
  const first = -span / 2 + step / 2;
  return sortedSpread(count, first, first + step * (count - 1));
}

function evenOnHost(count, itemWidth, hostWidth) {
  if (Number.isFinite(hostWidth) && hostWidth > 0 && Number.isFinite(itemWidth) && itemWidth > 0) {
    const xs = centersInInterval(-hostWidth / 2, hostWidth / 2, count, itemWidth);
    if (!collapsed(xs)) return xs;
  }
  const span =
    Number.isFinite(hostWidth) && hostWidth > 0
      ? hostWidth
      : Number.isFinite(itemWidth) && itemWidth > 0
        ? itemWidth
        : count;
  return edgeSpread(count, span);
}

function subtractInterval(gaps, start, end) {
  if (!(end > start)) return gaps;
  const next = [];
  for (const [left, right] of gaps) {
    if (end <= left || start >= right) {
      next.push([left, right]);
      continue;
    }
    if (start > left) next.push([left, Math.min(start, right)]);
    if (end < right) next.push([Math.max(end, left), right]);
  }
  return next;
}

function blocksOf(occupied) {
  const blocks = [];
  for (const item of Array.isArray(occupied) ? occupied : []) {
    const x = Number(item?.x);
    const width = Number(item?.width);
    if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) continue;
    blocks.push({ x, width });
  }
  return blocks;
}

function hits(xs, itemWidth, blocks) {
  return xs.some((x) => blocks.some((item) => overlaps(x, itemWidth, item.x, item.width)));
}

function placeInGaps(count, itemWidth, hostWidth, blocks) {
  let gaps = [[-hostWidth / 2, hostWidth / 2]];
  for (const item of blocks) {
    gaps = subtractInterval(gaps, item.x - item.width / 2, item.x + item.width / 2);
  }
  gaps = gaps.filter((gap) => gap[1] - gap[0] >= itemWidth - 1e-6);
  const caps = gaps.map((gap) => Math.floor((gap[1] - gap[0]) / itemWidth + 1e-9));
  if (caps.reduce((sum, cap) => sum + cap, 0) < count) return null;

  const counts = caps.map(() => 0);
  const fitAll = caps.findIndex((cap) => cap >= count);
  if (fitAll >= 0) {
    counts[fitAll] = count;
  } else {
    let left = count;
    for (let i = 0; i < caps.length && left > 0; i += 1) {
      counts[i] = Math.min(caps[i], left);
      left -= counts[i];
    }
  }

  const xs = [];
  gaps.forEach((gap, index) => {
    if (counts[index] <= 0) return;
    xs.push(...centersInInterval(gap[0], gap[1], counts[index], itemWidth));
  });
  xs.sort((left, right) => left - right);
  return xs.length === count && !collapsed(xs) ? xs : null;
}

// x in millimetres, relative to the host center. count 1 keeps the placement offset.
// Larger groups sit on [-L/2, L/2], L = hostWidth - itemWidth. Occupied spots
// (other sku, or a copy the user dragged) push the group into a free gap.
function layoutCopyXs({ count, itemWidth, hostWidth, offsetX = 0, occupied = [] } = {}) {
  const copies = Number(count);
  if (!Number.isInteger(copies) || copies <= 0) return [];
  const origin = Number.isFinite(Number(offsetX)) ? Number(offsetX) : 0;
  const width = Number(itemWidth);
  const host = Number(hostWidth);
  const blocks = blocksOf(occupied);
  if (copies === 1) return [origin];
  const base = evenOnHost(copies, width, host);
  if (
    blocks.length === 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(host) ||
    host <= 0 ||
    !hits(base, width, blocks)
  ) {
    return base;
  }
  return placeInGaps(copies, width, host, blocks) ?? base;
}

export { layoutCopyXs };
