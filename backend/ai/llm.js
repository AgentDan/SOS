const RETRY_PAUSE_MS = 100;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_TOKENS = 150;
const URL = "https://api.openai.com/v1/chat/completions";

function positive(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  return null;
}

function finiteCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function envText(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function logCall(result, started) {
  const usage = result.ok ? result.usage : { inputTokens: 0, outputTokens: 0 };
  const state = result.ok ? "ok" : "fail";
  const reason = result.ok ? "ok" : result.reason;
  const ms = Date.now() - started;
  console.log(`ai call ${state} reason=${reason} in=${usage.inputTokens} out=${usage.outputTokens} ms=${ms}`);
}

async function readText(response) {
  try {
    if (response && typeof response.text === "function") return await response.text();
  } catch {
    return "";
  }
  return "";
}

async function classify(response) {
  const status = response?.status;
  if (status === 401 || status === 403) return { ok: false, retry: false, reason: "auth" };
  if (status === 429) {
    const raw = await readText(response);
    if (raw.includes("insufficient_quota")) return { ok: false, retry: false, reason: "quota" };
    return { ok: false, retry: true, reason: "rate_limit" };
  }
  if (typeof status === "number" && status >= 500 && status <= 599) {
    return { ok: false, retry: true, reason: "network" };
  }
  if (status !== 200) return { ok: false, retry: false, reason: "bad_response" };

  let body;
  try {
    body = JSON.parse(await readText(response));
  } catch {
    return { ok: false, retry: false, reason: "bad_response" };
  }
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return { ok: false, retry: false, reason: "bad_response" };
  return {
    ok: true,
    retry: false,
    text,
    usage: {
      inputTokens: finiteCount(body?.usage?.prompt_tokens),
      outputTokens: finiteCount(body?.usage?.completion_tokens)
    }
  };
}

async function once(fetchFn, key, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return await classify(response);
  } catch {
    if (controller.signal.aborted) return { ok: false, retry: false, reason: "timeout" };
    return { ok: false, retry: true, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

async function runCall({ system, user, maxTokens, timeoutMs, fetchImpl } = {}) {
  if (process.env.AI_ENABLED !== "true") return { ok: false, reason: "disabled" };
  const key = envText("OPENAI_API_KEY");
  if (!key) return { ok: false, reason: "no_key" };
  const model = envText("OPENAI_MODEL");
  if (!model) return { ok: false, reason: "no_model" };

  const fetchFn = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (typeof fetchFn !== "function") return { ok: false, reason: "network" };

  const limit = positive(timeoutMs) ?? positive(process.env.AI_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;
  const tokens = positive(maxTokens) ?? DEFAULT_MAX_TOKENS;
  const payload = {
    model,
    temperature: 0,
    max_completion_tokens: tokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: typeof system === "string" ? system : "" },
      { role: "user", content: typeof user === "string" ? user : "" }
    ]
  };

  let last = { ok: false, retry: false, reason: "network" };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    last = await once(fetchFn, key, payload, limit);
    if (last.ok || !last.retry || attempt === 2) break;
    await sleep(RETRY_PAUSE_MS);
  }
  if (last.ok) return { ok: true, text: last.text, usage: last.usage };
  return { ok: false, reason: last.reason };
}

async function callLlm(request = {}) {
  const started = Date.now();
  let result;
  try {
    result = await runCall(request ?? {});
  } catch {
    result = { ok: false, reason: "bad_response" };
  }
  if (!result || result.ok !== true || typeof result.text !== "string") {
    const reason = result && typeof result.reason === "string" ? result.reason : "bad_response";
    const failure = { ok: false, reason };
    logCall(failure, started);
    return failure;
  }
  const success = {
    ok: true,
    text: result.text,
    usage: result.usage ?? { inputTokens: 0, outputTokens: 0 }
  };
  logCall(success, started);
  return success;
}

export { callLlm };
