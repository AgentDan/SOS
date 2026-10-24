import test from "node:test";
import assert from "node:assert/strict";
import {
  INTENT_SOURCES,
  INTENT_TYPES,
  REASON_CODES,
  REPLY_VIA,
  TALK_TOPICS,
  validateExecutorResult,
  validateIntent,
  validateReplyInput,
  validateReplyOutput,
  validateScene
} from "./contracts.js";

function accepted(result) {
  assert.deepEqual(result, { ok: true, errors: [] });
}

function rejected(result) {
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0);
  return result.errors;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function executorResult(overrides = {}) {
  return {
    ok: true,
    kind: "answer",
    sceneChanged: false,
    facts: {},
    reasonCode: null,
    say: { code: "ack", params: {} },
    ...overrides
  };
}

function replyContext(overrides = {}) {
  return {
    profile: { clientId: "client-1" },
    sceneSkus: ["DESK-TOP-1800"],
    nextQuestion: { id: "q_work_type" },
    ...overrides
  };
}

test("contract lists are the block boundary", () => {
  assert.deepEqual(INTENT_TYPES, ["answer", "command", "talk", "unclear"]);
  assert.deepEqual(INTENT_SOURCES, ["button", "text"]);
  assert.deepEqual(TALK_TOPICS, ["faq", "cheaper", "smalltalk"]);
  assert.deepEqual(REASON_CODES, [
    "unclear",
    "unknown_sku",
    "limit",
    "no_host",
    "host_full",
    "cannot_remove_support",
    "nothing_cheaper",
    "not_found",
    "not_implemented",
    "distance_unclear",
    "distance_not_on_scene",
    "distance_need_two",
    "distance_no_position"
  ]);
  assert.deepEqual(REPLY_VIA, ["template", "ai"]);
});

test("validateIntent accepts an answer from a button", () => {
  accepted(
    validateIntent({
      type: "answer",
      source: "button",
      payload: { questionId: "q_work_type", optionId: "coding" }
    })
  );
});

test("validateIntent accepts a command with only an action", () => {
  accepted(
    validateIntent({
      type: "command",
      source: "text",
      payload: { action: "remove" }
    })
  );
});

test("validateIntent accepts a command with optional fields", () => {
  accepted(
    validateIntent({
      type: "command",
      source: "button",
      payload: {
        action: "resize",
        sku: "DESK-TOP-1800",
        withSku: "DESK-TOP-1400",
        direction: "wider",
        amount: 20,
        unit: "cm"
      }
    })
  );
});

test("validateIntent rejects a command withSku that is not a string", () => {
  const errors = rejected(
    validateIntent({
      type: "command",
      source: "text",
      payload: { action: "replace", sku: "DESK-TOP-1800", withSku: 1400 }
    })
  );
  assert.deepEqual(errors, ["payload.withSku must be a string"]);
});

test("validateIntent accepts every talk topic", () => {
  accepted(
    validateIntent({
      type: "talk",
      source: "text",
      payload: { topic: "faq", faqId: "delivery" }
    })
  );
  accepted(validateIntent({ type: "talk", source: "text", payload: { topic: "cheaper" } }));
  accepted(validateIntent({ type: "talk", source: "button", payload: { topic: "smalltalk" } }));
});

test("validateIntent accepts an unclear intent", () => {
  accepted(
    validateIntent({
      type: "unclear",
      source: "text",
      payload: { reason: "could not parse" }
    })
  );
});

test("validateIntent rejects null, undefined, and non-objects", () => {
  for (const value of [null, undefined, "text", 1, true, []]) {
    assert.deepEqual(rejected(validateIntent(value)), ["must be an object"]);
  }
});

test("validateIntent rejects an unknown type", () => {
  const errors = rejected(
    validateIntent({
      type: "question",
      source: "button",
      payload: { questionId: "q_work_type", optionId: "coding" }
    })
  );
  assert.ok(errors.includes("type must be one of: answer, command, talk, unclear"));
});

test("validateIntent rejects a missing payload field", () => {
  const errors = rejected(
    validateIntent({
      type: "answer",
      source: "button",
      payload: { optionId: "coding" }
    })
  );
  assert.deepEqual(errors, ["payload.questionId is required"]);
});

test("validateIntent rejects a command amount that is a string", () => {
  const errors = rejected(
    validateIntent({
      type: "command",
      source: "text",
      payload: { action: "resize", amount: "20" }
    })
  );
  assert.deepEqual(errors, ["payload.amount must be a number"]);
});

test("validateIntent rejects an unknown talk topic", () => {
  const errors = rejected(
    validateIntent({
      type: "talk",
      source: "text",
      payload: { topic: "price" }
    })
  );
  assert.deepEqual(errors, ["payload.topic must be one of: faq, cheaper, smalltalk"]);
});

