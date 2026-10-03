import { RAPIER, getWorld } from "./world.js";

const MM_TO_M = 1 / 1000;
const LEG_SECTION_MM = 50;
const RAIL_SECTION_MM = 40;
const LEG_INSET_MM = 20;

function mmToM(mm) {
  return mm * MM_TO_M;
}

// Four corner posts plus a rectangular apron near the top (one rigid body).
function deskFrameParts(dimensions) {
  const w = mmToM(dimensions.width);
  const d = mmToM(dimensions.depth);
  const h = mmToM(dimensions.height);
  const leg = mmToM(LEG_SECTION_MM);
  const rail = mmToM(RAIL_SECTION_MM);
  const inset = mmToM(LEG_INSET_MM);

  const x = w / 2 - inset - leg / 2;
  const z = d / 2 - inset - leg / 2;
  const hy = h / 2;
  const railY = hy - rail / 2;
  const parts = [];

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        half: { x: leg / 2, y: hy, z: leg / 2 },
        local: { x: sx * x, y: 0, z: sz * z }
      });
    }
  }

  for (const sz of [-1, 1]) {
    parts.push({
      half: { x: x + leg / 2, y: rail / 2, z: rail / 2 },
      local: { x: 0, y: railY, z: sz * z }
    });
  }

  for (const sx of [-1, 1]) {
    parts.push({
      half: { x: rail / 2, y: rail / 2, z: z + leg / 2 },
      local: { x: sx * x, y: railY, z: 0 }
    });
  }

  return parts;
}

function chairParts(dimensions) {
  const w = mmToM(dimensions.width);
  const d = mmToM(dimensions.depth);
  const h = mmToM(dimensions.height);
  const leg = mmToM(35);
  const seatT = mmToM(40);
  const backT = mmToM(22);
  const rail = mmToM(28);
  const inset = mmToM(12);
  const hy = h / 2;
  const parts = [];

  const seatTopFromFloor = Math.min(mmToM(450), h - mmToM(350));
  const seatTop = -hy + seatTopFromFloor;
  const seatY = seatTop - seatT / 2;
  const backH = h - seatTopFromFloor;
  const seatHalfX = w / 2 - inset * 0.25;
  const seatHalfZ = (d - backT) / 2;

  parts.push({
    half: { x: seatHalfX, y: seatT / 2, z: seatHalfZ },
    local: { x: 0, y: seatY, z: -backT / 2 }
  });

  parts.push({
    half: { x: seatHalfX, y: backH / 2, z: backT / 2 },
    local: { x: 0, y: seatTop + backH / 2, z: d / 2 - backT / 2 }
  });

  const legH = seatTopFromFloor - seatT;
  const legY = -hy + legH / 2;
  const x = w / 2 - inset - leg / 2;
  const zFront = -d / 2 + inset + leg / 2;
  const zBack = d / 2 - backT - inset - leg / 2;

  for (const sx of [-1, 1]) {
    for (const z of [zFront, zBack]) {
      parts.push({
        half: { x: leg / 2, y: legH / 2, z: leg / 2 },
        local: { x: sx * x, y: legY, z }
      });
    }
  }

  const railY = seatY - seatT / 2 - rail / 2;
  for (const z of [zFront, zBack]) {
    parts.push({
      half: { x, y: rail / 2, z: rail / 2 },
      local: { x: 0, y: railY, z }
    });
  }

  const zMid = (zFront + zBack) / 2;
  const zSpan = Math.abs(zBack - zFront) / 2;
  for (const sx of [-1, 1]) {
    parts.push({
      half: { x: rail / 2, y: rail / 2, z: zSpan },
      local: { x: sx * x, y: railY, z: zMid }
    });
  }

  return parts;
}

function framePartsForItem(item) {
  if (item.type === "desk_legs") return deskFrameParts(item.dimensions);
  if (item.type === "chair") return chairParts(item.dimensions);
  return [
    {
      half: {
        x: mmToM(item.dimensions.width) / 2,
        y: mmToM(item.dimensions.height) / 2,
        z: mmToM(item.dimensions.depth) / 2
      },
      local: { x: 0, y: 0, z: 0 }
    }
  ];
}

function createBodyFromCatalogItem(item, { position = { x: 0, y: 0, z: 0 } } = {}) {
  const world = getWorld();

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
  bodyDesc.setTranslation(position.x, position.y, position.z);

  const rigidBody = world.createRigidBody(bodyDesc);

  for (const part of framePartsForItem(item)) {
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

const REST_MAX_GAP = 0.05;
const REST_MIN_GAP = -0.08;

function colliderRestsOn(upper, lower) {
  const overlapX = upper.minX < lower.maxX && upper.maxX > lower.minX;
  const overlapZ = upper.minZ < lower.maxZ && upper.maxZ > lower.minZ;
  if (!overlapX || !overlapZ) return false;

  const gap = upper.minY - lower.maxY;
  if (gap > REST_MAX_GAP || gap < REST_MIN_GAP) return false;

  const supportHeight = lower.maxY - lower.minY;
  const minRise = Math.min(0.02, supportHeight * 0.5);
  return upper.minY > lower.minY + minRise;
}

function isRestingOn(upperBody, lowerBody) {
  const upperCount = upperBody.numColliders();
  const lowerCount = lowerBody.numColliders();

  for (let i = 0; i < upperCount; i++) {
    const upper = cuboidWorldAabb(upperBody.collider(i));
    for (let j = 0; j < lowerCount; j++) {
      const lower = cuboidWorldAabb(lowerBody.collider(j));
      if (colliderRestsOn(upper, lower)) return true;
    }
  }

  return false;
}

export { createBodyFromCatalogItem, mmToM, framePartsForItem, getWorldTopY, isRestingOn };
