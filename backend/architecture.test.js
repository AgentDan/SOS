import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");
const CLIENT = path.join(ROOT, "client");
const ADMIN = path.join(ROOT, "admin");

const API = path.join(BACKEND, "api");
const PIPELINE = path.join(BACKEND, "pipeline");
const AI = path.join(BACKEND, "ai");
const CONFIG = path.join(BACKEND, "config");

const BLOCK_NAMES = ["understanding", "profile", "scene", "needs", "sales", "director", "voice"];
const BLOCK_DIRS = BLOCK_NAMES.map((name) => path.join(BACKEND, name));
const CLIENT_PARTS = ["chat", "summary", "order", "scene"].map((name) => path.join(CLIENT, name));
const CLIENT_API = path.join(CLIENT, "api");
const CLIENT_SESSION = path.join(CLIENT, "session");

function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, acc);
    else if (entry.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  return path.normalize(path.join(path.dirname(fromFile), spec));
}

function walkIfExists(dir) {
  try {
    return walkJs(dir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function record(found, file, spec) {
  found.push(`${file} imports ${spec}`);
}

function violations() {
  const found = [];
  const files = [...walkIfExists(BACKEND), ...walkIfExists(CLIENT), ...walkIfExists(ADMIN)];
  const apiAllowed = [
    API,
    PIPELINE,
    path.join(BACKEND, "orders"),
    path.join(BACKEND, "sessions"),
    path.join(BACKEND, "admin-api"),
    CONFIG
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (isInside(file, CLIENT) && !isInside(file, CLIENT_API) && /\bfetch\s*\(/.test(source)) {
      found.push(`${file} calls fetch(`);
    }

    for (const spec of importSpecifiers(source)) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved) continue;

      const callerBlock = BLOCK_DIRS.find((dir) => isInside(file, dir));
      const aiCaller =
        isInside(file, path.join(BACKEND, "understanding")) ||
        isInside(file, path.join(BACKEND, "voice")) ||
        isInside(file, AI);

      if (isInside(resolved, AI) && !aiCaller) {
        record(found, file, spec);
      }

      if (isInside(file, API) && !apiAllowed.some((dir) => isInside(resolved, dir))) {
        record(found, file, spec);
      }

      if (callerBlock && !isInside(resolved, callerBlock)) {
        const aiException =
          isInside(resolved, AI) &&
          (isInside(file, path.join(BACKEND, "understanding")) ||
            isInside(file, path.join(BACKEND, "voice")));
        if (!aiException) record(found, file, spec);
      }

      if (isInside(file, AI)) {
        const banned = [API, PIPELINE, CLIENT, ADMIN, ...BLOCK_DIRS];
        if (banned.some((dir) => isInside(resolved, dir))) record(found, file, spec);
      }

      if (isInside(file, PIPELINE) && isInside(resolved, API)) {
        record(found, file, spec);
      }

      if (isInside(file, CLIENT) && (isInside(resolved, BACKEND) || isInside(resolved, ADMIN))) {
        record(found, file, spec);
      }

      if (isInside(file, ADMIN) && (isInside(resolved, BACKEND) || isInside(resolved, CLIENT))) {
        record(found, file, spec);
      }

      const clientPart = CLIENT_PARTS.find((dir) => isInside(file, dir));
      if (clientPart) {
        const shared = isInside(resolved, CLIENT_API) || isInside(resolved, CLIENT_SESSION);
        if (!isInside(resolved, clientPart) && !shared) record(found, file, spec);
      }
    }
  }

  return found;
}

test("modules honor the dependency rules", () => {
  const found = violations();
  assert.deepEqual(found, [], found.join("\n"));
});
