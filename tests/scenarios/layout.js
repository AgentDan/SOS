import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog } from "../../backend/config/load.js";
import { buildContext } from "../../backend/pipeline/context.js";
import { runMessage, runTurn } from "../../backend/pipeline/orchestrator.js";
import { getScene } from "../../backend/pipeline/reads.js";
import { buildResponse } from "../../backend/pipeline/response.js";

const CLIENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime", "clients");

const STEPS = [
  { questionId: "q_work_type", optionId: "coding" },
  { text: "добавь второй монитор" },
  { text: "расстояние между мониторами" }
];

function monitorPose() {
  const catalog = readCatalog();
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const types = Array.isArray(catalog?.types) ? catalog.types : [];
  const legs = products.find((item) => item?.sku === "DESK-LEGS-1400");
  const top = products.find((item) => item?.sku === "DESK-TOP-1800");
  const monitor = products.find((item) => item?.sku === "MON-613-366");
  const deskType = types.find((item) => item?.id === "desk_top");
  const surface = legs.dimensions.height + top.dimensions.height;
  const z = -top.dimensions.depth / 2 + deskType.rowBackMarginMm + monitor.dimensions.depth / 2;
  const width = monitor.dimensions.width;
  const gap = deskType.rowGapMm;
  const total = width * 2 + gap;
  const left = -total / 2 + width / 2;
  return { y: surface, z, xs: [left, left + width + gap] };
}

function respond(clientId, outcome) {
  return buildResponse({ outcome, context: buildContext(clientId) });
}

async function runLayout() {
  const errors = [];
  const clientId = `scenario-layout-${Date.now()}-1`;
  const dir = path.join(CLIENTS_DIR, clientId);
  try {
    const desk = await runTurn({ clientId, questionId: "q_work_type", optionId: "coding" });
    if (desk.status !== 200) errors.push(`desk → ${desk.body?.error ?? desk.status}`);

    for (const text of ["добавь второй монитор"]) {
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
      const pose = monitorPose();
      const xs = monitors.map((item) => item.x);
      if (xs[0] !== pose.xs[0] || xs[1] !== pose.xs[1]) {
        errors.push(`monitor x ${JSON.stringify(xs)} ≠ ${JSON.stringify(pose.xs)}`);
      }
      for (const item of monitors) {
        if (item.y !== pose.y || item.z !== pose.z || item.rotY !== 0) {
          errors.push(`monitor pose ${JSON.stringify(item)} ≠ y ${pose.y} z ${pose.z}`);
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
