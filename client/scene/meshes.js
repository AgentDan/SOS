import * as THREE from "three";

const TYPE_COLORS = {
  desk_legs: 0x5c4033,
  desk_top: 0x8a6d4b,
  chair: 0x4a3728,
  monitor: 0x222222
};
const DEFAULT_COLOR = 0x888888;

function meshColorForType(type) {
  return TYPE_COLORS[type] ?? DEFAULT_COLOR;
}

const COLLIDER_COLOR = 0xffb020;

function withColliderWire(visual, parts) {
  const mesh = new THREE.Group();
  mesh.add(visual);
  mesh.add(colliderWire(parts));
  return mesh;
}

function colliderWire(parts) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: COLLIDER_COLOR, depthTest: false });
  for (const part of parts) {
    const box = new THREE.BoxGeometry(part.half.x * 2, part.half.y * 2, part.half.z * 2);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box), material);
    box.dispose();
    lines.position.set(part.local.x, part.local.y, part.local.z);
    lines.renderOrder = 10;
    group.add(lines);
  }
  return group;
}

export { meshColorForType, withColliderWire };
