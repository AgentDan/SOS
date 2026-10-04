import { initScene } from "./scene/renderer/scene.js";
import { initWorld, step } from "./scene/physics/world.js";
import { syncMeshes } from "./scene/physics/sync.js";
import { initDragControls } from "./scene/interaction/drag-controls.js";
import { createFloor } from "./scene/floor.js";
import { createSceneSync } from "./scene/sync-scene.js";
import { fetchCatalog } from "./api/catalog-api.js";
import { fetchScene } from "./api/dialog-api.js";
import { getClientId } from "./session/client-id.js";
import { mountQuestionPanel } from "./chat/question-buttons.js";

async function main() {
  const catalog = await fetchCatalog();
  const products = catalog.products ?? [];

  const canvas = document.getElementById("scene-canvas");
  const world = await initWorld();
  const syncScene = createSceneSync({ world, products });

  const { scene, camera, controls } = initScene(canvas, {
    onFrame: () => {
      step();
      syncMeshes();
    }
  });

  createFloor(world);

  const clientId = getClientId();
  const { skus: initialSkus } = await fetchScene(clientId);
  await syncScene(scene, initialSkus);

  initDragControls({ camera, canvas, controls });

  mountQuestionPanel(document.getElementById("question-panel"), clientId, async () => {
    const { skus } = await fetchScene(clientId);
    await syncScene(scene, skus);
  });
}

main().catch((err) => {
  console.error("deskOS failed to start:", err);
});
