import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_TEXT } from "../voice/reply.js";
import { validateScene } from "./contracts.js";
import { buildResponse } from "./response.js";

const QUESTION = "Чем вы в основном занимаетесь за столом?";

const catalog = {
  types: [{ id: "desk_legs" }, { id: "chair" }],
  products: [
    {
      sku: "DESK-LEGS-1400",
      type: "desk_legs",
      alwaysPresent: true,
      label: "опоры стола",
      dimensions: { width: 1400, depth: 700, height: 1000 }
    },
    {
      sku: "CHAIR-460",
      type: "chair",
      label: "кресло",
      dimensions: { width: 460, depth: 520, height: 900 },
      placement: { offset: { z: 760 } }
    },
    { sku: "DESK-TOP-1800", label: "стол 180" },
    { sku: "DESK-TOP-1400", label: "стол 140" }
  ]
};

const questionnaire = {
  phases: [{ id: "interview", order: 1 }],
  questions: [
    {
      id: "q_work_type",
      phase: "interview",
      priority: 10,
      textFallback: QUESTION
    }
  ]
};

const replies = {
  answer_ok: "Записал.",
  unclear: "Не совсем понял. Скажите иначе, пожалуйста.",
  command_added: "Готово, добавил: {item}."
};

function commandResult() {
  return {
    ok: true,
    kind: "command",
    sceneChanged: true,
    facts: { action: "add", sku: "CHAIR-460" },
    reasonCode: null,
    say: { code: "command_added", params: { sku: "CHAIR-460" } }
  };
}

test("buildResponse speaks from the profile after the command", () => {
  const result = commandResult();
  const body = buildResponse({
    outcome: {
      profile: {
        clientId: "reply-scene",
        needs: [],
        sceneEdits: [{ op: "add", sku: "CHAIR-460" }]
      },
      result
    },
    context: {
      catalog,
      questionnaire,
      consultant: { replies },
      profile: { clientId: "reply-scene", needs: [] }
    }
  });

  assert.equal(body.version, 1);
  assert.equal(body.status, 200);
  assert.equal(body.question.textFallback, QUESTION);
  assert.deepEqual(body.scene.skus, ["DESK-LEGS-1400", "CHAIR-460"]);
  assert.deepEqual(body.scene.placements, [
    { sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 },
    { sku: "CHAIR-460", x: 0, y: 0, z: 760, rotY: 180 }
  ]);
  assert.equal(body.scene.issues, undefined);
  assert.equal(body.scene.person, null);
  assert.equal(body.scene.ergo, null);
  assert.deepEqual(validateScene(body.scene), { ok: true, errors: [] });
  assert.deepEqual(body.reply, { text: "Готово, добавил: кресло.", via: "template" });
  assert.equal(body.result, result);
  assert.equal(body.reply.text.includes(QUESTION), false);
});

test("a successful answer appends the next question", () => {
  const body = buildResponse({
    outcome: {
      profile: { clientId: "reply-answer", needs: [] },
      result: {
        ok: true,
        kind: "answer",
        sceneChanged: false,
        facts: { questionId: "q_work_type", optionId: "coding" },
        reasonCode: null,
        say: { code: "answer_ok", params: {} }
      }
    },
    context: {
      catalog,
      questionnaire,
      consultant: { draft: { replies } }
    }
  });

  assert.equal(body.reply.text, `Записал. ${QUESTION}`);
  assert.equal(body.reply.via, "template");
});

test("a broken result still returns the fallback line", () => {
  const body = buildResponse({
    outcome: { profile: { clientId: "reply-broken" }, result: { ok: true } },
    context: { catalog, questionnaire, consultant: { faq: [] } }
  });

  assert.equal(body.version, 1);
  assert.equal(body.status, 200);
  assert.deepEqual(body.reply, { text: FALLBACK_TEXT, via: "template" });
  assert.ok(Array.isArray(body.scene.skus));
  assert.deepEqual(body.scene.placements, [{ sku: "DESK-LEGS-1400", x: 0, y: 0, z: 0, rotY: 0 }]);
  assert.equal(body.scene.person, null);
  assert.equal(body.scene.ergo, null);
  assert.equal(body.scene.issues, undefined);
});
