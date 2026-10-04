import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "data");

function readConfig(name) {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, `${name}.json`), "utf-8"));
}

function readQuestionnaire() {
  return readConfig("questionnaire");
}

function readCatalog() {
  return readConfig("catalog");
}

function readConsultant() {
  return readConfig("consultant");
}

function readDirector() {
  return readConfig("director");
}

function readSales() {
  return readConfig("sales");
}

function readCommands() {
  return readConfig("commands");
}

function readAiRules() {
  return readConfig("ai-rules");
}

export {
  readConfig,
  readQuestionnaire,
  readCatalog,
  readConsultant,
  readDirector,
  readSales,
  readCommands,
  readAiRules
};
