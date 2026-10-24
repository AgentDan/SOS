import { readAiRules } from "../config/load.js";
import { getNextQuestion } from "../director/question-engine.js";
import { FALLBACK_TEXT, reply } from "../voice/reply.js";
import { validateReplyInput } from "./contracts.js";
import { assembleScene } from "./reads.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function consultantLayer(consultant) {
  if (consultant && (Array.isArray(consultant.faq) || isPlainObject(consultant.topics))) return consultant;
  if (consultant?.draft) return consultant.draft;
  return consultant ?? {};
}

function repliesOf(consultant) {
  const replies = consultantLayer(consultant).replies;
  return isPlainObject(replies) ? replies : {};
}

function catalogProducts(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products;
  return Array.isArray(products) ? products : [];
}

function namesOf(catalog) {
  const names = {};
  for (const product of catalogProducts(catalog)) {
    if (!isPlainObject(product) || typeof product.sku !== "string" || product.sku.length === 0) continue;
    if (typeof product.label === "string" && product.label.length > 0) names[product.sku] = product.label;
  }
  return names;
}

function buildResponse({ outcome, context }) {
  const catalog = context?.catalog;
  const profile = isPlainObject(outcome?.profile)
    ? outcome.profile
    : isPlainObject(context?.profile)
      ? context.profile
      : {};
  const scene = assembleScene(catalog, profile, {
    questionnaire: context?.questionnaire,
    ergonomics: context?.ergonomics
  });
  const skus = scene.skus;
  const found = getNextQuestion(context?.questionnaire, profile, catalog);
  const nextQuestion = found && isPlainObject(found.question) ? found.question : null;
  const input = {
    result: outcome?.result,
    context: { profile, sceneSkus: skus, nextQuestion }
  };

  const spoken = validateReplyInput(input).ok
    ? reply({
        result: input.result,
        context: input.context,
        templates: repliesOf(context?.consultant),
        names: namesOf(catalog),
        maxWords: readAiRules()?.output?.maxWords
      })
    : { text: FALLBACK_TEXT, via: "template" };

  return {
    version: 1,
    status: 200,
    question: nextQuestion,
    scene,
    reply: spoken,
    result: outcome?.result
  };
}

export { buildResponse };
