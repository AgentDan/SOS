// Part boxes from mesh vertices. COL_* nodes are ignored: they are rebuilt, not trusted.

import { ColliderError, colliderNodeSet, modelNodeNames, readIndices, readVec3 } from "./glb.js";

const MAX_PARTS = 12;
const FILL_THRESHOLD = 0.6;
const MAX_CELLS = 262144;
const MIN_CELL = 0.01;

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function groupKey(name) {
  const match = /^[^\d_]+/.exec(String(name));
  if (match && match[0]) return match[0];
  return String(name);
}

function quatToMat(x, y, z, w) {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    0,
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    0,
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1
  ];
}

function matFromNode(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const m = quatToMat(r[0], r[1], r[2], r[3]);
  m[0] *= s[0];
  m[1] *= s[0];
  m[2] *= s[0];
  m[4] *= s[1];
  m[5] *= s[1];
  m[6] *= s[1];
  m[8] *= s[2];
  m[9] *= s[2];
  m[10] *= s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  return m;
}

function matMul(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function worldMatrices(json) {
  const nodes = json.nodes || [];
  const worlds = new Array(nodes.length).fill(null);
  const scene = (json.scenes || [])[json.scene ?? 0];
  const roots = scene && Array.isArray(scene.nodes) ? scene.nodes : [];

  function walk(index, parent) {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) return;
    if (worlds[index]) return;
    const local = matFromNode(nodes[index] || {});
    worlds[index] = parent ? matMul(parent, local) : local;
    const children = nodes[index] && nodes[index].children;
    if (!Array.isArray(children)) return;
    for (const child of children) walk(child, worlds[index]);
  }

  for (const root of roots) walk(root, null);
  return worlds;
}

function meshWorldPoints(json, bin, meshIndex, world) {
  const mesh = json.meshes && json.meshes[meshIndex];
  if (!mesh) throw new ColliderError(`mesh ${meshIndex} отсутствует`);
  const points = [];
  for (const primitive of mesh.primitives || []) {
    const position = primitive.attributes && primitive.attributes.POSITION;
    if (position == null) continue;
    for (const point of readVec3(json, bin, position)) {
      points.push(transformPoint(world, point[0], point[1], point[2]));
    }
  }
  return points;
}

function aabbOf(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let i = 0; i < 3; i += 1) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  return { min, max };
}

function partFromAabb(name, min, max) {
  return {
    name,
    min,
    max,
    half: min.map((value, index) => (max[index] - value) / 2),
    center: min.map((value, index) => (value + max[index]) / 2)
  };
}

function unionAabbs(entries) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const entry of entries) {
    for (let i = 0; i < 3; i += 1) {
      if (entry.min[i] < min[i]) min[i] = entry.min[i];
      if (entry.max[i] > max[i]) max[i] = entry.max[i];
    }
  }
  return { min, max };
}

function hasVolume(part) {
  return part.half.every((value) => value > 1e-9);
}

function isTinyDeskPiece(part) {
  return part.half.some((value) => value * 2 * 1000 < 10 - 1e-3);
}

function compareName(a, b) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  for (let i = 0; i < 3; i += 1) {
    if (a.min[i] !== b.min[i]) return a.min[i] - b.min[i];
  }
  return 0;
}

function chairRole(name) {
  if (/^(Wheel|Caster)_/.test(name)) return null;
  if (/^Seat_/.test(name)) return "Seat";
  if (/^Backrest_/.test(name) || /^Headrest(_|$)/.test(name)) return "Back";
  if (/^Armrest_/.test(name)) return "Armrest";
  if (/^Hub(_|$)/.test(name) || /^Leg_/.test(name) || /^Gaslift_/.test(name)) return "Base";
  return null;
}

