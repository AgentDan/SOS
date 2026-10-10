import { Router } from "express";
import { readDataVersion } from "../config/load.js";

const router = Router();

router.get("/data-version", (req, res) => {
  res.json({ dataVersion: readDataVersion() });
});

export default router;
