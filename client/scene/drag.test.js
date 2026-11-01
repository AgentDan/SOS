import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { createDrag } from "./drag.js";
import { createBodyFromCatalogItem } from "./physics/bodies.js";
import { clear, get, register } from "./physics/registry.js";
import { RAPIER, disposeWorld, getWorld, initWorld } from "./physics/world.js";

function fakeCanvas() {
  const handlers = [];
  return {
    style: {},
    addEventListener(type, fn, capture) {
      handlers.push({ type, fn, capture: Boolean(capture) });
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
      setEnabledRotations() {},
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
  canvas.emit("pointerup", { pointerId: 1 });
  assert.equal(get("BOX#1").rigidBody.bodyType, RAPIER.RigidBodyType.Dynamic);
  assert.equal(get("BOX#1").rigidBody.gravityScale(), 1);
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
