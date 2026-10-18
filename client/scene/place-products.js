import { loadCatalogModel } from "./renderer/load-model.js";
import { createBodyFromCatalogItem, getWorldTopY, mmToM } from "./physics/bodies.js";
import { all, get, register } from "./physics/registry.js";
import { layoutCopyXs } from "./copies.js";
import { withColliderWire } from "./meshes.js";

const DROP_CLEARANCE_M = 0.3;
const SHIFT_EPS_M = 0.0005;

function instanceOrder(id) {
  const match = /#(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : 0;
}

function liveX(entry) {
  const body = entry?.rigidBody;
  if (body && (typeof body.isValid !== "function" || body.isValid())) {
    const translation = typeof body.translation === "function" ? body.translation() : null;
    const x = Number(translation?.x);
    if (Number.isFinite(x)) return x;
  }
  const stored = Number(entry?.position?.x);
  return Number.isFinite(stored) ? stored : null;
}

function livePoint(entry) {
  const body = entry?.rigidBody;
  if (body && (typeof body.isValid !== "function" || body.isValid())) {
    const translation = typeof body.translation === "function" ? body.translation() : null;
    const y = Number(translation?.y);
    const z = Number(translation?.z);
    const x = Number(translation?.x);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x, y, z };
  }
  const stored = entry?.position;
  return {
    x: Number.isFinite(Number(stored?.x)) ? Number(stored.x) : 0,
    y: Number.isFinite(Number(stored?.y)) ? Number(stored.y) : 0,
    z: Number.isFinite(Number(stored?.z)) ? Number(stored.z) : 0
  };
}

function pickLeastLoaded(entries, accept) {
  let bestId = null;
  let bestLoad = Infinity;
  const list = [...entries];
  for (const [id, entry] of list) {
    if (!accept(entry)) continue;
    let load = 0;
    for (const [, other] of list) {
      if (other?.hostId === id) load += 1;
    }
    const order = instanceOrder(id);
    const bestOrder = bestId === null ? Infinity : instanceOrder(bestId);
    if (bestId === null || load < bestLoad || (load === bestLoad && order < bestOrder)) {
      bestId = id;
      bestLoad = load;
    }
  }
  return bestId;
}

function pickHostId(hostSku, entries) {
  if (typeof hostSku !== "string" || hostSku.length === 0) return null;
  return pickLeastLoaded(entries, (entry) => entry?.product?.sku === hostSku);
}

function hostTypesFor(product, types) {
  const typeId = product?.type;
  if (typeof typeId !== "string" || !Array.isArray(types)) return [];
  const type = types.find((row) => row?.id === typeId);
  return Array.isArray(type?.canHostOn) ? type.canHostOn.filter((id) => typeof id === "string") : [];
}

function pickHostByType(typeIds, entries) {
  const allowed = new Set(Array.isArray(typeIds) ? typeIds : []);
  if (allowed.size === 0) return null;
  return pickLeastLoaded(entries, (entry) => allowed.has(entry?.product?.type));
}

function resolveHost(product, types) {
  const hostSku = product?.placement?.hostSku ?? null;
  if (!hostSku) return { id: "floor", entry: get("floor") };
  const entries = all();
  const id = pickHostId(hostSku, entries) ?? pickHostByType(hostTypesFor(product, types), entries);
  if (!id) return null;
  const entry = get(id);
  return entry ? { id, entry } : null;
}

function copiesOnHost(hostId, sku) {
  const found = [];
  for (const [id, entry] of all()) {
    if (entry?.hostId !== hostId || entry?.product?.sku !== sku) continue;
    found.push({ id, entry });
  }
  found.sort((left, right) => instanceOrder(left.id) - instanceOrder(right.id));
  return found;
}

function occupiedMm(hostId, hostEntry, sku) {
  const hostX = liveX(hostEntry) ?? 0;
  const taken = [];
  for (const [, entry] of all()) {
    if (entry?.hostId !== hostId) continue;
    if (entry?.product?.sku === sku && !entry.moved) continue;
    const width = Number(entry?.product?.dimensions?.width);
    const x = liveX(entry);
    if (!Number.isFinite(width) || width <= 0 || x === null) continue;
    taken.push({ x: (x - hostX) * 1000, width });
  }
  return taken;
}

function shiftEntryX(entry, xMeters) {
  if (!entry || entry.moved) return;
  const point = livePoint(entry);
  if (Math.abs(point.x - xMeters) <= SHIFT_EPS_M) {
    entry.position = { x: point.x, y: point.y, z: point.z };
    return;
  }
  const body = entry.rigidBody;
  const alive = body && (typeof body.isValid !== "function" || body.isValid());
  if (alive && typeof body.setTranslation === "function") {
    body.setTranslation({ x: xMeters, y: point.y, z: point.z }, true);
    if (typeof body.setLinvel === "function") body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    if (typeof body.setAngvel === "function") body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (typeof body.wakeUp === "function") body.wakeUp();
  }
  entry.position = { x: xMeters, y: point.y, z: point.z };
}

