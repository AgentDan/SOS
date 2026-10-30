import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// h_170 в анкете — 175 см. «Программирую» ставит широкую столешницу и монитор.
// Кресло добавляется командой. Верх стола 714 + 40 = 754 мм в допуске,
// монитор у задней кромки стола 800 мм — далековато.
const STEPS = [
  { questionId: "q_height", optionId: "h_170" },
  { questionId: "q_work_type", optionId: "coding" },
  { text: "поставь кресло" }
];

const EXPECTED_CODES = ["monitor_too_far"];

function sameErgo(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function runErgo() {
  const errors = [];
  const clientId = `scenario-ergo-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    for (const step of STEPS) {
      if (step.questionId) {
        const result = await runTurn({ clientId, questionId: step.questionId, optionId: step.optionId });
        if (result.status !== 200) {
          errors.push(`${step.questionId}/${step.optionId} → ${result.body?.error ?? result.status}`);
        }
        continue;
      }
      const outcome = await runMessage({ clientId, text: step.text });
      if (outcome.result?.ok !== true) {
        errors.push(`${step.text}: ${outcome.result?.reasonCode ?? "no result"}`);
      }
      if (step.text !== "поставь кресло") continue;
      const response = buildResponse({ outcome, context: buildContext(clientId) });
      const scene = getScene(clientId);
      if (!sameErgo(response.scene?.ergo, scene.ergo)) {
        errors.push("turn ergo differs from GET scene");
      }
    }

    const scene = getScene(clientId);
    for (const sku of ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "CHAIR-460"]) {
      if (!scene.skus.includes(sku)) errors.push(`missing ${sku} in ${JSON.stringify(scene.skus)}`);
    }

    const codes = (scene.ergo?.issues ?? []).map((item) => item.code);
    if (JSON.stringify(codes) !== JSON.stringify(EXPECTED_CODES)) {
      errors.push(`issues ${JSON.stringify(scene.ergo)}`);
    }
    const far = scene.ergo?.issues?.find((item) => item.code === "monitor_too_far");
    if (!far || typeof far.actualMm !== "number" || typeof far.deltaMm !== "number" || typeof far.targetMm !== "number") {
      errors.push(`distance issue ${JSON.stringify(far)}`);
    }
    const targets = scene.ergo?.targets;
    if (
      targets?.seatHeightMm !== 455 ||
      targets?.deskHeightMm !== 726 ||
      targets?.eyeHeightMm !== 1255 ||
      targets?.monitorDistanceMm !== 595 ||
      targets?.monitorTopMm !== 1255 ||
      targets?.hand !== "right"
    ) {
      errors.push(`targets ${JSON.stringify(targets)}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors };
}

export { STEPS as ergoSteps, runErgo };
