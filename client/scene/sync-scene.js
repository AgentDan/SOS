import { all, enumerateInstances, get, unregister } from "./physics/registry.js";
import { placeProducts, reseatCopies } from "./place-products.js";

function createSceneSync({ world, products, types }) {
  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function syncScene(scene, skus) {
    const occurrences = enumerateInstances(skus);
    const target = new Set(occurrences.map((item) => item.id));
    let changed = false;
    const removedSkus = [];
    for (const [id, entry] of all()) {
      if (id === "floor") continue;
      if (target.has(id)) continue;
      if (typeof entry?.product?.sku === "string") removedSkus.push(entry.product.sku);
      if (entry.rigidBody) world.removeRigidBody(entry.rigidBody);
      if (entry.mesh) scene.remove(entry.mesh);
      unregister(id);
      changed = true;
    }

    const fresh = [];
    for (const item of occurrences) {
      if (get(item.id)) continue;
      const product = products.find((row) => row.sku === item.sku);
      if (!product) continue;
      fresh.push({ id: item.id, product, copy: item.n });
    }
    if (fresh.length > 0) changed = true;
    if (changed) notify();
    if (removedSkus.length > 0) reseatCopies({ skus: removedSkus });
    if (fresh.length === 0) return;
    return placeProducts(scene, fresh, types);
  }

  return { syncScene, subscribe };
}

export { createSceneSync };
