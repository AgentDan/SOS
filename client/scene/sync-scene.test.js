import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { clear, get, register } from "./physics/registry.js";
import { disposeWorld, getWorld, initWorld, step } from "./physics/world.js";
import { createSceneSync } from "./sync-scene.js";

const MONITOR = { sku: "MON-613-366", type: "monitor" };
const CHAIR = { sku: "CHAIR-460", type: "chair" };
const PERSON = { sku: "character", type: "person" };

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-4, `${actual} vs ${expected}`);
}

function fakeBody(x, y = 0, z = 0) {
  const state = { x, y, z };
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const body = {
    state,
    rotation,
    translations: 0,
    isValid() {
      return true;
    },
    translation() {
      return { x: state.x, y: state.y, z: state.z };
    },
    setTranslation(next) {
      body.translations += 1;
      state.x = next.x;
      state.y = next.y;
      state.z = next.z;
    },
    setRotation(next) {
      rotation.x = next.x;
      rotation.y = next.y;
      rotation.z = next.z;
      rotation.w = next.w;
    },
    setLinvel() {},
    setAngvel() {},
    setGravityScale() {},
    lockRotations() {},
    setBodyType() {}
  };
  return body;
}

function worldStub() {
  return { removeRigidBody() {} };
}

function monitorPlacement(x, rotY = 0) {
  return { sku: "MON-613-366", x, y: 1030, z: -197.5, rotY };
}

const TWO_MONITORS = [monitorPlacement(-356.5), monitorPlacement(356.5, 180)];

test("a new server scene puts copies back and drops ones that left", async () => {
  clear();
  const first = fakeBody(4, 2, 1);
  const second = fakeBody(9);
  const gone = fakeBody(1);
  const mesh = new THREE.Group();
  register("MON-613-366#1", {
    rigidBody: first,
    mesh,
    product: MONITOR,
    position: { x: 4, y: 2, z: 1 },
    moved: true
  });
  register("MON-613-366#2", {
    rigidBody: second,
    mesh: new THREE.Group(),
    product: MONITOR,
    moved: true
  });
  register("CHAIR-460#1", {
    rigidBody: gone,
    mesh: new THREE.Group(),
    product: CHAIR,
    moved: true
  });
  const { syncScene } = createSceneSync({
    world: worldStub(),
    products: [MONITOR, CHAIR, PERSON],
    loadModel: async () => {
      throw new Error("existing copies should be moved, not reloaded");
    }
  });
  const scene = new THREE.Scene();
  await syncScene(scene, ["MON-613-366", "MON-613-366"], TWO_MONITORS, null);

  assert.equal(get("CHAIR-460#1"), undefined);
  close(first.state.x, -0.3565);
  close(second.state.x, 0.3565);
  assert.notEqual(first.state.x, second.state.x);
  close(first.state.y, 1.03);
  close(first.state.z, -0.1975);
  close(mesh.position.x, -0.3565);
  close(second.rotation.y, 1);
  close(second.rotation.w, 0);
  assert.equal(get("MON-613-366#1").moved, false);
  assert.equal(get("MON-613-366#2").moved, false);

  const translations = first.translations;
  first.state.x = 4;
  get("MON-613-366#1").moved = true;
  await syncScene(scene, ["MON-613-366", "MON-613-366"], TWO_MONITORS, null);
  assert.equal(first.translations, translations);
  assert.equal(first.state.x, 4);
  assert.equal(get("MON-613-366#1").moved, true);

  await syncScene(scene, ["MON-613-366", "MON-613-366"], [monitorPlacement(10), monitorPlacement(356.5)], null);
  close(first.state.x, 0.01);
  assert.equal(get("MON-613-366#1").moved, false);
  clear();
});

test("a scene without placements does not throw or move a dragged copy", async () => {
  clear();
  const body = fakeBody(5);
  register("MON-613-366#1", {
    rigidBody: body,
    mesh: new THREE.Group(),
    product: MONITOR,
    moved: true,
    position: { x: 5, y: 0, z: 0 }
  });
  const { syncScene } = createSceneSync({
    world: worldStub(),
    products: [MONITOR],
    loadModel: async () => {
      throw new Error("no model load without a new copy");
    }
  });
  await syncScene(new THREE.Scene(), ["MON-613-366"], null, null);
  assert.equal(body.translations, 0);
  assert.equal(body.state.x, 5);
  assert.equal(get("MON-613-366#1").moved, true);
  clear();
});