test("validateExecutorResult accepts every kind when the turn succeeded", () => {
  for (const kind of INTENT_TYPES) {
    accepted(
      validateExecutorResult(
        executorResult({
          kind,
          sceneChanged: kind === "command",
          facts: { sku: "DESK-TOP-1800" },
          say: { code: "scene.updated", params: { sku: "DESK-TOP-1800" } }
        })
      )
    );
  }
});

test("validateExecutorResult accepts every reason code when the turn failed", () => {
  for (const reasonCode of REASON_CODES) {
    accepted(
      validateExecutorResult(
        executorResult({
          ok: false,
          kind: "command",
          sceneChanged: false,
          reasonCode,
          say: { code: "cannot", params: {} }
        })
      )
    );
  }
});

test("validateExecutorResult rejects null, undefined, and non-objects", () => {
  for (const value of [null, undefined, "text", 1, false, []]) {
    assert.deepEqual(rejected(validateExecutorResult(value)), ["must be an object"]);
  }
});

test("validateExecutorResult rejects an unknown kind", () => {
  const errors = rejected(validateExecutorResult(executorResult({ kind: "reply" })));
  assert.deepEqual(errors, ["kind must be one of: answer, command, talk, unclear"]);
});

test("validateExecutorResult rejects a missing say", () => {
  const value = executorResult();
  delete value.say;
  const errors = rejected(validateExecutorResult(value));
  assert.deepEqual(errors, ["say is required"]);
});

test("validateExecutorResult rejects a failed turn without a reason code", () => {
  const missing = executorResult({ ok: false });
  delete missing.reasonCode;
  assert.deepEqual(rejected(validateExecutorResult(missing)), [
    "reasonCode is required when ok is false"
  ]);
  assert.deepEqual(rejected(validateExecutorResult(executorResult({ ok: false, reasonCode: null }))), [
    "reasonCode is required when ok is false"
  ]);
});

test("validateExecutorResult rejects a failed turn with an unknown reason code", () => {
  const errors = rejected(
    validateExecutorResult(executorResult({ ok: false, reasonCode: "nope" }))
  );
  assert.deepEqual(errors, [
    "reasonCode must be one of: unclear, unknown_sku, limit, no_host, host_full, cannot_remove_support, nothing_cheaper, not_found, not_implemented, distance_unclear, distance_not_on_scene, distance_need_two, distance_no_position"
  ]);
});

test("validateExecutorResult rejects a successful turn with a reason code", () => {
  const errors = rejected(
    validateExecutorResult(executorResult({ ok: true, reasonCode: "limit" }))
  );
  assert.deepEqual(errors, ["reasonCode must be null when ok is true"]);
});

test("validateExecutorResult rejects a facts value that is not an object", () => {
  const errors = rejected(validateExecutorResult(executorResult({ facts: ["DESK-TOP-1800"] })));
  assert.deepEqual(errors, ["facts must be an object"]);
});

test("validateReplyInput accepts a result and a following question", () => {
  accepted(
    validateReplyInput({
      result: executorResult(),
      context: replyContext()
    })
  );
});

test("validateReplyInput accepts a failed result and no following question", () => {
  accepted(
    validateReplyInput({
      result: executorResult({ ok: false, kind: "unclear", reasonCode: "unclear" }),
      context: replyContext({ sceneSkus: [], nextQuestion: null })
    })
  );
});

test("validateReplyInput rejects null, undefined, and non-objects", () => {
  for (const value of [null, undefined, "text", 1, true, []]) {
    assert.deepEqual(rejected(validateReplyInput(value)), ["must be an object"]);
  }
});

test("validateReplyInput rejects an executor result that breaks its contract", () => {
  const errors = rejected(
    validateReplyInput({
      result: executorResult({ ok: true, reasonCode: "limit" }),
      context: replyContext()
    })
  );
  assert.deepEqual(errors, ["result.reasonCode must be null when ok is true"]);
});

test("validateReplyInput rejects a missing context field and a non-string sku", () => {
  const missingProfile = replyContext();
  delete missingProfile.profile;
  assert.ok(
    rejected(
      validateReplyInput({
        result: executorResult(),
        context: missingProfile
      })
    ).includes("context.profile is required")
  );

  const errors = rejected(
    validateReplyInput({
      result: executorResult(),
      context: replyContext({ sceneSkus: ["DESK-TOP-1800", 2] })
    })
  );
  assert.deepEqual(errors, ["context.sceneSkus must be an array of strings"]);
});

test("validateReplyOutput accepts a template and an ai reply", () => {
  accepted(validateReplyOutput({ text: "Ширина столешницы 180 см.", via: "template" }));
  accepted(validateReplyOutput({ text: "Можно поставить стол поуже.", via: "ai" }));
});

