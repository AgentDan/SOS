import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

const STEPS = [
  { questionId: "q_work_type", optionId: "coding" },
  { text: "добавь монитор" },
  { text: "добавь второй монитор" },
  { text: "расстояние между мониторами" }
];

function respond(clientId, outcome) {
  return buildResponse({ outcome, context: buildContext(clientId) });
}

async function runLayout() {
  const errors = [];
  const clientId = `scenario-layout-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    const desk = runTurn({ clientId, questionId: "q_work_type", optionId: "coding" });
    if (desk.status !== 200) errors.push(`desk → ${desk.body?.error ?? desk.status}`);

    for (const text of ["добавь монитор", "добавь второй монитор"]) {
      const response = respond(clientId, await runMessage({ clientId, text }));
      if (response.result?.ok !== true) {
        errors.push(`${text}: ${response.result?.reasonCode ?? "no result"} ${response.reply?.text ?? ""}`);
      }
    }

    const scene = getScene(clientId);
    const monitors = scene.placements.filter((item) => item.sku === "MON-613-366");
    if (!scene.skus.includes("DESK-TOP-1800")) {
      errors.push(`desk 1800 missing, scene ${JSON.stringify(scene.skus)}`);
    }
    if (monitors.length !== 2) {
      errors.push(`expected 2 monitor placements, scene ${JSON.stringify(scene)}`);
    } else {
      const xs = monitors.map((item) => item.x);
      if (xs[0] !== -356.5 || xs[1] !== 356.5) {
        errors.push(`monitor x ${JSON.stringify(xs)}`);
      }
      for (const item of monitors) {
        if (item.y !== 1030 || item.z !== -197.5 || item.rotY !== 0) {
          errors.push(`monitor pose ${JSON.stringify(item)}`);
        }
      }
    }

    const response = respond(clientId, await runMessage({ clientId, text: "расстояние между мониторами" }));
    const text = response.reply?.text ?? "";
    if (!text.includes("10 см")) {
      errors.push(`distance reply ${JSON.stringify(text)} result ${JSON.stringify(response.result)}`);
    }
    if (JSON.stringify(response.scene?.placements) !== JSON.stringify(getScene(clientId).placements)) {
      errors.push("response placements differ from GET scene");
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors };
}

export { STEPS as layoutSteps, runLayout };
