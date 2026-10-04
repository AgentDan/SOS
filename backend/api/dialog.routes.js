import { Router } from "express";
import { runTurn } from "../pipeline/orchestrator.js";
import { getNext, getProfile, getScene } from "../pipeline/reads.js";
import { requireClientId } from "./middleware/client-id.js";

const router = Router();

router.use("/dialog", requireClientId);

router.get("/dialog/next", (req, res) => {
  res.json(getNext(req.query.clientId));
});

router.post("/dialog/answer", (req, res) => {
  const { clientId, questionId, optionId } = req.body ?? {};
  const result = runTurn({ clientId, questionId, optionId });
  res.status(result.status).json(result.body);
});

router.get("/dialog/scene", (req, res) => {
  res.json(getScene(req.query.clientId));
});

router.get("/dialog/profile", (req, res) => {
  res.json(getProfile(req.query.clientId));
});

export default router;
