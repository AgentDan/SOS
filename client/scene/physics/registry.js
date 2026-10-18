// Central lookup for every physics-backed object in the scene.
// Instance id is `${sku}#${n}` (n starts at 1). Floor stays "floor".
// id -> { mesh, rigidBody, product, position, hostId, moved? }
// moved: the user dragged this copy, so auto layout does not shift it.
const registry = new Map();

function instanceKey(sku, n) {
  return `${sku}#${n}`;
}

function enumerateInstances(skus) {
  const seen = new Map();
  const items = [];
  const list = Array.isArray(skus) ? skus : [];
  for (const sku of list) {
    const n = (seen.get(sku) ?? 0) + 1;
    seen.set(sku, n);
    items.push({ sku, n, id: instanceKey(sku, n) });
  }
  return items;
}

function register(id, entry) {
  registry.set(id, entry);
}

function get(id) {
  return registry.get(id);
}

function all() {
  return registry;
}

function unregister(id) {
  const entry = registry.get(id);
  registry.delete(id);
  return entry ?? null;
}

function clear() {
  registry.clear();
}

export { instanceKey, enumerateInstances, register, get, all, unregister, clear };
