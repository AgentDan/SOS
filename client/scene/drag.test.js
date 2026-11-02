import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { createDrag } from "./drag.js";
import { createBodyFromCatalogItem } from "./physics/bodies.js";
import { clear, get, register } from "./physics/registry.js";
import { RAPIER, disposeWorld, getWorld, initWorld } from "./physics/world.js";

function listenerCapture(options) {
  if (typeof options === "boolean") return options;
  if (options && typeof options === "object") return Boolean(options.capture);
  return false;
}

function fakeCanvas() {
  const handlers = [];
  return {
    style: {},
    addEventListener(type, fn, options) {
      handlers.push({ type, fn, capture: listenerCapture(options) });
    },
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return false;
    },
    emit(type, event, capture) {
      for (const handler of handlers) {
        if (handler.type === type && handler.capture === Boolean(capture)) handler.fn(event);
      }
    }
  };
}

test("a drag notifies subscribers once the object actually moves", async () => {
  await RAPIER.init();
  clear();
  const canvas = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2, 3, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.updateMatrixWorld(true);
  register("BOX#1", {
    mesh,
    rigidBody: {
      isValid() {
        return true;
      },
      bodyType: RAPIER.RigidBodyType.Dynamic,
      gravity: 1,
      translation() {
        return { x: 0, y: 0, z: 0 };
      },
      setLinvel() {},
      setAngvel() {},
      setGravityScale(value) {
        this.gravity = value;
      },
      gravityScale() {
        return this.gravity;
      },
      setEnabledRotations(...args) {
        this.rotations = args;
      },
      setBodyType(type) {
        this.bodyType = type;
      }
    }
  });
  const drag = createDrag({ canvas, camera, controls: { enabled: true } });
  let calls = 0;
  drag.subscribe(() => {
    calls += 1;
  });
  const down = {
    button: 0,
    clientX: 50,
    clientY: 50,
    pointerId: 1,
    preventDefault() {},
    stopImmediatePropagation() {}
  };
  canvas.emit("pointerdown", down, true);
  assert.equal(calls, 0);
  assert.equal(get("BOX#1").moved, undefined);
  canvas.emit("pointermove", { clientX: 80, clientY: 40, pointerId: 1 });
  assert.equal(calls, 1);
  assert.equal(get("BOX#1").moved, true);
  canvas.emit("pointermove", { clientX: 90, clientY: 30, pointerId: 1 });
  assert.equal(calls, 1);
  assert.equal(get("BOX#1").rigidBody.bodyType, RAPIER.RigidBodyType.Dynamic);
  assert.equal(get("BOX#1").rigidBody.gravityScale(), 0);
  assert.deepEqual(get("BOX#1").rigidBody.rotations, [false, true, false, true]);
  canvas.emit("pointerup", { pointerId: 1 });
  assert.equal(get("BOX#1").rigidBody.bodyType, RAPIER.RigidBodyType.Dynamic);
  assert.equal(get("BOX#1").rigidBody.gravityScale(), 1);
  assert.deepEqual(get("BOX#1").rigidBody.rotations, [true, true, true, true]);
  drag.dispose();
  mesh.geometry.dispose();
  clear();
});

test("a fixed body is not dragged", async () => {
  await RAPIER.init();
  clear();
  const canvas = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2, 3, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.updateMatrixWorld(true);
  let typeChanges = 0;
  register("DESK#1", {
    mesh,
    product: { sku: "DESK-TOP-1400", movable: false },
    rigidBody: {
      isValid() {
        return true;
      },
      isFixed() {
        return true;
      },
      translation() {
        return { x: 0, y: 0, z: 0 };
      },
      setLinvel() {},
      setAngvel() {},
      setGravityScale() {},
      setEnabledRotations() {},
      setBodyType() {
        typeChanges += 1;
      }
    }
  });
  const drag = createDrag({ canvas, camera, controls: { enabled: true } });
  canvas.emit("pointermove", { clientX: 50, clientY: 50, pointerId: 1 });
  assert.equal(canvas.style.cursor, "");
  canvas.emit(
    "pointerdown",
    {
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      preventDefault() {},
      stopImmediatePropagation() {}
    },
    true
  );
  assert.equal(typeChanges, 0);
  assert.equal(get("DESK#1").moved, undefined);
  assert.equal(canvas.style.cursor, "");
  drag.dispose();
  mesh.geometry.dispose();
  clear();
});

