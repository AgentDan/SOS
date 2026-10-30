import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAiRules, readCatalog, readConsultant } from "../../backend/config/load.js";
import { canPlace } from "../../backend/commands/placement.js";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// Кнопки: coding даёт широкий стол и монитор, wide подтверждает стол, «болит спина» — кресло.
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
      added: []
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
      removed: [],
      replyIncludes: ["кресло"]
    }
  },
  {
    n: 3,
    phrase: "добавь второй монитор",
    text: "добавь второй монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_added",
      sceneChanged: true,
      copies: {}
    }
  },
  {
    n: 4,
    phrase: "добавь третий монитор",
    text: "добавь третий монитор",
    expect: {
      intent: "command",
      ok: false,
      reasonCode: "host_full",
      sayCode: "host_full",
      sceneChanged: false,
      copies: {}
    }
  },
  {
    n: 5,
    phrase: "убери монитор",
    text: "убери монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_removed",
      sceneChanged: true,
      copies: {}
    }
  },
  {
    n: 6,
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
  {
    n: 7,
    phrase: "покажи дешевле",
    text: "покажи дешевле",
    expect: {
      intent: "talk",
      ok: true,
      reasonCode: null,
      sayCode: "cheaper_done",
      sceneChanged: true,
      removed: [],
      added: [],
      replyIncludes: []
    }
  },
  {
    n: 8,
    phrase: "добавь второй монитор",
    text: "добавь второй монитор",
    expect: {
      intent: "command",
      ok: true,
      reasonCode: null,
      sayCode: "command_added",
      sceneChanged: true,
      copies: {}
    }
  },
  {
    n: 9,
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

function smallest(products, type, minWidth) {
  let best = null;
  for (const product of products) {
    if (product?.type !== type || typeof product.dimensions?.width !== "number") continue;
    if (minWidth != null && product.dimensions.width < minWidth) continue;
    if (!best || product.dimensions.width < best.dimensions.width) best = product;
  }
  return best;
}

function nearestCheaper(products, current) {
  let best = null;
  for (const candidate of products) {
    if (!candidate || candidate.type !== current?.type || candidate.sku === current?.sku) continue;
    if (typeof candidate.priceEur !== "number" || candidate.priceEur >= current.priceEur) continue;
    if (!best || candidate.priceEur > best.priceEur) best = candidate;
  }
  return best;
}

function step(n) {
  return skeletonSteps.find((item) => item.n === n);
}

function fillFromCatalog() {
  const catalog = readCatalog();
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const wide = (catalog?.needs ?? []).find((need) => need?.id === "desk_top_wide");
  const legs = products.find((product) => product?.alwaysPresent === true && product.type !== "person");
  const desk = smallest(products, "desk_top", wide?.criteria?.minWidth);
  const monitor = smallest(products, "monitor");
  const chair = smallest(products, "chair");
  const replacement = nearestCheaper(products, desk);
  const monitorSku = monitor.sku;

  step(1).expect.added = [chair.sku, desk.sku, monitorSku];
  step(2).expect.removed = [chair.sku];

  const one = [legs.sku, desk.sku, monitorSku];
  const second = canPlace({ catalog, sceneSkus: one, sku: monitorSku });
  step(3).expect.ok = second.ok === true;
  step(3).expect.reasonCode = second.ok ? null : second.reasonCode;
  step(3).expect.sayCode = second.ok ? "command_added" : second.reasonCode;
  step(3).expect.sceneChanged = second.ok === true;
  const afterSecond = second.ok ? 2 : 1;
  step(3).expect.copies = { [monitorSku]: afterSecond };

  const two = second.ok ? [...one, monitorSku] : one;
  const third = canPlace({ catalog, sceneSkus: two, sku: monitorSku });
  step(4).expect.ok = third.ok === true;
  step(4).expect.reasonCode = third.ok ? null : third.reasonCode;
  step(4).expect.sayCode = third.ok ? "command_added" : third.reasonCode;
  step(4).expect.sceneChanged = third.ok === true;
  const afterThird = third.ok ? afterSecond + 1 : afterSecond;
  step(4).expect.copies = { [monitorSku]: afterThird };
  step(5).expect.copies = { [monitorSku]: afterThird - 1 };

  const savedEur = desk.priceEur - replacement.priceEur;
  step(7).expect.removed = [desk.sku];
  step(7).expect.added = [replacement.sku];
  step(7).expect.savedEur = savedEur;
  step(7).expect.replyIncludes = [String(savedEur)];

  const afterCheaper = [legs.sku, replacement.sku, monitorSku];
  const again = canPlace({ catalog, sceneSkus: afterCheaper, sku: monitorSku });
  step(8).expect.ok = again.ok === true;
  step(8).expect.reasonCode = again.ok ? null : again.reasonCode;
  step(8).expect.sayCode = again.ok ? "command_added" : again.reasonCode;
  step(8).expect.sceneChanged = again.ok === true;
  step(8).expect.copies = { [monitorSku]: again.ok ? 2 : 1 };
}

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

async function play(clientId, errors, trace) {
  fillFromCatalog();
  const maxWords = readMaxWords();
  if (maxWords === null) errors.push("ai-rules output.maxWords is missing");

  for (const step of skeletonSteps) {
    const label = labelOf(step);
    const before = getScene(clientId).skus.slice();
    let response = null;

    try {
      if (step.buttons) {
        for (const button of step.buttons) {
          const outcome = await runTurn({
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
        response = respond(clientId, await runMessage({ clientId, text: step.text }));
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

async function runSkeleton() {
  const errors = [];
  const trace = [];
  const clientId = `scenario-skeleton-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    await play(clientId, errors, trace);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors, trace };
}

export { skeletonSteps, runSkeleton };
