import { validateAiRules } from "./ai-rules.js";
import { validateCatalogDraft, validateInferenceNeeds } from "./catalog.js";
import { validateCommands } from "./commands.js";
import { validateConsultant } from "./consultant.js";
import { validateDirector } from "./director.js";
import { validateQuestionnaire } from "./questionnaire.js";
import { validateSales } from "./sales.js";

function validateDialogData({
  questionnaire,
  catalog,
  consultant,
  director,
  sales,
  commands,
  aiRules
}) {
  const errors = [];

  validateQuestionnaire(questionnaire, errors);
  validateCatalogDraft(catalog, errors);
  validateInferenceNeeds(questionnaire, catalog, errors);
  validateConsultant(consultant, errors);
  validateDirector(director, errors);
  validateSales(sales, errors);
  validateCommands(commands, errors);
  validateAiRules(aiRules, errors);

  if (errors.length > 0) {
    throw new Error(`Dialog data validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return true;
}

export { validateDialogData };
