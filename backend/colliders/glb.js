// GLB container: read the JSON and BIN chunks, drop COL_* nodes, write the file back.
// The BIN chunk is copied as-is. No GLB library is used.

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

class ColliderError extends Error {
  constructor(message) {
    super(message);
    this.name = "ColliderError";
  }
}

function isColliderName(name) {
  return typeof name === "string" && name.startsWith("COL_");
}

function parseGlb(buffer) {
  const file = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (file.length < 20 || file.readUInt32LE(0) !== 0x46546c67) {
    throw new ColliderError("Файл не является GLB");
  }
  const version = file.readUInt32LE(4);
  if (version !== 2) throw new ColliderError(`GLB версии ${version} не поддерживается`);
  const length = file.readUInt32LE(8);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= file.length && offset + 8 <= length) {
    const chunkLength = file.readUInt32LE(offset);
    const chunkType = file.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (chunkLength < 0 || end > file.length) {
      throw new ColliderError("Чанк GLB выходит за пределы файла");
    }
    const chunk = file.subarray(start, end);
    if (chunkType === JSON_CHUNK && !json) {
      try {
        json = JSON.parse(chunk.toString("utf8"));
      } catch {
        throw new ColliderError("JSON-чанк GLB не разбирается");
      }
    } else if (chunkType === BIN_CHUNK && !bin) {
      bin = Buffer.from(chunk);
    }
    offset = end;
  }

  if (!json || !bin) throw new ColliderError("В GLB нет JSON-чанка или BIN-чанка");
  return { json, bin };
}

function padJson(bytes) {
  const extra = (4 - (bytes.length % 4)) % 4;
  if (extra === 0) return bytes;
  const out = Buffer.alloc(bytes.length + extra, 0x20);
  bytes.copy(out);
  return out;
}

function encodeGlb(json, bin) {
  if (!Buffer.isBuffer(bin)) throw new ColliderError("В GLB нет JSON-чанка или BIN-чанка");
  const jsonChunk = padJson(Buffer.from(JSON.stringify(json)));
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(glb, 20);
  const binHeader = 20 + jsonChunk.length;
  glb.writeUInt32LE(bin.length, binHeader);
  glb.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  bin.copy(glb, binHeader + 8);
  return glb;
}

function colliderNodeSet(json) {
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const removed = new Set();

  function mark(index, stack) {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) return;
    if (stack.has(index) || removed.has(index)) return;
    stack.add(index);
    removed.add(index);
    const children = nodes[index] && nodes[index].children;
    if (Array.isArray(children)) {
      for (const child of children) mark(child, stack);
    }
    stack.delete(index);
  }

  for (let index = 0; index < nodes.length; index += 1) {
    if (isColliderName(nodes[index] && nodes[index].name)) mark(index, new Set());
  }
  return removed;
}

function remapNodeList(indices, map) {
  const next = [];
  if (!Array.isArray(indices)) return next;
  for (const index of indices) {
    if (map.has(index)) next.push(map.get(index));
  }
  return next;
}

function removeColliderNodes(json) {
  const source = structuredClone(json);
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const removed = colliderNodeSet(source);
  const map = new Map();
  const kept = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (removed.has(index)) continue;
    map.set(index, kept.length);
    kept.push(nodes[index]);
  }

  for (const node of kept) {
    if (!node || !Array.isArray(node.children)) continue;
    const children = remapNodeList(node.children, map);
    if (children.length > 0) node.children = children;
    else delete node.children;
  }
  source.nodes = kept;

  if (Array.isArray(source.scenes)) {
    for (const scene of source.scenes) {
      if (!scene || !Array.isArray(scene.nodes)) continue;
      scene.nodes = remapNodeList(scene.nodes, map);
    }
  }

  if (Array.isArray(source.skins)) {
    for (const skin of source.skins) {
      if (!skin) continue;
      if (Array.isArray(skin.joints)) skin.joints = remapNodeList(skin.joints, map);
      if (skin.skeleton != null) {
        if (map.has(skin.skeleton)) skin.skeleton = map.get(skin.skeleton);
        else delete skin.skeleton;
      }
    }
  }

  if (Array.isArray(source.animations)) {
    for (const animation of source.animations) {
      if (!animation || !Array.isArray(animation.channels)) continue;
      animation.channels = animation.channels.filter((channel) => {
        const target = channel && channel.target;
        if (!target || target.node == null) return true;
        if (!map.has(target.node)) return false;
        target.node = map.get(target.node);
        return true;
      });
    }
  }

  return source;
}

