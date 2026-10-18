import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "./commands.js";

const catalog = {
  types: [
    { id: "desk_legs", maxOnScene: 1 },
    { id: "desk_top", maxOnScene: 1 },
    { id: "monitor", maxOnScene: 2 },
    { id: "chair", maxOnScene: 1 }
  ],
  products: [
    { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true },
    { sku: "DESK-TOP-1400", type: "desk_top" },
    { sku: "DESK-TOP-1800", type: "desk_top" },
    { sku: "MON-613-366", type: "monitor", placement: { hostSku: "DESK-TOP-1400" } },
    { sku: "CHAIR-460", type: "chair" }
  ]
};

function scene(skus, apply) {
  const calls = [];
  return {
    skus,
    calls,
    apply:
      apply ??
      ((change) => {
        calls.push(change);
        return { ok: true, reasonCode: null, sceneChanged: true, skus };
      })
  };
}

function command(action, sku, extra) {
  return {
    type: "command",
    source: "text",
    payload: { action, sku, ...extra }
  };
}

function run(intent, skus, options = {}) {
  const board = scene(skus, options.apply);
  const result = runCommand({
    intent,
    catalog: options.catalog ?? catalog,
    scene: board,
    limits: options.limits ?? { maxItems: 12 }
  });
  return { result, board };
}

test("add puts a sku on the scene", () => {
  const { result, board } = run(command("add", "CHAIR-460"), ["DESK-LEGS-1400"]);
  assert.equal(result.ok, true);
  assert.equal(result.kind, "command");
  assert.equal(result.say.code, "command_added");
  assert.deepEqual(result.facts, { action: "add", sku: "CHAIR-460" });
  assert.deepEqual(board.calls, [{ op: "add", sku: "CHAIR-460" }]);
});

test("add without sku is unknown_sku", () => {
  const { result, board } = run(command("add"), ["DESK-LEGS-1400"]);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "unknown_sku");
  assert.deepEqual(board.calls, []);
});

test("add of an unknown sku is unknown_sku", () => {
  const { result, board } = run(command("add", "MISSING"), ["DESK-LEGS-1400"]);
  assert.equal(result.reasonCode, "unknown_sku");
  assert.deepEqual(result.say.params, { sku: "MISSING" });
  assert.deepEqual(board.calls, []);
});

test("add of a monitor already on scene is ok", () => {
  const { result, board } = run(command("add", "MON-613-366"), ["DESK-LEGS-1400", "MON-613-366"]);
  assert.equal(result.ok, true);
  assert.equal(result.say.code, "command_added");
  assert.deepEqual(board.calls, [{ op: "add", sku: "MON-613-366" }]);
});

test("add of a monitor stops when maxOnScene is reached", () => {
  const { result, board } = run(command("add", "MON-613-366"), [
    "DESK-LEGS-1400",
    "MON-613-366",
    "MON-613-366"
  ]);
  assert.equal(result.reasonCode, "limit");
  assert.equal(result.say.params.max, 2);
  assert.deepEqual(board.calls, []);
});

test("add stops at the type maxOnScene", () => {
  const { result, board } = run(command("add", "DESK-TOP-1800"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1400"
  ]);
  assert.equal(result.reasonCode, "limit");
  assert.deepEqual(result.say.params, { sku: "DESK-TOP-1800", type: "desk_top", max: 1 });
  assert.deepEqual(board.calls, []);
});

test("add stops at maxItems", () => {
  const { result, board } = run(command("add", "CHAIR-460"), ["DESK-LEGS-1400", "DESK-TOP-1400"], {
    limits: { maxItems: 2 }
  });
  assert.equal(result.reasonCode, "limit");
  assert.deepEqual(result.say.params, { max: 2 });
  assert.deepEqual(board.calls, []);
});

test("remove takes a sku off the scene", () => {
  const { result, board } = run(command("remove", "CHAIR-460"), ["DESK-LEGS-1400", "CHAIR-460"]);
  assert.equal(result.ok, true);
  assert.equal(result.say.code, "command_removed");
  assert.deepEqual(board.calls, [{ op: "remove", sku: "CHAIR-460" }]);
});

test("remove of a sku not on scene is not_found", () => {
  const { result, board } = run(command("remove", "CHAIR-460"), ["DESK-LEGS-1400"]);
  assert.equal(result.reasonCode, "not_found");
  assert.deepEqual(board.calls, []);
});

