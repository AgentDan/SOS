import { createDistanceLayer } from "./arrow.js";
import { formatDistanceLabel } from "./distance-label.js";
import { collectSurface } from "./mesh-surface.js";
import { all } from "./physics/registry.js";
import { selectPair } from "./select-pair.js";

function registrySurfaces() {
  const items = [];
  for (const [id, entry] of all()) {
    if (id === "floor" || !entry?.mesh) continue;
    const surface = collectSurface(entry.mesh);
    if (surface.indices.length < 3) continue;
    items.push({ id, vertices: surface.vertices, indices: surface.indices });
  }
  return items;
}

function createMeasure({ scene, camera, host, subscribeScene, subscribeDrag, arrow } = {}) {
  const overlay = arrow ?? createDistanceLayer({ scene, camera, host });
  const stopScene = subscribeScene(() => overlay.clear());
  const stopDrag = subscribeDrag(() => overlay.clear());

  function distance() {
    const chosen = selectPair(registrySurfaces());
    if (!chosen) {
      overlay.clear();
      return null;
    }
    const label = formatDistanceLabel(chosen.distanceMm);
    overlay.show({ pointA: chosen.pointA, pointB: chosen.pointB, label });
    return { ...chosen, label };
  }

  function render() {
    if (overlay.render) overlay.render();
  }

  function dispose() {
    stopScene();
    stopDrag();
    overlay.dispose();
  }

  return { distance, render, dispose };
}

export { createMeasure, registrySurfaces };
