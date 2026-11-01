import test from "node:test";
import assert from "node:assert/strict";
import { computeRoomPlan } from "./room-plan.js";

test("default room is 4×4×2.6 with two windows and two panels a side", () => {
  const plan = computeRoomPlan();
  assert.deepEqual(computeRoomPlan(), plan);
  assert.equal(plan.width, 4);
  assert.equal(plan.depth, 4);
  assert.equal(plan.height, 2.6);
  assert.deepEqual(
    plan.walls.map((wall) => wall.side),
    ["back", "left", "right"]
  );
  assert.equal(plan.walls[0].length, 4);
  assert.deepEqual(plan.walls[0].windows, [
    { center: -0.26 * 4, width: 0.9, height: 1.7, sill: 0.6 },
    { center: 0.26 * 4, width: 0.9, height: 1.7, sill: 0.6 }
  ]);
  const panels = [
    { s0: 0.35, s1: 2 - 0.35, bottom: 0.42, top: 2.6 - 0.5 },
    { s0: 2 + 0.05, s1: 4 - 0.2, bottom: 0.42, top: 2.6 - 0.5 }
  ];
  assert.deepEqual(plan.walls[1].panels, panels);
  assert.deepEqual(plan.walls[2].panels, panels);
  assert.equal(plan.walls[1].length, 4);
  assert.notEqual(plan.walls[1].panels, plan.walls[2].panels);
});

test("one field overrides and the others keep their defaults", () => {
  const plan = computeRoomPlan({ height: 3 });
  assert.equal(plan.height, 3);
  assert.equal(plan.width, 4);
  assert.equal(plan.depth, 4);
  assert.equal(plan.walls[0].windows[0].height, 1.7);
  assert.equal(plan.walls[1].panels[0].top, 2.5);
  assert.equal(plan.walls[2].panels[1].s1, 4 - 0.2);
});

test("the front wall is left out of the plan", () => {
  const sides = computeRoomPlan().walls.map((wall) => wall.side);
  assert.equal(sides.includes("front"), false);
  assert.deepEqual(sides, ["back", "left", "right"]);
});

test("a window that leaves the wall is dropped", () => {
  const windows = [
    { center: 0, width: 0.8, height: 1, sill: 0.5 },
    { center: 1.8, width: 0.9, height: 1, sill: 0.5 },
    { center: 0, width: 0.6, height: 1.2, sill: 1.6 },
    { center: -1.7, width: 0.9, height: 1, sill: 0.4 }
  ];
  const snapshot = JSON.parse(JSON.stringify(windows));
  const plan = computeRoomPlan({ width: 4, height: 2.6, windows });
  assert.deepEqual(windows, snapshot);
  assert.deepEqual(plan.walls[0].windows, [{ center: 0, width: 0.8, height: 1, sill: 0.5 }]);
});

test("panels off leaves both side walls bare", () => {
  const plan = computeRoomPlan({ panels: false });
  assert.deepEqual(plan.walls[1].panels, []);
  assert.deepEqual(plan.walls[2].panels, []);
  assert.equal(plan.walls[0].windows.length, 2);
});

test("zero, negative and non-numeric sizes fall back to the defaults", () => {
  assert.deepEqual(computeRoomPlan({ width: 0, depth: -2, height: Number.NaN }), computeRoomPlan());
  assert.deepEqual(
    computeRoomPlan({ width: "4", depth: null, height: Number.POSITIVE_INFINITY }),
    computeRoomPlan()
  );
});
