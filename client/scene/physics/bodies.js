import { RAPIER, getWorld } from "./world.js";

const MM_TO_M = 1 / 1000;

function mmToM(mm) {
  return mm * MM_TO_M;
}

function createBodyFromCatalogItem(item, { position = { x: 0, y: 0, z: 0 }, parts } = {}) {
  const sku = item && item.sku ? item.sku : "model";
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error(`${sku}: нет частей коллайдера`);
  }

  const world = getWorld();
  // Held on the server pose. Gravity must not drop a mesh whose size differs from the catalog.
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
  bodyDesc.setTranslation(position.x, position.y, position.z);
  const rigidBody = world.createRigidBody(bodyDesc);
  rigidBody.setGravityScale(0, true);

  for (const part of parts) {
    const colliderDesc = RAPIER.ColliderDesc.cuboid(part.half.x, part.half.y, part.half.z);
    colliderDesc.setTranslation(part.local.x, part.local.y, part.local.z);
    world.createCollider(colliderDesc, rigidBody);
  }

  return { rigidBody };
}

function getWorldTopY(rigidBody) {
  return bodyWorldAabb(rigidBody).maxY;
}

function cuboidWorldAabb(collider) {
  const t = collider.translation();
  const r = collider.rotation();
  const h = collider.shape.halfExtents;
  const e = rotatedCuboidAabbExtents(r, h);
  return {
    minX: t.x - e.x,
    maxX: t.x + e.x,
    minY: t.y - e.y,
    maxY: t.y + e.y,
    minZ: t.z - e.z,
    maxZ: t.z + e.z
  };
}

function rotatedCuboidAabbExtents(rot, half) {
  const { x, y, z, w } = rot;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  const r00 = 1 - 2 * (yy + zz);
  const r01 = 2 * (xy - wz);
  const r02 = 2 * (xz + wy);
  const r10 = 2 * (xy + wz);
  const r11 = 1 - 2 * (xx + zz);
  const r12 = 2 * (yz - wx);
  const r20 = 2 * (xz - wy);
  const r21 = 2 * (yz + wx);
  const r22 = 1 - 2 * (xx + yy);

  return {
    x: Math.abs(r00) * half.x + Math.abs(r01) * half.y + Math.abs(r02) * half.z,
    y: Math.abs(r10) * half.x + Math.abs(r11) * half.y + Math.abs(r12) * half.z,
    z: Math.abs(r20) * half.x + Math.abs(r21) * half.y + Math.abs(r22) * half.z
  };
}

function bodyWorldAabb(rigidBody) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const count = rigidBody.numColliders();
  for (let i = 0; i < count; i++) {
    const aabb = cuboidWorldAabb(rigidBody.collider(i));
    minX = Math.min(minX, aabb.minX);
    minY = Math.min(minY, aabb.minY);
    minZ = Math.min(minZ, aabb.minZ);
    maxX = Math.max(maxX, aabb.maxX);
    maxY = Math.max(maxY, aabb.maxY);
    maxZ = Math.max(maxZ, aabb.maxZ);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export { createBodyFromCatalogItem, mmToM, getWorldTopY };
