import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurn } from "../backend/pipeline/orchestrator.js";
import { getProfile } from "../backend/pipeline/reads.js";
import { prepareDraftData, removeDraftData } from "../tests/scenarios/prepare-draft-data.js";
import { bodySteps, runBody } from "../tests/scenarios/body.js";
import { layoutSteps, runLayout } from "../tests/scenarios/layout.js";
import { ergoSteps, runErgo } from "../tests/scenarios/ergo.js";
import { ergoTalkSteps, runErgoTalk } from "../tests/scenarios/ergo-talk.js";
import { personSteps, runPerson } from "../tests/scenarios/person.js";
import { runSkeleton, skeletonSteps } from "../tests/scenarios/skeleton.js";
import { accessorySteps, runAccessories } from "../tests/scenarios/accessories.js";
import { ergonomicsSteps, runErgonomics } from "../tests/scenarios/ergonomics.js";

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

  if (Object.prototype.hasOwnProperty.call(expect, "scenario") && profile.scenario !== expect.scenario) {
    errors.push(`scenario ${profile.scenario ?? "null"} ≠ ${expect.scenario ?? "null"}`);
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

async function runScenario(slug, scenario) {
  sequence += 1;
  const clientId = `scenario-${slug}-${Date.now()}-${sequence}`;
  const dir = path.join(CLIENTS_DIR, clientId);

  try {
    for (const step of scenario.steps ?? []) {
      const result = await runTurn({
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

async function withDraftData(run) {
  const previous = process.env.SOS_DATA_DIR;
  let draftDir;
  try {
    draftDir = prepareDraftData();
    process.env.SOS_DATA_DIR = draftDir;
    return await run();
  } finally {
    if (previous === undefined) delete process.env.SOS_DATA_DIR;
    else process.env.SOS_DATA_DIR = previous;
    if (draftDir) removeDraftData(draftDir);
  }
}

function runSkeletonScenario() {
  return withDraftData(() => runSkeleton());
}

function runBodyScenario() {
  return withDraftData(() => runBody());
}

function runLayoutScenario() {
  return withDraftData(() => runLayout());
}

function runPersonScenario() {
  return withDraftData(() => runPerson());
}

function runErgoScenario() {
  return withDraftData(() => runErgo());
}

function runErgoTalkScenario() {
  return withDraftData(() => runErgoTalk());
}

function runAccessoriesScenario() {
  return withDraftData(() => runAccessories());
}

function runErgonomicsScenario() {
  return withDraftData(() => runErgonomics());
}

async function main() {
  let failed = 0;

  for (const { slug, data } of loadScenarios()) {
    let errors;
    try {
      errors = await runScenario(slug, data);
    } catch (err) {
      errors = [err instanceof Error ? err.message : String(err)];
    }

    report(slug, data.steps?.length ?? 0, errors);
    if (errors.length > 0) failed += 1;
  }

  let skeletonErrors;
  try {
    skeletonErrors = (await runSkeletonScenario()).errors;
  } catch (err) {
    skeletonErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("skeleton", skeletonSteps.length, skeletonErrors);
  if (skeletonErrors.length > 0) failed += 1;

  let bodyErrors;
  try {
    bodyErrors = (await runBodyScenario()).errors;
  } catch (err) {
    bodyErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("body", bodySteps.length, bodyErrors);
  if (bodyErrors.length > 0) failed += 1;

  let layoutErrors;
  try {
    layoutErrors = (await runLayoutScenario()).errors;
  } catch (err) {
    layoutErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("layout", layoutSteps.length, layoutErrors);
  if (layoutErrors.length > 0) failed += 1;

  let personErrors;
  try {
    personErrors = (await runPersonScenario()).errors;
  } catch (err) {
    personErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("person", personSteps.length, personErrors);
  if (personErrors.length > 0) failed += 1;

  let ergoErrors;
  try {
    ergoErrors = (await runErgoScenario()).errors;
  } catch (err) {
    ergoErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("ergo", ergoSteps.length, ergoErrors);
  if (ergoErrors.length > 0) failed += 1;

  let ergoTalkErrors;
  try {
    ergoTalkErrors = (await runErgoTalkScenario()).errors;
  } catch (err) {
    ergoTalkErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("ergo-talk", ergoTalkSteps.length, ergoTalkErrors);
  if (ergoTalkErrors.length > 0) failed += 1;

  let accessoryErrors;
  try {
    accessoryErrors = (await runAccessoriesScenario()).errors;
  } catch (err) {
    accessoryErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("accessories", accessorySteps.length, accessoryErrors);
  if (accessoryErrors.length > 0) failed += 1;

  let ergonomicsErrors;
  try {
    ergonomicsErrors = (await runErgonomicsScenario()).errors;
  } catch (err) {
    ergonomicsErrors = [err instanceof Error ? err.message : String(err)];
  }
  report("ergonomics", ergonomicsSteps.length, ergonomicsErrors);
  if (ergonomicsErrors.length > 0) failed += 1;

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
