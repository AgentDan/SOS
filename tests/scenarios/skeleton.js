import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAiRules, readConsultant } from "../../backend/config/load.js";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// Кнопки из programmer-wide-desk.json и back-pain-chair.json.
// coding → desk_top_wide → DESK-TOP-1800, «болит спина» → CHAIR-460.
const BUTTONS = [
  { questionId: "q_work_type", optionId: "coding" },
  { questionId: "q_desk_width", optionId: "wide" },
  { questionId: "q_back_pain", optionId: "yes" }
];

const skeletonSteps = [
  {
    n: 1,
    phrase: "программирую, от 160 см, болит спина",
    buttons: BUTTONS,
    expect: {
      intent: "answer",
      ok: true,
      reasonCode: null,
      sayCode: "answer_ok",
      sceneChanged: true,
      added: ["CHAIR-460", "DESK-TOP-1800"],
      absent: ["MON-613-366"]
    }
  },
  {
    n: 2,
    phrase: "убери кресло",
    text: "убери кресло",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_removed",
      sceneChanged: true,
      removed: ["CHAIR-460"],
      replyIncludes: ["кресло"]
    }
  },
  // Стол из кнопок — DESK-TOP-1800. Два монитора 613 мм на нём помещаются, третий нет.
  {
    n: 3,
    phrase: "добавь монитор",
    text: "добавь монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_added",
      sceneChanged: true,
      added: ["MON-613-366"],
      copies: { "MON-613-366": 1 }
    }
  },
  {
    n: 4,
    phrase: "добавь второй монитор",
    text: "добавь второй монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_added",
      sceneChanged: true,
      copies: { "MON-613-366": 2 }
    }
  },
  {
    n: 5,
    phrase: "добавь третий монитор",
    text: "добавь третий монитор",
    expect: {
      intent: "command",
      ok: false,
      reasonCode: "host_full",
      sayCode: "host_full",
      sceneChanged: false,
      copies: { "MON-613-366": 2 }
    }
  },
  {
    n: 6,
    phrase: "убери монитор",
    text: "убери монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_removed",
      sceneChanged: true,
      copies: { "MON-613-366": 1 }
    }
  },
  {
    n: 7,
    phrase: "а есть доставка?",
    text: "а есть доставка?",
    faqId: "delivery",
    expect: {
      intent: "talk",
      ok: true,
      reasonCode: null,
      sayCode: "faq_answer",
      sceneChanged: false
    }
  },
  // Один монитор помещается и на столе 1400. DESK-TOP-1800 стоит 259 €,
  // ближайший дешевле того же типа — DESK-TOP-1400 за 189 €, savedEur = 70.
  // Два монитора эту замену уже не пропустили бы.
  {
    n: 8,
    phrase: "покажи дешевле",
    text: "покажи дешевле",
    expect: {
      intent: "talk",
      ok: true,
      reasonCode: null,
      sayCode: "cheaper_done",
      sceneChanged: true,
      removed: ["DESK-TOP-1800"],
      added: ["DESK-TOP-1400"],
      savedEur: 70,
      replyIncludes: ["70"]
    }
  },
  {
    n: 9,
    phrase: "добавь второй монитор",
    text: "добавь второй монитор",
    expect: {
      intent: "command",
      ok: false,
      reasonCode: "host_full",
      sayCode: "host_full",
      sceneChanged: false,
      copies: { "MON-613-366": 1 }
    }
  },
  {
    n: 10,
    phrase: "абракадабра",
    text: "абракадабра",
    expect: {
      intent: "unclear",
      ok: false,
      reasonCode: "unclear",
      sayCode: "unclear",
      sceneChanged: false
    }
  }
];

function sameSkus(left, right) {
  return left.length === right.length && left.every((sku, index) => sku === right[index]);
}

function labelOf(step) {
  return `step ${step.n} (${step.phrase})`;
}

function readMaxWords() {
  const maxWords = readAiRules()?.output?.maxWords;
  if (typeof maxWords !== "number" || !Number.isFinite(maxWords) || maxWords < 1) return null;
  return maxWords;
}

function faqAnswer(id) {
  const faq = readConsultant()?.faq;
  if (!Array.isArray(faq)) return null;
  const entry = faq.find((item) => item && item.id === id);
  const answer = entry?.answer;
  return typeof answer === "string" && answer.trim() !== "" ? answer : null;
}

function shown(value) {
  return JSON.stringify(value);
}

function checkResult(errors, label, result, expect) {
  if (!result) {
    errors.push(`${label}: no result`);
    return;
  }
  if (result.kind !== expect.intent) {
    errors.push(`${label}: intent expected ${expect.intent}, got ${shown(result.kind)}`);
  }
  if (result.ok !== expect.ok) {
    errors.push(`${label}: ok expected ${expect.ok}, got ${shown(result.ok)}`);
  }
  if (result.reasonCode !== expect.reasonCode) {
    errors.push(
      `${label}: reasonCode expected ${shown(expect.reasonCode)}, got ${shown(result.reasonCode)}`
    );
  }
  if (result.say?.code !== expect.sayCode) {
    errors.push(`${label}: say.code expected ${expect.sayCode}, got ${shown(result.say?.code)}`);
  }
}

