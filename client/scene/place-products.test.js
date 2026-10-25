import test from "node:test";
import assert from "node:assert/strict";
import { posesFor } from "./place-products.js";

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