function addColliderNodes(json, parts) {
  const sceneIndex = json.scene ?? 0;
  const scene = Array.isArray(json.scenes) ? json.scenes[sceneIndex] : null;
  if (!scene) throw new ColliderError("В GLB нет активной сцены");
  if (!Array.isArray(json.nodes)) json.nodes = [];
  if (!Array.isArray(scene.nodes)) scene.nodes = [];

  const sorted = parts.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const used = new Set();
  for (const part of sorted) {
    const name = `COL_${part.name}`;
    if (used.has(name)) throw new ColliderError(`Повторяется имя коллайдера ${name}`);
    used.add(name);
    const index = json.nodes.length;
    json.nodes.push({
      name,
      translation: part.center.slice(),
      scale: part.size.slice(),
      extras: { collider: "box" }
    });
    scene.nodes.push(index);
  }
  return json;
}

function listSceneColliderNames(json) {
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const scene = Array.isArray(json.scenes) ? json.scenes[json.scene ?? 0] : null;
  const roots = scene && Array.isArray(scene.nodes) ? scene.nodes : [];
  const names = [];
  const seen = new Set();

  function walk(index) {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length || seen.has(index)) return;
    seen.add(index);
    const node = nodes[index] || {};
    if (isColliderName(node.name)) names.push(node.name);
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) walk(child);
  }

  for (const root of roots) walk(root);
  return names;
}

function nodeLabel(node, index) {
  if (node && typeof node.name === "string" && node.name.length > 0) return node.name;
  return `узел ${index}`;
}

function modelNodeNames(json) {
  const skip = colliderNodeSet(json);
  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const names = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if (skip.has(index)) continue;
    names.push(nodeLabel(nodes[index], index));
  }
  names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names;
}

function readVec3(json, bin, accessorIndex) {
  const accessor = json.accessors && json.accessors[accessorIndex];
  if (!accessor) throw new ColliderError(`POSITION accessor ${accessorIndex} отсутствует`);
  if (accessor.sparse) throw new ColliderError(`POSITION accessor ${accessorIndex}: разреженные accessor не поддерживаются`);
  if (accessor.type !== "VEC3") {
    throw new ColliderError(`POSITION accessor ${accessorIndex}: неподдерживаемый тип ${accessor.type}, ожидался VEC3`);
  }
  if (accessor.bufferView == null) throw new ColliderError(`POSITION accessor ${accessorIndex} без bufferView`);

  const views = json.bufferViews || [];
  const view = views[accessor.bufferView];
  if (!view) throw new ColliderError(`bufferView ${accessor.bufferView} отсутствует`);
  if ((view.buffer ?? 0) !== 0) {
    throw new ColliderError(`POSITION accessor ${accessorIndex} лежит не в BIN-чанке GLB`);
  }

  const component = COMPONENT[accessor.componentType];
  if (!component) {
    throw new ColliderError(
      `POSITION accessor ${accessorIndex}: неподдерживаемый тип компонента ${accessor.componentType}`
    );
  }

  const count = accessor.count || 0;
  const stride = view.byteStride || component.bytes * 3;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  if (count > 0) {
    const needed = start + (count - 1) * stride + component.bytes * 3;
    if (needed > bin.length) {
      throw new ColliderError(`POSITION accessor ${accessorIndex} выходит за пределы BIN-чанка`);
    }
  }

  const points = [];
  for (let i = 0; i < count; i += 1) {
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

export {
  ColliderError,
  parseGlb,
  encodeGlb,
  colliderNodeSet,
  removeColliderNodes,
  addColliderNodes,
  listSceneColliderNames,
  modelNodeNames,
  readVec3,
  isColliderName
};
