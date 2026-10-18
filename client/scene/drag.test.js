import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { createDrag } from "./drag.js";
import { clear, get, register } from "./physics/registry.js";
import { RAPIER } from "./physics/world.js";

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
      translation() {
        return { x: 0, y: 0, z: 0 };
      },
      setLinvel() {},
      setAngvel() {},
      setBodyType() {},
      setTranslation() {}
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
  drag.dispose();
  mesh.geometry.dispose();
  clear();
});