test("validateReplyOutput rejects null, undefined, and non-objects", () => {
  for (const value of [null, undefined, "text", 1, false, []]) {
    assert.deepEqual(rejected(validateReplyOutput(value)), ["must be an object"]);
  }
});

test("validateReplyOutput rejects an unknown via", () => {
  const errors = rejected(validateReplyOutput({ text: "Готово.", via: "voice" }));
  assert.deepEqual(errors, ["via must be one of: template, ai"]);
});

test("validateReplyOutput rejects an empty text", () => {
  assert.deepEqual(rejected(validateReplyOutput({ text: "", via: "template" })), [
    "text must be a non-empty string"
  ]);
});

test("validators do not change a frozen input", () => {
  const samples = [
    [
      validateIntent,
      {
        type: "answer",
        source: "button",
        payload: { questionId: "q_work_type", optionId: "coding" }
      }
    ],
    [validateExecutorResult, executorResult({ facts: { sku: "DESK-TOP-1800" } })],
    [
      validateReplyInput,
      {
        result: executorResult(),
        context: replyContext()
      }
    ],
    [validateReplyOutput, { text: "Готово.", via: "template" }],
    [
      validateScene,
      {
        skus: ["DESK-LEGS-1400"],
        placements: [{ sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 }],
        person: null,
        ergo: null
      }
    ]
  ];

  for (const [validate, value] of samples) {
    const before = structuredClone(value);
    deepFreeze(value);
    accepted(validate(value));
    assert.deepEqual(value, before);
  }

  const bad = deepFreeze(executorResult({ ok: true, reasonCode: "limit" }));
  const beforeBad = structuredClone(bad);
  rejected(validateExecutorResult(bad));
  assert.deepEqual(bad, beforeBad);
});

function ergoTargets(hand = "right") {
  return {
    seatHeightMm: 455,
    deskHeightMm: 726,
    eyeHeightMm: 1255,
    monitorDistanceMm: 595,
    monitorTopMm: 1255,
    hand
  };
}

test("validateScene requires placements, person and ergo beside skus", () => {
  accepted(
    validateScene({
      skus: [],
      placements: [],
      person: null,
      ergo: null
    })
  );
  accepted(
    validateScene({
      skus: [],
      placements: [],
      person: { sku: "character", x: 0, y: 450, z: 760, rotY: 180, scale: 1 },
      ergo: {
        targets: ergoTargets("left"),
        issues: [
          {
            code: "desk_too_high",
            sku: "DESK-TOP-1800",
            actualMm: 1030,
            targetMm: 726,
            deltaMm: 304
          }
        ]
      }
    })
  );
  accepted(
    validateScene({
      skus: [],
      placements: [],
      person: null,
      ergo: {
        targets: ergoTargets(),
        issues: [{ code: "monitor_too_close", actualMm: 200, targetMm: 595, deltaMm: -395 }]
      }
    })
  );
  assert.deepEqual(rejected(validateScene({ skus: ["DESK-LEGS-1400"], person: null, ergo: null })), [
    "placements is required"
  ]);
  assert.deepEqual(
    rejected(
      validateScene({
        skus: ["DESK-LEGS-1400"],
        placements: [{ sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0 }],
        person: null,
        ergo: null
      })
    ),
    ["placements[0].rotY must be a number"]
  );
  assert.deepEqual(
    rejected(
      validateScene({
        skus: [],
        placements: [],
        ergo: null
      })
    ),
    ["person is required"]
  );
  assert.deepEqual(
    rejected(
      validateScene({
        skus: [],
        placements: [],
        person: { sku: "character", x: 0, y: 450, z: 760, rotY: 180 },
        ergo: null
      })
    ),
    ["person.scale must be a number"]
  );
  assert.deepEqual(
    rejected(
      validateScene({
        skus: [],
        placements: [],
        person: null
      })
    ),
    ["ergo is required"]
  );
  assert.deepEqual(
    rejected(
      validateScene({
        skus: [],
        placements: [],
        person: null,
        ergo: { targets: ergoTargets(), issues: [{ code: "desk_ok", actualMm: 1, targetMm: 1, deltaMm: 0 }] }
      })
    ),
    ["ergo.issues[0].code must be one of: desk_too_high, desk_too_low, monitor_too_close, monitor_too_far, monitor_too_high, monitor_too_low"]
  );
  assert.deepEqual(
    rejected(
      validateScene({
        skus: [],
        placements: [],
        person: null,
        ergo: { targets: { ...ergoTargets(), hand: "both" }, issues: [] }
      })
    ),
    ['ergo.targets.hand must be "right" or "left"']
  );
});
