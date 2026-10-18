// Writes models/<sku>.glb for catalog products that do not have a file yet.
// An existing file is left as-is, so a real model is not replaced.
// The file is the S3 object key. The catalog stores that key in media.model3d.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { meshColorForType } from "../client/scene/meshes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skuDir = path.join(root, "data", "catalog", "sku");
const modelsDir = path.join(root, "models");

const FACES = [
  { normal: [1, 0, 0], verts: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
  { normal: [-1, 0, 0], verts: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
  { normal: [0, 1, 0], verts: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, -1, 0], verts: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  { normal: [0, 0, 1], verts: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]] },
  { normal: [0, 0, -1], verts: [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]] }
];

function colorFactor(color) {
  return [(color >> 16) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, 1];
}

function appendBox(positions, normals, indices, local, half) {
  for (const face of FACES) {
    const base = positions.length / 3;
    for (const [sx, sy, sz] of face.verts) {
      positions.push(local.x + sx * half.x, local.y + sy * half.y, local.z + sz * half.z);
      normals.push(...face.normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function pad4(bytes, fill) {
  const extra = (4 - (bytes.length % 4)) % 4;
  if (extra === 0) return bytes;
  const out = Buffer.alloc(bytes.length + extra, fill);
  bytes.copy(out);
  return out;
}

function encodeGlb(product) {
  const positions = [];
  const normals = [];
  const indices = [];

  const half = {
    x: product.dimensions.width / 2000,
    y: product.dimensions.height / 2000,
    z: product.dimensions.depth / 2000
  };
  appendBox(positions, normals, indices, { x: 0, y: 0, z: 0 }, half);

  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
  const bin = pad4(Buffer.concat([positionBytes, normalBytes, indexBytes]), 0);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: colorFactor(meshColorForType(product.type)),
          metallicFactor: 0,
          roughnessFactor: 0.8
        }
      }
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0
          }
        ]
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3"
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR"
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indices.length * 2
      }
    ],
    buffers: [{ byteLength: bin.length }]
  };

  const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const glb = Buffer.alloc(total);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(total, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binStart = 20 + jsonChunk.length;
  glb.writeUInt32LE(bin.length, binStart);
  glb.writeUInt32LE(0x004e4942, binStart + 4);
  bin.copy(glb, binStart + 8);
  return glb;
}

mkdirSync(modelsDir, { recursive: true });

const files = readdirSync(skuDir).filter((name) => name.endsWith(".json"));
for (const fileName of files) {
  const product = JSON.parse(readFileSync(path.join(skuDir, fileName), "utf-8"));
  const key = `${product.sku}.glb`;
  const target = path.join(modelsDir, key);
  if (existsSync(target)) {
    console.log(`keep ${key}`);
    continue;
  }
  writeFileSync(target, encodeGlb(product));
  console.log(`write ${key}`);
}
