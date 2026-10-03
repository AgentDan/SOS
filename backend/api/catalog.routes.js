import { Router } from "express";
import { readCatalog } from "../config/load.js";

const router = Router();

router.get("/catalog", (req, res) => {
  res.json(readCatalog().draft);
});

export default router;
