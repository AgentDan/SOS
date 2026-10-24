import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { callLlm } from "./llm.js";

const KEYS = ["AI_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL", "AI_TIMEOUT_MS"];
const MARKER = "SENTINEL_OPENAI_KEY";

let saved;
let logs;
let originalLog;

function completion(content, status = 200, usage = { prompt_tokens: 11, completion_tokens: 7 }) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function enable(key = "test-key") {
  process.env.AI_ENABLED = "true";
  process.env.OPENAI_API_KEY = key;
  process.env.OPENAI_MODEL = "test-model";
}

describe("callLlm", { concurrency: 1 }, () => {
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
    logs = [];
    originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map((item) => String(item)).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("200 returns text and token counts", async () => {
    enable();
    let seen;
    const result = await callLlm({
      system: "система",
      user: "фраза клиента",
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return completion('{"type":"unclear"}');
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.text, '{"type":"unclear"}');
    assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7 });
    assert.equal(seen.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(seen.init.method, "POST");
    const body = JSON.parse(seen.init.body);
    assert.equal(body.model, "test-model");
    assert.equal(body.temperature, 0);
    assert.equal(body.max_completion_tokens, 150);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.messages, [
      { role: "system", content: "система" },
      { role: "user", content: "фраза клиента" }
    ]);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^ai call ok reason=ok in=11 out=7 ms=\d+$/);
    assert.equal(logs[0].includes("test-key"), false);
    assert.equal(logs[0].includes("фраза клиента"), false);
    assert.equal(logs[0].includes("unclear"), false);
  });

  test("401 is auth and is not retried", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 });
      }
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: false, reason: "auth" });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^ai call fail reason=auth in=0 out=0 ms=\d+$/);
  });

  test("429 insufficient_quota is quota and is not retried", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" }
          }),
          { status: 429 }
        );
      }
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: false, reason: "quota" });
  });

  test("429 rate_limit is retried once", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({ error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }),
            { status: 429 }
          );
        }
        return completion('{"ok":true}');
      }
    });
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^ai call ok /);
  });

  test("500 is retried once", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("unavailable", { status: 500 });
        return completion('{"ok":true}', 200, { prompt_tokens: 3, completion_tokens: 4 });
      }
    });
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.deepEqual(result.usage, { inputTokens: 3, outputTokens: 4 });
    assert.equal(logs.length, 1);
  });

  test("timeout does not retry", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      timeoutMs: 30,
      fetchImpl: (_url, init) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          const abort = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init.signal.aborted) abort();
          else init.signal.addEventListener("abort", abort, { once: true });
        });
      }
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: false, reason: "timeout" });
  });

  test("a garbage body is bad_response", async () => {
    enable();
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return new Response("мусор", { status: 200 });
      }
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: false, reason: "bad_response" });
  });

  test("missing AI_ENABLED is disabled and does not fetch", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return completion("{}");
      }
    });
    assert.equal(calls, 0);
    assert.deepEqual(result, { ok: false, reason: "disabled" });
  });

  test("missing model is no_model and does not fetch", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-key";
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return completion("{}");
      }
    });
    assert.equal(calls, 0);
    assert.deepEqual(result, { ok: false, reason: "no_model" });
    assert.equal(logs.join("\n").includes("test-key"), false);
  });

  test("missing key is no_key and does not fetch", async () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_MODEL = "test-model";
    let calls = 0;
    const result = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return completion("{}");
      }
    });
    assert.equal(calls, 0);
    assert.deepEqual(result, { ok: false, reason: "no_key" });
  });

  test("errors and the console do not contain the key", async () => {
    enable(MARKER);
    let calls = 0;
    const thrown = await callLlm({
      system: MARKER,
      user: MARKER,
      fetchImpl: async () => {
        calls += 1;
        throw new Error(`network ${MARKER}`);
      }
    });
    const denied = await callLlm({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: MARKER } }), { status: 401 });
      }
    });

    const dumped = `${JSON.stringify(thrown)}\n${JSON.stringify(denied)}\n${logs.join("\n")}`;
    assert.equal(dumped.includes(MARKER), false);
    assert.equal(thrown.reason, "network");
    assert.equal(denied.reason, "auth");
    assert.equal(calls, 3);
  });
});
