import { writeFileSync } from "node:fs";
import { configPath, readEnvelope, sectionDir } from "./load.js";
import { isFolderSection, writeFolderDraft, writeFolderEnvelope } from "./folder-sections.js";
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
const HISTORY_LIMIT = 20;

function loadAll() {
  const data = {};
  for (const [fileName, field] of SECTIONS) {
    data[field] = readEnvelope(fileName);
  }
  return data;
}

function trimHistory(history) {
  if (history.length > HISTORY_LIMIT) {
    history.splice(0, history.length - HISTORY_LIMIT);
  }
}

function writeSection(name, envelope, syncDraft) {
  const dir = sectionDir(name);
  if (isFolderSection(dir)) {
    if (syncDraft) writeFolderDraft(dir, envelope.draft);
    writeFolderEnvelope(dir, envelope);
    return;
  }
  writeFileSync(configPath(name), `${JSON.stringify(envelope, null, 2)}\n`);
}

function snapshotFor(history, version) {
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || entry.version !== version) continue;
    if (entry.snapshot && typeof entry.snapshot === "object" && !Array.isArray(entry.snapshot)) {
      return entry.snapshot;
    }
  }
  return null;
}

function writeDraft(name, draft) {
  if (!SECTION_KEY[name]) throw new Error(`Unknown config "${name}"`);
  const envelope = readEnvelope(name);
  envelope.draft = structuredClone(draft);
  envelope.draftVersion += 1;
  writeSection(name, envelope, true);
  return { draftVersion: envelope.draftVersion };
}

function publish(name, description) {
  const key = SECTION_KEY[name];
  if (!key) throw new Error(`Unknown config "${name}"`);

  const data = loadAll();
  validateDialogData(data);

  const envelope = data[key];
  const date = new Date().toISOString();
  const snapshot = structuredClone(envelope.draft);
  envelope.published = structuredClone(snapshot);
  envelope.publishedVersion += 1;
  if (!Array.isArray(envelope.history)) envelope.history = [];
  envelope.history.push({
    version: envelope.publishedVersion,
    date,
    description,
    snapshot
  });
  trimHistory(envelope.history);

  writeSection(name, envelope, false);
  return { publishedVersion: envelope.publishedVersion, date };
}

function rollback(name, version) {
  const key = SECTION_KEY[name];
  if (!key) throw new Error(`Unknown config "${name}"`);
  if (!Number.isInteger(version)) throw new Error(`Config ${name}: version must be an integer`);

  const data = loadAll();
  const envelope = data[key];
  const found = snapshotFor(envelope.history, version);
  if (!found) throw new Error(`Config ${name}: snapshot for version ${version} is missing`);

  const snapshot = structuredClone(found);
  envelope.draft = snapshot;
  envelope.published = structuredClone(snapshot);
  if (isFolderSection(sectionDir(name)) && Array.isArray(snapshot.products)) {
    Object.defineProperty(envelope, "skuFileNames", {
      value: snapshot.products.map((product) => `${product && product.sku}.json`),
      enumerable: false,
      configurable: true
    });
  }

  const date = new Date().toISOString();
  envelope.publishedVersion += 1;
  if (!Array.isArray(envelope.history)) envelope.history = [];
  envelope.history.push({
    version: envelope.publishedVersion,
    date,
    description: `rollback to v${version}`,
    rolledBackTo: version,
    snapshot: structuredClone(snapshot)
  });
  trimHistory(envelope.history);

  data[key] = envelope;
  validateDialogData(data);

  writeSection(name, envelope, true);
  return { publishedVersion: envelope.publishedVersion, date };
}

export { writeDraft, publish, rollback };