function groupedParts(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = groupKey(entry.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const parts = [];
  for (const name of [...groups.keys()].sort()) {
    const box = unionAabbs(groups.get(name));
    const part = partFromAabb(name, box.min, box.max);
    if (!hasVolume(part)) continue;
    parts.push(part);
  }
  return parts;
}

function deskLegParts(entries) {
  const parts = [];
  for (const entry of entries) {
    if (!/^(Leg|Foot|Frame|Post|Plate)_/.test(entry.name)) continue;
    const part = partFromAabb(entry.name, entry.min, entry.max);
    if (!hasVolume(part) || isTinyDeskPiece(part)) continue;
    parts.push(part);
  }
  parts.sort(compareName);
  return parts;
}

function chairParts(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const role = chairRole(entry.name);
    if (!role) continue;
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(entry);
  }
  const parts = [];
  for (const name of ["Armrest", "Back", "Base", "Seat"]) {
    if (!groups.has(name)) continue;
    const box = unionAabbs(groups.get(name));
    const part = partFromAabb(name, box.min, box.max);
    if (!hasVolume(part)) continue;
    parts.push(part);
  }
  return parts;
}

function selectParts(entries, type) {
  if (type === "desk_legs") return deskLegParts(entries);
  if (type === "chair") return chairParts(entries);
  return groupedParts(entries);
}

function nodeList(names) {
  if (!names || names.length === 0) return "нет";
  return names.join(", ");
}

function zeroSize(box) {
  return [0, 1, 2].some((index) => !(box.max[index] - box.min[index] > 1e-9));
}

function collectMeshes(json, bin) {
  const worlds = worldMatrices(json);
  const skip = colliderNodeSet(json);
  const nodes = json.nodes || [];
  const meshes = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (skip.has(index) || !worlds[index]) continue;
    const node = nodes[index] || {};
    if (node.mesh == null) continue;
    const points = meshWorldPoints(json, bin, node.mesh, worlds[index]);
    if (points.length === 0) continue;
    const box = aabbOf(points);
    const name = typeof node.name === "string" && node.name.length > 0 ? node.name : `узел ${index}`;
    meshes.push({ name, min: box.min, max: box.max });
  }
  return meshes;
}

function inspectGeometry(json, bin) {
  const meshes = collectMeshes(json, bin);
  const nodeNames = modelNodeNames(json);
  if (meshes.length === 0) {
    return { meshes, nodeNames, bounds: null, sizeMm: null, zero: false };
  }
  const box = unionAabbs(meshes);
  const sizeMm = {
    width: Math.round((box.max[0] - box.min[0]) * 1000),
    height: Math.round((box.max[1] - box.min[1]) * 1000),
    depth: Math.round((box.max[2] - box.min[2]) * 1000)
  };
  return {
    meshes,
    nodeNames,
    box,
    bounds: {
      min: box.min.map(round6),
      max: box.max.map(round6)
    },
    sizeMm,
    zero: zeroSize(box)
  };
}

function formatParts(parts) {
  return parts
    .map((part) => ({
      name: part.name,
      center: part.center.map(round6),
      size: part.min.map((value, index) => round6(part.max[index] - value))
    }))
    .filter((part) => part.size.every((value) => value > 0))
    .sort((a, b) => {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      for (let i = 0; i < 3; i += 1) {
        if (a.center[i] !== b.center[i]) return a.center[i] - b.center[i];
      }
      return 0;
    });
}

function assertParts(parts, type, nodeNames) {
  const listed = nodeList(nodeNames);
  if (type === "chair") {
    const present = new Set(parts.map((part) => part.name));
    const missing = ["Seat", "Back", "Base"].filter((name) => !present.has(name));
    if (missing.length > 0) {
      throw new ColliderError(
        `Кресло: не найдены части ${missing.join(", ")}. Ожидались узлы Seat_* (Seat), Backrest_* или Headrest* (Back), Hub, Leg_* или Gaslift_* (Base). Подлокотники Armrest_* необязательны. Узлы в файле: ${listed}`
      );
    }
  }
  if (type === "desk_legs" && parts.length === 0) {
    throw new ColliderError(
      `Опоры стола: не найдена ни одна стойка. Ожидались узлы Leg_, Foot_, Frame_, Post_ или Plate_. Мелочь меньше 10 мм не считается. Узлы в файле: ${listed}`
    );
  }
  if (parts.length < 1) {
    throw new ColliderError(`Не найдены части модели. Ожидалась хотя бы одна группа по имени узла. Узлы в файле: ${listed}`);
  }
  if (parts.length > MAX_PARTS) {
    const names = parts.map((part) => part.name).join(", ");
    throw new ColliderError(
      `Частей ${parts.length}, максимум ${MAX_PARTS}. Объединять части нельзя. Имена: ${names}. Узлы в файле: ${listed}`
    );
  }
  for (let index = 1; index < parts.length; index += 1) {
    if (parts[index].name === parts[index - 1].name) {
      throw new ColliderError(`Повторяется имя части «${parts[index].name}». Узлы в файле: ${listed}`);
    }
  }
}

