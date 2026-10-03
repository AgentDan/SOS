import "dotenv/config";
import express from "express";
import cors from "cors";
import { validateDialogData } from "./dialog/validate-dialog-data.js";
import { readCatalog, readQuestionnaire } from "./config/load.js";
import apiRoutes from "./api/routes.js";

try {
  validateDialogData({
    questionnaire: readQuestionnaire(),
    catalog: readCatalog()
  });
  console.log("Dialog data is valid.");
} catch (err) {
  console.error("Failed to start server: dialog data is invalid.");
  console.error(err.message);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`deskOS server listening on http://localhost:${PORT}`);
});
