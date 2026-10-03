import { Router } from "express";
import { readCatalog, readQuestionnaire } from "../config/load.js";
import { loadProfile, saveProfile } from "../dialog/profile-store.js";
import { getNextQuestion } from "../dialog/engine/question-engine.js";
import { computeNeeds } from "../dialog/engine/inference-engine.js";
import { runMatching } from "../dialog/engine/matching.js";
import { computeScenePlan } from "../dialog/engine/scene-plan.js";
import { getPendingConfirmations } from "../dialog/engine/confirmation-engine.js";

const router = Router();

function isSafeClientId(clientId) {
  return typeof clientId === "string" && /^[A-Za-z0-9_-]+$/.test(clientId);
}

router.get("/catalog", (req, res) => {
  res.json(readCatalog().draft);
});

router.get("/dialog/next", (req, res) => {
  const clientId = req.query.clientId;
  if (!isSafeClientId(clientId)) {
    return res.status(400).json({ error: "invalid clientId" });
  }

  const questionnaire = readQuestionnaire();
  const profile = loadProfile(clientId);
  const next = getNextQuestion(questionnaire, profile, readCatalog());
  res.json({ question: next ? next.question : null });
});

router.post("/dialog/answer", (req, res) => {
  const { clientId, questionId, optionId } = req.body ?? {};
  if (!isSafeClientId(clientId)) {
    return res.status(400).json({ error: "invalid clientId" });
  }

  const questionnaire = readQuestionnaire();
  const catalog = readCatalog();

  if (typeof questionId === "string" && questionId.startsWith("confirm_")) {
    const profile = loadProfile(clientId);
    const needId = questionId.slice("confirm_".length);
    const pending = getPendingConfirmations(profile);
    const need = pending.find((n) => n.id === needId);
    if (!need) return res.status(404).json({ error: "unknown question" });

    if (optionId === "keep") {
      profile.confirmedNeeds = [...new Set([...(profile.confirmedNeeds ?? []), needId])];
    } else if (optionId === "reject") {
      profile.rejectedNeeds = [...new Set([...(profile.rejectedNeeds ?? []), needId])];
      profile.needs = computeNeeds(questionnaire, profile);
      profile.needs = runMatching(catalog, profile.needs);
    } else {
      return res.status(400).json({ error: "unknown option" });
    }

    saveProfile(profile);
    return res.json({ ok: true });
  }

  const question = (questionnaire.draft.questions ?? []).find((q) => q.id === questionId);
  if (!question) {
    return res.status(404).json({ error: "unknown question" });
  }

  const option = (question.options ?? []).find((opt) => opt.id === optionId);
  if (!option) {
    return res.status(400).json({ error: "unknown option" });
  }

  const profile = loadProfile(clientId);
  profile.fields[questionId] = {
    value: optionId,
    source: "stated",
    confidence: "high"
  };
  profile.needs = computeNeeds(questionnaire, profile);
  profile.needs = runMatching(readCatalog(), profile.needs);
  saveProfile(profile);
  res.json({ ok: true });
});

router.get("/dialog/scene", (req, res) => {
  const clientId = req.query.clientId;
  if (!isSafeClientId(clientId)) {
    return res.status(400).json({ error: "invalid clientId" });
  }

  const profile = loadProfile(clientId);
  res.json({ skus: computeScenePlan(readCatalog(), profile) });
});

router.get("/dialog/profile", (req, res) => {
  const clientId = req.query.clientId;
  if (!isSafeClientId(clientId)) {
    return res.status(400).json({ error: "invalid clientId" });
  }

  res.json(loadProfile(clientId));
});

export default router;
