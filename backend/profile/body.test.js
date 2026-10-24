import test from "node:test";
import assert from "node:assert/strict";
import { getBody } from "./body.js";

const questionnaire = {
  questions: [
    {
      id: "q_height",
      options: [
        { id: "h_u160", heightCm: 155 },
        { id: "h_160", heightCm: 165 },
        { id: "h_170", heightCm: 175 },
        { id: "h_180", heightCm: 185 },
        { id: "h_190", heightCm: 195 }
      ]
    }
  ]
};

const ergonomics = {
  defaults: { heightCm: 175, hand: "right" }
};

function profile(fields) {
  return { fields };
}

function answer(value) {
  return { value, source: "stated", confidence: "high" };
}

function body(fields) {
  return getBody({ profile: profile(fields), questionnaire, ergonomics });
}

test("stated height and hand come from the answers", () => {
  assert.deepEqual(
    body({
      q_height: answer("h_190"),
      q_hand: answer("left")
    }),
    {
      heightCm: 195,
      hand: "left",
      source: { height: "stated", hand: "stated" }
    }
  );
});

test("missing answers use ergonomics defaults", () => {
  assert.deepEqual(body({}), {
    heightCm: 175,
    hand: "right",
    source: { height: "assumed", hand: "assumed" }
  });
});

test("only height is stated when the hand is unanswered", () => {
  assert.deepEqual(body({ q_height: answer("h_160") }), {
    heightCm: 165,
    hand: "right",
    source: { height: "stated", hand: "assumed" }
  });
});

test("an unknown height option is assumed", () => {
  assert.deepEqual(
    body({
      q_height: answer("h_missing"),
      q_hand: answer("left")
    }),
    {
      heightCm: 175,
      hand: "left",
      source: { height: "assumed", hand: "stated" }
    }
  );
});

test("a hand other than right or left is assumed", () => {
  assert.deepEqual(
    body({
      q_height: answer("h_180"),
      q_hand: answer("both")
    }),
    {
      heightCm: 185,
      hand: "right",
      source: { height: "stated", hand: "assumed" }
    }
  );
});
