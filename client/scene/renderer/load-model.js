import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mmToM } from "../physics/bodies.js";

const loader = new GLTFLoader();

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function fitToCatalogDimensions(model, dimensions) {
  const inner = new THREE.Group();
  inner.add(model);
  inner.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -center.y, -center.z);

  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.scale.set(
    size.x > 0 ? mmToM(dimensions.width) / size.x : 1,
    size.y > 0 ? mmToM(dimensions.height) / size.y : 1,
    size.z > 0 ? mmToM(dimensions.depth) / size.z : 1
  );
  return wrapper;
}

function modelsBase() {
  const fromEnv = import.meta.env.VITE_MODELS_BASE_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();
  return "/models/";
}

function modelUrl(model3d) {
  if (typeof model3d !== "string" || model3d.trim() === "") return null;
  const key = model3d.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(key) || key.startsWith("/")) return key;
  return `${modelsBase().replace(/\/+$/, "")}/${key}`;
}

function readFittedColliderParts(root, sku) {
  const label = sku || "model";
  root.updateWorldMatrix(true, true);
  const bodyPos = new THREE.Vector3();
  const bodyQuat = new THREE.Quaternion();
  const bodyScale = new THREE.Vector3();
  root.matrixWorld.decompose(bodyPos, bodyQuat, bodyScale);
  const invQuat = bodyQuat.clone().invert();

  const found = [];
  root.traverse((obj) => {
    if (obj.name && obj.name.startsWith("COL_")) found.push(obj);
  });
  if (found.length === 0) throw new Error(`${label}: в модели нет узлов COL_*`);

  const parts = [];
  for (const node of found) {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    node.matrixWorld.decompose(pos, quat, scale);
    pos.sub(bodyPos).applyQuaternion(invQuat);
    parts.push({
      half: {
        x: Math.abs(scale.x) / 2,
        y: Math.abs(scale.y) / 2,
        z: Math.abs(scale.z) / 2
      },
      local: { x: pos.x, y: pos.y, z: pos.z }
    });
  }
  for (const node of found) node.removeFromParent();
  return parts;
}

async function loadCatalogModel(product) {
  const sku = product && product.sku ? product.sku : "model";
  const url = modelUrl(product.media && product.media.model3d);
  if (!url) throw new Error(`${sku}: нет файла модели`);

  let gltf;
  try {
    gltf = await loadGltf(url);
  } catch (err) {
    const reason = err && err.message ? err.message : "не удалось загрузить";
    throw new Error(`${sku}: ${reason}`);
  }
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  const object = fitToCatalogDimensions(gltf.scene, product.dimensions);
  const parts = readFittedColliderParts(object, sku);
  return { object, parts };
}

export { loadCatalogModel, readFittedColliderParts };
