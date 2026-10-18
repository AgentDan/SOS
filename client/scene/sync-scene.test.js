import test from "node:test";
import assert from "node:assert/strict";
import { clear, get, register } from "./physics/registry.js";
import { createSceneSync } from "./sync-scene.js";

test("scene sync notifies only when an object is added or removed", async () => {
  clear();
  const world = { removeRigidBody() {} };
  const scene = { remove() {} };
  const { syncScene, subscribe } = createSceneSync({ world, products: [] });
  let calls = 0;
  const stop = subscribe(() => {
    calls += 1;
  });

  register("CHAIR-460#1", { mesh: {}, rigidBody: {}, product: { sku: "CHAIR-460" } });
  await syncScene(scene, ["CHAIR-460"]);
  assert.equal(calls, 0);
  assert.ok(get("CHAIR-460#1"));

  await syncScene(scene, []);
  assert.equal(calls, 1);
  assert.equal(get("CHAIR-460#1"), undefined);

  await syncScene(scene, []);
  assert.equal(calls, 1);

  stop();
  register("CHAIR-460#1", { mesh: {}, rigidBody: {} });
  await syncScene(scene, []);
  assert.equal(calls, 1);
  clear();
});
