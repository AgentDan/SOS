import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { createArrow, createDistanceLayer, disposeArrow } from "./arrow.js";
import { all, clear } from "./physics/registry.js";

function tipOf(cone) {
  const height = cone.geometry.parameters.height;
  return new THREE.Vector3(0, height / 2, 0).applyQuaternion(cone.quaternion).add(cone.position);
}

test("the arrow follows the surface points and disposes its geometry", () => {
  clear();
  const element = { style: {}, setAttribute() {}, parentNode: null, textContent: "" };
  const arrow = createArrow({ x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, "20,0 см", element);
  const line = arrow.children.find((child) => child.isLine);
  const position = line.geometry.attributes.position;
  assert.equal(position.getX(0), 0);
  assert.equal(position.getY(0), 1);
  assert.equal(position.getX(1), 2);
  assert.equal(position.getY(1), 1);
  assert.equal(line.material.depthTest, false);
  assert.equal(line.material.depthWrite, false);

  const cones = arrow.children.filter((child) => child.isMesh);
  assert.equal(cones.length, 2);
  for (const cone of cones) assert.equal(cone.material.depthTest, false);
  const xs = cones.map((cone) => tipOf(cone).x).sort((a, b) => a - b);
  assert.ok(Math.abs(xs[0]) < 1e-6);
  assert.ok(Math.abs(xs[1] - 2) < 1e-6);

  const label = arrow.children.find((child) => child.isCSS2DObject);
  assert.equal(element.textContent, "20,0 см");
  assert.ok(Math.abs(label.position.x - 1) < 1e-6);
  assert.ok(Math.abs(label.position.y - 1) < 1e-6);
  assert.equal(all().size, 0);

  let geometries = 0;
  let materials = 0;
  arrow.traverse((obj) => {
    if (obj.geometry) {
      geometries += 1;
      const orig = obj.geometry.dispose.bind(obj.geometry);
      obj.geometry.dispose = () => {
        geometries -= 1;
        orig();
      };
    }
    if (obj.material) {
      materials += 1;
      const orig = obj.material.dispose.bind(obj.material);
      obj.material.dispose = () => {
        materials -= 1;
        orig();
      };
    }
  });
  disposeArrow(arrow);
  assert.equal(geometries, 0);
  assert.equal(materials, 0);
});

test("a new distance arrow replaces the previous one", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const host = {
    clientWidth: 200,
    clientHeight: 100,
    appendChild() {},
    removeChild() {}
  };
  const dom = { style: {}, appendChild() {}, removeChild() {} };
  const layer = createDistanceLayer({ scene, camera, host, domElement: dom });
  layer.show({
    pointA: { x: 0, y: 0, z: 0 },
    pointB: { x: 1, y: 0, z: 0 },
    label: "10,0 см"
  });
  assert.equal(scene.children.filter((child) => child.name === "distance-arrow").length, 1);
  const first = scene.children[0];
  let disposed = false;
  first.traverse((obj) => {
    if (!obj.geometry) return;
    const orig = obj.geometry.dispose.bind(obj.geometry);
    obj.geometry.dispose = () => {
      disposed = true;
      orig();
    };
  });
  layer.show({
    pointA: { x: 0, y: 0, z: 0 },
    pointB: { x: 0, y: 2, z: 0 },
    label: "20,0 см"
  });
  assert.equal(scene.children.length, 1);
  assert.notEqual(scene.children[0], first);
  assert.equal(disposed, true);
  assert.equal(all().size, 0);
  layer.clear();
  assert.equal(scene.children.length, 0);
  layer.dispose();
});
