import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../config/load.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { validateDialogResponse } from "./contracts.js";
import { buildContext } from "./context.js";
import { getScene } from "./reads.js";
import { runMessage, runTurn } from "./orchestrator.js";
import { buildResponse } from "./response.js";

const CLIENTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");
const KEYS = ["AI_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL"];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function forget(clientId) {
  rmSync(path.join(CLIENTS, clientId), { recursive: true, force: true });
}

function restoreEnv() {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function warmReply(request) {
  const user = typeof request?.user === "string" ? request.user : "";
  const template = user.replace(/^Реплика:\s*/, "").replace(/\nКод:[\s\S]*$/, "");
  return { ok: true, text: JSON.stringify({ text: `Хорошо. ${template}`.replace(/\s+/g, " ").trim() }) };
}

async function withAiVoice(run, mutate) {
  const previous = process.env.SOS_DATA_DIR;
  const dir = mkdtempSync(path.join(os.tmpdir(), "sos-voice-"));
  try {
    cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data"), dir, { recursive: true });
    const file = path.join(dir, "ai-rules.json");
    const rules = JSON.parse(readFileSync(file, "utf8"));
    rules.published = structuredClone(rules.draft);
    if (typeof mutate === "function") mutate(rules);
    writeFileSync(file, `${JSON.stringify(rules, null, 2)}\n`);
    process.env.SOS_DATA_DIR = dir;
    await run();
  } finally {
    if (previous === undefined) delete process.env.SOS_DATA_DIR;
    else process.env.SOS_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("runMessage ai", { concurrency: 1 }, () => {
  afterEach(() => {
    restoreEnv();
  });

  test("disabled ai keeps the dictionary result and does not fetch", async () => {
    const clientId = "orchestrator-ai-off";
    forget(clientId);
    process.env.AI_ENABLED = "false";
    process.env.OPENAI_API_KEY = "SENTINEL_OPENAI_KEY";
    process.env.OPENAI_MODEL = "test-model";
    const logs = [];
    const original = console.log;
    console.log = (...args) => {
      logs.push(args.map((item) => String(item)).join(" "));
    };
    let calls = 0;
    try {
      const outcome = await runMessage({
        clientId,
        text: "абракадабра",
        fetchImpl: async () => {
          calls += 1;
          return new Response("no", { status: 500 });
        }
      });
      assert.equal(calls, 0);
      assert.equal(outcome.status, 200);
      assert.deepEqual(outcome.body, { ok: true });
      assert.equal(outcome.result.ok, false);
      assert.equal(outcome.result.kind, "unclear");
      assert.equal(outcome.result.reasonCode, "unclear");
      assert.deepEqual(outcome.result.facts, { reason: "no_match" });
      assert.equal(outcome.result.sceneChanged, false);
      assert.equal(logs.join("\n").includes("SENTINEL_OPENAI_KEY"), false);
    } finally {
      console.log = original;
      forget(clientId);
    }
  });

  test("enabled ai is not called when the dictionary understands the phrase", async () => {
    const clientId = "orchestrator-ai-known";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
    let calls = 0;
    try {
      const outcome = await runMessage({
        clientId,
        text: "привет",
        fetchImpl: async () => {
          calls += 1;
          return new Response("no", { status: 500 });
        },
        llm: async () => {
          calls += 1;
          return { ok: false, reason: "network" };
        }
      });
      assert.equal(calls, 0);
      assert.equal(outcome.result.ok, true);
      assert.equal(outcome.result.kind, "talk");
      assert.deepEqual(outcome.result.facts, { topic: "smalltalk" });
    } finally {
      forget(clientId);
    }
  });

  test("a dictionary miss with a valid ai command changes the scene", async () => {
    const clientId = "orchestrator-ai-add";
    forget(clientId);
    try {
      const outcome = await runMessage({
        clientId,
        text: "хочу ещё одно кресло к столу",
        llm: async () => ({
          ok: true,
          text: JSON.stringify({ type: "command", action: "add", sku: "CHAIR-460" })
        })
      });
      assert.equal(outcome.status, 200);
      assert.equal(outcome.result.ok, true);
      assert.equal(outcome.result.kind, "command");
      assert.equal(outcome.result.sceneChanged, true);
      assert.equal(outcome.result.facts.sku, "CHAIR-460");
      assert.equal(computeScenePlan(readCatalog(), outcome.profile).includes("CHAIR-460"), true);
    } finally {
      forget(clientId);
    }
  });

  test("a failed ai call stays unclear and the turn does not throw", async () => {
    const clientId = "orchestrator-ai-fail";
    forget(clientId);
    try {
      const failed = await runMessage({
        clientId,
        text: "хочу ещё одно кресло к столу",
        llm: async () => ({ ok: false, reason: "timeout" })
      });
      assert.equal(failed.result.kind, "unclear");
      assert.deepEqual(failed.result.facts, { reason: "no_match" });
      assert.equal(computeScenePlan(readCatalog(), failed.profile).includes("CHAIR-460"), false);

      const thrown = await runMessage({
        clientId,
        text: "хочу ещё одно кресло к столу",
        llm: async () => {
          throw new Error("boom");
        }
      });
      assert.equal(thrown.status, 200);
      assert.equal(thrown.result.kind, "unclear");
      assert.deepEqual(thrown.result.facts, { reason: "no_match" });
    } finally {
      forget(clientId);
    }
  });

  test("disabled ai voice keeps the template reply", async () => {
    const clientId = "orchestrator-voice-off";
    forget(clientId);
    process.env.AI_ENABLED = "false";
    let calls = 0;
    try {
      await withAiVoice(async () => {
        const outcome = await runMessage({
          clientId,
          text: "добавь кресло",
          llm: async () => {
            calls += 1;
            return warmReply({ user: "Реплика: лишнее\nКод: command_added" });
          }
        });
        const plain = buildResponse({ outcome, context: buildContext(clientId) });
        assert.equal(calls, 0);
        assert.equal(outcome.status, 200);
        assert.equal(outcome.response.status, 200);
        assert.deepEqual(outcome.response.reply, plain.reply);
        assert.equal(outcome.response.reply.via, "template");
      });
    } finally {
      forget(clientId);
    }
  });

  test("a good voice candidate replaces the reply and keeps fallback", async () => {
    const clientId = "orchestrator-voice-on";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    try {
      await withAiVoice(async () => {
        const desk = await runTurn({ clientId, questionId: "q_work_type", optionId: "coding" });
        assert.equal(desk.status, 200);
        const added = await runMessage({
          clientId,
          text: "добавь второй монитор",
          llm: async (request) => warmReply(request)
        });
        assert.equal(added.result.ok, true, "добавь второй монитор");
        let seen;
        const outcome = await runMessage({
          clientId,
          text: "расстояние между мониторами",
          llm: async (request) => {
            seen = request;
            return warmReply(request);
          }
        });
        const plain = buildResponse({ outcome, context: buildContext(clientId) });
        assert.equal(outcome.status, 200);
        assert.equal(outcome.result.say.code, "distance_measure");
        assert.equal(outcome.response.reply.via, "ai");
        assert.equal(outcome.response.reply.text.startsWith("Хорошо."), true);
        assert.equal(outcome.response.reply.text.includes(plain.reply.text), true);
        assert.equal(typeof outcome.response.reply.fallback, "string");
        assert.equal(outcome.response.reply.fallback, plain.reply.fallback);
        assert.equal(seen.purpose, "voice");
        assert.equal(seen.user.includes(clientId), false);
        assert.equal(seen.user.includes("profile"), false);
      });
    } finally {
      forget(clientId);
    }
  });

  test("a bad candidate and a failed voice call keep the template and status 200", async () => {
    const clientId = "orchestrator-voice-bad";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    try {
      await withAiVoice(async () => {
        const bad = await runMessage({
          clientId,
          text: "добавь кресло",
          llm: async () => ({ ok: true, text: JSON.stringify({ text: "Гарантирую новое кресло." }) })
        });
        const badPlain = buildResponse({ outcome: bad, context: buildContext(clientId) });
        assert.equal(bad.status, 200);
        assert.equal(bad.response.reply.via, "template");
        assert.equal(bad.response.reply.text, badPlain.reply.text);

        const crashed = await runMessage({
          clientId,
          text: "убери кресло",
          llm: async () => {
            throw new Error("boom");
          }
        });
        const crashedPlain = buildResponse({ outcome: crashed, context: buildContext(clientId) });
        assert.equal(crashed.status, 200);
        assert.equal(crashed.response.status, 200);
        assert.equal(crashed.response.reply.via, "template");
        assert.equal(crashed.response.reply.text, crashedPlain.reply.text);
      });
    } finally {
      forget(clientId);
    }
  });

  function assertMeta(outcome, expected, ...hidden) {
    assert.deepEqual(validateDialogResponse(outcome.response), { ok: true, errors: [] });
    assert.deepEqual(outcome.response.meta, expected);
    assert.equal(outcome.response.scene.meta, undefined);
    const blob = JSON.stringify(outcome.response.meta);
    for (const text of [outcome.response.reply?.text, outcome.response.reply?.fallback, ...hidden]) {
      if (typeof text === "string" && text.length > 0) assert.equal(blob.includes(text), false, text);
    }
  }

  test("disabled ai marks the template and does not put the client text in meta", async () => {
    const clientId = "meta-ai-off";
    forget(clientId);
    process.env.AI_ENABLED = "false";
    process.env.OPENAI_API_KEY = "SENTINEL_OPENAI_KEY";
    const phrase = "добавь кресло";
    try {
      const outcome = await runMessage({ clientId, text: phrase });
      assert.equal(outcome.response.reply.via, "template");
      assertMeta(
        outcome,
        { understood: "dictionary", voice: "template", voiceNote: "ai_off" },
        phrase,
        "SENTINEL_OPENAI_KEY"
      );
      assert.equal(getScene(clientId).meta, undefined);
    } finally {
      forget(clientId);
    }
  });

  test("a dictionary miss understood by ai is marked ai", async () => {
    const clientId = "meta-understood-ai";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "хочу ещё одно кресло к столу";
    try {
      await withAiVoice(async () => {
        const outcome = await runMessage({
          clientId,
          text: phrase,
          llm: async (request) => {
            if (request?.purpose === "parse") {
              return {
                ok: true,
                text: JSON.stringify({ type: "command", action: "add", sku: "CHAIR-460" })
              };
            }
            return warmReply(request);
          }
        });
        assert.equal(outcome.result.kind, "command");
        assert.equal(outcome.response.reply.via, "ai");
        assertMeta(outcome, { understood: "ai", voice: "ai" }, phrase, "Хорошо");
      });
    } finally {
      forget(clientId);
    }
  });

  test("a button answer is understood as a button and the answer body stays ok", async () => {
    const clientId = "meta-button";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    try {
      await withAiVoice(async () => {
        let calls = 0;
        const outcome = await runTurn({
          clientId,
          questionId: "q_work_type",
          optionId: "coding",
          llm: async () => {
            calls += 1;
            return { ok: true, text: JSON.stringify({ text: "Живая реплика." }) };
          }
        });
        assert.equal(calls, 0);
        assert.deepEqual(outcome.body, { ok: true });
        assert.equal(outcome.response.reply.via, "template");
        assertMeta(outcome, { understood: "button", voice: "template", voiceNote: "skip_code" });
      });
    } finally {
      forget(clientId);
    }
  });

  test("a phrase nobody understood is marked none", async () => {
    const clientId = "meta-none";
    forget(clientId);
    process.env.AI_ENABLED = "false";
    const phrase = "абракадабра";
    try {
      const outcome = await runMessage({ clientId, text: phrase });
      assert.equal(outcome.result.kind, "unclear");
      assertMeta(outcome, { understood: "none", voice: "template", voiceNote: "ai_off" }, phrase);
      assert.equal(getScene(clientId).meta, undefined);
    } finally {
      forget(clientId);
    }
  });

  test("ai voice switched off in the rules keeps the template", async () => {
    const clientId = "meta-voice-off";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "добавь кресло";
    try {
      await withAiVoice(
        async () => {
          let calls = 0;
          const outcome = await runMessage({
            clientId,
            text: phrase,
            llm: async () => {
              calls += 1;
              return warmReply({ user: "Реплика: лишнее\nКод: command_added" });
            }
          });
          assert.equal(calls, 0);
          assert.equal(outcome.response.reply.via, "template");
          assertMeta(outcome, { understood: "dictionary", voice: "template", voiceNote: "voice_off" }, phrase);
        },
        (rules) => {
          rules.published.output.aiVoice = false;
        }
      );
    } finally {
      forget(clientId);
    }
  });

  test("a skip code does not ask ai for a paraphrase", async () => {
    const clientId = "meta-skip";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "привет";
    try {
      await withAiVoice(async () => {
        let calls = 0;
        const outcome = await runMessage({
          clientId,
          text: phrase,
          llm: async () => {
            calls += 1;
            return warmReply({ user: "Реплика: лишнее\nКод: smalltalk" });
          }
        });
        assert.equal(calls, 0);
        assert.equal(outcome.result.facts.topic, "smalltalk");
        assertMeta(outcome, { understood: "dictionary", voice: "template", voiceNote: "skip_code" }, phrase);
      });
    } finally {
      forget(clientId);
    }
  });

  test("a failed voice call is marked failed and keeps the template", async () => {
    const clientId = "meta-failed";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "добавь кресло";
    try {
      await withAiVoice(async () => {
        const outcome = await runMessage({
          clientId,
          text: phrase,
          llm: async () => {
            throw new Error("boom");
          }
        });
        assert.equal(outcome.status, 200);
        assert.equal(outcome.response.reply.via, "template");
        assertMeta(outcome, { understood: "dictionary", voice: "template", voiceNote: "failed" }, phrase);
      });
    } finally {
      forget(clientId);
    }
  });

  test("a paraphrase that changes a number is rejected", async () => {
    const clientId = "meta-rejected";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "добавь кресло";
    const candidate = "Кресло уже стоит, до стены 12 см.";
    try {
      await withAiVoice(async () => {
        const outcome = await runMessage({
          clientId,
          text: phrase,
          llm: async () => ({ ok: true, text: JSON.stringify({ text: candidate }) })
        });
        assert.equal(outcome.response.reply.via, "template");
        assert.equal(outcome.response.reply.text.includes(candidate), false);
        assertMeta(
          outcome,
          { understood: "dictionary", voice: "template", voiceNote: "rejected:number_changed" },
          phrase,
          candidate
        );
      });
    } finally {
      forget(clientId);
    }
  });

  test("an accepted paraphrase is marked as an ai reply", async () => {
    const clientId = "meta-accepted";
    forget(clientId);
    process.env.AI_ENABLED = "true";
    const phrase = "добавь кресло";
    try {
      await withAiVoice(async () => {
        const outcome = await runMessage({
          clientId,
          text: phrase,
          llm: async (request) => warmReply(request)
        });
        assert.equal(outcome.response.reply.via, "ai");
        assert.equal(outcome.response.reply.text.startsWith("Хорошо."), true);
        assertMeta(outcome, { understood: "dictionary", voice: "ai" }, phrase, "Хорошо");
        assert.equal(outcome.response.meta.voiceNote, undefined);
      });
    } finally {
      forget(clientId);
    }
  });
});