function distance3(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function midpoint(a, b) {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

function finitePoint(point) {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]);
}

function axisCells(size, cell) {
  if (!(size > 0)) return 1;
  const raw = size / cell;
  const nearest = Math.round(raw);
  if (Math.abs(nearest * cell - size) <= 1e-6) return Math.max(1, nearest);
  return Math.max(1, Math.ceil(raw - 1e-9));
}

function gridFor(box) {
  const size = [0, 1, 2].map((axis) => box.max[axis] - box.min[axis]);
  const longest = Math.max(size[0], size[1], size[2]);
  let cell = Math.max(MIN_CELL, longest / 64);
  let nx = axisCells(size[0], cell);
  let ny = axisCells(size[1], cell);
  let nz = axisCells(size[2], cell);
  let guard = 0;
  while (nx * ny * nz > MAX_CELLS && guard < 60) {
    const scale = Math.cbrt((nx * ny * nz) / MAX_CELLS);
    cell *= Math.max(scale, 1.0001);
    nx = axisCells(size[0], cell);
    ny = axisCells(size[1], cell);
    nz = axisCells(size[2], cell);
    guard += 1;
  }
  if (nx * ny * nz > MAX_CELLS) {
    throw new ColliderError("Сетка формы не умещается в предел ячеек");
  }
  return {
    origin: box.min,
    modelMin: box.min,
    modelMax: box.max,
    cell,
    nx,
    ny,
    nz
  };
}

function cornerBox(points) {
  if (points.length < 8) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    if (!finitePoint(point)) return null;
    for (let axis = 0; axis < 3; axis += 1) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  }
  const eps = 1e-5;
  const corners = new Set();
  for (const point of points) {
    let key = "";
    for (let axis = 0; axis < 3; axis += 1) {
      const atMin = Math.abs(point[axis] - min[axis]) <= eps;
      const atMax = Math.abs(point[axis] - max[axis]) <= eps;
      if (!atMin && !atMax) return null;
      key += atMin ? "0" : "1";
    }
    corners.add(key);
  }
  if (corners.size < 8) return null;
  if ([0, 1, 2].some((axis) => !(max[axis] - min[axis] > 1e-9))) return null;
  return { min, max };
}

function forEachWorldTriangle(json, bin, visit) {
  const worlds = worldMatrices(json);
  const skip = colliderNodeSet(json);
  const nodes = json.nodes || [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (skip.has(index) || !worlds[index]) continue;
    const node = nodes[index] || {};
    if (node.mesh == null) continue;
    const mesh = json.meshes && json.meshes[node.mesh];
    if (!mesh) throw new ColliderError(`mesh ${node.mesh} отсутствует`);
    const world = worlds[index];
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode != null && primitive.mode !== 4) {
        throw new ColliderError(`Примитив с режимом ${primitive.mode} не поддерживается, ожидались треугольники`);
      }
      const position = primitive.attributes && primitive.attributes.POSITION;
      if (position == null) continue;
      const points = readVec3(json, bin, position).map((point) => transformPoint(world, point[0], point[1], point[2]));
      if (primitive.indices == null && points.length % 3 !== 0) {
        const solid = cornerBox(points);
        if (solid) {
          visit.solid(solid);
          continue;
        }
      }
      const indices = primitive.indices != null ? readIndices(json, bin, primitive.indices) : null;
      const count = indices ? indices.length : points.length - (points.length % 3);
      const usable = count - (count % 3);
      for (let i = 0; i < usable; i += 3) {
        const ia = indices ? indices[i] : i;
        const ib = indices ? indices[i + 1] : i + 1;
        const ic = indices ? indices[i + 2] : i + 2;
        const a = points[ia];
        const b = points[ib];
        const c = points[ic];
        if (!a || !b || !c) throw new ColliderError("Индекс треугольника выходит за пределы вершин");
        visit.triangle(a, b, c);
      }
    }
  }
}