test("a click on a hidden collider frame picks nothing", async () => {
  await RAPIER.init();
  clear();
  const canvas = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(2, 3, 4);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const root = new THREE.Group();
  const visual = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  visual.position.set(8, 0, 0);
  const wire = new THREE.Group();
  wire.userData.colliderWire = true;
  wire.visible = false;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  wire.add(frame);
  root.add(visual);
  root.add(wire);
  root.updateMatrixWorld(true);
  const rigidBody = {
    gravity: 1,
    isValid() {
      return true;
    },
    translation() {
      return { x: 0, y: 0, z: 0 };
    },
    setLinvel() {},
    setAngvel() {},
    setGravityScale(value) {
      this.gravity = value;
    },
    gravityScale() {
      return this.gravity;
    },
    setEnabledRotations() {}
  };
  register("BOX#1", { mesh: root, rigidBody });
  const drag = createDrag({ canvas, camera, controls: { enabled: true } });
  canvas.emit("pointermove", { clientX: 50, clientY: 50, pointerId: 1 });
  assert.equal(canvas.style.cursor, "");
  canvas.emit(
    "pointerdown",
    {
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      preventDefault() {},
      stopImmediatePropagation() {}
    },
    true
  );
  assert.equal(rigidBody.gravity, 1);
  assert.equal(get("BOX#1").moved, undefined);
  assert.equal(canvas.style.cursor, "");
  drag.dispose();
  visual.geometry.dispose();
  frame.geometry.dispose();
  clear();
});

function clientPoint(camera, x, y, z) {
  const ndc = new THREE.Vector3(x, y, z).project(camera);
  return {
    clientX: ((ndc.x + 1) / 2) * 100,
    clientY: ((1 - ndc.y) / 2) * 100
  };
}

async function pullBox(targetX, withTable) {
  await initWorld();
  clear();
  const world = getWorld();
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(8, 0.05, 8).setFriction(0.8).setRestitution(0), floor);
  if (withTable) {
    const table = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.5, 0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(0.8).setRestitution(0), table);
  }
  const half = { x: 0.2, y: 0.2, z: 0.2 };
  const { rigidBody } = createBodyFromCatalogItem(
    { sku: "BOX", type: "monitor" },
    {
      position: { x: 0, y: 0, z: 0 },
      parts: [{ half, local: { x: 0, y: half.y, z: 0 } }]
    }
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  mesh.position.set(0, half.y, 0);
  mesh.updateMatrixWorld(true);
  register("BOX#1", { mesh, rigidBody });
  const camera = new THREE.OrthographicCamera(-2, 8, 4, -4, 0.1, 50);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const canvas = fakeCanvas();
  const drag = createDrag({ canvas, camera, controls: { enabled: true } });
  const grab = clientPoint(camera, 0, half.y, 0);
  canvas.emit(
    "pointerdown",
    {
      button: 0,
      clientX: grab.clientX,
      clientY: grab.clientY,
      pointerId: 1,
      preventDefault() {},
      stopImmediatePropagation() {}
    },
    true
  );
  assert.equal(rigidBody.isDynamic(), true);
  assert.equal(rigidBody.gravityScale(), 0);
  const pull = clientPoint(camera, targetX, half.y, 0);
  canvas.emit("pointermove", { clientX: pull.clientX, clientY: pull.clientY, pointerId: 1 });
  for (let i = 0; i < 180; i += 1) {
    drag.apply();
    world.step();
  }
  const x = rigidBody.translation().x;
  drag.dispose();
  mesh.geometry.dispose();
  clear();
  disposeWorld();
  return { x, halfX: half.x };
}

test("a dragged box stops against a fixed table", async () => {
  const { x, halfX } = await pullBox(4, true);
  assert.ok(x + halfX <= 1 + 0.02, `right face ${x + halfX}`);
});

test("a dragged box reaches a free target", async () => {
  const { x } = await pullBox(1, false);
  assert.ok(Math.abs(x - 1) <= 0.05, `x ${x}`);
});

