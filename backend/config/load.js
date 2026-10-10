import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isFolderSection, readFolderEnvelope } from "./folder-sections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, "..", "..", "data");

function dataDir() {
  return process.env.DESKOS_DATA_DIR ? path.resolve(process.env.DESKOS_DATA_DIR) : CONFIG_DIR;
}

const SECTION_NAMES = [
  "questionnaire",
  "catalog",
  "consultant",
  "director",
  "sales",
  "commands",
  "ai-rules"
];

function configPath(name) {
  return path.join(dataDir(), `${name}.json`);
}

function sectionDir(name) {
  return path.join(dataDir(), name);
}

function readEnvelope(name) {
  const dir = sectionDir(name);
  if (isFolderSection(dir)) return readFolderEnvelope(dir);
  return JSON.parse(readFileSync(configPath(name), "utf-8"));
}

function readDataVersion() {
  let sum = 0;
  for (const name of SECTION_NAMES) {
    sum += readEnvelope(name).publishedVersion;
  }
  return sum;
}

function readConfig(name, layer = "published") {
  const envelope = readEnvelope(name);
  const data = envelope[layer] ?? envelope.draft;
  if (!data) throw new Error(`Config ${name}: layer "${layer}" missing`);
  return data;
}

function readDraft(name) {
  return readConfig(name, "draft");
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
  configPath,
  sectionDir,
  readEnvelope,
  readDataVersion,
  readConfig,
  readDraft,
  readQuestionnaire,
  readCatalog,
  readConsultant,
  readDirector,
  readSales,
  readCommands,
  readAiRules
};