function arrangeCopies({ hostId, sku, additions = [] }) {
  const hostEntry = get(hostId);
  if (!hostEntry || typeof sku !== "string" || sku.length === 0) return {};
  const own = copiesOnHost(hostId, sku);
  const incoming = additions
    .filter((item) => item && typeof item.id === "string")
    .slice()
    .sort((left, right) => instanceOrder(left.id) - instanceOrder(right.id));
  const product = incoming[0]?.product ?? own[0]?.entry?.product;
  if (!product) return {};
  const unmoved = own.filter((item) => !item.entry.moved);
  const hostX = liveX(hostEntry) ?? 0;
  const xs = layoutCopyXs({
    count: unmoved.length + incoming.length,
    itemWidth: Number(product.dimensions?.width),
    hostWidth: Number(hostEntry.product?.dimensions?.width),
    offsetX: product.placement?.offset?.x ?? 0,
    occupied: occupiedMm(hostId, hostEntry, sku)
  });
  unmoved.forEach((item, index) => {
    const xMm = xs[index];
    if (!Number.isFinite(xMm)) return;
    shiftEntryX(item.entry, hostX + mmToM(xMm));
  });
  const planned = {};
  incoming.forEach((item, index) => {
    const xMm = xs[unmoved.length + index];
    if (!Number.isFinite(xMm)) return;
    planned[item.id] = hostX + mmToM(xMm);
  });
  return planned;
}

function reseatCopies({ skus }) {
  const wanted = new Set(Array.isArray(skus) ? skus : []);
  const groups = new Map();
  for (const [, entry] of all()) {
    const sku = entry?.product?.sku;
    if (!wanted.has(sku) || typeof entry?.hostId !== "string") continue;
    groups.set(`${entry.hostId}\0${sku}`, { hostId: entry.hostId, sku });
  }
  for (const group of groups.values()) {
    arrangeCopies({ hostId: group.hostId, sku: group.sku, additions: [] });
  }
}

function placeProducts(scene, items, types = []) {
  const queue = [...items];

  async function placeOne(item, host, hostId, xMeters) {
    const product = item.product;
    const hostSku = product.placement?.hostSku ?? null;
    const isAnchored = hostSku == null;
    const productHalfHeight = mmToM(product.dimensions.height) / 2;
    const drop =
      !isAnchored && mmToM(product.dimensions.height) > 0.1 ? DROP_CLEARANCE_M : 0;
    const y = getWorldTopY(host.rigidBody) + productHalfHeight + drop;
    const x = Number.isFinite(xMeters) ? xMeters : 0;
    const z = mmToM(product.placement?.offset?.z ?? 0);

    const loaded = await loadCatalogModel(product);
    const { rigidBody } = createBodyFromCatalogItem(product, {
      position: { x, y, z },
      parts: loaded.parts
    });
    const mesh = withColliderWire(loaded.object, loaded.parts);
    scene.add(mesh);
    register(item.id, { mesh, rigidBody, product, position: { x, y, z }, hostId });
  }

  return (async () => {
    while (queue.length > 0) {
      const remaining = [];
      const ready = [];

      for (const item of queue) {
        const resolved = resolveHost(item.product, types);

        if (!resolved?.entry) {
          remaining.push(item);
          continue;
        }

        ready.push({ item, host: resolved.entry, hostId: resolved.id });
      }

      if (ready.length === 0) {
        const leftover = remaining.map((item) => item.id).join(", ");
        console.error(
          `Could not place products; host is missing or cyclic: ${leftover}`
        );
        break;
      }

      const groups = new Map();
      for (const row of ready) {
        const key = `${row.hostId}\0${row.item.product.sku}`;
        if (!groups.has(key)) {
          groups.set(key, { host: row.host, hostId: row.hostId, items: [] });
        }
        groups.get(key).items.push(row.item);
      }

      for (const group of groups.values()) {
        const sku = group.items[0].product.sku;
        const planned = arrangeCopies({ hostId: group.hostId, sku, additions: group.items });
        for (const item of group.items) {
          await placeOne(item, group.host, group.hostId, planned[item.id]);
        }
      }

      queue.length = 0;
      queue.push(...remaining);
    }
  })();
}

export { placeProducts, pickHostId, pickHostByType, hostTypesFor, arrangeCopies, reseatCopies };
