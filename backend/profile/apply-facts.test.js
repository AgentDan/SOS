import test from "node:test";
import assert from "node:assert/strict";
import { applyFact } from "./apply-facts.js";

test("applyFact records a stated answer and leaves needs unchanged", () => {
  const profile = { fields: {}, needs: [{ id: "keep-me" }] };
  const result = applyFact(profile, "q_work_type", "coding");

  assert.equal(result, profile);
  assert.deepEqual(profile.fields.q_work_type, {
    value: "coding",
    source: "stated",
    confidence: "high"
  });
  assert.deepEqual(profile.needs, [{ id: "keep-me" }]);
});
