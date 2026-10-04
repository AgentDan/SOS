import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { computeNeeds } from "./inference-engine.js";
import { runMatching } from "./matching.js";
import { deriveNeeds } from "./derive-needs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");

function load(name) {
  return JSON.parse(readFileSync(path.join(dataDir, name), "utf8"));
}

test("deriveNeeds matches computeNeeds followed by runMatching", () => {
  const questionnaire = load("questionnaire.json");
  const catalog = load("catalog.json");
  const profile = {
    fields: {
      q_work_type: { value: "coding", source: "stated", confidence: "high" },
      q_back_pain: { value: "yes", source: "stated", confidence: "high" }
    },
    needs: [],
    rejectedNeeds: []
  };

  assert.deepEqual(
    deriveNeeds({ questionnaire, catalog, profile }),
    runMatching(catalog, computeNeeds(questionnaire, profile))
  );
});
