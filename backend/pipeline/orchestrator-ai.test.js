import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../config/load.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { runMessage } from "./orchestrator.js";

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
});
