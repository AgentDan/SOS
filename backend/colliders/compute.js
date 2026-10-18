// Part boxes from mesh vertices. COL_* nodes are ignored: they are rebuilt, not trusted.

import { ColliderError, colliderNodeSet, modelNodeNames, readVec3 } from "./glb.js";

const MAX_PARTS = 12;

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

function computeParts(json, bin, type) {
  const geometry = inspectGeometry(json, bin);
  if (geometry.meshes.length === 0) throw new ColliderError(`В файле нет геометрии. Узлы в файле: ${nodeList(geometry.nodeNames)}`);
  if (geometry.zero) throw new ColliderError("Нулевой размер модели");
  const selected = selectParts(geometry.meshes, type).sort(compareName);
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

function dimensionsMismatch(sizeMm, catalogMm) {
  if (!sizeMm || !catalogMm) return true;
  for (const axis of ["width", "height", "depth"]) {
    const glb = Number(sizeMm[axis]);
    const catalog = Number(catalogMm[axis]);
    if (!Number.isFinite(glb) || !Number.isFinite(catalog)) return true;
    if (catalog === 0) {
      if (glb !== 0) return true;
      continue;
    }
    if (Math.abs(glb - catalog) / Math.abs(catalog) > 0.02) return true;
  }
  return false;
}

export { computeParts, geometrySizeMm, dimensionsMismatch };
