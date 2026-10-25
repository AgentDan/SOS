import { callLlm } from "../ai/llm.js";
import { checkReply } from "./check-reply.js";

function systemPrompt(maxWords) {
  const lines = [
    'Перефразируй реплику консультанта по продаже офисной мебели. Сохрани смысл, все числа и названия товаров. Добавь тепла, но коротко. Не придумывай фактов, цен, обещаний. Верни только JSON {"text":"..."}.'
  ];
  if (typeof maxWords === "number" && Number.isFinite(maxWords) && maxWords > 0) {
    lines.push(`Максимум ${maxWords} слов.`);
  }
  return lines.join(" ");
}

function userPrompt(template, code) {
  const text = typeof template === "string" ? template : "";
  const name = typeof code === "string" ? code : "";
  return `Реплика: ${text}\nКод: ${name}`;
}

function shouldSkip(result, rules) {
  if (result?.kind === "answer") return true;
  const code = result?.say?.code;
  const skip = Array.isArray(rules?.aiSkipCodes) ? rules.aiSkipCodes : [];
  return typeof code === "string" && skip.includes(code);
}

function candidateText(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.text !== "string") return null;
  return parsed.text;
}

async function speakWithLlm({ template, result, rules, llm = callLlm, fetchImpl } = {}) {
  if (shouldSkip(result, rules)) return null;

  const ask = typeof llm === "function" ? llm : callLlm;
  let response;
  try {
    response = await ask({
      system: systemPrompt(rules?.maxWords),
      user: userPrompt(template, result?.say?.code),
      maxTokens: 150,
      purpose: "voice",
      fetchImpl
    });
  } catch {
    return null;
  }
  if (!response || response.ok !== true || typeof response.text !== "string") return null;

  const text = candidateText(response.text);
  if (text === null) return null;
  const verdict = checkReply({ template, candidate: text, rules });
  if (!verdict.ok) return null;
  return { text, via: "ai" };
}

export { speakWithLlm };
