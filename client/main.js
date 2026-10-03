import * as THREE from "three";
import { initScene } from "./renderer/scene.js";
import { RAPIER, initWorld, step } from "./physics/world.js";
import { createBodyFromCatalogItem, mmToM, framePartsForItem, getWorldTopY } from "./physics/bodies.js";
import { register, get, all, unregister } from "./physics/registry.js";
import { syncMeshes } from "./physics/sync.js";
import { initDragControls } from "./interaction/drag-controls.js";
import { loadCatalogModel } from "./renderer/load-model.js";
import { mountQuestionPanel } from "./dialog-ui/question-buttons.js";

const TYPE_COLORS = {
  desk_legs: 0x5c4033,
  desk_top: 0x8a6d4b,
  chair: 0x4a3728,
  monitor: 0x222222
};
const DEFAULT_COLOR = 0x888888;
const FLOOR_THICKNESS_M = 0.05;
const DROP_CLEARANCE_M = 0.3;

function boxMesh(dimensions, color) {
  const geometry = new THREE.BoxGeometry(
    mmToM(dimensions.width),
    mmToM(dimensions.height),
    mmToM(dimensions.depth)
  );
  const material = new THREE.MeshStandardMaterial({ color });
  return new THREE.Mesh(geometry, material);
}

function catalogMesh(product, color) {
  const parts = framePartsForItem(product);
  if (parts.length === 1) {
    return boxMesh(product.dimensions, color);
  }

  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color });
  for (const part of parts) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.half.x * 2, part.half.y * 2, part.half.z * 2),
      material
    );
    mesh.position.set(part.local.x, part.local.y, part.local.z);
    group.add(mesh);
  }
  return group;
}

function createFloor(world) {
  const halfExtents = { x: 2, y: FLOOR_THICKNESS_M / 2, z: 2 };
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfExtents.y, 0);
  const rigidBody = world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
  world.createCollider(colliderDesc, rigidBody);
  register("floor", { mesh: null, rigidBody });
}

function meshColorForType(type) {
  return TYPE_COLORS[type] ?? DEFAULT_COLOR;
}

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

async function main() {
  const catalog = await fetch("/api/catalog").then((res) => res.json());
  const products = catalog.products ?? [];

  function syncScene(scene, skus) {
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
  }

  const canvas = document.getElementById("scene-canvas");
  const world = await initWorld();

  const { scene, camera, controls } = initScene(canvas, {
    onFrame: () => {
      step();
      syncMeshes();
    }
  });

  createFloor(world);

  // TODO: заменить на настоящий clientId, когда появятся сессии — Этап 10
  const clientId = "local-test-client";
  const initialSkus = await fetch(`/api/dialog/scene?clientId=${clientId}`)
    .then((res) => res.json())
    .then((data) => data.skus);
  await syncScene(scene, initialSkus);

  initDragControls({ camera, canvas, controls });

  mountQuestionPanel(document.getElementById("question-panel"), clientId, async () => {
    const { skus } = await fetch(`/api/dialog/scene?clientId=${clientId}`).then((res) => res.json());
    await syncScene(scene, skus);
  });
}

main().catch((err) => {
  console.error("deskOS failed to start:", err);
});
