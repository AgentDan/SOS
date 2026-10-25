import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// h_170 в анкете — 175 см. «Программирую» ставит столешницу 1800 на ножки.
// Монитор и кресло добавляются командами. Стол на ножках 1000 мм высоковат.
const SETUP = [
  { questionId: "q_height", optionId: "h_170" },
  { questionId: "q_work_type", optionId: "coding" },
  { text: "добавь монитор" }
];

const STEPS = [...SETUP, { text: "поставь кресло" }, { text: "удобно ли мне?" }];

const DESK_REPLY = "Стол высоковат: 103 см, для вашего роста лучше около 73 см.";
const NO_DATA_REPLY = "Пока не могу оценить: нужны рост, стол и кресло.";

function respond(clientId, outcome) {
  return buildResponse({ outcome, context: buildContext(clientId) });
}

async function play(clientId, steps, errors, ask) {
  for (const step of steps) {
    if (step.questionId) {
      const result = await runTurn({ clientId, questionId: step.questionId, optionId: step.optionId });
      if (result.status !== 200) {
        errors.push(`${step.questionId}/${step.optionId} → ${result.body?.error ?? result.status}`);
      }
      continue;
    }
    const outcome = await runMessage({ clientId, text: step.text });
    if (step.text !== ask) {
      if (outcome.result?.ok !== true) {
        errors.push(`${step.text}: ${outcome.result?.reasonCode ?? "no result"}`);
      }
      continue;
    }
    return respond(clientId, outcome);
  }
  return null;
}

async function runErgoTalk() {
  const errors = [];
  const stamp = Date.now();
  const withChair = `scenario-ergo-talk-${stamp}-1`;
  const withoutChair = `scenario-ergo-talk-${stamp}-2`;
  const dirs = [withChair, withoutChair].map((id) => path.join(CLIENTS_DIR, id));
  try {
    const fitted = await play(withChair, STEPS, errors, "удобно ли мне?");
    const fittedText = fitted?.reply?.text ?? "";
    if (!fittedText.startsWith("Стол высоковат")) {
      errors.push(`reply ${JSON.stringify(fittedText)} code ${fitted?.result?.say?.code ?? "none"}`);
    } else if (fittedText !== DESK_REPLY) {
      errors.push(`reply ${JSON.stringify(fittedText)}`);
    }
    if (fitted?.result?.say?.code !== "ergo_desk_too_high") {
      errors.push(`say.code ${fitted?.result?.say?.code ?? "none"}`);
    }

    const bare = await play(withoutChair, [...SETUP, { text: "удобно ли мне?" }], errors, "удобно ли мне?");
    if (bare?.result?.say?.code !== "ergo_no_data") {
      errors.push(`without chair ${bare?.result?.say?.code ?? "none"} ${JSON.stringify(bare?.reply?.text ?? "")}`);
    } else if (bare.reply?.text !== NO_DATA_REPLY) {
      errors.push(`without chair reply ${JSON.stringify(bare.reply?.text ?? "")}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
  return { errors };
}

export { STEPS as ergoTalkSteps, runErgoTalk };
