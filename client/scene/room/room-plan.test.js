import test from "node:test";
import assert from "node:assert/strict";
import { computeRoomPlan } from "./room-plan.js";

const PANEL_BOTTOM = 0.42;
const CORNER = 0.35;
const GAP = 0.2;

function rowOfThree(length, height) {
  const panelWidth = (length - CORNER * 2 - GAP * 2) / 3;
  return [0, 1, 2].map((i) => {
    const s0 = CORNER + i * (panelWidth + GAP);
    return { s0, s1: s0 + panelWidth, bottom: PANEL_BOTTOM, top: height - 0.5 };
  });
}

function flanks(length, height, openingWidth) {
  const half = length / 2;
  const open0 = -openingWidth / 2;
  const open1 = openingWidth / 2;
  return [
    { s0: CORNER, s1: open0 - GAP + half, bottom: PANEL_BOTTOM, top: height - 0.5 },
    { s0: open1 + GAP + half, s1: length - CORNER, bottom: PANEL_BOTTOM, top: height - 0.5 }
  ];
}

test("default room is a closed 6×6×2.8 with a door on the front", () => {
  const plan = computeRoomPlan();
  assert.deepEqual(computeRoomPlan(), plan);
  assert.equal(plan.width, 6);
  assert.equal(plan.depth, 6);
  assert.equal(plan.height, 2.8);
  assert.deepEqual(
    plan.walls.map((wall) => wall.side),
    ["back", "left", "right", "front"]
  );
  assert.equal(plan.walls[0].length, 6);
  assert.deepEqual(plan.walls[0].windows, [
    { center: -0.26 * 6, width: 0.9, height: 1.7, sill: 0.6 },
    { center: 0.26 * 6, width: 0.9, height: 1.7, sill: 0.6 }
  ]);
  const left = plan.walls[1];
  const right = plan.walls[2];
  const front = plan.walls[3];
  assert.equal(left.length, 6);
  assert.deepEqual(left.windows, [{ center: 0, width: 1.2, height: 1.5, sill: 0.85 }]);
  assert.deepEqual(left.panels, flanks(6, 2.8, 1.2));
  assert.equal(right.length, 6);
  assert.deepEqual(right.panels, rowOfThree(6, 2.8));
  assert.equal(front.length, 6);
  assert.deepEqual(front.doors, [{ center: 0, width: 0.95, height: 2.1 }]);
  assert.deepEqual(front.panels, flanks(6, 2.8, 0.95));
  assert.notEqual(left.panels, right.panels);
  assert.notEqual(left.panels, front.panels);
});

test("one field overrides and the others keep their defaults", () => {
  const plan = computeRoomPlan({ height: 3 });
  assert.equal(plan.height, 3);
  assert.equal(plan.width, 6);
  assert.equal(plan.depth, 6);
  assert.equal(plan.walls[0].windows[0].height, 1.7);
  assert.equal(plan.walls[1].panels[0].top, 2.5);
  assert.equal(plan.walls[2].panels[2].s1, rowOfThree(6, 3)[2].s1);
  assert.equal(plan.walls[3].doors[0].height, 2.1);
});

test("an element that leaves its wall is dropped", () => {
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

  const cramped = computeRoomPlan({ width: 6, depth: 1, height: 2 });
  assert.deepEqual(
    cramped.walls.find((wall) => wall.side === "front").doors,
    []
  );
  assert.deepEqual(
    cramped.walls.find((wall) => wall.side === "right").panels,
    []
  );
  assert.deepEqual(
    cramped.walls.find((wall) => wall.side === "left").windows,
    []
  );
});

test("panels off leaves the molding off every wall", () => {
  const plan = computeRoomPlan({ panels: false });
  assert.deepEqual(plan.walls[1].panels, []);
  assert.deepEqual(plan.walls[2].panels, []);
  assert.deepEqual(plan.walls[3].panels, []);
  assert.equal(plan.walls[0].windows.length, 2);
  assert.equal(plan.walls[1].windows.length, 1);
  assert.equal(plan.walls[3].doors.length, 1);
});

test("zero, negative and non-numeric sizes fall back to the defaults", () => {
  assert.deepEqual(computeRoomPlan({ width: 0, depth: -2, height: Number.NaN }), computeRoomPlan());
  assert.deepEqual(
    computeRoomPlan({ width: "4", depth: null, height: Number.POSITIVE_INFINITY }),
    computeRoomPlan()
  );
});
