import { getNextQuestion } from "../director/question-engine.js";
import { loadProfile } from "../profile/profile-store.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { buildContext } from "./context.js";

function getNext(clientId) {
  const { questionnaire, profile, catalog } = buildContext(clientId);
  const next = getNextQuestion(questionnaire, profile, catalog);
  return { question: next ? next.question : null };
}

function getScene(clientId) {
  const { catalog, profile } = buildContext(clientId);
  return { skus: computeScenePlan(catalog, profile) };
}

function getProfile(clientId) {
  return loadProfile(clientId);
}

export { getNext, getScene, getProfile };
