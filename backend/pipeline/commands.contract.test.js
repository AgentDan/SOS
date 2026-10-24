import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../commands/commands.js";
import { validateExecutorResult } from "./contracts.js";

const catalog = {
  types: [
    { id: "desk_legs", maxOnScene: 1, canHostOn: [] },
    {
      id: "desk_top",
      maxOnScene: 1,
      canHostOn: ["desk_legs"],
      rowTypes: ["monitor"],
      rowGapMm: 100,
      edgeMarginMm: 50
    },
    { id: "monitor", canHostOn: ["desk_top"] },
    { id: "chair", maxOnScene: 1, canHostOn: [] }
  ],
  products: [
    { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true, dimensions: { width: 1400 } },
    { sku: "DESK-TOP-1400", type: "desk_top", dimensions: { width: 1400 } },
    { sku: "DESK-TOP-1800", type: "desk_top", dimensions: { width: 1800 } },
    { sku: "MON-613-366", type: "monitor", dimensions: { width: 613 } },
    { sku: "CHAIR-460", type: "chair" }
  ]
};

function scene(skus) {
  return {
    skus,
    apply: (change) => ({ ok: true, reasonCode: null, sceneChanged: true, skus, change })
  };
}

function intent(action, sku, extra) {
  return { type: "command", source: "text", payload: { action, sku, ...extra } };
}

const cases = [
  { name: "add ok", intent: intent("add", "CHAIR-460"), skus: ["DESK-LEGS-1400"] },
  { name: "add without sku", intent: intent("add"), skus: ["DESK-LEGS-1400"] },
  { name: "unknown sku", intent: intent("add", "MISSING"), skus: ["DESK-LEGS-1400"] },
  {
    name: "already on scene",
    intent: intent("add", "CHAIR-460"),
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  },
  {
    name: "type limit",
    intent: intent("add", "DESK-TOP-1800"),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400"]
  },
  {
    name: "no host",
    intent: intent("add", "MON-613-366"),
    skus: ["DESK-LEGS-1400"]
  },
  {
    name: "host full",
    intent: intent("add", "MON-613-366"),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"]
  },
  {
    name: "remove ok",
    intent: intent("remove", "CHAIR-460"),
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  },
  { name: "remove missing", intent: intent("remove", "CHAIR-460"), skus: ["DESK-LEGS-1400"] },
  { name: "remove support", intent: intent("remove", "DESK-LEGS-1400"), skus: ["DESK-LEGS-1400"] },
  {
    name: "replace ok",
    intent: intent("replace", "DESK-TOP-1800"),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800"]
  },
  {
    name: "replace withSku",
    intent: intent("replace", "DESK-TOP-1800", { withSku: "DESK-TOP-1400" }),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1800"]
  },
  {
    name: "replace no alternative",
    intent: intent("replace", "CHAIR-460"),
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  },
  { name: "unknown action", intent: intent("spin", "CHAIR-460"), skus: ["DESK-LEGS-1400"] },
  {
    name: "distance ok",
    intent: intent("distance", undefined, { skus: ["CHAIR-460", "DESK-TOP-1800"] }),
    skus: ["DESK-LEGS-1400", "CHAIR-460", "DESK-TOP-1800"]
  },
  {
    name: "distance missing",
    intent: intent("distance", undefined, { skus: ["CHAIR-460", "DESK-TOP-1800"] }),
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  },
  {
    name: "distance one copy",
    intent: intent("distance", undefined, { skus: ["CHAIR-460", "CHAIR-460"] }),
    skus: ["DESK-LEGS-1400", "CHAIR-460"]
  },
  { name: "distance unclear", intent: intent("distance"), skus: ["DESK-LEGS-1400"] }
];

test("runCommand results satisfy the executor contract", () => {
  for (const row of cases) {
    const result = runCommand({
      intent: row.intent,
      catalog,
      scene: scene(row.skus)
    });
    assert.deepEqual(validateExecutorResult(result), { ok: true, errors: [] }, row.name);
  }
});
