import { createDistanceLayer } from "./arrow.js";
import { formatDistanceLabel } from "./distance-label.js";
import { collectSurface } from "./mesh-surface.js";
import { all } from "./physics/registry.js";
import { compareInstanceId } from "./select-pair.js";
import { surfaceDistance } from "./surface-distance.js";

function skuOf(id) {
  return String(id).replace(/#\d+$/, "");
}

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

function pairResult(left, right) {
  const result = surfaceDistance(left.vertices, left.indices, right.vertices, right.indices);
  if (!result) return null;
  const swap = compareInstanceId(left.id, right.id) > 0;
  return {
    idA: swap ? right.id : left.id,
    idB: swap ? left.id : right.id,
    distanceMm: result.distanceMm,
    pointA: swap ? result.pointB : result.pointA,
    pointB: swap ? result.pointA : result.pointB
  };
}

function closestNamed(surfaces, a, b) {
  const groupA = surfaces.filter((item) => skuOf(item.id) === a);
  const groupB = surfaces.filter((item) => skuOf(item.id) === b);
  let best = null;
  if (a === b) {
    for (let i = 0; i < groupA.length; i += 1) {
      for (let j = i + 1; j < groupA.length; j += 1) {
        const result = pairResult(groupA[i], groupA[j]);
        if (!result) continue;
        if (!best || result.distanceMm < best.distanceMm) best = result;
      }
    }
    return best;
  }
  for (const left of groupA) {
    for (const right of groupB) {
      if (left.id === right.id) continue;
      const result = pairResult(left, right);
      if (!result) continue;
      if (!best || result.distanceMm < best.distanceMm) best = result;
    }
  }
  return best;
}

function createMeasure({ scene, camera, host, subscribeScene, subscribeDrag, arrow } = {}) {
  const overlay = arrow ?? createDistanceLayer({ scene, camera, host });
  const stopScene = subscribeScene(() => overlay.clear());
  const stopDrag = subscribeDrag(() => overlay.clear());

  function distance({ a, b } = {}) {
    if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
      overlay.clear();
      return null;
    }
    const chosen = closestNamed(registrySurfaces(), a, b);
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