function checkReply(errors, label, reply, result, maxWords) {
  if (reply?.via !== "template") {
    errors.push(`${label}: reply.via expected "template", got ${shown(reply?.via)}`);
  }
  const text = reply?.text;
  if (typeof text !== "string" || text.trim() === "") {
    errors.push(`${label}: reply.text empty, got ${shown(text)}`);
    return;
  }
  if (maxWords !== null) {
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    if (words.length > maxWords) {
      errors.push(`${label}: reply has ${words.length} words, max ${maxWords}`);
    }
  }
  const placeholder = text.match(/\{[^{}]*\}/);
  if (placeholder) {
    errors.push(`${label}: raw placeholder ${placeholder[0]} in reply: ${text}`);
  }
  const codes = [result?.say?.code, result?.reasonCode];
  for (const code of codes) {
    if (typeof code === "string" && code.length > 0 && text.includes(code)) {
      errors.push(`${label}: reply contains code ${code}: ${text}`);
    }
  }
}

function checkScene(errors, label, before, after, expect) {
  const changed = !sameSkus(before, after);
  if (changed !== expect.sceneChanged) {
    errors.push(
      `${label}: scene changed expected ${expect.sceneChanged}, before ${shown(before)}, after ${shown(after)}`
    );
  }
  for (const sku of expect.removed ?? []) {
    if (!before.includes(sku)) errors.push(`${label}: ${sku} was not on the scene before`);
    if (after.includes(sku)) errors.push(`${label}: ${sku} still on the scene: ${shown(after)}`);
  }
  for (const sku of expect.added ?? []) {
    if (before.includes(sku)) errors.push(`${label}: ${sku} was already on the scene`);
    if (!after.includes(sku)) errors.push(`${label}: ${sku} was not added, scene ${shown(after)}`);
  }
  for (const sku of expect.absent ?? []) {
    if (after.includes(sku)) errors.push(`${label}: ${sku} should not be on the scene: ${shown(after)}`);
  }
  if (expect.copies) {
    for (const [sku, count] of Object.entries(expect.copies)) {
      const found = after.filter((item) => item === sku).length;
      if (found !== count) {
        errors.push(`${label}: ${sku} ×${count} expected, got ${found}, scene ${shown(after)}`);
      }
    }
  }
}

function checkSaved(errors, label, result, savedEur) {
  if (savedEur === undefined) return;
  const facts = result?.facts?.savedEur;
  const params = result?.say?.params?.savedEur;
  if (facts !== savedEur || params !== savedEur) {
    errors.push(`${label}: savedEur expected ${savedEur}, facts ${shown(facts)}, params ${shown(params)}`);
  }
}

function checkIncludes(errors, label, text, parts) {
  for (const part of parts) {
    if (typeof text !== "string" || !text.includes(part)) {
      errors.push(`${label}: reply expected to include ${shown(part)}, got ${shown(text)}`);
    }
  }
}

function respond(clientId, outcome) {
  const context = buildContext(clientId);
  return buildResponse({ outcome, context });
}

function play(clientId, errors, trace) {
  const maxWords = readMaxWords();
  if (maxWords === null) errors.push("ai-rules output.maxWords is missing");

  for (const step of skeletonSteps) {
    const label = labelOf(step);
    const before = getScene(clientId).skus.slice();
    let response = null;

    try {
      if (step.buttons) {
        for (const button of step.buttons) {
          const outcome = runTurn({
            clientId,
            questionId: button.questionId,
            optionId: button.optionId
          });
          if (outcome.status !== 200) {
            const error = outcome.body?.error ?? outcome.status;
            errors.push(`${label}: button ${button.questionId}/${button.optionId} → ${error}`);
            break;
          }
          response = respond(clientId, outcome);
          checkResult(errors, `${label} ${button.questionId}`, response.result, step.expect);
          checkReply(errors, `${label} ${button.questionId}`, response.reply, response.result, maxWords);
        }
      } else {
        response = respond(clientId, runMessage({ clientId, text: step.text }));
        checkResult(errors, label, response.result, step.expect);
        checkReply(errors, label, response.reply, response.result, maxWords);
      }
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const stored = getScene(clientId);
    const after = stored.skus.slice();
    const shownSkus = response?.scene?.skus ?? [];
    if (response && !sameSkus(after, shownSkus)) {
      errors.push(`${label}: response.scene.skus ${shown(shownSkus)} ≠ stored scene ${shown(after)}`);
    }
    if (response && JSON.stringify(response.scene?.placements) !== JSON.stringify(stored.placements)) {
      errors.push(
        `${label}: response.scene.placements ${shown(response.scene?.placements)} ≠ stored ${shown(stored.placements)}`
      );
    }
    checkScene(errors, label, before, after, step.expect);
    checkSaved(errors, label, response?.result, step.expect.savedEur);

    const includes = [...(step.expect.replyIncludes ?? [])];
    if (step.faqId) {
      const answer = faqAnswer(step.faqId);
      if (!answer) errors.push(`${label}: consultant.faq[${step.faqId}] answer is empty`);
      else includes.push(answer);
    }
    checkIncludes(errors, label, response?.reply?.text, includes);

    trace.push({
      phrase: step.phrase,
      intent: response?.result?.kind ?? null,
      sayCode: response?.result?.say?.code ?? null,
      sceneChanged: !sameSkus(before, after),
      text: response?.reply?.text ?? ""
    });
  }
}

function runSkeleton() {
  const errors = [];
  const trace = [];
  const clientId = `scenario-skeleton-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    play(clientId, errors, trace);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors, trace };
}

export { skeletonSteps, runSkeleton };
