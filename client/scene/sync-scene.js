import { all, get, unregister } from "./physics/registry.js";
import { placeProducts } from "./place-products.js";

function createSceneSync({ world, products }) {
  return function syncScene(scene, skus) {
    const target = new Set(skus);
    for (const [id, entry] of all()) {
      if (id === "floor") continue;
      if (target.has(id)) continue;
      if (entry.rigidBody) world.removeRigidBody(entry.rigidBody);
      if (entry.mesh) scene.remove(entry.mesh);
      unregister(id);
    }

    const fresh = [];
    for (const sku of skus) {
      if (get(sku)) continue;
      const product = products.find((item) => item.sku === sku);
      if (!product) continue;
      fresh.push(product);
    }
    if (fresh.length === 0) return;
    return placeProducts(scene, fresh);
  };
}

export { createSceneSync };
