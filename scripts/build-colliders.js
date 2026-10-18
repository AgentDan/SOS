// Builds data/catalog/colliders/<sku>.json from models/<sku>.glb.
// The file is read here: header, JSON chunk, BIN chunk, POSITION accessors,
// and node transforms. No GLB library is used.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_PARTS = 12;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT = {
  5120: { bytes: 1, read: (bin, offset) => bin.readInt8(offset) },
  5121: { bytes: 1, read: (bin, offset) => bin.readUInt8(offset) },
  5122: { bytes: 2, read: (bin, offset) => bin.readInt16LE(offset) },
  5123: { bytes: 2, read: (bin, offset) => bin.readUInt16LE(offset) },
  5125: { bytes: 4, read: (bin, offset) => bin.readUInt32LE(offset) },
  5126: { bytes: 4, read: (bin, offset) => bin.readFloatLE(offset) }
};

const NORMALIZED_MAX = {
  5120: 127,
  5121: 255,
  5122: 32767,
  5123: 65535,
  5125: 4294967295
};

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function groupKey(name) {
  const match = /^[^\d_]+/.exec(String(name));
  if (match && match[0]) return match[0];
  return String(name);
}

function isColliderName(name) {
  return String(name).startsWith("COL_");
}

function parseGlb(buffer) {
  const file = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (file.length < 20) throw new Error("GLB is too small");
  if (file.readUInt32LE(0) !== 0x46546c67) throw new Error("GLB magic is missing");
  const version = file.readUInt32LE(4);
  if (version !== 2) throw new Error(`GLB version ${version} is not supported`);
  const length = file.readUInt32LE(8);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= file.length && offset + 8 <= length) {
    const chunkLength = file.readUInt32LE(offset);
    const chunkType = file.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > file.length) throw new Error("GLB chunk exceeds the file");
    const chunk = file.subarray(start, end);
    if (chunkType === JSON_CHUNK) json = JSON.parse(chunk.toString("utf8"));
    else if (chunkType === BIN_CHUNK) bin = chunk;
    offset = end;
  }

  if (!json || !bin) throw new Error("GLB is missing the JSON or BIN chunk");
  return { json, bin };
}

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
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

function readVec3(json, bin, accessorIndex) {
  const accessor = json.accessors && json.accessors[accessorIndex];
  if (!accessor) throw new Error(`POSITION accessor ${accessorIndex} is missing`);
  if (accessor.sparse) throw new Error(`POSITION accessor ${accessorIndex} is sparse`);
  if (accessor.type !== "VEC3") throw new Error(`POSITION accessor ${accessorIndex} is not VEC3`);
  if (accessor.bufferView == null) throw new Error(`POSITION accessor ${accessorIndex} has no bufferView`);

  const view = json.bufferViews[accessor.bufferView];
  if (!view) throw new Error(`bufferView ${accessor.bufferView} is missing`);
  if ((view.buffer ?? 0) !== 0) throw new Error(`POSITION accessor ${accessorIndex} is not in the GLB BIN chunk`);

  const component = COMPONENT[accessor.componentType];
  if (!component) throw new Error(`POSITION accessor ${accessorIndex} has an unsupported component type`);

  const stride = view.byteStride || component.bytes * 3;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const points = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const base = start + i * stride;
    const point = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      let value = component.read(bin, base + c * component.bytes);
      if (accessor.normalized && accessor.componentType !== 5126) {
        value /= NORMALIZED_MAX[accessor.componentType];
      }
      point[c] = value;
    }
    points.push(point);
  }
  return points;
}

function meshWorldPoints(json, bin, meshIndex, world) {
  const mesh = json.meshes && json.meshes[meshIndex];
  if (!mesh) throw new Error(`mesh ${meshIndex} is missing`);
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
    half: min.map((value, i) => (max[i] - value) / 2),
    center: min.map((value, i) => (value + max[i]) / 2)
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

function sizeDelta(a, b) {
  let sum = 0;
  for (let i = 0; i < 3; i += 1) sum += Math.abs(a.half[i] - b.half[i]);
  return sum;
}

function centerDist2(a, b) {
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const delta = a.center[i] - b.center[i];
    sum += delta * delta;
  }
  return sum;
}

function unionParts(a, b) {
  const min = [0, 1, 2].map((i) => Math.min(a.min[i], b.min[i]));
  const max = [0, 1, 2].map((i) => Math.max(a.max[i], b.max[i]));
  const name = [...new Set(`${a.name}+${b.name}`.split("+"))].sort().join("+");
  return partFromAabb(name, min, max);
}

function mergeToLimit(parts) {
  const list = parts.slice();
  while (list.length > MAX_PARTS) {
    let best = null;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const candidate = {
          i,
          j,
          sizeDelta: sizeDelta(list[i], list[j]),
          dist2: centerDist2(list[i], list[j])
        };
        if (!best) {
          best = candidate;
          continue;
        }
        const sizeGap = candidate.sizeDelta - best.sizeDelta;
        if (sizeGap < -1e-12) {
          best = candidate;
          continue;
        }
        if (Math.abs(sizeGap) > 1e-12) continue;
        const distGap = candidate.dist2 - best.dist2;
        if (distGap < -1e-12 || (Math.abs(distGap) <= 1e-12 && (candidate.i < best.i || (candidate.i === best.i && candidate.j < best.j)))) {
          best = candidate;
        }
      }
    }
    const merged = unionParts(list[best.i], list[best.j]);
    const next = [];
    for (let index = 0; index < list.length; index += 1) {
      if (index !== best.i && index !== best.j) next.push(list[index]);
    }
    next.push(merged);
    list.length = 0;
    list.push(...next);
  }
  return list;
}

