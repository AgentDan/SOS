// Shortest distance between two triangle sets.
// Vertices are world-space meters (position, rotation, and scale already applied).
// Points come back in those same meters; distanceMm is millimeters.
//
// Pairs whose AABB gap already exceeds the best distance are skipped.
// A binary AABB tree applies that same test to groups of triangles so a
// dense mesh does not compare every triangle with every other one.

const CONTACT_SQ = 1e-18;

function buildTriangles(vertices, indices) {
  const tris = [];
  if (!vertices || !indices) return tris;
  const count = (vertices.length / 3) | 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    if (ia < 0 || ib < 0 || ic < 0 || ia >= count || ib >= count || ic >= count) continue;
    const ax = vertices[ia * 3];
    const ay = vertices[ia * 3 + 1];
    const az = vertices[ia * 3 + 2];
    const bx = vertices[ib * 3];
    const by = vertices[ib * 3 + 1];
    const bz = vertices[ib * 3 + 2];
    const cx = vertices[ic * 3];
    const cy = vertices[ic * 3 + 1];
    const cz = vertices[ic * 3 + 2];
    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) continue;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-20) continue;
    tris.push({
      ax, ay, az, bx, by, bz, cx, cy, cz,
      minX: Math.min(ax, bx, cx),
      minY: Math.min(ay, by, cy),
      minZ: Math.min(az, bz, cz),
      maxX: Math.max(ax, bx, cx),
      maxY: Math.max(ay, by, cy),
      maxZ: Math.max(az, bz, cz),
      cx: (ax + bx + cx) / 3,
      cy: (ay + by + cy) / 3,
      cz: (az + bz + cz) / 3
    });
  }
  return tris;
}

function aabbGapSq(a, b) {
  const dx = a.minX > b.maxX ? a.minX - b.maxX : b.minX > a.maxX ? b.minX - a.maxX : 0;
  const dy = a.minY > b.maxY ? a.minY - b.maxY : b.minY > a.maxY ? b.minY - a.maxY : 0;
  const dz = a.minZ > b.maxZ ? a.minZ - b.maxZ : b.minZ > a.maxZ ? b.minZ - a.maxZ : 0;
  return dx * dx + dy * dy + dz * dz;
}

function boundsOf(tris, ids) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const id of ids) {
    const tri = tris[id];
    if (tri.minX < minX) minX = tri.minX;
    if (tri.minY < minY) minY = tri.minY;
    if (tri.minZ < minZ) minZ = tri.minZ;
    if (tri.maxX > maxX) maxX = tri.maxX;
    if (tri.maxY > maxY) maxY = tri.maxY;
    if (tri.maxZ > maxZ) maxZ = tri.maxZ;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function buildNode(tris, ids) {
  const box = boundsOf(tris, ids);
  if (ids.length <= 8) return { ...box, ids };
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const spanZ = box.maxZ - box.minZ;
  const axis = spanX >= spanY && spanX >= spanZ ? "cx" : spanY >= spanZ ? "cy" : "cz";
  const sorted = ids.slice().sort((i, j) => tris[i][axis] - tris[j][axis]);
  const mid = sorted.length >> 1;
  return {
    ...box,
    left: buildNode(tris, sorted.slice(0, mid)),
    right: buildNode(tris, sorted.slice(mid))
  };
}

function closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return { x: ax, y: ay, z: az };

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return { x: bx, y: by, z: bz };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const denom = d1 - d3;
    const v = denom > 1e-20 ? d1 / denom : 0;
    return { x: ax + abx * v, y: ay + aby * v, z: az + abz * v };
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return { x: cx, y: cy, z: cz };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const denom = d2 - d6;
    const w = denom > 1e-20 ? d2 / denom : 0;
    return { x: ax + acx * w, y: ay + acy * w, z: az + acz * w };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const denom = d4 - d3 + (d5 - d6);
    const w = denom > 1e-20 ? (d4 - d3) / denom : 0;
    return { x: bx + (cx - bx) * w, y: by + (cy - by) * w, z: bz + (cz - bz) * w };
  }

  const denom = va + vb + vc;
  const v = denom !== 0 ? vb / denom : 0;
  const w = denom !== 0 ? vc / denom : 0;
  return { x: ax + abx * v + acx * w, y: ay + aby * v + acy * w, z: az + abz * v + acz * w };
}

