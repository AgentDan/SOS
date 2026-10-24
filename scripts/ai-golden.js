import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext } from "../backend/pipeline/context.js";
import { callLlm } from "../backend/ai/llm.js";
import { interpret } from "../backend/understanding/interpret.js";
import { parseWithLlm } from "../backend/understanding/parse-with-llm.js";

const PHRASES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "ai", "golden-phrases.json");

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

function sameIntent(actual, expected) {
  if (expected?.type === "unclear") return actual?.type === "unclear";
  if (!actual || actual.type !== expected?.type) return false;
  return JSON.stringify(actual.payload ?? {}) === JSON.stringify(expected.payload ?? {});
}

function showIntent(intent) {
  if (!intent) return "null";
  if (intent.type === "unclear") return "unclear";
  return `${intent.type} ${JSON.stringify(intent.payload ?? {})}`;
}

async function main() {
  const missing = missingConfig();
  if (missing.length > 0) {
    console.error(`AI не настроен (${missing.join(", ")}). Добавьте их в .env. Ключ не печатается.`);
    process.exit(1);
  }

  const rows = JSON.parse(readFileSync(PHRASES, "utf8"));
  const vocabulary = buildContext("ai-golden").vocabulary;
  let dictionaryHits = 0;
  let combinedHits = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  console.log("phrase\tdictionary\twith AI\texpected");
  for (const row of rows) {
    const dictionary = interpret({ source: "text", text: row.text }, vocabulary);
    let combined = dictionary;
    if (dictionary?.type === "unclear" && dictionary.payload?.reason === "no_match") {
      let usage = null;
      const parsed = await parseWithLlm({
        text: row.text,
        vocabulary,
        llm: async (args) => {
          const result = await callLlm(args);
          if (result.usage) usage = result.usage;
          return result;
        }
      });
      if (usage) {
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
      }
      if (parsed) combined = parsed;
    }

    const dictionaryOk = sameIntent(dictionary, row.expect);
    const combinedOk = sameIntent(combined, row.expect);
    if (dictionaryOk) dictionaryHits += 1;
    if (combinedOk) combinedHits += 1;
    console.log(
      `${row.text}\t${dictionaryOk ? "ok" : showIntent(dictionary)}\t${combinedOk ? "ok" : showIntent(combined)}\t${showIntent(row.expect)}`
    );
  }

  console.log(`Словарь: ${dictionaryHits}/${rows.length}`);
  console.log(`Словарь + AI: ${combinedHits}/${rows.length}`);
  console.log(`Токены: in=${inputTokens} out=${outputTokens}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
