import { useEffect, useRef, useState } from "react";
import { fetchCatalog } from "../api/catalog-api.js";
import { createFloor } from "./floor.js";
import { clear as clearRegistry } from "./physics/registry.js";
import { syncMeshes } from "./physics/sync.js";
import { disposeWorld, initWorld, step } from "./physics/world.js";
import { initScene } from "./renderer/scene.js";
import { createSceneSync } from "./sync-scene.js";

let gate = Promise.resolve();

function exclusive(task) {
  const run = gate.then(task, task);
  gate = run.then(
    () => {},
    () => {}
  );
  return run;
}

function SceneView({ skus, onReady }) {
  const canvasRef = useRef(null);
  const syncRef = useRef(null);
  const sceneRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const [booted, setBooted] = useState(false);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    let alive = true;
    let dispose = () => {};

    exclusive(async () => {
      if (!alive || !canvas) return;
      let worldReady = false;
      let view = null;
      let done = false;
      dispose = () => {
        if (done) return;
        done = true;
        if (view) view.dispose();
        if (worldReady) disposeWorld();
        clearRegistry();
        syncRef.current = null;
        sceneRef.current = null;
      };
      try {
        const catalog = await fetchCatalog();
        if (!alive) return;
        const products = catalog.products ?? [];
        const world = await initWorld();
        worldReady = true;
        if (!alive) {
          dispose();
          return;
        }
        const syncScene = createSceneSync({ world, products });
        view = initScene(canvas, {
          onFrame: () => {
            step();
            syncMeshes();
          }
        });
        createFloor(world);
        if (!alive) {
          dispose();
          return;
        }
        syncRef.current = syncScene;
        sceneRef.current = view.scene;
        setBooted(true);
      } catch (err) {
        console.error("SOS failed to start:", err);
        dispose();
      }
    });

    return () => {
      alive = false;
      exclusive(async () => {
        dispose();
      });
    };
  }, []);

  useEffect(() => {
    if (!booted || skus == null) return undefined;
    let cancelled = false;
    const list = skus;
    exclusive(async () => {
      const syncScene = syncRef.current;
      const scene = sceneRef.current;
      if (cancelled || !syncScene || !scene) return;
      try {
        await syncScene(scene, list);
      } catch (err) {
        if (!cancelled) console.error("SOS failed to start:", err);
        return;
      }
      if (cancelled || !syncRef.current) return;
      onReadyRef.current?.();
    });
    return () => {
      cancelled = true;
    };
  }, [booted, skus]);

  return <canvas id="scene-canvas" ref={canvasRef} className="block" />;
}

export { SceneView };
