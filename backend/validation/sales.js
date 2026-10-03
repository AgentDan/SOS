import { checkType, validateSectionEnvelope } from "./envelope.js";

function validateSales(sales, errors) {
  if (sales === undefined) return;
  if (!validateSectionEnvelope(sales, "sales", errors)) return;

  const draft = sales.draft;
  checkType("sales", draft.stages, "array", "stages", errors);
  checkType("sales", draft.objections, "array", "objections", errors);
  checkType("sales", draft.signals, "array", "signals", errors);

  if (checkType("sales", draft.closing, "object", "closing", errors)) {
    checkType("sales", draft.closing.offerText, "string", "closing.offerText", errors);
    checkType("sales", draft.closing.askName, "boolean", "closing.askName", errors);
    checkType("sales", draft.closing.askContact, "boolean", "closing.askContact", errors);
    checkType("sales", draft.closing.thanks, "string", "closing.thanks", errors);
  }

  if (checkType("sales", draft.loyalty, "object", "loyalty", errors)) {
    checkType("sales", draft.loyalty.remember, "boolean", "loyalty.remember", errors);
    checkType("sales", draft.loyalty.welcomeBack, "string", "loyalty.welcomeBack", errors);
    checkType("sales", draft.loyalty.followUpDays, "number", "loyalty.followUpDays", errors);
    checkType("sales", draft.loyalty.followUp, "string", "loyalty.followUp", errors);
    checkType("sales", draft.loyalty.askReview, "boolean", "loyalty.askReview", errors);
    checkType("sales", draft.loyalty.reviewText, "string", "loyalty.reviewText", errors);
  }
}

export { validateSales };
