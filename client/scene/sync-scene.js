import { all, enumerateInstances, get, unregister } from "./physics/registry.js";
import { placeProducts } from "./place-products.js";

function createSceneSync({ world, products }) {
  return function syncScene(scene, skus) {
    const occurrences = enumerateInstances(skus);
    const target = new Set(occurrences.map((item) => item.id));
    for (const [id, entry] of all()) {
      if (id === "floor") continue;
      if (target.has(id)) continue;
      if (entry.rigidBody) world.removeRigidBody(entry.rigidBody);
      if (entry.mesh) scene.remove(entry.mesh);
      unregister(id);
    }

    const fresh = [];
    for (const item of occurrences) {
      if (get(item.id)) continue;
      const product = products.find((row) => row.sku === item.sku);
      if (!product) continue;
      fresh.push({ id: item.id, product, copy: item.n });
    }
    if (fresh.length === 0) return;
    return placeProducts(scene, fresh);
  };
}

export { createSceneSync };
