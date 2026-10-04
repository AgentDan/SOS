import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurn } from "../backend/pipeline/orchestrator.js";
import { getProfile } from "../backend/pipeline/reads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SCENARIOS_DIR = path.join(ROOT, "tests", "scenarios");
const CLIENTS_DIR = path.join(ROOT, "runtime", "clients");

const ORDER = [
  "programmer-wide-desk.json",
  "client-rejected.json",
  "back-pain-chair.json"
];

function loadScenarios() {
  const names = readdirSync(SCENARIOS_DIR).filter((name) => name.endsWith(".json"));
  names.sort((a, b) => {
    const ai = ORDER.indexOf(a);
    const bi = ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return names.map((name) => ({
    slug: name.replace(/\.json$/, ""),
    data: JSON.parse(readFileSync(path.join(SCENARIOS_DIR, name), "utf-8"))
  }));
}

function pendingIds(profile) {
  const confirmed = profile.confirmedNeeds ?? [];
  const rejected = profile.rejectedNeeds ?? [];
  return (profile.needs ?? [])
    .filter(
      (need) =>
        need &&
        need.confidence !== "high" &&
        !confirmed.includes(need.id) &&
        !rejected.includes(need.id)
    )
    .map((need) => need.id);
}

function compareList(errors, actual, expected, formatMissing, formatExtra) {
  for (const id of expected) {
    if (!actual.includes(id)) errors.push(formatMissing(id));
  }
  for (const id of actual) {
    if (!expected.includes(id)) errors.push(formatExtra(id));
  }
}

function compare(profile, expect) {
  const errors = [];
  if (!expect) return errors;

  if (expect.needs) {
    for (const expectedNeed of expect.needs) {
      const found = (profile.needs ?? []).find((need) => need.id === expectedNeed.id);
      if (!found) {
        errors.push(`need "${expectedNeed.id}" missing`);
      } else if (expectedNeed.confidence && found.confidence !== expectedNeed.confidence) {
        errors.push(
          `need "${expectedNeed.id}": confidence ${found.confidence} ≠ ${expectedNeed.confidence}`
        );
      }
    }
    for (const need of profile.needs ?? []) {
      if (!expect.needs.some((expectedNeed) => expectedNeed.id === need.id)) {
        errors.push(`unexpected need "${need.id}"`);
      }
    }
  }

  if (expect.skus) {
    const actual = (profile.needs ?? []).map((need) => need.resolvedSku).filter(Boolean);
    compareList(
      errors,
      actual,
      expect.skus,
      (sku) => `sku "${sku}" not in scene`,
      (sku) => `unexpected sku "${sku}"`
    );
  }

  if (expect.pendingConfirmations) {
    compareList(
      errors,
      pendingIds(profile),
      expect.pendingConfirmations,
      (id) => `expected pending confirmation for "${id}"`,
      (id) => `unexpected pending confirmation for "${id}"`
    );
  }

  if (expect.rejectedNeeds) {
    compareList(
      errors,
      profile.rejectedNeeds ?? [],
      expect.rejectedNeeds,
      (id) => `rejectedNeeds missing "${id}"`,
      (id) => `unexpected rejected need "${id}"`
    );
  }

  if (expect.status && profile.status !== expect.status) {
    errors.push(`status ${profile.status} ≠ ${expect.status}`);
  }

  return errors;
}

let sequence = 0;

function runScenario(slug, scenario) {
  sequence += 1;
  const clientId = `scenario-${slug}-${Date.now()}-${sequence}`;
  const dir = path.join(CLIENTS_DIR, clientId);

  try {
    for (const step of scenario.steps ?? []) {
      const result = runTurn({
        clientId,
        questionId: step.questionId,
        optionId: step.optionId
      });
      if (result.status !== 200) {
        const error = result.body?.error ?? result.status;
        throw new Error(`Step failed: ${JSON.stringify(step)} → ${error}`);
      }
    }

    return compare(getProfile(clientId), scenario.expect);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function report(slug, steps, errors) {
  const count = errors.length;
  const stepNoun = steps === 1 ? "step" : "steps";
  const errorNoun = count === 1 ? "error" : "errors";
  const line = `${slug.padEnd(24)} (${steps} ${stepNoun}, ${count} ${errorNoun})`;
  if (count === 0) {
    console.log(`PASS  ${line}`);
    return;
  }

  console.log(`FAIL  ${line}`);
  for (const error of errors) console.log(`      ${error}`);
}

function main() {
  let failed = 0;

  for (const { slug, data } of loadScenarios()) {
    let errors;
    try {
      errors = runScenario(slug, data);
    } catch (err) {
      errors = [err instanceof Error ? err.message : String(err)];
    }

    report(slug, data.steps?.length ?? 0, errors);
    if (errors.length > 0) failed += 1;
  }

  if (failed > 0) process.exit(1);
}

main();
