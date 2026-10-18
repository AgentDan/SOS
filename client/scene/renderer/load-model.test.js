import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { readFittedColliderParts } from "./load-model.js";

test("a model without COL_* nodes throws", () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  assert.throws(() => readFittedColliderParts(root, "DESK-TOP-1400"), /DESK-TOP-1400/);
  assert.throws(() => readFittedColliderParts(root, "DESK-TOP-1400"), /COL_\*/);
});

test("COL_* nodes yield world half extents and then leave the scene", () => {
  const root = new THREE.Group();
  root.scale.set(2, 2, 2);
  const node = new THREE.Group();
  node.name = "COL_Top";
  node.position.set(1, 0, 0);
  node.scale.set(2, 4, 6);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  hidden.name = "hidden";
  node.add(hidden);
  root.add(node);

  const parts = readFittedColliderParts(root, "DESK-TOP-1400");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].half, { x: 2, y: 4, z: 6 });
  assert.ok(Math.abs(parts[0].local.x - 2) < 1e-6);
  assert.ok(Math.abs(parts[0].local.y) < 1e-6);
  assert.ok(Math.abs(parts[0].local.z) < 1e-6);

  let collider = false;
  let leftover = false;
  root.traverse((obj) => {
    if (obj.name && obj.name.startsWith("COL_")) collider = true;
    if (obj.name === "hidden") leftover = true;
  });
  assert.equal(collider, false);
  assert.equal(leftover, false);
});
