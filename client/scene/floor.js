import { register } from "./physics/registry.js";
import { RAPIER } from "./physics/world.js";

const FLOOR_THICKNESS_M = 0.05;

function createFloor(world) {
  const halfExtents = { x: 2, y: FLOOR_THICKNESS_M / 2, z: 2 };
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfExtents.y, 0);
  const rigidBody = world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
  world.createCollider(colliderDesc, rigidBody);
  register("floor", { mesh: null, rigidBody });
}

export { createFloor, FLOOR_THICKNESS_M };
