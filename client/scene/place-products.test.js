import * as THREE from "three";
import test from "node:test";
import assert from "node:assert/strict";
import { moveToPose, placeProducts, posesFor } from "./place-products.js";
import { clear, get } from "./physics/registry.js";
import { disposeWorld, initWorld, step } from "./physics/world.js";

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
}

test("placements give each copy its own server pose, in sku order", () => {
  const poses = posesFor(
    ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "CHAIR-460", "MON-613-366"],
    [
      { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 },
      { sku: "DESK-TOP-1800", x: 0, y: 1000, z: 0, rotY: 0 },
      { sku: "MON-613-366", x: -356.5, y: 1030, z: -197.5, rotY: 0 },
      { sku: "CHAIR-460", x: 0, y: 0, z: 760, rotY: 180 },
      { sku: "MON-613-366", x: 356.5, y: 1030, z: -197.5, rotY: 0 }
    ]
  );

  assert.deepEqual(
    poses.map((item) => item.id),
    ["DESK-LEGS-1400#1", "DESK-TOP-1800#1", "MON-613-366#1", "CHAIR-460#1", "MON-613-366#2"]
  );
  close(poses[1].pose.y, 1);
  close(poses[2].pose.x, -0.3565);
  close(poses[2].pose.y, 1.03);
  close(poses[2].pose.z, -0.1975);
  close(poses[4].pose.x, 0.3565);
  assert.notEqual(poses[2].pose.x, poses[4].pose.x);
  close(poses[3].pose.z, 0.76);
  assert.equal(poses[3].pose.rotY, 180);
});

test("the nth copy follows the nth placement of that sku", () => {
  const poses = posesFor(
    ["MON-613-366", "MON-613-366"],
    [
      { sku: "MON-613-366", x: 356.5, y: 1030, z: -197.5, rotY: 0 },
      { sku: "MON-613-366", x: -356.5, y: 1030, z: -197.5, rotY: 0 }
    ]
  );
  assert.equal(poses[0].id, "MON-613-366#1");
  assert.equal(poses[1].id, "MON-613-366#2");
  close(poses[0].pose.x, 0.3565);
  close(poses[1].pose.x, -0.3565);
});

test("missing placements resolve to the origin and do not throw", () => {
  assert.deepEqual(posesFor(["MON-613-366"], null)[0].pose, { x: 0, y: 0, z: 0, rotY: 0 });
  assert.deepEqual(posesFor(["MON-613-366"], undefined)[0].pose, { x: 0, y: 0, z: 0, rotY: 0 });
});

test("a placed copy is dynamic with gravity and returns to the server pose", async () => {
  await initWorld();
  clear();
  try {
    const scene = new THREE.Scene();
    await placeProducts(
      scene,
      [
        {
          id: "MON-613-366#1",
          sku: "MON-613-366",
          n: 1,
          product: { sku: "MON-613-366", type: "monitor" },
          pose: { x: 0.1, y: 1.03, z: -0.2, rotY: 180 }
        }
      ],
      async () => ({
        object: new THREE.Group(),
        parts: [{ half: { x: 0.2, y: 0.05, z: 0.1 }, local: { x: 0, y: 0.05, z: 0 } }]
      })
    );
    const entry = get("MON-613-366#1");
    const body = entry.rigidBody;
    assert.equal(body.isDynamic(), true);
    assert.equal(body.gravityScale(), 1);
    assert.equal(body.isCcdEnabled(), true);
    close(body.translation().y, 1.03);
    close(body.rotation().y, 1);
    close(body.rotation().w, 0);

    body.setTranslation({ x: 2, y: 0.4, z: 0.3 }, true);
    body.setLinvel({ x: 1, y: -2, z: 0.5 }, true);
    entry.moved = true;
    moveToPose(entry, { x: 0.1, y: 1.03, z: -0.2, rotY: 180 });
    close(body.translation().x, 0.1);
    close(body.translation().y, 1.03);
    close(body.linvel().x, 0);
    close(body.linvel().y, 0);
    close(body.linvel().z, 0);
    assert.equal(body.gravityScale(), 1);
    assert.equal(body.isDynamic(), true);
    assert.equal(entry.moved, false);

    body.setAngvel({ x: 8, y: 0, z: 8 }, true);
    const startY = body.translation().y;
    for (let i = 0; i < 15; i += 1) step();
    assert.ok(body.translation().y < startY - 0.01);
    assert.ok(Math.abs(body.rotation().x) < 0.02, `pitch ${body.rotation().x}`);
    assert.ok(Math.abs(body.rotation().z) < 0.02, `roll ${body.rotation().z}`);
    assert.equal(body.gravityScale(), 1);
  } finally {
    clear();
    disposeWorld();
  }
});
