import { getNextQuestion } from "../director/question-engine.js";
import { getBody } from "../profile/body.js";
import { layout } from "../scene/layout.js";
import { placePerson } from "../scene/person.js";
import { computeScenePlan } from "../scene/scene-plan.js";
import { buildContext } from "./context.js";

function assembleScene(catalog, profile, extras) {
  const skus = computeScenePlan(catalog, profile);
  const placements = layout({ catalog, skus }).placements;
  if (!extras) return { skus, placements, person: null };
  const body = getBody({
    profile,
    questionnaire: extras.questionnaire,
    ergonomics: extras.ergonomics
  });
  const person = placePerson({
    catalog,
    ergonomics: extras.ergonomics,
    body,
    placements
  });
  return { skus, placements, person };
}

function getNext(clientId) {
  const { questionnaire, profile, catalog } = buildContext(clientId);
  const next = getNextQuestion(questionnaire, profile, catalog);
  return { question: next ? next.question : null };
}

function getScene(clientId) {
  const { catalog, profile, questionnaire, ergonomics } = buildContext(clientId);
  return assembleScene(catalog, profile, { questionnaire, ergonomics });
}

function getProfile(clientId) {
  const { profile, questionnaire, ergonomics } = buildContext(clientId);
  return {
    ...profile,
    body: getBody({ profile, questionnaire, ergonomics })
  };
}

export { assembleScene, getNext, getScene, getProfile };
