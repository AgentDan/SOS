import { loadCatalogModel } from "./renderer/load-model.js";
import { createBodyFromCatalogItem, mmToM } from "./physics/bodies.js";
import { enumerateInstances, register } from "./physics/registry.js";
import { RAPIER } from "./physics/world.js";
import { withColliderWire } from "./meshes.js";

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function placementFor(placements, sku, n) {
  if (!Array.isArray(placements)) return null;
  let seen = 0;
  for (const place of placements) {
    if (!place || place.sku !== sku) continue;
    seen += 1;
    if (seen === n) return place;
  }
  return null;
}

function poseOf(place) {
  if (!place || typeof place !== "object") return { x: 0, y: 0, z: 0, rotY: 0 };
  return {
    x: mmToM(numberOr(place.x, 0)),
    y: mmToM(numberOr(place.y, 0)),
    z: mmToM(numberOr(place.z, 0)),
    rotY: numberOr(place.rotY, 0)
  };
}

function posesFor(skus, placements) {
  return enumerateInstances(skus).map((item) => ({
    ...item,
    pose: poseOf(placementFor(placements, item.sku, item.n))
  }));
}

function rotationOf(rotY) {
  const half = (numberOr(rotY, 0) * Math.PI) / 360;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function poseObject(object, pose) {
  if (!object) return;
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.set(0, (numberOr(pose.rotY, 0) * Math.PI) / 180, 0);
}

function bodyIsFixed(body) {
  return Boolean(body && typeof body.isFixed === "function" && body.isFixed());
}

function applyBodyPose(body, pose) {
  if (!body || (typeof body.isValid === "function" && !body.isValid())) return;
  const fixed = bodyIsFixed(body);
  if (!fixed && typeof body.setBodyType === "function") {
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }
  if (!fixed && typeof body.setEnabledRotations === "function") {
    body.setEnabledRotations(false, true, false, true);
  }
  if (typeof body.setTranslation === "function") {
    body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
  }
  if (typeof body.setRotation === "function") body.setRotation(rotationOf(pose.rotY), true);
  if (!fixed && typeof body.setLinvel === "function") body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  if (!fixed && typeof body.setAngvel === "function") body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

function moveToPose(entry, pose) {
  if (!entry) return;
  applyBodyPose(entry.rigidBody, pose);
  poseObject(entry.mesh, pose);
  entry.position = { x: pose.x, y: pose.y, z: pose.z };
  entry.rotY = pose.rotY;
  entry.moved = false;
}

async function placeProducts(scene, items, loadModel = loadCatalogModel) {
  for (const item of items) {
    const loaded = await loadModel(item.product);
    const pose = item.pose ?? poseOf(null);
    const { rigidBody } = createBodyFromCatalogItem(item.product, {
      position: { x: pose.x, y: pose.y, z: pose.z },
      parts: loaded.parts
    });
    const mesh = withColliderWire(loaded.object, loaded.parts);
    const entry = {
      mesh,
      rigidBody,
      product: item.product,
      position: { x: pose.x, y: pose.y, z: pose.z },
      rotY: pose.rotY,
      moved: false
    };
    scene.add(mesh);
    register(item.id, entry);
    moveToPose(entry, pose);
  }
}

export { placeProducts, posesFor, poseOf, placementFor, moveToPose };
