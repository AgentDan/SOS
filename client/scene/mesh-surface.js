import * as THREE from "three";

const vertex = new THREE.Vector3();

// World-space triangles of every mesh under root. matrixWorld already includes
// the fitToCatalogDimensions scale, the body position, and the body rotation.
function collectSurface(root) {
  const vertices = [];
  const indices = [];
  if (!root) return { vertices, indices };
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const position = obj.geometry.getAttribute("position");
    if (!position) return;
    const base = vertices.length / 3;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    const index = obj.geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(base + i);
    }
  });
  return { vertices, indices };
}

export { collectSurface };
