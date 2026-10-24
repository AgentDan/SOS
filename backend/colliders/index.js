import { addColliderNodes, ColliderError, encodeGlb, listSceneColliderNames, parseGlb, removeColliderNodes } from "./glb.js";
import { computeParts, geometrySizeMm } from "./compute.js";

function addCollidersToGlb(buffer, options = {}) {
  const type = options && typeof options.type === "string" ? options.type : "";
  const { json, bin } = parseGlb(buffer);
  const computed = computeParts(json, bin, type);
  const next = removeColliderNodes(json);
  addColliderNodes(next, computed.parts);
  return {
    glb: encodeGlb(next, bin),
    parts: computed.parts,
    sizeMm: computed.sizeMm,
    bounds: computed.bounds
  };
}

function summarizeGlb(buffer) {
  const { json, bin } = parseGlb(buffer);
  return {
    colliderNames: listSceneColliderNames(json),
    sizeMm: geometrySizeMm(json, bin)
  };
}

export { addCollidersToGlb, summarizeGlb, ColliderError, parseGlb };
