import "dotenv/config";
import express from "express";
import cors from "cors";
import { readKnobs } from "./config/load.js";
import { loadSections, toDialogData } from "./admin-api/sections.js";
import { validateDialogData } from "./validation/index.js";
import { validateKnobs } from "./validation/knobs.js";
import apiRoutes from "./api/routes.js";
import { invalidJsonHandler } from "./api/admin.routes.js";

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

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);
app.use(invalidJsonHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`deskOS server listening on http://localhost:${PORT}`);
});
