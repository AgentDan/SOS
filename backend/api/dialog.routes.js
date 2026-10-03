import { Router } from "express";
import { readCatalog, readQuestionnaire } from "../config/load.js";
import { applyAnswer, screenStatedAnswer } from "../dialog/answer-service.js";
import { computeScenePlan } from "../dialog/engine/scene-plan.js";
import { getNextQuestion } from "../dialog/engine/question-engine.js";
import { loadProfile, saveProfile } from "../dialog/profile-store.js";
import { requireClientId } from "./middleware/client-id.js";

const router = Router();

router.use("/dialog", requireClientId);

router.get("/dialog/next", (req, res) => {
  const questionnaire = readQuestionnaire();
  const profile = loadProfile(req.query.clientId);
  const next = getNextQuestion(questionnaire, profile, readCatalog());
  res.json({ question: next ? next.question : null });
});

router.post("/dialog/answer", (req, res) => {
  const { clientId, questionId, optionId } = req.body ?? {};
  const questionnaire = readQuestionnaire();
  const rejected = screenStatedAnswer({ questionnaire, questionId, optionId });
  if (rejected) {
    return res.status(rejected.status).json(rejected.body);
  }

  const catalog = readCatalog();
  const profile = loadProfile(clientId);
  const result = applyAnswer({ questionnaire, catalog, profile, questionId, optionId });
  if (result.status === 200) saveProfile(result.profile);
  res.status(result.status).json(result.body);
});

router.get("/dialog/scene", (req, res) => {
  const profile = loadProfile(req.query.clientId);
  res.json({ skus: computeScenePlan(readCatalog(), profile) });
});

router.get("/dialog/profile", (req, res) => {
  res.json(loadProfile(req.query.clientId));
});

export default router;