function closestSegments(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const eps = 1e-12;
  let s = 0;
  let t = 0;

  if (a <= eps && e <= eps) {
    s = 0;
    t = 0;
  } else if (a <= eps) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= eps) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > eps ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  return {
    sx: p1x + d1x * s,
    sy: p1y + d1y * s,
    sz: p1z + d1z * s,
    ex: p2x + d2x * t,
    ey: p2y + d2y * t,
    ez: p2z + d2z * t
  };
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function segmentHit(px, py, pz, qx, qy, qz, tri) {
  const dirx = qx - px;
  const diry = qy - py;
  const dirz = qz - pz;
  const e1x = tri.bx - tri.ax;
  const e1y = tri.by - tri.ay;
  const e1z = tri.bz - tri.az;
  const e2x = tri.cx - tri.ax;
  const e2y = tri.cy - tri.ay;
  const e2z = tri.cz - tri.az;
  const pxv = diry * e2z - dirz * e2y;
  const pyv = dirz * e2x - dirx * e2z;
  const pzv = dirx * e2y - diry * e2x;
  const det = e1x * pxv + e1y * pyv + e1z * pzv;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const tx = px - tri.ax;
  const ty = py - tri.ay;
  const tz = pz - tri.az;
  const u = (tx * pxv + ty * pyv + tz * pzv) * inv;
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const qx_ = ty * e1z - tz * e1y;
  const qy_ = tz * e1x - tx * e1z;
  const qz_ = tx * e1y - ty * e1x;
  const v = (dirx * qx_ + diry * qy_ + dirz * qz_) * inv;
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const t = (e2x * qx_ + e2y * qy_ + e2z * qz_) * inv;
  if (t < -1e-8 || t > 1 + 1e-8) return null;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: px + dirx * clamped, y: py + diry * clamped, z: pz + dirz * clamped };
}

function consider(best, distSq, ax, ay, az, bx, by, bz) {
  if (distSq < best.distSq) {
    best.distSq = distSq;
    best.ax = ax;
    best.ay = ay;
    best.az = az;
    best.bx = bx;
    best.by = by;
    best.bz = bz;
  }
}

function pointAgainst(best, px, py, pz, tri, pointOnB) {
  const hit = closestPointOnTriangle(px, py, pz, tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz);
  const dx = px - hit.x;
  const dy = py - hit.y;
  const dz = pz - hit.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (pointOnB) consider(best, distSq, hit.x, hit.y, hit.z, px, py, pz);
  else consider(best, distSq, px, py, pz, hit.x, hit.y, hit.z);
}

function edgeAgainst(best, p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z, segmentOnB) {
  const pair = closestSegments(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z);
  const dx = pair.sx - pair.ex;
  const dy = pair.sy - pair.ey;
  const dz = pair.sz - pair.ez;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (segmentOnB) consider(best, distSq, pair.ex, pair.ey, pair.ez, pair.sx, pair.sy, pair.sz);
  else consider(best, distSq, pair.sx, pair.sy, pair.sz, pair.ex, pair.ey, pair.ez);
}

function segmentAgainstTriangle(best, px, py, pz, qx, qy, qz, tri, segmentOnB) {
  const hit = segmentHit(px, py, pz, qx, qy, qz, tri);
  if (hit) {
    consider(best, 0, hit.x, hit.y, hit.z, hit.x, hit.y, hit.z);
    return;
  }
  pointAgainst(best, px, py, pz, tri, segmentOnB);
  pointAgainst(best, qx, qy, qz, tri, segmentOnB);
  edgeAgainst(best, px, py, pz, qx, qy, qz, tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz, segmentOnB);
  if (best.distSq <= CONTACT_SQ) return;
  edgeAgainst(best, px, py, pz, qx, qy, qz, tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz, segmentOnB);
  if (best.distSq <= CONTACT_SQ) return;
  edgeAgainst(best, px, py, pz, qx, qy, qz, tri.cx, tri.cy, tri.cz, tri.ax, tri.ay, tri.az, segmentOnB);
}

