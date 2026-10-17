import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isFolderSection, readFolderEnvelope } from "../../backend/config/folder-sections.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function isEnvelope(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "draft") &&
    Object.prototype.hasOwnProperty.call(value, "published") &&
    value.draft != null
  );
}

function promoteFolder(sectionDir) {
  const storedPath = path.join(sectionDir, "_envelope.json");
  const stored = readJson(storedPath);
  stored.published = readFolderEnvelope(sectionDir).draft;
  writeJson(storedPath, stored);
}

function promoteCopy(dest) {
  for (const entry of readdirSync(dest, { withFileTypes: true })) {
    const full = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (isFolderSection(full)) promoteFolder(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const data = readJson(full);
    if (!isEnvelope(data)) continue;
    data.published = data.draft;
    writeJson(full, data);
  }
}

function assertTempDir(dir) {
  const root = path.resolve(dir);
  const tempRoot = path.resolve(tmpdir());
  const rel = path.relative(tempRoot, root);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("refusing to delete outside the temp directory");
  }
  const dataRoot = path.resolve(DATA_DIR);
  const fromData = path.relative(dataRoot, root);
  if (fromData === "" || (!fromData.startsWith("..") && !path.isAbsolute(fromData))) {
    throw new Error("refusing to delete source data");
  }
}

function prepareDraftData() {
  const dest = mkdtempSync(path.join(tmpdir(), "sos-draft-"));
  try {
    cpSync(DATA_DIR, dest, { recursive: true });
    promoteCopy(dest);
    return dest;
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw err;
  }
}

function removeDraftData(dir) {
  assertTempDir(dir);
  rmSync(dir, { recursive: true, force: true });
}

export { prepareDraftData, removeDraftData };
