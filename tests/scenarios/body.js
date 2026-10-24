import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurn } from "../../backend/pipeline/orchestrator.js";
import { getProfile } from "../../backend/pipeline/reads.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

const STEPS = [
  { questionId: "q_height", optionId: "h_190" },
  { questionId: "q_hand", optionId: "left" }
];

const EXPECTED = {
  heightCm: 195,
  hand: "left",
  source: { height: "stated", hand: "stated" }
};

function runBody() {
  const errors = [];
  const clientId = `scenario-body-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    for (const step of STEPS) {
      const result = runTurn({ clientId, questionId: step.questionId, optionId: step.optionId });
      if (result.status !== 200) {
        const error = result.body?.error ?? result.status;
        errors.push(`${step.questionId}/${step.optionId} → ${error}`);
      }
    }

    const profile = getProfile(clientId);
    if (JSON.stringify(profile.body) !== JSON.stringify(EXPECTED)) {
      errors.push(`body ${JSON.stringify(profile.body)} ≠ ${JSON.stringify(EXPECTED)}`);
    }

    const stored = JSON.parse(readFileSync(path.join(dir, "profile.json"), "utf8"));
    if (Object.prototype.hasOwnProperty.call(stored, "body")) {
      errors.push("body was written to profile.json");
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors };
}

export { STEPS as bodySteps, runBody };
