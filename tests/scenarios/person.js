import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readErgonomics } from "../../backend/config/load.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

// q_work_type не ставит кресло: его даёт только «болит спина» или команда.
// Без кресла в расстановке манекену не на чем сидеть, placePerson возвращает null.
const STEPS = [
  { questionId: "q_work_type", optionId: "coding" },
  { questionId: "q_height", optionId: "h_190" },
  { questionId: "q_hand", optionId: "left" }
];

async function runPerson() {
  const errors = [];
  const clientId = `scenario-person-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    for (const step of STEPS) {
      const result = runTurn({ clientId, questionId: step.questionId, optionId: step.optionId });
      if (result.status !== 200) {
        errors.push(`${step.questionId}/${step.optionId} → ${result.body?.error ?? result.status}`);
      }
    }

    const chair = await addChair(clientId);
    if (chair) errors.push(chair);

    const scene = getScene(clientId);
    const reference = readErgonomics()?.mannequin?.referenceHeightCm;
    // h_190 в анкете — «выше 190 см», в данные пишется 195. Референс модели — 180.
    const statedCm = 195;
    const ratio = typeof reference === "number" && reference > 0 ? statedCm / reference : null;
    const expected = ratio === null ? null : Math.min(1.3, Math.max(0.7, ratio));
    const scale = scene.person && scene.person.scale;
    if (reference !== 180) {
      errors.push(`referenceHeightCm ${JSON.stringify(reference)} ≠ 180`);
    }
    if (scene.person?.y !== 0) {
      errors.push(`person.y ${JSON.stringify(scene.person?.y)} ≠ 0`);
    }
    if (typeof scale !== "number" || expected === null || Math.abs(scale - expected) > 0.001) {
      errors.push(
        `person.scale ${JSON.stringify(scale)} ≠ ${expected} (${statedCm}/${reference} = ${ratio})`
      );
    }
    if (scene.skus.includes("character")) {
      errors.push(`skus include the mannequin: ${JSON.stringify(scene.skus)}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { errors };
}

async function addChair(clientId) {
  const added = await runMessage({ clientId, text: "поставь кресло" });
  if (added.result?.ok === true) return null;
  return `chair: ${added.result?.reasonCode ?? "no result"}`;
}

export { STEPS as personSteps, runPerson };
