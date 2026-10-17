import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFolderEnvelope } from "./folder-sections.js";
import { prepareDraftData, removeDraftData } from "../../tests/scenarios/prepare-draft-data.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");

function snapshot(dir) {
  const files = {};
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files[path.relative(dir, full)] = readFileSync(full);
    }
  }
  walk(dir);
  return files;
}

function changedPaths(before, after) {
  const changed = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (before[key] === undefined) changed.push(`added ${key}`);
    else if (after[key] === undefined) changed.push(`removed ${key}`);
    else if (!before[key].equals(after[key])) changed.push(`changed ${key}`);
  }
  return changed;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

test("prepareDraftData swaps published to draft in a temp copy and leaves data/ untouched", () => {
  const before = snapshot(DATA_DIR);
  let copy;
  try {
    copy = prepareDraftData();
    assert.deepEqual(changedPaths(before, snapshot(DATA_DIR)), []);

    const commands = readJson(path.join(copy, "commands.json"));
    assert.deepEqual(commands.published, commands.draft);

    const consultant = readJson(path.join(copy, "consultant.json"));
    assert.deepEqual(consultant.published, consultant.draft);

    const catalog = readFolderEnvelope(path.join(copy, "catalog"));
    assert.deepEqual(catalog.published, catalog.draft);
  } finally {
    if (copy) removeDraftData(copy);
  }

  assert.equal(existsSync(copy), false);
  assert.deepEqual(changedPaths(before, snapshot(DATA_DIR)), []);
});
