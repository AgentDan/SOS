import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const PERSON_OPACITY = 0.45;

// Product models: base center on x/z and the lowest point on y land on the origin.
// The mannequin keeps its own x/z (floor, centered in x, z under the pelvis) and only drops to y = 0.
const PRODUCT_NORMALIZE = { centerX: true, centerZ: true };
const PERSON_NORMALIZE = { centerX: false, centerZ: false };

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function normalizeModel(model, { centerX = true, centerZ = true } = {}) {
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(wrapper);
  if (box.isEmpty()) return wrapper;
  const center = box.getCenter(new THREE.Vector3());
  model.position.x += centerX ? -center.x : 0;
  model.position.y += -box.min.y;
  model.position.z += centerZ ? -center.z : 0;
  wrapper.updateWorldMatrix(true, true);
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

function prepareScene(gltf) {
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  return gltf.scene;
}

async function loadGltfProduct(product) {
  const sku = product && product.sku ? product.sku : "model";
  const url = modelUrl(product && product.media && product.media.model3d);
  if (!url) throw new Error(`${sku}: нет файла модели`);

  let gltf;
  try {
    gltf = await loadGltf(url);
  } catch (err) {
    const reason = err && err.message ? err.message : "не удалось загрузить";
    throw new Error(`${sku}: ${reason}`);
  }
  return { sku, scene: prepareScene(gltf) };
}

function fadePerson(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.renderOrder = 2;
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = PERSON_OPACITY;
      material.depthWrite = false;
    }
  });
}

async function loadCatalogModel(product) {
  const { sku, scene } = await loadGltfProduct(product);
  const object = normalizeModel(scene, PRODUCT_NORMALIZE);
  const parts = readFittedColliderParts(object, sku);
  return { object, parts };
}

async function loadPersonModel(product) {
  const { scene } = await loadGltfProduct(product);
  const object = normalizeModel(scene, PERSON_NORMALIZE);
  fadePerson(object);
  return { object };
}

export {
  loadCatalogModel,
  loadPersonModel,
  normalizeModel,
  readFittedColliderParts,
  PRODUCT_NORMALIZE,
  PERSON_NORMALIZE
};
