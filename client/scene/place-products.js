import { loadCatalogModel } from "./renderer/load-model.js";
import { createBodyFromCatalogItem, getWorldTopY, mmToM } from "./physics/bodies.js";
import { all, get, register } from "./physics/registry.js";
import { copyOffsetX } from "./copies.js";
import { withColliderWire } from "./meshes.js";

const DROP_CLEARANCE_M = 0.3;

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

function occupantsOf(hostId, hostEntry, entries) {
  const hostX = liveX(hostEntry) ?? 0;
  const taken = [];
  for (const entry of entries) {
    if (entry?.hostId !== hostId) continue;
    const width = Number(entry.product?.dimensions?.width);
    const x = liveX(entry);
    if (!Number.isFinite(width) || x === null) continue;
    taken.push({ x: (x - hostX) * 1000, width });
  }
  return taken;
}

function pickHostId(hostSku, entries) {
  let bestId = null;
  let bestLoad = Infinity;
  const list = [...entries];
  for (const [id, entry] of list) {
    if (entry?.product?.sku !== hostSku) continue;
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

function resolveHost(hostSku) {
  if (!hostSku) return { id: "floor", entry: get("floor") };
  const id = pickHostId(hostSku, all());
  if (!id) return null;
  const entry = get(id);
  return entry ? { id, entry } : null;
}

function placeProducts(scene, items) {
  const queue = [...items];

  async function placeOne(item, host, hostId) {
    const product = item.product;
    const hostSku = product.placement?.hostSku ?? null;
    const isAnchored = hostSku == null;
    const productHalfHeight = mmToM(product.dimensions.height) / 2;
    const drop =
      !isAnchored && mmToM(product.dimensions.height) > 0.1 ? DROP_CLEARANCE_M : 0;
    const y = getWorldTopY(host.rigidBody) + productHalfHeight + drop;
    const xMm = copyOffsetX(item.copy, {
      offsetX: product.placement?.offset?.x ?? 0,
      itemWidth: Number(product.dimensions?.width),
      hostWidth: Number(host.product?.dimensions?.width),
      occupied: occupantsOf(hostId, host, all().values())
    });
    const x = mmToM(xMm);
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
      let placedThisPass = 0;

      for (const item of queue) {
        const hostSku = item.product.placement?.hostSku ?? null;
        const resolved = resolveHost(hostSku);

        if (!resolved?.entry) {
          remaining.push(item);
          continue;
        }

        await placeOne(item, resolved.entry, resolved.id);
        placedThisPass += 1;
      }

      if (placedThisPass === 0) {
        const leftover = remaining.map((item) => item.id).join(", ");
        console.error(
          `Could not place products; host is missing or cyclic: ${leftover}`
        );
        break;
      }

      queue.length = 0;
      queue.push(...remaining);
    }
  })();
}

export { placeProducts, pickHostId };
