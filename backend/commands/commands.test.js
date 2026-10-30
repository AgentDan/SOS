import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "./commands.js";

const catalog = {
  types: [
    { id: "desk_legs", maxOnScene: 1 },
    { id: "desk_top", maxOnScene: 1 },
    { id: "monitor" },
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

const placed = {
  types: [
    { id: "desk_legs", canHostOn: [], maxOnScene: 1 },
    {
      id: "desk_top",
      canHostOn: ["desk_legs"],
      maxOnScene: 2,
      rowTypes: ["monitor"],
      rowGapMm: 100,
      edgeMarginMm: 50
    },
    { id: "monitor", canHostOn: ["desk_top"] },
    { id: "chair", canHostOn: [], maxOnScene: 1 }
  ],
  products: [
    { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true, dimensions: { width: 1400 } },
    { sku: "DESK-TOP-1400", type: "desk_top", dimensions: { width: 1400 } },
    { sku: "DESK-TOP-1800", type: "desk_top", dimensions: { width: 1800 } },
    {
      sku: "MON-613-366",
      type: "monitor",
      dimensions: { width: 613 },
      placement: { hostSku: "DESK-TOP-1400" }
    },
    { sku: "CHAIR-460", type: "chair", dimensions: { width: 460 } }
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
  if (options.placements !== undefined) board.placements = options.placements;
  const result = runCommand({
    intent,
    catalog: options.catalog ?? catalog,
    scene: board
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

test("add of a monitor without a desk is no_host", () => {
  const { result, board } = run(command("add", "MON-613-366"), ["DESK-LEGS-1400"], {
    catalog: placed
  });
  assert.equal(result.reasonCode, "no_host");
  assert.equal(result.say.code, "no_host");
  assert.deepEqual(result.say.params, { sku: "MON-613-366" });
  assert.deepEqual(board.calls, []);
});

test("a second monitor fits on the wide desk and not on the narrow one", () => {
  const wide = run(command("add", "MON-613-366"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1800",
    "MON-613-366"
  ], { catalog: placed });
  assert.equal(wide.result.ok, true);
  assert.deepEqual(wide.board.calls, [{ op: "add", sku: "MON-613-366" }]);

  const narrow = run(command("add", "MON-613-366"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1400",
    "MON-613-366"
  ], { catalog: placed });
  assert.equal(narrow.result.reasonCode, "host_full");
  assert.deepEqual(narrow.result.facts, {
    action: "add",
    sku: "MON-613-366",
    hostSku: "DESK-TOP-1400",
    inRow: 1,
    fits: 1
  });
  assert.deepEqual(narrow.board.calls, []);
});

test("a third monitor on the wide desk is host_full", () => {
  const { result, board } = run(command("add", "MON-613-366"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1800",
    "MON-613-366",
    "MON-613-366"
  ], { catalog: placed });
  assert.equal(result.reasonCode, "host_full");
  assert.equal(result.facts.hostSku, "DESK-TOP-1800");
  assert.equal(result.facts.inRow, 2);
  assert.equal(result.facts.fits, 2);
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

test("replace of a wide desk refuses when two monitors do not fit on the narrow one", () => {
  const { result, board } = run(
    command("replace", "DESK-TOP-1800", { withSku: "DESK-TOP-1400" }),
    ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MON-613-366"],
    { catalog: placed }
  );
  assert.equal(result.reasonCode, "host_full");
  assert.equal(result.facts.hostSku, "DESK-TOP-1400");
  assert.equal(result.facts.inRow, 1);
  assert.equal(result.facts.fits, 1);
  assert.equal(result.say.params.sku, "MON-613-366");
  assert.deepEqual(board.calls, []);
});

test("replace of a wide desk keeps a single monitor on the narrow one", () => {
  const { result, board } = run(
    command("replace", "DESK-TOP-1800", { withSku: "DESK-TOP-1400" }),
    ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366"],
    { catalog: placed }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(board.calls, [
    { op: "replace", sku: "DESK-TOP-1800", withSku: "DESK-TOP-1400" }
  ]);
});

test("remove of the last desk under a monitor is cannot_remove_support", () => {
  const { result, board } = run(command("remove", "DESK-TOP-1800"), [
    "DESK-LEGS-1400",
    "DESK-TOP-1800",
    "MON-613-366"
  ], { catalog: placed });
  assert.equal(result.reasonCode, "cannot_remove_support");
  assert.deepEqual(result.say.params.hosted, ["MON-613-366"]);
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

test("replace treats a named desk that is not on the scene as the replacement", () => {
  const local = {
    ...placed,
    products: [...placed.products, { sku: "DESK-TOP-2000", type: "desk_top", dimensions: { width: 2000 } }]
  };
  const { result, board } = run(command("replace", "DESK-TOP-2000"), ["DESK-LEGS-1400", "DESK-TOP-1800"], {
    catalog: local
  });
  assert.equal(result.ok, true);
  assert.equal(result.say.code, "command_replaced");
  assert.deepEqual(board.calls, [{ op: "replace", sku: "DESK-TOP-1800", withSku: "DESK-TOP-2000" }]);
});

test("replace treats a named monitor that is not on the scene as the replacement", () => {
  const local = {
    ...placed,
    products: [...placed.products, { sku: "MON-715-427", type: "monitor", dimensions: { width: 715 } }]
  };
  const { result, board } = run(
    command("replace", "MON-715-427"),
    ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366"],
    { catalog: local }
  );
  assert.equal(result.ok, true);
  assert.equal(result.say.code, "command_replaced");
  assert.deepEqual(board.calls, [{ op: "replace", sku: "MON-613-366", withSku: "MON-715-427" }]);
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

const monitorSize = { width: 613, depth: 205, height: 366 };

const measured = {
  products: [
    {
      sku: "DESK-TOP-1400",
      type: "desk_top",
      label: "стол",
      dimensions: { width: 1400, depth: 700, height: 30 }
    },
    {
      sku: "DESK-TOP-1800",
      type: "desk_top",
      label: "стол",
      dimensions: { width: 1800, depth: 800, height: 30 }
    },
    { sku: "MON-613-366", type: "monitor", label: "монитор", dimensions: monitorSize }
  ]
};

function pose(sku, x, y, z, rotY = 0) {
  return { sku, x, y, z, rotY };
}

function distanceIntent(skus) {
  return { type: "command", source: "text", payload: { action: "distance", skus } };
}

test("distance between a monitor and its desk is a touch", () => {
  const skus = ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"];
  const placements = [
    pose("DESK-TOP-1400", 0, 1000, 0),
    pose("MON-613-366", 0, 1030, -147.5)
  ];
  const { result, board } = run(distanceIntent(["MON-613-366", "DESK-TOP-1400"]), skus, {
    catalog: measured,
    placements
  });
  assert.equal(result.ok, true);
  assert.equal(result.sceneChanged, false);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.facts, {
    action: "distance",
    measure: { a: "MON-613-366", b: "DESK-TOP-1400" }
  });
  assert.deepEqual(result.say, {
    code: "distance_measure",
    params: { a: "монитор", b: "стол", distance: "0 см, они касаются" }
  });
  assert.deepEqual(board.calls, []);
  assert.deepEqual(board.skus, skus);
});

test("distance between two monitors on an 1800 desk is 10 cm", () => {
  const skus = ["DESK-TOP-1800", "MON-613-366", "MON-613-366"];
  const placements = [
    pose("DESK-TOP-1800", 0, 1000, 0),
    pose("MON-613-366", -356.5, 1030, -197.5),
    pose("MON-613-366", 356.5, 1030, -197.5)
  ];
  const named = run(distanceIntent(["MON-613-366", "MON-613-366"]), skus, {
    catalog: measured,
    placements
  });
  assert.equal(named.result.ok, true);
  assert.equal(named.result.sceneChanged, false);
  assert.equal(named.result.say.params.distance, "10 см");
  assert.deepEqual(named.result.facts.measure, { a: "MON-613-366", b: "MON-613-366" });
  assert.deepEqual(named.board.calls, []);

  const once = run(distanceIntent(["MON-613-366"]), skus, { catalog: measured, placements });
  assert.equal(once.result.say.params.distance, "10 см");
  assert.deepEqual(once.result.facts.measure, { a: "MON-613-366", b: "MON-613-366" });
});

test("distance without a placement is distance_no_position", () => {
  const skus = ["DESK-TOP-1400", "MON-613-366"];
  const { result, board } = run(distanceIntent(["MON-613-366", "DESK-TOP-1400"]), skus, {
    catalog: measured,
    placements: [pose("DESK-TOP-1400", 0, 1000, 0)]
  });
  assert.equal(result.ok, false);
  assert.equal(result.sceneChanged, false);
  assert.equal(result.reasonCode, "distance_no_position");
  assert.equal(result.say.code, "distance_no_position");
  assert.deepEqual(result.say.params, {});
  assert.deepEqual(board.calls, []);
  assert.deepEqual(board.skus, skus);
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
  assert.equal(pair.result.reasonCode, "distance_no_position");
  assert.equal(pair.result.sceneChanged, false);
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
    scene: scene(["DESK-LEGS-1400"])
  });
  assert.deepEqual(frozenCatalog, beforeCatalog);
  assert.deepEqual(intent, beforeIntent);
});