test("remove of another sku of the same type uses the one on scene", () => {
  const { result, board } = run(command("remove", "DESK-TOP-1400"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1800"
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(board.calls, [{ op: "remove", sku: "DESK-TOP-1800" }]);
  assert.equal(result.facts.sku, "DESK-TOP-1800");
});

test("remove of alwaysPresent is cannot_remove_support", () => {
  const { result, board } = run(command("remove", "DESK-LEGS-1400"), ["DESK-LEGS-1400"]);
  assert.equal(result.reasonCode, "cannot_remove_support");
  assert.deepEqual(result.say.params, { sku: "DESK-LEGS-1400", hosted: [] });
  assert.deepEqual(board.calls, []);
});

test("remove of a desk that hosts a monitor is cannot_remove_support", () => {
  const { result, board } = run(command("remove", "DESK-TOP-1400"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1400",
    "MON-613-366"
  ]);
  assert.equal(result.reasonCode, "cannot_remove_support");
  assert.deepEqual(result.say.params.hosted, ["MON-613-366"]);
  assert.deepEqual(board.calls, []);
});

test("replace without withSku picks the first free sku of the same type", () => {
  const { result, board } = run(command("replace", "DESK-TOP-1800"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1800"
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.say.code, "command_replaced");
  assert.deepEqual(board.calls, [
    { op: "replace", sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" }
  ]);
});

test("replace without an alternative is not_found", () => {
  const { result, board } = run(command("replace", "CHAIR-460"), ["DESK-LEGS-1400", "CHAIR-460"]);
  assert.equal(result.reasonCode, "not_found");
  assert.equal(result.facts.detail, "no_replacement");
  assert.deepEqual(board.calls, []);
});

test("replace with the same sku is same_sku", () => {
  const { result, board } = run(
    command("replace", "CHAIR-460", { withSku: "CHAIR-460" }),
    ["DESK-LEGS-1400", "CHAIR-460"]
  );
  assert.equal(result.reasonCode, "limit");
  assert.equal(result.facts.detail, "same_sku");
  assert.deepEqual(result.say.params, { sku: "CHAIR-460" });
  assert.deepEqual(board.calls, []);
});

test("replace with withSku uses that sku", () => {
  const { result, board } = run(
    command("replace", "DESK-TOP-1800", { withSku: "DESK-TOP-1400" }),
    ["DESK-LEGS-1400", "DESK-TOP-1800"]
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts, {
    action: "replace",
    sku: "DESK-TOP-1800",
    withSku: "DESK-TOP-1400"
  });
  assert.deepEqual(board.calls, [
    { op: "replace", sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" }
  ]);
});

test("unknown action is not_implemented", () => {
  const { result, board } = run(command("spin", "CHAIR-460"), ["DESK-LEGS-1400"]);
  assert.equal(result.reasonCode, "not_implemented");
  assert.deepEqual(board.calls, []);
});

test("distance measures two named objects and does not change the scene", () => {
  const labels = {
    "CHAIR-460": "кресло",
    "DESK-TOP-1800": "стол",
    "MON-613-366": "монитор"
  };
  const named = {
    ...catalog,
    products: [
      ...catalog.products.map((product) =>
        labels[product.sku] ? { ...product, label: labels[product.sku] } : product
      ),
      { sku: "MON-613-366", type: "monitor", label: "монитор" }
    ]
  };
  const skus = ["DESK-LEGS-1400", "MON-613-366", "MON-613-366", "CHAIR-460"];
  const before = skus.slice();
  const intent = {
    type: "command",
    source: "text",
    payload: { action: "distance", skus: ["MON-613-366", "CHAIR-460"] }
  };
  const { result, board } = run(intent, skus, { catalog: named });
  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, false);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.facts, {
    action: "distance",
    measure: { a: "MON-613-366", b: "CHAIR-460" }
  });
  assert.deepEqual(result.say, {
    code: "distance_measure",
    params: { a: "монитор", b: "кресло" }
  });
  assert.deepEqual(board.calls, []);
  assert.deepEqual(board.skus, before);
});

test("distance reports a missing object, a single copy, and an unclear request", () => {
  const named = {
    products: [
      { sku: "MON-613-366", type: "monitor", label: "монитор" },
      { sku: "CHAIR-460", type: "chair", label: "кресло" }
    ]
  };
  const missing = run(
    {
      type: "command",
      source: "text",
      payload: { action: "distance", skus: ["MON-613-366", "CHAIR-460"] }
    },
    ["MON-613-366"],
    { catalog: named }
  );
  assert.equal(missing.result.ok, false);
  assert.equal(missing.result.reasonCode, "distance_not_on_scene");
  assert.equal(missing.result.sceneChanged, false);
  assert.deepEqual(missing.result.say.params, { name: "кресло" });
  assert.deepEqual(missing.board.calls, []);
  assert.deepEqual(missing.board.skus, ["MON-613-366"]);

  const oneCopy = run(
    {
      type: "command",
      source: "text",
      payload: { action: "distance", skus: ["MON-613-366", "MON-613-366"] }
    },
    ["MON-613-366"],
    { catalog: named }
  );
  assert.equal(oneCopy.result.reasonCode, "distance_need_two");
  assert.equal(oneCopy.result.sceneChanged, false);
  assert.deepEqual(oneCopy.board.calls, []);
  assert.deepEqual(oneCopy.board.skus, ["MON-613-366"]);

  const none = run(
    { type: "command", source: "text", payload: { action: "distance" } },
    ["MON-613-366"],
    { catalog: named }
  );
  assert.equal(none.result.reasonCode, "distance_unclear");
  assert.equal(none.result.sceneChanged, false);
  assert.deepEqual(none.board.calls, []);

  const pair = run(
    {
      type: "command",
      source: "text",
      payload: { action: "distance", skus: ["MON-613-366", "MON-613-366"] }
    },
    ["MON-613-366", "MON-613-366"],
    { catalog: named }
  );
  assert.equal(pair.result.ok, true);
  assert.deepEqual(pair.result.facts.measure, { a: "MON-613-366", b: "MON-613-366" });
  assert.deepEqual(pair.board.skus, ["MON-613-366", "MON-613-366"]);
  assert.deepEqual(pair.board.calls, []);
});

test("runCommand does not change the catalog or the intent", () => {
  const frozenCatalog = structuredClone(catalog);
  const intent = command("add", "CHAIR-460");
  const beforeCatalog = structuredClone(frozenCatalog);
  const beforeIntent = structuredClone(intent);
  Object.freeze(frozenCatalog);
  Object.freeze(intent);
  runCommand({
    intent,
    catalog: frozenCatalog,
    scene: scene(["DESK-LEGS-1400"]),
    limits: { maxItems: 12 }
  });
  assert.deepEqual(frozenCatalog, beforeCatalog);
  assert.deepEqual(intent, beforeIntent);
});