function stampSmall(grid, voxels, p, q, r) {
  const { origin, cell, nx, ny, nz } = voxels;
  const min = [p[0], p[1], p[2]];
  const max = [p[0], p[1], p[2]];
  for (const point of [q, r]) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  }
  const eps = cell * 1e-7;
  const i0 = [];
  const i1 = [];
  const dims = [nx, ny, nz];
  for (let axis = 0; axis < 3; axis += 1) {
    let low = Math.floor((min[axis] - origin[axis] - eps) / cell);
    let high = Math.floor((max[axis] - origin[axis] + eps) / cell);
    if (low < 0) low = 0;
    if (high < 0) high = 0;
    if (low >= dims[axis]) low = dims[axis] - 1;
    if (high >= dims[axis]) high = dims[axis] - 1;
    if (low > high) {
      const swap = low;
      low = high;
      high = swap;
    }
    i0.push(low);
    i1.push(high);
  }
  for (let z = i0[2]; z <= i1[2]; z += 1) {
    for (let y = i0[1]; y <= i1[1]; y += 1) {
      for (let x = i0[0]; x <= i1[0]; x += 1) grid[x + nx * (y + ny * z)] = 1;
    }
  }
}

function stampTriangle(grid, voxels, a, b, c) {
  if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return;
  const work = [[a, b, c]];
  while (work.length > 0) {
    const [p, q, r] = work.pop();
    const ab = distance3(p, q);
    const bc = distance3(q, r);
    const ca = distance3(r, p);
    const longest = Math.max(ab, bc, ca);
    if (!(longest > voxels.cell)) {
      stampSmall(grid, voxels, p, q, r);
      continue;
    }
    if (ab >= bc && ab >= ca) {
      const mid = midpoint(p, q);
      work.push([p, mid, r], [mid, q, r]);
    } else if (bc >= ca) {
      const mid = midpoint(q, r);
      work.push([p, q, mid], [p, mid, r]);
    } else {
      const mid = midpoint(r, p);
      work.push([p, q, mid], [mid, q, r]);
    }
  }
}

function floodExterior(grid, nx, ny, nz) {
  const stack = new Int32Array(grid.length);
  let top = 0;
  function push(index) {
    if (grid[index] !== 0) return;
    grid[index] = 2;
    stack[top] = index;
    top += 1;
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * y);
      if (nz > 1) push(x + nx * (y + ny * (nz - 1)));
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      push(x + nx * ny * z);
      if (ny > 1) push(x + nx * (ny - 1 + ny * z));
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      push(nx * (y + ny * z));
      if (nx > 1) push(nx - 1 + nx * (y + ny * z));
    }
  }
  const plane = nx * ny;
  while (top > 0) {
    top -= 1;
    const index = stack[top];
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / plane);
    if (x > 0) push(index - 1);
    if (x + 1 < nx) push(index + 1);
    if (y > 0) push(index - nx);
    if (y + 1 < ny) push(index + nx);
    if (z > 0) push(index - plane);
    if (z + 1 < nz) push(index + plane);
  }
}

function voxelize(json, bin, box) {
  const voxels = gridFor(box);
  const grid = new Uint8Array(voxels.nx * voxels.ny * voxels.nz);
  voxels.grid = grid;
  forEachWorldTriangle(json, bin, {
    triangle(a, b, c) {
      stampTriangle(grid, voxels, a, b, c);
    },
    solid(box) {
      fillAabb(grid, voxels, box.min, box.max);
    }
  });
  floodExterior(grid, voxels.nx, voxels.ny, voxels.nz);
  let solidCount = 0;
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] === 0) grid[index] = 1;
    if (grid[index] === 1) solidCount += 1;
  }
  voxels.solidCount = solidCount;
  return voxels;
}

function fillAabb(grid, voxels, min, max) {
  const { origin, cell, nx, ny, nz } = voxels;
  const [x0, x1] = axisRange(origin[0], cell, nx, min[0], max[0]);
  const [y0, y1] = axisRange(origin[1], cell, ny, min[1], max[1]);
  const [z0, z1] = axisRange(origin[2], cell, nz, min[2], max[2]);
  if (x1 < x0 || y1 < y0 || z1 < z0) return;
  for (let z = z0; z <= z1; z += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) grid[x + nx * (y + ny * z)] = 1;
    }
  }
}

