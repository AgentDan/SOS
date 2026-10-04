import { loadCatalogModel } from "./renderer/load-model.js";
import { createBodyFromCatalogItem, getWorldTopY, mmToM } from "./physics/bodies.js";
import { get, register } from "./physics/registry.js";
import { catalogMesh, meshColorForType } from "./meshes.js";

const DROP_CLEARANCE_M = 0.3;

function placeProducts(scene, products) {
  const queue = [...products];

  async function placeOne(product, host) {
    const hostSku = product.placement?.hostSku ?? null;
    const isAnchored = hostSku == null;
    const productHalfHeight = mmToM(product.dimensions.height) / 2;
    const drop =
      !isAnchored && mmToM(product.dimensions.height) > 0.1 ? DROP_CLEARANCE_M : 0;
    const y = getWorldTopY(host.rigidBody) + productHalfHeight + drop;
    const x = mmToM(product.placement?.offset?.x ?? 0);
    const z = mmToM(product.placement?.offset?.z ?? 0);

    const { rigidBody } = createBodyFromCatalogItem(product, {
      position: { x, y, z }
    });
    const mesh =
      (await loadCatalogModel(product)) ??
      catalogMesh(product, meshColorForType(product.type));
    scene.add(mesh);
    register(product.sku, { mesh, rigidBody });
  }

  return (async () => {
    while (queue.length > 0) {
      const remaining = [];
      let placedThisPass = 0;

      for (const product of queue) {
        const hostSku = product.placement?.hostSku ?? null;
        const hostId = hostSku ?? "floor";
        const host = get(hostId);

        if (!host) {
          remaining.push(product);
          continue;
        }

        await placeOne(product, host);
        placedThisPass += 1;
      }

      if (placedThisPass === 0) {
        const leftover = remaining.map((p) => p.sku).join(", ");
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

export { placeProducts, DROP_CLEARANCE_M };
