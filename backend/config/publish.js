import { readFileSync, writeFileSync } from "node:fs";
import { configPath } from "./load.js";
import { validateDialogData } from "../validation/index.js";

const SECTIONS = [
  ["questionnaire", "questionnaire"],
  ["catalog", "catalog"],
  ["consultant", "consultant"],
  ["director", "director"],
  ["sales", "sales"],
  ["commands", "commands"],
  ["ai-rules", "aiRules"]
];

const SECTION_KEY = Object.fromEntries(SECTIONS);

function readEnvelope(name) {
  return JSON.parse(readFileSync(configPath(name), "utf-8"));
}

function publish(name, description) {
  const key = SECTION_KEY[name];
  if (!key) throw new Error(`Unknown config "${name}"`);

  const data = {};
  for (const [fileName, field] of SECTIONS) {
    data[field] = readEnvelope(fileName);
  }

  validateDialogData(data);

  const envelope = data[key];
  const date = new Date().toISOString();
  envelope.published = structuredClone(envelope.draft);
  envelope.publishedVersion += 1;
  if (!Array.isArray(envelope.history)) envelope.history = [];
  envelope.history.push({
    version: envelope.publishedVersion,
    date,
    description
  });
  if (envelope.history.length > 20) {
    envelope.history.splice(0, envelope.history.length - 20);
  }

  writeFileSync(configPath(name), `${JSON.stringify(envelope, null, 2)}\n`);
  return { publishedVersion: envelope.publishedVersion, date };
}

export { publish };
