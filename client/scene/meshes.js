import * as THREE from "three";
import { framePartsForItem, mmToM } from "./physics/bodies.js";

const TYPE_COLORS = {
  desk_legs: 0x5c4033,
  desk_top: 0x8a6d4b,
  chair: 0x4a3728,
  monitor: 0x222222
};
const DEFAULT_COLOR = 0x888888;

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

function meshColorForType(type) {
  return TYPE_COLORS[type] ?? DEFAULT_COLOR;
}

const COLLIDER_COLOR = 0xffb020;

function withColliderWire(visual, product) {
  const mesh = new THREE.Group();
  mesh.add(visual);
  mesh.add(colliderWire(product));
  return mesh;
}

function colliderWire(product) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: COLLIDER_COLOR, depthTest: false });
  for (const part of framePartsForItem(product)) {
    const box = new THREE.BoxGeometry(part.half.x * 2, part.half.y * 2, part.half.z * 2);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box), material);
    box.dispose();
    lines.position.set(part.local.x, part.local.y, part.local.z);
    lines.renderOrder = 10;
    group.add(lines);
  }
  return group;
}

export { TYPE_COLORS, DEFAULT_COLOR, boxMesh, catalogMesh, meshColorForType, withColliderWire };
