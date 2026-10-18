import test from "node:test";
import assert from "node:assert/strict";
import { arrangeCopies, hostTypesFor, pickHostByType, pickHostId, reseatCopies } from "./place-products.js";
import { clear, get, register, unregister } from "./physics/registry.js";

test("cargo lands on the least loaded copy of its host", () => {
  const legs = (n) => [`DESK-LEGS-1400#${n}`, { product: { sku: "DESK-LEGS-1400" } }];
  const entries = [
    legs(1),
    legs(2),
    ["DESK-TOP-1400#1", { product: { sku: "DESK-TOP-1400" }, hostId: "DESK-LEGS-1400#1" }]
  ];
  assert.equal(pickHostId("DESK-LEGS-1400", entries), "DESK-LEGS-1400#2");
  assert.equal(pickHostId("DESK-TOP-1400", entries), "DESK-TOP-1400#1");
  assert.equal(pickHostId("MISSING", entries), null);
});

test("a monitor sits on the desk that is actually on the scene", () => {
  const types = [
    { id: "desk_top", canHostOn: ["desk_legs"] },
    { id: "monitor", canHostOn: ["desk_top"] }
  ];
  const monitor = { type: "monitor", placement: { hostSku: "DESK-TOP-1400" } };
  const entries = [
    ["DESK-LEGS-1400#1", { product: { sku: "DESK-LEGS-1400", type: "desk_legs" } }],
    ["DESK-TOP-1800#1", { product: { sku: "DESK-TOP-1800", type: "desk_top" }, hostId: "DESK-LEGS-1400#1" }],
    ["DESK-TOP-1800#2", { product: { sku: "DESK-TOP-1800", type: "desk_top" }, hostId: "DESK-LEGS-1400#1" }],
    ["MON-613-366#1", { product: { sku: "MON-613-366", type: "monitor" }, hostId: "DESK-TOP-1800#1" }],
    ["CHAIR-460#1", { product: { sku: "CHAIR-460", type: "chair" } }]
  ];
  assert.deepEqual(hostTypesFor(monitor, types), ["desk_top"]);
  assert.equal(pickHostId(monitor.placement.hostSku, entries), null);
  assert.equal(pickHostByType(hostTypesFor(monitor, types), entries), "DESK-TOP-1800#2");
  assert.equal(pickHostByType([], entries), null);
});

test("equal load keeps the earlier copy", () => {
  const entries = [
    ["DESK-TOP-1400#2", { product: { sku: "DESK-TOP-1400" } }],
    ["DESK-TOP-1400#1", { product: { sku: "DESK-TOP-1400" } }]
  ];
  assert.equal(pickHostId("DESK-TOP-1400", entries), "DESK-TOP-1400#1");
});

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
}

function body(x, y = 1, z = 0.2) {
  const state = { x, y, z };
  const calls = [];
  return {
    state,
    calls,
    isValid() {
      return true;
    },
    translation() {
      return { x: state.x, y: state.y, z: state.z };
    },
    setTranslation(next) {
      calls.push("translation");
      state.x = next.x;
      state.y = next.y;
      state.z = next.z;
    },
    setLinvel(value) {
      calls.push(value);
    },
    setAngvel() {
      calls.push("angvel");
    },
    wakeUp() {
      calls.push("wake");
    }
  };
}

const monitor = {
  sku: "MON-613-366",
  dimensions: { width: 613, height: 366, depth: 205 },
  placement: { hostSku: "DESK-TOP-1800" }
};

function hostEntry() {
  return {
    product: { sku: "DESK-TOP-1800", dimensions: { width: 1800 } },
    rigidBody: body(0, 0.7, 0),
    position: { x: 0, y: 0.7, z: 0 }
  };
}

function monitorEntry(rigid, moved) {
  return {
    product: monitor,
    hostId: "DESK-TOP-1800#1",
    rigidBody: rigid,
    position: { x: rigid.state.x, y: rigid.state.y, z: rigid.state.z },
    moved
  };
}

test("monitors on one desktop are reseated together", () => {
  clear();
  register("DESK-TOP-1800#1", hostEntry());
  const first = body(0);
  register("MON-613-366#1", monitorEntry(first));

  const secondPlan = arrangeCopies({
    hostId: "DESK-TOP-1800#1",
    sku: "MON-613-366",
    additions: [{ id: "MON-613-366#2", product: monitor }]
  });
  close(first.state.x, -0.5935);
  assert.equal(first.state.y, 1);
  assert.equal(first.state.z, 0.2);
  close(secondPlan["MON-613-366#2"], 0.5935);
  assert.deepEqual(
    first.calls.filter((call) => call && call.x === 0),
    [{ x: 0, y: 0, z: 0 }]
  );
  assert.equal(first.calls.includes("wake"), true);
  assert.equal(first.calls.includes("angvel"), true);
  assert.equal(get("MON-613-366#1").product.sku, "MON-613-366");

  const second = body(secondPlan["MON-613-366#2"]);
  register("MON-613-366#2", monitorEntry(second));
  const thirdPlan = arrangeCopies({
    hostId: "DESK-TOP-1800#1",
    sku: "MON-613-366",
    additions: [{ id: "MON-613-366#3", product: monitor }]
  });
  const xs = [first.state.x, second.state.x, thirdPlan["MON-613-366#3"]];
  assert.equal(new Set(xs.map((value) => value.toFixed(4))).size, 3);
  close(first.state.x, -0.5935);
  close(second.state.x, 0);
  close(thirdPlan["MON-613-366#3"], 0.5935);

  const third = body(thirdPlan["MON-613-366#3"]);
  register("MON-613-366#3", monitorEntry(third));
  unregister("MON-613-366#3");
  reseatCopies({ skus: ["MON-613-366"] });
  close(first.state.x, -0.5935);
  close(second.state.x, 0.5935);
  assert.equal(get("MON-613-366#1") != null, true);
  assert.equal(get("MON-613-366#2") != null, true);

  clear();
  register("DESK-TOP-1800#1", hostEntry());
  const parked = body(0.3);
  const loose = body(0);
  register("MON-613-366#1", monitorEntry(loose));
  register("MON-613-366#2", monitorEntry(parked, true));
  arrangeCopies({
    hostId: "DESK-TOP-1800#1",
    sku: "MON-613-366",
    additions: [{ id: "MON-613-366#3", product: monitor }]
  });
  assert.equal(parked.state.x, 0.3);
  assert.equal(parked.calls.includes("translation"), false);
  assert.equal(loose.calls.includes("translation"), true);
  clear();
});