function axisRange(origin, cell, count, min, max) {
  let low = Math.floor((min - origin) / cell);
  let high = Math.floor((max - origin) / cell - 1e-12);
  if (low < 0) low = 0;
  if (high >= count) high = count - 1;
  return [low, high];
}

function fractionOf(voxels, part) {
  const { origin, cell, nx, ny, nz, grid, solidCount } = voxels;
  const [x0, x1] = axisRange(origin[0], cell, nx, part.min[0], part.max[0]);
  const [y0, y1] = axisRange(origin[1], cell, ny, part.min[1], part.max[1]);
  const [z0, z1] = axisRange(origin[2], cell, nz, part.min[2], part.max[2]);
  if (x1 < x0 || y1 < y0 || z1 < z0) return 0;
  if (x0 === 0 && y0 === 0 && z0 === 0 && x1 === nx - 1 && y1 === ny - 1 && z1 === nz - 1) {
    return solidCount / (nx * ny * nz);
  }
  let total = 0;
  let solid = 0;
  for (let z = z0; z <= z1; z += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        total += 1;
        if (grid[x + nx * (y + ny * z)] === 1) solid += 1;
      }
    }
  }
  if (total === 0) return 0;
  return solid / total;
}

function largestRectangle(mask, nx, ny, height) {
  height.fill(0);
  let best = null;
  const stack = [-1];
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) height[x] = mask[y * nx + x] ? height[x] + 1 : 0;
    stack.length = 1;
    for (let x = 0; x <= nx; x += 1) {
      const h = x === nx ? 0 : height[x];
      while (stack.length > 1 && height[stack[stack.length - 1]] >= h) {
        const idx = stack.pop();
        const rectH = height[idx];
        const left = stack[stack.length - 1];
        const rectW = x - left - 1;
        if (rectH > 0 && rectW > 0) {
          const area = rectW * rectH;
          const x0 = left + 1;
          const y0 = y - rectH + 1;
          if (
            !best ||
            area > best.area ||
            (area === best.area && (y0 < best.y0 || (y0 === best.y0 && x0 < best.x0)))
          ) {
            best = { x0, y0, w: rectW, h: rectH, area };
          }
        }
      }
      stack.push(x);
    }
  }
  return best;
}

function preferBox(volume, c0, c1, best) {
  if (!best || volume > best.volume) return true;
  if (volume < best.volume) return false;
  for (let axis = 0; axis < 3; axis += 1) {
    if (c0[axis] !== best.c0[axis]) return c0[axis] < best.c0[axis];
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (c1[axis] !== best.c1[axis]) return c1[axis] < best.c1[axis];
  }
  return false;
}

function findLargestBox(grid, nx, ny, nz) {
  const dims = [nx, ny, nz];
  const order = [0, 1, 2].sort((a, b) => dims[a] - dims[b] || a - b);
  const slab = order[0];
  const u = order[1];
  const v = order[2];
  const su = dims[u];
  const sv = dims[v];
  const ss = dims[slab];
  const mask = new Uint8Array(su * sv);
  const height = new Int32Array(su);
  const coord = [0, 0, 0];
  let best = null;

  function indexAt(iu, iv, is) {
    coord[u] = iu;
    coord[v] = iv;
    coord[slab] = is;
    return coord[0] + nx * (coord[1] + ny * coord[2]);
  }

  for (let s0 = 0; s0 < ss; s0 += 1) {
    if (best && su * sv * (ss - s0) < best.volume) break;
    let alive = 0;
    for (let iv = 0; iv < sv; iv += 1) {
      for (let iu = 0; iu < su; iu += 1) {
        const on = grid[indexAt(iu, iv, s0)] === 1 ? 1 : 0;
        mask[iv * su + iu] = on;
        alive += on;
      }
    }
    for (let s1 = s0; s1 < ss; s1 += 1) {
      if (s1 > s0) {
        alive = 0;
        for (let iv = 0; iv < sv; iv += 1) {
          const row = iv * su;
          for (let iu = 0; iu < su; iu += 1) {
            const on = mask[row + iu] && grid[indexAt(iu, iv, s1)] === 1 ? 1 : 0;
            mask[row + iu] = on;
            alive += on;
          }
        }
      }
      if (alive === 0) break;
      const depth = s1 - s0 + 1;
      if (best && alive * (ss - s0) < best.volume) break;
      const rect = largestRectangle(mask, su, sv, height);
      if (!rect) continue;
      const volume = rect.w * rect.h * depth;
      const c0 = [0, 0, 0];
      const c1 = [0, 0, 0];
      c0[u] = rect.x0;
      c0[v] = rect.y0;
      c0[slab] = s0;
      c1[u] = rect.x0 + rect.w - 1;
      c1[v] = rect.y0 + rect.h - 1;
      c1[slab] = s1;
      if (preferBox(volume, c0, c1, best)) best = { c0, c1, volume };
    }
  }
  return best;
}

