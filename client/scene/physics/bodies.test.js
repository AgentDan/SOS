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

  test("a catalog body is dynamic, keeps gravity, and can tip", async () => {
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
      assert.ok(Math.abs(light.linearDamping() - 0.05) < 1e-6);
      assert.ok(Math.abs(light.angularDamping() - 0.5) < 1e-6);
      assert.ok(light.mass() > 0.5, `mass ${light.mass()}`);
      assert.ok(Math.abs(heavy.mass() / light.mass() - 2) < 1e-3);
      assert.ok(Math.abs(stacked.mass() / light.mass() - 2) < 1e-3);

      light.setAngvel({ x: 6, y: 2, z: 6 }, true);
      for (let i = 0; i < 20; i += 1) step();
      const rotation = light.rotation();
      assert.ok(Math.hypot(rotation.x, rotation.z) > 0.05, `tilt x ${rotation.x} z ${rotation.z}`);
      assert.equal(light.gravityScale(), 1);
      const fallen = light.translation().y;
      assert.ok(fallen < 1.7, `y ${fallen}`);
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

  test("movable false is fixed and a missing or true flag stays dynamic", async () => {
    await initWorld();
    try {
      const parts = [part({ x: 0.2, y: 0.05, z: 0.2 }, { x: 0, y: 0.05, z: 0 })];
      const fixed = createBodyFromCatalogItem(
        { ...ITEM, movable: false },
        { position: { x: 0, y: 1.2, z: 0 }, parts }
      ).rigidBody;
      const explicit = createBodyFromCatalogItem(
        { ...ITEM, sku: "MON-613-366", movable: true },
        { position: { x: 2, y: 1.2, z: 0 }, parts }
      ).rigidBody;
      const omitted = createBodyFromCatalogItem(
        { ...ITEM, sku: "MOUSE-65" },
        { position: { x: -2, y: 1.2, z: 0 }, parts }
      ).rigidBody;

      assert.equal(fixed.isFixed(), true);
      assert.equal(fixed.isDynamic(), false);
      assert.equal(fixed.bodyType(), RAPIER.RigidBodyType.Fixed);
      assert.equal(fixed.numColliders(), 1);
      assert.equal(explicit.isDynamic(), true);
      assert.equal(explicit.gravityScale(), 1);
      assert.equal(omitted.isDynamic(), true);
      assert.equal(omitted.bodyType(), RAPIER.RigidBodyType.Dynamic);

      const parked = fixed.translation().y;
      for (let i = 0; i < 40; i += 1) step();
      assert.ok(Math.abs(fixed.translation().y - parked) < 1e-6);
      assert.ok(explicit.translation().y < 1.2);
      assert.ok(omitted.translation().y < 1.2);
    } finally {
      disposeWorld();
    }
  });

  test("a movable body dropped above a fixed catalog body settles on it", async () => {
    await initWorld();
    try {
      const supportTop = 0.55;
      const support = createBodyFromCatalogItem(
        { sku: "DESK-TOP-1400", type: "desk_top", movable: false },
        {
          position: { x: 0, y: 0.5, z: 0 },
          parts: [part({ x: 1, y: 0.05, z: 1 }, { x: 0, y: 0, z: 0 })]
        }
      ).rigidBody;
      const { rigidBody } = createBodyFromCatalogItem(
        { sku: "MON-613-366", type: "monitor" },
        {
          position: { x: 0, y: 1.6, z: 0 },
          parts: [part({ x: 0.12, y: 0.01, z: 0.12 }, { x: 0, y: 0.01, z: 0 })]
        }
      );
      assert.equal(support.isFixed(), true);
      assert.equal(support.numColliders(), 1);
      assert.equal(rigidBody.isDynamic(), true);

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
      assert.ok(Math.abs(support.translation().y - 0.5) < 1e-6);
      assert.equal(support.isFixed(), true);
    } finally {
      disposeWorld();
    }
  });

  test("a tall box with its center past a table edge tips over", async () => {
    await initWorld();
    try {
      const world = getWorld();
      const tableHalfY = 0.05;
      const table = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.5, 0));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, tableHalfY, 0.5).setFriction(0.8).setRestitution(0),
        table
      );
      const tableTop = 0.5 + tableHalfY;
      const edgeX = 0.5;
      const half = { x: 0.05, y: 0.4, z: 0.08 };
      // Two centimetres past the lip: a center exactly on the edge can stay upright.
      const { rigidBody } = createBodyFromCatalogItem(ITEM, {
        position: { x: edgeX + 0.02, y: tableTop, z: 0 },
        parts: [part(half, { x: 0, y: half.y, z: 0 })]
      });
      const steps = Math.round(2 / world.timestep);
      for (let i = 0; i < steps; i += 1) step();
      const q = rigidBody.rotation();
      const up = Math.min(1, Math.max(-1, 1 - 2 * (q.x * q.x + q.z * q.z)));
      const tilt = (Math.acos(up) * 180) / Math.PI;
      assert.ok(tilt > 20, `tilt ${tilt}°, q ${q.x} ${q.y} ${q.z} ${q.w}`);
    } finally {
      disposeWorld();
    }
  });

  test("step keeps a fixed 1/60 tick and a long frame stops at five", async () => {
    async function drop(action) {
      await initWorld();
      try {
        const world = getWorld();
        const { rigidBody } = createBodyFromCatalogItem(ITEM, {
          position: { x: 0, y: 4, z: 0 },
          parts: [part({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0, y: 0.1, z: 0 })]
        });
        action(world);
        return rigidBody.translation().y;
      } finally {
        disposeWorld();
      }
    }

    const once = await drop(() => step());
    const timed = await drop((world) => step(world.timestep));
    assert.ok(Math.abs(once - timed) < 1e-5, `bare ${once} vs timed ${timed}`);

    const five = await drop(() => {
      for (let i = 0; i < 5; i += 1) step();
    });
    const burst = await drop(() => step(1));
    assert.ok(Math.abs(five - burst) < 1e-4, `five ${five} vs burst ${burst}`);

    const six = await drop(() => {
      for (let i = 0; i < 6; i += 1) step();
    });
    assert.ok(Math.abs(six - burst) > 1e-3, `six ${six} should pass the five-step cap ${burst}`);
  });
});
