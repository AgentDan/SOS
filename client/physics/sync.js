import { all } from "./registry.js";

// Copies each rigid body's transform onto its mesh. Call after world.step().
function syncMeshes() {
  for (const { mesh, rigidBody } of all().values()) {
    if (!mesh || !rigidBody) continue;

    const t = rigidBody.translation();
    const r = rigidBody.rotation();

    mesh.position.set(t.x, t.y, t.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

export { syncMeshes };
