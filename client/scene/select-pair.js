import { surfaceDistance } from "./surface-distance.js";

function instanceOrder(id) {
  const match = /#(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : 0;
}

function compareInstanceId(a, b) {
  const left = String(a);
  const right = String(b);
  const skuA = left.replace(/#\d+$/, "");
  const skuB = right.replace(/#\d+$/, "");
  if (skuA !== skuB) return skuA < skuB ? -1 : 1;
  return instanceOrder(left) - instanceOrder(right);
}

// Two objects: the first and second ids. More than two: the closest pair.
function selectPair(items) {
  const ready = (Array.isArray(items) ? items : []).filter(
    (item) => item && item.indices && item.indices.length >= 3 && item.vertices
  );
  if (ready.length < 2) return null;
  const ordered = ready.slice().sort((a, b) => compareInstanceId(a.id, b.id));
  let best = null;
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const result = surfaceDistance(
        ordered[i].vertices,
        ordered[i].indices,
        ordered[j].vertices,
        ordered[j].indices
      );
      if (!result) continue;
      if (!best || result.distanceMm < best.distanceMm) {
        best = {
          idA: ordered[i].id,
          idB: ordered[j].id,
          distanceMm: result.distanceMm,
          pointA: result.pointA,
          pointB: result.pointB
        };
      }
    }
  }
  return best;
}

export { selectPair, compareInstanceId };