function subtreePoints(json, bin, worlds, index) {
  const points = [];
  function walk(current, isRoot) {
    const node = json.nodes[current];
    if (!node) return;
    const name = node.name || "";
    if (!isRoot && isColliderName(name)) return;
    if (node.mesh != null && worlds[current]) {
      points.push(...meshWorldPoints(json, bin, node.mesh, worlds[current]));
    }
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) walk(child, false);
  }
  walk(index, true);
  return points;
}

function analyze(json, bin) {
  const worlds = worldMatrices(json);
  const meshes = [];
  const colliders = [];
  const nodes = json.nodes || [];

  for (let index = 0; index < nodes.length; index += 1) {
    if (!worlds[index]) continue;
    const node = nodes[index] || {};
    const name = node.name || `node_${index}`;
    if (node.mesh != null) {
      const points = meshWorldPoints(json, bin, node.mesh, worlds[index]);
      if (points.length > 0) {
        const box = aabbOf(points);
        meshes.push({ name, min: box.min, max: box.max });
      }
    }
    if (isColliderName(name)) {
      const points = subtreePoints(json, bin, worlds, index);
      if (points.length > 0) {
        const box = aabbOf(points);
        colliders.push({ name, min: box.min, max: box.max });
      }
    }
  }

  return { meshes, colliders };
}

function selectParts(analyzed, type) {
  if (analyzed.colliders.length > 0) {
    const parts = analyzed.colliders
      .map((entry) => partFromAabb(entry.name, entry.min, entry.max))
      .filter(hasVolume)
      .sort(compareName);
    return { source: "manual", parts };
  }

  let parts;
  if (type === "desk_legs") parts = deskLegParts(analyzed.meshes);
  else if (type === "chair") parts = chairParts(analyzed.meshes);
  else parts = groupedParts(analyzed.meshes);
  return { source: "auto", parts };
}

function modelAabb(meshes) {
  return unionAabbs(meshes);
}

function finalize(parts, model) {
  const origin = model.min.map((value, index) => (value + model.max[index]) / 2);
  const bounded = parts.length > 0 ? parts : [partFromAabb("Model", model.min, model.max)];
  const limited = mergeToLimit(bounded);
  const out = limited
    .map((part) => ({
      name: part.name,
      shape: "cuboid",
      half: part.min.map((value, index) => round6((part.max[index] - value) / 2)),
      center: part.min.map((value, index) => round6((value + part.max[index]) / 2 - origin[index]))
    }))
    .filter((part) => part.half.every((value) => value > 0));

  out.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    for (let i = 0; i < 3; i += 1) {
      if (a.center[i] !== b.center[i]) return a.center[i] - b.center[i];
    }
    return 0;
  });

  return {
    bounds: {
      min: model.min.map((value, index) => round6(value - origin[index])),
      max: model.max.map((value, index) => round6(value - origin[index]))
    },
    size_mm: {
      width: Math.round((model.max[0] - model.min[0]) * 1000),
      height: Math.round((model.max[1] - model.min[1]) * 1000),
      depth: Math.round((model.max[2] - model.min[2]) * 1000)
    },
    parts: out
  };
}

function buildColliderFromGlb(buffer, { sku = "", type = "" } = {}) {
  const { json, bin } = parseGlb(buffer);
  const analyzed = analyze(json, bin);
  if (analyzed.meshes.length === 0 && analyzed.colliders.length === 0) {
    throw new Error(`GLB "${sku || "model"}" has no POSITION data`);
  }
  const model = modelAabb(analyzed.meshes.length > 0 ? analyzed.meshes : analyzed.colliders);
  const selected = selectParts(analyzed, type);
  const final = finalize(selected.parts, model);
  return {
    sku,
    source: selected.source,
    unit: "m",
    bounds: final.bounds,
    size_mm: final.size_mm,
    parts: final.parts
  };
}

function readSkuTypes(skuDir) {
  const types = new Map();
  if (!existsSync(skuDir)) return types;
  const files = readdirSync(skuDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const name of files) {
    const product = JSON.parse(readFileSync(path.join(skuDir, name), "utf8"));
    if (product && product.sku) types.set(product.sku, product.type || "");
  }
  return types;
}

function buildAll() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const modelsDir = path.join(root, "models");
  const outDir = path.join(root, "data", "catalog", "colliders");
  const types = readSkuTypes(path.join(root, "data", "catalog", "sku"));
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith(".glb"))
    .sort();
  for (const fileName of files) {
    const sku = fileName.slice(0, -".glb".length);
    const collider = buildColliderFromGlb(readFileSync(path.join(modelsDir, fileName)), {
      sku,
      type: types.get(sku) || ""
    });
    writeFileSync(path.join(outDir, `${sku}.json`), `${JSON.stringify(collider, null, 2)}\n`);
    const size = collider.size_mm;
    console.log(
      `${sku} ${collider.source} parts=${collider.parts.length} ${size.width}x${size.depth}x${size.height}`
    );
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  const left = path.resolve(entry);
  const right = fileURLToPath(import.meta.url);
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

if (invokedDirectly()) buildAll();

export { parseGlb, buildColliderFromGlb, groupKey, identity };
