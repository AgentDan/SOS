import { computeNeeds } from "./inference-engine.js";
import { runMatching } from "./matching.js";

function deriveNeeds({ questionnaire, catalog, profile }) {
  return runMatching(catalog, computeNeeds(questionnaire, profile));
}

export { deriveNeeds };
