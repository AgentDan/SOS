import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { formatDistanceLabel } from "./distance-label.js";
import { collectSurface } from "./mesh-surface.js";
import { createMeasure } from "./measure.js";
import { all, clear, register } from "./physics/registry.js";
import { selectPair } from "./select-pair.js";
import { surfaceDistance } from "./surface-distance.js";

function closeTo(actual, expected, eps = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not within ${eps} of ${expected}`);
}

function box(min, max) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    vertices: [
      x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
      x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1
    ],
    indices: [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      2, 3, 7, 2, 7, 6,
      0, 4, 7, 0, 7, 3,
      1, 6, 5, 1, 2, 6
    ]
  };
}

function merge(parts) {
  const vertices = [];
  const indices = [];
  for (const part of parts) {
    const base = vertices.length / 3;
    for (const value of part.vertices) vertices.push(value);
    for (const index of part.indices) indices.push(base + index);
  }
  return { vertices, indices };
}

function item(id, shape) {
  return { id, vertices: shape.vertices, indices: shape.indices };
}

function gapOf(result) {
  const dx = result.pointA.x - result.pointB.x;
  const dy = result.pointA.y - result.pointB.y;
  const dz = result.pointA.z - result.pointB.z;
  return Math.hypot(dx, dy, dz) * 1000;
}

test("two cubes on the x axis report the face gap and the points on those faces", () => {
  const result = surfaceDistance(
    box([0, 0, 0], [1, 1, 1]).vertices,
    box([0, 0, 0], [1, 1, 1]).indices,
    box([2, 0, 0], [3, 1, 1]).vertices,
    box([2, 0, 0], [3, 1, 1]).indices
  );
  closeTo(result.distanceMm, 1000, 1e-3);
  closeTo(gapOf(result), result.distanceMm, 1e-3);
  closeTo(result.pointA.x, 1, 1e-5);
  closeTo(result.pointB.x, 2, 1e-5);
  closeTo(result.pointA.y, result.pointB.y, 1e-5);
  closeTo(result.pointA.z, result.pointB.z, 1e-5);
  assert.ok(result.pointA.y >= -1e-5 && result.pointA.y <= 1 + 1e-5);
  assert.ok(result.pointA.z >= -1e-5 && result.pointA.z <= 1 + 1e-5);
});

test("diagonal cubes meet at the facing corners", () => {
  const result = surfaceDistance(
    box([0, 0, 0], [1, 1, 1]).vertices,
    box([0, 0, 0], [1, 1, 1]).indices,
    box([2, 2, 2], [3, 3, 3]).vertices,
    box([2, 2, 2], [3, 3, 3]).indices
  );
  closeTo(result.distanceMm, Math.sqrt(3) * 1000, 1e-3);
  closeTo(result.pointA.x, 1, 1e-5);
  closeTo(result.pointA.y, 1, 1e-5);
  closeTo(result.pointA.z, 1, 1e-5);
  closeTo(result.pointB.x, 2, 1e-5);
  closeTo(result.pointB.y, 2, 1e-5);
  closeTo(result.pointB.z, 2, 1e-5);
});

test("touching or intersecting cubes have distance 0", () => {
  const touching = surfaceDistance(
    box([0, 0, 0], [1, 1, 1]).vertices,
    box([0, 0, 0], [1, 1, 1]).indices,
    box([1, 0, 0], [2, 1, 1]).vertices,
    box([1, 0, 0], [2, 1, 1]).indices
  );
  assert.equal(touching.distanceMm, 0);

  const crossing = surfaceDistance(
    box([0, 0, 0], [1, 1, 1]).vertices,
    box([0, 0, 0], [1, 1, 1]).indices,
    box([0.5, 0.5, 0.5], [1.5, 1.5, 1.5]).vertices,
    box([0.5, 0.5, 0.5], [1.5, 1.5, 1.5]).indices
  );
  assert.equal(crossing.distanceMm, 0);
});

test("an L-shape is measured to the nearest part, not to its bounding box", () => {
  const shape = merge([box([0, 0, 0], [1, 3, 1]), box([0, 0, 0], [3, 1, 1])]);
  const cube = box([1.5, 1.5, 0], [2.5, 2.5, 1]);
  const result = surfaceDistance(shape.vertices, shape.indices, cube.vertices, cube.indices);
  closeTo(result.distanceMm, 500, 1e-3);
  closeTo(gapOf(result), 500, 1e-3);

  const onVertical =
    Math.abs(result.pointA.x - 1) <= 1e-4 &&
    result.pointA.y >= 1.5 - 1e-4 &&
    result.pointA.y <= 2.5 + 1e-4 &&
    Math.abs(result.pointB.x - 1.5) <= 1e-4;
  const onHorizontal =
    Math.abs(result.pointA.y - 1) <= 1e-4 &&
    result.pointA.x >= 1.5 - 1e-4 &&
    result.pointA.x <= 2.5 + 1e-4 &&
    Math.abs(result.pointB.y - 1.5) <= 1e-4;
  assert.ok(onVertical || onHorizontal, JSON.stringify(result));
});

test("two copies are the first and second ids, three copies use the closest pair", () => {
  const two = selectPair([
    item("MON#2", box([1.2, 0, 0], [2.2, 1, 1])),
    item("MON#1", box([0, 0, 0], [1, 1, 1]))
  ]);
  assert.equal(two.idA, "MON#1");
  assert.equal(two.idB, "MON#2");
  closeTo(two.distanceMm, 200, 1e-3);

  const three = selectPair([
    item("MON#1", box([0, 0, 0], [1, 1, 1])),
    item("MON#3", box([6.2, 0, 0], [7.2, 1, 1])),
    item("MON#2", box([5, 0, 0], [6, 1, 1]))
  ]);
  assert.equal(three.idA, "MON#2");
  assert.equal(three.idB, "MON#3");
  closeTo(three.distanceMm, 200, 1e-3);
  assert.ok(three.distanceMm < 1000);
});

test("labels say вплотную under 1 mm and centimeters to 0.1", () => {
  assert.equal(formatDistanceLabel(0), "вплотную");
  assert.equal(formatDistanceLabel(0.4), "вплотную");
  assert.equal(formatDistanceLabel(1), "0,1 см");
  assert.equal(formatDistanceLabel(184), "18,4 см");
  assert.equal(formatDistanceLabel(185), "18,5 см");
});

test("world triangles follow position, rotation, and scale", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const wrapper = new THREE.Group();
  wrapper.add(mesh);
  wrapper.scale.set(2, 1, 1);
  wrapper.rotation.y = Math.PI;
  wrapper.position.set(3, 0, 0);
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const left = collectSurface(wrapper);
  const right = collectSurface(other);
  const result = surfaceDistance(left.vertices, left.indices, right.vertices, right.indices);
  closeTo(result.distanceMm, 1500, 1e-2);
  mesh.geometry.dispose();
  other.geometry.dispose();
});

test("distance uses registry meshes and does not register the arrow", () => {
  clear();
  const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  left.position.set(-2, 0, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  right.position.set(2, 0, 0);
  register("BOX#1", { mesh: left, product: { sku: "BOX" } });
  register("BOX#2", { mesh: right, product: { sku: "BOX" } });
  const shown = [];
  const measure = createMeasure({
    arrow: {
      show(value) {
        shown.push(value);
      },
      clear() {},
      dispose() {}
    },
    subscribeScene() {
      return () => {};
    },
    subscribeDrag() {
      return () => {};
    }
  });
  const result = measure.distance({ a: "BOX", b: "BOX" });
  assert.equal(all().size, 2);
  closeTo(result.distanceMm, 3000, 1e-2);
  assert.equal(result.label, "300,0 см");
  assert.equal(shown.length, 1);
  assert.equal(shown[0].label, "300,0 см");
  measure.dispose();
  left.geometry.dispose();
  right.geometry.dispose();
  clear();
});

test("a scene change or a drag clears the arrow", () => {
  let onScene = () => {};
  let onDrag = () => {};
  let cleared = 0;
  const measure = createMeasure({
    arrow: {
      show() {},
      clear() {
        cleared += 1;
      },
      dispose() {}
    },
    subscribeScene(listener) {
      onScene = listener;
      return () => {};
    },
    subscribeDrag(listener) {
      onDrag = listener;
      return () => {};
    }
  });
  onScene();
  onDrag();
  assert.equal(cleared, 2);
  measure.dispose();
});

function meshAt(x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function pairIds(result) {
  return [result.idA, result.idB].sort();
}

test("distance measures the named pair and ignores the rest of the scene", () => {
  clear();
  const meshes = [
    ["ALPHA#1", 0],
    ["BETA#1", 2],
    ["GAMMA#1", 20],
    ["DELTA#1", 40],
    ["EPSILON#1", 60]
  ].map(([id, x]) => {
    const mesh = meshAt(x);
    register(id, { mesh, product: { sku: id.replace(/#\d+$/, "") } });
    return mesh;
  });
  const measure = createMeasure({
    arrow: { show() {}, clear() {}, dispose() {} },
    subscribeScene() {
      return () => {};
    },
    subscribeDrag() {
      return () => {};
    }
  });
  const result = measure.distance({ a: "ALPHA", b: "EPSILON" });
  assert.deepEqual(pairIds(result), ["ALPHA#1", "EPSILON#1"]);
  closeTo(result.distanceMm, 59000, 1);
  measure.dispose();
  for (const mesh of meshes) mesh.geometry.dispose();
  clear();
});

test("monitor to chair uses the closest monitor, and two monitors use the closest copies", () => {
  clear();
  const placed = [
    ["MON#1", 0, "MON"],
    ["MON#2", 1.2, "MON"],
    ["MON#3", 10, "MON"],
    ["CHAIR#1", 6, "CHAIR"]
  ].map(([id, x, sku]) => {
    const mesh = meshAt(x);
    register(id, { mesh, product: { sku } });
    return mesh;
  });
  const measure = createMeasure({
    arrow: { show() {}, clear() {}, dispose() {} },
    subscribeScene() {
      return () => {};
    },
    subscribeDrag() {
      return () => {};
    }
  });
  const toChair = measure.distance({ a: "MON", b: "CHAIR" });
  assert.deepEqual(pairIds(toChair), ["CHAIR#1", "MON#3"]);
  const copies = measure.distance({ a: "MON", b: "MON" });
  assert.deepEqual(pairIds(copies), ["MON#1", "MON#2"]);
  assert.equal(measure.distance({ a: "MON", b: "MISSING" }), null);
  measure.dispose();
  for (const mesh of placed) mesh.geometry.dispose();
  clear();
});