function yawRad(body) {
  const q = body.rotation();
  const x = q.x;
  const y = q.y;
  const z = q.z;
  const w = q.w;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function yawDeltaDeg(before, body) {
  const delta = yawRad(body) - before;
  return (Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
}

function emitWheel(canvas, deltaY) {
  let prevented = false;
  canvas.emit("wheel", {
    deltaY,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {}
  });
  return prevented;
}

function topCamera() {
  const camera = new THREE.OrthographicCamera(-2, 8, 4, -4, 0.1, 50);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

async function monitorScene(half = { x: 0.2, y: 0.2, z: 0.2 }) {
  await initWorld();
  clear();
  const world = getWorld();
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(8, 0.05, 8).setFriction(0.8).setRestitution(0), floor);
  const { rigidBody } = createBodyFromCatalogItem(
    { sku: "BOX", type: "monitor" },
    {
      position: { x: 0, y: 0, z: 0 },
      parts: [{ half, local: { x: 0, y: half.y, z: 0 } }]
    }
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2));
  mesh.position.set(0, half.y, 0);
  mesh.updateMatrixWorld(true);
  register("BOX#1", { mesh, rigidBody });
  const camera = topCamera();
  const canvas = fakeCanvas();
  const drag = createDrag({ canvas, camera, controls: { enabled: true } });
  return { world, rigidBody, mesh, canvas, camera, drag, half };
}

function grab(scene) {
  const point = clientPoint(scene.camera, 0, scene.half.y, 0);
  scene.canvas.emit(
    "pointerdown",
    {
      button: 0,
      clientX: point.clientX,
      clientY: point.clientY,
      pointerId: 1,
      preventDefault() {},
      stopImmediatePropagation() {}
    },
    true
  );
}

function settle(drag, world, frames) {
  for (let i = 0; i < frames; i += 1) {
    drag.apply();
    world.step();
  }
}

function closeScene(scene) {
  scene.drag.dispose();
  scene.mesh.geometry.dispose();
  clear();
  disposeWorld();
}

test("rotate(+1) turns a grabbed box by 15 degrees", async () => {
  const scene = await monitorScene();
  try {
    let calls = 0;
    scene.drag.subscribe(() => {
      calls += 1;
    });
    grab(scene);
    assert.ok(scene.drag.state.entry, "grab missed the box");
    const start = yawRad(scene.rigidBody);
    scene.drag.rotate(1);
    assert.equal(calls, 1);
    assert.equal(get("BOX#1").moved, true);
    scene.drag.rotate(0);
    assert.equal(calls, 1);
    settle(scene.drag, scene.world, 60);
    const delta = yawDeltaDeg(start, scene.rigidBody);
    assert.ok(Math.abs(delta - 15) <= 2, `delta ${delta}`);
  } finally {
    closeScene(scene);
  }
});

test("rotate(-1) turns a grabbed box the other way", async () => {
  const scene = await monitorScene();
  try {
    grab(scene);
    const start = yawRad(scene.rigidBody);
    scene.drag.rotate(-1);
    settle(scene.drag, scene.world, 60);
    const delta = yawDeltaDeg(start, scene.rigidBody);
    assert.ok(Math.abs(delta + 15) <= 2, `delta ${delta}`);
  } finally {
    closeScene(scene);
  }
});

test("wheel notches turn a grabbed box, and small deltas make one step", async () => {
  const scene = await monitorScene();
  try {
    grab(scene);
    const start = yawRad(scene.rigidBody);
    for (let i = 0; i < 4; i += 1) assert.equal(emitWheel(scene.canvas, -100), true);
    settle(scene.drag, scene.world, 60);
    const four = yawDeltaDeg(start, scene.rigidBody);
    assert.ok(Math.abs(four - 60) <= 2, `four notches ${four}`);

    scene.canvas.emit("pointerup", { pointerId: 1 });
    grab(scene);
    const again = yawRad(scene.rigidBody);
    assert.equal(emitWheel(scene.canvas, -10), true);
    assert.equal(scene.drag.state.wheelAcc, -10);
    assert.equal(scene.drag.state.yaw, again);
    for (let i = 0; i < 9; i += 1) emitWheel(scene.canvas, -10);
    assert.equal(scene.drag.state.wheelAcc, 0);
    settle(scene.drag, scene.world, 60);
    const small = yawDeltaDeg(again, scene.rigidBody);
    assert.ok(Math.abs(small - 15) <= 2, `small deltas ${small}`);
  } finally {
    closeScene(scene);
  }
});

test("the wheel leaves the camera alone until a box is grabbed", async () => {
  const scene = await monitorScene();
  try {
    const start = yawRad(scene.rigidBody);
    const place = scene.rigidBody.translation();
    const x = place.x;
    const y = place.y;
    const z = place.z;
    assert.equal(emitWheel(scene.canvas, -100), false);
    assert.equal(emitWheel(scene.canvas, 100), false);
    assert.equal(scene.drag.state.yaw, 0);
    assert.equal(scene.drag.state.wheelAcc, 0);
    const after = scene.rigidBody.translation();
    assert.ok(Math.abs(yawRad(scene.rigidBody) - start) < 1e-6);
    assert.equal(after.x, x);
    assert.equal(after.y, y);
    assert.equal(after.z, z);
  } finally {
    closeScene(scene);
  }
});

test("a grabbed box yaws and does not tilt", async () => {
  const scene = await monitorScene();
  try {
    const rotations = [];
    const body = scene.rigidBody;
    const original = body.setEnabledRotations.bind(body);
    body.setEnabledRotations = (x, y, z, wake) => {
      rotations.push([x, y, z, wake]);
      original(x, y, z, wake);
    };
    grab(scene);
    assert.deepEqual(rotations[0], [false, true, false, true]);
    const start = yawRad(body);
    body.setAngvel({ x: 8, y: 0, z: 8 }, true);
    scene.world.step();
    const held = body.rotation();
    assert.ok(Math.hypot(held.x, held.z) < 0.02, `tilt x ${held.x} z ${held.z}`);
    assert.ok(Math.abs(yawRad(body) - start) < 0.02);

    body.setRotation({ x: Math.sin(0.3), y: 0, z: 0, w: Math.cos(0.3) }, true);
    const posed = body.rotation().x;
    body.setAngvel({ x: 8, y: 0, z: 0 }, true);
    scene.world.step();
    assert.ok(Math.abs(body.rotation().x - posed) < 0.02, "locked axes keep a posed tilt from growing");

    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setAngvel({ x: 0, y: 4, z: 0 }, true);
    scene.world.step();
    const yawed = yawDeltaDeg(0, body);
    assert.ok(yawed > 2, `yaw ${yawed}`);
  } finally {
    closeScene(scene);
  }
});

test("a released box can tilt and its yaw target is cleared", async () => {
  const scene = await monitorScene();
  try {
    grab(scene);
    scene.drag.rotate(1);
    scene.canvas.emit("pointerup", { pointerId: 1 });
    assert.equal(scene.drag.state.yaw, 0);
    assert.equal(scene.drag.state.wheelAcc, 0);
    assert.equal(scene.drag.state.entry, null);
    scene.rigidBody.setTranslation({ x: 0, y: 1.5, z: 0 }, true);
    scene.rigidBody.setAngvel({ x: 6, y: 0, z: 6 }, true);
    for (let i = 0; i < 20; i += 1) scene.world.step();
    const tilted = scene.rigidBody.rotation();
    assert.ok(Math.hypot(tilted.x, tilted.z) > 0.05, `tilt x ${tilted.x} z ${tilted.z}`);
  } finally {
    closeScene(scene);
  }
});

function cuboidAabb(collider) {
  const c = collider.translation();
  const q = collider.rotation();
  const h = collider.halfExtents();
  const cx = c.x;
  const cy = c.y;
  const cz = c.z;
  const x = q.x;
  const y = q.y;
  const z = q.z;
  const w = q.w;
  const hx = h.x;
  const hy = h.y;
  const hz = h.z;
  const m00 = 1 - 2 * (y * y + z * z);
  const m01 = 2 * (x * y - z * w);
  const m02 = 2 * (x * z + y * w);
  const m10 = 2 * (x * y + z * w);
  const m11 = 1 - 2 * (x * x + z * z);
  const m12 = 2 * (y * z - x * w);
  const m20 = 2 * (x * z - y * w);
  const m21 = 2 * (y * z + x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const ex = Math.abs(m00) * hx + Math.abs(m01) * hy + Math.abs(m02) * hz;
  const ey = Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz;
  const ez = Math.abs(m20) * hx + Math.abs(m21) * hy + Math.abs(m22) * hz;
  return {
    minX: cx - ex,
    maxX: cx + ex,
    minY: cy - ey,
    maxY: cy + ey,
    minZ: cz - ez,
    maxZ: cz + ez
  };
}

function aabbOverlap(a, b) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz);
}

test("a grabbed bar stops against a fixed box instead of turning through it", async () => {
  const half = { x: 0.05, y: 0.05, z: 0.45 };
  const scene = await monitorScene(half);
  try {
    const obstacle = scene.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0.28, 0.25, 0.2));
    const obstacleCollider = scene.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.12, 0.25, 0.18).setFriction(0.8).setRestitution(0),
      obstacle
    );
    grab(scene);
    assert.ok(scene.drag.state.entry, "grab missed the bar");
    scene.drag.rotate(6);
    settle(scene.drag, scene.world, 120);
    const turned = yawDeltaDeg(0, scene.rigidBody);
    const pen = aabbOverlap(cuboidAabb(scene.rigidBody.collider(0)), cuboidAabb(obstacleCollider));
    assert.ok(pen <= 0.02, `penetration ${pen}`);
    assert.ok(turned > 8 && turned < 40, `yaw ${turned}`);
  } finally {
    closeScene(scene);
  }
});
