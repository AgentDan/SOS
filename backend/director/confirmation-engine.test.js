import test from "node:test";
import assert from "node:assert/strict";
import { buildConfirmationQuestion, getPendingConfirmations } from "./confirmation-engine.js";

function profile(overrides = {}) {
  return {
    needs: [],
    confirmedNeeds: [],
    rejectedNeeds: [],
    ...overrides
  };
}

test("medium confidence with a resolved sku is pending confirmation", () => {
  const pending = getPendingConfirmations(
    profile({
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }]
    })
  );
  assert.deepEqual(
    pending.map((need) => need.id),
    ["desk_top_wide"]
  );
});

test("high confidence is not pending confirmation", () => {
  const pending = getPendingConfirmations(
    profile({
      needs: [{ id: "ergonomic_chair", confidence: "high", resolvedSku: "CHAIR-460" }]
    })
  );
  assert.deepEqual(pending, []);
});

test("unresolved need is not pending confirmation", () => {
  const pending = getPendingConfirmations(
    profile({
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: null }]
    })
  );
  assert.deepEqual(pending, []);
});

test("already confirmed need is not pending", () => {
  const pending = getPendingConfirmations(
    profile({
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }],
      confirmedNeeds: ["desk_top_wide"]
    })
  );
  assert.deepEqual(pending, []);
});

test("already rejected need is not pending", () => {
  const pending = getPendingConfirmations(
    profile({
      needs: [{ id: "desk_top_wide", confidence: "medium", resolvedSku: "DESK-TOP-1800" }],
      rejectedNeeds: ["desk_top_wide"]
    })
  );
  assert.deepEqual(pending, []);
});

test("buildConfirmationQuestion names the catalog product and offers keep or reject", () => {
  const question = buildConfirmationQuestion(
    { id: "desk_top_wide", resolvedSku: "DESK-TOP-1800" },
    {
      draft: {
        products: [{ sku: "DESK-TOP-1800", name: "Desk top 1800x800" }]
      }
    }
  );
  assert.equal(question.id, "confirm_desk_top_wide");
  assert.equal(question.phase, "confirmation");
  assert.match(question.textFallback, /Desk top 1800x800/);
  assert.deepEqual(
    question.options.map((option) => option.id),
    ["keep", "reject"]
  );
});

test("buildConfirmationQuestion falls back to the sku when the product is missing", () => {
  const question = buildConfirmationQuestion(
    { id: "desk_top_wide", resolvedSku: "DESK-TOP-MISSING" },
    { draft: { products: [] } }
  );
  assert.match(question.textFallback, /DESK-TOP-MISSING/);
});
