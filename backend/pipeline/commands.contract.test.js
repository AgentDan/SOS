import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../commands/commands.js";
import { validateExecutorResult } from "./contracts.js";

const catalog = {
  types: [
    { id: "desk_legs", maxOnScene: 1 },
    { id: "desk_top", maxOnScene: 1 },
    { id: "chair", maxOnScene: 1 }
  ],
  products: [
    { sku: "DESK-LEGS-1400", type: "desk_legs", alwaysPresent: true },
    { sku: "DESK-TOP-1400", type: "desk_top" },
    { sku: "DESK-TOP-1800", type: "desk_top" },
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
    name: "maxItems",
    intent: intent("add", "CHAIR-460"),
    skus: ["DESK-LEGS-1400", "DESK-TOP-1400"],
    limits: { maxItems: 2 }
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
      scene: scene(row.skus),
      limits: row.limits ?? { maxItems: 12 }
    });
    assert.deepEqual(validateExecutorResult(result), { ok: true, errors: [] }, row.name);
  }
});
