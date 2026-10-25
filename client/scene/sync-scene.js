import { moveToPose, placeProducts, placementFor, poseOf } from "./place-products.js";
import { all, enumerateInstances, get, unregister } from "./physics/registry.js";
import { loadPersonModel } from "./renderer/load-model.js";

function sceneSignature(skus, placements, person) {
  return JSON.stringify({
    skus: Array.isArray(skus) ? skus : [],
    placements: Array.isArray(placements)
      ? placements.map((item) => ({
          sku: item?.sku ?? null,
          x: item?.x ?? null,
          y: item?.y ?? null,
          z: item?.z ?? null,
          rotY: item?.rotY ?? null
        }))
      : null,
    person: personFields(person)
  });
}

function personFields(person) {
  if (!person || typeof person !== "object" || Array.isArray(person)) return null;
  return {
    sku: person.sku ?? null,
    x: person.x ?? null,
    y: person.y ?? null,
    z: person.z ?? null,
    rotY: person.rotY ?? null,
    scale: person.scale ?? null
  };
}

function visiblePersonKey(person, showPerson) {
  if (showPerson !== true) return "";
  const fields = personFields(person);
  if (!fields || typeof fields.sku !== "string" || fields.sku.length === 0) return "";
  return JSON.stringify(fields);
}

function posePerson(mesh, person) {
  const pose = poseOf(person);
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.rotation.set(0, (pose.rotY * Math.PI) / 180, 0);
  const scale = Number(person && person.scale);
  mesh.scale.setScalar(Number.isFinite(scale) ? scale : 1);
}

function disposeMesh(mesh) {
  const materials = new Set();
  mesh.traverse((obj) => {
    if (obj.geometry && typeof obj.geometry.dispose === "function") obj.geometry.dispose();
    const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const material of list) materials.add(material);
  });
  for (const material of materials) {
    if (typeof material.dispose === "function") material.dispose();
  }
}

function createSceneSync({ world, products, loadModel, loadPerson = loadPersonModel } = {}) {
  const catalog = Array.isArray(products) ? products : [];
  let appliedKey = null;
  let personMesh = null;
  let personKey = "";
  let personToken = 0;

  function productOf(sku) {
    return catalog.find((row) => row && row.sku === sku);
  }

  function removePerson(scene) {
    if (!personMesh) return;
    scene.remove(personMesh);
    disposeMesh(personMesh);
    personMesh = null;
  }

  async function syncProducts(scene, skus, placements) {
    const occurrences = [];
    for (const item of enumerateInstances(skus)) {
      const product = productOf(item.sku);
      if (!product || product.type === "person") continue;
      occurrences.push({
        ...item,
        product,
        pose: poseOf(placementFor(placements, item.sku, item.n))
      });
    }
    const target = new Set(occurrences.map((item) => item.id));
    for (const id of [...all().keys()]) {
      if (id === "floor" || target.has(id)) continue;
      const entry = all().get(id);
      if (entry?.rigidBody && world) world.removeRigidBody(entry.rigidBody);
      if (entry?.mesh) scene.remove(entry.mesh);
      unregister(id);
    }

    const fresh = [];
    const hasPlacements = Array.isArray(placements);
    for (const item of occurrences) {
      const existing = get(item.id);
      if (existing) {
        if (hasPlacements) moveToPose(existing, item.pose);
        continue;
      }
      fresh.push(item);
    }
    if (fresh.length > 0) await placeProducts(scene, fresh, loadModel);
  }

  async function syncPerson(scene, person, showPerson) {
    const key = visiblePersonKey(person, showPerson);
    if (key === personKey && (key === "" || personMesh)) return;
    const token = ++personToken;
    personKey = key;
    removePerson(scene);
    if (key === "") return;

    const product = productOf(person.sku);
    if (!product) {
      console.error(`SOS failed to start: ${person.sku}: нет модели манекена`);
      return;
    }
    let loaded;
    try {
      loaded = await loadPerson(product);
    } catch (err) {
      if (token !== personToken) return;
      console.error("SOS failed to start:", err);
      return;
    }
    if (token !== personToken) {
      if (loaded?.object) disposeMesh(loaded.object);
      return;
    }
    personMesh = loaded.object;
    posePerson(personMesh, person);
    scene.add(personMesh);
  }

  async function syncScene(scene, skus, placements, person, options = {}) {
    const key = sceneSignature(skus, placements, person);
    if (key !== appliedKey) {
      await syncProducts(scene, skus, placements);
      appliedKey = key;
    }
    await syncPerson(scene, person, options.showPerson === true);
  }

  return { syncScene };
}

export { createSceneSync };
