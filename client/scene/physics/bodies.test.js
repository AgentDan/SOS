import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { createBodyFromCatalogItem } from "./bodies.js";
import { RAPIER, disposeWorld, getWorld, initWorld, step } from "./world.js";

const ITEM = {
  sku: "CHAIR-460",
  type: "chair",
  dimensions: { width: 460, depth: 520, height: 900 }
};

function part(half, local) {
  return { half, local };
}

describe("catalog bodies", { concurrency: 1 }, () => {
  test("createBodyFromCatalogItem requires collider parts", () => {
    assert.throws(() => createBodyFromCatalogItem(ITEM), /CHAIR-460/);
    assert.throws(() => createBodyFromCatalogItem(ITEM, { parts: [] }), /нет частей коллайдера/);
    assert.throws(
      () =>
        createBodyFromCatalogItem(ITEM, {
          parts: [part({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0, y: 0, z: 0 })]
        }),
      /Physics world not initialized/
    );
  });

  test("a catalog body is dynamic, keeps gravity, and yaws only", async () => {
    await initWorld();
    try {
      const light = createBodyFromCatalogItem(ITEM, {
        position: { x: 0, y: 2, z: 0 },
        parts: [part({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0, y: 0.1, z: 0 })]
      }).rigidBody;
      const heavy = createBodyFromCatalogItem(ITEM, {
        position: { x: 2, y: 2, z: 0 },
        parts: [part({ x: 0.2, y: 0.1, z: 0.1 }, { x: 0, y: 0.1, z: 0 })]
      }).rigidBody;
      const stacked = createBodyFromCatalogItem(ITEM, {
        position: { x: -2, y: 2, z: 0 },
        parts: [
          part({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0, y: 0.1, z: 0 }),
          part({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0, y: 0.4, z: 0 })
        ]
      }).rigidBody;

      assert.equal(light.isDynamic(), true);
      assert.equal(light.bodyType(), RAPIER.RigidBodyType.Dynamic);
      assert.equal(light.gravityScale(), 1);
      assert.equal(light.isCcdEnabled(), true);
      assert.ok(light.linearDamping() > 0 && light.linearDamping() < 4);
      assert.ok(light.angularDamping() > 0 && light.angularDamping() < 4);
      assert.ok(light.mass() > 0.5, `mass ${light.mass()}`);
      assert.ok(Math.abs(heavy.mass() / light.mass() - 2) < 1e-3);
      assert.ok(Math.abs(stacked.mass() / light.mass() - 2) < 1e-3);

      light.setAngvel({ x: 6, y: 2, z: 6 }, true);
      for (let i = 0; i < 20; i += 1) step();
      const rotation = light.rotation();
      assert.ok(Math.abs(rotation.x) < 0.02, `pitch ${rotation.x}`);
      assert.ok(Math.abs(rotation.z) < 0.02, `roll ${rotation.z}`);
      assert.ok(Math.abs(rotation.y) > 0.05, `yaw ${rotation.y}`);
      assert.equal(light.gravityScale(), 1);
      assert.ok(light.translation().y < 1.5);
    } finally {
      disposeWorld();
    }
  });

  test("a body dropped above a support settles on it and sleeps", async () => {
    await initWorld();
    try {
      const world = getWorld();
      const supportTop = 0.55;
      const support = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.5, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.05, 1).setRestitution(0), support);

      const { rigidBody } = createBodyFromCatalogItem(ITEM, {
        position: { x: 0, y: 1.6, z: 0 },
        parts: [part({ x: 0.12, y: 0.01, z: 0.12 }, { x: 0, y: 0.01, z: 0 })]
      });
      assert.equal(rigidBody.isDynamic(), true);
      assert.notEqual(rigidBody.gravityScale(), 0);
      assert.equal(rigidBody.isCcdEnabled(), true);

      let sleptAt = -1;
      let lowest = Infinity;
      for (let i = 0; i < 900; i += 1) {
        step();
        lowest = Math.min(lowest, rigidBody.translation().y);
        if (rigidBody.isSleeping()) {
          sleptAt = i;
          break;
        }
      }

      const vel = rigidBody.linvel();
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      const bottom = rigidBody.translation().y;
      assert.equal(sleptAt >= 0, true, `not asleep, bottom ${bottom}, speed ${speed}, lowest ${lowest}`);
      assert.ok(speed < 1e-3, `speed ${speed}`);
      assert.ok(Math.abs(bottom - supportTop) < 0.02, `bottom ${bottom} vs ${supportTop}`);
      assert.ok(lowest > supportTop - 0.05, `tunneled to ${lowest}`);

      const parked = rigidBody.translation().y;
      for (let i = 0; i < 30; i += 1) step();
      assert.ok(Math.abs(rigidBody.translation().y - parked) < 1e-4);
      assert.equal(rigidBody.isSleeping(), true);
    } finally {
      disposeWorld();
    }
  });
});
