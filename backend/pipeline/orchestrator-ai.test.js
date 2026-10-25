import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../config/load.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { buildContext } from "./context.js";
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

async function withAiVoice(run) {
  const previous = process.env.SOS_DATA_DIR;
  const dir = mkdtempSync(path.join(os.tmpdir(), "sos-voice-"));
  try {
    cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data"), dir, { recursive: true });
    const file = path.join(dir, "ai-rules.json");
    const rules = JSON.parse(readFileSync(file, "utf8"));
    rules.published = structuredClone(rules.draft);
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
        for (const text of ["добавь монитор", "добавь второй монитор"]) {
          const added = await runMessage({ clientId, text, llm: async (request) => warmReply(request) });
          assert.equal(added.result.ok, true, text);
        }
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
});
