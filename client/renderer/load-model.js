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

async function loadCatalogModel(product) {
  const url = product.media && product.media.model3d;
  if (!url) return null;

  const gltf = await loadGltf(url);
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  return fitToCatalogDimensions(gltf.scene, product.dimensions);
}

export { loadCatalogModel };
