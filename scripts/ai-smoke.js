import { buildContext } from "../backend/pipeline/context.js";
import { callLlm } from "../backend/ai/llm.js";
import { parseWithLlm } from "../backend/understanding/parse-with-llm.js";

const PHRASES = [
  "поставь мне ещё один экран",
  "а нельзя ли подешевле",
  "сколько от монитора до стола",
  "а есть доставка?",
  "привет"
];

try {
  process.loadEnvFile();
} catch {}

function missingConfig() {
  const missing = [];
  if (process.env.AI_ENABLED !== "true") missing.push("AI_ENABLED=true");
  if (typeof process.env.OPENAI_API_KEY !== "string" || process.env.OPENAI_API_KEY.trim() === "") {
    missing.push("OPENAI_API_KEY");
  }
  if (typeof process.env.OPENAI_MODEL !== "string" || process.env.OPENAI_MODEL.trim() === "") {
    missing.push("OPENAI_MODEL");
  }
  return missing;
}

function showIntent(intent) {
  if (!intent) return "null";
  const payload = intent.payload ?? {};
  if (intent.type === "command") {
    const sku = payload.sku ? ` ${payload.sku}` : "";
    const skus = Array.isArray(payload.skus) ? ` [${payload.skus.join(", ")}]` : "";
    return `command ${payload.action}${sku}${skus}`;
  }
  if (intent.type === "talk") {
    const faq = payload.faqId ? ` ${payload.faqId}` : "";
    return `talk ${payload.topic}${faq}`;
  }
  return intent.type;
}

async function main() {
  const missing = missingConfig();
  if (missing.length > 0) {
    console.error(`AI не настроен (${missing.join(", ")}). Добавьте их в .env. Ключ не печатается.`);
    process.exit(1);
  }

  const vocabulary = buildContext("ai-smoke").vocabulary;
  console.log(`model=${process.env.OPENAI_MODEL}`);
  for (const text of PHRASES) {
    let usage = { inputTokens: 0, outputTokens: 0 };
    let reason = "";
    const started = Date.now();
    const intent = await parseWithLlm({
      text,
      vocabulary,
      llm: async (args) => {
        const result = await callLlm(args);
        if (result.usage) usage = result.usage;
        if (!result.ok) reason = result.reason;
        return result;
      }
    });
    const ms = Date.now() - started;
    const fail = reason ? ` reason=${reason}` : "";
    console.log(`${text}\n  intent: ${showIntent(intent)}${fail}\n  tokens in=${usage.inputTokens} out=${usage.outputTokens} ms=${ms}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
