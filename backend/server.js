import path from "node:path";
import express from "express";
import cors from "cors";
import { readKnobs } from "./config/load.js";
import { loadSections, toDialogData } from "./admin-api/sections.js";
import { validateDialogData } from "./validation/index.js";
import { validateKnobs } from "./validation/knobs.js";
import apiRoutes from "./api/routes.js";
import { invalidJsonHandler } from "./api/admin.routes.js";
import { modelsDirectory } from "./admin-api/models.js";

try {
  process.loadEnvFile();
} catch {}

if (process.env.AI_ENABLED === "true") {
  const aiKey = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
  const aiModel = typeof process.env.OPENAI_MODEL === "string" ? process.env.OPENAI_MODEL.trim() : "";
  if (!aiKey || !aiModel) {
    console.warn("AI включён, но нет ключа или модели: работает словарь");
  }
}

try {
  const sections = loadSections();
  validateDialogData(toDialogData(sections));
  validateKnobs(readKnobs(), sections);
  console.log("Dialog data and knobs are valid.");
} catch (err) {
  console.error("Failed to start server: dialog data or knobs are invalid.");
  console.error(err.message);
  process.exit(1);
}

const modelsDir = modelsDirectory();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/models", (req, res, next) => {
  const file = path.basename(req.path);
  if (file !== req.path.replace(/^\/+/, "") || !file.endsWith(".glb")) {
    res.status(404).end();
    return;
  }
  next();
});
app.use(
  "/models",
  express.static(modelsDir, {
    fallthrough: false,
    index: false,
    dotfiles: "deny",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".glb")) res.setHeader("Content-Type", "model/gltf-binary");
    }
  })
);
app.use("/api", apiRoutes);
app.use(invalidJsonHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SOS server listening on http://localhost:${PORT}`);
});