function triangleDistance(best, a, b) {
  segmentAgainstTriangle(best, a.ax, a.ay, a.az, a.bx, a.by, a.bz, b, false);
  if (best.distSq <= CONTACT_SQ) return;
  segmentAgainstTriangle(best, a.bx, a.by, a.bz, a.cx, a.cy, a.cz, b, false);
  if (best.distSq <= CONTACT_SQ) return;
  segmentAgainstTriangle(best, a.cx, a.cy, a.cz, a.ax, a.ay, a.az, b, false);
  if (best.distSq <= CONTACT_SQ) return;
  segmentAgainstTriangle(best, b.ax, b.ay, b.az, b.bx, b.by, b.bz, a, true);
  if (best.distSq <= CONTACT_SQ) return;
  segmentAgainstTriangle(best, b.bx, b.by, b.bz, b.cx, b.cy, b.cz, a, true);
  if (best.distSq <= CONTACT_SQ) return;
  segmentAgainstTriangle(best, b.cx, b.cy, b.cz, b.ax, b.ay, b.az, a, true);
}

function query(best, trisA, trisB, nodeA, nodeB) {
  if (aabbGapSq(nodeA, nodeB) > best.distSq) return;
  if (nodeA.ids && nodeB.ids) {
    for (const i of nodeA.ids) {
      for (const j of nodeB.ids) {
        const a = trisA[i];
        const b = trisB[j];
        if (aabbGapSq(a, b) > best.distSq) continue;
        triangleDistance(best, a, b);
        if (best.distSq <= CONTACT_SQ) return;
      }
    }
    return;
  }
  if (nodeA.ids) {
    descend(best, trisA, trisB, nodeA, nodeB.left, nodeB.right, true);
    return;
  }
  if (nodeB.ids) {
    descend(best, trisA, trisB, nodeB, nodeA.left, nodeA.right, false);
    return;
  }
  const pairs = [
    [nodeA.left, nodeB.left],
    [nodeA.left, nodeB.right],
    [nodeA.right, nodeB.left],
    [nodeA.right, nodeB.right]
  ];
  pairs.sort((left, right) => aabbGapSq(left[0], left[1]) - aabbGapSq(right[0], right[1]));
  for (const [left, right] of pairs) {
    query(best, trisA, trisB, left, right);
    if (best.distSq <= CONTACT_SQ) return;
  }
}

function descend(best, trisA, trisB, leaf, left, right, leafIsA) {
  const leftGap = leafIsA ? aabbGapSq(leaf, left) : aabbGapSq(left, leaf);
  const rightGap = leafIsA ? aabbGapSq(leaf, right) : aabbGapSq(right, leaf);
  const firstLeft = leftGap <= rightGap;
  const first = firstLeft ? left : right;
  const second = firstLeft ? right : left;
  if (leafIsA) query(best, trisA, trisB, leaf, first);
  else query(best, trisA, trisB, first, leaf);
  if (best.distSq <= CONTACT_SQ) return;
  if (leafIsA) query(best, trisA, trisB, leaf, second);
  else query(best, trisA, trisB, second, leaf);
}

function pack(best) {
  const distanceM = best.distSq <= CONTACT_SQ ? 0 : Math.sqrt(best.distSq);
  const distanceMm = distanceM * 1000;
  return {
    distanceMm: distanceMm < 1e-3 ? 0 : distanceMm,
    pointA: { x: best.ax, y: best.ay, z: best.az },
    pointB: { x: best.bx, y: best.by, z: best.bz }
  };
}

function surfaceDistance(verticesA, indicesA, verticesB, indicesB) {
  const trisA = buildTriangles(verticesA, indicesA);
  const trisB = buildTriangles(verticesB, indicesB);
  if (trisA.length === 0 || trisB.length === 0) return null;
  const rootA = buildNode(trisA, trisA.map((_, index) => index));
  const rootB = buildNode(trisB, trisB.map((_, index) => index));
  const best = {
    distSq: Infinity,
    ax: trisA[0].ax,
    ay: trisA[0].ay,
    az: trisA[0].az,
    bx: trisB[0].ax,
    by: trisB[0].ay,
    bz: trisB[0].az
  };
  query(best, trisA, trisB, rootA, rootB);
  if (!Number.isFinite(best.distSq)) return null;
  return pack(best);
}

export { surfaceDistance };