test("the mannequin follows person and a repeat of the same scene stays put", async () => {
  clear();
  const body = fakeBody(0);
  register("MON-613-366#1", {
    rigidBody: body,
    mesh: new THREE.Group(),
    product: MONITOR,
    moved: false
  });
  let loads = 0;
  const { syncScene } = createSceneSync({
    world: worldStub(),
    products: [MONITOR, PERSON],
    loadModel: async () => {
      throw new Error("furniture is already on the scene");
    },
    loadPerson: async () => {
      loads += 1;
      return { object: new THREE.Group() };
    }
  });
  const scene = new THREE.Scene();
  const placed = [monitorPlacement(0)];
  const person = { sku: "character", x: 0, y: 0, z: 760, rotY: 180, scale: 1.1 };

  await syncScene(scene, ["MON-613-366"], placed, person, { showPerson: false });
  assert.equal(loads, 0);
  assert.equal(scene.children.length, 0);

  body.state.x = 3;
  get("MON-613-366#1").moved = true;
  const parked = body.translations;
  await syncScene(scene, ["MON-613-366"], placed, person, { showPerson: true });
  assert.equal(body.translations, parked);
  assert.equal(body.state.x, 3);
  assert.equal(loads, 1);
  assert.equal(scene.children.length, 1);
  close(scene.children[0].position.z, 0.76);
  close(scene.children[0].rotation.y, Math.PI);
  close(scene.children[0].scale.x, 1.1);
  close(scene.children[0].scale.y, 1.1);
  close(scene.children[0].scale.z, 1.1);

  await syncScene(scene, ["MON-613-366"], placed, person, { showPerson: true });
  assert.equal(loads, 1);
  assert.equal(body.state.x, 3);

  await syncScene(
    scene,
    ["MON-613-366"],
    placed,
    { ...person, scale: 0.9 },
    { showPerson: true }
  );
  assert.equal(loads, 2);
  close(scene.children[0].scale.x, 0.9);
  close(body.state.x, 0);
  assert.equal(get("MON-613-366#1").moved, false);

  await syncScene(scene, ["MON-613-366"], placed, null, { showPerson: true });
  assert.equal(scene.children.length, 0);
  assert.equal(get("character#1"), undefined);
  clear();
});

test("a person sku is not placed among the furniture", async () => {
  clear();
  let models = 0;
  const { syncScene } = createSceneSync({
    world: worldStub(),
    products: [PERSON],
    loadModel: async () => {
      models += 1;
      return { object: new THREE.Group(), parts: [] };
    },
    loadPerson: async () => ({ object: new THREE.Group() })
  });
  await syncScene(new THREE.Scene(), ["character"], [], { sku: "character", x: 0, y: 0, z: 0, rotY: 0, scale: 1 }, {
    showPerson: false
  });
  assert.equal(models, 0);
  assert.equal(get("character#1"), undefined);
  clear();
});

test("new monitors stay dynamic on the server pose until the scene changes", async () => {
  await initWorld();
  clear();
  try {
    const { syncScene } = createSceneSync({
      world: getWorld(),
      products: [MONITOR],
      loadModel: async () => ({
        object: new THREE.Group(),
        parts: [{ half: { x: 0.2, y: 0.2, z: 0.1 }, local: { x: 0, y: 0.2, z: 0 } }]
      })
    });
    const scene = new THREE.Scene();
    await syncScene(scene, ["MON-613-366", "MON-613-366"], TWO_MONITORS, null);
    const left = get("MON-613-366#1");
    const right = get("MON-613-366#2");
    close(left.rigidBody.translation().x, -0.3565);
    close(right.rigidBody.translation().x, 0.3565);
    assert.ok(left.rigidBody.translation().x < right.rigidBody.translation().x);
    close(left.rigidBody.translation().y, 1.03);
    close(left.mesh.position.x, -0.3565);
    close(right.rigidBody.rotation().y, 1);
    close(right.mesh.rotation.y, Math.PI);
    assert.equal(left.rigidBody.isDynamic(), true);
    assert.equal(left.rigidBody.gravityScale(), 1);
    assert.equal(right.rigidBody.gravityScale(), 1);
    assert.equal(left.rigidBody.isCcdEnabled(), true);

    left.rigidBody.setAngvel({ x: 6, y: 0, z: 6 }, true);
    for (let i = 0; i < 12; i += 1) step();
    assert.ok(Math.abs(left.rigidBody.rotation().x) < 0.02, `pitch ${left.rigidBody.rotation().x}`);
    assert.ok(Math.abs(left.rigidBody.rotation().z) < 0.02, `roll ${left.rigidBody.rotation().z}`);
    assert.ok(left.rigidBody.translation().y < 1.03);
    assert.equal(left.rigidBody.gravityScale(), 1);

    left.rigidBody.setTranslation({ x: 4, y: 1.03, z: -0.1975 }, true);
    left.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    left.moved = true;
    await syncScene(scene, ["MON-613-366", "MON-613-366"], TWO_MONITORS, null);
    close(left.rigidBody.translation().x, 4);
    close(left.rigidBody.translation().y, 1.03);

    for (let i = 0; i < 5; i += 1) step();
    close(left.rigidBody.translation().x, 4);
    assert.ok(left.rigidBody.translation().y < 1.02);

    await syncScene(
      scene,
      ["MON-613-366", "MON-613-366"],
      [monitorPlacement(-100), monitorPlacement(356.5, 180)],
      null
    );
    close(left.rigidBody.translation().x, -0.1);
    close(left.rigidBody.translation().y, 1.03);
    const vel = left.rigidBody.linvel();
    assert.ok(Math.hypot(vel.x, vel.y, vel.z) < 1e-6);
    assert.equal(left.rigidBody.isDynamic(), true);
    assert.equal(left.rigidBody.gravityScale(), 1);
    assert.equal(left.moved, false);
  } finally {
    clear();
    disposeWorld();
  }
});
