// Central lookup for every physics-backed object in the scene.
// id -> { mesh, rigidBody }
const registry = new Map();

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

export { register, get, all, unregister };
