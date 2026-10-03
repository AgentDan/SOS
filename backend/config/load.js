import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "storage", "config");

function readQuestionnaire() {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, "questionnaire.json"), "utf-8"));
}

function readCatalog() {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, "catalog.json"), "utf-8"));
}

export { readQuestionnaire, readCatalog };
