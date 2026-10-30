import test from "node:test";
import assert from "node:assert/strict";
import { pickScenario } from "./pick-scenario.js";

function questionnaire() {
  return {
    scenarioRules: [
      { when: { questionId: "q_work_type", optionId: "gaming" }, scenario: "gaming_setup" }
    ],
    defaultScenario: "home_office"
  };
}

function profile(fields, scenario = null) {
  return { scenario, fields };
}

function field(value) {
  return { value, source: "stated", confidence: "high" };
}

test("the first matching rule sets the scenario", () => {
  const picked = pickScenario(
    questionnaire(),
    profile({ q_work_type: field("gaming") }, "home_office")
  );
  assert.equal(picked, "gaming_setup");
});

test("an answered rule question without a match uses the default scenario", () => {
  const picked = pickScenario(
    questionnaire(),
    profile({ q_work_type: field("coding") }, "gaming_setup")
  );
  assert.equal(picked, "home_office");
});

test("an unanswered rule question keeps the profile scenario", () => {
  assert.equal(pickScenario(questionnaire(), profile({ q_hand: field("right") }, "gaming_setup")), "gaming_setup");
  assert.equal(pickScenario(questionnaire(), profile({})), null);
});

test("rules and the default can be read from the draft layer", () => {
  const envelope = { draft: questionnaire() };
  assert.equal(
    pickScenario(envelope, profile({ q_work_type: field("office") })),
    "home_office"
  );
});
