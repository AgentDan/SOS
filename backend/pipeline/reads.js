import { getNextQuestion } from "../director/question-engine.js";
import { getBody } from "../profile/body.js";
import { layout } from "../scene/layout.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { buildContext } from "./context.js";

function assembleScene(catalog, profile) {
  const skus = computeScenePlan(catalog, profile);
  return { skus, placements: layout({ catalog, skus }).placements };
}

function getNext(clientId) {
  const { questionnaire, profile, catalog } = buildContext(clientId);
  const next = getNextQuestion(questionnaire, profile, catalog);
  return { question: next ? next.question : null };
}

function getScene(clientId) {
  const { catalog, profile } = buildContext(clientId);
  return assembleScene(catalog, profile);
}

function getProfile(clientId) {
  const { profile, questionnaire, ergonomics } = buildContext(clientId);
  return {
    ...profile,
    body: getBody({ profile, questionnaire, ergonomics })
  };
}

export { assembleScene, getNext, getScene, getProfile };
