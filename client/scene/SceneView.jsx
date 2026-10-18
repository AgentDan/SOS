import { useEffect, useRef, useState } from "react";
import { fetchCatalog } from "../api/catalog-api.js";
import { createDrag } from "./drag.js";
import { createFloor } from "./floor.js";
import { createMeasure } from "./measure.js";
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

function SceneView({ skus, onReady, distanceToken = 0, measure = null, onDistance }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const syncRef = useRef(null);
  const sceneRef = useRef(null);
  const measureRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onDistanceRef = useRef(onDistance);
  const [booted, setBooted] = useState(false);
  onReadyRef.current = onReady;
  onDistanceRef.current = onDistance;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    let alive = true;
    let dispose = () => {};

    exclusive(async () => {
      if (!alive || !canvas || !host) return;
      let worldReady = false;
      let view = null;
      let drag = null;
      let measure = null;
      let done = false;
      dispose = () => {
        if (done) return;
        done = true;
        if (measure) measure.dispose();
        if (drag) drag.dispose();
        if (view) view.dispose();
        if (worldReady) disposeWorld();
        clearRegistry();
        syncRef.current = null;
        sceneRef.current = null;
        measureRef.current = null;
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
        const sync = createSceneSync({ world, products, types: catalog.types ?? [] });
        view = initScene(canvas, {
          onFrame: () => {
            if (drag) drag.apply();
            step();
            syncMeshes();
            if (measure) measure.render();
          }
        });
        drag = createDrag({ canvas, camera: view.camera, controls: view.controls });
        createFloor(world);
        measure = createMeasure({
          scene: view.scene,
          camera: view.camera,
          host,
          subscribeScene: sync.subscribe,
          subscribeDrag: drag.subscribe
        });
        if (!alive) {
          dispose();
          return;
        }
        syncRef.current = sync.syncScene;
        sceneRef.current = view.scene;
        measureRef.current = measure;
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

  useEffect(() => {
    if (!booted || !distanceToken) return undefined;
    let cancelled = false;
    const token = distanceToken;
    const a = measure?.a;
    const b = measure?.b;
    exclusive(async () => {
      if (cancelled) return;
      let label = null;
      try {
        if (measureRef.current && typeof a === "string" && typeof b === "string") {
          label = measureRef.current.distance({ a, b })?.label ?? null;
        }
      } catch (err) {
        if (!cancelled) console.error("Distance failed:", err);
      }
      if (!cancelled) onDistanceRef.current?.({ token, label });
    });
    return () => {
      cancelled = true;
    };
  }, [booted, distanceToken, measure]);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      <canvas id="scene-canvas" ref={canvasRef} className="block" />
    </div>
  );
}

export { SceneView };
