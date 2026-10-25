import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeModel, PERSON_NORMALIZE, PRODUCT_NORMALIZE, readFittedColliderParts } from "./load-model.js";

globalThis.self = globalThis;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function catalogProducts() {
  const dir = path.join(rootDir, "data", "catalog", "sku");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")))
    .filter((product) => product && typeof product.sku === "string");
}

function parseGlb(bytes) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
  });
}

async function quiet(task) {
  const error = console.error;
  const warn = console.warn;
  const skip = (args) => {
    const text = args.map((item) => String(item)).join(" ");
    return text.includes("GLTFLoader") || text.includes("Couldn't load texture") || text.includes("blob:");
  };
  console.error = (...args) => {
    if (!skip(args)) error(...args);
  };
  console.warn = (...args) => {
    if (!skip(args)) warn(...args);
  };
  try {
    return await task();
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

function colliderPoints(root) {
  const points = [];
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!obj.name || !obj.name.startsWith("COL_")) return;
    points.push(obj.getWorldPosition(new THREE.Vector3()));
  });
  return points;
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-4, `${label}: ${actual} vs ${expected}`);
}

test("a model without COL_* nodes throws", () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  assert.throws(() => readFittedColliderParts(root, "DESK-TOP-1400"), /DESK-TOP-1400/);
  assert.throws(() => readFittedColliderParts(root, "DESK-TOP-1400"), /COL_\*/);
});

test("COL_* nodes yield world half extents and then leave the scene", () => {
  const root = new THREE.Group();
  root.scale.set(2, 2, 2);
  const node = new THREE.Group();
  node.name = "COL_Top";
  node.position.set(1, 0, 0);
  node.scale.set(2, 4, 6);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  hidden.name = "hidden";
  node.add(hidden);
  root.add(node);

  const parts = readFittedColliderParts(root, "DESK-TOP-1400");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].half, { x: 2, y: 4, z: 6 });
  assert.ok(Math.abs(parts[0].local.x - 2) < 1e-6);
  assert.ok(Math.abs(parts[0].local.y) < 1e-6);
  assert.ok(Math.abs(parts[0].local.z) < 1e-6);

  let collider = false;
  let leftover = false;
  root.traverse((obj) => {
    if (obj.name && obj.name.startsWith("COL_")) collider = true;
    if (obj.name === "hidden") leftover = true;
  });
  assert.equal(collider, false);
  assert.equal(leftover, false);
});

test("real product models sit on the origin and colliders move with them", async () => {
  const products = catalogProducts().filter((product) => product.type !== "person");
  assert.ok(products.length > 0);
  let shifted = false;
  await quiet(async () => {
    for (const product of products) {
      const file = path.join(rootDir, "models", `${product.sku}.glb`);
      const gltf = await parseGlb(readFileSync(file));
      const before = colliderPoints(gltf.scene);
      const start = gltf.scene.position.clone();
      const object = normalizeModel(gltf.scene, PRODUCT_NORMALIZE);
      const shift = gltf.scene.position.clone().sub(start);
      if (shift.length() > 1e-3) shifted = true;

      object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      near(box.min.y, 0, `${product.sku} min.y`);
      near(center.x, 0, `${product.sku} center.x`);
      near(center.z, 0, `${product.sku} center.z`);

      const parts = readFittedColliderParts(object, product.sku);
      assert.equal(parts.length, before.length, product.sku);
      for (let i = 0; i < parts.length; i += 1) {
        const expected = before[i].clone().add(shift);
        near(parts[i].local.x, expected.x, `${product.sku} col ${i} x`);
        near(parts[i].local.y, expected.y, `${product.sku} col ${i} y`);
        near(parts[i].local.z, expected.z, `${product.sku} col ${i} z`);
      }
    }
  });
  assert.equal(shifted, true);
});

test("the mannequin model rests on y = 0 and keeps its z origin", async () => {
  const person = catalogProducts().find((product) => product.type === "person");
  assert.ok(person, "catalog person");
  await quiet(async () => {
    const file = path.join(rootDir, "models", `${person.sku}.glb`);
    const gltf = await parseGlb(readFileSync(file));
    const object = normalizeModel(gltf.scene, PERSON_NORMALIZE);
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    near(box.min.y, 0, `${person.sku} min.y`);
    near(center.x, 0, `${person.sku} center.x`);
    assert.ok(Math.abs(center.z) > 0.1, `${person.sku} center.z was recentered: ${center.z}`);
  });
});
