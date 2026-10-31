import { RAPIER, getWorld } from "./world.js";

const MM_TO_M = 1 / 1000;

// Mass is this density times the volume of the colliders, so a larger piece is heavier.
const COLLIDER_DENSITY = 500;
const LINEAR_DAMPING = 0.8;
const ANGULAR_DAMPING = 1.2;
const COLLIDER_FRICTION = 0.8;

function mmToM(mm) {
  return mm * MM_TO_M;
}

function catalogBodyIsFixed(item) {
  return Boolean(item && item.movable === false);
}

function createBodyFromCatalogItem(item, { position = { x: 0, y: 0, z: 0 }, parts } = {}) {
  const sku = item && item.sku ? item.sku : "model";
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error(`${sku}: нет частей коллайдера`);
  }

  const world = getWorld();
  const fixed = catalogBodyIsFixed(item);
  const bodyDesc = fixed
    ? RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    : RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinvel(0, 0, 0)
        .enabledRotations(false, true, false)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING)
        .setCanSleep(true)
        .setCcdEnabled(true);
  const rigidBody = world.createRigidBody(bodyDesc);

  for (const part of parts) {
    const colliderDesc = RAPIER.ColliderDesc.cuboid(part.half.x, part.half.y, part.half.z)
      .setTranslation(part.local.x, part.local.y, part.local.z)
      .setDensity(COLLIDER_DENSITY)
      .setFriction(COLLIDER_FRICTION)
      .setRestitution(0);
    world.createCollider(colliderDesc, rigidBody);
  }
  rigidBody.recomputeMassPropertiesFromColliders();

  return { rigidBody };
}

export { createBodyFromCatalogItem, mmToM };
