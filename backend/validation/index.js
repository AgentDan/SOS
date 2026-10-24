import { validateAiRules } from "./ai-rules.js";
import { validateCatalogDraft, validateInferenceNeeds } from "./catalog.js";
import { validateErgonomics } from "./ergonomics.js";
import { validateCommands } from "./commands.js";
import { validateConsultant } from "./consultant.js";
import { validateDirector } from "./director.js";
import { validateQuestionnaire } from "./questionnaire.js";
import { validateSales } from "./sales.js";

function validateMannequin(catalog, ergonomics, errors) {
  const mannequin = ergonomics && ergonomics.draft && ergonomics.draft.mannequin;
  if (!mannequin || typeof mannequin.sku !== "string") return;

  const products = catalog && catalog.draft && catalog.draft.products;
  const product = Array.isArray(products)
    ? products.find((item) => item && item.sku === mannequin.sku)
    : undefined;
  if (!product || product.type !== "person") {
    errors.push(
      `ergonomics: mannequin.sku "${mannequin.sku}" must be a catalog product of type "person"`
    );
  }
}

function validateDialogData({
  questionnaire,
  catalog,
  consultant,
  director,
  sales,
  commands,
  aiRules,
  ergonomics
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
  validateErgonomics(ergonomics, errors);
  validateMannequin(catalog, ergonomics, errors);

  if (errors.length > 0) {
    throw new Error(`Dialog data validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return true;
}

export { validateDialogData };