function isThinShapeBox(size, cell) {
  return size.some((value) => value < cell - 1e-8 || value * 1000 < 10 - 1e-3);
}

function metricVolume(part) {
  return (part.max[0] - part.min[0]) * (part.max[1] - part.min[1]) * (part.max[2] - part.min[2]);
}

function partsFromVoxels(voxels) {
  const { grid, nx, ny, nz, cell, origin, modelMin, modelMax } = voxels;
  let remaining = voxels.solidCount;
  const boxes = [];
  while (boxes.length < MAX_PARTS && remaining > 0) {
    const found = findLargestBox(grid, nx, ny, nz);
    if (!found) break;
    let covered = 0;
    for (let z = found.c0[2]; z <= found.c1[2]; z += 1) {
      for (let y = found.c0[1]; y <= found.c1[1]; y += 1) {
        const row = nx * (y + ny * z);
        for (let x = found.c0[0]; x <= found.c1[0]; x += 1) {
          const index = row + x;
          if (grid[index] !== 1) continue;
          grid[index] = 3;
          covered += 1;
        }
      }
    }
    if (covered === 0) break;
    remaining -= covered;
    boxes.push(found);
  }

  const parts = [];
  for (const box of boxes) {
    const min = [0, 1, 2].map((axis) => Math.max(modelMin[axis], origin[axis] + box.c0[axis] * cell));
    const max = [0, 1, 2].map((axis) => Math.min(modelMax[axis], origin[axis] + (box.c1[axis] + 1) * cell));
    const size = min.map((value, axis) => max[axis] - value);
    if (size.some((value) => !(value > 0)) || isThinShapeBox(size, cell)) continue;
    parts.push(partFromAabb("", min, max));
  }
  parts.sort((a, b) => {
    const delta = metricVolume(b) - metricVolume(a);
    if (delta !== 0) return delta;
    for (let axis = 0; axis < 3; axis += 1) {
      if (a.min[axis] !== b.min[axis]) return a.min[axis] - b.min[axis];
    }
    return 0;
  });
  return parts.map((part, index) => {
    part.name = `Auto_${index + 1}`;
    return part;
  });
}

function computeParts(json, bin, type) {
  const geometry = inspectGeometry(json, bin);
  if (geometry.meshes.length === 0) throw new ColliderError(`В файле нет геометрии. Узлы в файле: ${nodeList(geometry.nodeNames)}`);
  if (geometry.zero) throw new ColliderError("Нулевой размер модели");
  let selected = selectParts(geometry.meshes, type).sort(compareName);
  if (type !== "chair") {
    const noNamedLegs = type === "desk_legs" && selected.length === 0;
    if (noNamedLegs || selected.length === 1) {
      const voxels = voxelize(json, bin, geometry.box);
      const fuzzy = !noNamedLegs && fractionOf(voxels, selected[0]) < FILL_THRESHOLD;
      if (noNamedLegs || fuzzy) {
        selected = partsFromVoxels(voxels);
        if (selected.length === 0) {
          throw new ColliderError(
            `Не удалось построить коллайдеры по форме модели. Узлы в файле: ${nodeList(geometry.nodeNames)}`
          );
        }
      }
    }
  }
  const parts = formatParts(selected);
  assertParts(parts, type, geometry.nodeNames);
  return {
    parts,
    sizeMm: geometry.sizeMm,
    bounds: geometry.bounds
  };
}

function geometrySizeMm(json, bin) {
  return inspectGeometry(json, bin).sizeMm;
}

export { computeParts, geometrySizeMm };
