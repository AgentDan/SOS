import test from "node:test";
import assert from "node:assert/strict";
import { applyConfirmation } from "./apply-confirmation.js";

test("applyConfirmation keeps and rejects a need once", () => {
  const profile = { confirmedNeeds: ["desk_top_wide"], rejectedNeeds: [], needs: [{ id: "same" }] };

  applyConfirmation(profile, "desk_top_wide", "keep");
  applyConfirmation(profile, "ergonomic_chair", "reject");
  applyConfirmation(profile, "ergonomic_chair", "reject");

  assert.deepEqual(profile.confirmedNeeds, ["desk_top_wide"]);
  assert.deepEqual(profile.rejectedNeeds, ["ergonomic_chair"]);
  assert.deepEqual(profile.needs, [{ id: "same" }]);
});
